import { describe, expect, test } from "bun:test";
import {
	closingRefs,
	linkFindings,
	partOf,
} from "../../src/astack/pr/links.ts";

describe("closing words", () => {
	test.each([
		["Closes #12", "#12"],
		["fixes ABC-123 for admins", "ABC-123"],
		["Resolves: owner/repo#4", "owner/repo#4"],
		[
			"closes https://github.com/o/r/issues/9",
			"https://github.com/o/r/issues/9",
		],
		["Fixed ABC-12 in the export", "ABC-12"],
		["Completes ABC2-21", "ABC2-21"],
	])("%p names %p", (text, ref) => {
		expect(closingRefs(text).map((found) => found.ref)).toEqual([ref]);
	});

	test.each([
		"Closes the open defect ledger",
		"Closes the UVT-001 field report",
		"Fixes UTF-8 decoding in the importer",
		"fixes abc-1 in lower case",
		"The fix closes nothing",
		"Write `Closes #12` only in an example",
		"```\nCloses #12\n```",
	])("%p closes no ticket", (text) => {
		expect(closingRefs(text)).toEqual([]);
	});

	test("each match gives its line number", () => {
		expect(closingRefs("Part of ABC-1\n\nFixes #4")).toEqual([
			{ line: 3, phrase: "Fixes #4", ref: "#4" },
		]);
	});
});

describe("the Part of line", () => {
	test.each([
		["Part of ABC-327", ["ABC-327"]],
		["Part of ABC-327, ABC-331", ["ABC-327", "ABC-331"]],
		["\n\nPart of ABC-1 and ABC-2.", ["ABC-1", "ABC-2"]],
		["Part of #124", ["#124"]],
		["part of o/r#3, #4", ["o/r#3", "#4"]],
	])("%p is found", (body, refs) => {
		expect(partOf(body)).toEqual({ kind: "found", refs });
	});

	test("a Part of line with no key is malformed", () => {
		expect(partOf("Part of the export work\n")).toEqual({
			kind: "malformed",
			firstLine: "Part of the export work",
		});
	});

	test("a body that starts with a heading has no Part of line", () => {
		expect(partOf("## Why\nx")).toEqual({
			kind: "missing",
			firstLine: "## Why",
		});
		expect(partOf("")).toEqual({ kind: "missing", firstLine: undefined });
	});
});

describe("link findings", () => {
	const body = "## Why\nA reason.";

	test("Part of is required only when the profile asks for it", () => {
		expect(
			linkFindings({ title: "t", body }, { requirePartOf: false }),
		).toEqual([]);
		const [finding] = linkFindings(
			{ title: "t", body },
			{ requirePartOf: true },
		);
		expect(finding).toContain('must be "Part of <key>"');
		expect(finding).toContain('The first line is "## Why"');
	});

	test("a closing word with a key fails in the title and in the body", () => {
		const findings = linkFindings(
			{ title: "fix: closes #3", body: "Part of ABC-1\n\nFixes ABC-2" },
			{ requirePartOf: true },
		);
		expect(findings).toHaveLength(2);
		expect(findings[0]).toContain('The title has "closes #3"');
		expect(findings[1]).toContain('Body line 3 has "Fixes ABC-2"');
		expect(findings[1]).toContain('Write "Part of ABC-2" instead');
	});
});
