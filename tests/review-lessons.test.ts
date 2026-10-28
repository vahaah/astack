import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const readIfThere = (path: string): string | undefined =>
	existsSync(join(root, path)) ? read(path) : undefined;
const engine = "marketplace/plugins/astack/skills/pr-review-hardening";
const checklistPath = `${engine}/references/checklist.md`;
const lessonsPath = "docs/review-lessons.md";

const RUNNING_KINDS: readonly string[] = [
	"test",
	"apply-check",
	"cli-check",
	"hook",
];
const KINDS: readonly string[] = [
	...RUNNING_KINDS,
	"pinned-rule",
	"positive-control",
];

type Guard = {
	readonly classId: string;
	readonly kind: string;
	readonly file: string;
	readonly locator: string;
};
type Target =
	| { readonly kind: "class"; readonly classId: string }
	| { readonly kind: "declined"; readonly reason: string }
	| { readonly kind: "unreadable"; readonly cell: string };
const STATUSES: readonly string[] = ["fixed", "open", "declined", "duplicate"];
type Finding = {
	readonly ref: string;
	readonly round: string;
	readonly target: Target;
	readonly status: string;
};
type Lessons = {
	readonly classes: readonly string[];
	readonly guards: readonly Guard[];
	readonly findings: readonly Finding[];
	readonly problems: readonly string[];
};

function sectionRows(text: string, heading: string): string[][] {
	const start = text.indexOf(`\n## ${heading}\n`);
	if (start === -1) return [];
	const end = text.indexOf("\n## ", start + 1);
	return text
		.slice(start, end === -1 ? undefined : end)
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.slice(2)
		.map((line) =>
			line
				.replace(/^\||\|$/g, "")
				.split(/(?<!\\)\|/)
				.map((cell) => cell.trim()),
		);
}

const codeSpan = (cell: string): string | undefined =>
	/^`([^`]+)`$/.exec(cell)?.[1];

function targetOf(cell: string): Target {
	if (cell.startsWith("declined: "))
		return { kind: "declined", reason: cell.slice("declined: ".length) };
	const classId = codeSpan(cell);
	return classId === undefined
		? { kind: "unreadable", cell }
		: { kind: "class", classId };
}

function parseLessons(text: string): Lessons {
	const classes: string[] = [];
	const guards: Guard[] = [];
	const problems: string[] = [];
	let current: string | undefined;
	for (const cells of sectionRows(text, "Classes")) {
		const [classCell = "", , kindCell = "", fileCell = "", locatorCell = ""] =
			cells;
		if (classCell !== "") {
			current = codeSpan(classCell);
			if (current === undefined) {
				problems.push(`the class cell ${classCell} is not one code span`);
				continue;
			}
			classes.push(current);
		}
		const kind = codeSpan(kindCell);
		const file = codeSpan(fileCell);
		const locator = codeSpan(locatorCell);
		if (
			current === undefined ||
			kind === undefined ||
			file === undefined ||
			locator === undefined
		) {
			problems.push(`a guard row lacks a class, a kind, a file or a locator`);
			continue;
		}
		guards.push({ classId: current, kind, file, locator });
	}
	const findings: Finding[] = [];
	for (const cells of sectionRows(text, "Findings")) {
		const ref = codeSpan(cells[0] ?? "");
		if (ref === undefined) {
			problems.push(`a finding row has no ref: ${cells.join(" | ")}`);
			continue;
		}
		findings.push({
			ref,
			round: cells[1] ?? "",
			target: targetOf(cells[5] ?? ""),
			status: codeSpan(cells[6] ?? "") ?? "",
		});
	}
	return { classes, guards, findings, problems };
}

const CHECK_KINDS: readonly string[] = ["apply-check", "cli-check"];

function locatorGaps(
	guards: readonly Guard[],
	readText: (path: string) => string | undefined,
): string[] {
	return guards.flatMap((guard) => {
		const text = readText(guard.file);
		if (text === undefined) return [`${guard.file} does not exist`];
		if (CHECK_KINDS.includes(guard.kind) && !guard.file.startsWith("tests/"))
			return new RegExp(
				String.raw`\b(?:function|const|let)\s+${guard.locator}\b`,
			).test(text)
				? []
				: [`${guard.file} does not define ${guard.locator}`];
		return guard.locator
			.split(" > ")
			.filter((part) => !text.includes(part))
			.map((part) => `${guard.file} does not hold "${part}"`);
	});
}

function statusGaps(lessons: Lessons): string[] {
	return lessons.findings.flatMap(({ ref, target, status }) => {
		if (!STATUSES.includes(status))
			return [
				`${ref} has the status ${status || "none"}, not one of ${STATUSES.join(", ")}`,
			];
		const declined = status === "declined" || status === "duplicate";
		return declined === (target.kind === "declined")
			? []
			: [`${ref} has the status ${status}, which does not fit its class cell`];
	});
}

const unknownKinds = (lessons: Lessons): string[] =>
	lessons.guards
		.filter((guard) => !KINDS.includes(guard.kind))
		.map((guard) => `${guard.classId}: ${guard.kind}`);

const unguardedClasses = (lessons: Lessons): string[] =>
	lessons.classes.filter(
		(classId) =>
			!lessons.guards.some(
				(guard) =>
					guard.classId === classId && RUNNING_KINDS.includes(guard.kind),
			),
	);

function findingsWithoutClass(lessons: Lessons): string[] {
	return lessons.findings.flatMap(({ ref, target }) => {
		switch (target.kind) {
			case "class":
				return lessons.classes.includes(target.classId)
					? []
					: [
							`${ref} names the class ${target.classId}, which the classes table does not hold`,
						];
			case "declined":
				return target.reason.trim() === ""
					? [`${ref} is declined with no reason`]
					: [];
			case "unreadable":
				return [`${ref} names no class and no reason: ${target.cell}`];
			default: {
				const unhandled: never = target;
				return unhandled;
			}
		}
	});
}

const checklistItems = (text: string): string[] =>
	[...text.matchAll(/^### (.+)$/gm)].map((match) => match[1] ?? "");

const classesWithoutItem = (lessons: Lessons, items: readonly string[]) =>
	lessons.classes.filter((classId) => !items.includes(classId));

const itemsWithoutClass = (lessons: Lessons, items: readonly string[]) =>
	items.filter((item) => !lessons.classes.includes(item));

const COUNT_PHRASE =
	/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:review\s+)?(?:findings|rounds|classes)\b/gi;

const statedCounts = (text: string): string[] =>
	text
		.split("\n")
		.filter((line) => !line.startsWith("|"))
		.flatMap((line) =>
			[...line.matchAll(COUNT_PHRASE)].map(([phrase]) => phrase),
		);

const SYNTHETIC_REF = /^(?:codex:r(\d+)-\d+|wf:r(\d+)(?::[a-z0-9-]+)+)$/;

function unsyntheticRefs(lessons: Lessons): string[] {
	return lessons.findings.flatMap(({ ref, round }) => {
		const match = SYNTHETIC_REF.exec(ref);
		if (match === null)
			return [`${ref} is not codex:r<round>-<n> or wf:r<round>:<slug>`];
		const named = match[1] ?? match[2];
		return named === round
			? []
			: [`${ref} names the round ${named}, but its row is in round ${round}`];
	});
}

const WHOLE_ROUND = /^[1-9]\d*$/;

function roundGaps(lessons: Lessons): string[] {
	const rounds = [...new Set(lessons.findings.map(({ round }) => round))];
	const whole = rounds.filter((round) => WHOLE_ROUND.test(round)).map(Number);
	return [
		...rounds
			.filter((round) => !WHOLE_ROUND.test(round))
			.map((round) => `the round ${round} is not a whole number`),
		...Array.from({ length: Math.max(0, ...whole) }, (_, index) => index + 1)
			.filter((round) => !whole.includes(round))
			.map((round) => `no finding is in round ${round}`),
	];
}

const HEX_ID = /(?<![0-9a-z])(?=[a-f]*\d)[0-9a-f]{7,}(?![0-9a-z])/g;

const hexIds = (text: string): string[] =>
	[...text.matchAll(HEX_ID)].map(([id]) => id);

describe("the checks of the review lessons find each broken row", () => {
	const sampleText = [
		"# Sample",
		"",
		"Two review rounds found these findings.",
		"",
		"## Classes",
		"",
		"| Class | Rule | Kind | File | Locator |",
		"|---|---|---|---|---|",
		"| `guarded` | A rule. | `test` | `a.test.ts` | `block one > test one` |",
		"|  |  | `pinned-rule` | `a.test.ts` | `block one > test two` |",
		"|  |  | `apply-check` | `gone.ts` | `checkGone` |",
		"|  |  | `apply-check` | `lib.ts` | `importedOnly` |",
		"| `pinned-only` | A rule. | `pinned-rule` | `a.test.ts` | `block one` |",
		"|  |  | `tset` | `a.test.ts` | `block one` |",
		"",
		"## Findings",
		"",
		"The table holds each of the 6 findings.",
		"",
		"| Ref | Round | Origin | Severity | Title | Class | Status |",
		"|---|---|---|---|---|---|---|",
		'| `a:1` | 1 | codex | P1 | "One" | `guarded` | `fixed` |',
		'| `a:2` | 1 | codex | P1 | "Two" | `renamed-class` | `open` |',
		'| `a:3` | 2 | verify | minor | "Three" | declined: CI proves it. | `declined` |',
		'| `a:4` | 2 | verify | minor | "Four" | guarded | `fixed` |',
		'| `a:5` | 2 | verify | minor | "Five" | `guarded` | `declined` |',
		'| `a:6` | 2 | verify | minor | "Six" | `guarded` | done |',
	].join("\n");
	const sample = parseLessons(sampleText);
	const sampleFiles = (path: string) =>
		path === "a.test.ts"
			? 'describe("block one", test("test one"))'
			: path === "lib.ts"
				? 'import { importedOnly } from "./other.ts";'
				: undefined;

	test("the parser reads each class, guard and finding row of the sample", () => {
		expect(sample.classes).toEqual(["guarded", "pinned-only"]);
		expect(sample.guards.map((guard) => guard.kind)).toEqual([
			"test",
			"pinned-rule",
			"apply-check",
			"apply-check",
			"pinned-rule",
			"tset",
		]);
		expect(sample.findings.map((finding) => finding.ref)).toEqual([
			"a:1",
			"a:2",
			"a:3",
			"a:4",
			"a:5",
			"a:6",
		]);
		expect(sample.problems).toEqual([]);
	});

	test("a missing guard file, a missing part of a locator and a check function that the file only imports are gaps", () => {
		expect(locatorGaps(sample.guards, sampleFiles)).toEqual([
			'a.test.ts does not hold "test two"',
			"gone.ts does not exist",
			"lib.ts does not define importedOnly",
		]);
	});

	test("a status outside the list, or a status that does not fit the class cell, is a gap", () => {
		expect(statusGaps(sample)).toEqual([
			"a:5 has the status declined, which does not fit its class cell",
			"a:6 has the status none, not one of fixed, open, declined, duplicate",
		]);
	});

	test("a guard kind outside the list is unknown", () => {
		expect(unknownKinds(sample)).toEqual(["pinned-only: tset"]);
	});

	test("a class with only pinned rules has no guard that runs", () => {
		expect(unguardedClasses(sample)).toEqual(["pinned-only"]);
	});

	test("a finding that names a class outside the table, or no class, is a gap", () => {
		expect(findingsWithoutClass(sample)).toEqual([
			"a:2 names the class renamed-class, which the classes table does not hold",
			"a:4 names no class and no reason: guarded",
		]);
	});

	test("the checklist and the classes table must name the same classes", () => {
		const items = checklistItems("# List\n\n### guarded\n\n### stale-item\n");
		expect(classesWithoutItem(sample, items)).toEqual(["pinned-only"]);
		expect(itemsWithoutClass(sample, items)).toEqual(["stale-item"]);
	});

	test("a count of rounds or findings in the prose is a gap, and a number in a table row is not", () => {
		expect(statedCounts(sampleText)).toEqual([
			"Two review rounds",
			"6 findings",
		]);
	});

	const idSampleText = [
		"# Sample",
		"",
		"## Findings",
		"",
		"| Ref | Round | Origin | Severity | Title | Class | Status |",
		"|---|---|---|---|---|---|---|",
		'| `codex:r1-1` | 1 | codex | P1 | "One" | `guarded` | `fixed` |',
		'| `wf:r1:verify:slug-one` | 1 | verify | minor | "Two" | `guarded` | `fixed` |',
		'| `codex:r1-2` | 2 | codex | P2 | "Three" | `guarded` | `fixed` |',
		'| `codex:12345678` | 2 | codex | P2 | "Four" | `guarded` | `fixed` |',
		'| `wf:wf_0a1b2c3d-e4f:verify:slug-two` | 2 | verify | minor | "Five" | `guarded` | `fixed` |',
		'| `wf:r4:verify:slug-three` | 4 | verify | minor | "Commit 1a2b3c4 breaks it" | `guarded` | `fixed` |',
		'| `codex:r5-1` | 5-1 | codex | P2 | "Six" | `guarded` | `fixed` |',
	].join("\n");
	const idSample = parseLessons(idSampleText);

	test("a ref that is not synthetic, or that names another round than its row, is a gap", () => {
		expect(unsyntheticRefs(idSample)).toEqual([
			"codex:r1-2 names the round 1, but its row is in round 2",
			"codex:12345678 is not codex:r<round>-<n> or wf:r<round>:<slug>",
			"wf:wf_0a1b2c3d-e4f:verify:slug-two is not codex:r<round>-<n> or wf:r<round>:<slug>",
			"codex:r5-1 names the round 5, but its row is in round 5-1",
		]);
	});

	test("a round that is not a whole number, or a missing round below the last, is a gap", () => {
		expect(roundGaps(idSample)).toEqual([
			"the round 5-1 is not a whole number",
			"no finding is in round 3",
		]);
	});

	test("a run of 7 or more hex digits, such as a review id, a run id or a commit, is a gap", () => {
		expect(hexIds(idSampleText)).toEqual(["12345678", "0a1b2c3d", "1a2b3c4"]);
	});
});

describe(lessonsPath, () => {
	const lessons = parseLessons(read(lessonsPath));
	const items = checklistItems(read(checklistPath));

	test("the parser reads the classes table and the findings table", () => {
		expect(lessons.classes).toContain("engine-stub-drift");
		expect(lessons.findings.map((finding) => finding.ref)).toContain(
			"codex:r1-1",
		);
		expect(items).toContain("engine-stub-drift");
		expect(lessons.problems).toEqual([]);
	});

	test("each guard file exists and holds each part of its locator", () => {
		expect(locatorGaps(lessons.guards, readIfThere)).toEqual([]);
	});

	test("each guard has a known kind", () => {
		expect(unknownKinds(lessons)).toEqual([]);
	});

	test("each class has a guard of the kind test, apply-check, cli-check or hook", () => {
		expect(unguardedClasses(lessons)).toEqual([]);
	});

	test("each finding names a class of the classes table or a reason to decline it", () => {
		expect(findingsWithoutClass(lessons)).toEqual([]);
	});

	test("each finding has a status that fits its class cell", () => {
		expect(statusGaps(lessons)).toEqual([]);
	});

	test("each class has an item in the review checklist of the engine", () => {
		expect(classesWithoutItem(lessons, items)).toEqual([]);
	});

	test("each item of the review checklist names a class of the doc", () => {
		expect(itemsWithoutClass(lessons, items)).toEqual([]);
	});

	test("the prose states no count of findings, rounds or classes, because the next row makes it false", () => {
		expect(statedCounts(read(lessonsPath))).toEqual([]);
	});

	test("each ref is synthetic and names the round of its row, so the doc holds no id of a review comment or a run", () => {
		expect(unsyntheticRefs(lessons)).toEqual([]);
	});

	test("the rounds run from 1 with no gap, so no round holds the number of a PR", () => {
		expect(roundGaps(lessons)).toEqual([]);
	});

	test("the doc holds no run of 7 or more hex digits, such as the id of a review comment, a run or a commit", () => {
		expect(hexIds(read(lessonsPath))).toEqual([]);
	});
});

describe("the engine sends the reviewer and the fixer to the review checklist", () => {
	const review = read(`${engine}/references/review.md`);
	const section = (text: string, heading: string) => {
		const from = text.indexOf(`\n## ${heading}\n`);
		if (from === -1) throw new Error(`no section ${heading}`);
		const to = text.indexOf("\n## ", from + 1);
		return text.slice(from, to === -1 ? undefined : to);
	};
	const step = (number: number) => {
		const line = section(read(`${engine}/SKILL.md`), "Iterate")
			.split("\n")
			.find((entry) => entry.startsWith(`${number}. `));
		if (line === undefined) throw new Error(`no step ${number} in Iterate`);
		return line;
	};

	test.each([
		["the review step of SKILL.md", () => step(2)],
		["the fix step of SKILL.md", () => step(4)],
		[
			"the reviewer prompt of review.md",
			() => section(review, "Tell each reviewer"),
		],
		[
			"the checklist pass of review.md",
			() => section(review, "Checklist pass"),
		],
		[
			"the lessons section of fix.md",
			() =>
				section(read(`${engine}/references/fix.md`), "Lessons of earlier runs"),
		],
	])("%s names references/checklist.md", (_, text) => {
		expect(text()).toContain("references/checklist.md");
	});
});
