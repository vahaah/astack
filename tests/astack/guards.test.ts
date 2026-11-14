import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	Context,
	HookEvent,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { handler as destructive } from "../../src/astack/hook/handlers/destructive.ts";
import { duplicatePr } from "../../src/astack/hook/handlers/duplicate-pr.ts";
import { type OpenPr, openPrsFrom } from "../../src/astack/pr/open.ts";

let root = "";
let repo = "";
let dirty = "";

function git(dir: string, ...args: string[]): void {
	spawnSync("git", args, { cwd: dir });
}

function initRepo(dir: string): void {
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "T");
}

function write(dir: string, files: Readonly<Record<string, string>>): void {
	for (const [path, text] of Object.entries(files))
		writeFileSync(join(dir, path), text);
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "astack-guards-"));
	repo = join(root, "repo");
	mkdirSync(repo);
	initRepo(repo);
	writeFileSync(
		join(repo, "package.json"),
		JSON.stringify({
			scripts: {
				reset: "supabase db reset",
				"db:wipe": "bun ../../tooling/stack/supabase.ts db reset",
				test: "vitest",
			},
		}),
	);
	git(repo, "add", ".");
	git(repo, "commit", "-q", "-m", "base");
	git(repo, "checkout", "-q", "-b", "dev/abc-1/export");

	dirty = join(root, "dirty");
	mkdirSync(join(dirty, "src"), { recursive: true });
	mkdirSync(join(dirty, "docs"));
	initRepo(dirty);
	write(dirty, {
		"notes.txt": "a\n",
		"src/app.ts": "a\n",
		"staged.txt": "a\n",
		"docs/guide.md": "a\n",
	});
	git(dirty, "add", ".");
	git(dirty, "commit", "-q", "-m", "base");
	write(dirty, {
		"notes.txt": "b\n",
		"src/app.ts": "b\n",
		"staged.txt": "b\n",
	});
	git(dirty, "add", "staged.txt");
	write(dirty, { "scratch.txt": "x\n" });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function context(cwd: string): Context {
	return {
		tool: "claude-code",
		event: "PreToolUse",
		cwd,
		projectDir: cwd,
		env: {},
		today: "2026-10-16",
	};
}

function shell(command: string, cwd = repo): HookEvent {
	return { kind: "shell", command, cwd };
}

function reason(verdict: Verdict): string {
	return verdict.kind === "deny" ? verdict.reason : "";
}

describe("the destructive command guard", () => {
	test.each([
		["supabase db reset", "deletes the database data"],
		["npx supabase db reset --linked", "deletes the database data"],
		["bun run reset", "The script reset runs supabase db reset"],
		["pnpm db:wipe", "The script db:wipe runs supabase db reset"],
		["git push --force origin main", "shared branch main"],
		["git push origin +master", "shared branch master"],
		[
			"git push -f origin HEAD:release/2026-10",
			"shared branch release/2026-10",
		],
		['git commit --no-verify --allow-empty -m "Add the parser"', "--no-verify"],
		['git commit -nm "Add the parser"', "--no-verify"],
		["git push --no-verify origin dev/abc-1/export", "--no-verify"],
	])("%s is denied", (command, text) => {
		const verdict = destructive.run(shell(command), context(repo));
		expect(verdict.kind).toBe("deny");
		expect(reason(verdict)).toContain(text);
		expect(reason(verdict)).toContain("owner gate");
	});

	test.each([
		"git push --force-with-lease origin dev/abc-1/export",
		"git push --force",
		"git push origin main",
		"bun run test",
		"supabase db diff",
		'git commit -m "Add the parser"',
		"git commit --amend --no-edit",
	])("%s passes", (command) => {
		expect(destructive.run(shell(command), context(repo)).kind).toBe("allow");
	});

	const tracked = "notes.txt, src/app.ts, staged.txt";
	test.each([
		["git reset --hard", `discards the uncommitted changes in ${tracked}.`],
		["git checkout -f main", `discards the uncommitted changes in ${tracked}.`],
		[
			"git switch --discard-changes main",
			`discards the uncommitted changes in ${tracked}.`,
		],
		[
			"git checkout HEAD -- .",
			`discards the uncommitted changes in ${tracked}.`,
		],
		[
			"git checkout -q .",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		[
			"git restore :/",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		["git restore src", "discards the uncommitted changes in src/app.ts."],
		[
			"git restore *",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		[
			"git checkout -- '*.txt'",
			"discards the uncommitted changes in notes.txt.",
		],
		["git clean -fd", "deletes the untracked files scratch.txt."],
	])(
		"[control:sg-work-loss-denied] %s is denied when it discards uncommitted work",
		(command, text) => {
			const verdict = destructive.run(shell(command, dirty), context(dirty));
			expect(reason(verdict)).toContain(
				`- ${command.replaceAll("'", "")} ${text}`,
			);
			expect(reason(verdict)).toContain("owner gate");
		},
	);

	test.each([
		"git checkout HEAD -- notes.txt",
		"git restore docs",
		"git restore --staged .",
		"git checkout main",
		"git clean -fdn",
		"git clean -fX",
		"git stash",
	])(
		"[control:sg-explicit-discard-passes] %s passes on a dirty tree because it discards no work",
		(command) => {
			expect(destructive.run(shell(command, dirty), context(dirty)).kind).toBe(
				"allow",
			);
		},
	);

	test.each(["git reset --hard", "git checkout HEAD -- .", "git clean -fd"])(
		"[control:sg-clean-tree-passes] %s passes on a clean tree",
		(command) => {
			expect(destructive.run(shell(command), context(repo)).kind).toBe("allow");
		},
	);
});

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
