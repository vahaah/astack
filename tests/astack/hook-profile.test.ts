import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateProjectConfig } from "../../scripts/lib/projects.ts";
import { renderAstackProfile } from "../../scripts/lib/render.ts";
import { fileStore, runCursorHook } from "../../src/astack/hook/cursor.ts";
import type { CursorEvent } from "../../src/astack/hook/decode/cursor.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import { SILENT } from "../../src/astack/hook/encode/base.ts";
import type { HookEventName } from "../../src/astack/hook/events.ts";
import { HANDLERS } from "../../src/astack/hook/handlers/index.ts";
import { readOptional } from "../../src/astack/paths.ts";
import { loadGrant } from "../../src/astack/pr/grant.ts";
import { profileProblems } from "../../src/astack/profile.ts";
import { currentTurn } from "../../src/astack/ste/state.ts";

const ROOT = resolve(import.meta.dir, "../..");
const GOOD_TYPE = "export const value = 1;\n";
const BAD_TYPE = "export const value = 1 as number;\n";
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-hook-profile-")));
	dirs.push(dir);
	return dir;
}

function fixture(hooks: unknown = undefined) {
	const dir = scratch();
	const state = scratch();
	const session = "profile-session";
	const env = { ASTACK_STATE_DIR: state, ASTACK_STE_TEST_INTERACTIVE: "1" };
	mkdirSync(join(dir, ".astack"));
	const setHooks = (value: unknown) =>
		writeFileSync(
			join(dir, ".astack/profile.json"),
			JSON.stringify({
				...(value === undefined ? {} : { hooks: value }),
				ste: { mode: "deny" },
			}),
		);
	setHooks(hooks);
	const deps = {
		cwd: dir,
		today: "2026-10-27",
		handlers: HANDLERS,
		readText: readOptional,
	};
	const native = (
		event: HookEventName,
		fields: Readonly<Record<string, unknown>>,
	) =>
		runHook(
			"claude-code",
			event,
			JSON.stringify({ cwd: dir, session_id: session, ...fields }),
			env,
			deps,
		);
	const cursor = (
		event: CursorEvent,
		fields: Readonly<Record<string, unknown>>,
	): unknown => {
		const output = runCursorHook(
			event,
			JSON.stringify({
				conversation_id: session,
				workspace_roots: [dir],
				...fields,
			}),
			env,
			{ ...deps, store: fileStore(state) },
		);
		return output.stdout === "" ? "" : JSON.parse(output.stdout);
	};
	return {
		dir,
		state,
		session,
		env,
		native,
		cursor,
		setHooks,
		propose: (name: string, before: string, after: string) => {
			const file = join(dir, name);
			writeFileSync(file, before);
			return native("PreToolUse", {
				tool_name: "Write",
				tool_input: { file_path: file, content: after },
			});
		},
		edit: (name: string, before: string, after: string) => {
			const file = join(dir, name);
			writeFileSync(file, after);
			return cursor("afterFileEdit", {
				file_path: file,
				edits: [{ old_string: before, new_string: after }],
			});
		},
	};
}

function syntheticProject(hooks: unknown) {
	const parsed: unknown = JSON.parse(
		readFileSync(join(ROOT, "examples/companion/projects/acme.json"), "utf8"),
	);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		throw new Error("The synthetic project must be a JSON object.");
	return validateProjectConfig({ ...parsed, hooks }, "acme");
}

test("minimal skips quality handlers while required plan and destructive guards remain active", () => {
	const flow = fixture({ profile: "minimal" });
	expect(
		flow.propose(
			"value.ts",
			GOOD_TYPE,
			`// ABC-123: now uses the new API\n${BAD_TYPE}`,
		),
	).toEqual(SILENT);
	expect(
		flow.propose("note.md", "Read the file.\n", "Ensure the file exists.\n"),
	).toEqual(SILENT);
	expect(
		flow.native("Stop", {
			last_assistant_message: "It's done.",
			stop_hook_active: false,
		}),
	).toEqual(SILENT);
	const plan = "---\nplan: sample\ntier: standard\n---\n# A plan\n";
	expect(
		flow.propose("plan.md", plan, `${plan}\n- [ ] Do the task.\n`),
	).toEqual({
		stdout: "",
		stderr: expect.stringContaining("it adds a checkbox"),
		exit: 2,
	});
	expect(
		flow.native("PreToolUse", {
			tool_name: "Bash",
			tool_input: { command: "supabase db reset" },
		}),
	).toEqual({
		stdout: "",
		stderr: expect.stringContaining("astack blocked a destructive command"),
		exit: 2,
	});
});

test("a synthetic companion hook override survives validation and rendering into the real runtime", () => {
	const hooks = { profile: "minimal", types: true };
	const project = syntheticProject(hooks);
	const rendered = renderAstackProfile(project);
	const parsed: unknown = JSON.parse(rendered.content);
	expect(parsed).toEqual(expect.objectContaining({ hooks }));
	expect(profileProblems(parsed)).toEqual([]);
	const flow = fixture();
	writeFileSync(join(flow.dir, ".astack/profile.json"), rendered.content);
	expect(flow.propose("value.ts", GOOD_TYPE, BAD_TYPE)).toEqual({
		stdout: "",
		stderr: expect.stringContaining("unsafe cast, 1 now and 0 before"),
		exit: 2,
	});
	expect(
		flow.propose("note.md", "Read the file.\n", "Ensure the file exists.\n"),
	).toEqual(SILENT);
});

test.each([
	[{ profile: "minimal", ste: "off" }, "hooks.ste must be true or false"],
	[
		{ profile: "minimal", comments: false, typo: false },
		"hooks.typo is not a known key",
	],
	[
		{ profile: "loose", types: false },
		'hooks.profile must be "strict" or "minimal"',
	],
	[null, "hooks must be an object"],
])(
	"invalid hooks %j report their field and retain strict runtime checks",
	(hooks, problem) => {
		expect(profileProblems({ hooks })).toEqual([problem]);
		expect(() => syntheticProject(hooks)).toThrow(problem);
		const flow = fixture(hooks);
		expect(flow.propose("value.ts", GOOD_TYPE, BAD_TYPE)).toEqual({
			stdout: "",
			stderr: expect.stringContaining("unsafe cast, 1 now and 0 before"),
			exit: 2,
		});
	},
);

test("disabled STE has no ledger or reply claims while turn state and cron grant checks remain active", () => {
	const flow = fixture({ profile: "minimal" });
	const sessionDir = join(flow.state, "ste", flow.session);
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(join(sessionDir, "pending"), "2\n");
	expect(
		flow.native("UserPromptSubmit", { prompt: "merge 12", source: "user" }),
	).toEqual(SILENT);
	expect(loadGrant(flow.env, flow.session)).toEqual({
		kind: "prs",
		numbers: [12],
	});
	expect(
		flow.native("UserPromptSubmit", { prompt: "continue", source: "user" }),
	).toEqual(SILENT);
	expect(loadGrant(flow.env, flow.session)).toEqual({ kind: "none" });
	expect(
		flow.native("Stop", {
			last_assistant_message: "It's done.",
			stop_hook_active: false,
			session_crons: [{ prompt: "merge 12" }],
		}),
	).toEqual(SILENT);
	expect(flow.native("UserPromptSubmit", { prompt: "merge 12" })).toEqual(
		SILENT,
	);
	expect(loadGrant(flow.env, flow.session)).toEqual({ kind: "none" });
	expect(currentTurn(sessionDir)).toBe(3);
	expect(readFileSync(join(sessionDir, "crons.json"), "utf8")).toBe(
		'["merge 12"]\n',
	);
	expect(
		flow.propose("note.md", "Read the file.\n", "Ensure the file exists.\n"),
	).toEqual(SILENT);
	expect(readdirSync(sessionDir).sort()).toEqual(["crons.json", "turn"]);
	flow.setHooks({ profile: "strict" });
	expect(
		flow.propose("note.md", "Read the file.\n", "Ensure the file exists.\n"),
	).toEqual({
		stdout: "",
		stderr: expect.stringContaining("note.md: 1 finding"),
		exit: 2,
	});
	const ledger: unknown = JSON.parse(
		readFileSync(join(sessionDir, "ledger.json"), "utf8"),
	);
	if (typeof ledger !== "object" || ledger === null || Array.isArray(ledger))
		throw new Error("The ledger must record its first real denial.");
	expect(Object.values(ledger)).toEqual([1]);
	const reply = flow.native("Stop", {
		last_assistant_message: "It's done.",
		stop_hook_active: false,
		prompt_id: "strict-reply",
	});
	expect({ exit: reply.exit, stderr: reply.stderr }).toEqual({
		exit: 0,
		stderr: "",
	});
	expect(JSON.parse(reply.stdout)).toEqual({
		decision: "block",
		reason: expect.stringContaining("ASD-STE100"),
	});
});

test("kept-comment STE follows its group and stays inside the comment module", () => {
	const contract =
		'/** Returns the token. It doesn\'t read the cache. */\nexport function token(): string { return ""; }\n';
	const strict = fixture();
	expect(strict.propose("api.ts", "", contract)).toEqual({
		stdout: "",
		stderr: expect.stringContaining("astack STE blocked the kept comments"),
		exit: 2,
	});
	const noSte = fixture({ ste: false });
	expect(noSte.propose("api.ts", "", contract)).toEqual(SILENT);
	expect(
		noSte.propose(
			"value.ts",
			GOOD_TYPE,
			`// ABC-123: now uses the new API\n${GOOD_TYPE}`,
		),
	).toEqual({
		stdout: "",
		stderr: expect.stringContaining(
			"carries a ticket, plan, PR, review or date tag",
		),
		exit: 2,
	});
	const noComments = fixture({ comments: false });
	expect(noComments.propose("api.ts", "", contract)).toEqual(SILENT);
});

test("comment suppression handoff recognizes only an enabled type handler", () => {
	const suppression = `// @ts-ignore\n${GOOD_TYPE}`;
	const comments = fixture({ types: false });
	expect(comments.propose("value.ts", GOOD_TYPE, suppression)).toEqual({
		stdout: "",
		stderr: expect.stringContaining("suppresses a correctness or safety check"),
		exit: 2,
	});
	const types = fixture({ profile: "minimal", types: true });
	expect(types.propose("value.ts", GOOD_TYPE, suppression)).toEqual({
		stdout: "",
		stderr: expect.stringContaining("@ts-ignore"),
		exit: 2,
	});
	const neither = fixture({ profile: "minimal" });
	expect(neither.propose("value.ts", GOOD_TYPE, suppression)).toEqual(SILENT);
});

test("Cursor retains disabled baselines, required records, and unclassified legacy reports", () => {
	const flow = fixture();
	const plan = "---\nplan: sample\ntier: standard\n---\n# A plan\n";
	flow.edit("value.ts", GOOD_TYPE, BAD_TYPE);
	flow.edit("plan.md", plan, `${plan}\n- [ ] Do the task.\n`);
	const strict = flow.cursor("stop", { status: "completed" });
	expect(strict).toEqual({
		followup_message: expect.stringContaining(
			"unsafe cast, 1 now and 0 before",
		),
	});
	expect(JSON.stringify(strict)).toContain("it adds a checkbox");
	flow.setHooks({ profile: "minimal" });
	const minimal = flow.cursor("stop", { status: "completed" });
	expect(minimal).toEqual({
		followup_message: expect.stringContaining("it adds a checkbox"),
	});
	expect(JSON.stringify(minimal)).not.toContain("unsafe cast");
	const legacy = join(flow.state, "cursor", flow.session, "problems.json");
	writeFileSync(legacy, JSON.stringify(["legacy unsafe cast report"]));
	const report = flow.cursor("stop", { status: "completed" });
	expect(report).toEqual({
		followup_message: expect.stringContaining(
			"unverified reports from an older cache",
		),
	});
	expect(JSON.stringify(report)).toContain("legacy unsafe cast report");
	expect(JSON.stringify(report)).toContain("it adds a checkbox");
	expect(
		JSON.stringify(flow.cursor("stop", { status: "completed" })),
	).not.toContain("legacy");
	rmSync(join(flow.dir, "value.ts"));
	mkdirSync(join(flow.dir, "value.ts"));
	const dormant = flow.cursor("stop", { status: "completed" });
	expect(dormant).toEqual({
		followup_message: expect.stringContaining("it adds a checkbox"),
	});
	expect(JSON.stringify(dormant)).not.toContain("unreadable");
	flow.setHooks({ profile: "strict" });
	const unreadable = flow.cursor("stop", { status: "completed" });
	expect(unreadable).toEqual({
		followup_message: expect.stringContaining("its current file is unreadable"),
	});
	flow.setHooks({ profile: "minimal" });
	rmSync(join(flow.dir, "value.ts"), { recursive: true });
	flow.edit("value.ts", BAD_TYPE, `${BAD_TYPE}export const another = 2;\n`);
	flow.setHooks({ profile: "strict" });
	const resumed = flow.cursor("stop", { status: "completed" });
	expect(resumed).toEqual({
		followup_message: expect.stringContaining(
			"unsafe cast, 1 now and 0 before",
		),
	});
	expect(JSON.stringify(resumed)).toContain("it adds a checkbox");
	writeFileSync(join(flow.dir, "value.ts"), GOOD_TYPE);
	writeFileSync(join(flow.dir, "plan.md"), plan);
	expect(flow.cursor("stop", { status: "completed" })).toEqual({});
});

test("minimal hook settings leave the actual CLI quality checks active", () => {
	const flow = fixture({ profile: "minimal" });
	const env = {
		PATH: process.env.PATH ?? "",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
	};
	for (const args of [
		["init", "-q", "-b", "main"],
		["add", "."],
		[
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"-c",
			"commit.gpgsign=false",
			"-c",
			"core.hooksPath=/dev/null",
			"commit",
			"-qm",
			"test fixture",
		],
	]) {
		if (args[0] === "add") writeFileSync(join(flow.dir, "value.ts"), GOOD_TYPE);
		const run = spawnSync("git", args, {
			cwd: flow.dir,
			encoding: "utf8",
			env,
		});
		expect({ exit: run.status, stderr: run.stderr }).toEqual({
			exit: 0,
			stderr: "",
		});
	}
	writeFileSync(
		join(flow.dir, "value.ts"),
		`// ABC-123: now uses the new API\n${BAD_TYPE}`,
	);
	const cli = (args: string[], input?: string) =>
		spawnSync(
			process.execPath,
			[join(ROOT, "src/astack/cli/bin.ts"), ...args],
			{ cwd: flow.dir, encoding: "utf8", input, env },
		);
	const types = cli(["check-types"]);
	expect({ exit: types.status, stderr: types.stderr }).toEqual({
		exit: 1,
		stderr: "",
	});
	expect(types.stdout).toContain("unsafe cast, 1 now and 0 before");
	const comments = cli(["check-comments"]);
	expect({ exit: comments.status, stderr: comments.stderr }).toEqual({
		exit: 1,
		stderr: "",
	});
	expect(comments.stdout).toContain("provenance tag");
	const ste = cli(["check-ste", "-"], "Ensure the file exists.\n");
	expect({ exit: ste.status, stderr: ste.stderr }).toEqual({
		exit: 1,
		stderr: "",
	});
	expect(ste.stdout).toContain('word-list: Use "make sure", not "Ensure"');
});

test("partial comment checks retain the STE baseline across stops and later edits", () => {
	const flow = fixture();
	const contract =
		'/** Returns the token. It doesn\'t read the cache. */\nexport function token(): string { return ""; }\n';
	flow.edit("api.ts", "", contract);
	expect(flow.cursor("stop", { status: "completed" })).toEqual({
		followup_message: expect.stringContaining("kept comments"),
	});
	flow.setHooks({ ste: false });
	expect(flow.cursor("stop", { status: "completed" })).toEqual({});
	flow.edit("api.ts", contract, `${contract}export const another = 2;\n`);
	flow.setHooks({ ste: true });
	expect(flow.cursor("stop", { status: "completed" })).toEqual({
		followup_message: expect.stringContaining("kept comments"),
	});
	writeFileSync(join(flow.dir, "api.ts"), GOOD_TYPE);
	expect(flow.cursor("stop", { status: "completed" })).toEqual({});
});

test.each([false, true])(
	"type handoff keeps a deferred suppression baseline after an extra edit: %s",
	(extraEdit) => {
		const flow = fixture({ types: false });
		const suppression = `// @ts-ignore\n${GOOD_TYPE}`;
		flow.edit("value.ts", GOOD_TYPE, suppression);
		expect(flow.cursor("stop", { status: "completed" })).toEqual({
			followup_message: expect.stringContaining(
				"suppresses a correctness or safety check",
			),
		});
		flow.setHooks({ profile: "strict" });
		if (extraEdit)
			flow.edit(
				"value.ts",
				suppression,
				`${suppression}export const another = 2;\n`,
			);
		const denied = { followup_message: expect.stringContaining("@ts-ignore") };
		expect(flow.cursor("stop", { status: "completed" })).toEqual(denied);
		flow.setHooks({ comments: false });
		expect(flow.cursor("stop", { status: "completed" })).toEqual(denied);
		writeFileSync(join(flow.dir, "value.ts"), GOOD_TYPE);
		expect(flow.cursor("stop", { status: "completed" })).toEqual({});
	},
);

test("type handoff respects the current explicit kernel permission", () => {
	const flow = fixture();
	const allow = [
		{
			paths: ["value.ts"],
			kinds: ["ts-ignore"],
			reason: "Synthetic kernel contract",
		},
	];
	const settings = (types: boolean) =>
		writeFileSync(
			join(flow.dir, ".astack/profile.json"),
			JSON.stringify({ hooks: { types }, types: { allow } }),
		);
	settings(false);
	flow.edit("value.ts", GOOD_TYPE, `// @ts-ignore\n${GOOD_TYPE}`);
	expect(flow.cursor("stop", { status: "completed" })).toEqual({
		followup_message: expect.stringContaining(
			"suppresses a correctness or safety check",
		),
	});
	settings(true);
	expect(flow.cursor("stop", { status: "completed" })).toEqual({});
});
