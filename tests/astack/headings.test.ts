import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	detectTicketKind,
	emailAddresses,
	issueHeadings,
	issueTemplates,
	markdownHeadings,
	missingHeadings,
	PR_HEADINGS,
	prHeadings,
	requiredHeadings,
	TICKET_HEADINGS,
	templateNamed,
} from "../../src/astack/headings.ts";
import { commandWords, parseShell } from "../../src/astack/shell.ts";

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

const BUG = `## Summary
Import drops rows with a trailing comma.
## Environment
staging, web, commit abc123
## Steps to reproduce
1. Upload the sample file.
## Expected
All rows import.
## Actual
Two rows are missing.
## Acceptance criteria
- [ ] A regression test fails before the fix and passes after.
`;

describe("markdown headings", () => {
	test("reads ATX and bold headings, skipping fences, comments and front matter", () => {
		const markdown = [
			"---",
			"name: Bug",
			"---",
			"# Title",
			"## Why ##",
			"**Risk and rollback**",
			"<!-- ## Hidden -->",
			"```",
			"## In a fence",
			"```",
			"   ### Indented",
		].join("\n");
		expect(markdownHeadings(markdown)).toEqual([
			"Title",
			"Why",
			"Risk and rollback",
			"Indented",
		]);
	});

	test("matches headings by normalized words and allows a suffix", () => {
		const body =
			"## why\n## What changes:\n## Verification (all gates)\n## Risk & rollback\n";
		expect(missingHeadings(body, PR_HEADINGS)).toEqual([]);
		expect(missingHeadings("## Why\n", PR_HEADINGS)).toEqual([
			"What changes",
			"Verification",
			"Risk and rollback",
		]);
	});

	test("optional template headings are not required", () => {
		expect(
			requiredHeadings(
				"## Why\n## Deploy notes (if any)\n## Constraints (optional)\n",
			),
		).toEqual(["Why"]);
	});
});

describe("tickets", () => {
	test("complete feature and bug tickets pass", () => {
		expect(missingHeadings(FEATURE, TICKET_HEADINGS.feature)).toEqual([]);
		expect(missingHeadings(BUG, TICKET_HEADINGS.bug)).toEqual([]);
	});

	test("detects bugs from labels, headings and title", () => {
		expect(detectTicketKind({ body: BUG })).toBe("bug");
		expect(detectTicketKind({ body: "", labels: ["Bug"] })).toBe("bug");
		expect(
			detectTicketKind({
				body: "",
				title: "Regression: export crashes on empty reports",
			}),
		).toBe("bug");
		expect(
			detectTicketKind({
				body: FEATURE,
				title: "Operators can export reports",
			}),
		).toBe("feature");
	});

	test("finds email addresses and ignores placeholders", () => {
		expect(
			emailAddresses(
				"Reported by jane.doe@customer.co.uk and ops@example.com, noreply@vendor.dev",
			),
		).toEqual(["j***@customer.co.uk"]);
	});
});

describe("repo templates", () => {
	let root = "";
	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "astack-templates-"));
		mkdirSync(join(root, ".github/ISSUE_TEMPLATE"), { recursive: true });
		writeFileSync(
			join(root, ".github/PULL_REQUEST_TEMPLATE.md"),
			"## Summary\n## Test plan\n## Notes (optional)\n",
		);
		writeFileSync(
			join(root, ".github/ISSUE_TEMPLATE/bug_report.md"),
			"---\nname: Bug report\nlabels: [bug]\n---\n## What happened\n## How to reproduce\n",
		);
		writeFileSync(
			join(root, ".github/ISSUE_TEMPLATE/feature.md"),
			"---\nname: Feature request\nlabels:\n  - enhancement\n---\n## Need\n## Proposal\n",
		);
	});
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	test("PR headings come from the repo template when present", () => {
		expect(prHeadings(root)).toEqual({
			source: ".github/PULL_REQUEST_TEMPLATE.md",
			headings: ["Summary", "Test plan"],
		});
		expect(prHeadings(undefined).headings).toEqual(PR_HEADINGS);
	});

	test("issue headings pick the template for the detected kind", () => {
		expect(issueHeadings(root, "bug").headings).toEqual([
			"What happened",
			"How to reproduce",
		]);
		expect(issueHeadings(root, "feature").headings).toEqual([
			"Need",
			"Proposal",
		]);
		expect(
			templateNamed(issueTemplates(root), "Feature request")?.headings,
		).toEqual(["Need", "Proposal"]);
		expect(templateNamed(issueTemplates(root), "feature.md")?.path).toBe(
			".github/ISSUE_TEMPLATE/feature.md",
		);
		expect(templateNamed(issueTemplates(root), "Question")).toBeUndefined();
		expect(issueHeadings(undefined, "bug").headings).toEqual(
			TICKET_HEADINGS.bug,
		);
	});

	test("a lone template applies only to its own kind, or to every kind when it names none", () => {
		const lone = mkdtempSync(join(tmpdir(), "astack-lone-template-"));
		try {
			mkdirSync(join(lone, ".github/ISSUE_TEMPLATE"), { recursive: true });
			writeFileSync(
				join(lone, ".github/ISSUE_TEMPLATE/bug_report.md"),
				"---\nname: Bug report\n---\n## What happened\n",
			);
			expect(issueHeadings(lone, "bug").headings).toEqual(["What happened"]);
			expect(issueHeadings(lone, "feature")).toEqual({
				source: "the feature ticket standard",
				headings: TICKET_HEADINGS.feature,
			});
			rmSync(join(lone, ".github/ISSUE_TEMPLATE"), { recursive: true });
			writeFileSync(
				join(lone, ".github/ISSUE_TEMPLATE.md"),
				"## Context\n## Details\n",
			);
			expect(issueHeadings(lone, "bug").headings).toEqual([
				"Context",
				"Details",
			]);
			expect(issueHeadings(lone, "feature").headings).toEqual([
				"Context",
				"Details",
			]);
		} finally {
			rmSync(lone, { recursive: true, force: true });
		}
	});
});

describe("shell parsing", () => {
	test("splits commands and removes quotes", () => {
		const commands = parseShell(
			`cd repo && git add 'a b.ts' "c.ts" ; FOO=1 git commit -m "msg"`,
		);
		expect(
			commands.map((command) => command.words.map((word) => word.value)),
		).toEqual([
			["cd", "repo"],
			["git", "add", "a b.ts", "c.ts"],
			["FOO=1", "git", "commit", "-m", "msg"],
		]);
		expect(
			commandWords(
				commands[2] ?? { words: [], stdin: undefined, redirects: [] },
			).map((word) => word.value),
		).toEqual(["git", "commit", "-m", "msg"]);
	});

	test("reads a heredoc body passed through $(cat <<'EOF' ...)", () => {
		const command = `gh pr create --title "Fix" --body "$(cat <<'EOF'\n## Why\nBecause.\n\n## What changes\nA thing.\nEOF\n)"`;
		const [gh] = parseShell(command);
		const body = gh?.words[6];
		expect(body).toEqual({
			value: "## Why\nBecause.\n\n## What changes\nA thing.",
			dynamic: false,
		});
	});

	test("reads a heredoc on stdin and marks variables as dynamic", () => {
		const [gh] = parseShell(
			"gh issue create --title T --body-file - <<'EOF'\n## Summary\nx\nEOF\n",
		);
		expect(gh?.stdin).toBe("## Summary\nx");
		const [echo] = parseShell('gh pr create --body "$BODY"');
		expect(echo?.words[4]?.dynamic).toBe(true);
	});

	test("drops redirections and keeps $'...' escapes", () => {
		const [command] = parseShell(
			"gh pr create --body $'## Why\\nok' 2>&1 > out.txt",
		);
		expect(command?.words.map((word) => word.value)).toEqual([
			"gh",
			"pr",
			"create",
			"--body",
			"## Why\nok",
		]);
	});
});
