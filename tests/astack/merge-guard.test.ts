import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mcpParts } from "../../src/astack/hook/decode/claude-code.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import type {
	Context,
	Handler,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import {
	type BaseAuthority,
	type PrTarget,
	type PullRequestState,
	pullRequestFrom,
	readPullRequestWithGh,
} from "../../src/astack/pr/github.ts";
import {
	loadGrant,
	type MergeGrant,
	mergeGrantIn,
} from "../../src/astack/pr/grant.ts";
import { parseMergeCall } from "../../src/astack/pr/merge.ts";
import {
	DEFAULT_MERGE_PROFILE,
	type MergeProfile,
} from "../../src/astack/pr/profile.ts";
import { commandWords, parseShell } from "../../src/astack/shell.ts";

let root = "";
let project = "";
let standing = "";
let state = "";

const HEAD = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const BASE_TIP = "9f3c1a2b4d5e6f708192a3b4c5d6e7f8091a2b3c";

function committed(merge: Partial<MergeProfile>): BaseAuthority {
	return {
		kind: "committed",
		commit: BASE_TIP,
		profile: { ...DEFAULT_MERGE_PROFILE, ...merge },
	};
}

const GREEN: PullRequestState = {
	number: 12,
	url: "https://github.com/o/r/pull/12",
	title: "feat: export reports",
	body: "Part of ABC-1\n\n## Why\nx",
	base: "main",
	head: HEAD,
	openThreads: 0,
	threadsListed: true,
	checks: "success",
	checkedHead: HEAD,
	authority: committed({}),
};

const NO_STANDING_GRANT =
	".astack/profile.json on main at 9f3c1a2 gives no standing grant.";

function git(dir: string, ...args: string[]): void {
	spawnSync("git", args, { cwd: dir });
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "astack-merge-"));
	project = join(root, "plain");
	standing = join(root, "standing");
	state = join(root, "state");
	mkdirSync(project);
	mkdirSync(join(standing, ".astack"), { recursive: true });
	git(standing, "init", "-q");
	git(standing, "remote", "add", "origin", "https://github.com/o/r.git");
	writeFileSync(
		join(standing, ".astack/profile.json"),
		JSON.stringify({ merge: { authority: "standing", requireChecks: false } }),
	);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

type Reads = PrTarget[];

function guard(pr: PullRequestState | undefined, reads: Reads = []) {
	return mergeGuard((target) => {
		reads.push(target);
		return pr;
	});
}

function context(
	cwd: string,
	session: string,
	event: Context["event"],
): Context {
	return {
		tool: "claude-code",
		event,
		cwd,
		projectDir: undefined,
		env: { ASTACK_STATE_DIR: state },
		today: "2026-10-16",
		session,
	};
}

function prompt(handler: Handler, text: string, session = "s1"): void {
	handler.run(
		{ kind: "prompt", text, human: true, session },
		context(project, session, "UserPromptSubmit"),
	);
}

type Run = { readonly exit: 0 | 2; readonly stderr: string };

function outcome(verdict: Verdict): Run {
	return verdict.kind === "deny"
		? { exit: 2, stderr: verdict.reason }
		: { exit: 0, stderr: "" };
}

function bash(
	handler: Handler,
	command: string,
	cwd = project,
	session = "s1",
): Run {
	return outcome(
		handler.run(
			{ kind: "shell", command, cwd },
			context(cwd, session, "PreToolUse"),
		),
	);
}

const GRANTED: readonly (readonly [string, MergeGrant])[] = [
	["merge when green", { kind: "any" }],
	["ok, merge it", { kind: "any" }],
	["can you merge it?", { kind: "any" }],
	["If CI is green, merge it", { kind: "any" }],
	["Let's merge all open PRs before we open new", { kind: "any" }],
	["merge 1672 when green", { kind: "prs", numbers: [1672] }],
	["merge #12 and #13", { kind: "prs", numbers: [12, 13] }],
	["merge https://github.com/o/r/pull/41 now", { kind: "prs", numbers: [41] }],
	["push and merge into main when green", { kind: "any" }],
];

describe("the merge grant in a human prompt", () => {
	test.each(GRANTED)("[control:sg-grant-words] %p grants %p", (text, grant) => {
		expect(mergeGrantIn(text)).toEqual(grant);
	});

	test.each([
		"don't merge",
		"Do not merge yet, I want to look",
		"push, but don't merge",
		"fix the merge conflicts",
		"update from main and merge main into the branch",
		"merge in the latest main",
		"before merge, run the gates",
		"after the merge, close the ticket",
		"is it ready to merge?",
		"should we merge?",
		"never merge without my go",
		"Merge pull request #12 from o/branch",
		"```\nmerge 12\n```",
		"> merge when green",
		"merged it already",
	])("[control:sg-negated-merge] %p grants nothing", (text) => {
		expect(mergeGrantIn(text)).toEqual({ kind: "none" });
	});

	test.each([
		["full send", { kind: "any" }],
		["/astack:full-send", { kind: "any" }],
		["$astack:full-send", { kind: "any" }],
		["/astack-full-send", { kind: "any" }],
		["$full-send", { kind: "any" }],
		["full send it", { kind: "any" }],
		["/astack:full-send, what do you think?", { kind: "any" }],
		["do a full send", { kind: "none" }],
		["what does full send do?", { kind: "none" }],
		["should we full send?", { kind: "none" }],
		["full send?", { kind: "none" }],
		["review full send for bugs", { kind: "none" }],
		["explain full send", { kind: "none" }],
		["review full-send for bugs", { kind: "none" }],
		["What does /astack:full-send do?", { kind: "none" }],
		["Review /astack:full-send for bugs", { kind: "none" }],
		["full stop", { kind: "none" }],
		["no full send", { kind: "none" }],
		["don't full send", { kind: "none" }],
		["not a full send", { kind: "none" }],
		["full send, but do not merge", { kind: "none" }],
		["full send, no merge", { kind: "none" }],
		["Full send it. I will merge it myself.", { kind: "none" }],
		["full send, leave the merge to me", { kind: "none" }],
		["full stop: same as full send", { kind: "none" }],
		["/astack:full-stop run full send steps", { kind: "none" }],
		["full send but no merging", { kind: "none" }],
		["full send, but I will handle the merge", { kind: "none" }],
		["full send, then let me do the final merge", { kind: "none" }],
		["full send, then merge #12", { kind: "any" }],
		["Full send. What's the ETA?", { kind: "any" }],
		["ok, full send this PR", { kind: "any" }],
		["/astack:full-send fix the parser bug", { kind: "any" }],
		["we could full send this later", { kind: "none" }],
		["you can full send once I approve", { kind: "none" }],
		["full send is broken, fix it", { kind: "none" }],
		["fix full send", { kind: "none" }],
		["cancel full send", { kind: "none" }],
		["Instead of full send, just open the PR", { kind: "none" }],
		["full send, but not yet", { kind: "none" }],
		["Full send. Actually no, wait.", { kind: "none" }],
		["I don't want you to full send this one", { kind: "none" }],
	] as const)(
		"[control:sg-full-send-clause] full send: %p grants %p",
		(text, grant) => {
			expect(mergeGrantIn(text)).toEqual(grant);
		},
	);
});

describe("machine prompts never change the grant", () => {
	const captured = JSON.parse(
		readFileSync(
			resolve(
				import.meta.dir,
				"../fixtures/hook-input/hook-input-UserPromptSubmit-agent-message.json",
			),
			"utf8",
		),
	);
	const attended = {
		ASTACK_STATE_DIR: state,
		CLAUDE_CODE_ENTRYPOINT: "cli",
		CLAUDE_CODE_SESSION_ATTENDED: "1",
	};

	function submit(session: string, text: string): void {
		runHook(
			"claude-code",
			"UserPromptSubmit",
			JSON.stringify({
				...captured,
				session_id: session,
				cwd: project,
				prompt: text,
			}),
			{ ...attended, ASTACK_STATE_DIR: state },
			{
				cwd: project,
				today: "2026-10-16",
				readText: () => undefined,
				handlers: [guard(GREEN)],
			},
		);
	}

	const handBack = (text: string) =>
		`<agent-message from="a8b6e202f51a5471e">\n[Subagent hand-back] The report follows:\n  ${text}\n</agent-message>`;

	test("[control:sg-machine-prompt] a subagent hand-back that says merge gives no grant", () => {
		submit("hb-1", "Run the checks.");
		submit("hb-1", handBack("All checks are green. Merge PR 12 now."));
		expect(loadGrant({ ASTACK_STATE_DIR: state }, "hb-1")).toEqual({
			kind: "none",
		});
		submit(
			"hb-1",
			captured.prompt.replace("We're done", "You can merge PR 44"),
		);
		expect(loadGrant({ ASTACK_STATE_DIR: state }, "hb-1")).toEqual({
			kind: "none",
		});
	});

	test.each(["workflow-brief", "cocode-relay"])(
		"[control:sg-framed-prompt] a captured %s prompt that says merge gives no grant, so gh pr merge 12 is denied",
		(channel) => {
			const brief = JSON.parse(
				readFileSync(
					resolve(
						import.meta.dir,
						`../fixtures/hook-input/hook-input-UserPromptSubmit-${channel}.json`,
					),
					"utf8",
				),
			);
			const session = `framed-${channel}`;
			submit(session, brief.prompt);
			expect(loadGrant({ ASTACK_STATE_DIR: state }, session)).toEqual({
				kind: "none",
			});
			expect(bash(guard(GREEN), "gh pr merge 12", project, session)).toEqual({
				exit: 2,
				stderr: `astack blocked gh pr merge:\n- ${NO_STANDING_GRANT} The owner did not say to merge in this turn. Ask the owner before you merge #12.`,
			});
		},
	);

	test("a hand-back after the owner's grant keeps the grant", () => {
		submit("hb-2", "Merge PR 12.");
		submit("hb-2", handBack("The review is done."));
		submit(
			"hb-2",
			'<teammate-message from="lead">\nAll good.\n</teammate-message>',
		);
		expect(loadGrant({ ASTACK_STATE_DIR: state }, "hb-2")).toEqual({
			kind: "prs",
			numbers: [12],
		});
	});
});

describe("the gh pr merge call", () => {
	test("reads the selector, the repo and the commit text", () => {
		const [simple] = parseShell(
			"gh pr merge 12 -sd --repo o/r --subject 'feat: x (#12)' --body-file - <<'EOF'\nPart of ABC-1\nEOF",
		);
		if (!simple) throw new Error("no command");
		const call = parseMergeCall(simple, commandWords(simple).slice(3), project);
		expect(call).toEqual({
			selector: "12",
			repo: "o/r",
			subject: "feat: x (#12)",
			body: "Part of ABC-1",
			dynamic: false,
			disableAuto: false,
			admin: false,
		});
	});

	test("a selector from a variable is dynamic", () => {
		const [simple] = parseShell('gh pr merge "$PR" --squash');
		if (!simple) throw new Error("no command");
		expect(
			parseMergeCall(simple, commandWords(simple).slice(3), project).dynamic,
		).toBe(true);
	});
});

describe("the merge guard", () => {
	test("[control:sg-merge-needs-grant] denies a merge with no grant when the base profile gives no standing grant", () => {
		const run = bash(guard(GREEN), "gh pr merge 12 --squash", project, "none");
		expect(run).toEqual({
			exit: 2,
			stderr: `astack blocked gh pr merge:\n- ${NO_STANDING_GRANT} The owner did not say to merge in this turn. Ask the owner before you merge #12.`,
		});
	});

	test("[control:sg-turn-grant-merges] allows a merge that the owner granted in this turn on a green PR", () => {
		const reads: Reads = [];
		const handler = guard(GREEN, reads);
		prompt(handler, "merge 12 when green");
		const run = bash(handler, "gh pr merge 12 --squash");
		expect(run).toEqual({ exit: 0, stderr: "" });
		expect(reads).toEqual([{ selector: "12", repo: undefined, dir: project }]);
	});

	test("[control:sg-grant-scope] a grant for one PR does not cover another", () => {
		const handler = guard({ ...GREEN, number: 13 });
		prompt(handler, "merge 12 when green");
		const run = bash(handler, "gh pr merge 13");
		expect(run.exit).toBe(2);
		expect(run.stderr).toContain("names #12, not #13");
	});

	test("[control:sg-grant-ends] a later human prompt with no merge words ends the grant", () => {
		const handler = guard(GREEN);
		prompt(handler, "merge when green");
		prompt(handler, "now update the ticket");
		expect(bash(handler, "gh pr merge 12").stderr).toContain(
			"The owner did not say to merge in this turn.",
		);
	});

	test("denies a merge chained with other commands", () => {
		const handler = guard(GREEN);
		prompt(handler, "merge when green");
		const run = bash(handler, "gh pr checks 12 --watch && gh pr merge 12");
		expect(run.exit).toBe(2);
		expect(run.stderr).toContain("Run gh pr merge as its own Bash call");
	});

	test("denies open threads, red or pending CI and a closing word", () => {
		const handler = guard({
			...GREEN,
			openThreads: 2,
			checks: "pending",
			body: "Closes ABC-1\n\n## Why\nx",
		});
		prompt(handler, "merge it");
		const run = bash(handler, "gh pr merge 12");
		expect(run.exit).toBe(2);
		expect(run.stderr).toContain("2 review threads are open on #12");
		expect(run.stderr).toContain("CI still runs on head a1b2c3d of #12");
		expect(run.stderr).toContain('#12: Body line 1 has "Closes ABC-1"');
	});

	test("denies CI state that belongs to another commit", () => {
		const handler = guard({ ...GREEN, checkedHead: "ffff000" });
		prompt(handler, "merge it");
		expect(bash(handler, "gh pr merge 12").stderr).toContain(
			"belongs to ffff000, not to the PR head a1b2c3d",
		);
	});

	test("a PR with no CI check needs merge.requireChecks false on its base branch", () => {
		const handler = guard({ ...GREEN, checks: "none", checkedHead: HEAD });
		prompt(handler, "merge it");
		expect(bash(handler, "gh pr merge 12").stderr).toContain(
			"GitHub shows no CI check",
		);
		const noCi = guard({
			...GREEN,
			checks: "none",
			authority: committed({ requireChecks: false }),
		});
		prompt(noCi, "merge it");
		expect(bash(noCi, "gh pr merge 12").exit).toBe(0);
	});

	test("[control:sg-standing-grant] a standing grant in the base branch profile needs no grant in the turn", () => {
		const run = bash(
			guard({ ...GREEN, authority: committed({ authority: "standing" }) }),
			"gh pr merge 12",
			project,
			"fresh",
		);
		expect(run).toEqual({ exit: 0, stderr: "" });
	});

	const V2_STANDS = committed({ standingBases: ["v2"] });

	test("a PR into a standing base needs no grant in the turn", () => {
		const run = bash(
			guard({ ...GREEN, base: "v2", authority: V2_STANDS }),
			"gh pr merge 12",
			project,
			"bases",
		);
		expect(run).toEqual({ exit: 0, stderr: "" });
	});

	test("a PR into another base needs the owner's grant, and the denial names both bases", () => {
		const run = bash(
			guard({ ...GREEN, authority: V2_STANDS }),
			"gh pr merge 12",
			project,
			"bases",
		);
		expect(run).toEqual({
			exit: 2,
			stderr:
				"astack blocked gh pr merge:\n- #12 goes into main, and merge.standingBases in .astack/profile.json on main at 9f3c1a2 covers only v2. The owner did not say to merge in this turn. Ask the owner before you merge #12.",
		});
	});

	test.each([
		[
			"no profile grant",
			committed({}),
			{ CLAUDE_CODE_SESSION_ATTENDED: "0" },
			`astack blocked gh pr merge:\n- ${NO_STANDING_GRANT} astack records no merge grant from prompts in an unattended session. CLAUDE_CODE_SESSION_ATTENDED=0 makes this session unattended. Ask the owner before you merge #12.`,
		],
		[
			"standing base",
			V2_STANDS,
			{ CLAUDE_CODE_ENTRYPOINT: "sdk-ts" },
			"astack blocked gh pr merge:\n- #12 goes into main, and merge.standingBases in .astack/profile.json on main at 9f3c1a2 covers only v2. astack records no merge grant from prompts in an unattended session. CLAUDE_CODE_ENTRYPOINT=sdk-ts makes this session unattended. Ask the owner before you merge #12.",
		],
	])(
		"[control:sg-unattended-denial] in an unattended session the %s denial names the setting, not a missing owner word",
		(_, authority, env, stderr) => {
			const verdict = guard({ ...GREEN, authority }).run(
				{ kind: "shell", command: "gh pr merge 12", cwd: project },
				{
					...context(project, "unattended", "PreToolUse"),
					env: { ASTACK_STATE_DIR: state, ...env },
				},
			);
			expect(outcome(verdict)).toEqual({ exit: 2, stderr });
		},
	);

	test("a PR into a standing base still needs green CI", () => {
		const run = bash(
			guard({ ...GREEN, base: "v2", checks: "failure", authority: V2_STANDS }),
			"gh pr merge 12",
			project,
			"bases",
		);
		expect(run).toEqual({
			exit: 2,
			stderr:
				"astack blocked gh pr merge:\n- CI failed on head a1b2c3d of #12. Fix the failure, push, and wait for green CI.",
		});
	});

	test.each([
		"gh pr merge 12 -R=other/repo",
		"gh pr merge -Rother/repo 12",
		"gh pr merge 12 -sR other/repo",
		"gh pr merge 12 -sdRother/repo",
	])("%p reads #12 in the repo that the short flag names", (command) => {
		const reads: Reads = [];
		bash(guard({ ...GREEN, base: "v2" }, reads), command, project, "bases");
		expect(reads).toEqual([
			{ selector: "12", repo: "other/repo", dir: project },
		]);
	});

	test.each([
		["gh -R other/repo pr merge 12", "other/repo"],
		["gh --repo=other/repo pr merge 12", "other/repo"],
		["env gh pr merge 12", undefined],
		["command gh pr merge 12", undefined],
		["/usr/local/bin/gh pr merge 12", undefined],
	])(
		"%p is a merge, so the guard reads #12 in the repo it names first",
		(command, repo) => {
			const reads: Reads = [];
			bash(guard({ ...GREEN, base: "v2" }, reads), command, project, "bases");
			expect(reads).toEqual([{ selector: "12", repo, dir: project }]);
		},
	);

	test.each([
		"GH_REPO=other/repo gh pr merge 12",
		"env GH_REPO=other/repo gh pr merge 12",
	])("%p is denied before the read", (command) => {
		const reads: Reads = [];
		const run = bash(
			guard({ ...GREEN, base: "v2" }, reads),
			command,
			project,
			"bases",
		);
		expect(run).toEqual({
			exit: 2,
			stderr:
				"astack blocked gh pr merge:\n- Do not put NAME=value words, such as GH_REPO, before gh pr merge. astack reads the PR without them, so it can read a different PR. Use --repo to name a different repo.",
		});
		expect(reads).toEqual([]);
	});

	test.each(["env -C ../other gh pr merge 12", "gh --subject x pr merge 12"])(
		"%p cannot be read, so it is denied before the read",
		(command) => {
			const reads: Reads = [];
			const run = bash(
				guard({ ...GREEN, base: "v2" }, reads),
				command,
				project,
				"bases",
			);
			expect(run).toEqual({
				exit: 2,
				stderr:
					"astack blocked gh pr merge:\n- astack cannot read this merge command. Run gh pr merge <number> as its own Bash call.",
			});
			expect(reads).toEqual([]);
		},
	);

	test("a command that astack cannot read and that names no merge passes", () => {
		expect(bash(guard(GREEN), "env -C ../other gh pr view 12").exit).toBe(0);
	});

	test("a closing word in the merge commit text is denied before the read", () => {
		const reads: Reads = [];
		const handler = guard(GREEN, reads);
		prompt(handler, "merge it");
		const run = bash(handler, "gh pr merge 12 --body 'Fixes #40'");
		expect(run.stderr).toContain('The merge commit text has "Fixes #40"');
		expect(reads).toEqual([]);
	});

	test("an unreadable PR is denied with the reason", () => {
		const handler = guard(undefined);
		prompt(handler, "merge it");
		expect(bash(handler, "gh pr merge 12").stderr).toContain(
			"could not read the PR with gh",
		);
	});

	test("turning auto-merge off is not a merge", () => {
		expect(bash(guard(GREEN), "gh pr merge 12 --disable-auto").exit).toBe(0);
	});

	test("a merge through gh api is denied", () => {
		const run = bash(
			guard(GREEN),
			"gh api -X PUT repos/o/r/pulls/12/merge",
			project,
			"standing",
		);
		expect(run.stderr).toContain("Merge with gh pr merge");
		expect(
			bash(
				guard(GREEN),
				"gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'",
			).stderr,
		).toContain("Merge with gh pr merge");
		expect(bash(guard(GREEN), "gh api repos/o/r/pulls/12/merge").exit).toBe(0);
	});

	test("other commands pass", () => {
		expect(bash(guard(GREEN), "gh pr view 12 --json state").exit).toBe(0);
	});

	test("an --admin merge is an owner gate, also with a standing grant", () => {
		const run = bash(
			guard({ ...GREEN, authority: committed({ authority: "standing" }) }),
			"gh pr merge 12 --admin",
			project,
			"adm",
		);
		expect(run.exit).toBe(2);
		expect(run.stderr).toContain("Do not merge with --admin");
	});
});

describe("base branch authority", () => {
	test.each([
		["merge.authority", { authority: "standing" }, GREEN, false],
		["merge.standingBases", { standingBases: ["main"] }, GREEN, false],
		[
			"merge.requireChecks",
			{ requireChecks: false },
			{ ...GREEN, checks: "none" as const },
			true,
		],
	])(
		"[control:sg-working-tree-profile] a working-tree edit of %s changes no merge verdict",
		(key, merge, pr, granted) => {
			const dir = join(root, "edited");
			mkdirSync(dir, { recursive: true });
			git(dir, "init", "-q");
			git(dir, "remote", "add", "origin", "https://github.com/o/r.git");
			const session = `edited-${key.replace(/\W/g, "-")}`;
			const run = (): Run => {
				const handler = guard(pr);
				if (granted) prompt(handler, "merge #12 when green", session);
				return bash(handler, "gh pr merge 12", dir, session);
			};
			rmSync(join(dir, ".astack"), { recursive: true, force: true });
			const clean = run();
			mkdirSync(join(dir, ".astack"));
			writeFileSync(
				join(dir, ".astack/profile.json"),
				JSON.stringify({ merge }),
			);
			expect({ clean: clean.exit, edited: run() }).toEqual({
				clean: 2,
				edited: clean,
			});
		},
	);

	test("[control:sg-other-repo] a standing profile of this repo gives no grant for a PR of another repo", () => {
		const reads: Reads = [];
		const run = bash(
			guard(
				{
					...GREEN,
					number: 7,
					url: "https://github.com/other/repo/pull/7",
					authority: { kind: "absent", commit: "e".repeat(40) },
				},
				reads,
			),
			"gh pr merge 7 --repo other/repo",
			standing,
			"other-repo",
		);
		expect({ run, reads }).toEqual({
			run: {
				exit: 2,
				stderr:
					"astack blocked gh pr merge:\n- main at eeeeeee has no .astack/profile.json, so it gives no standing grant. The owner did not say to merge in this turn. Ask the owner before you merge #7.",
			},
			reads: [{ selector: "7", repo: "other/repo", dir: standing }],
		});
	});

	test("[control:sg-absent-base] a base branch with no profile, an owner grant and green checks merge", () => {
		const handler = guard({
			...GREEN,
			authority: { kind: "absent", commit: "e".repeat(40) },
		});
		prompt(handler, "merge #12 when green", "absent-base");
		expect(bash(handler, "gh pr merge 12", project, "absent-base")).toEqual({
			exit: 0,
			stderr: "",
		});
	});
});

describe("MCP merge tools", () => {
	const schemas: { tools: { name: string }[] } = JSON.parse(
		readFileSync(
			resolve(import.meta.dir, "../fixtures/hook-input/mcp-tool-schemas.json"),
			"utf8",
		),
	);
	const captured = schemas.tools.map(({ name }) => name);
	const merges = new Set([
		"mcp__cocode__pull_request_merge",
		"mcp__plugin_linear_linear__merge_diff",
		"mcp__plugin_supabase_supabase__merge_branch",
	]);
	const MCP_DENY: Verdict = {
		kind: "deny",
		reason:
			"astack blocked gh pr merge:\n- astack cannot examine a merge through an MCP tool. Merge a PR with gh pr merge in a Bash call, or ask the owner.",
	};

	function mcpVerdict(name: string, input: unknown): Verdict {
		const handler = guard(GREEN);
		prompt(handler, "merge #12 when green", "mcp");
		return handler.run(
			{ kind: "mcp", ...mcpParts(name), input },
			context(project, "mcp", "PreToolUse"),
		);
	}

	test.each([
		...captured.map((name) => [name, merges.has(name)] as const),
		["mcp__plugin_github_github__merge_pull_request", true],
		["mcp__plugin_github_github__list_pull_requests", false],
		["mcp__plugin_github_github__pull_request_read", false],
		["mcp__forge__mergePullRequest", true],
		["mcp__forge__enable-automerge", true],
		["mcp__forge__createPRMerge", true],
		["mcp__forge__PRMerge", true],
		["mcp__forge__prmerge", true],
		["mcp__forge__merge2", true],
		["mcp__forge__s3merge", true],
		["mcp__forge__show_merged_prs", false],
		["mcp__forge__get_and_merge_pr", true],
		["mcp__forge__mark_merged", true],
	])(
		"[control:sg-mcp-merge] %s is denied, also after the owner's grant: %p",
		(name, denied) => {
			expect(mcpVerdict(name, { number: 12, expectedHeadSha: HEAD })).toEqual(
				denied ? MCP_DENY : { kind: "allow" },
			);
		},
	);

	test.each([
		[
			"a GraphQL merge",
			"mcp__forge__call_api",
			true,
			{
				query:
					'mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }',
			},
		],
		[
			"a GraphQL auto-merge",
			"mcp__forge__call_api",
			true,
			{
				query:
					'mutation { enablePullRequestAutoMerge(input: {pullRequestId: "x"}) { clientMutationId } }',
			},
		],
		[
			"a GraphQL merge after a tab",
			"mcp__forge__graphql",
			true,
			{
				query:
					'mutation {\n\tmergePullRequest(input: {pullRequestId: "x"}) { clientMutationId }\n}',
			},
		],
		[
			"a GraphQL auto-merge after a bare newline",
			"mcp__forge__graphql",
			true,
			{
				query:
					'mutation {\nenablePullRequestAutoMerge(input: {pullRequestId: "x"}) { clientMutationId }\n}',
			},
		],
		[
			"a GraphQL merge with a unicode escape in a raw JSON body",
			"mcp__http__http_request",
			true,
			{
				method: "POST",
				url: "https://api.github.com/graphql",
				body: String.raw`{"query":"mutation { \u006dergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }"}`,
			},
		],
		[
			"a gh pr merge command",
			"mcp__desktop_commander__start_process",
			true,
			{ command: "gh pr merge 12 --squash" },
		],
		[
			"a gh pr view command",
			"mcp__desktop_commander__start_process",
			false,
			{ command: "gh pr view 12 --json mergeable" },
		],
		[
			"a PUT on the REST merge path",
			"mcp__forge__call_api",
			true,
			{ method: "PUT", path: "/repos/o/r/pulls/12/merge" },
		],
		[
			"a GET on the REST merge path",
			"mcp__forge__call_api",
			false,
			{ method: "GET", path: "/repos/o/r/pulls/12/merge" },
		],
		[
			"a PUT on another PR path",
			"mcp__forge__call_api",
			false,
			{ method: "PUT", path: "/repos/o/r/pulls/12/requested_reviewers" },
		],
	] as const)(
		"[control:sg-mcp-input] %s in the input of %s is denied: %p",
		(_, tool, denied, input) => {
			expect(mcpVerdict(tool, input)).toEqual(
				denied ? MCP_DENY : { kind: "allow" },
			);
		},
	);
});

describe("the GitHub read", () => {
	const view = {
		number: 12,
		url: "https://github.com/o/r/pull/12",
		title: "t",
		body: "b",
		baseRefName: "v2",
		headRefOid: HEAD,
	};
	const PROFILE_BLOB = {
		text: JSON.stringify({ merge: { standingBases: ["v2"] } }),
		isBinary: false,
		isTruncated: false,
	};
	const graph = (
		state: string | null,
		threads: boolean[],
		object: unknown = PROFILE_BLOB,
		baseOid: string | null = BASE_TIP,
	) => ({
		data: {
			repository: {
				object,
				pullRequest: {
					baseRef: { target: { oid: baseOid } },
					reviewThreads: {
						pageInfo: { hasNextPage: false },
						nodes: threads.map((isResolved) => ({ isResolved })),
					},
					commits: {
						nodes: [
							{
								commit: {
									oid: HEAD,
									statusCheckRollup: state === null ? null : { state },
								},
							},
						],
					},
				},
			},
		},
	});

	test("counts open threads and maps the rollup state", () => {
		expect(pullRequestFrom(view, graph("SUCCESS", [true, false]))).toEqual({
			number: 12,
			url: "https://github.com/o/r/pull/12",
			title: "t",
			body: "b",
			base: "v2",
			head: HEAD,
			openThreads: 1,
			threadsListed: true,
			checks: "success",
			checkedHead: HEAD,
			authority: committed({ standingBases: ["v2"] }),
		});
		expect(pullRequestFrom(view, graph("EXPECTED", []))?.checks).toBe(
			"pending",
		);
		expect(pullRequestFrom(view, graph("ERROR", []))?.checks).toBe("failure");
		expect(pullRequestFrom(view, graph(null, []))?.checks).toBe("none");
	});

	test("a reply of the wrong shape gives no state", () => {
		expect(pullRequestFrom(view, { data: null })).toBeUndefined();
		expect(pullRequestFrom({}, graph("SUCCESS", []))).toBeUndefined();
		expect(
			pullRequestFrom(
				{ ...view, baseRefName: undefined },
				graph("SUCCESS", []),
			),
		).toBeUndefined();
	});

	test.each([
		["an absent file", null, BASE_TIP, { kind: "absent", commit: BASE_TIP }],
		[
			"a file that is not JSON",
			{ ...PROFILE_BLOB, text: "{" },
			BASE_TIP,
			{
				kind: "unread",
				reason: ".astack/profile.json at 9f3c1a2 is not valid JSON",
			},
		],
		[
			"a truncated file",
			{ ...PROFILE_BLOB, isTruncated: true },
			BASE_TIP,
			{
				kind: "unread",
				reason: ".astack/profile.json at 9f3c1a2 is not a readable text file",
			},
		],
		[
			"a tree",
			{},
			BASE_TIP,
			{
				kind: "unread",
				reason: ".astack/profile.json at 9f3c1a2 is not a readable text file",
			},
		],
		[
			"no base commit",
			PROFILE_BLOB,
			null,
			{
				kind: "unread",
				reason: "the PR read gives no commit for the base branch v2",
			},
		],
	] as const)(
		"[control:sg-base-authority] %s at the base tip gives the authority %p",
		(_, object, baseOid, authority) => {
			expect(
				pullRequestFrom(view, graph("SUCCESS", [], object, baseOid))?.authority,
			).toEqual(authority);
		},
	);

	test("reads the PR through gh view and gh api graphql", () => {
		const bin = join(root, "bin");
		mkdirSync(bin, { recursive: true });
		writeFileSync(join(root, "view.json"), JSON.stringify(view));
		writeFileSync(
			join(root, "graph.json"),
			JSON.stringify(graph("SUCCESS", [true])),
		);
		writeFileSync(
			join(bin, "gh"),
			`#!/bin/sh\necho "$@" >> "${root}/gh.log"\nif [ "$1" = pr ]; then cat "${root}/view.json"; else cat "${root}/graph.json"; fi\n`,
		);
		chmodSync(join(bin, "gh"), 0o755);
		const path = process.env.PATH;
		process.env.PATH = `${bin}:${path}`;
		try {
			const pr = readPullRequestWithGh({
				selector: "12",
				repo: "o/r",
				dir: project,
			});
			expect(pr?.checks).toBe("success");
			expect(pr?.openThreads).toBe(0);
		} finally {
			process.env.PATH = path;
		}
		const log = spawnSync("cat", [join(root, "gh.log")], {
			encoding: "utf8",
		}).stdout;
		expect(log).toContain(
			"pr view 12 --repo o/r --json number,url,title,body,baseRefName,headRefOid",
		);
		expect(log).toContain(
			"owner=o -f name=r -F number=12 -f profile=refs/heads/v2:.astack/profile.json",
		);
	});
});
