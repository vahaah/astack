import { describe, expect, test } from "bun:test";
import { managedLineCitations } from "../../scripts/lib/line-citations.ts";

const managed = [
	".astack/profile.json",
	".claude/pr-review-hardening.profile.md",
	".claude/rules/standards/coding.md",
];

const stale = (path: string, line: number, cited: string) =>
	`${path}:${line} cites ${cited}, a line of a file that apply writes. Each apply update can move that line, so the citation goes stale. Cite the file with no line number, and quote its words or name its heading.`;

describe("managedLineCitations", () => {
	test("a doc of the repo that cites a line of a file that apply writes is stale on the next update", () => {
		expect(
			managedLineCitations(
				[
					{
						path: "docs/adr/0025-comments.md",
						text: [
							"# Comments",
							"",
							"| Rule | Source |",
							"| The two-line limit | `.claude/rules/standards/coding.md:39` |",
						].join("\n"),
					},
					{
						path: "README.md",
						text: "Start the stack as `.claude/pr-review-hardening.profile.md:391` says.\n",
					},
				],
				managed,
			),
		).toEqual([
			stale(
				"docs/adr/0025-comments.md",
				4,
				".claude/rules/standards/coding.md:39",
			),
			stale("README.md", 1, ".claude/pr-review-hardening.profile.md:391"),
		]);
	});

	test.each([
		[
			"a citation of a file that apply writes with no line number",
			"docs/a.md",
			"See `.claude/rules/standards/coding.md`, heading Comments.",
		],
		[
			"a line citation of a file that apply does not write",
			"docs/a.md",
			"ADR 0010 allows it (`docs/adr/0010-adr-process.md:69`).",
		],
		[
			"a line citation of another file whose path ends with a managed path",
			"docs/a.md",
			"See `vendor/.astack/profile.json:3`.",
		],
		[
			"a file that apply writes, which the next update writes again",
			".claude/rules/standards/coding.md",
			"See `.claude/pr-review-hardening.profile.md:12`.",
		],
	])("passes %s", (_, path, text) => {
		expect(managedLineCitations([{ path, text }], managed)).toEqual([]);
	});
});
