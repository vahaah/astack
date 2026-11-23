import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const LAUNCHER = join(ROOT, "marketplace/plugins/astack/bin/astack");
const BUNDLE = join(ROOT, "marketplace/plugins/astack/bin/astack.js");
const FIXTURES = join(ROOT, "tests/fixtures/hook-input");

interface HookRun {
	status: number | null;
	stdout: string;
	stderr: string;
	output: { hookSpecificOutput?: Record<string, string> } | undefined;
	ms: number;
}

let project = "";
let stateRoot = "";

function runHook(
	payload: unknown,
	raw?: string,
	env: Record<string, string> = {},
): HookRun {
	const started = performance.now();
	const result = spawnSync(LAUNCHER, ["hook", "claude-code", "PreToolUse"], {
		input: raw ?? JSON.stringify(payload),
		encoding: "utf8",
		env: {
			...process.env,
			ASTACK_STATE_DIR: stateRoot,
			CLAUDE_PROJECT_DIR: project,
			...env,
		},
	});
	const ms = performance.now() - started;
	const stdout = result.stdout.trim();
	return {
		status: result.status,
		stdout,
		stderr: result.stderr,
		output: stdout ? JSON.parse(stdout) : undefined,
		ms,
	};
}

function captured(
	name: string,
	overrides: { file_path?: string; [key: string]: unknown },
): Record<string, unknown> {
	const payload = JSON.parse(
		readFileSync(join(FIXTURES, `${name}.json`), "utf8"),
	);
	delete payload.tool_response;
	delete payload.duration_ms;
	return {
		...payload,
		hook_event_name: "PreToolUse",
		cwd: project,
		tool_input: { ...payload.tool_input, ...overrides },
	};
}

function tool(
	tool_name: string,
	tool_input: Record<string, unknown>,
	cwd = project,
): Record<string, unknown> {
	return {
		hook_event_name: "PreToolUse",
		cwd,
		tool_name,
		tool_input,
		tool_use_id: "toolu_test",
	};
}

function decision(run: HookRun): string | undefined {
	if (run.status === 2) {
		expect(run.stdout).toBe("");
		return "deny";
	}
	expect(run.status).toBe(0);
	return undefined;
}

function reason(run: HookRun): string {
	return run.status === 2 ? run.stderr : "";
}

function context(run: HookRun): string {
	return run.output?.hookSpecificOutput?.additionalContext ?? "";
}

function git(cwd: string, ...args: string[]): void {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
}

beforeAll(() => {
	if (!existsSync(BUNDLE))
		throw new Error("run `bun run bundle` before the hook tests");
	project = mkdtempSync(join(tmpdir(), "astack-hook-"));
	stateRoot = mkdtempSync(join(tmpdir(), "astack-hook-state-"));
	mkdirSync(join(project, "src"));
	writeFileSync(join(project, "src/a.ts"), "export const a = 1;\n");
	writeFileSync(join(project, "a.txt"), "hello\n");
	writeFileSync(join(project, "f.ts"), "export const f = 1;");
	writeFileSync(
		join(project, "src/notes.ts"),
		"// existing note\nexport const n = 1;\nexport const m = 2;\n",
	);
});

afterAll(() => {
	rmSync(project, { recursive: true, force: true });
	rmSync(stateRoot, { recursive: true, force: true });
});

function eventLog(session: string): string {
	const path = join(stateRoot, "ste", session, "events.jsonl");
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function loggedFindings(session: string): readonly (readonly unknown[])[] {
	return eventLog(session)
		.split("\n")
		.filter((line) => line !== "")
		.map((line): Record<string, unknown> => JSON.parse(line))
		.map((line) => [
			line.handler,
			line.check,
			line.event,
			line.surface,
			line.rule,
			line.outcome,
		]);
}

function inSession(
	payload: Record<string, unknown>,
	session: string,
): Record<string, unknown> {
	return { ...payload, session_id: session };
}

describe("captured payload shapes", () => {
	test("Edit without comments prints nothing", () => {
		const run = runHook(
			captured("hook-input-Edit-1", { file_path: join(project, "src/a.ts") }),
		);
		expect(run.status).toBe(0);
		expect(run.stdout).toBe("");
	});

	test("Edit on a file without comment syntax prints nothing", () => {
		expect(
			runHook(
				captured("hook-input-Edit-0", { file_path: join(project, "a.txt") }),
			).stdout,
		).toBe("");
	});

	test("Write of a new file without comments prints nothing", () => {
		expect(
			runHook(
				captured("hook-input-Write-0", { file_path: join(project, "new.ts") }),
			).stdout,
		).toBe("");
	});

	test("Write that adds an unproven comment gets advice, not a decision", () => {
		const run = runHook(
			captured("hook-input-Write-1", { file_path: join(project, "f.ts") }),
		);
		expect(run.status).toBe(0);
		expect(decision(run)).toBeUndefined();
		expect(run.output?.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
		expect(context(run)).toContain("f.ts:1 // header");
		expect(context(run)).toContain("/astack:no-comments");
	});
});

describe("comment enforcement on Edit and Write", () => {
	test.each<[string, () => Record<string, string>]>([
		["the launcher runtime", () => ({})],
		[
			"node in ASTACK_RUNTIME",
			() => {
				const node = Bun.which("node");
				if (node === null) throw new Error("this test needs node on PATH");
				return { ASTACK_RUNTIME: node };
			},
		],
	])(
		"a narration comment is denied with the quote, the keep list and the skill on %s",
		(_name, env) => {
			const run = runHook(
				tool("Write", {
					file_path: join(project, "src/cache.ts"),
					content: "// now uses the new cache\nexport const c = 1;\n",
				}),
				undefined,
				env(),
			);
			expect(decision(run)).toBe("deny");
			expect(reason(run)).toContain(
				"src/cache.ts:1 narrates a change or an earlier version: // now uses the new cache",
			);
			expect(reason(run)).toContain("a license or SPDX header");
			expect(reason(run)).toContain("/astack:no-comments");
			expect(reason(run)).toContain(".astack/profile.json");
		},
	);

	test("a license header passes silently", () => {
		const run = runHook(
			tool("Write", {
				file_path: join(project, "src/lic.ts"),
				content: "// SPDX-License-Identifier: MIT\nexport const l = 1;\n",
			}),
		);
		expect(run.stdout).toBe("");
	});

	const blockLicense = readFileSync(
		join(ROOT, "tests/fixtures/comment-length/license.ts"),
		"utf8",
	);
	const lineLicense = blockLicense
		.split("\n")
		.flatMap((line) =>
			line === "/*" || line === " */"
				? []
				: [line.replace(/^ \*(?= |$)/, "//")],
		)
		.join("\n");
	const splitBlockLicense = blockLicense.replace(/\n \*\n/g, "\n */\n\n/*\n");
	const splitLineLicense = lineLicense.replace(/^\/\/$/gm, "");

	test.each([
		["a block comment", blockLicense, 1],
		["line comments", lineLicense, 1],
		["block comments split by blank lines", splitBlockLicense, 5],
		["line comments split by blank lines", splitLineLicense, 5],
	])(
		"an MIT license header of more than 12 lines in %s passes silently, because a legal header has no length limit",
		(_, content, paragraphs) => {
			expect(
				content.split("\n").filter((line) => /^(?:\/\/|\/\*| \*)/.test(line))
					.length,
			).toBeGreaterThan(12);
			expect(content.split("\n\n")).toHaveLength(paragraphs);
			const run = runHook(
				tool("Write", { file_path: join(project, "src/mit.ts"), content }),
			);
			expect(run.status).toBe(0);
			expect(run.stdout).toBe("");
		},
	);

	test("an MIT license header with a line that a keep pattern matches passes silently, because a keep pattern never adds a length limit to a legal header", () => {
		const content = blockLicense.replace(
			" * MIT License\n",
			" * MIT License\n * Source: https://github.com/acme/lib\n",
		);
		expect(content).toContain(" * Source: https://github.com/acme/lib\n");
		mkdirSync(join(project, ".astack"), { recursive: true });
		writeFileSync(
			join(project, ".astack/profile.json"),
			JSON.stringify({ commentKeep: ["^Source: \\S"] }),
		);
		const run = runHook(
			tool("Write", { file_path: join(project, "src/mit.ts"), content }),
		);
		rmSync(join(project, ".astack"), { recursive: true });
		expect(run.status).toBe(0);
		expect(run.stdout).toBe("");
	});

	const header = (name: string): string =>
		readFileSync(
			join(ROOT, "tests/fixtures/comment-length/headers", `${name}.txt`),
			"utf8",
		).trim();
	const mplExhibitA = `/* ${header("mpl-2.0").replace(/\n/g, "\n * ")} */`;

	test.each([
		["the MPL-2.0 Exhibit A header in one block comment", mplExhibitA],
		...["apache-2.0", "bsd-3-clause", "gpl-3.0", "lgpl-2.1", "isc"].map(
			(name) => [
				`the ${name} header in line comments split by blank lines`,
				header(name).replace(/^(?=.)/gm, "// "),
			],
		),
	])(
		"%s passes silently, because a legal header has no length limit",
		(_, comment) => {
			expect(comment.split("\n").length).toBeGreaterThan(2);
			const run = runHook(
				tool("Write", {
					file_path: join(project, "src/lic.ts"),
					content: `${comment}\nexport const l = 1;\n`,
				}),
			);
			expect(run.status).toBe(0);
			expect(run.stdout).toBe("");
		},
	);

	test.each([
		[
			"narration under a title that is no license name",
			"// Driver License\n// We now fetch the license from the API, then we cache it,\n// then we validate it, and after that we send it to the server.\n// This used to call the old endpoint before this change.\n",
			"src/p.ts:3 narrates a change or an earlier version",
		],
		[
			"a long comment with a link to a page that is no license",
			"// The grid needs a key from https://docs.vendor.com/license-keys, so we read it\n// from the env at boot, then we pass it to the provider, then we retry\n// once when the provider rejects it, and we log the result.\n",
			"src/p.ts:1 is a comment of 3 lines, over the 2-line limit",
		],
		[
			"a long comment with a warranty word that is no disclaimer",
			"// List the products without warranty first, then the rest,\n// then sort each group by price, then by name,\n// and finally drop the duplicates.\n",
			"src/p.ts:1 is a comment of 3 lines, over the 2-line limit",
		],
	])(
		"%s is denied, because a license word in prose is no license header",
		(_, comment, quote) => {
			const run = runHook(
				tool("Write", {
					file_path: join(project, "src/p.ts"),
					content: `${comment}export const p = 1;\n`,
				}),
			);
			expect(decision(run)).toBe("deny");
			expect(reason(run)).toContain(quote);
		},
	);

	test("an Edit that moves an existing comment passes", () => {
		const run = runHook(
			tool("Edit", {
				file_path: join(project, "src/notes.ts"),
				old_string: "export const m = 2;",
				new_string: "// existing note\nexport const m = 2;",
				replace_all: false,
			}),
		);
		expect(run.stdout).toBe("");
	});

	test("an Edit that adds a banner is denied", () => {
		const run = runHook(
			tool("Edit", {
				file_path: join(project, "src/notes.ts"),
				old_string: "export const m = 2;",
				new_string: "// ─── Writes ───\nexport const m = 2;",
				replace_all: false,
			}),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("is a section banner");
	});

	test("skipped paths and failed edits pass silently", () => {
		const content = "// now uses the new cache\nexport const c = 1;\n";
		expect(
			runHook(
				tool("Write", {
					file_path: join(project, "tests/fixtures/x.ts"),
					content,
				}),
			).stdout,
		).toBe("");
		expect(
			runHook(tool("Write", { file_path: join(project, "NOTES.md"), content }))
				.stdout,
		).toBe("");
		const missing = tool("Edit", {
			file_path: join(project, "src/a.ts"),
			old_string: "not in the file",
			new_string: content,
		});
		expect(runHook(missing).stdout).toBe("");
	});

	test("project keep patterns from .astack/profile.json allow a repo's own form", () => {
		const content =
			"// BOUNDARY-CAST: the SDK types this as unknown\nexport const k = sdk.value;\n";
		const payload = tool("Write", {
			file_path: join(project, "src/cast.ts"),
			content,
		});
		expect(context(runHook(payload))).toContain("BOUNDARY-CAST");
		mkdirSync(join(project, ".astack"), { recursive: true });
		writeFileSync(
			join(project, ".astack/profile.json"),
			JSON.stringify({ commentKeep: ["^// BOUNDARY-CAST:", "(bad"] }),
		);
		expect(runHook(payload).stdout).toBe("");
		rmSync(join(project, ".astack"), { recursive: true });
	});

	test("a long comment block is denied, and maxCommentLines in .astack/profile.json raises the limit", () => {
		const content =
			"// The importer reads rows in batches of 500.\n// Each batch commits on its own.\n// A failed batch is logged and skipped.\n// The next run picks it up again.\nexport const BATCH = 500;\n";
		const payload = tool("Write", {
			file_path: join(project, "src/importer.ts"),
			content,
		});
		const run = runHook(payload);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain(
			"src/importer.ts:1 is a comment of 4 lines, over the 2-line limit:",
		);
		expect(reason(run)).toContain(
			"never shorten an uncovered comment to pass.",
		);
		expect(reason(run)).toContain("is a confession");
		mkdirSync(join(project, ".astack"), { recursive: true });
		writeFileSync(
			join(project, ".astack/profile.json"),
			JSON.stringify({ maxCommentLines: 4 }),
		);
		const relaxed = runHook(payload);
		expect(decision(relaxed)).toBeUndefined();
		expect(context(relaxed)).toContain("need a reason to exist");
		rmSync(join(project, ".astack"), { recursive: true });
	});

	test("bad input fails open", () => {
		for (const raw of [
			"",
			"not json",
			"[]",
			'{"tool_name":"Write"}',
			'{"tool_name":"Edit","tool_input":{"file_path":7}}',
		]) {
			const run = runHook(undefined, raw);
			expect(run.status).toBe(0);
			expect(run.stdout).toBe("");
		}
	});

	test("other tools are ignored", () => {
		expect(
			runHook(tool("Read", { file_path: join(project, "src/a.ts") })).stdout,
		).toBe("");
	});

	test("a typical edit finishes quickly", () => {
		const runs = Array.from({ length: 5 }, () =>
			runHook(
				tool("Edit", {
					file_path: join(project, "src/notes.ts"),
					old_string: "export const m = 2;",
					new_string: "export const m = 3;",
				}),
			),
		);
		const fastest = Math.min(...runs.map((run) => run.ms));
		expect(fastest).toBeLessThan(500);
	});
});

describe("git commit", () => {
	let repo = "";
	beforeAll(() => {
		repo = mkdtempSync(join(tmpdir(), "astack-commit-"));
		git(repo, "init", "-q", "-b", "main");
		git(repo, "config", "user.email", "test@example.com");
		git(repo, "config", "user.name", "Test");
		writeFileSync(join(repo, "base.ts"), "export const base = 1;\n");
		git(repo, "add", ".");
		git(repo, "commit", "-q", "-m", "base");
	});
	afterAll(() => rmSync(repo, { recursive: true, force: true }));

	test("[control:sg-commit-staged] a commit whose staged diff adds a provenance tag is denied", () => {
		writeFileSync(
			join(repo, "base.ts"),
			"// Fixes ABC-123 from the review\nexport const base = 2;\n",
		);
		git(repo, "add", "base.ts");
		const run = runHook(
			tool("Bash", { command: 'git commit -m "change base"' }, repo),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("astack blocked this commit");
		expect(reason(run)).toContain("base.ts:1");
		git(repo, "reset", "-q", "--hard");
	});

	test("[control:sg-commit-added] files added in the same command are checked", () => {
		writeFileSync(
			join(repo, "fresh.ts"),
			"// const old = legacy();\nexport const fresh = 1;\n",
		);
		const run = runHook(
			tool(
				"Bash",
				{ command: "git add fresh.ts && git commit -m 'add fresh'" },
				repo,
			),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("fresh.ts:1 is commented-out code");
		rmSync(join(repo, "fresh.ts"));
	});

	test("commit -a sees tracked changes", () => {
		writeFileSync(
			join(repo, "base.ts"),
			"// ─── Base ───\nexport const base = 3;\n",
		);
		const run = runHook(
			tool("Bash", { command: `cd ${repo} && git commit -am "base"` }, project),
		);
		expect(decision(run)).toBe("deny");
		git(repo, "checkout", "-q", "--", "base.ts");
	});

	test("a gh pr create after a commit in the same command is still checked", () => {
		writeFileSync(join(repo, "add.ts"), "export const add = 1;\n");
		const run = runHook(
			tool(
				"Bash",
				{
					command:
						"git add add.ts && git commit -m 'Add add' && gh pr create --title t --body 'just a body'",
				},
				repo,
			),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("astack blocked gh pr create");
		rmSync(join(repo, "add.ts"));
	});

	test("a second commit in the same command is checked", () => {
		writeFileSync(join(repo, "a1.ts"), "export const a1 = 1;\n");
		writeFileSync(
			join(repo, "j.ts"),
			"// now uses the new cache\nexport const j = 1;\n",
		);
		const run = runHook(
			tool(
				"Bash",
				{
					command:
						"git add a1.ts && git commit -m a; git add j.ts && git commit -m b",
				},
				repo,
			),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("j.ts:1");
		expect(reason(run)).not.toContain("a1.ts");
		rmSync(join(repo, "a1.ts"));
		rmSync(join(repo, "j.ts"));
	});

	test("an interactive add skips only its own commit", () => {
		const run = runHook(
			tool(
				"Bash",
				{
					command:
						"git add -p && git commit -m a && gh pr create --title t --body 'just a body'",
				},
				repo,
			),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("astack blocked gh pr create");
	});

	test("a clean commit and non-commit git commands print nothing", () => {
		writeFileSync(join(repo, "base.ts"), "export const base = 4;\n");
		git(repo, "add", "base.ts");
		expect(
			runHook(tool("Bash", { command: "git commit -m clean" }, repo)).stdout,
		).toBe("");
		expect(
			runHook(tool("Bash", { command: "git status && git log -1" }, repo))
				.stdout,
		).toBe("");
		expect(runHook(tool("Bash", { command: "ls -la" }, repo)).stdout).toBe("");
		git(repo, "reset", "-q", "--hard");
	});
});

describe("the comment event log", () => {
	const NARRATION = "// now uses the new cache";
	const JUDGED = "// the value must stay small";

	function editWith(name: string, comment: string, session: string): HookRun {
		const file_path = join(project, `src/${name}`);
		writeFileSync(file_path, "export const e = 1;\n");
		return runHook(
			inSession(
				tool("Edit", {
					file_path,
					old_string: "export const e = 1;",
					new_string: `${comment}\nexport const e = 1;`,
				}),
				session,
			),
		);
	}

	test("[control:tel-comment] a comment deny and a comment note on an Edit and on a commit each write one comments line with no comment text", () => {
		expect(decision(editWith("tel-deny.ts", NARRATION, "tel-c-edit"))).toBe(
			"deny",
		);
		expect(decision(editWith("tel-note.ts", JUDGED, "tel-c-edit"))).toBe(
			undefined,
		);
		const repo = mkdtempSync(join(tmpdir(), "astack-tel-commit-"));
		git(repo, "init", "-q", "-b", "main");
		writeFileSync(
			join(repo, "a.ts"),
			`// ABC-123 from the review\nexport const a = 1;\n`,
		);
		git(repo, "add", "a.ts");
		const commit = () =>
			runHook(
				inSession(
					tool("Bash", { command: 'git commit -m "Add the value"' }, repo),
					"tel-c-commit",
				),
			);
		expect(decision(commit())).toBe("deny");
		writeFileSync(join(repo, "a.ts"), `${JUDGED}\nexport const a = 1;\n`);
		git(repo, "add", "a.ts");
		expect(decision(commit())).toBe(undefined);
		rmSync(repo, { recursive: true, force: true });
		expect([
			...loggedFindings("tel-c-edit"),
			...loggedFindings("tel-c-commit"),
		]).toEqual([
			["comments", "comments", "edit", "comment", "narration", "deny"],
			["comments", "comments", "edit", "comment", "judge", "advise"],
			["comments", "comments", "shell", "comment", "provenance", "deny"],
			["comments", "comments", "shell", "comment", "judge", "advise"],
		]);
		expect(`${eventLog("tel-c-edit")}${eventLog("tel-c-commit")}`).not.toMatch(
			/cache|small|ABC|review|a\.ts|tel-/,
		);
	});

	test("[control:tel-comment-masked] a comment note under a comment deny of the same run writes masked", () => {
		const run = runHook(
			inSession(
				tool("Write", {
					file_path: join(project, "src/tel-masked.ts"),
					content: `${NARRATION}\nexport const c = 1;\n\n${JUDGED}\nexport const d = 2;\n`,
				}),
				"tel-c-masked",
			),
		);
		expect(decision(run)).toBe("deny");
		expect(loggedFindings("tel-c-masked")).toEqual([
			["comments", "comments", "write", "comment", "narration", "deny"],
			["comments", "comments", "write", "comment", "judge", "masked"],
		]);
	});

	test("[control:tel-comment-safe] an event log that refuses a line keeps the comment deny", () => {
		mkdirSync(join(stateRoot, "ste", "tel-c-safe", "events.jsonl"), {
			recursive: true,
		});
		const run = editWith("tel-safe.ts", NARRATION, "tel-c-safe");
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("narrates a change or an earlier version");
	});
});

describe("files written by cat and tee", () => {
	test("a heredoc append that adds narration is denied", () => {
		writeFileSync(join(project, "src/base.ts"), "export const base = 1;\n");
		const command = `cat >> src/base.ts <<'EOF'\n// getUser now uses the new cache instead of rebuilding the object.\nexport function getUser() {}\nEOF`;
		const run = runHook(tool("Bash", { command }));
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("astack blocked this write");
		expect(reason(run)).toContain("src/base.ts:2");
	});

	test("tee with a here-string and a clean heredoc write are checked", () => {
		const run = runHook(
			tool("Bash", {
				command: "tee src/t.ts <<< '// ─── Reads ───'",
			}),
		);
		expect(decision(run)).toBe("deny");
		expect(
			runHook(
				tool("Bash", {
					command: "cat > src/c.ts <<'EOF'\nexport const c = 1;\nEOF",
				}),
			).stdout,
		).toBe("");
		expect(
			runHook(
				tool("Bash", {
					command: "cat > notes.md <<'EOF'\n// now uses x\nEOF",
				}),
			).stdout,
		).toBe("");
	});
});

describe("scratch files outside the project", () => {
	const PROBE =
		'// Usage: bun probe.ts <file>\n// Reads the file and prints the value.\n// Exits 1 when the parse fails.\nconst value: any = JSON.parse("1");\nexport { value };\n';
	let base = "";
	const temp = () => join(base, "tmp");

	beforeAll(() => {
		base = mkdtempSync(join(tmpdir(), "astack-scratch-"));
		mkdirSync(join(temp(), "clone/.git"), { recursive: true });
		mkdirSync(join(base, "notes"));
		mkdirSync(join(base, "repo/.git"), { recursive: true });
		mkdirSync(join(base, "opted/.astack"), { recursive: true });
		writeFileSync(join(base, "opted/.astack/profile.json"), "{}\n");
		writeFileSync(join(base, "repo/probe.ts"), "export {};\n");
		mkdirSync(join(base, "linked"));
		symlinkSync(join(project, "probe.ts"), join(base, "linked/probe.ts"));
		mkdirSync(join(base, "linked-repo"));
		symlinkSync(
			join(base, "repo/probe.ts"),
			join(base, "linked-repo/probe.ts"),
		);
	});
	afterAll(() => rmSync(base, { recursive: true, force: true }));

	const cases: readonly [string, "allow" | "deny", () => string][] = [
		["a git clone in the OS temp dir", "deny", () => join(temp(), "clone")],
		["a folder with no work tree above it", "allow", () => join(base, "notes")],
		["a sibling git work tree", "deny", () => join(base, "repo")],
		["a folder with an astack profile", "deny", () => join(base, "opted")],
		["the project", "deny", () => project],
		[
			"a link in a scratch folder to a new project file",
			"deny",
			() => join(base, "linked"),
		],
		[
			"a link in a scratch folder to a file of a work tree",
			"deny",
			() => join(base, "linked-repo"),
		],
	];

	test.each(cases)(
		"[control:sg-scratch-write] a probe with `any` and a long header in %s: %s",
		(_, expected, dir) => {
			const file = join(dir(), "probe.ts");
			for (const payload of [
				tool("Write", { file_path: file, content: PROBE }),
				tool("Bash", { command: `cat > ${file} <<'EOF'\n${PROBE}EOF` }),
			]) {
				const run = runHook(payload, undefined, { TMPDIR: temp() });
				if (expected === "allow") {
					expect(run.status).toBe(0);
					expect(run.stdout).toBe("");
				} else {
					expect(decision(run)).toBe("deny");
					expect(reason(run)).toContain("It adds code that hides type errors");
					expect(reason(run)).toContain(
						"probe.ts:1 is a comment of 3 lines, over the 2-line limit",
					);
				}
			}
		},
	);
});

describe("a repo that this session made", () => {
	test("[control:sg-session-repo-bundle] the bundle passes a broad discard in a repo that git init made in the session, and denies it for another session", () => {
		const base = mkdtempSync(join(tmpdir(), "astack-session-repo-"));
		const made = join(base, "made");
		const bash = (command: string, cwd: string, session: string) =>
			runHook(inSession(tool("Bash", { command }, cwd), session));
		const init = bash("git init made", base, "session-repo-hook");
		git(base, "init", "-q", "-b", "main", "made");
		git(made, "config", "user.email", "test@example.com");
		git(made, "config", "user.name", "Test");
		writeFileSync(join(made, "a.txt"), "a\n");
		git(made, "add", ".");
		git(made, "commit", "-q", "-m", "a");
		writeFileSync(join(made, "a.txt"), "b\n");
		const own = bash("git reset --hard", made, "session-repo-hook");
		const other = bash("git reset --hard", made, "another-session");
		rmSync(base, { recursive: true, force: true });
		expect([init.status, own.status]).toEqual([0, 0]);
		expect(decision(other)).toBe("deny");
		expect(reason(other)).toContain(
			"discards the uncommitted changes in a.txt",
		);
	});
});

describe("a write target that the hook cannot resolve", () => {
	test("does not hide the type check of another write in the command", () => {
		const file = join(project, "probe-unresolved.ts");
		const command = `printf 'export const b: any = 1;\\n' > ${file}; echo x > /dev/null/x`;
		const run = runHook(tool("Bash", { command }));
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("It adds code that hides type errors");
	});
});

describe("gh pr create and gh issue create", () => {
	const fullPr =
		"## Why\nA reason.\n\n## What changes\nA change.\n\n## Verification\nTests.\n\n## Risk and rollback\nRevert.";

	test("a PR body missing headings is denied with the skeleton", () => {
		const command = `gh pr create --title "Fix" --body "$(cat <<'EOF'\n## Why\nBecause.\nEOF\n)"`;
		const run = runHook(tool("Bash", { command }));
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain(
			"missing What changes, Verification, Risk and rollback",
		);
		expect(reason(run)).toContain("## Risk and rollback");
		expect(reason(run)).toContain("astack:write-docs");
	});

	test("a complete PR body, --fill and a dynamic body pass", () => {
		expect(
			runHook(
				tool("Bash", {
					command: `gh pr create --title Fix --body '${fullPr}'`,
				}),
			).stdout,
		).toBe("");
		expect(
			runHook(tool("Bash", { command: "gh pr create --fill" })).stdout,
		).toBe("");
		expect(
			runHook(
				tool("Bash", { command: 'gh pr create --title x --body "$BODY"' }),
			).stdout,
		).toBe("");
	});

	test("the repo PR template replaces the default headings", () => {
		const repo = mkdtempSync(join(tmpdir(), "astack-pr-"));
		git(repo, "init", "-q");
		mkdirSync(join(repo, ".github"));
		writeFileSync(
			join(repo, ".github/PULL_REQUEST_TEMPLATE.md"),
			"## Summary\n## Test plan\n",
		);
		writeFileSync(join(repo, "body.md"), "## Summary\nx\n");
		const run = runHook(
			tool("Bash", { command: "gh pr create -t x -F body.md" }, repo),
		);
		expect(reason(run)).toContain(
			"missing Test plan (required by .github/PULL_REQUEST_TEMPLATE.md)",
		);
		rmSync(repo, { recursive: true, force: true });
	});

	test("a closing word before a ticket key is denied through the bundle", () => {
		const run = runHook(
			tool("Bash", {
				command: `gh pr create --title Fix --body 'Fixes #3\n\n${fullPr}'`,
			}),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain('Body line 1 has "Fixes #3"');
	});

	test("a merge with no grant is denied through the bundle after it reads the base branch", () => {
		const bin = mkdtempSync(join(tmpdir(), "astack-gh-"));
		const head = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
		writeFileSync(
			join(bin, "view.json"),
			JSON.stringify({
				number: 12,
				url: "https://github.com/o/r/pull/12",
				title: "feat: export reports",
				body: "## Why\nx",
				baseRefName: "main",
				headRefOid: head,
			}),
		);
		writeFileSync(
			join(bin, "graph.json"),
			JSON.stringify({
				data: {
					repository: {
						object: null,
						pullRequest: {
							baseRef: { target: { oid: "9f3c1a2".padEnd(40, "0") } },
							reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
							commits: {
								nodes: [
									{
										commit: {
											oid: head,
											statusCheckRollup: { state: "SUCCESS" },
										},
									},
								],
							},
						},
					},
				},
			}),
		);
		writeFileSync(
			join(bin, "gh"),
			`#!/bin/sh\nif [ "$1" = pr ]; then cat "${bin}/view.json"; else cat "${bin}/graph.json"; fi\n`,
			{ mode: 0o755 },
		);
		try {
			const run = runHook(
				tool("Bash", { command: "gh pr merge 12 --squash" }),
				undefined,
				{
					PATH: `${bin}:${process.env.PATH}`,
					CLAUDE_CODE_ENTRYPOINT: "cli",
					CLAUDE_CODE_SESSION_ATTENDED: "1",
				},
			);
			expect(decision(run)).toBe("deny");
			expect(reason(run)).toBe(
				"astack blocked gh pr merge:\n- main at 9f3c1a2 has no .astack/profile.json, so it gives no standing grant. The owner did not say to merge in this turn. Ask the owner before you merge #12.\n",
			);
		} finally {
			rmSync(bin, { recursive: true, force: true });
		}
	});

	test("a PR for another repo only advises, without saying it blocked", () => {
		const run = runHook(
			tool("Bash", {
				command: "gh pr create --repo o/r --title t --body 'x'",
			}),
		);
		expect(decision(run)).toBeUndefined();
		expect(context(run)).toContain(
			"astack only advises because it targets --repo o/r",
		);
		expect(context(run)).not.toContain("astack blocked");
	});

	test("[control:repo-origin-issue] gh issue create with a --repo that names origin denies a heading gap, and another repo gets advice", () => {
		const repo = mkdtempSync(join(tmpdir(), "astack-hook-origin-"));
		try {
			git(repo, "init", "-q");
			git(
				repo,
				"remote",
				"add",
				"origin",
				"https://github.com/acme/widget.git",
			);
			const issue = (named: string) =>
				runHook(
					tool(
						"Bash",
						{
							command: `gh issue create --repo ${named} --title t --body 'No headings.'`,
						},
						repo,
					),
				);
			expect(decision(issue("Acme/Widget"))).toBe("deny");
			const other = issue("other/lib");
			expect(decision(other)).toBeUndefined();
			expect(context(other)).toContain(
				"astack only advises because it targets --repo other/lib",
			);
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("an issue labelled bug needs the bug headings, and an email adds a note", () => {
		const command =
			"gh issue create --title 'Import drops rows' --label bug --body-file - <<'EOF'\n## Summary\nReported by jane@customer.dev\nEOF";
		const run = runHook(tool("Bash", { command }));
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain(
			"missing Environment, Steps to reproduce, Expected, Actual, Acceptance criteria",
		);
		expect(reason(run)).toContain("j***@customer.dev");
	});
});

describe("a body file that the same command writes", () => {
	const PR =
		"## Why\nA reason.\n\n## What changes\nA change.\n\n## Verification\nTests.\n\n## Risk and rollback\nRevert.";
	const BUG =
		"## Summary\nx\n## Environment\nx\n## Steps to reproduce\nx\n## Expected\nx\n## Actual\nx\n## Acceptance criteria\nx";

	function inScratch(
		files: Readonly<Record<string, string>>,
		command: string,
	): HookRun {
		const dir = mkdtempSync(join(tmpdir(), "astack-staged-"));
		try {
			for (const [name, text] of Object.entries(files))
				writeFileSync(join(dir, name), `${text}\n`);
			return runHook(tool("Bash", { command }, dir));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}

	test.each([
		[
			"a cat heredoc before gh pr create",
			{ "body.md": PR },
			`cat > body.md <<'EOF'\n${PR.replace("A reason.", "It's a reason.")}\nEOF\ngh pr create --title "Add the cache" --body-file body.md`,
			"astack STE blocked this PR body",
		],
		[
			"printf before git commit -F",
			{ "msg.txt": "Add the cache" },
			`printf '%s\\n' 'We will utilize the cache.' > msg.txt && git commit -F msg.txt`,
			"astack STE blocked this commit message",
		],
		[
			"echo before gh pr create",
			{ "body.md": PR },
			`echo '## Why' > body.md && gh pr create --title "Add the cache" --body-file body.md`,
			"missing What changes, Verification, Risk and rollback",
		],
		[
			"tee before gh issue create",
			{ "issue.md": BUG },
			`printf '%s\\n' '## Summary' | tee issue.md > /dev/null && gh issue create --title "Import drops rows" --label bug --body-file issue.md`,
			"missing Environment, Steps to reproduce, Expected, Actual, Acceptance criteria",
		],
		[
			"an append before gh issue comment",
			{ "note.md": "The import is slow." },
			`cat >> note.md <<'EOF'\nIt's broken.\nEOF\ngh issue comment 3 --body-file note.md`,
			"astack STE blocked this issue comment",
		],
	])(
		"[control:hook-staged-body] %s denies the text that the command writes",
		(_name, files, command, reason) => {
			const run = inScratch(files, command);
			expect(decision(run)).toBe("deny");
			expect(run.stderr).toContain(reason);
		},
	);

	test("a clean staged body passes over a bad file on disk", () => {
		const run = inScratch(
			{ "body.md": "It's bad." },
			`cat > body.md <<'EOF'\n${PR}\nEOF\ngh pr create --title "Add the cache" --body-file body.md`,
		);
		expect([run.status, run.stderr]).toEqual([0, ""]);
	});
});

describe("Linear issues", () => {
	const linear = "mcp__claude_ai_Linear__save_issue";
	const feature =
		"## Problem\nx\n## Outcome\nx\n## Acceptance criteria\n- [ ] x\n## Scope\nIn: x. Out: y.\n## Verification\nA test.";

	test("creating an issue without the headings is denied", () => {
		const run = runHook(
			tool(linear, {
				team: "Core",
				title: "Operators can export reports",
				description: "Make export work.",
			}),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("this new feature issue");
		expect(reason(run)).toContain("## Acceptance criteria");
		expect(reason(run)).toContain(
			"If this is a bug, use: Summary, Environment",
		);
	});

	test("a bug label switches the template", () => {
		const run = runHook(
			tool(linear, {
				team: "Core",
				title: "Export fails",
				labels: ["Bug"],
				description: "Broken.",
			}),
		);
		expect(reason(run)).toContain("this new bug issue");
		expect(reason(run)).toContain("## Steps to reproduce");
	});

	test("a complete issue passes, and an update only advises", () => {
		expect(
			runHook(
				tool(linear, { team: "Core", title: "Export", description: feature }),
			).stdout,
		).toBe("");
		const update = runHook(
			tool(linear, { id: "ABC-1", description: "Only a note." }),
		);
		expect(decision(update)).toBeUndefined();
		expect(context(update)).toContain("issue update leaves out");
		expect(runHook(tool(linear, { id: "ABC-1", state: "Done" })).stdout).toBe(
			"",
		);
	});

	test("a template-only create passes, and email addresses add a note", () => {
		expect(
			runHook(tool(linear, { team: "Core", title: "x", template: "Feature" }))
				.stdout,
		).toBe("");
		expect(
			runHook(
				tool(linear, {
					team: "Core",
					title: "x",
					template: "Feature",
					description: "",
				}),
			).stdout,
		).toBe("");
		const run = runHook(
			tool(linear, {
				team: "Core",
				title: "Export",
				description: `${feature}\nContact: sam@client.io`,
			}),
		);
		expect(decision(run)).toBeUndefined();
		expect(context(run)).toContain("s***@client.io");
	});

	test("other Linear servers and create_issue are matched by name", () => {
		const run = runHook(
			tool("mcp__linear-server__create_issue", {
				title: "x",
				description: "y",
			}),
		);
		expect(decision(run)).toBe("deny");
		expect(
			runHook(tool("mcp__claude_ai_Linear__get_issue", { id: "ABC-1" })).stdout,
		).toBe("");
	});
});

describe("a legal or license header has no length limit", () => {
	const limit =
		/\bkept comment (?:takes at most|fits in|has at most) \d+ lines?\b/i;
	const exemption =
		"A legal or license header keeps its full text and has no length limit.";
	const markdown = (dir: string): string[] =>
		readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
			.filter((path) => path.endsWith(".md"))
			.map((path) => join(dir, path));
	const texts = [
		...markdown("rules"),
		...markdown("marketplace/plugins/astack"),
		...markdown("docs"),
		"AGENTS.md",
		"README.md",
	];
	const limitLines = texts.flatMap((path) =>
		readFileSync(join(ROOT, path), "utf8")
			.split("\n")
			.filter((line) => limit.test(line))
			.map((line) => ({ path, line })),
	);

	test("the scan finds the length limit of a kept comment in the coding rule and the coding-rules skill", () => {
		expect(limitLines.map(({ path }) => path)).toEqual(
			expect.arrayContaining([
				"rules/coding.md",
				"marketplace/plugins/astack/skills/coding-rules/SKILL.md",
			]),
		);
	});

	test("each text that sets a length limit on a kept comment exempts a legal or license header", () => {
		expect(
			limitLines
				.filter(({ line }) => !line.includes(exemption))
				.map(({ path }) => path),
		).toEqual([]);
	});
});
