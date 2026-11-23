import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import type { NewPr, OpenPr } from "../../src/astack/pr/open.ts";
import {
	NO_SESSION_PRS,
	type SessionPrs,
	sessionReasons,
	splitInstructionIn,
} from "../../src/astack/pr/split.ts";

describe("the split instruction of a person's prompt", () => {
	test.each([
		["Split this work into a second PR.", true],
		["Ship the docs in another pull request, and keep going.", true],
		["Do not merge, but open two PRs for this plan.", true],
		["do not split this into a second PR", false],
		["Should the docs go in a separate PR?", false],
		["Split the parser into two files.", false],
		["Fix the second commit of this PR.", false],
		["Close the second PR.", false],
		["These two PRs should be one PR.", false],
		["Fold the second PR into the first.", false],
		["Put the second PR into the first one.", false],
		["Make these two PRs one PR.", false],
	])("[control:split-instruction] %p gives %p", (prompt, split) => {
		expect(splitInstructionIn(prompt)).toBe(split);
	});
});

function openPr(number: number, head: string): OpenPr {
	return {
		number,
		url: `https://github.com/o/r/pull/${number}`,
		head,
		title: "t",
		body: "Part of ABC-1",
	};
}

const FIRST = openPr(1710, "dev/one");

function created(body: string, base = "main"): NewPr {
	return { head: "dev/two", body, base, repo: "o/r", root: "/w/one" };
}

function numbers(reasons: readonly string[]): number[] {
	return reasons.map((reason) => Number(/^#(\d+) /.exec(reason)?.[1]));
}

describe("the one-PR reasons of a create", () => {
	test.each([
		["Part of #1710", NO_SESSION_PRS, "main", [1710]],
		[
			"Part of https://github.com/o/r/pull/1710",
			NO_SESSION_PRS,
			"main",
			[1710],
		],
		["Part of #1709", NO_SESSION_PRS, "main", []],
		["Part of #1710", NO_SESSION_PRS, "dev/one", []],
		["Part of #1710", { split: true, opens: [] }, "main", []],
	])(
		"[control:part-of-open] %p with %p on the base %p names %p",
		(body, record, base, named) => {
			const reasons = sessionReasons(created(body, base), record, [FIRST]);
			expect(numbers(reasons)).toEqual(named);
		},
	);

	test("a Part of reason says to push to the open branch and shows no stacked PR", () => {
		expect(
			sessionReasons(created("Part of #1710"), NO_SESSION_PRS, [FIRST]),
		).toEqual([
			"#1710 (https://github.com/o/r/pull/1710) is open, and the Part of line of this PR links it. Push to dev/one.",
		]);
	});

	const pick = <T>(values: readonly T[]) => fc.constantFrom(...values);
	const roots = ["/w/one", "/w/two"];
	const repos = ["o/r", "o/s"];
	const bases = ["main", "dev/one", "dev/two"];
	const heads = ["dev/one", "dev/two", "dev/three"];
	const open = fc
		.subarray(heads)
		.map((list) => list.map((head, index) => openPr(1700 + index, head)));
	const record: fc.Arbitrary<SessionPrs> = fc.record({
		split: fc.boolean(),
		opens: fc.array(
			fc.record({
				root: pick(roots),
				repo: pick(repos),
				base: pick(bases),
				head: pick(heads),
			}),
			{ maxLength: 4 },
		),
	});
	const pr: fc.Arbitrary<NewPr> = fc.record({
		head: fc.option(pick(heads), { nil: undefined }),
		body: fc.option(pick(["Part of ABC-9", "Part of #1700", "x"]), {
			nil: undefined,
		}),
		base: pick(bases),
		repo: pick(repos),
		root: pick(roots),
	});

	test("[control:session-pr-rule] a create gets a reason only for a Part of link to an open PR or another open head of its root, repo and base, with no stacked base and no split", () => {
		fc.assert(
			fc.property(pr, record, open, (made, saved, listed) => {
				const stacked = listed.some((one) => one.head === made.base);
				const expected = listed
					.filter(
						(one) =>
							(made.body === `Part of #${one.number}` ||
								saved.opens.some(
									(prior) =>
										prior.head === one.head &&
										prior.head !== made.head &&
										prior.root === made.root &&
										prior.repo === made.repo &&
										prior.base === made.base,
								)) &&
							!stacked &&
							!saved.split,
					)
					.map((one) => one.number);
				expect(numbers(sessionReasons(made, saved, listed))).toEqual(expected);
			}),
			{ numRuns: 300 },
		);
	});
});
