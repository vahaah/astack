import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AdrFolder,
	adrStatus,
	amendProblems,
	decisionSpan,
} from "../../src/astack/adr.ts";
import { checkPlan } from "../../src/astack/plan/check.ts";
import { checkEnv } from "../../src/astack/plan/files.ts";
import { parsePlan } from "../../src/astack/plan/parse.ts";
import { DEFAULT_PLAN_PROFILE } from "../../src/astack/profile.ts";
import { fixture, REPO } from "./plan-helpers.ts";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const EXPORT = "docs/plans/member-export.md";

const ADR = [
	"# 0021 Example",
	"",
	"Status: Accepted",
	"",
	"### D1 — Long dash title",
	"",
	"### D2.",
	"",
	"### D3. Full stop title",
	"",
	"```text",
	"### D9. Fenced example",
	"```",
	"",
].join("\n");

test("[control:adr-heading] check-plan reads ADR decision headings as change proof reads them", () => {
	const root = mkdtempSync(join(tmpdir(), "astack-adr-"));
	dirs.push(root);
	mkdirSync(join(root, "docs/adr"), { recursive: true });
	writeFileSync(join(root, "docs/adr/0021-example.md"), ADR);
	const text = fixture(`repo/${EXPORT}`).replace(
		"## Scope",
		"Cites ADR 0021 D1, ADR 0021 D2, ADR 0021 D3 and ADR 0021 D9.\n\n## Scope",
	);
	const env = checkEnv({
		root,
		config: DEFAULT_PLAN_PROFILE,
		slug: "member-export",
		today: "2026-10-16",
		trail: false,
	});
	expect(
		checkPlan(parsePlan(join(REPO, EXPORT), text), env)
			.map((finding) => finding.message)
			.filter((message) => message.includes("ADR 0021")),
	).toEqual([
		"ADR 0021 D2: ADR 0021 has no ### D2. heading",
		"ADR 0021 D9: ADR 0021 has no ### D9. heading",
	]);
});

test.each<[string, string, string | undefined]>([
	[
		"D1",
		"a span ends at the next decision heading and keeps a heading that is no decision",
		"\n### D2.\n\n",
	],
	[
		"D3",
		"a fenced decision heading does not end a span",
		"\n```text\n### D9. Fenced example\n```\n",
	],
	["D7", "a missing decision has no span", undefined],
])("[control:cp-adr-span] the span of %s: %s", (decision, _name, span) => {
	expect(decisionSpan(ADR, decision)).toBe(span);
});

test.each<[string, string, ReturnType<typeof adrStatus>]>([
	[
		"an owner stamp after a middle dot",
		"Status: Accepted · owner",
		{
			ok: true,
			value: {
				lifecycle: { kind: "Accepted" },
				text: "Accepted · owner",
				line: 3,
			},
		},
	],
	[
		"the bold form of a superseded ADR",
		"- **Status:** Superseded by 0008",
		{
			ok: true,
			value: {
				lifecycle: { kind: "Superseded", by: "0008" },
				text: "Superseded by 0008",
				line: 3,
			},
		},
	],
	[
		"two Status lines",
		"Status: Accepted\n- **Status:** Proposed",
		{ ok: false, error: { kind: "multiple", lines: [3, 4] } },
	],
	[
		"a Status line only in a fence",
		"```text\nStatus: Accepted\n```",
		{ ok: false, error: { kind: "missing" } },
	],
	[
		"a status word that no lifecycle has",
		"Status: AcceptedWhatever",
		{
			ok: false,
			error: { kind: "unknown", text: "AcceptedWhatever", line: 3 },
		},
	],
])("[control:adr-status] adrStatus reads %s", (_name, line, status) => {
	expect(adrStatus(`# 0001. Gate\n\n${line}\n\n### D1. Gate\n`)).toEqual(
		status,
	);
});

const BASE = [
	"# 0005. Every change carries proof",
	"",
	"Status: Accepted",
	"Date: 2026-11-03",
	"Supersedes: none",
	"",
	"## Decisions",
	"",
	"### D1. One gate admits each change",
	"",
	"The gate admits a change.",
	"",
	"```text",
	"parse >=> admit",
	"```",
	"",
	"### D3. Each run is fresh",
	"",
	"#### Category composition",
	"",
	"The arrows use one error type.",
	"",
	"### D4. Adoption keeps review",
	"",
	"Review stays required.",
	"Remote settings stay an owner action.",
	"",
	"## Consequences",
	"",
	"- Each change runs the gate.",
	"",
	"## Invariant audit",
	"",
	"| Invariant | Class |",
	"|---|---|",
	"| `AdmitSafe` | restates |",
	"",
].join("\n");

const ADR_PATH = "docs/adr/0005-every-change-carries-proof.md";

function folder(text: string | undefined): AdrFolder {
	return {
		files: text === undefined ? [] : [{ path: ADR_PATH, text }],
		index: undefined,
	};
}

function insertAfter(
	text: string,
	anchor: string,
	lines: readonly string[],
): string {
	const all = text.split("\n");
	const at = all.indexOf(anchor);
	if (at < 0) throw new Error(`the fixture has no line ${anchor}`);
	return [...all.slice(0, at + 1), ...lines, ...all.slice(at + 1)].join("\n");
}

test("[control:adr-amend-pr17] the PR #17 edit fails at each plain line that it adds to D4, and its Category composition lines pass", () => {
	const head = insertAfter(
		insertAfter(BASE, "The arrows use one error type.", [
			"The classifier maps a proof to paths.",
			"It adds no operator.",
			"",
		]),
		"Remote settings stay an owner action.",
		[
			"The CI classifier can admit the manifest.",
			"It checks the base and the file form.",
			"All other changes stay blocked.",
		],
	);
	expect(amendProblems(folder(BASE), folder(head))).toEqual(
		[30, 31, 32].map((line) => ({
			file: ADR_PATH,
			line,
			message:
				"ADR 0005 is Accepted at the base, so it changes only by a dated > Note or > Amended block, a status line or its Amended by: line",
		})),
	);
});

test.each<[string, (text: string) => string | undefined, number[]]>([
	[
		"a changed fenced line of D1",
		(text) => text.replace("parse >=> admit", "parse >=> check >=> admit"),
		[14],
	],
	[
		"an added fenced line of D1",
		(text) => insertAfter(text, "parse >=> admit", ["admit >=> report"]),
		[15],
	],
	[
		"an added Verification heading with a line under D3",
		(text) =>
			insertAfter(text, "The arrows use one error type.", [
				"",
				"#### Verification",
				"",
				"A control runs the arrows.",
			]),
		[23, 25],
	],
	[
		"a removed plain line",
		(text) => text.replace("Review stays required.\n", ""),
		[25],
	],
	[
		"a dated block with a day before the Date: line",
		(text) =>
			insertAfter(text, "Review stays required.", [
				"",
				"> Note 2026-11-02: The rule moved.",
			]),
		[27],
	],
	[
		"a dated block with a day that no calendar has",
		(text) =>
			insertAfter(text, "Review stays required.", [
				"",
				"> Amended 2026-11-31: The rule moved.",
			]),
		[27],
	],
	["a deleted file", () => undefined, [1]],
	[
		"a dated block, a new status and a changed Category composition line",
		(text) =>
			insertAfter(
				text
					.replace("Status: Accepted", "Status: Superseded by 0031")
					.replace("one error type", "one error type and one map"),
				"Remote settings stay an owner action.",
				["", "> Note 2026-11-23: The rule moved.", "> ADR 0031 holds it."],
			),
		[],
	],
	[
		"an Amended by: line and a removed Category composition span",
		(text) =>
			insertAfter(
				text.replace(
					"#### Category composition\n\nThe arrows use one error type.\n\n",
					"",
				),
				"Supersedes: none",
				["Amended by: 0031 D2"],
			),
		[],
	],
	[
		"a Status line moved into a decision",
		(text) =>
			insertAfter(
				text.replace("Status: Accepted\n", ""),
				"Review stays required.",
				["Status: Deprecated · review is gone"],
			),
		[25],
	],
	[
		"a decision appended after the Invariant audit table",
		(text) =>
			insertAfter(text, "| `AdmitSafe` | restates |", [
				"",
				"### D9. Each PR merges with no review",
				"",
				"A PR merges when CI is green.",
			]),
		[38, 40],
	],
	[
		"an Amended by: line in the body of a decision",
		(text) =>
			insertAfter(text, "Review stays required.", [
				"Amended by: 0011 the gate now admits a change with no review.",
			]),
		[26],
	],
	[
		"a changed Invariant audit row",
		(text) => text.replace("| restates |", "| independent |"),
		[],
	],
])("[control:adr-amend-cases] %s", (_name, edit, lines) => {
	expect(
		amendProblems(folder(BASE), folder(edit(BASE))).map(
			(problem) => problem.line,
		),
	).toEqual(lines);
});

test("[control:adr-amend-audit] a new Invariant audit part passes, because model-audit.test.ts asks for it in the first record of each model", () => {
	const noAudit = BASE.slice(0, BASE.indexOf("\n## Invariant audit"));
	expect(amendProblems(folder(noAudit), folder(BASE))).toEqual([]);
});

test("[control:adr-amend-proposed] an ADR that is Proposed at the base changes freely", () => {
	const proposed = BASE.replace("Status: Accepted", "Status: Proposed");
	expect(
		amendProblems(
			folder(proposed),
			folder(proposed.replace("Review stays required.", "Review is gone.")),
		),
	).toEqual([]);
});
