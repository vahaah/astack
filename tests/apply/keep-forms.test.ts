import { describe, expect, test } from "bun:test";
import { unkeptCitations } from "../../scripts/lib/keep-forms.ts";

const schema = {
	path: "packages/db/src/schema.ts",
	text: [
		"export const table = 1;",
		"// Money convention (ADR-0006): integer minor units and an ISO-4217 tag.",
		"export const money = 1;",
	].join("\n"),
};

describe("unkeptCitations", () => {
	test("a hyphenated ADR citation fails with a keep pattern for the spaced spelling only", () => {
		expect(unkeptCitations([schema], ["\\bADR \\d{4}\\b"])).toEqual([
			'packages/db/src/schema.ts:2 `// Money convention (ADR-0006): integer minor units and an ISO-4217 tag.` cites a decision, and the comment hook gives advisory for it with the keep patterns ["\\\\bADR \\\\d{4}\\\\b"]. Add a keep pattern for this spelling to projects/<name>.json and the profile, or change the comment.',
		]);
	});

	test("the same citation passes with a keep pattern for both spellings", () => {
		expect(unkeptCitations([schema], ["\\bADR[- ]\\d{4}\\b"])).toEqual([]);
	});

	test("each citation line of a block, a SQL header and a Source: line goes through the hook", () => {
		const files = [
			{
				path: "packages/db/src/money.ts",
				text: "/**\n * Minor units (ADR 0003 D1).\n * Rounds half to even.\n */\nexport const round = 1;\n",
			},
			{
				path: "supabase/migrations/0001_init.sql",
				text: "-- Context: Billing · ADR-0020 D3\ncreate table t (id int);\n",
			},
			{
				path: "src/limits.ts",
				text: "// Source: D41\nexport const limit = 3;\n",
			},
		];
		expect(
			unkeptCitations(files, ["\\bADR \\d{4}\\b", "^Source: \\S"]).map(
				(problem) => problem.split(" cites")[0],
			),
		).toEqual([
			"supabase/migrations/0001_init.sql:1 `-- Context: Billing · ADR-0020 D3`",
		]);
	});

	test("a comment with no citation, a Source: word inside a sentence and a Markdown file are not citations", () => {
		expect(
			unkeptCitations(
				[
					{
						path: "src/a.ts",
						text: "// Rounds half to even.\n// The Source: header of the file.\nexport const a = 1;\n",
					},
					{ path: "docs/adr.md", text: "See ADR-0006.\n" },
				],
				[],
			),
		).toEqual([]);
	});
});
