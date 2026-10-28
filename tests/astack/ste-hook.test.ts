import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	advanceTurn,
	answersRewrite,
	claimReply,
	clearPending,
	demoted,
	pruneSessions,
	readRewrite,
	recordDenies,
	recordPending,
	replyKey,
	saveRewrite,
	takePending,
} from "../../src/astack/ste/state.ts";

const ROOT = resolve(import.meta.dir, "../..");
const LAUNCHER = join(ROOT, "marketplace/plugins/astack/bin/astack");
const BUNDLE = join(ROOT, "marketplace/plugins/astack/bin/astack.js");

type Run = {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly context: string;
	readonly blocked: boolean;
	readonly reason: string;
};

let base = "";
let strict = "";
let loose = "";
let state = "";

function env(extra: Record<string, string> = {}): Record<string, string> {
	return {
		PATH: process.env.PATH ?? "",
		HOME: base,
		ASTACK_STATE_DIR: state,
		CLAUDE_CODE_ENTRYPOINT: "cli",
		CLAUDE_CODE_SESSION_ATTENDED: "1",
		CLAUDE_PROJECT_DIR: strict,
		...extra,
	};
}

function parse(stdout: string): string {
	if (stdout.trim() === "") return "";
	const parsed: unknown = JSON.parse(stdout);
	if (typeof parsed !== "object" || parsed === null) return "";
	const output = Reflect.get(parsed, "hookSpecificOutput");
	const context =
		typeof output === "object" && output !== null
			? Reflect.get(output, "additionalContext")
			: undefined;
	return typeof context === "string" ? context : "";
}

function hook(
	event: string,
	payload: Record<string, unknown>,
	extra: Record<string, string> = {},
): Run {
	const result = spawnSync(LAUNCHER, ["hook", "claude-code", event], {
		input: JSON.stringify(payload),
		encoding: "utf8",
		env: env(extra),
	});
	const block = stopBlock(result.stdout);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		context: parse(result.stdout),
		blocked: result.status === 2 || block !== undefined,
		reason: block ?? result.stderr,
	};
}

async function parallel(
	payload: Record<string, unknown>,
	copies = 6,
): Promise<number> {
	const runs = await Promise.all(
		Array.from({ length: copies }, async () => {
			const child = Bun.spawn([LAUNCHER, "hook", "claude-code", "Stop"], {
				stdin: new TextEncoder().encode(JSON.stringify(payload)),
				stdout: "pipe",
				stderr: "pipe",
				env: env(),
			});
			await child.exited;
			return stopBlock(await new Response(child.stdout).text());
		}),
	);
	return runs.filter((reason) => reason !== undefined).length;
}

function stopBlock(stdout: string): string | undefined {
	if (stdout.trim() === "") return undefined;
	const parsed: unknown = JSON.parse(stdout);
	if (typeof parsed !== "object" || parsed === null) return undefined;
	if (Reflect.get(parsed, "decision") !== "block") return undefined;
	const reason = Reflect.get(parsed, "reason");
	return typeof reason === "string" ? reason : "";
}

function tool(
	name: string,
	input: Record<string, unknown>,
	cwd = strict,
	session?: string,
): Record<string, unknown> {
	return {
		hook_event_name: "PreToolUse",
		cwd,
		tool_name: name,
		tool_input: input,
		tool_use_id: "toolu_ste",
		...(session ? { session_id: session } : {}),
	};
}

function stop(
	session: string,
	text: string,
	extra: Record<string, unknown> = {},
) {
	return {
		hook_event_name: "Stop",
		session_id: session,
		cwd: strict,
		stop_hook_active: false,
		last_assistant_message: text,
		...extra,
	};
}

function prompt(
	session: string,
	text: string,
	extra: Record<string, unknown> = {},
) {
	return {
		hook_event_name: "UserPromptSubmit",
		session_id: session,
		cwd: strict,
		prompt: text,
		...extra,
	};
}

const FEATURE =
	"## Problem\nx\n## Outcome\nx\n## Acceptance criteria\n- [ ] x\n## Scope\nIn: x. Out: y.\n## Verification\nA test.";

beforeAll(() => {
	if (!existsSync(BUNDLE))
		throw new Error("run `bun run bundle` before the STE hook tests");
	base = mkdtempSync(join(tmpdir(), "astack-ste-"));
	strict = join(base, "strict");
	loose = join(base, "loose");
	state = join(base, "state");
	for (const dir of [strict, loose]) {
		mkdirSync(join(dir, ".git"), { recursive: true });
		mkdirSync(join(dir, "docs"), { recursive: true });
		mkdirSync(join(dir, "src"), { recursive: true });
	}
	mkdirSync(join(strict, ".astack"));
	writeFileSync(
		join(strict, ".astack/profile.json"),
		JSON.stringify({ ste: { mode: "deny", technicalNouns: ["Ensure Plus"] } }),
	);
	writeFileSync(
		join(strict, "docs/old.md"),
		"# Notes\n\nThe service isn't fast; it's slow. We have used this cache for years — since the move. The team doesn't like the old API.\n",
	);
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("docs, plans and ADRs", () => {
	test("a repo with ste.mode deny blocks a new sentence that breaks a rule", () => {
		const run = hook(
			"PreToolUse",
			tool("Write", {
				file_path: join(strict, "docs/a.md"),
				content: "# A\n\nIt doesn't work.\n",
			}),
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain("astack STE blocked this write to docs/a.md");
		expect(run.stderr).toContain(
			'L3 contraction: Write "does not", not "doesn\'t".',
		);
		expect(run.stderr).toContain("astack check-ste -");
	});

	test("a repo with no ste mode only advises", () => {
		const run = hook(
			"PreToolUse",
			tool(
				"Write",
				{ file_path: join(loose, "docs/a.md"), content: "It doesn't work.\n" },
				loose,
			),
			{ CLAUDE_PROJECT_DIR: loose },
		);
		expect(run.status).toBe(0);
		expect(run.context).toContain(
			"astack STE advice for this write to docs/a.md",
		);
	});

	test("a file outside every repo only advises, also from a deny repo", () => {
		const outside = join(base, "outside");
		mkdirSync(outside, { recursive: true });
		const run = hook(
			"PreToolUse",
			tool("Write", {
				file_path: join(outside, "cv.md"),
				content: "It's a short note.\n",
			}),
		);
		expect(run.status).toBe(0);
		expect(run.context).toContain("astack STE advice for this write to cv.md");
	});

	test("a plan file gets its STE findings once, from the STE hook", () => {
		mkdirSync(join(loose, "docs/plans"), { recursive: true });
		const run = hook(
			"PreToolUse",
			tool(
				"Write",
				{
					file_path: join(loose, "docs/plans/demo.md"),
					content:
						"---\nplan: demo\ntier: standard\nstatus: draft\n---\n\n# Demo\n\nIt doesn't work.\n",
				},
				loose,
			),
			{ CLAUDE_PROJECT_DIR: loose },
		);
		expect(run.status).toBe(0);
		expect(run.context).toContain("astack check-plan finds");
		expect(run.context).toContain(
			"astack STE advice for this write to docs/plans/demo.md",
		);
		expect(run.context.match(/contraction/g)?.length).toBe(1);
	});

	test("an Edit that keeps 3 old non-STE sentences as context passes", () => {
		const old = "The team doesn't like the old API.";
		const run = hook(
			"PreToolUse",
			tool("Edit", {
				file_path: join(strict, "docs/old.md"),
				old_string: old,
				new_string: `${old} The new cache is faster.`,
			}),
		);
		expect(run.status).toBe(0);
		expect(run.stdout).toBe("");
	});

	test("an Edit that adds a failing sentence beside old ones denies only the new one", () => {
		const old = "The team doesn't like the old API.";
		const run = hook(
			"PreToolUse",
			tool("Edit", {
				file_path: join(strict, "docs/old.md"),
				old_string: old,
				new_string: `${old} The new cache isn't warm.`,
			}),
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain("1 finding from the ASD-STE100 deny rules");
		expect(run.stderr).toContain(
			'L3 contraction: Write "is not", not "isn\'t". Sentence: "The new cache isn\'t warm."',
		);
	});

	test("excluded files, code files and technical names pass", () => {
		for (const path of ["LICENSE.md", "content/post.md", "public/a.md"]) {
			const run = hook(
				"PreToolUse",
				tool("Write", {
					file_path: join(strict, path),
					content: "It doesn't work; it's off.\n",
				}),
			);
			expect(run.stdout).toBe("");
			expect(run.status).toBe(0);
		}
		const names = hook(
			"PreToolUse",
			tool("Write", {
				file_path: join(strict, "docs/plan.md"),
				content: "Ensure Plus is the plan name.\n",
			}),
		);
		expect(names.status).toBe(0);
	});

	test("a write to a file that headerFields covers lets a header field line take a long dash", () => {
		const repo = join(base, "fields");
		mkdirSync(join(repo, ".git"), { recursive: true });
		mkdirSync(join(repo, ".astack"));
		mkdirSync(join(repo, "docs/adr"), { recursive: true });
		writeFileSync(
			join(repo, ".astack/profile.json"),
			JSON.stringify({
				ste: {
					mode: "deny",
					technicalNouns: [],
					headerFields: ["docs/adr/*.md"],
				},
			}),
		);
		const content =
			"# 0002 — A record\n\n- **Amends:** 0001 — its D1, for one path.\n";
		const write = (path: string) =>
			hook(
				"PreToolUse",
				tool("Write", { file_path: join(repo, path), content }, repo),
			).status;
		expect({
			record: write("docs/adr/0002-a.md"),
			note: write("docs/a.md"),
		}).toEqual({ record: 0, note: 2 });
	});

	test("a cat heredoc that writes a Markdown file is checked", () => {
		const run = hook(
			"PreToolUse",
			tool("Bash", { command: "cat > docs/b.md <<'EOF'\nIt's done.\nEOF" }),
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain("this write to docs/b.md");
	});

	test.each([
		[
			`echo "It's done; we're happy, e.g. today." > docs/echo.md`,
			"docs/echo.md",
		],
		[`printf "It's done; we're happy.\\n" > docs/p.md`, "docs/p.md"],
		[`echo "It's done." | tee docs/t.md`, "docs/t.md"],
		[`printf '%s\\n' "It's done." >> docs/a.md`, "docs/a.md"],
	])("a shell write %s is checked", (command, path) => {
		const run = hook("PreToolUse", tool("Bash", { command }));
		expect(run.status).toBe(2);
		expect(run.stderr).toContain(`this write to ${path}`);
	});

	test("a write from a variable or a command fails open", () => {
		for (const command of [
			'echo "$TEXT" > docs/v.md',
			'echo "It\'s $(date)" > docs/d.md',
			"git log | tee docs/log.md",
		]) {
			const run = hook("PreToolUse", tool("Bash", { command }));
			expect(run.status).toBe(0);
		}
	});
});

describe("PR bodies, tickets and commit messages deny everywhere", () => {
	test.each([
		[`gh pr comment 12 --body "It's fixed."`, "this PR comment"],
		[
			`gh pr review 12 --approve --body "Looks good; ship it."`,
			"this PR review",
		],
		[`gh pr edit 12 --body "It's ready."`, "this PR body"],
		[`gh issue comment 12 -b "It's fixed."`, "this issue comment"],
		[`gh issue create --title "Add export" --body "It's slow."`, "this issue"],
	])("%s", (command, subject) => {
		const run = hook("PreToolUse", tool("Bash", { command }, loose), {
			CLAUDE_PROJECT_DIR: loose,
		});
		expect(run.status).toBe(2);
		expect(run.stderr).toContain(`astack STE blocked ${subject}:`);
	});

	test("a gh pr create body and its title are checked", () => {
		const body =
			"## Why\nA reason.\n\n## What changes\nIt's a change.\n\n## Verification\nTests.\n\n## Risk and rollback\nRevert.";
		const run = hook(
			"PreToolUse",
			tool("Bash", {
				command: `gh pr create --title "Add the cache" --body-file - <<'EOF'\n${body}\nEOF`,
			}),
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain("astack STE blocked this PR body");
		expect(run.stderr).not.toContain("is missing");
		const clean = body.replace("It's a change.", "It is a change.");
		const title = hook(
			"PreToolUse",
			tool("Bash", {
				command: `gh pr create --title "Don't cache" --body-file - <<'EOF'\n${clean}\nEOF`,
			}),
		);
		expect(title.status).toBe(2);
		expect(title.stderr).toContain(
			"astack STE blocked the title of this PR body",
		);
		const issue = hook(
			"PreToolUse",
			tool(
				"Bash",
				{
					command: `gh issue create --title "We're slow; it's bad, e.g. on login" --body "The page is slow."`,
				},
				loose,
			),
			{ CLAUDE_PROJECT_DIR: loose },
		);
		expect(issue.status).toBe(2);
		expect(issue.stderr).toContain("semicolon");
		expect(issue.stderr).toContain("latin");
	});

	test("a session tag before a long dash passes in a commit subject and a PR title", () => {
		const subject = "S0 — the repo carries the astack profile and flow docs";
		const commit = hook(
			"PreToolUse",
			tool("Bash", {
				command: `git commit -m '${subject}' -m 'The commit adds the profile.'`,
			}),
		);
		expect(commit.status).toBe(0);
		const body =
			"## Why\nA reason.\n\n## What changes\nIt is a change.\n\n## Verification\nTests.\n\n## Risk and rollback\nRevert.";
		const create = (title: string) =>
			hook(
				"PreToolUse",
				tool("Bash", {
					command: `gh pr create --title '${title}' --body-file - <<'EOF'\n${body}\nEOF`,
				}),
			);
		expect(create(subject).status).toBe(0);
		const second = create("B3/S2 — the export — and the import");
		expect(second.status).toBe(2);
		expect(second.stderr).toContain(
			"astack STE blocked the title of this PR body",
		);
	});

	test("an issue edit only advises, because the hook has no old text", () => {
		const run = hook(
			"PreToolUse",
			tool("Bash", { command: `gh issue edit 12 --body "It's fixed."` }),
		);
		expect(run.status).toBe(0);
		expect(run.context).toContain("astack STE advice for this issue edit");
	});

	test("a commit message body is checked after the prefix and trailers go", () => {
		const run = hook(
			"PreToolUse",
			tool("Bash", {
				command: `git commit -m "fix: add the cache" -m "The cache isn't warm."`,
			}),
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain("astack STE blocked this commit message");
		const heredoc = hook(
			"PreToolUse",
			tool("Bash", {
				command:
					"git commit -m \"$(cat <<'EOF'\nfeat: add the cache\n\nIt doesn't break the import.\n\nCo-Authored-By: A Person <a@example.com>\nEOF\n)\"",
			}),
		);
		expect(heredoc.status).toBe(2);
		expect(heredoc.stderr).toContain("contraction");
	});

	test("merge commits and dynamic messages do not block", () => {
		for (const command of [
			`git commit -m "Merge branch 'main' into feature; it's fine"`,
			'git commit -m "$MSG"',
			"git commit --amend --no-edit",
		]) {
			const run = hook("PreToolUse", tool("Bash", { command }));
			expect(run.status).toBe(0);
		}
	});

	test("a one-line commit subject denies the exact rules", () => {
		for (const command of [
			`git commit --allow-empty -m "We're done; it's fixed"`,
			`git commit -m "fix: don't cache the token"`,
			`git commit -m "Don't merge this; it is e.g. broken"`,
		]) {
			const run = hook("PreToolUse", tool("Bash", { command }, loose), {
				CLAUDE_PROJECT_DIR: loose,
			});
			expect(run.status).toBe(2);
			expect(run.stderr).toContain("astack STE blocked this commit message");
		}
		const clean = hook(
			"PreToolUse",
			tool("Bash", { command: `git commit -m "Add the streamed export"` }),
		);
		expect(clean.status).toBe(0);
	});

	test("Linear and GitHub tools deny on create and comment, and advise on update", () => {
		const create = hook(
			"PreToolUse",
			tool("mcp__claude_ai_Linear__save_issue", {
				team: "Core",
				title: "Export",
				description: `${FEATURE}\n\nIt's broken.`,
			}),
		);
		expect(create.status).toBe(2);
		expect(create.stderr).toContain("astack STE blocked this Linear issue");
		const update = hook(
			"PreToolUse",
			tool("mcp__claude_ai_Linear__save_issue", {
				id: "ABC-1",
				description: "It's broken.",
			}),
		);
		expect(update.status).toBe(0);
		expect(update.context).toContain("astack STE advice for this Linear issue");
		const comment = hook(
			"PreToolUse",
			tool("mcp__plugin_linear_linear__save_comment", {
				issueId: "ABC-1",
				body: "It's fixed.",
			}),
		);
		expect(comment.stderr).toContain("astack STE blocked this Linear comment");
		const github = hook(
			"PreToolUse",
			tool("mcp__github__add_issue_comment", {
				owner: "o",
				repo: "r",
				issue_number: 1,
				body: "It's fixed.",
			}),
		);
		expect(github.stderr).toContain("astack STE blocked this issue comment");
	});
});

describe("kept code comments", () => {
	test("a kept doc comment on an export is checked, and a license header is not", () => {
		const run = hook(
			"PreToolUse",
			tool("Write", {
				file_path: join(strict, "src/api.ts"),
				content:
					'/** Returns the token. It doesn\'t read the cache. */\nexport function token(): string {\n\treturn "";\n}\n',
			}),
		);
		expect(run.status).toBe(2);
		expect(run.stderr).toContain(
			"astack STE blocked the kept comments in src/api.ts",
		);
		const license = hook(
			"PreToolUse",
			tool("Write", {
				file_path: join(strict, "src/lic.ts"),
				content:
					"// SPDX-License-Identifier: MIT. It's the licence.\nexport const l = 1;\n",
			}),
		);
		expect(license.stdout).toBe("");
		expect(license.status).toBe(0);
	});
});

describe("the strict Stop hook", () => {
	const failing = "It's done. The build isn't green; the cache is cold.";
	const rewrite = "It is done. The build isn't green.";
	const other = "We're close; the deploy runs.";
	const clean = "It is done. The build is green.";
	const after = { stop_hook_active: true };

	test("a short reply gets the check, and a clean short reply passes", () => {
		const contraction = hook("Stop", stop("s1", "It's done."));
		expect(contraction.blocked).toBe(true);
		expect(contraction.reason).toContain("astack STE: the reply has 1 finding");
		expect(contraction.reason).toContain('1. contraction: "It\'s done."');
		const semicolon = hook("Stop", stop("s2", "Done; tests pass."));
		expect(semicolon.blocked).toBe(true);
		expect(semicolon.reason).toContain('1. semicolon: "Done; tests pass."');
		const short = hook("Stop", stop("s3", "Tests pass now."));
		expect(short.blocked).toBe(false);
		expect(short.stdout).toBe("");
	});

	test("a reply in another script gets one language finding", () => {
		const run = hook("Stop", stop("l1", "Готово, всё работает. Тесты прошли."));
		expect(run.blocked).toBe(true);
		expect(run.reason).toContain("astack STE: the reply has 1 finding");
		expect(run.reason).toContain("1. language:");
		expect(run.reason).toContain("The reply must be in ASD-STE100 English.");
		const quoted = hook(
			"Stop",
			stop("l2", 'The error text is "Файл не найден". The path is wrong.'),
		);
		expect(quoted.blocked).toBe(false);
	});

	test("a reply in another language with Latin letters gets one language finding", () => {
		for (const [session, text] of [
			[
				"l3",
				"Der Build ist jetzt grün. Alle Tests laufen durch, und die Änderung ist fertig.",
			],
			[
				"l4",
				"Le build est vert. Tous les tests passent et la modification est terminée.",
			],
		] as const) {
			const run = hook("Stop", stop(session, text));
			expect(run.blocked).toBe(true);
			expect(run.reason).toContain("astack STE: the reply has 1 finding");
			expect(run.reason).toContain("1. language:");
			expect(run.reason).toContain("The reply must be in ASD-STE100 English.");
			expect(
				hook(
					"Stop",
					stop(session, "The build is green. All tests pass.", after),
				).blocked,
			).toBe(false);
		}
		const name = hook(
			"Stop",
			stop(
				"l5",
				"Jürgen Müller from the Köln team merged the fix. The tests pass.",
			),
		);
		expect(name.blocked).toBe(false);
		expect(name.stdout).toBe("");
	});

	test("a reply that is only one md or text fence of prose gets one rewrite", () => {
		for (const [session, info] of [
			["f1", "md"],
			["f2", "markdown"],
			["f3", "text"],
		] as const) {
			const run = hook(
				"Stop",
				stop(session, `\`\`\`${info}\nI'm done; the build's green.\n\`\`\``),
			);
			expect(run.blocked).toBe(true);
			expect(run.reason).toContain(
				"contraction: \"I'm done; the build's green.\"",
			);
			expect(
				hook(
					"Stop",
					stop(
						session,
						`\`\`\`${info}\nI am done. The build is green.\n\`\`\``,
						after,
					),
				).blocked,
			).toBe(false);
		}
	});

	test("a doc or a locale file in another script keeps the language skip", () => {
		mkdirSync(join(strict, "src/locales"), { recursive: true });
		for (const path of ["docs/ru.md", "src/locales/ru.md"]) {
			const run = hook(
				"PreToolUse",
				tool("Write", {
					file_path: join(strict, path),
					content: "# Заметки\n\nГотово, всё работает. Тесты прошли.\n",
				}),
			);
			expect(run.status).toBe(0);
			expect(run.stdout).toBe("");
		}
	});

	test("one rewrite for each reply, and a failing rewrite goes through with a count", () => {
		expect(hook("UserPromptSubmit", prompt("t1", "go")).status).toBe(0);
		const first = hook("Stop", stop("t1", failing));
		expect(first.blocked).toBe(true);
		expect(first.status).toBe(0);
		expect(first.reason).toContain("astack STE: the reply has 3 findings");
		expect(
			first.reason
				.trim()
				.endsWith(
					"Send the full reply again in ASD-STE100. Keep every fact, number, path, link and command. Keep quote blocks and code as they are. Do not call tools.",
				),
		).toBe(true);
		const second = hook("Stop", stop("t1", rewrite, after));
		expect(second.blocked).toBe(false);
		expect(second.stdout).toBe("");
		const next = hook("UserPromptSubmit", prompt("t1", "next"));
		expect(next.context).toContain("still had 1 finding after one rewrite");
		expect(hook("Stop", stop("t1", failing)).blocked).toBe(true);
	});

	test("a clean rewrite leaves no count for the next prompt", () => {
		hook("UserPromptSubmit", prompt("t6", "go"));
		expect(hook("Stop", stop("t6", failing)).blocked).toBe(true);
		expect(hook("Stop", stop("t6", clean, after)).blocked).toBe(false);
		expect(hook("UserPromptSubmit", prompt("t6", "next")).context).toBe("");
	});

	test("a rewrite that repeats the blocked reply is not blocked again", () => {
		hook("UserPromptSubmit", prompt("t7", "go"));
		expect(hook("Stop", stop("t7", failing)).blocked).toBe(true);
		for (const _ of [1, 2, 3])
			expect(hook("Stop", stop("t7", failing, after)).blocked).toBe(false);
		expect(hook("UserPromptSubmit", prompt("t7", "next")).context).toContain(
			"still had 3 findings after one rewrite",
		);
	});

	test("a second reply in the same turn gets its own rewrite", () => {
		hook("UserPromptSubmit", prompt("t8", "go"));
		expect(hook("Stop", stop("t8", failing)).blocked).toBe(true);
		expect(hook("Stop", stop("t8", clean, after)).blocked).toBe(false);
		const second = hook("Stop", stop("t8", other, after));
		expect(second.blocked).toBe(true);
		expect(second.reason).toContain("We're close; the deploy runs.");
		expect(hook("Stop", stop("t8", "We are close.", after)).blocked).toBe(
			false,
		);
		expect(hook("Stop", stop("t8", "We're close.", after)).blocked).toBe(true);
	});

	test("a Stop block of another plugin does not use the rewrite", () => {
		hook("UserPromptSubmit", prompt("t9", "go"));
		expect(hook("Stop", stop("t9", clean)).blocked).toBe(false);
		expect(hook("Stop", stop("t9", failing, after)).blocked).toBe(true);
		expect(hook("Stop", stop("t9", rewrite, after)).blocked).toBe(false);
	});

	test("a rewrite that a person stopped does not cover a later reply", () => {
		hook("UserPromptSubmit", prompt("t10", "go"));
		expect(hook("Stop", stop("t10", failing)).blocked).toBe(true);
		expect(hook("Stop", stop("t10", clean)).blocked).toBe(false);
		expect(hook("Stop", stop("t10", other, after)).blocked).toBe(true);
	});

	test("a Stop with no stop_hook_active field never blocks two replies in a row", () => {
		const bare = (text: string) => ({
			hook_event_name: "Stop",
			session_id: "t11",
			cwd: strict,
			last_assistant_message: text,
		});
		hook("UserPromptSubmit", prompt("t11", "go"));
		expect(hook("Stop", bare(failing)).blocked).toBe(true);
		expect(hook("Stop", bare(rewrite)).blocked).toBe(false);
		expect(hook("Stop", bare("It isn't done.")).blocked).toBe(true);
		expect(hook("Stop", bare("It isn't done yet.")).blocked).toBe(false);
	});

	test("an interim reply while background work runs gets a rewrite, and the final answer gets its own", () => {
		const captured = JSON.parse(
			readFileSync(
				join(ROOT, "tests/fixtures/hook-input/hook-input-Stop-background.json"),
				"utf8",
			),
		);
		hook("UserPromptSubmit", prompt("t4", "go"));
		const interim = hook("Stop", {
			...captured,
			session_id: "t4",
			cwd: strict,
		});
		expect(interim.blocked).toBe(true);
		expect(interim.reason).toContain("I'm waiting; it's running.");
		expect(
			hook("Stop", {
				...captured,
				session_id: "t4",
				cwd: strict,
				stop_hook_active: true,
				last_assistant_message: "I am waiting. It runs.",
			}).blocked,
		).toBe(false);
		expect(hook("Stop", stop("t4", failing)).blocked).toBe(true);
	});

	test("a failing reply that repeats in a new chain gets its own rewrite", () => {
		const waiting = "I'm waiting; it's running.";
		hook("UserPromptSubmit", prompt("t12", "go"));
		expect(
			hook("Stop", stop("t12", waiting, { prompt_id: "p1" })).blocked,
		).toBe(true);
		expect(
			hook(
				"Stop",
				stop("t12", "I am waiting. It runs.", { ...after, prompt_id: "p1" }),
			).blocked,
		).toBe(false);
		expect(
			hook("Stop", stop("t12", waiting, { ...after, prompt_id: "p1" })).blocked,
		).toBe(false);
		expect(
			hook("Stop", stop("t12", waiting, { prompt_id: "p2" })).blocked,
		).toBe(true);
		for (const _ of [1, 2])
			expect(
				hook("Stop", stop("t12", waiting, { ...after, prompt_id: "p2" }))
					.blocked,
			).toBe(false);
		expect(
			hook("Stop", stop("t12", waiting, { turn_id: "turn-3" })).blocked,
		).toBe(true);
		expect(
			hook("Stop", stop("t12", waiting, { ...after, turn_id: "turn-3" }))
				.blocked,
		).toBe(false);
	});

	test("with no chain id, a repeated reply in the same turn keeps its single claim", () => {
		hook("UserPromptSubmit", prompt("t13", "go"));
		expect(hook("Stop", stop("t13", failing)).blocked).toBe(true);
		expect(hook("Stop", stop("t13", clean, after)).blocked).toBe(false);
		expect(hook("Stop", stop("t13", failing)).blocked).toBe(false);
		hook("UserPromptSubmit", prompt("t13", "next"));
		expect(hook("Stop", stop("t13", failing)).blocked).toBe(true);
	});

	test("a loop wakeup, a scheduled prompt, a cron prompt and a subagent hand-back each start a new reply", () => {
		const handBack = JSON.parse(
			readFileSync(
				join(
					ROOT,
					"tests/fixtures/hook-input/hook-input-UserPromptSubmit-agent-message.json",
				),
				"utf8",
			),
		);
		const crons = [
			{
				id: "c1",
				schedule: "*/5 * * * *",
				recurring: true,
				prompt: "check the deploy",
			},
		];
		hook("UserPromptSubmit", prompt("t2", "go"));
		expect(
			hook("Stop", stop("t2", failing, { session_crons: crons })).blocked,
		).toBe(true);
		for (const next of [
			prompt("t2", "go again", { source: "loop_wakeup" }),
			prompt("t2", "go again", { source: "schedule_wakeup" }),
			prompt("t2", "check the deploy"),
			{ ...handBack, session_id: "t2", cwd: strict },
			prompt(
				"t2",
				'<teammate-message from="lead">\nThe sketch is done.\n</teammate-message>',
			),
		]) {
			hook("UserPromptSubmit", next);
			expect(hook("Stop", stop("t2", failing)).blocked).toBe(true);
		}
	});

	test("headless runs, subagents, JSON, YAML, one fenced block and a clean reply pass", () => {
		const cases: readonly [Record<string, unknown>, Record<string, string>][] =
			[
				[
					stop("e1", failing),
					{
						CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
						CLAUDE_CODE_SESSION_ATTENDED: "0",
					},
				],
				[stop("e2", failing, { agent_id: "agent-1" }), {}],
				[stop("e3", '{"status": "it\'s fine; ok"}'), {}],
				[stop("e4", 'status: "it\'s fine"\nnext: none'), {}],
				[stop("e5", "```\nit's code; skip it\n```"), {}],
				[stop("e6", "It is done. The build is green."), {}],
				[stop("e7", ""), {}],
			];
		for (const [payload, extra] of cases) {
			const run = hook("Stop", payload, extra);
			expect(run.status).toBe(0);
			expect(run.stdout).toBe("");
		}
	});

	test("a prompt in a headless run writes no reply state", () => {
		const headless = {
			CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
			CLAUDE_CODE_SESSION_ATTENDED: "0",
		};
		expect(hook("UserPromptSubmit", prompt("h1", "go"), headless).status).toBe(
			0,
		);
		expect(existsSync(join(state, "ste", "h1"))).toBe(false);
		hook("UserPromptSubmit", prompt("h2", "go"));
		expect(readFileSync(join(state, "ste", "h2", "turn"), "utf8")).toBe("1\n");
	});

	test("the test override makes a headless run strict", () => {
		const run = hook("Stop", stop("e8", failing), {
			CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
			CLAUDE_CODE_SESSION_ATTENDED: "0",
			ASTACK_STE_TEST_INTERACTIVE: "1",
		});
		expect(run.blocked).toBe(true);
	});

	test("parallel Stop hooks of two plugin copies give one block for each reply", async () => {
		expect(await parallel(stop("race", failing))).toBe(1);
		expect(await parallel(stop("race", rewrite, after))).toBe(0);
		expect(await parallel(stop("race", other, after))).toBe(1);
		expect(await parallel(stop("race", clean, after))).toBe(0);
		const chained = (text: string, chain: string, extra = {}) =>
			stop("race-chain", text, { prompt_id: chain, ...extra });
		expect(await parallel(chained(failing, "p1"))).toBe(1);
		expect(await parallel(chained(rewrite, "p1", after))).toBe(0);
		expect(await parallel(chained(failing, "p1", after))).toBe(0);
		expect(await parallel(chained(failing, "p2"))).toBe(1);
		expect(await parallel(chained(failing, "p2", after))).toBe(0);
	});

	test("no state dir fails open", () => {
		const run = hook("Stop", stop("e9", failing), {
			ASTACK_STATE_DIR: "",
			HOME: "",
		});
		expect(run.status).toBe(0);
	});
});

describe("the deny ledger", () => {
	test("an exact rule stays a deny on each identical try", () => {
		const write = tool(
			"Write",
			{
				file_path: join(strict, "docs/retry.md"),
				content: "We're done; it's fixed.\n",
			},
			strict,
			"ledger-exact",
		);
		for (const _ of [1, 2, 3]) expect(hook("PreToolUse", write).status).toBe(2);
		const comment = tool(
			"Bash",
			{ command: `gh pr comment 4 --body "It's fixed; we're done."` },
			loose,
			"ledger-exact",
		);
		for (const _ of [1, 2, 3])
			expect(
				hook("PreToolUse", comment, { CLAUDE_PROJECT_DIR: loose }).status,
			).toBe(2);
	});

	test("the same measured finding denied twice in a session becomes advice", () => {
		const long =
			"The export job reads every row of the member table and then writes each row to the report file on the shared disk before the next batch starts again.";
		const write = tool(
			"Write",
			{
				file_path: join(strict, "docs/ledger.md"),
				content: `${long}\n`,
			},
			strict,
			"ledger-1",
		);
		expect(hook("PreToolUse", write).status).toBe(2);
		expect(hook("PreToolUse", write).status).toBe(2);
		const third = hook("PreToolUse", write);
		expect(third.status).toBe(0);
		expect(third.context).toContain("astack STE advice");
		expect(
			hook("PreToolUse", { ...write, session_id: "ledger-2" }).status,
		).toBe(2);
	});
});

describe("the state files", () => {
	test("a reply claim is atomic, and a new prompt clears the claims and the rewrite", () => {
		const dir = join(base, "unit");
		const key = replyKey("It's done.");
		expect(claimReply(dir, key)).toBe("claimed");
		expect(claimReply(dir, key)).toBe("taken");
		expect(claimReply(dir, replyKey("It isn't done."))).toBe("claimed");
		expect(saveRewrite(dir, { asked: key })).toBe(true);
		expect(readRewrite(dir)).toEqual({ asked: key });
		expect(advanceTurn(dir)).toBe(1);
		expect(readFileSync(join(dir, "turn"), "utf8")).toBe("1\n");
		expect(readRewrite(dir)).toBeUndefined();
		expect(claimReply(dir, key)).toBe("claimed");
	});

	test("the reply key depends on the text and the chain id", () => {
		expect(replyKey("a")).toBe(replyKey("a"));
		expect(replyKey("a")).not.toBe(replyKey("b"));
		expect(replyKey(undefined)).toBe(replyKey(""));
		expect(replyKey("a")).toMatch(/^[0-9a-f]{32}$/);
		expect(replyKey("a", "p1")).toBe(replyKey("a", "p1"));
		expect(replyKey("a", "p1")).not.toBe(replyKey("a", "p2"));
		expect(replyKey("a", "p1")).not.toBe(replyKey("a"));
		expect(replyKey("a", "")).toBe(replyKey("a"));
		expect(replyKey("a", undefined)).toBe(replyKey("a"));
	});

	test("only the first other reply after a block answers the rewrite", () => {
		const asked = { asked: "a" };
		const answered = { asked: "a", answer: "b" };
		expect(answersRewrite(undefined, "b", false)).toBe(false);
		expect(answersRewrite(asked, "b", false)).toBe(true);
		expect(answersRewrite(asked, "b", true)).toBe(false);
		expect(answersRewrite(asked, "a", false)).toBe(false);
		expect(answersRewrite(answered, "b", false)).toBe(true);
		expect(answersRewrite(answered, "c", false)).toBe(false);
	});

	test("a broken rewrite file reads as no rewrite", () => {
		const dir = join(base, "broken");
		mkdirSync(dir, { recursive: true });
		for (const text of ["{", "[]", '{"asked": 3}', "null"]) {
			writeFileSync(join(dir, "rewrite.json"), text);
			expect(readRewrite(dir)).toBeUndefined();
		}
		writeFileSync(join(dir, "rewrite.json"), '{"asked": "a", "answer": 4}');
		expect(readRewrite(dir)).toEqual({ asked: "a" });
	});

	test("a session dir older than 14 days goes when a new session starts", () => {
		const root = join(base, "prune");
		const old = join(root, "ste", "old-session");
		const fresh = join(root, "ste", "new-session");
		advanceTurn(old);
		advanceTurn(fresh);
		pruneSessions(root, Date.now() + 15 * 86_400_000);
		expect(existsSync(old)).toBe(false);
		expect(existsSync(fresh)).toBe(false);
		advanceTurn(fresh);
		pruneSessions(root, Date.now() + 86_400_000);
		expect(existsSync(fresh)).toBe(true);
	});

	test("the pending count is read once, and a clear removes it", () => {
		const dir = join(base, "pending");
		recordPending(dir, 4);
		expect(takePending(dir)).toBe(4);
		expect(takePending(dir)).toBeUndefined();
		recordPending(dir, 2);
		clearPending(dir);
		expect(takePending(dir)).toBeUndefined();
	});

	test("the ledger demotes a fingerprint after two denies", () => {
		const dir = join(base, "ledger");
		recordDenies(dir, ["a", "b"]);
		expect([...demoted(dir)]).toEqual([]);
		recordDenies(dir, ["a"]);
		expect([...demoted(dir)]).toEqual(["a"]);
	});
});
