import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	Context,
	HookEvent,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { duplicatePr } from "../../src/astack/hook/handlers/duplicate-pr.ts";
import { type OpenPr, openPrsFrom } from "../../src/astack/pr/open.ts";
import {
	loadSessionPrs,
	sessionStore,
} from "../../src/astack/pr/session-prs.ts";

let root = "";
let repo = "";
let one = "";
let two = "";
let state = "";

function git(dir: string, ...args: string[]): void {
	spawnSync("git", args, { cwd: dir });
}

function initRepo(dir: string, branch: string): void {
	mkdirSync(dir, { recursive: true });
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "T");
	git(dir, "commit", "-q", "--allow-empty", "-m", "base");
	git(dir, "remote", "add", "origin", "https://github.com/o/r.git");
	git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
	git(
		dir,
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
		"refs/remotes/origin/main",
	);
	git(dir, "checkout", "-q", "-b", branch);
}

beforeAll(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "astack-duplicate-pr-")));
	repo = join(root, "repo");
	initRepo(repo, "dev/abc-1/export");
	one = join(root, "one");
	initRepo(one, "dev/one");
	two = join(root, "two");
	git(one, "worktree", "add", "-q", "-b", "dev/four", two);
	state = join(root, "state");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function context(cwd: string, session?: string): Context {
	return {
		tool: "claude-code",
		event: "PreToolUse",
		cwd,
		projectDir: cwd,
		env: { ASTACK_STATE_DIR: state },
		today: "2026-11-23",
		...(session === undefined ? {} : { session }),
	};
}

function shell(command: string, cwd = repo): HookEvent {
	return { kind: "shell", command, cwd };
}

function reason(verdict: Verdict): string {
	return verdict.kind === "deny" ? verdict.reason : "";
}

describe("the duplicate PR guard", () => {
	const open: readonly OpenPr[] = [
		{
			number: 12,
			url: "https://github.com/o/r/pull/12",
			head: "dev/abc-1/export",
			title: "Stream the export",
			body: "Part of ABC-1, ABC-2\n\n## Why\nx",
		},
	];

	function run(event: HookEvent, list = open): Verdict {
		return duplicatePr(() => list).run(event, context(repo));
	}

	test("a second PR for the same branch is denied", () => {
		const verdict = run(
			shell('gh pr create --title "Add x" --body "Part of ABC-9"'),
		);
		expect(reason(verdict)).toContain(
			"#12 (https://github.com/o/r/pull/12) is already open for the branch dev/abc-1/export",
		);
	});

	test("a PR on another branch for a ticket of an open PR is denied", () => {
		const verdict = run(
			shell(
				'gh pr create --head dev/abc-2/fix --title "Fix y" --body "Part of ABC-2"',
			),
		);
		expect(reason(verdict)).toContain("is already open for ABC-2");
	});

	test("a PR for new work passes, and an unreadable list fails open", () => {
		expect(
			run(
				shell(
					'gh pr create --head dev/abc-3/new --title "New" --body "Part of ABC-3"',
				),
			).kind,
		).toBe("allow");
		expect(
			duplicatePr(() => undefined).run(
				shell('gh pr create --title "x" --body "Part of ABC-1"'),
				context(repo),
			).kind,
		).toBe("allow");
	});

	test("the GitHub MCP create tool gets the same check", () => {
		const verdict = run({
			kind: "mcp",
			server: "plugin_github_github",
			tool: "create_pull_request",
			input: {
				owner: "o",
				repo: "r",
				head: "dev/abc-1/export",
				title: "Again",
				body: "Part of ABC-7",
			},
		});
		expect(reason(verdict)).toContain("already open for the branch");
	});

	test("the gh list reply parses to open PRs", () => {
		expect(
			openPrsFrom([
				{ number: 3, url: "u", headRefName: "b", title: "t", body: "x" },
				{ title: "no number" },
			]),
		).toEqual([{ number: 3, url: "u", head: "b", title: "t", body: "x" }]);
		expect(openPrsFrom({})).toBeUndefined();
	});
});

describe("a second PR of one session and worktree", () => {
	test("[control:duplicate-pr-session] the 3 split forms get the one-PR deny, the 9 split controls pass in order, and a denied create or no session id saves no record", () => {
		const list: OpenPr[] = [];
		const guard = duplicatePr(() => list);
		const create = (cwd: string, session: string | undefined, flags: string) =>
			guard.run(shell(`gh pr create -t x ${flags}`, cwd), context(cwd, session))
				.kind;
		const hostCreate = (session: string, input: unknown) =>
			guard.run(
				{ kind: "mcp", server: "cocode", tool: "pull_request_create", input },
				context(one, session),
			).kind;
		const prompt = (session: string, text: string) =>
			guard.run(
				{ kind: "prompt", text, human: true, session },
				context(one, session),
			).kind;

		const verdicts: [string, string][] = [];
		verdicts.push(["first create", create(one, "s-a", "--head dev/one")]);
		list.push({
			number: 1710,
			url: "https://github.com/o/r/pull/1710",
			head: "dev/one",
			title: "One",
			body: "Part of ABC-1",
		});
		const second = guard.run(
			shell("gh pr create -t x --head dev/two -b notes", one),
			context(one, "s-a"),
		);
		verdicts.push(["second head", second.kind]);
		verdicts.push(["host create", hostCreate("s-a", { head: "dev/two" })]);
		verdicts.push([
			"stacked base",
			create(one, "s-a", "--head dev/two --base dev/one"),
		]);
		verdicts.push([
			"Part of on the stacked base",
			create(one, "s-a", '--head dev/three -B dev/one -b "Part of #1710"'),
		]);
		verdicts.push(["second worktree", create(two, "s-a", "")]);
		verdicts.push([
			"Part of in another session",
			create(one, "s-b", '--head dev/five -b "Part of #1710"'),
		]);
		verdicts.push([
			"Part of a closed PR",
			create(one, "s-b", '--head dev/five -b "Part of #1709"'),
		]);
		prompt("s-a", "Split this work into a second PR.");
		verdicts.push(["after the split", create(one, "s-a", "--head dev/six")]);
		verdicts.push([
			"Part of after the split",
			create(one, "s-a", '--head dev/seven -b "Part of #1710"'),
		]);
		verdicts.push(["new session", create(one, "s-c", "--head dev/eight")]);
		verdicts.push([
			"new session after a failed create",
			create(one, "s-c", "--head dev/nine"),
		]);
		verdicts.push(["no session id", create(one, undefined, "--head dev/ten")]);

		expect(reason(second)).toBe(
			[
				"astack blocked gh pr create, because one plan is one PR:",
				"- #1710 (https://github.com/o/r/pull/1710) is open, and this session opened it from this worktree to main. Push to dev/one, or stack this PR on it with --base dev/one.",
				"Open a second PR only when the owner says so.",
			].join("\n"),
		);
		expect(verdicts).toEqual([
			["first create", "allow"],
			["second head", "deny"],
			["host create", "deny"],
			["stacked base", "allow"],
			["Part of on the stacked base", "allow"],
			["second worktree", "allow"],
			["Part of in another session", "deny"],
			["Part of a closed PR", "allow"],
			["after the split", "allow"],
			["Part of after the split", "allow"],
			["new session", "allow"],
			["new session after a failed create", "allow"],
			["no session id", "allow"],
		]);
		const at = (head: string, base = "main", dir = one) => ({
			root: dir,
			repo: "o/r",
			base,
			head,
		});
		expect({
			files: readdirSync(join(state, "pr-sessions")).sort(),
			a: loadSessionPrs(sessionStore({ ASTACK_STATE_DIR: state }, "s-a")),
		}).toEqual({
			files: ["s-a.json", "s-b.json", "s-c.json"],
			a: {
				split: true,
				opens: [
					at("dev/one"),
					at("dev/two", "dev/one"),
					at("dev/three", "dev/one"),
					at("dev/four", "main", two),
					at("dev/six"),
					at("dev/seven"),
				],
			},
		});
	});
});
