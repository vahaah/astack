import { describe, expect, test } from "bun:test";
import { splitInstructionIn } from "../../src/astack/pr/split.ts";

describe("the split instruction of a person's prompt", () => {
	test.each([
		["Split this work into a second PR.", true],
		["Ship the docs in another pull request, and keep going.", true],
		["Do not merge, but open two PRs for this plan.", true],
		["do not split this into a second PR", false],
		["Should the docs go in a separate PR?", false],
		["Split the parser into two files.", false],
		["Fix the second commit of this PR.", false],
	])("[control:split-instruction] %p gives %p", (prompt, split) => {
		expect(splitInstructionIn(prompt)).toBe(split);
	});
});
