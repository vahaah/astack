import { describe, expect, test } from "bun:test";
import {
	commitParagraphs,
	commitSubject,
	detectCommitStyle,
	isTrailer,
	joinList,
	NEUTRAL_WORDS,
	subjectWithRemoval,
	updateSubject,
} from "../../src/astack/commit-style.ts";

const parts = ["the astack profile", "review stub", "flow docs"];

describe("detectCommitStyle", () => {
	test("Conventional Commits with an agents scope give chore(agents)", () => {
		const style = detectCommitStyle([
			"feat(app): add export",
			"fix(api): handle empty rows (#12)",
			"chore(agents): link the repo skills",
			"Release notes for October",
		]);
		expect(style).toEqual({ kind: "conventional", scope: "agents" });
		expect(commitSubject(style, parts, false)).toBe(
			"chore(agents): add the astack profile, review stub and flow docs",
		);
	});

	test("Conventional Commits without a tooling scope give a bare chore", () => {
		const style = detectCommitStyle([
			"feat(kb): archive a knowledge base",
			"Merge pull request #5 from acme/fix-x",
			"Merge branch 'main' into topic",
			"fix(review): compare figures as text",
		]);
		expect(style).toEqual({ kind: "conventional", scope: undefined });
		expect(commitSubject(style, ["the astack profile"], false)).toBe(
			"chore: add the astack profile",
		);
	});

	test("a common prefix before a long dash gives that prefix", () => {
		const style = detectCommitStyle([
			"S0 — the drawer closes after the mail lands (#362)",
			"B12/S4 — the lane step reads the branch (#300)",
			"S0 — the hero draws the arch (#360)",
			"The repo skills are readable from .agents/skills",
		]);
		expect(style).toEqual({ kind: "prefixed", prefix: "S0" });
		expect(
			commitSubject(style, ["the astack profile", "flow docs"], false),
		).toBe("S0 — the repo carries the astack profile and flow docs");
	});

	test("a ticket key before a long dash is not a session tag, so the subject is a plain sentence", () => {
		expect(
			detectCommitStyle([
				"WEB-12 — the drawer closes after the mail lands",
				"WEB-14 — the hero draws the arch",
			]),
		).toEqual({ kind: "plain" });
	});

	test("anything else, or no history, gives a plain sentence", () => {
		expect(detectCommitStyle(["Update readme", "Add login page"])).toEqual({
			kind: "plain",
		});
		expect(detectCommitStyle([])).toEqual({ kind: "plain" });
		expect(
			commitSubject({ kind: "plain" }, ["the astack profile"], false),
		).toBe("Add the astack profile");
	});
});

describe("commit text", () => {
	test("joinList uses commas and a last and", () => {
		expect(joinList([])).toBe("");
		expect(joinList(["a"])).toBe("a");
		expect(joinList(["a", "b", "c"])).toBe("a, b and c");
	});

	test("trailers go in one last paragraph, and only Key: value lines are trailers", () => {
		expect(
			commitParagraphs("chore: add x", ["Body."], ["A-B: c", "D: e f"]),
		).toEqual(["chore: add x", "Body.", "A-B: c\nD: e f"]);
		expect(commitParagraphs("chore: add x", [], [])).toEqual(["chore: add x"]);
		expect(isTrailer("Co-Authored-By: A <a@example.com>")).toBe(true);
		expect(isTrailer("no colon here")).toBe(false);
		expect(isTrailer("Key:missing space")).toBe(false);
	});
});

describe("commitSubject with removals", () => {
	test.each([
		[
			{ kind: "conventional" as const, scope: "agents" },
			"chore(agents): add the astack profile, review stub and flow docs, and remove the files that astack replaces",
		],
		[
			{ kind: "prefixed" as const, prefix: "S0" },
			"S0 — the repo carries the astack profile, review stub and flow docs, and drops the files that astack replaces",
		],
		[
			{ kind: "plain" as const },
			"Add the astack profile, review stub and flow docs, and remove the files that astack replaces",
		],
	])(
		"a create subject names the files that astack replaces in the repo's style %#",
		(style, subject) => {
			expect(commitSubject(style, parts, true)).toBe(subject);
		},
	);

	test.each([
		[
			{ kind: "conventional" as const, scope: "agents" },
			"chore(agents): add the astack agent files, and remove the files that astack replaces",
		],
		[
			{ kind: "prefixed" as const, prefix: "S0" },
			"chore(agents): add the astack agent files, and drops the files that astack replaces",
		],
	])(
		"a subject that the project config fixes still names the files that astack replaces %#",
		(style, subject) => {
			expect(
				subjectWithRemoval("chore(agents): add the astack agent files", style),
			).toBe(subject);
		},
	);

	test("a create commit that only deletes names only the removal", () => {
		expect(commitSubject({ kind: "plain" }, [], true)).toBe(
			"Remove the files that astack replaces",
		);
	});
});

describe("updateSubject", () => {
	test.each([
		[
			{ kind: "conventional" as const, scope: "agents" },
			true,
			"chore(agents): update the astack profile, review stub and flow docs, and remove the files that astack replaces",
		],
		[
			{ kind: "prefixed" as const, prefix: "S0" },
			false,
			"S0 — the repo carries an update of the astack profile, review stub and flow docs",
		],
		[
			{ kind: "plain" as const },
			true,
			"Update the astack profile, review stub and flow docs, and remove the files that astack replaces",
		],
	])(
		"names the updated parts in the repo's style %#",
		(style, removes, subject) => {
			expect(updateSubject(style, parts, removes)).toBe(subject);
		},
	);

	test("names only the removal when nothing else changed", () => {
		expect(
			updateSubject({ kind: "conventional", scope: undefined }, [], true),
		).toBe("chore: remove the files that astack replaces");
		expect(updateSubject({ kind: "prefixed", prefix: "S0" }, [], true)).toBe(
			"S0 — the repo drops the files that astack replaces",
		);
	});
});

describe("the neutral words of a commit", () => {
	const neutralParts = [
		"the agent tooling profile",
		"review stub",
		"agent docs",
	];
	const prefixed = { kind: "prefixed" as const, prefix: "S0" };

	test.each([
		[
			"a create subject",
			commitSubject(prefixed, neutralParts, true, NEUTRAL_WORDS),
			"S0 — the repo carries the agent tooling profile, review stub and agent docs, and drops the files that the agent tooling replaces",
		],
		[
			"an update subject",
			updateSubject(prefixed, neutralParts, true, NEUTRAL_WORDS),
			"S0 — the repo carries an update of the agent tooling profile, review stub and agent docs, and drops the files that the agent tooling replaces",
		],
		[
			"a subject of the project config",
			subjectWithRemoval(
				"S0 — the repo carries the agent tooling files",
				prefixed,
				NEUTRAL_WORDS,
			),
			"S0 — the repo carries the agent tooling files, and drops the files that the agent tooling replaces",
		],
		[
			"a removal alone",
			updateSubject(
				{ kind: "conventional", scope: undefined },
				[],
				true,
				NEUTRAL_WORDS,
			),
			"chore: remove the files that the agent tooling replaces",
		],
	])("%s names no tool", (_, subject, expected) => {
		expect(subject).toBe(expected);
		expect(subject.toLowerCase()).not.toContain("astack");
	});
});
