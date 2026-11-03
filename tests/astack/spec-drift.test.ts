import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const NAME = "astack check spec-drift";
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-spec-drift-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let count = 0;

type Run = { code: number | null; out: string; err: string };
type Files = Readonly<Record<string, string>>;

const FILES: Files = {
	"docs/spec.md":
		"# Spec\n- [criterion:A1] the report downloads\n- [criterion:A2] the report is empty without data\n",
	"docs/more.md": "[criterion:B1] a second spec file\n",
	"tests/one.txt":
		"test [control:C1] downloads\ntest [control:C2] empty\ntest [control:S1] shared setup\n",
	"tests/two.txt": "test [control:C3] second\ntest [control:R1] old crash\n",
};

const MATRIX = {
	version: 1,
	specs: ["docs/spec.md", "docs/more.md"],
	tests: ["tests/one.txt", "tests/two.txt"],
	links: [
		{ criterion: "A1", controls: ["C1"] },
		{ criterion: "A2", controls: ["C1", "C2"] },
		{ criterion: "B1", controls: ["C3"] },
	],
	exemptions: [
		{ control: "R1", kind: "regression", reason: "guards the old crash" },
		{ control: "S1", kind: "shared", reason: "sets up each report test" },
	],
};

function repo(files: Files, matrix: unknown): string {
	count += 1;
	const root = join(scratch, `repo-${count}`);
	mkdirSync(root, { recursive: true });
	spawnSync("git", ["init", "-q", "-b", "main"], { cwd: root });
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	writeFileSync(
		join(root, "matrix.json"),
		typeof matrix === "string" ? matrix : JSON.stringify(matrix),
	);
	return root;
}

function drift(
	cwd: string,
	args: readonly string[] = ["matrix.json"],
	name = "spec-drift",
): Run {
	const result = spawnSync(
		process.execPath,
		name === "spec-drift"
			? [CLI, "check", name, ...args]
			: [CLI, name, ...args],
		{ cwd, encoding: "utf8" },
	);
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const outside = join(scratch, "outside");
mkdirSync(outside);
writeFileSync(join(outside, "leak.md"), "[criterion:LEAK] outside the repo\n");

const stop = (summary: string, ...findings: string[]): string =>
	`${[...findings.map((finding) => `finding: ${finding}`), `stop: ${summary}`].join("\n")}\n`;

describe("astack check spec-drift", () => {
	test("passes a matrix with shared controls and shared and regression exemptions, from a subfolder and by alias", () => {
		const root = repo(FILES, MATRIX);
		const expected =
			"ok: 3 criteria, 5 controls, 3 links, 2 exemptions, 0 findings\n";
		const run = drift(root);
		expect(run.err).toBe("");
		expect(run.out).toBe(expected);
		expect(run.code).toBe(0);
		const sub = drift(join(root, "docs"), ["../matrix.json"]);
		expect(sub.out).toBe(expected);
		expect(sub.code).toBe(0);
		const alias = drift(root, ["matrix.json"], "check-spec-drift");
		expect(alias.out).toBe(expected);
		expect(alias.code).toBe(0);
	});

	test.each<[string, Files, Record<string, unknown>, string]>([
		[
			"a source criterion with no links row",
			{
				...FILES,
				"docs/spec.md": `${FILES["docs/spec.md"]}- [criterion:A3] new\n`,
			},
			{},
			stop(
				"4 criteria, 5 controls, 3 links, 2 exemptions, 1 finding",
				"criterion A3 (docs/spec.md) has no links row",
			),
		],
		[
			"a renamed criterion marker",
			{
				...FILES,
				"docs/spec.md": (FILES["docs/spec.md"] ?? "").replace("A2", "A2b"),
			},
			{},
			stop(
				"3 criteria, 5 controls, 3 links, 2 exemptions, 2 findings",
				"criterion A2b (docs/spec.md) has no links row",
				"links row for criterion A2: no listed spec declares this criterion",
			),
		],
		[
			"a renamed control marker",
			{
				...FILES,
				"tests/two.txt": (FILES["tests/two.txt"] ?? "").replace("C3", "C3b"),
			},
			{},
			stop(
				"3 criteria, 5 controls, 3 links, 2 exemptions, 2 findings",
				"links row for criterion B1 lists control C3, which no listed test declares",
				"control C3b (tests/two.txt) is linked by no criterion and has no exemption",
			),
		],
		[
			"an ID that two files declare",
			{
				...FILES,
				"docs/more.md": `${FILES["docs/more.md"]}[criterion:A1] again\n`,
				"tests/two.txt": `${FILES["tests/two.txt"]}[control:C1] again\n`,
			},
			{},
			stop(
				"3 criteria, 5 controls, 3 links, 2 exemptions, 2 findings",
				"criterion A1 is declared more than once: docs/spec.md, docs/more.md",
				"control C1 is declared more than once: tests/one.txt, tests/two.txt",
			),
		],
		[
			"a duplicate row, an empty row, a repeated control and an unknown control",
			FILES,
			{
				links: [
					{ criterion: "A1", controls: ["C1"] },
					{ criterion: "A1", controls: ["C1"] },
					{ criterion: "A2", controls: [] },
					{ criterion: "B1", controls: ["C3", "C3", "C9"] },
				],
			},
			stop(
				"3 criteria, 5 controls, 4 links, 2 exemptions, 5 findings",
				"criterion A1 has more than one links row",
				"links row for criterion A2 lists no control",
				"links row for criterion B1 lists control C3 twice",
				"links row for criterion B1 lists control C9, which no listed test declares",
				"control C2 (tests/one.txt) is linked by no criterion and has no exemption",
			),
		],
		[
			"exemptions that repeat, conflict, miss a control or give no reason",
			{
				...FILES,
				"tests/two.txt": `${FILES["tests/two.txt"]}[control:X1] new\n`,
			},
			{
				exemptions: [
					{ control: "R1", kind: "regression", reason: "guards the old crash" },
					{ control: "S1", kind: "shared", reason: "sets up each report test" },
					{ control: "R1", kind: "shared", reason: "again" },
					{ control: "C1", kind: "shared", reason: "linked as well" },
					{ control: "NOPE", kind: "regression", reason: "gone" },
					{ control: "X1", kind: "shared", reason: "  " },
				],
			},
			stop(
				"3 criteria, 6 controls, 3 links, 6 exemptions, 5 findings",
				"control X1 (tests/two.txt) is linked by no criterion and has no exemption",
				"control R1 has more than one exemption",
				"control C1 is both linked by a criterion and exempt",
				"exemption for control NOPE: no listed test declares this control",
				"exemption for control X1 has a blank reason",
			),
		],
		[
			"controls with no row and no exemption",
			FILES,
			{ exemptions: undefined },
			stop(
				"3 criteria, 5 controls, 3 links, 0 exemptions, 2 findings",
				"control S1 (tests/one.txt) is linked by no criterion and has no exemption",
				"control R1 (tests/two.txt) is linked by no criterion and has no exemption",
			),
		],
		[
			"listed files with no marker",
			{
				"docs/spec.md": "# nothing\n",
				"docs/more.md": "# nothing\n",
				"tests/one.txt": "nothing\n",
				"tests/two.txt": "nothing\n",
			},
			{ links: [], exemptions: [] },
			stop(
				"0 criteria, 0 controls, 0 links, 0 exemptions, 2 findings",
				"the listed spec files hold no [criterion:ID] marker",
				"the listed test files hold no [control:ID] marker",
			),
		],
		[
			"malformed markers",
			{
				...FILES,
				"docs/spec.md": `${FILES["docs/spec.md"]}[criterion:1x] [criterion: A9]\n`,
				"tests/one.txt": `${FILES["tests/one.txt"]}[control:]\n`,
			},
			{},
			stop(
				"3 criteria, 5 controls, 3 links, 2 exemptions, 3 findings",
				"docs/spec.md: malformed marker [criterion:1x]",
				"docs/spec.md: malformed marker [criterion: A9]",
				"tests/one.txt: malformed marker [control:]",
			),
		],
	])("exits 1 for %s", (_name, files, patch, expected) => {
		const matrix = { ...MATRIX, ...patch };
		const root = repo(files, matrix);
		const run = drift(root);
		expect(run.err).toBe("");
		expect(run.out).toBe(expected);
		expect(run.code).toBe(1);
	});

	test("exits 1 for a missing file, a folder and a symlink that leaves the repository, and reads nothing outside", () => {
		const root = repo(FILES, {
			...MATRIX,
			specs: [
				"docs/spec.md",
				"docs/more.md",
				"docs/missing.md",
				"docs",
				"docs/out.md",
			],
		});
		symlinkSync(join(outside, "leak.md"), join(root, "docs/out.md"));
		const run = drift(root);
		expect(run.err).toBe("");
		expect(run.out).toBe(
			stop(
				"3 criteria, 5 controls, 3 links, 2 exemptions, 3 findings",
				"docs/missing.md: the file is missing",
				"docs: the path is not a regular file",
				"docs/out.md: the path resolves outside the repository",
			),
		);
		expect(run.code).toBe(1);
	});

	test.each<[string, unknown, string]>([
		[
			"null exemptions",
			{ ...MATRIX, exemptions: null },
			"exemptions must be an array",
		],
		["text that is no JSON", "{", "the matrix is not valid JSON"],
		["a list as the root", [], "the matrix must be a JSON object"],
		[
			"an unknown top key",
			{ ...MATRIX, extra: 1 },
			'the matrix has the unknown key "extra"',
		],
		["another version", { ...MATRIX, version: 2 }, "version must be 1"],
		[
			"an empty spec list",
			{ ...MATRIX, specs: [] },
			"specs must be a nonempty array of paths",
		],
		[
			"a path that the list repeats",
			{ ...MATRIX, tests: ["tests/one.txt", "tests/one.txt"] },
			'tests holds "tests/one.txt" twice',
		],
		[
			"an absolute path",
			{ ...MATRIX, specs: ["/etc/passwd"] },
			'specs[0] "/etc/passwd" is not a path inside the repository',
		],
		[
			"a backslash path",
			{ ...MATRIX, specs: ["docs\\spec.md"] },
			'specs[0] "docs\\\\spec.md" is not a path inside the repository',
		],
		[
			"a traversal path",
			{ ...MATRIX, tests: ["tests/../../x"] },
			'tests[0] "tests/../../x" is not a path inside the repository',
		],
		[
			"an ID with a wrong form",
			{ ...MATRIX, links: [{ criterion: "1x", controls: ["C1"] }] },
			'links[0].criterion "1x" is not a valid ID',
		],
		[
			"an unknown key in a row",
			{ ...MATRIX, links: [{ criterion: "A1", controls: ["C1"], note: "x" }] },
			'links[0] has the unknown key "note"',
		],
		[
			"an unknown exemption kind",
			{
				...MATRIX,
				exemptions: [{ control: "R1", kind: "other", reason: "why" }],
			},
			'exemptions[0].kind must be "shared" or "regression"',
		],
	])("exits 2 for %s", (_name, matrix, message) => {
		const run = drift(repo(FILES, matrix));
		expect(run.out).toBe("");
		expect(run.err).toBe(`${NAME}: ${message}\n`);
		expect(run.code).toBe(2);
	});

	describe("usage", () => {
		const root = repo(FILES, MATRIX);
		const away = join(outside, "matrix.json");
		writeFileSync(away, JSON.stringify(MATRIX));
		symlinkSync(away, join(root, "linked.json"));

		test.each<[string, string[], string]>([
			["no argument", [], "give exactly one matrix path"],
			[
				"two arguments",
				["matrix.json", "matrix.json"],
				"give exactly one matrix path",
			],
			["a missing matrix", ["nope.json"], "cannot read the matrix nope.json"],
			[
				"a matrix outside the repository",
				[away],
				`${away} is not inside the repository`,
			],
			[
				"a matrix symlink that leaves the repository",
				["linked.json"],
				"linked.json is not inside the repository",
			],
		])("exits 2 for %s", (_name, args, message) => {
			const run = drift(root, args);
			expect(run.out).toBe("");
			expect(run.err).toBe(`${NAME}: ${message}\n`);
			expect(run.code).toBe(2);
		});

		test("exits 2 outside a git repository", () => {
			const run = drift(outside, ["matrix.json"]);
			expect(run.out).toBe("");
			expect(run.err).toBe(`${NAME}: not inside a git repository\n`);
			expect(run.code).toBe(2);
		});
	});
});
