import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = realpathSync(
	mkdtempSync(join(tmpdir(), "astack-ci-pins-adversarial-")),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let count = 0;

type Files = Readonly<Record<string, string>>;

function git(cwd: string, args: readonly string[]): string {
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.com",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.com",
		},
	});
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

function write(root: string, files: Files): void {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
}

function pullRequest(base: Files, head: Files): string {
	count += 1;
	const root = join(scratch, `repo-${count}`);
	mkdirSync(root, { recursive: true });
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["config", "core.autocrlf", "false"]);
	write(root, base);
	git(root, ["add", "-A"]);
	git(root, ["commit", "-q", "-m", "base"]);
	git(root, ["checkout", "-q", "-b", "pr"]);
	write(root, head);
	git(root, ["add", "-A"]);
	git(root, ["commit", "-q", "-m", "head"]);
	return root;
}

function ciPins(root: string): {
	code: number | null;
	out: string;
	err: string;
} {
	const result = spawnSync(
		process.execPath,
		[CLI, "check", "ci-pins", "--base", "main"],
		{ cwd: root, encoding: "utf8" },
	);
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const stop =
	"stop: only CI can prove this PR, for the reason in each line above\n";

const stops = (...lines: readonly string[]) => ({
	code: 1,
	out: [...lines, stop].join("\n"),
	err: "",
});

const CHECK = ".github/workflows/check.yml";
const SETUP = ".github/actions/setup/action.yml";

const form = (source: string) =>
	`${source}: astack does not read this YAML form, so it cannot tell what CI reads.`;

const workflow = (steps: string) =>
	[
		"name: check",
		"on:",
		"  pull_request:",
		"    branches: [main]",
		"jobs:",
		"  static:",
		"    runs-on: ubuntu-latest",
		"    steps:",
		"      - uses: actions/checkout@v4",
		steps,
		"      - run: bun install --frozen-lockfile",
		"",
	].join("\n");

const expression = (body: string) => `\${{ ${body} }}`;

const manifest = (fields: Readonly<Record<string, unknown>>) =>
	`${JSON.stringify({ name: "fixture", ...fields }, null, 2)}\n`;

const noBun = manifest({ dependencies: { "fixture-lib": "1.0.0" } });

function bunFileBump(ci: string, extra: Files = {}) {
	return ciPins(
		pullRequest(
			{
				[CHECK]: ci,
				".bun-version": "1.4.2\n",
				"package.json": noBun,
				...extra,
			},
			{ ".bun-version": "1.4.3\n" },
		),
	);
}

function nvmrcBump(steps: string) {
	return ciPins(
		pullRequest(
			{
				[CHECK]: workflow(steps),
				".nvmrc": "22.11.0\n",
				"package.json": noBun,
			},
			{ ".nvmrc": "22.12.0\n" },
		),
	);
}

function managerBump(ci: string, extra: Files = {}) {
	return ciPins(
		pullRequest(
			{
				[CHECK]: ci,
				"package.json": manifest({ packageManager: "bun@1.4.2" }),
				...extra,
			},
			{ "package.json": manifest({ packageManager: "bun@1.5.0" }) },
		),
	);
}

const setupBun = (inputs: readonly string[]) =>
	[
		"      - uses: oven-sh/setup-bun@v2",
		"        with:",
		...inputs.map((input) => `          ${input}`),
	].join("\n");

const setupNode = (inputs: readonly string[]) =>
	[
		"      - uses: actions/setup-node@v4",
		"        with:",
		...inputs.map((input) => `          ${input}`),
	].join("\n");

const localSetup = (inputs: readonly string[], step: readonly string[]) =>
	[
		"name: setup",
		"inputs:",
		...inputs,
		"runs:",
		"  using: composite",
		"  steps:",
		"    - uses: oven-sh/setup-bun@v2",
		"      with:",
		...step,
		"",
	].join("\n");

const passOn = (input: string) =>
	`        ${input}: ${expression(`inputs.${input}`)}`;

const bunFileChanges = (source: string) =>
	`.bun-version: bun 1.4.2 at the base, bun 1.4.3 at the head, from the bun-version-file of oven-sh/setup-bun at ${source}. The version changes.`;

const nvmrcChanges = `.nvmrc: node 22.11.0 at the base, node 22.12.0 at the head, from the node-version-file of actions/setup-node at ${CHECK}:12. The version changes.`;

const managerChanges = (line: number) =>
	`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:${line}. The version changes.`;

describe("finding 1: a node property before a key", () => {
	test("an anchor before the bun-version-file key of setup-bun stops when the PR changes .bun-version", () => {
		expect(
			bunFileBump(workflow(setupBun(["&a bun-version-file: .bun-version"]))),
		).toEqual(stops(bunFileChanges(`${CHECK}:12`)));
	});

	test("a tag before the node-version-file key of setup-node stops when the PR changes .nvmrc", () => {
		expect(nvmrcBump(setupNode(["!!str node-version-file: .nvmrc"]))).toEqual(
			stops(form(`${CHECK}:12`), nvmrcChanges),
		);
	});

	for (const [where, declared] of [
		["input name", ["  &i bun-version-file:", "    default: .bun-version"]],
		["default key", ["  bun-version-file:", "    &d default: .bun-version"]],
	] as const)
		test(`an anchor before the ${where} under inputs of a local action stops when the PR changes the default file`, () => {
			expect(
				bunFileBump(workflow("      - uses: ./.github/actions/setup"), {
					[SETUP]: localSetup(declared, [passOn("bun-version-file")]),
				}),
			).toEqual(stops(bunFileChanges(`${SETUP}:10, given at ${SETUP}:4`)));
		});

	test("an anchor before the with key of setup-node stops when the PR changes .nvmrc", () => {
		expect(
			nvmrcBump(
				[
					"      - uses: actions/setup-node@v4",
					"        &w with:",
					"          node-version-file: .nvmrc",
				].join("\n"),
			),
		).toEqual(stops(nvmrcChanges));
	});

	test("a tag before the uses key of setup-bun stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(
			managerBump(workflow("      - !!str uses: oven-sh/setup-bun@v2")),
		).toEqual(stops(form(`${CHECK}:10`), managerChanges(10)));
	});
});

describe("finding 2: escapes in a double-quoted key", () => {
	for (const key of ['"bun-version-\\x66ile"', '"bun-version-fil\\U00000065"'])
		test(`the double-quoted key ${key} of setup-bun stops when the PR changes .bun-version`, () => {
			expect(bunFileBump(workflow(setupBun([`${key}: .bun-version`])))).toEqual(
				stops(bunFileChanges(`${CHECK}:12`)),
			);
		});

	test("an escaped key in a flow with mapping stops when the PR changes .bun-version", () => {
		expect(
			bunFileBump(
				workflow(
					[
						"      - uses: oven-sh/setup-bun@v2",
						'        with: { "bun-version-\\x66ile": .bun-version }',
					].join("\n"),
				),
			),
		).toEqual(stops(bunFileChanges(`${CHECK}:11`)));
	});

	test("an escaped uses key of setup-bun stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(
			managerBump(workflow('      - "u\\x73es": oven-sh/setup-bun@v2')),
		).toEqual(stops(managerChanges(10)));
	});
});

describe("finding 3: a merge key under with", () => {
	const unchanged = (line: number) =>
		`package.json: no exact bun version at the base, no exact bun version at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:${line}. The PR does not change the file.`;

	test("a merge key with an alias under the with of setup-bun stops when the PR changes .bun-version", () => {
		expect(
			bunFileBump(
				workflow(
					[
						"      - run: echo hi",
						"        env: &bunfile",
						"          bun-version-file: .bun-version",
						setupBun(["<<: *bunfile"]),
					].join("\n"),
				),
			),
		).toEqual(stops(form(`${CHECK}:15`), unchanged(13)));
	});

	test("a merge key with a flow mapping under the with of setup-bun stops when the PR changes .bun-version", () => {
		expect(
			bunFileBump(
				workflow(setupBun(["<<: { bun-version-file: .bun-version }"])),
			),
		).toEqual(stops(form(`${CHECK}:12`), unchanged(10)));
	});
});

describe("finding 4: a version field that the setup action reads by truthiness", () => {
	const fromNode = `from the node-version-file of actions/setup-node at ${CHECK}:12`;
	const nodeFrom = (
		base: Readonly<Record<string, unknown>>,
		head: Readonly<Record<string, unknown>>,
	) =>
		ciPins(
			pullRequest(
				{
					[CHECK]: workflow(setupNode(["node-version-file: package.json"])),
					"package.json": manifest(base),
				},
				{ "package.json": manifest(head) },
			),
		);
	const engines = { engines: { node: "22.11.0" } };
	const nodeChanges = `package.json: node 22.11.0 at the base, node 24.0.0 at the head, ${fromNode}. The version changes.`;

	test("a volta.node that is a number stops when the PR changes it, because setup-node reads it before engines.node", () => {
		expect(
			nodeFrom(
				{ volta: { node: 22 }, ...engines },
				{ volta: { node: 24 }, ...engines },
			),
		).toEqual(
			stops(
				`package.json: no exact node version at the base, no exact node version at the head, ${fromNode}. astack cannot read an exact version on each side.`,
			),
		);
	});

	test("a devEngines runtime named Node stops when the PR changes its version, because setup-node compares the name in lower case", () => {
		const runtime = (version: string) => ({
			devEngines: { runtime: { name: "Node", version } },
			...engines,
		});
		expect(nodeFrom(runtime("22.11.0"), runtime("24.0.0"))).toEqual(
			stops(nodeChanges),
		);
	});

	test("a devEngines runtime list whose first node entry has no version stops when the PR changes the next node entry", () => {
		const runtime = (version: string) => ({
			devEngines: { runtime: [{ name: "node" }, { name: "node", version }] },
			...engines,
		});
		expect(nodeFrom(runtime("22.11.0"), runtime("24.0.0"))).toEqual(
			stops(nodeChanges),
		);
	});

	test("a volta.extends stops when the PR changes the file that it names, because setup-node reads that file", () => {
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow(setupNode(["node-version-file: package.json"])),
						"package.json": manifest({
							volta: { extends: "./config/volta.json" },
						}),
						"config/volta.json": manifest({ volta: { node: "22.11.0" } }),
					},
					{ "config/volta.json": manifest({ volta: { node: "22.12.0" } }) },
				),
			),
		).toEqual(
			stops(
				`package.json: node from another file at the base, node from another file at the head, ${fromNode}. astack cannot read the file that CI reads.`,
			),
		);
	});

	test("a mise tools.node stops when the PR changes it, because setup-node reads it before a line that holds only a version", () => {
		const mise = (node: string) =>
			`note = """\n22.11.0\n"""\n\n[tools]\nnode = "${node}"\n`;
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow(setupNode(["node-version-file: mise.toml"])),
						"mise.toml": mise("22.11.0"),
					},
					{ "mise.toml": mise("24.0.0") },
				),
			),
		).toEqual(
			stops(
				`mise.toml: no exact node version at the base, no exact node version at the head, from the node-version-file of actions/setup-node at ${CHECK}:12. astack cannot read an exact version on each side.`,
			),
		);
	});

	test("a packageManager that is not a string stops, because setup-bun then reads no version and gets the latest bun", () => {
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow(setupBun(["bun-version-file: package.json"])),
						"package.json": manifest({ packageManager: "bun@1.4.2" }),
					},
					{
						"package.json": manifest({
							packageManager: 1,
							engines: { bun: "1.4.2" },
						}),
					},
				),
			),
		).toEqual(
			stops(
				`package.json: bun 1.4.2 at the base, no exact bun version at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:12. astack cannot read an exact version on each side.`,
			),
		);
	});
});

describe("keys", () => {
	test("a uses key in another case stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(managerBump(workflow("      - Uses: oven-sh/setup-bun@v2"))).toEqual(
			stops(managerChanges(10)),
		);
	});

	test("an action name in another case, which GitHub resolves to the same repo, stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(managerBump(workflow("      - uses: Oven-Sh/Setup-Bun@v2"))).toEqual(
			stops(managerChanges(10)),
		);
	});

	test("an alias as an input key stops when the PR changes .bun-version", () => {
		expect(
			bunFileBump(
				workflow(
					[
						"      - run: echo hi",
						"        env:",
						"          KEY: &k bun-version-file",
						setupBun(["*k : .bun-version"]),
					].join("\n"),
				),
			),
		).toEqual(
			stops(
				form(`${CHECK}:15`),
				`package.json: no exact bun version at the base, no exact bun version at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:13. The PR does not change the file.`,
			),
		);
	});
});

describe("flow style and documents", () => {
	test("a flow step of setup-bun stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(
			managerBump(workflow("      - { uses: oven-sh/setup-bun@v2 }")),
		).toEqual(stops(managerChanges(10)));
	});

	test("the flow with mapping {} of setup-bun stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(
			managerBump(
				workflow("      - uses: oven-sh/setup-bun@v2\n        with: {}"),
			),
		).toEqual(stops(managerChanges(10)));
	});

	test("the flow with mapping { no-cache: true } of setup-bun stops when the PR changes the packageManager that setup-bun reads by default", () => {
		expect(
			managerBump(
				workflow(
					"      - uses: oven-sh/setup-bun@v2\n        with: { no-cache: true }",
				),
			),
		).toEqual(stops(managerChanges(10)));
	});

	test("a comment with a bracket after a flow value stops when the PR changes the packageManager that a later setup-bun step reads", () => {
		expect(
			managerBump(
				workflow(
					[
						"      - run: echo hi",
						'        env: { A: "1" } # [',
						"      - uses: oven-sh/setup-bun@v2",
					].join("\n"),
				),
			),
		).toEqual(stops(managerChanges(12)));
	});

	test("a quote in a plain scalar of a flow mapping does not hide a later setup-bun step", () => {
		expect(
			managerBump(
				workflow(
					[
						"      - run: echo hi",
						"        env: { NOTE: don't }",
						"      - uses: oven-sh/setup-bun@v2",
					].join("\n"),
				),
			),
		).toEqual(stops(managerChanges(12)));
	});

	test("a workflow in JSON style stops when the PR changes the packageManager that setup-bun reads by default", () => {
		const json = `${JSON.stringify(
			{
				name: "check",
				on: { pull_request: { branches: ["main"] } },
				jobs: {
					static: {
						"runs-on": "ubuntu-latest",
						steps: [
							{ uses: "actions/checkout@v4" },
							{ uses: "oven-sh/setup-bun@v2" },
							{ run: "bun install --frozen-lockfile" },
						],
					},
				},
			},
			null,
			2,
		)}\n`;
		expect(managerBump(json)).toEqual(stops(managerChanges(18)));
	});
});

describe("values", () => {
	test("a bun-version-file value on the next line stops when the PR changes .bun-version", () => {
		expect(
			bunFileBump(workflow(setupBun(["bun-version-file:", "  .bun-version"]))),
		).toEqual(stops(bunFileChanges(`${CHECK}:12`)));
	});

	test("a node-version-file value on the next line stops when the PR changes .nvmrc", () => {
		expect(nvmrcBump(setupNode(["node-version-file:", "  .nvmrc"]))).toEqual(
			stops(nvmrcChanges),
		);
	});

	test("an input value that goes on to the next line stops when the PR changes the file that the folded value names", () => {
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow(setupNode(["node-version-file: .nvm", "  rc"])),
						".nvm": "22.11.0\n",
						".nvm rc": "22.11.0\n",
					},
					{ ".nvm rc": "22.12.0\n" },
				),
			),
		).toEqual(
			stops(
				`.nvm rc: node 22.11.0 at the base, node 22.12.0 at the head, from the node-version-file of actions/setup-node at ${CHECK}:12. The version changes.`,
			),
		);
	});

	test("an input default of a local action on the next line stops when the PR changes the default file", () => {
		expect(
			bunFileBump(workflow("      - uses: ./.github/actions/setup"), {
				[SETUP]: localSetup(
					["  bun-version-file:", "    default:", "      .bun-version"],
					[passOn("bun-version-file")],
				),
			}),
		).toEqual(stops(bunFileChanges(`${SETUP}:11, given at ${SETUP}:4`)));
	});

	test("a plain or a quoted value on more than one line, under a key that the scan does not read, still passes", () => {
		const steps = [
			'      - name: "Set up',
			'          bun"',
			"        if: github.event_name == 'pull_request' &&",
			"          github.base_ref == 'main'",
			"        uses: oven-sh/setup-bun@v2",
			"        with:",
			"          bun-version-file: package.json",
		].join("\n");
		const lib = (version: string) =>
			manifest({
				packageManager: "bun@1.4.2",
				dependencies: { "fixture-lib": version },
			});
		expect(
			ciPins(
				pullRequest(
					{ [CHECK]: workflow(steps), "package.json": lib("1.0.0") },
					{ "package.json": lib("2.0.0") },
				),
			),
		).toEqual({
			code: 0,
			out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:16. The version is the same.\nok: the PR changes no CI file and no tool version that CI reads from a file\n`,
			err: "",
		});
	});
});

describe("documents", () => {
	const bunFromFile = workflow(setupBun(["bun-version-file: .bun-version"]));

	test("a --- before the first document reads the workflow as it reads one with no marker", () => {
		expect(bunFileBump(`---\n${bunFromFile}`)).toEqual(
			stops(bunFileChanges(`${CHECK}:13`)),
		);
	});

	test("a second document after --- or after ... stops the run", () => {
		for (const marker of ["---", "...\n---"])
			expect(
				ciPins(
					pullRequest(
						{
							[CHECK]: `${bunFromFile}${marker}\nname: other\n`,
							".bun-version": "1.4.2\n",
						},
						{ "README.md": "x\n" },
					),
				),
			).toEqual(
				stops(
					form(`${CHECK}:${marker === "---" ? 14 : 15}`),
					`.bun-version: bun 1.4.2 at the base, bun 1.4.2 at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:12. The PR does not change the file.`,
				),
			);
	});
});

describe("line breaks and encodings", () => {
	const bunFromFile = workflow(setupBun(["bun-version-file: .bun-version"]));

	test("a lone CR line break, which YAML 1.2 reads as a line break, stops when the PR changes .bun-version", () => {
		expect(bunFileBump(bunFromFile.replaceAll("\n", "\r"))).toEqual(
			stops(form(`${CHECK}:1`)),
		);
	});

	for (const [name, separator] of [
		["NEL", "\u0085"],
		["LS", "\u2028"],
		["PS", "\u2029"],
	] as const)
		test(`a ${name} line break, which a YAML 1.1 parser reads as a line break, stops when the PR changes .bun-version`, () => {
			expect(bunFileBump(bunFromFile.replaceAll("\n", separator))).toEqual(
				stops(form(`${CHECK}:1`)),
			);
		});

	test("a no-break space before a comment stops, because YAML keeps it and the comment in the file name that setup-bun reads", () => {
		expect(
			managerBump(
				workflow(setupBun(["bun-version-file: .bun-version\u00A0# pin"])),
				{ ".bun-version": "1.4.2\n" },
			),
		).toEqual(
			stops(
				`.bun-version\u00A0# pin: no file in package.json at the base, no file in package.json at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:12. astack cannot read the file that CI reads.`,
			),
		);
	});
});

describe("a bun-version that can be empty", () => {
	for (const given of ['bun-version: ""', "bun-version:"])
		test(`the empty input ${given} stops when the PR changes the packageManager, because setup-bun then reads package.json`, () => {
			expect(managerBump(workflow(setupBun([given])))).toEqual(
				stops(managerChanges(10)),
			);
		});

	test("a bun-version that is an env expression stops when the PR changes the packageManager, because an empty value makes setup-bun read package.json", () => {
		expect(
			managerBump(
				workflow(setupBun([`bun-version: ${expression("env.BUN_VERSION")}`])),
			),
		).toEqual(stops(managerChanges(10)));
	});

	test("a bun-version that a local action passes on from an input with an empty default stops when the PR changes the packageManager", () => {
		expect(
			managerBump(workflow("      - uses: ./.github/actions/setup"), {
				[SETUP]: localSetup(
					["  bun-version:", '    default: ""'],
					[passOn("bun-version")],
				),
			}),
		).toEqual(
			stops(
				`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at ${SETUP}:8. The version changes.`,
			),
		);
	});

	test("a literal bun-version keeps setup-bun off package.json, so a change to the packageManager passes", () => {
		expect(managerBump(workflow(setupBun(["bun-version: 1.4.2"])))).toEqual({
			code: 0,
			out: "ok: the PR changes no CI file and no tool version that CI reads from a file\n",
			err: "",
		});
	});
});

describe("an expression that names the version file", () => {
	test("a node-version-file expression stops when the PR changes a file with any name, because setup-node reads a file with any name", () => {
		const file = expression("env.NODE_FILE");
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow(
							[
								"      - uses: actions/setup-node@v4",
								"        env:",
								"          NODE_FILE: ci/node-version.txt",
								"        with:",
								`          node-version-file: ${file}`,
							].join("\n"),
						),
						"ci/node-version.txt": "22.11.0\n",
					},
					{ "ci/node-version.txt": "22.12.0\n" },
				),
			),
		).toEqual(
			stops(
				`${CHECK}:14: the node-version-file of actions/setup-node is ${file}, which astack cannot resolve to a file. The PR changes ci/node-version.txt, which the action can read a version from.`,
			),
		);
	});
});

describe("a repeated key", () => {
	test("a bun-version-file that a with mapping repeats stops, because YAML parsers differ on which value wins", () => {
		expect(
			bunFileBump(
				workflow(
					setupBun([
						"bun-version-file: .bun-version",
						"BUN-VERSION-FILE: package.json",
					]),
				),
			),
		).toEqual(
			stops(
				form(`${CHECK}:13`),
				`package.json: no exact bun version at the base, no exact bun version at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:13. The PR does not change the file.`,
			),
		);
	});
});

describe("a local action that the repo does not hold", () => {
	test("a local action that a step checks out from another repo stops, because it can read package.json", () => {
		expect(
			managerBump(
				workflow(
					[
						"      - uses: actions/checkout@v4",
						"        with:",
						"          repository: fixture/shared",
						"          path: ci",
						"      - uses: ./ci/setup",
					].join("\n"),
				),
			),
		).toEqual(
			stops(
				`${CHECK}:14: astack cannot read ./ci/setup, because the repo has no file there that the runner reads.`,
			),
		);
	});
});

describe("an input of a workflow", () => {
	test("a workflow input that a pull_request run leaves empty stops when the PR changes the packageManager, because setup-bun then reads package.json", () => {
		const ci = [
			"name: check",
			"on:",
			"  pull_request:",
			"  workflow_dispatch:",
			"    inputs:",
			"      bun-version-file:",
			"        default: .bun-version",
			"jobs:",
			"  static:",
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: oven-sh/setup-bun@v2",
			"        with:",
			`          bun-version-file: ${expression("inputs.bun-version-file")}`,
			"",
		].join("\n");
		expect(managerBump(ci, { ".bun-version": "1.4.2\n" })).toEqual(
			stops(
				`.bun-version: bun 1.4.2 at the base, bun 1.4.2 at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:14, given at ${CHECK}:7. The PR does not change the file.`,
				managerChanges(14),
			),
		);
	});
});

describe("a workflow file name", () => {
	test("a workflow with an upper case .YML extension is read too, so a packageManager change that its setup-bun reads stops", () => {
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.YML": workflow(
							"      - uses: oven-sh/setup-bun@v2",
						),
						"package.json": manifest({ packageManager: "bun@1.4.2" }),
					},
					{ "package.json": manifest({ packageManager: "bun@1.5.0" }) },
				),
			),
		).toEqual(
			stops(
				"package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at .github/workflows/check.YML:10. The version changes.",
			),
		);
	});
});

describe("forms that the scan reads with certainty", () => {
	test("an escape in a double-quoted value of a key that the scan does not read still passes", () => {
		const lib = (version: string) =>
			manifest({
				packageManager: "bun@1.4.2",
				dependencies: { "fixture-lib": version },
			});
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow(
							[
								'      - run: "echo \\"hi\\""',
								"      - uses: oven-sh/setup-bun@v2",
							].join("\n"),
						),
						"package.json": lib("1.0.0"),
					},
					{ "package.json": lib("2.0.0") },
				),
			),
		).toEqual({
			code: 0,
			out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:11. The version is the same.\nok: the PR changes no CI file and no tool version that CI reads from a file\n`,
			err: "",
		});
	});

	test("an anchor and a comment after with: still read the inputs below it", () => {
		expect(
			bunFileBump(
				workflow(
					[
						"      - uses: oven-sh/setup-bun@v2",
						"        with: &inputs # shared",
						"          bun-version-file: .bun-version",
					].join("\n"),
				),
			),
		).toEqual(stops(bunFileChanges(`${CHECK}:12`)));
	});
});

const SETUP_BUN_FILE = [
	"runs:",
	"  using: composite",
	"  steps:",
	"    - uses: oven-sh/setup-bun@v2",
	"      with:",
	`        bun-version-file: ${expression("inputs.file")}`,
	"",
];

const actionBump = (action: readonly string[]) =>
	ciPins(
		pullRequest(
			{
				[CHECK]: workflow("      - uses: ./.github/actions/setup"),
				[SETUP]: ["name: setup", ...action, ...SETUP_BUN_FILE].join("\n"),
				".bun-version": "1.4.2\n",
				"package.json": manifest({ packageManager: "bun@1.4.2" }),
			},
			{ ".bun-version": "1.5.0\n" },
		),
	);

const actionBunChanges = (line: number, given: number) =>
	`.bun-version: bun 1.4.2 at the base, bun 1.5.0 at the head, from the bun-version-file of oven-sh/setup-bun at ${SETUP}:${line}, given at ${SETUP}:${given}. The version changes.`;

const pinnedBun = setupBun(["bun-version-file: package.json"]);

const dependencyOnly = (steps: string) => {
	const lib = (version: string) =>
		manifest({
			packageManager: "bun@1.4.2",
			dependencies: { "fixture-lib": version },
		});
	return ciPins(
		pullRequest(
			{ [CHECK]: workflow(steps), "package.json": lib("1.0.0") },
			{ "package.json": lib("2.0.0") },
		),
	);
};

const passes = (line: number) => ({
	code: 0,
	out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:${line}. The version is the same.\nok: the PR changes no CI file and no tool version that CI reads from a file\n`,
	err: "",
});

describe("a plain scalar that goes on to the next line", () => {
	for (const [name, next] of [
		["a double quote", '"pinned by package.json'],
		["an apostrophe", "'s bun"],
		["a dash and a double quote", '- "pinned'],
		["an anchor and a double quote", '&k "pinned'],
	] as const)
		test(`${name} at the start of the next line of a step name is plain text, so the setup-bun step below it stops when the PR changes the packageManager`, () => {
			expect(
				managerBump(
					workflow(
						[
							"      - name: Set up bun",
							`          ${next}`,
							"        uses: oven-sh/setup-bun@v2",
						].join("\n"),
					),
				),
			).toEqual(stops(managerChanges(12)));
		});

	test("an if whose next line starts with a quoted string passes a dependency-only PR", () => {
		expect(
			dependencyOnly(
				[
					"      - name: Set up bun",
					"        if: github.event_name == 'push' ||",
					"          'refs/heads/main' == github.ref",
					"        uses: oven-sh/setup-bun@v2",
					"        with:",
					"          bun-version-file: package.json",
				].join("\n"),
			),
		).toEqual(passes(15));
	});

	test("a run command whose next line starts with a quoted argument passes a dependency-only PR", () => {
		expect(
			dependencyOnly(
				[
					"      - name: Lint",
					"        run: bunx biome ci",
					'          "src" "tests"',
					pinnedBun,
				].join("\n"),
			),
		).toEqual(passes(15));
	});
});

describe("a bracket, a brace or a quote that YAML reads as plain text", () => {
	test("a bracket on the next line of a description is plain text, so the input default below it stops when the PR changes .bun-version", () => {
		expect(
			actionBump([
				"description: Set up bun",
				"  [read the notes below",
				"inputs:",
				"  file:",
				"    description: The file that holds the bun version, see the notes]",
				"    default: .bun-version",
			]),
		).toEqual(stops(actionBunChanges(13, 7)));
	});

	test("a quote after a colon in a flow plain scalar is plain text, so the input default below it stops when the PR changes .bun-version", () => {
		expect(
			actionBump([
				'x-links: { docs: https:"bun }',
				"inputs:",
				"  file:",
				"    default: .bun-version",
				'x-end: done" }',
			]),
		).toEqual(stops(actionBunChanges(12, 5)));
	});

	test("an inputs block in flow style gives its defaults, so a .bun-version change that a default names stops", () => {
		expect(actionBump(["inputs: { file: { default: .bun-version } }"])).toEqual(
			stops(actionBunChanges(8, 2)),
		);
	});
});

describe("a space character that JS reads as a space and YAML does not", () => {
	for (const [name, steps, line] of [
		[
			"a comment with an ideographic space",
			`      # install\u3000deps\n${pinnedBun}`,
			13,
		],
		[
			"a step name with a no-break space",
			`      - name: Install\u00A0deps\n        run: bun install\n${pinnedBun}`,
			14,
		],
		[
			"a run block with a no-break space in its script",
			`      - run: |\n          echo "done\u00A0ok"\n${pinnedBun}`,
			14,
		],
	] as const)
		test(`${name} passes a dependency-only PR`, () => {
			expect(dependencyOnly(steps)).toEqual(passes(line));
		});
});

describe("a flow collection that names no version file", () => {
	test("a flow with mapping of actions/checkout in a file that names bun-version-file passes a dependency-only PR", () => {
		expect(
			dependencyOnly(
				`      - uses: actions/checkout@v4\n        with: { fetch-depth: 0 }\n${pinnedBun}`,
			),
		).toEqual(passes(14));
	});

	test("an escape in a double-quoted value of a flow env mapping passes a dependency-only PR", () => {
		expect(
			dependencyOnly(
				`      - run: printf "$MSG"\n        env: { MSG: "a\\tb" }\n${pinnedBun}`,
			),
		).toEqual(passes(14));
	});
});

describe("an anchor name that YAML parsers can end at another character", () => {
	test("an anchor name with a dot before a bun-version-file value stops, because a parser that ends the name at the dot reads another file", () => {
		expect(
			managerBump(workflow(setupBun(["bun-version-file: &v.1 .bun-version"])), {
				".bun-version": "1.4.2\n",
			}),
		).toEqual(
			stops(
				form(`${CHECK}:12`),
				`.bun-version: bun 1.4.2 at the base, bun 1.4.2 at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:12. The PR does not change the file.`,
			),
		);
	});
});

describe("a uses value that GitHub splits on a slash or a backslash", () => {
	for (const uses of [
		"oven-sh//setup-bun@v2",
		"oven-sh/setup-bun/@v2",
		"oven-sh\\setup-bun@v2",
		"/oven-sh/setup-bun@v2",
		"oven-sh/setup-bun/.@v2",
	])
		test(`${uses} runs oven-sh/setup-bun, which reads package.json, so a packageManager change stops`, () => {
			expect(managerBump(workflow(`      - uses: ${uses}`))).toEqual(
				stops(managerChanges(10)),
			);
		});

	test("oven-sh//setup-bun@v2 in a composite action runs oven-sh/setup-bun, so a packageManager change stops", () => {
		expect(
			managerBump(workflow("      - uses: ./.github/actions/setup"), {
				[SETUP]:
					"name: setup\nruns:\n  using: composite\n  steps:\n    - uses: oven-sh//setup-bun@v2\n",
			}),
		).toEqual(
			stops(
				`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at ${SETUP}:5. The version changes.`,
			),
		);
	});
});

describe("a bun-version that reaches setup-bun as empty", () => {
	for (const given of ["null", "~", "NULL", '" "', "'\t'"])
		test(`bun-version: ${given} reaches setup-bun as an empty input, so setup-bun reads package.json and a packageManager change stops`, () => {
			expect(
				managerBump(workflow(setupBun([`bun-version: ${given}`]))),
			).toEqual(stops(managerChanges(10)));
		});

	const fromSetup = (line: number) =>
		`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at ${SETUP}:${line}. The version changes.`;

	test("an input default of null that a local action passes on as bun-version makes setup-bun read package.json, so a packageManager change stops", () => {
		expect(
			managerBump(workflow("      - uses: ./.github/actions/setup"), {
				[SETUP]: localSetup(
					[
						"  bun-version:",
						"    description: The bun version, or empty to read package.json",
						"    default: null",
					],
					[passOn("bun-version")],
				),
			}),
		).toEqual(stops(fromSetup(9)));
	});

	test("a caller that gives a local action a blank bun-version makes setup-bun read package.json, so a packageManager change stops", () => {
		expect(
			managerBump(
				workflow(
					[
						"      - uses: ./.github/actions/setup",
						"        with:",
						'          bun-version: " "',
					].join("\n"),
				),
				{
					[SETUP]: localSetup(
						["  bun-version:", "    default: 1.4.2"],
						[passOn("bun-version")],
					),
				},
			),
		).toEqual(stops(fromSetup(8)));
	});
});

describe("the reader that setup-bun picks by the input as written", () => {
	test("bun-version-file: .bun-version/. has the basename . so setup-bun reads package.json, and a packageManager change stops", () => {
		expect(
			managerBump(workflow(setupBun(["bun-version-file: .bun-version/."])), {
				".bun-version": "1.4.2\n",
			}),
		).toEqual(
			stops(
				`.bun-version: bun 1.4.2 in package.json at the base, bun 1.5.0 in package.json at the head, from the bun-version-file of oven-sh/setup-bun at ${CHECK}:12. The version changes.`,
			),
		);
	});
});

describe("a key that is an expression", () => {
	test("a with key that an expression makes node-version-file stops, because GitHub evaluates the key", () => {
		expect(
			nvmrcBump(setupNode([`node-version-${expression("'file'")}: .nvmrc`])),
		).toEqual(stops(form(`${CHECK}:12`)));
	});

	test("a caller that gives a local action its file input under an expression key stops, because that key can override the default", () => {
		expect(
			managerBump(
				workflow(
					[
						"      - uses: ./.github/actions/setup",
						"        with:",
						`          ${expression("'file'")}: package.json`,
					].join("\n"),
				),
				{
					".bun-version": "1.4.2\n",
					[SETUP]: localSetup(
						["  file:", "    default: .bun-version"],
						[`        bun-version-file: ${expression("inputs.file")}`],
					),
				},
			),
		).toEqual(
			stops(
				form(`${CHECK}:12`),
				`.bun-version: bun 1.4.2 at the base, bun 1.4.2 at the head, from the bun-version-file of oven-sh/setup-bun at ${SETUP}:10, given at ${SETUP}:4. The PR does not change the file.`,
			),
		);
	});
});

describe("a root key of an action that the runner matches by exact case", () => {
	test("Inputs: in upper case declares no input for the runner, so the input is empty, setup-bun reads package.json and a packageManager change stops", () => {
		expect(
			managerBump(workflow("      - uses: ./.github/actions/setup"), {
				".bun-version": "1.4.2\n",
				[SETUP]: [
					"name: setup",
					"Inputs:",
					"  bun-version-file:",
					"    default: .bun-version",
					"runs:",
					"  using: composite",
					"  steps:",
					"    - uses: oven-sh/setup-bun@v2",
					"      with:",
					`        bun-version-file: ${expression("inputs.bun-version-file")}`,
					"",
				].join("\n"),
			}),
		).toEqual(
			stops(
				form(`${SETUP}:2`),
				`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at ${SETUP}:10. The version changes.`,
			),
		);
	});
});

describe("the lockfile that supabase/setup-cli reads when version is empty", () => {
	const bunLock = (supabase: string, lib = "1.0.0") =>
		`${JSON.stringify(
			{
				lockfileVersion: 1,
				workspaces: {
					"": {
						name: "fixture",
						dependencies: { "fixture-lib": lib },
						devDependencies: { supabase },
					},
				},
				packages: {
					"fixture-lib": [`fixture-lib@${lib}`, "", {}, "sha512-fixture"],
					supabase: [`supabase@${supabase}`, "", {}, "sha512-fixture"],
				},
			},
			null,
			2,
		)}\n`;
	const setupCli = workflow("      - uses: supabase/setup-cli@v3");
	const fromCli = `from the bun.lock default of supabase/setup-cli at ${CHECK}:10`;

	test("a bare setup-cli step installs the supabase of bun.lock, so a supabase bump in bun.lock stops", () => {
		expect(
			ciPins(
				pullRequest(
					{ [CHECK]: setupCli, "bun.lock": bunLock("2.40.0") },
					{ "bun.lock": bunLock("2.41.0") },
				),
			),
		).toEqual(
			stops(
				`bun.lock: supabase 2.40.0 at the base, supabase 2.41.0 at the head, ${fromCli}. The version changes.`,
			),
		);
	});

	test("a bun.lock change that keeps the supabase version passes, and a literal version keeps setup-cli off the lockfile", () => {
		const lockOnly = (ci: string) =>
			ciPins(
				pullRequest(
					{ [CHECK]: ci, "bun.lock": bunLock("2.40.0") },
					{ "bun.lock": bunLock("2.40.0", "2.0.0") },
				),
			);
		expect(lockOnly(setupCli)).toEqual({
			code: 0,
			out: `bun.lock: supabase 2.40.0 at the base, supabase 2.40.0 at the head, ${fromCli}. The version is the same.\nok: the PR changes no CI file and no tool version that CI reads from a file\n`,
			err: "",
		});
		expect(
			lockOnly(
				workflow(
					"      - uses: supabase/setup-cli@v3\n        with:\n          version: 2.40.0",
				),
			),
		).toEqual({
			code: 0,
			out: "ok: the PR changes no CI file and no tool version that CI reads from a file\n",
			err: "",
		});
	});

	test("with no supabase in bun.lock, setup-cli reads pnpm-lock.yaml, so a supabase bump there stops", () => {
		const pnpmLock = (version: string) =>
			[
				"lockfileVersion: '9.0'",
				"importers:",
				"  .:",
				"    devDependencies:",
				"      supabase:",
				`        specifier: ${version}`,
				`        version: ${version}`,
				"",
			].join("\n");
		expect(
			ciPins(
				pullRequest(
					{ [CHECK]: setupCli, "pnpm-lock.yaml": pnpmLock("2.40.0") },
					{ "pnpm-lock.yaml": pnpmLock("2.41.0") },
				),
			),
		).toEqual(
			stops(
				`bun.lock: supabase 2.40.0 in pnpm-lock.yaml at the base, supabase 2.41.0 in pnpm-lock.yaml at the head, ${fromCli}. The version changes.`,
			),
		);
	});
});

describe("a local action named by another form than ./", () => {
	const ciSetup = (step: string) =>
		`name: ci-setup\nruns:\n  using: composite\n  steps:\n    - ${step}\n`;
	const fromCiSetup =
		"from the package.json default of oven-sh/setup-bun at tools/ci-setup/action.yml:5";

	for (const uses of ["$/tools/ci-setup", ".\\tools\\ci-setup"])
		test(`uses: ${uses} runs tools/ci-setup of this repo, so a packageManager change that its setup-bun reads stops`, () => {
			expect(
				managerBump(workflow(`      - uses: ${uses}`), {
					"tools/ci-setup/action.yml": ciSetup("uses: oven-sh/setup-bun@v2"),
				}),
			).toEqual(
				stops(
					`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, ${fromCiSetup}. The version changes.`,
				),
			);
		});

	test("uses: $/tools/ci-setup runs tools/ci-setup/action.yml, so a PR that changes that file stops", () => {
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow("      - uses: $/tools/ci-setup"),
						"tools/ci-setup/action.yml": ciSetup(
							"run: echo a\n      shell: bash",
						),
					},
					{
						"tools/ci-setup/action.yml": ciSetup("uses: oven-sh/setup-bun@v2"),
					},
				),
			),
		).toEqual(
			stops(
				"tools/ci-setup/action.yml: the PR changes this CI file.",
				`package.json: no exact bun version at the base, no exact bun version at the head, ${fromCiSetup}. The PR does not change the file.`,
				`${CHECK}#static: CI sets up runner ubuntu-latest at the base and runner ubuntu-latest, bun latest (oven-sh/setup-bun@v2) at the head, so the PR changes a tool version.`,
			),
		);
	});
});

describe("an action repo that GitHub redirects after a rename", () => {
	test("xhyrom/setup-bun redirects to oven-sh/setup-bun, which reads package.json, so a packageManager change stops", () => {
		expect(managerBump(workflow("      - uses: xhyrom/setup-bun@v2"))).toEqual(
			stops(managerChanges(10)),
		);
	});
});

describe("a base branch that moves after the merge base", () => {
	const ci = workflow("      - uses: oven-sh/setup-bun@v2");
	const moved = (main: Files, head: Files = { "README.md": "x\n" }) => {
		const root = pullRequest(
			{
				[CHECK]: ci,
				"package.json": manifest({ packageManager: "bun@1.4.2" }),
			},
			head,
		);
		git(root, ["checkout", "-q", "main"]);
		write(root, main);
		git(root, ["add", "-A"]);
		git(root, ["commit", "-q", "-m", "main moves"]);
		git(root, ["checkout", "-q", "pr"]);
		return ciPins(root);
	};
	const unchanged = `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:10. The PR does not change the file.`;

	test("a packageManager bump on main after the merge base stops, because the merge commit that a pull_request run tests has another bun than HEAD", () => {
		expect(
			moved({ "package.json": manifest({ packageManager: "bun@1.5.0" }) }),
		).toEqual(
			stops(
				unchanged,
				`main moves after the merge base, and a pull_request run tests the merge: package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:10. The version changes.`,
			),
		);
	});

	test("a CI change on main after the merge base stops, because the mode ci_proof covers only the CI change of the PR", () => {
		const prChange = {
			[CHECK]: `${ci}      - run: bun test\n`,
		};
		const changesCi = `${CHECK}: the PR changes this CI file.`;
		expect(
			moved(
				{
					[CHECK]: ci.replace(
						"bun install --frozen-lockfile",
						"bun install --frozen-lockfile --verbose",
					),
				},
				prChange,
			),
		).toEqual(
			stops(
				changesCi,
				unchanged,
				`main moves after the merge base, and a pull_request run tests the merge: ${changesCi}`,
			),
		);
		expect(moved({ "docs/notes.md": "x\n" }, prChange)).toEqual({
			code: 3,
			out: [
				changesCi,
				unchanged,
				`${CHECK}#static: CI sets up runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2) at the base and at the head.`,
				"ci_proof: the PR changes CI and no tool version that CI sets up, so only CI on the head of the PR can prove it\n",
			].join("\n"),
			err: "",
		});
	});

	test("a change on main after the merge base that CI does not read passes", () => {
		expect(moved({ "docs/notes.md": "x\n" })).toEqual({
			code: 0,
			out: `${unchanged}\nok: the PR changes no CI file and no tool version that CI reads from a file\n`,
			err: "",
		});
	});
});

describe("a pnpm-lock.yaml with an alias", () => {
	test("an alias in pnpm-lock.yaml makes the lockfile unread, so a supabase bump there stops without a crash", () => {
		const pnpmLock = (version: string) =>
			[
				"a: &a [x, x, x]",
				`b: &b [${Array(9).fill("*a").join(", ")}]`,
				`c: &c [${Array(9).fill("*b").join(", ")}]`,
				`d: [${Array(9).fill("*c").join(", ")}]`,
				"importers:",
				"  .:",
				"    devDependencies:",
				"      supabase:",
				`        version: ${version}`,
				"",
			].join("\n");
		expect(
			ciPins(
				pullRequest(
					{
						[CHECK]: workflow("      - uses: supabase/setup-cli@v3"),
						"pnpm-lock.yaml": pnpmLock("2.40.0"),
					},
					{ "pnpm-lock.yaml": pnpmLock("2.41.0") },
				),
			),
		).toEqual(
			stops(
				`bun.lock: no exact supabase version in pnpm-lock.yaml at the base, no exact supabase version in pnpm-lock.yaml at the head, from the bun.lock default of supabase/setup-cli at ${CHECK}:10. astack cannot read an exact version on each side.`,
			),
		);
	});
});
