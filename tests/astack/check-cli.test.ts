import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");

const FEATURE = `## Problem
Operators cannot export a report.

## Outcome
An operator downloads the report.

## Acceptance criteria
- [ ] Given a report, when export is clicked, then a file downloads.

## Scope
In: CSV. Out: PDF.

## Verification
An e2e test downloads the file.
`;

const PR_BODY = "## Why\nx\n## What changes\nx\n## Summary\nx\n";

let repo = "";

interface Run {
	code: number | null;
	out: string;
	err: string;
}

function astack(args: string[], input: string): Run {
	const result = spawnSync(process.execPath, [CLI, ...args], {
		cwd: repo,
		input,
		encoding: "utf8",
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

beforeAll(() => {
	repo = mkdtempSync(join(tmpdir(), "astack-check-"));
	spawnSync("git", ["init", "-q"], { cwd: repo });
	mkdirSync(join(repo, ".github/ISSUE_TEMPLATE"), { recursive: true });
	mkdirSync(join(repo, ".github/PULL_REQUEST_TEMPLATE"), { recursive: true });
	writeFileSync(
		join(repo, ".github/ISSUE_TEMPLATE/feature.md"),
		"---\nname: Feature request\n---\n## Need\n",
	);
	writeFileSync(
		join(repo, ".github/ISSUE_TEMPLATE/bug_report.md"),
		"---\nname: Bug report\nlabels: [bug]\n---\n## What happened\n",
	);
	writeFileSync(
		join(repo, ".github/PULL_REQUEST_TEMPLATE/default.md"),
		"## Summary\n## Test plan\n",
	);
	writeFileSync(
		join(repo, ".github/PULL_REQUEST_TEMPLATE/release.md"),
		"## Summary\n## Rollout\n",
	);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("astack check-ticket", () => {
	test("adds the matching repo template's headings to the astack headings", () => {
		const run = astack(["check-ticket", "-", "--feature"], FEATURE);
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"feature ticket is missing (from .github/ISSUE_TEMPLATE/feature.md): Need\n",
		);
		const passing = astack(
			["check-ticket", "-", "--feature"],
			`${FEATURE}\n## Need\nx\n`,
		);
		expect(passing.code).toBe(0);
		expect(passing.out).toBe(
			"ok: feature ticket has every heading from the feature ticket standard and .github/ISSUE_TEMPLATE/feature.md\n",
		);
	});

	test("--no-template checks the astack headings only", () => {
		const run = astack(["check-ticket", "-", "--no-template"], FEATURE);
		expect(run.code).toBe(0);
		expect(run.out).toBe(
			"ok: feature ticket has every heading from the feature ticket standard\n",
		);
	});

	test("--template picks one template by name and refuses an unknown name", () => {
		const run = astack(
			["check-ticket", "--template", "Bug report", "-", "--feature"],
			FEATURE,
		);
		expect(run.code).toBe(1);
		expect(run.out).toContain(
			"(from .github/ISSUE_TEMPLATE/bug_report.md): What happened",
		);
		const unknown = astack(
			["check-ticket", "-", "--template=Question"],
			FEATURE,
		);
		expect(unknown.code).toBe(2);
		expect(unknown.err).toBe(
			"astack check-ticket: no template named Question. The repo has: Bug report, Feature request.\n",
		);
	});
});

describe("astack check-pr", () => {
	test("with several templates it checks only the headings they share", () => {
		const run = astack(["check-pr", "-"], "## Summary\nx\n");
		expect(run.code).toBe(0);
		expect(run.out).toBe(
			"ok: PR body has every heading from the repo's PR templates\n",
		);
	});

	test("a closing word before a ticket key fails", () => {
		const run = astack(["check-pr", "-"], "## Summary\nFixes #3\n");
		expect(run.code).toBe(1);
		expect(run.out).toContain('PR body: Body line 2 has "Fixes #3".');
		expect(run.out).toContain(
			"ok: PR body has every heading from the repo's PR templates\n",
		);
	});

	test("--template checks every heading of the named template", () => {
		const run = astack(["check-pr", "-", "--template", "release"], PR_BODY);
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"PR body is missing (from .github/PULL_REQUEST_TEMPLATE/release.md): Rollout\n",
		);
		expect(astack(["check-pr", "-", "--template"], PR_BODY).code).toBe(2);
	});
});
