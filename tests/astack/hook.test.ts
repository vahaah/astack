import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
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

function runHook(payload: unknown, raw?: string): HookRun {
	const started = performance.now();
	const result = spawnSync(LAUNCHER, ["hook", "claude-code", "PreToolUse"], {
		input: raw ?? JSON.stringify(payload),
		encoding: "utf8",
		env: { ...process.env, CLAUDE_PROJECT_DIR: project },
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
	mkdirSync(join(project, "src"));
	writeFileSync(join(project, "src/a.ts"), "export const a = 1;\n");
	writeFileSync(join(project, "a.txt"), "hello\n");
	writeFileSync(join(project, "f.ts"), "export const f = 1;");
	writeFileSync(
		join(project, "src/notes.ts"),
		"// existing note\nexport const n = 1;\nexport const m = 2;\n",
	);
});

afterAll(() => rmSync(project, { recursive: true, force: true }));

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
	test("a narration comment is denied with the quote, the keep list and the skill", () => {
		const run = runHook(
			tool("Write", {
				file_path: join(project, "src/cache.ts"),
				content: "// now uses the new cache\nexport const c = 1;\n",
			}),
		);
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain(
			"src/cache.ts:1 narrates a change or an earlier version: // now uses the new cache",
		);
		expect(reason(run)).toContain("a license or SPDX header");
		expect(reason(run)).toContain("/astack:no-comments");
		expect(reason(run)).toContain(".astack/profile.json");
	});

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

	test("a commit whose staged diff adds a provenance tag is denied", () => {
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

	test("files added in the same command are checked", () => {
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

	test("a merge with no grant is denied through the bundle", () => {
		const run = runHook(tool("Bash", { command: "gh pr merge 12 --squash" }));
		expect(decision(run)).toBe("deny");
		expect(reason(run)).toContain("Nobody gave a merge grant");
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
