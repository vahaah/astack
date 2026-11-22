import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decisionSpan } from "../../src/astack/adr.ts";
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
