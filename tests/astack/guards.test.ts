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

function git(dir: string, ...args: string[]): void {
	spawnSync("git", args, { cwd: dir });
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "astack-guards-"));
	repo = join(root, "repo");
	mkdirSync(repo);
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.email", "t@example.com");
	git(repo, "config", "user.name", "T");
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

function shell(command: string): HookEvent {
	return { kind: "shell", command, cwd: repo };
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
