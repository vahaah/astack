import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context, Verdict } from "../../src/astack/hook/events.ts";
import { handler } from "../../src/astack/hook/handlers/pr-body.ts";

const HEADINGS =
	"## Why\nA reason.\n\n## What changes\nA change.\n\n## Verification\nTests.\n\n## Risk and rollback\nRevert.";

let root = "";
let strict = "";
let loose = "";

function repo(dir: string, profile: unknown): void {
	mkdirSync(join(dir, ".astack"), { recursive: true });
	spawnSync("git", ["init", "-q"], { cwd: dir });
	writeFileSync(join(dir, ".astack/profile.json"), JSON.stringify(profile));
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "astack-pr-body-"));
	strict = join(root, "strict");
	loose = join(root, "loose");
	repo(strict, { tracker: { kind: "linear", requirePartOf: true } });
	repo(loose, { tracker: { kind: "linear", requirePartOf: false } });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(command: string, cwd: string): Verdict {
	const context: Context = {
		tool: "claude-code",
		event: "PreToolUse",
		cwd,
		projectDir: undefined,
		env: {},
		today: "2026-10-16",
	};
	return handler.run({ kind: "shell", command, cwd }, context);
}

function create(body: string, cwd: string, extra = ""): Verdict {
	return run(`gh pr create --title t ${extra}--body '${body}'`, cwd);
}

function reason(verdict: Verdict): string {
	return verdict.kind === "deny" ? verdict.reason : "";
}

describe("the Part of line", () => {
	test("a repo that sets requirePartOf denies a body without it", () => {
		const verdict = create(HEADINGS, strict);
		expect(verdict.kind).toBe("deny");
		expect(reason(verdict)).toContain("astack blocked gh pr create:");
		expect(reason(verdict)).toContain('must be "Part of <key>"');
	});

	test("one line can name several tickets", () => {
		expect(create(`Part of ABC-327, ABC-331\n\n${HEADINGS}`, strict)).toEqual({
			kind: "allow",
		});
	});

	test("a repo that does not set requirePartOf needs no Part of line", () => {
		expect(create(HEADINGS, loose)).toEqual({ kind: "allow" });
	});

	test("a PR for another repo skips the Part of line of this repo", () => {
		expect(create(HEADINGS, strict, "--repo o/r ")).toEqual({ kind: "allow" });
	});
});

describe("closing words", () => {
	test("a closing word before a key is denied in every repo", () => {
		const verdict = create(`Closes ABC-12\n\n${HEADINGS}`, loose);
		expect(reason(verdict)).toContain('Body line 1 has "Closes ABC-12"');
	});

	test("a closing word with no key passes", () => {
		expect(
			create(`Closes the open defect ledger.\n\n${HEADINGS}`, loose),
		).toEqual({ kind: "allow" });
	});

	test("gh pr edit is checked for its body and its title", () => {
		expect(reason(run("gh pr edit 12 --body 'Fixes #3'", loose))).toContain(
			"astack blocked gh pr edit:",
		);
		expect(
			reason(run("gh pr edit 12 --title 'fix: closes #3'", loose)),
		).toContain('The title has "closes #3"');
		expect(run("gh pr edit 12 --add-label x", loose)).toEqual({
			kind: "allow",
		});
	});

	test("missing headings and a closing word give one deny with both", () => {
		const text = reason(create("Fixes #4", loose));
		expect(text).toContain("the body is missing Why");
		expect(text).toContain('Body line 1 has "Fixes #4"');
	});
});

describe("the GitHub MCP PR tools", () => {
	function mcp(tool: string, input: unknown, cwd: string): Verdict {
		const context: Context = {
			tool: "claude-code",
			event: "PreToolUse",
			cwd,
			projectDir: cwd,
			env: {},
			today: "2026-10-16",
		};
		return handler.run(
			{ kind: "mcp", server: "plugin_github_github", tool, input },
			context,
		);
	}

	test("create_pull_request gets the link and heading rules of the repo", () => {
		spawnSync(
			"git",
			["remote", "add", "origin", "git@github.com:acme/shop.git"],
			{
				cwd: strict,
			},
		);
		const verdict = mcp(
			"create_pull_request",
			{
				owner: "acme",
				repo: "shop",
				title: "Speed up the page",
				body: "## Why\n\nThe page is slow. Closes ABC-12.",
			},
			strict,
		);
		expect(verdict.kind).toBe("deny");
		expect(reason(verdict)).toContain('must be "Part of <key>"');
		expect(reason(verdict)).toContain('"Closes ABC-12"');
		expect(reason(verdict)).toContain("is missing");
	});

	test("update_pull_request denies a closing word, and another repo only gets heading advice", () => {
		expect(
			reason(
				mcp(
					"update_pull_request",
					{ owner: "acme", repo: "shop", pullNumber: 3, body: "Fixes #40" },
					strict,
				),
			),
		).toContain('"Fixes #40"');
		const foreign = mcp(
			"create_pull_request",
			{ owner: "other", repo: "lib", title: "Add a flag", body: "Part of X-1" },
			strict,
		);
		expect(foreign.kind).toBe("note");
	});
});
