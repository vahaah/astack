import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LIMITS, limitsFor } from "../../src/astack/comments/limits.ts";
import {
	commentPolicy,
	loadProfile,
	PROFILE_PATH,
	profileProblems,
	profileSection,
} from "../../src/astack/profile.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repoWith(config: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-profile-"));
	dirs.push(dir);
	mkdirSync(join(dir, ".astack"));
	writeFileSync(join(dir, ".astack/profile.json"), JSON.stringify(config));
	return dir;
}

describe("limits", () => {
	test("defaults deny a block over 2 lines and judge an export doc over 12", () => {
		expect(DEFAULT_LIMITS).toEqual({
			block: { max: 2, over: "deny" },
			"export-doc": { max: 12, over: "judge" },
		});
		expect(limitsFor(undefined)).toBe(DEFAULT_LIMITS);
	});

	test("a repo limit sets the block limit and never lowers the doc limit", () => {
		expect(limitsFor(6).block.max).toBe(6);
		expect(limitsFor(6)["export-doc"].max).toBe(12);
		expect(limitsFor(20)["export-doc"].max).toBe(20);
	});
});

describe(".astack/profile.json", () => {
	test("reads maxCommentLines as a positive integer and ignores anything else", () => {
		expect(loadProfile(repoWith({ maxCommentLines: 5 })).maxCommentLines).toBe(
			5,
		);
		for (const value of [0, -1, 2.5, "5", null])
			expect(
				loadProfile(repoWith({ maxCommentLines: value })).maxCommentLines,
			).toBeUndefined();
	});

	test("a missing or broken file gives the defaults", () => {
		const empty = mkdtempSync(join(tmpdir(), "astack-profile-"));
		dirs.push(empty);
		expect(commentPolicy(empty)).toEqual({ keep: [], limits: DEFAULT_LIMITS });
		const broken = repoWith({});
		writeFileSync(join(broken, ".astack/profile.json"), "{not json");
		expect(commentPolicy(broken).limits).toBe(DEFAULT_LIMITS);
	});

	test("the first directory with a limit wins, and keep patterns merge", () => {
		const repo = repoWith({ maxCommentLines: 4, commentKeep: ["^// A:"] });
		const project = repoWith({ maxCommentLines: 8, commentKeep: ["^// B:"] });
		const policy = commentPolicy(repo, project);
		expect(policy.limits.block.max).toBe(4);
		expect(policy.keep.map((pattern) => pattern.source)).toEqual([
			"^\\/\\/ A:",
			"^\\/\\/ B:",
		]);
	});
});

describe("the profile path", () => {
	test("is .astack/profile.json, and the old .claude/craft.json is not read", () => {
		expect(PROFILE_PATH).toBe(".astack/profile.json");
		const dir = mkdtempSync(join(tmpdir(), "astack-profile-"));
		dirs.push(dir);
		mkdirSync(join(dir, ".claude"));
		writeFileSync(
			join(dir, ".claude/craft.json"),
			JSON.stringify({ maxCommentLines: 9, commentKeep: ["^// X:"] }),
		);
		expect(commentPolicy(dir)).toEqual({ keep: [], limits: DEFAULT_LIMITS });
	});

	test("profileSection returns one top-level section for a later reader", () => {
		const dir = repoWith({ ste: { mode: "deny" }, maxCommentLines: 3 });
		expect(profileSection(dir, "ste")).toEqual({ mode: "deny" });
		expect(profileSection(dir, "types")).toBeUndefined();
	});
});

describe("profileProblems", () => {
	test("accepts every section that a reader parses", () => {
		expect(
			profileProblems({
				tracker: { kind: "linear", team: "ABC", requirePartOf: true },
				merge: { authority: "standing", requireChecks: false },
				ste: {
					mode: "deny",
					technicalNouns: ["Hotel"],
					technicalVerbs: ["upsert"],
					exclude: ["legacy/**"],
					glossary: "docs/glossary.md",
				},
				plan: {
					dir: "docs/plans",
					glossary: "CONTEXT.md",
					adr: "docs/adr",
					branchPrefix: "dev",
					wip: 2,
					team: "ABC",
				},
				types: { skip: ["legacy/**"] },
				commentKeep: ["^-- lane:"],
				maxCommentLines: 4,
			}),
		).toEqual([]);
		expect(profileProblems({})).toEqual([]);
	});

	test("names each wrong value and each unknown key", () => {
		expect(
			profileProblems({
				tracker: { kind: "linear", team: "abc", requirePartOf: "yes" },
				merge: { authority: "always" },
				ste: { mode: "strict", technicalNouns: "Hotel" },
				plan: { adr: "../adr", wip: 0, owner: "me" },
				commentKeep: ["("],
				maxCommentLines: 0,
				trackers: {},
			}),
		).toEqual([
			"tracker.requirePartOf must be true or false",
			"tracker.team must be a Linear team key such as ABC",
			'merge.authority must be "standing" or "turn"',
			'ste.mode must be "deny" or "advise"',
			"ste.technicalNouns must be a string list",
			"plan.owner is not a known key",
			"plan.adr must be a path in the repo",
			"plan.wip must be a positive integer",
			'commentKeep: "(" is not a valid RegExp',
			"maxCommentLines must be a positive integer",
			"trackers is not a known profile section",
		]);
	});

	test("a Part of line needs a tracker, and the root must be an object", () => {
		expect(
			profileProblems({ tracker: { kind: "none", requirePartOf: true } }),
		).toEqual(["tracker.requirePartOf needs a tracker"]);
		expect(profileProblems({ tracker: { kind: "jira" } })).toEqual([
			'tracker.kind must be "linear", "github" or "none"',
		]);
		expect(profileProblems([])).toEqual(["the profile must be a JSON object"]);
	});

	test("accepts standing bases with a merge grant per turn", () => {
		expect(
			profileProblems({
				merge: { authority: "turn", standingBases: ["v2", "release"] },
			}),
		).toEqual([]);
	});

	test.each([
		[
			"a standing grant",
			{ authority: "standing", standingBases: ["v2"] },
			'merge.standingBases needs merge.authority "turn", because "standing" already covers each base',
		],
		[
			"a name that is not in a list",
			{ authority: "turn", standingBases: "v2" },
			"merge.standingBases must be a list of branch names that are not empty",
		],
		[
			"an empty name",
			{ authority: "turn", standingBases: ["v2", ""] },
			"merge.standingBases must be a list of branch names that are not empty",
		],
		[
			"a name two times",
			{ authority: "turn", standingBases: ["v2", "v2"] },
			"merge.standingBases names v2 more than one time",
		],
	])("refuses standing bases with %s", (_, merge, problem) => {
		expect(profileProblems({ merge })).toEqual([problem]);
	});
});
