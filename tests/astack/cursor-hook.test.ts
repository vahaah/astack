import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	type CursorHookDeps,
	type CursorStore,
	EDIT_FOLLOWUP,
	fileStore,
	followUp,
	NOTES_HEADING,
	runCursorHook,
} from "../../src/astack/hook/cursor.ts";
import {
	CURSOR_EVENTS,
	type CursorEvent,
	canonicalEvent,
	decodeCursor,
	parseCursorEvent,
	textBefore,
} from "../../src/astack/hook/decode/cursor.ts";
import { encodeCursor } from "../../src/astack/hook/encode/cursor.ts";
import {
	ALLOW,
	continueWith,
	defineHandler,
	deny,
	type Handler,
	type HookEvent,
	note,
} from "../../src/astack/hook/events.ts";
import { HANDLERS } from "../../src/astack/hook/handlers/index.ts";

const ROOT = resolve(import.meta.dir, "../..");
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-cursor-")));
	dirs.push(dir);
	return dir;
}

function deps(
	handlers: readonly Handler[],
	store: CursorStore = fileStore(scratch()),
	cwd = "/tmp",
): CursorHookDeps {
	return {
		cwd,
		today: "2026-10-16",
		readText: (path) => {
			try {
				return readFileSync(path, "utf8");
			} catch {
				return undefined;
			}
		},
		handlers,
		store,
	};
}

function seen(events: HookEvent[]): Handler {
	return defineHandler({
		id: "seen",
		on: ["write", "edit", "shell", "mcp", "prompt", "reply", "session-start"],
		run: (event) => {
			events.push(event);
			return ALLOW;
		},
	});
}

const denyBad = defineHandler({
	id: "deny-bad",
	on: ["write", "shell"],
	run: (event) =>
		(event.kind === "shell" ? event.command : event.after).includes("BAD")
			? deny("astack blocked BAD")
			: ALLOW,
});

const noteHint = defineHandler({
	id: "note-hint",
	on: ["shell"],
	run: (event) =>
		event.command.includes("HINT") ? note("astack advice HINT") : ALLOW,
});

function run(
	event: CursorEvent,
	payload: unknown,
	hookDeps: CursorHookDeps,
): { stdout: unknown; exit: number } {
	const output = runCursorHook(event, JSON.stringify(payload), {}, hookDeps);
	return {
		stdout: output.stdout === "" ? "" : JSON.parse(output.stdout),
		exit: output.exit,
	};
}

describe("Cursor events", () => {
	test("each event has a canonical name and parses back", () => {
		for (const event of CURSOR_EVENTS) {
			expect(parseCursorEvent(event)).toBe(event);
			expect(canonicalEvent(event)).toBeString();
		}
		expect(parseCursorEvent("PreToolUse")).toBeUndefined();
	});
});

describe("the Cursor encoder", () => {
	test("permission events always print JSON", () => {
		expect(encodeCursor("beforeShellExecution", ALLOW).stdout).toBe(
			'{"permission":"allow"}\n',
		);
		expect(JSON.parse(encodeCursor("preToolUse", note("look")).stdout)).toEqual(
			{
				permission: "allow",
				agent_message: "look",
			},
		);
		expect(
			JSON.parse(encodeCursor("beforeMCPExecution", deny("no\nmore")).stdout),
		).toEqual({
			permission: "deny",
			user_message: "no",
			agent_message: "no\nmore",
		});
	});

	test("skill names in messages use the flat Cursor names", () => {
		expect(
			JSON.parse(
				encodeCursor(
					"beforeShellExecution",
					deny(
						"The `astack:types` skill and /astack:no-comments help. Run astack skill-path astack:mode first.",
					),
				).stdout,
			).agent_message,
		).toBe(
			"The `astack-types` skill and /astack-no-comments help. Run astack skill-path astack:mode first.",
		);
	});

	test("stop sends a follow-up, sessionStart adds context, and after-events print nothing", () => {
		expect(
			JSON.parse(encodeCursor("stop", continueWith("again")).stdout),
		).toEqual({
			followup_message: "again",
		});
		expect(JSON.parse(encodeCursor("stop", note("n")).stdout)).toEqual({});
		expect(
			JSON.parse(encodeCursor("sessionStart", note("plan")).stdout),
		).toEqual({
			additional_context: "plan",
		});
		expect(
			JSON.parse(encodeCursor("sessionStart", ALLOW, false).stdout),
		).toEqual({ env: { ASTACK_ATTENDED: "0" } });
		expect(encodeCursor("afterFileEdit", deny("x")).stdout).toBe("");
		expect(encodeCursor("afterAgentResponse", ALLOW).stdout).toBe("");
		expect(
			JSON.parse(encodeCursor("beforeSubmitPrompt", ALLOW).stdout),
		).toEqual({
			continue: true,
		});
	});
});

describe("the Cursor decoder", () => {
	const decodeDeps = {
		env: {},
		cwd: "/w",
		readText: () => "old\n",
		reply: "the reply",
	};

	test("a shell command keeps its cwd, and MCP calls get a server name", () => {
		expect(
			decodeCursor(
				"beforeShellExecution",
				{ command: "git status", cwd: "/repo" },
				decodeDeps,
			)?.events,
		).toEqual([{ kind: "shell", command: "git status", cwd: "/repo" }]);
		expect(
			decodeCursor(
				"beforeMCPExecution",
				{
					tool_name: "save_issue",
					tool_input: '{"title":"t"}',
					url: "https://mcp.linear.app/sse",
				},
				decodeDeps,
			)?.events,
		).toEqual([
			{
				kind: "mcp",
				server: "mcp.linear.app",
				tool: "save_issue",
				input: { title: "t" },
			},
		]);
		expect(
			decodeCursor(
				"beforeMCPExecution",
				{ tool_name: "mcp__linear__save_issue", tool_input: {} },
				decodeDeps,
			)?.events,
		).toEqual([
			{ kind: "mcp", server: "linear", tool: "save_issue", input: {} },
		]);
		for (const where of [
			{ url: "https://connectors.example.com/mcp/abc" },
			{ command: "npx -y some-proxy" },
		])
			expect(
				decodeCursor(
					"beforeMCPExecution",
					{
						tool_name: "save_issue",
						tool_input: {},
						mcp_server_name: "linear",
						...where,
					},
					decodeDeps,
				)?.events,
			).toEqual([
				{ kind: "mcp", server: "linear", tool: "save_issue", input: {} },
			]);
	});

	test("a Write tool call becomes a write event against the file on disk", () => {
		expect(
			decodeCursor(
				"preToolUse",
				{
					tool_name: "Write",
					tool_input: { file_path: "a.ts", content: "new\n" },
					workspace_roots: ["/w"],
				},
				decodeDeps,
			)?.events,
		).toEqual([
			{ kind: "write", path: "/w/a.ts", before: "old\n", after: "new\n" },
		]);
	});

	test("a stop reads the saved reply only when the turn completed", () => {
		expect(
			decodeCursor(
				"stop",
				{ status: "completed", conversation_id: "c" },
				decodeDeps,
			)?.events,
		).toEqual([
			{
				kind: "reply",
				text: "the reply",
				session: "c",
				interactive: true,
				subagent: false,
				fresh: false,
				chain: undefined,
				crons: [],
			},
		]);
		for (const [loop_count, fresh] of [
			[0, true],
			[1, false],
			["0", false],
		] as const) {
			const event = decodeCursor(
				"stop",
				{ status: "completed", conversation_id: "c", loop_count },
				decodeDeps,
			)?.events[0];
			expect(event?.kind === "reply" && event.fresh).toBe(fresh);
		}
		const generation = decodeCursor(
			"stop",
			{ status: "completed", conversation_id: "c", generation_id: "g1" },
			decodeDeps,
		)?.events[0];
		expect(generation?.kind === "reply" && generation.chain).toBe("g1");
		expect(
			decodeCursor("stop", { status: "aborted" }, decodeDeps)?.events,
		).toEqual([]);
		const background = decodeCursor(
			"stop",
			{ status: "completed", conversation_id: "c" },
			{ ...decodeDeps, env: { ASTACK_ATTENDED: "0" } },
		)?.events[0];
		expect(background?.kind === "reply" && background.interactive).toBe(false);
	});

	test("textBefore undoes the edits in reverse order and gives up when it cannot", () => {
		expect(
			textBefore("a NEW b NEWER c", [
				{ oldText: "old", newText: "NEW" },
				{ oldText: "older", newText: "NEWER" },
			]),
		).toBe("a old b older c");
		expect(
			textBefore("abc", [{ oldText: "x", newText: "zzz" }]),
		).toBeUndefined();
		expect(textBefore("abc", [{ oldText: "x", newText: "" }])).toBeUndefined();
	});
});

describe("the Cursor hook runner", () => {
	test("denies a shell command before it runs", () => {
		expect(
			run(
				"beforeShellExecution",
				{ command: "echo BAD", cwd: "/tmp" },
				deps([denyBad]),
			).stdout,
		).toEqual({
			permission: "deny",
			user_message: "astack blocked BAD",
			agent_message: "astack blocked BAD",
		});
		expect(
			run(
				"beforeShellExecution",
				{ command: "echo ok", cwd: "/tmp" },
				deps([denyBad]),
			).stdout,
		).toEqual({ permission: "allow" });
	});

	test("retains an unresolved edit problem across completed stops and sends nothing after an abort", () => {
		const dir = scratch();
		const file = join(dir, "a.ts");
		writeFileSync(file, "export const a = 1;\nBAD\n");
		const hookDeps = deps([denyBad]);
		const edit = {
			conversation_id: "conv-1",
			file_path: file,
			edits: [{ old_string: "", new_string: "BAD\n" }],
		};
		expect(run("afterFileEdit", edit, hookDeps)).toEqual({
			stdout: "",
			exit: 0,
		});
		const fixable = {
			...edit,
			edits: [{ old_string: "x", new_string: "BAD" }],
		};
		expect(run("afterFileEdit", fixable, hookDeps).stdout).toBe("");
		for (const status of ["aborted", "error"])
			expect(
				run(
					"stop",
					{ conversation_id: "conv-1", status, loop_count: 0 },
					hookDeps,
				).stdout,
			).toEqual({});
		const stop = { conversation_id: "conv-1", status: "completed" };
		expect(run("stop", stop, hookDeps).stdout).toEqual({
			followup_message: `${EDIT_FOLLOWUP}\n\nastack blocked BAD`,
		});
		expect(run("stop", stop, hookDeps).stdout).toEqual({
			followup_message: `${EDIT_FOLLOWUP}\n\nastack blocked BAD`,
		});
		writeFileSync(file, "export const a = 1;\n");
		expect(run("stop", stop, hookDeps).stdout).toEqual({});
	});

	test("advice from an allowed command rides on the next follow-up, and is dropped with no follow-up", () => {
		const dir = scratch();
		const file = join(dir, "a.ts");
		writeFileSync(file, "export const a = 1;\nBAD\n");
		const hookDeps = deps([denyBad, noteHint]);
		const shell = { conversation_id: "n1", command: "echo HINT", cwd: dir };
		expect(run("beforeShellExecution", shell, hookDeps).stdout).toEqual({
			permission: "allow",
			agent_message: "astack advice HINT",
		});
		run(
			"afterFileEdit",
			{
				conversation_id: "n1",
				file_path: file,
				edits: [{ old_string: "", new_string: "BAD\n" }],
			},
			hookDeps,
		);
		const stop = { conversation_id: "n1", status: "completed" };
		expect(run("stop", stop, hookDeps).stdout).toEqual({
			followup_message: `${EDIT_FOLLOWUP}\n\nastack blocked BAD\n\n${NOTES_HEADING}\n\nastack advice HINT`,
		});
		writeFileSync(file, "export const a = 1;\n");
		run("beforeShellExecution", shell, hookDeps);
		expect(run("stop", stop, hookDeps).stdout).toEqual({});
		writeFileSync(file, "export const a = 1;\nBAD\n");
		run(
			"afterFileEdit",
			{
				conversation_id: "n1",
				file_path: file,
				edits: [{ old_string: "", new_string: "BAD\n" }],
			},
			hookDeps,
		);
		expect(JSON.stringify(run("stop", stop, hookDeps).stdout)).not.toContain(
			"HINT",
		);
	});

	test("hands the last reply to the reply handlers at stop", () => {
		const events: HookEvent[] = [];
		const rewrite = defineHandler({
			id: "rewrite",
			on: ["reply"],
			run: (event) =>
				event.text === "draft" ? continueWith("Send it again.") : ALLOW,
		});
		const hookDeps = deps([seen(events), rewrite]);
		expect(
			run(
				"afterAgentResponse",
				{ conversation_id: "c2", text: "draft" },
				hookDeps,
			).stdout,
		).toBe("");
		expect(
			run("stop", { conversation_id: "c2", status: "completed" }, hookDeps)
				.stdout,
		).toEqual({ followup_message: "Send it again." });
		expect(events.map((event) => event.kind)).toEqual(["reply"]);
	});

	test("fails open on a payload it cannot read", () => {
		for (const event of CURSOR_EVENTS) {
			const output = runCursorHook(event, "not json", {}, deps([denyBad]));
			expect(output.exit).toBe(0);
			expect(output.stderr).toBe("");
		}
		expect(runCursorHook("preToolUse", "{", {}, deps([denyBad])).stdout).toBe(
			'{"permission":"allow"}\n',
		);
	});

	test("followUp joins edit problems and the reply rewrite", () => {
		expect(followUp(ALLOW, ALLOW)).toEqual(ALLOW);
		expect(followUp(continueWith("a"), deny("b"))).toEqual(
			continueWith("a\n\nb"),
		);
		expect(followUp(ALLOW, note("n"))).toEqual(note("n"));
	});

	test("the comment handler catches a ticket tag that an edit added", () => {
		const dir = scratch();
		const file = join(dir, "b.ts");
		writeFileSync(
			file,
			"// ABC-123: now uses the new API\nexport const b = 2;\n",
		);
		const store = fileStore(scratch());
		run(
			"afterFileEdit",
			{
				conversation_id: "c3",
				workspace_roots: [dir],
				file_path: file,
				edits: [
					{
						old_string: "export const b = 2;\n",
						new_string:
							"// ABC-123: now uses the new API\nexport const b = 2;\n",
					},
				],
			},
			deps(HANDLERS, store, dir),
		);
		const stop = run(
			"stop",
			{ conversation_id: "c3", status: "completed", workspace_roots: [dir] },
			deps(HANDLERS, store, dir),
		).stdout;
		expect(JSON.stringify(stop)).toContain("ABC-123");
	});
});

describe("astack hook cursor", () => {
	test("the CLI answers a Cursor permission event with JSON", () => {
		const result = spawnSync(
			"bun",
			[
				join(ROOT, "src/astack/cli/bin.ts"),
				"hook",
				"cursor",
				"beforeShellExecution",
			],
			{
				input: JSON.stringify({ command: "echo hi", cwd: "/tmp" }),
				encoding: "utf8",
				env: { ...process.env, ASTACK_STATE_DIR: scratch() },
			},
		);
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('{"permission":"allow"}\n');
	});
});

function liveCursor(
	options: { session?: string; state?: string; name?: string } = {},
) {
	const dir = scratch();
	const file = join(dir, options.name ?? "value.ts");
	const state = options.state ?? scratch();
	const session = options.session ?? "live-cursor";
	const call = (
		event: CursorEvent,
		fields: Readonly<Record<string, unknown>>,
		handlers: readonly Handler[] = HANDLERS,
	): unknown => {
		const output = runCursorHook(
			event,
			JSON.stringify({
				conversation_id: session,
				workspace_roots: [dir],
				...fields,
			}),
			{ ASTACK_STATE_DIR: state },
			deps(handlers, fileStore(state), dir),
		);
		return output.stdout === "" ? "" : JSON.parse(output.stdout);
	};
	return {
		dir,
		file,
		state,
		session,
		call,
		edit: (before: string, after: string) => {
			writeFileSync(file, after);
			return call("afterFileEdit", {
				file_path: file,
				edits: [{ old_string: before, new_string: after }],
			});
		},
		stop: () => call("stop", { status: "completed" }),
	};
}

const GOOD_TYPE = "export const value = 1;\n";
const BAD_TYPE = "export const value = 1 as number;\n";

describe("fresh Cursor file judgments", () => {
	test("a real type denial reaches the next completed stop", () => {
		const flow = liveCursor();
		flow.edit(GOOD_TYPE, BAD_TYPE);
		expect(flow.stop()).toEqual({
			followup_message: expect.stringContaining(
				"value.ts: unsafe cast, 1 now and 0 before.",
			),
		});
	});

	test("a corrected file sends no stale type follow-up", () => {
		const flow = liveCursor();
		flow.edit(GOOD_TYPE, BAD_TYPE);
		flow.edit(BAD_TYPE, GOOD_TYPE);
		expect(flow.stop()).toEqual({});
	});

	test("an external correction is read at stop without a second edit event", () => {
		const flow = liveCursor();
		flow.edit(GOOD_TYPE, BAD_TYPE);
		writeFileSync(flow.file, GOOD_TYPE);
		expect(flow.stop()).toEqual({});
	});

	test("the first baseline survives unrelated edits and completed stops until resolution", () => {
		const flow = liveCursor();
		const unrelated = `${BAD_TYPE}export const another = 2;\n`;
		flow.edit(GOOD_TYPE, BAD_TYPE);
		flow.edit(BAD_TYPE, unrelated);
		const denied = {
			followup_message: expect.stringContaining(
				"value.ts: unsafe cast, 1 now and 0 before.",
			),
		};
		expect(flow.stop()).toEqual(denied);
		expect(flow.stop()).toEqual(denied);
		flow.edit(unrelated, `${unrelated}export const third = 3;\n`);
		expect(flow.stop()).toEqual(denied);
		writeFileSync(flow.file, GOOD_TYPE);
		expect(flow.stop()).toEqual({});
	});

	test("deferred records stay within their session and canonical workspace", () => {
		const first = liveCursor();
		const second = liveCursor({ state: first.state });
		first.edit(GOOD_TYPE, BAD_TYPE);
		expect(second.stop()).toEqual({});
		second.edit(GOOD_TYPE, BAD_TYPE);
		const denied = {
			followup_message: expect.stringContaining(
				"value.ts: unsafe cast, 1 now and 0 before.",
			),
		};
		expect(first.stop()).toEqual(denied);
		expect(second.stop()).toEqual(denied);
		const otherSession = liveCursor({
			state: first.state,
			session: "other-session",
		});
		expect(
			otherSession.call("stop", {
				status: "completed",
				workspace_roots: [first.dir],
			}),
		).toEqual({});
		writeFileSync(first.file, GOOD_TYPE);
		expect(first.stop()).toEqual({});
		expect(second.stop()).toEqual(denied);
	});

	test("a deleted file resolves while an unreadable file reports a verification limit", () => {
		const missing = liveCursor();
		missing.edit(GOOD_TYPE, BAD_TYPE);
		rmSync(missing.file);
		expect(missing.stop()).toEqual({});
		const unreadable = liveCursor();
		unreadable.edit(GOOD_TYPE, BAD_TYPE);
		rmSync(unreadable.file);
		mkdirSync(unreadable.file);
		const limited = unreadable.stop();
		expect(limited).toEqual({
			followup_message: expect.stringContaining(
				"its current file is unreadable",
			),
		});
		expect(JSON.stringify(limited)).not.toContain(EDIT_FOLLOWUP);
		rmSync(unreadable.file, { recursive: true });
		writeFileSync(unreadable.file, GOOD_TYPE);
		expect(unreadable.stop()).toEqual({});
	});

	test("a missing or failing required handler retains an honest verification limit", () => {
		const flow = liveCursor({ name: "plan.md" });
		const before = "---\nplan: sample\ntier: standard\n---\n# A plan\n";
		const after = `${before}\n- [ ] Do the task.\n`;
		flow.edit(before, after);
		const withoutPlan = HANDLERS.filter(
			(handler) => handler.id !== "plan-file",
		);
		const missing = flow.call("stop", { status: "completed" }, withoutPlan);
		expect(missing).toEqual({
			followup_message: expect.stringContaining(
				"plan-file handler is unavailable",
			),
		});
		expect(JSON.stringify(missing)).not.toContain(EDIT_FOLLOWUP);
		const failing = defineHandler({
			id: "plan-file",
			on: ["write"],
			run: () => {
				throw new Error("Unavailable parser");
			},
		});
		const failed = flow.call("stop", { status: "completed" }, [
			...withoutPlan,
			failing,
		]);
		expect(failed).toEqual({
			followup_message: expect.stringContaining("plan-file handler failed"),
		});
		expect(JSON.stringify(failed)).not.toContain(EDIT_FOLLOWUP);
		expect(flow.stop()).toEqual({
			followup_message: expect.stringContaining("it adds a checkbox"),
		});
		writeFileSync(flow.file, before);
		expect(flow.stop()).toEqual({});
	});

	test("legacy strings survive edits and receive one explicitly unverified report", () => {
		const flow = liveCursor();
		const cache = join(flow.state, "cursor", flow.session);
		mkdirSync(cache, { recursive: true });
		writeFileSync(
			join(cache, "problems.json"),
			JSON.stringify(["Old plan warning"]),
		);
		flow.edit(GOOD_TYPE, "export const value = 2;\n");
		expect(
			flow.call("beforeShellExecution", {
				command: "echo ready",
				cwd: flow.dir,
			}),
		).toEqual({ permission: "allow" });
		expect(flow.call("stop", { status: "aborted" })).toEqual({});
		const report = flow.stop();
		expect(report).toEqual({
			followup_message: expect.stringContaining(
				"unverified reports from an older cache",
			),
		});
		expect(JSON.stringify(report)).toContain("Old plan warning");
		expect(JSON.stringify(report)).not.toContain(EDIT_FOLLOWUP);
		expect(flow.stop()).toEqual({});
	});

	test("refresh keeps the STE ledger unchanged and creates no reply claim", () => {
		const flow = liveCursor({ name: "note.md" });
		mkdirSync(join(flow.dir, ".astack"));
		writeFileSync(
			join(flow.dir, ".astack/profile.json"),
			JSON.stringify({ ste: { mode: "deny" } }),
		);
		flow.edit("Read the file.\n", "Ensure the file exists.\n");
		const ledger = join(flow.state, "ste", flow.session, "ledger.json");
		const initial = readFileSync(ledger, "utf8");
		const parsed: unknown = JSON.parse(initial);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
			throw new Error("The ledger must hold its first real denial.");
		expect(Object.values(parsed)).toEqual([1]);
		const denied = {
			followup_message: expect.stringContaining("note.md: 1 finding"),
		};
		expect(flow.stop()).toEqual(denied);
		expect(flow.stop()).toEqual(denied);
		flow.edit(
			"Ensure the file exists.\n",
			"Ensure the file exists.\nRead the next file.\n",
		);
		expect(flow.stop()).toEqual(denied);
		expect(readFileSync(ledger, "utf8")).toBe(initial);
		const names = readdirSync(join(flow.state, "ste", flow.session));
		expect(names.sort()).toEqual(["ledger.json"]);
		writeFileSync(flow.file, "Read the file.\n");
		expect(flow.stop()).toEqual({});
	});

	test("a removed workspace alias preserves the canonical file judgment", () => {
		const flow = liveCursor();
		const alias = join(scratch(), "project");
		symlinkSync(flow.dir, alias, "dir");
		writeFileSync(flow.file, BAD_TYPE);
		flow.call("afterFileEdit", {
			workspace_roots: [alias],
			file_path: join(alias, "value.ts"),
			edits: [{ old_string: GOOD_TYPE, new_string: BAD_TYPE }],
		});
		rmSync(alias);
		expect(flow.stop()).toEqual({
			followup_message: expect.stringContaining(
				"value.ts: unsafe cast, 1 now and 0 before.",
			),
		});
		writeFileSync(flow.file, GOOD_TYPE);
		expect(flow.stop()).toEqual({});
	});

	test("removing a leaf symlink keeps the target's original file judgment", () => {
		const flow = liveCursor();
		const alias = join(flow.dir, "alias.ts");
		writeFileSync(flow.file, BAD_TYPE);
		symlinkSync(flow.file, alias);
		flow.call("afterFileEdit", {
			file_path: alias,
			edits: [{ old_string: GOOD_TYPE, new_string: BAD_TYPE }],
		});
		rmSync(alias);
		expect(flow.stop()).toEqual({
			followup_message: expect.stringContaining(
				"value.ts: unsafe cast, 1 now and 0 before.",
			),
		});
		writeFileSync(flow.file, GOOD_TYPE);
		expect(flow.stop()).toEqual({});
	});
});
