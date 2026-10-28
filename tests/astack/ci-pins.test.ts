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
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-ci-pins-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let count = 0;

type Files = Readonly<Record<string, string | { readonly link: string }>>;

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
		if (typeof text === "string") writeFileSync(join(root, path), text);
		else symlinkSync(text.link, join(root, path));
	}
}

function pullRequest(base: Files, head: Files): string {
	count += 1;
	const root = join(scratch, `repo-${count}`);
	mkdirSync(root, { recursive: true });
	git(root, ["init", "-q", "-b", "main"]);
	write(root, base);
	git(root, ["add", "-A"]);
	git(root, ["commit", "-q", "-m", "base"]);
	git(root, ["checkout", "-q", "-b", "pr"]);
	write(root, head);
	git(root, ["add", "-A"]);
	git(root, ["commit", "-q", "-m", "head"]);
	return root;
}

function ciPins(
	root: string,
	args: readonly string[] = ["--base", "main"],
): { code: number | null; out: string; err: string } {
	const result = spawnSync(
		process.execPath,
		[CLI, "check", "ci-pins", ...args],
		{ cwd: root, encoding: "utf8" },
	);
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const setupBun = (file: string) =>
	[
		"      - uses: oven-sh/setup-bun@v2",
		"        with:",
		`          bun-version-file: ${file}`,
	].join("\n");

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
		"      - run: |",
		"          bun install --frozen-lockfile",
		"          bun run check",
		"",
	].join("\n");

const expression = (body: string) => `\${{ ${body} }}`;

const manifest = (fields: Readonly<Record<string, unknown>>) =>
	`${JSON.stringify({ name: "fixture", ...fields }, null, 2)}\n`;

const bun142 = { packageManager: "bun@1.4.2" };
const libOne = { dependencies: { "fixture-lib": "1.0.0" } };
const libTwo = { dependencies: { "fixture-lib": "2.0.0" } };
const ok =
	"ok: the PR changes no CI file and no tool version that CI reads from a file\n";
const stop =
	"stop: only CI can prove this PR, for the reason in each line above\n";
const ciProof =
	"ci_proof: the PR changes CI and no tool version that CI sets up, so only CI on the head of the PR can prove it\n";
const fromCheck = (line: number) =>
	`from the bun-version-file of oven-sh/setup-bun at .github/workflows/check.yml:${line}`;

describe("astack check ci-pins", () => {
	test("a PR that changes only a dependency in package.json passes, because setup-bun reads the same packageManager", () => {
		const root = pullRequest(
			{
				".github/workflows/check.yml": workflow(setupBun("package.json")),
				"package.json": manifest({ ...bun142, ...libOne }),
			},
			{ "package.json": manifest({ ...bun142, ...libTwo }) },
		);
		const run = ciPins(root);
		expect(run).toEqual({
			code: 0,
			out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, ${fromCheck(12)}. The version is the same.\n${ok}`,
			err: "",
		});
	});

	test("a PR that changes the packageManager of package.json stops", () => {
		const root = pullRequest(
			{
				".github/workflows/check.yml": workflow(setupBun("package.json")),
				"package.json": manifest({ ...bun142, ...libOne }),
			},
			{ "package.json": manifest({ packageManager: "bun@1.4.3", ...libOne }) },
		);
		expect(ciPins(root)).toEqual({
			code: 1,
			out: `package.json: bun 1.4.2 at the base, bun 1.4.3 at the head, ${fromCheck(12)}. The version changes.\n${stop}`,
			err: "",
		});
	});

	test("a PR that changes .bun-version stops, and a version file that the PR does not change passes", () => {
		const root = pullRequest(
			{
				".github/workflows/check.yml": workflow(
					`${setupBun(".bun-version")}\n${setupBun("package.json")}`,
				),
				".bun-version": "1.4.2\n",
				"package.json": manifest(bun142),
			},
			{ ".bun-version": "1.4.3\n" },
		);
		expect(ciPins(root)).toEqual({
			code: 1,
			out: [
				`.bun-version: bun 1.4.2 at the base, bun 1.4.3 at the head, ${fromCheck(12)}. The version changes.`,
				`package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, ${fromCheck(15)}. The PR does not change the file.`,
				stop,
			].join("\n"),
			err: "",
		});
	});

	test("a package.json with no packageManager gives the engines.bun that setup-bun reads, and one with neither stops when the PR changes it", () => {
		const engines = { engines: { bun: "1.4.2" } };
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(setupBun("package.json")),
						"package.json": manifest({ ...engines, ...libOne }),
					},
					{ "package.json": manifest({ ...engines, ...libTwo }) },
				),
			),
		).toEqual({
			code: 0,
			out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, ${fromCheck(12)}. The version is the same.\n${ok}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(setupBun("package.json")),
						"package.json": manifest(libOne),
					},
					{ "package.json": manifest(libTwo) },
				),
			),
		).toEqual({
			code: 1,
			out: `package.json: no exact bun version at the base, no exact bun version at the head, ${fromCheck(12)}. astack cannot read an exact version on each side.\n${stop}`,
			err: "",
		});
	});

	test("setup-bun with no bun-version reads package.json when no bun-version-file gives a version, as setup-bun does", () => {
		const bare = workflow("      - uses: oven-sh/setup-bun@v2");
		const bump = { "package.json": manifest({ packageManager: "bun@1.5.0" }) };
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": bare,
						"package.json": manifest(bun142),
					},
					bump,
				),
			),
		).toEqual({
			code: 1,
			out: `package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at .github/workflows/check.yml:10. The version changes.\n${stop}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": bare,
						"package.json": manifest(libOne),
					},
					{ "package.json": manifest(libTwo) },
				),
			),
		).toEqual({
			code: 0,
			out: `package.json: no exact bun version at the base, no exact bun version at the head, from the package.json default of oven-sh/setup-bun at .github/workflows/check.yml:10. oven-sh/setup-bun reads no version on each side, so it gets the latest bun on each side.\n${ok}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(setupBun("tools/bun.txt")),
						"tools/bun.txt": "1.4.2\n",
						"package.json": manifest(bun142),
					},
					bump,
				),
			),
		).toEqual({
			code: 1,
			out: `tools/bun.txt: bun 1.4.2 in package.json at the base, bun 1.5.0 in package.json at the head, from the bun-version-file of oven-sh/setup-bun at .github/workflows/check.yml:12. The version changes.\n${stop}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(setupBun(".bun-version")),
						".bun-version": "1.4.2\n",
					},
					{ ".bun-version": "1.4.2\n1.5.0\n" },
				),
			),
		).toEqual({
			code: 1,
			out: `.bun-version: bun 1.4.2 at the base, no exact bun version at the head, from the bun-version-file of oven-sh/setup-bun at .github/workflows/check.yml:12. astack cannot read an exact version on each side.\n${stop}`,
			err: "",
		});
	});

	test("a composite action under .github/actions that names the file counts as a workflow", () => {
		const action = [
			"name: setup",
			"runs:",
			"  using: composite",
			"  steps:",
			"    - name: Set up bun",
			"      with:",
			"        bun-version-file: package.json",
			"      uses: oven-sh/setup-bun@v2",
			"",
		].join("\n");
		const base = {
			".github/workflows/check.yml": workflow(
				"      - uses: ./.github/actions/setup",
			),
			".github/actions/setup/action.yml": action,
			"package.json": manifest({ ...bun142, ...libOne }),
		};
		const line =
			"from the bun-version-file of oven-sh/setup-bun at .github/actions/setup/action.yml:7";
		expect(
			ciPins(
				pullRequest(base, {
					"package.json": manifest({ ...bun142, ...libTwo }),
				}),
			),
		).toEqual({
			code: 0,
			out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, ${line}. The version is the same.\n${ok}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(base, {
					"package.json": manifest({ packageManager: "bun@1.5.0", ...libOne }),
				}),
			),
		).toEqual({
			code: 1,
			out: `package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, ${line}. The version changes.\n${stop}`,
			err: "",
		});
	});

	test("a PR that changes a workflow, an action under .github/actions or a local action that a workflow uses, and no tool version, exits 3 in mode ci_proof", () => {
		const base = {
			".github/workflows/check.yml": workflow("      - uses: ./tools/ci-setup"),
			".github/actions/lint/action.yml": "runs:\n  using: composite\n",
			"tools/ci-setup/action.yml": "runs:\n  using: composite\n  steps: []\n",
			"tools/other.ts": "export {};\n",
		};
		const changed = (path: string) =>
			ciPins(pullRequest(base, { [path]: "# changed\n" }));
		for (const path of [
			".github/workflows/check.yml",
			".github/actions/lint/action.yml",
			"tools/ci-setup/action.yml",
			"tools/ci-setup/install.sh",
		])
			expect(changed(path)).toEqual({
				code: 3,
				out: `${path}: the PR changes this CI file.\n.github/workflows/check.yml#static: CI sets up runner ubuntu-latest at the base ${path === ".github/workflows/check.yml" ? "only" : "and at the head"}.\n${ciProof}`,
				err: "",
			});
		expect(changed("tools/other.ts")).toEqual({ code: 0, out: ok, err: "" });
	});

	test("an input that the scan cannot read, or a file that astack reads no version from, stops only when it can hide a change", () => {
		const flow = workflow(
			"      - uses: oven-sh/setup-bun@v2\n        with: { bun-version-file: [package.json] }",
		);
		const go = workflow(
			"      - uses: actions/setup-go@v5\n        with:\n          go-version-file: go.mod",
		);
		const changeOf = (files: Files, head: Files) =>
			ciPins(pullRequest(files, head));
		expect(
			changeOf(
				{
					".github/workflows/check.yml": flow,
					"package.json": manifest(bun142),
				},
				{ "README.md": "x\n" },
			),
		).toEqual({
			code: 1,
			out: `.github/workflows/check.yml:11: astack cannot read this line, which names a version-file input or a local action.\n${stop}`,
			err: "",
		});
		expect(
			changeOf(
				{
					".github/workflows/check.yml": workflow(
						"      - uses: [./tools/ci-setup]",
					),
					"tools/ci-setup/action.yml": "runs:\n  using: composite\n",
				},
				{ "README.md": "x\n" },
			),
		).toEqual({
			code: 1,
			out: `.github/workflows/check.yml:10: astack cannot read this line, which names a version-file input or a local action.\n${stop}`,
			err: "",
		});
		const goFiles = {
			".github/workflows/check.yml": go,
			"go.mod": "module fixture\n\ngo 1.24.0\n",
		};
		expect(
			changeOf(goFiles, { "go.mod": "module fixture\n\ngo 1.24.1\n" }),
		).toEqual({
			code: 1,
			out: `go.mod: astack reads no version from the go-version-file of actions/setup-go at .github/workflows/check.yml:12. The PR changes the file.\n${stop}`,
			err: "",
		});
		expect(changeOf(goFiles, { "README.md": "x\n" }).code).toBe(0);
	});

	test("a setup action that declares a version-file input and passes it on reads the file that each caller gives, so a README-only PR passes", () => {
		const action = [
			"name: setup",
			"inputs:",
			"  bun-version-file:",
			"    description: The file that holds the bun version",
			"    default: .bun-version",
			"runs:",
			"  using: composite",
			"  steps:",
			"    - uses: oven-sh/setup-bun@v2",
			"      with:",
			`        bun-version-file: ${expression("inputs.bun-version-file")}`,
			"",
		].join("\n");
		const base = {
			".github/workflows/check.yml": workflow(
				[
					"      - uses: ./.github/actions/setup",
					"        with:",
					"          bun-version-file: package.json",
					"      - uses: ./.github/actions/setup",
				].join("\n"),
			),
			".github/actions/setup/action.yml": action,
			".bun-version": "1.4.2\n",
			"package.json": manifest(bun142),
		};
		const read = (given: string) =>
			`from the bun-version-file of oven-sh/setup-bun at .github/actions/setup/action.yml:11, given at ${given}`;
		const unchanged = `.bun-version: bun 1.4.2 at the base, bun 1.4.2 at the head, ${read(".github/actions/setup/action.yml:5")}. The PR does not change the file.`;
		expect(ciPins(pullRequest(base, { "README.md": "x\n" }))).toEqual({
			code: 0,
			out: [
				`package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, ${read(".github/workflows/check.yml:12")}. The PR does not change the file.`,
				unchanged,
				ok,
			].join("\n"),
			err: "",
		});
		expect(
			ciPins(
				pullRequest(base, {
					"package.json": manifest({ packageManager: "bun@1.5.0" }),
				}),
			),
		).toEqual({
			code: 1,
			out: [
				`package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, ${read(".github/workflows/check.yml:12")}. The version changes.`,
				unchanged,
				stop,
			].join("\n"),
			err: "",
		});
	});

	test("a version-file input that astack cannot resolve to a file stops only when the PR changes a file that the action can read, and a path outside the repo always stops", () => {
		const viaExpression = {
			".github/workflows/check.yml": workflow(
				setupBun(`${expression("github.workspace")}/package.json`),
			),
			"package.json": manifest(bun142),
		};
		const line = `.github/workflows/check.yml:12: the bun-version-file of oven-sh/setup-bun is \${{ github.workspace }}/package.json, which astack cannot resolve to a file.`;
		expect(ciPins(pullRequest(viaExpression, { "README.md": "x\n" }))).toEqual({
			code: 0,
			out: `${line} The PR changes no file that the action can read a version from.\n${ok}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(viaExpression, {
					"package.json": manifest({ packageManager: "bun@1.4.3" }),
				}),
			),
		).toEqual({
			code: 1,
			out: `${line} The PR changes package.json, which the action can read a version from.\n${stop}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(
							setupBun("../shared/package.json"),
						),
					},
					{ "README.md": "x\n" },
				),
			),
		).toEqual({
			code: 1,
			out: `.github/workflows/check.yml:12: the bun-version-file of oven-sh/setup-bun is ../shared/package.json, which is not a file path in the repo.\n${stop}`,
			err: "",
		});
	});

	test("a version file that is missing or is not a regular file stops, because CI can read another file", () => {
		const underPath = [
			"      - uses: actions/checkout@v4",
			"        with:",
			"          path: app",
			"      - uses: actions/setup-node@v4",
			"        with:",
			"          node-version-file: app/.nvmrc",
		].join("\n");
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(underPath),
						".nvmrc": "22.11.0\n",
					},
					{ ".nvmrc": "22.12.0\n" },
				),
			),
		).toEqual({
			code: 1,
			out: `app/.nvmrc: no file at the base, no file at the head, from the node-version-file of actions/setup-node at .github/workflows/check.yml:15. astack cannot read the file that CI reads.\n${stop}`,
			err: "",
		});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(setupBun(".bun-version")),
						".bun-version": { link: "config/bun" },
						"config/bun": "1.4.2\n",
					},
					{ "config/bun": "1.5.0\n" },
				),
			),
		).toEqual({
			code: 1,
			out: `.bun-version: no regular file at the base, no regular file at the head, ${fromCheck(12)}. astack cannot read the file that CI reads.\n${stop}`,
			err: "",
		});
	});

	test("a version-file input in mixed case, after an anchor or through an alias, is read or stops the run", () => {
		const bump = { "package.json": manifest({ packageManager: "bun@1.5.0" }) };
		const run = (steps: string, head: Files = bump) =>
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(steps),
						".nvmrc": "22.11.0\n",
						"package.json": manifest(bun142),
					},
					head,
				),
			);
		expect(
			run(
				"      - uses: actions/setup-node@v4\n        with:\n          Node-Version-File: .nvmrc",
				{ ".nvmrc": "22.12.0\n" },
			),
		).toEqual({
			code: 1,
			out: `.nvmrc: node 22.11.0 at the base, node 22.12.0 at the head, from the node-version-file of actions/setup-node at .github/workflows/check.yml:12. The version changes.\n${stop}`,
			err: "",
		});
		expect(
			run(
				"      - uses: oven-sh/setup-bun@v2\n        with: &bun { bun-version-file: package.json }",
			),
		).toEqual({
			code: 1,
			out: `package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the bun-version-file of oven-sh/setup-bun at .github/workflows/check.yml:11. The version changes.\n${stop}`,
			err: "",
		});
		expect(
			run(
				"      - uses: actions/setup-node@v4\n        with: &node\n          node-version-file: .nvmrc\n      - uses: actions/setup-node@v4\n        with: *node",
				{ "README.md": "x\n" },
			),
		).toEqual({
			code: 1,
			out: `.github/workflows/check.yml:14: astack does not read this YAML form, so it cannot tell what CI reads.\n.nvmrc: node 22.11.0 at the base, node 22.11.0 at the head, from the node-version-file of actions/setup-node at .github/workflows/check.yml:12. The PR does not change the file.\n${stop}`,
			err: "",
		});
	});

	test("a local action outside .github/actions, also one that another local action uses, gives the version file that it names", () => {
		const setup = [
			"name: ci-setup",
			"runs:",
			"  using: composite",
			"  steps:",
			"    - uses: oven-sh/setup-bun@v2",
			"      with:",
			"        bun-version-file: package.json",
			"",
		].join("\n");
		const layouts: readonly (readonly [Files, string])[] = [
			[{ "tools/ci-setup/action.yml": setup }, "tools/ci-setup/action.yml:7"],
			[
				{
					"tools/ci-setup/action.yml":
						"runs:\n  using: composite\n  steps:\n    - uses: ./tools/b\n",
					"tools/b/action.yaml": setup,
				},
				"tools/b/action.yaml:7",
			],
		];
		for (const [actions, source] of layouts) {
			const base = {
				".github/workflows/check.yml": workflow(
					"      - uses: ./tools/ci-setup",
				),
				...actions,
				"package.json": manifest({ ...bun142, ...libOne }),
			};
			const from = `from the bun-version-file of oven-sh/setup-bun at ${source}`;
			expect(
				ciPins(
					pullRequest(base, {
						"package.json": manifest({ ...bun142, ...libTwo }),
					}),
				),
			).toEqual({
				code: 0,
				out: `package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, ${from}. The version is the same.\n${ok}`,
				err: "",
			});
			expect(
				ciPins(
					pullRequest(base, {
						"package.json": manifest({
							packageManager: "bun@1.4.3",
							...libOne,
						}),
					}),
				),
			).toEqual({
				code: 1,
				out: `package.json: bun 1.4.2 at the base, bun 1.4.3 at the head, ${from}. The version changes.\n${stop}`,
				err: "",
			});
		}
	});

	test("a uses value on the next line, a folded uses value or an explicit key names the local action that YAML reads there", () => {
		const run = (steps: string) =>
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(steps),
						"tools/setup/action.yml":
							"runs:\n  using: composite\n  steps:\n    - uses: oven-sh/setup-bun@v2\n",
						"package.json": manifest(bun142),
					},
					{ "package.json": manifest({ packageManager: "bun@1.5.0" }) },
				),
			);
		for (const steps of [
			"      - uses:\n          ./tools/setup",
			"      - uses: >-\n          ./tools/setup",
			"      - ? uses\n        : ./tools/setup",
		])
			expect(run(steps)).toEqual({
				code: 1,
				out: `package.json: bun 1.4.2 at the base, bun 1.5.0 at the head, from the package.json default of oven-sh/setup-bun at tools/setup/action.yml:4. The version changes.\n${stop}`,
				err: "",
			});
		expect(run("      - uses: |\n          ./tools/setup")).toEqual({
			code: 1,
			out: `.github/workflows/check.yml:10: astack cannot read this line, which names a version-file input or a local action.\n${stop}`,
			err: "",
		});
	});

	test("setup-node reads volta.node, devEngines.runtime or engines.node from package.json, and the nodejs line of .tool-versions", () => {
		const setupNode = (file: string) =>
			`      - uses: actions/setup-node@v4\n        with:\n          node-version-file: ${file}`;
		const from =
			"from the node-version-file of actions/setup-node at .github/workflows/check.yml:12";
		for (const pin of [
			{ volta: { node: "22.11.0" } },
			{ devEngines: { runtime: { name: "node", version: "22.11.0" } } },
			{ engines: { node: "22.11.0" } },
		])
			expect(
				ciPins(
					pullRequest(
						{
							".github/workflows/check.yml": workflow(
								setupNode("package.json"),
							),
							"package.json": manifest({ ...pin, ...libOne }),
						},
						{ "package.json": manifest({ ...pin, ...libTwo }) },
					),
				),
			).toEqual({
				code: 0,
				out: `package.json: node 22.11.0 at the base, node 22.11.0 at the head, ${from}. The version is the same.\n${ok}`,
				err: "",
			});
		expect(
			ciPins(
				pullRequest(
					{
						".github/workflows/check.yml": workflow(
							setupNode(".tool-versions"),
						),
						".tool-versions": "bun 1.4.2\nnodejs 22.11.0\n",
					},
					{ ".tool-versions": "bun 1.4.3\nnodejs 22.11.0\n" },
				),
			),
		).toEqual({
			code: 0,
			out: `.tool-versions: node 22.11.0 at the base, node 22.11.0 at the head, ${from}. The version is the same.\n${ok}`,
			err: "",
		});
	});

	test("a check that cannot run exits 2, so the run never takes it as a pass", () => {
		const root = pullRequest({ "a.txt": "a\n" }, { "a.txt": "b\n" });
		expect(ciPins(root, [])).toEqual({
			code: 2,
			out: "",
			err: "astack check ci-pins: give --base <ref>\n",
		});
		expect(ciPins(root, ["--base", "gone"]).code).toBe(2);
	});
});

describe("a PR that changes CI and no tool version runs in mode ci_proof", () => {
	const CHECK = ".github/workflows/check.yml";
	const changesCi = `${CHECK}: the PR changes this CI file.`;
	const bunAndCli = [
		setupBun("package.json"),
		"      - uses: supabase/setup-cli@v1",
		"        with:",
		"          version: 2.117.0",
	].join("\n");
	const strict = (ci: string) =>
		ci.replace("bun run check", "bun run check --strict");
	const packageJson = (base: string, head: string, end: string) =>
		`package.json: bun ${base} at the base, bun ${head} at the head, ${fromCheck(12)}. ${end}`;
	const sameBun = packageJson(
		"1.4.2",
		"1.4.2",
		"The PR does not change the file.",
	);
	const exits = (code: number, ...lines: readonly string[]) => ({
		code,
		out: [...lines, code === 3 ? ciProof : stop].join("\n"),
		err: "",
	});
	const run = (base: Files, head: Files) => ciPins(pullRequest(base, head));

	test("a PR that changes only a run step of a workflow exits 3, and its last line names the mode ci_proof", () => {
		expect(
			run(
				{ [CHECK]: workflow(bunAndCli), "package.json": manifest(bun142) },
				{ [CHECK]: strict(workflow(bunAndCli)) },
			),
		).toEqual(
			exits(
				3,
				changesCi,
				sameBun,
				`${CHECK}#static: CI sets up runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2), supabase 2.117.0 (supabase/setup-cli@v1) at the base and at the head.`,
			),
		);
	});

	test("a PR that changes CI and a file outside CI exits 1, because a red gate can then come from that file and not from CI", () => {
		expect(
			run(
				{
					[CHECK]: workflow(bunAndCli),
					"package.json": manifest(bun142),
					"src/a.ts": "export const a = 1;\n",
				},
				{
					[CHECK]: strict(workflow(bunAndCli)),
					"src/a.ts": "export const a = 2;\n",
				},
			),
		).toEqual(
			exits(
				1,
				changesCi,
				sameBun,
				"src/a.ts: the PR also changes this file, which is not a CI file, so the run cannot go on in mode ci_proof.",
			),
		);
	});

	test("a PR that changes a workflow and the bun pin in package.json exits 1, because a tool version that CI reads from a file changes", () => {
		expect(
			run(
				{ [CHECK]: workflow(bunAndCli), "package.json": manifest(bun142) },
				{
					[CHECK]: strict(workflow(bunAndCli)),
					"package.json": manifest({ packageManager: "bun@1.4.3" }),
				},
			),
		).toEqual(
			exits(
				1,
				changesCi,
				packageJson("1.4.2", "1.4.3", "The version changes."),
			),
		);
	});

	test("a PR that changes the version that a workflow gives setup-cli, or the version file that setup-bun reads, exits 1", () => {
		const base = {
			[CHECK]: workflow(bunAndCli),
			"package.json": manifest(bun142),
			".bun-version": "1.4.3\n",
		};
		expect(
			run(base, {
				[CHECK]: workflow(bunAndCli.replace("2.117.0", "2.118.0")),
			}),
		).toEqual(
			exits(
				1,
				changesCi,
				sameBun,
				`${CHECK}#static: CI sets up runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2), supabase 2.117.0 (supabase/setup-cli@v1) at the base and runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2), supabase 2.118.0 (supabase/setup-cli@v1) at the head, so the PR changes a tool version.`,
			),
		);
		expect(
			run(base, {
				[CHECK]: workflow(bunAndCli.replace("package.json", ".bun-version")),
			}),
		).toEqual(
			exits(
				1,
				changesCi,
				`.bun-version: bun 1.4.3 at the base, bun 1.4.3 at the head, ${fromCheck(12)}. The PR does not change the file.`,
				`${CHECK}#static: CI sets up runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2), supabase 2.117.0 (supabase/setup-cli@v1) at the base and runner ubuntu-latest, bun 1.4.3 (oven-sh/setup-bun@v2), supabase 2.117.0 (supabase/setup-cli@v1) at the head, so the PR changes a tool version.`,
			),
		);
	});

	test("a YAML form that astack does not read stops a PR that changes CI, at the head and at the base", () => {
		const labelled = (second: string) =>
			workflow(
				[
					bunAndCli,
					"      - name: &label lint",
					"        run: bun run lint",
					`      - name: ${second}`,
					"        run: bun run lint",
				].join("\n"),
			);
		const form = `${CHECK}:18: astack does not read this YAML form, so it cannot tell what CI reads.`;
		const files = (ci: string) => ({
			[CHECK]: ci,
			"package.json": manifest(bun142),
		});
		expect(run(files(labelled("lint")), files(labelled("*label")))).toEqual(
			exits(1, changesCi, form, sameBun),
		);
		expect(run(files(labelled("*label")), files(labelled("lint")))).toEqual(
			exits(1, changesCi, sameBun, `CI at the base: ${form}`),
		);
	});

	test("a tool version that astack cannot read, such as a matrix value, stops a PR that changes CI", () => {
		const ci = workflow(
			[
				"      - uses: oven-sh/setup-bun@v2",
				"        with:",
				`          bun-version: ${expression("matrix.bun")}`,
			].join("\n"),
		);
		const unread = `${CHECK}:12: astack cannot read the tool version that this step gets, so it cannot tell whether the PR changes it.`;
		expect(
			run(
				{ [CHECK]: ci, "package.json": manifest(bun142) },
				{ [CHECK]: strict(ci) },
			),
		).toEqual(
			exits(
				1,
				changesCi,
				`package.json: bun 1.4.2 at the base, bun 1.4.2 at the head, from the package.json default of oven-sh/setup-bun at ${CHECK}:10. The PR does not change the file.`,
				`CI at the base: ${unread}`,
				`CI at the head: ${unread}`,
			),
		);
	});

	test("a version input of another action is a tool version, so a go-version change exits 1 and a run step change exits 3", () => {
		const go = (version: string) =>
			workflow(
				`      - uses: actions/setup-go@v5\n        with:\n          go-version: ${version}`,
			);
		const base = { [CHECK]: go("1.24.0") };
		expect(run(base, { [CHECK]: go("1.24.1") })).toEqual(
			exits(
				1,
				changesCi,
				`${CHECK}#static: CI sets up runner ubuntu-latest, go-version 1.24.0 (actions/setup-go@v5) at the base and runner ubuntu-latest, go-version 1.24.1 (actions/setup-go@v5) at the head, so the PR changes a tool version.`,
			),
		);
		expect(run(base, { [CHECK]: strict(go("1.24.0")) })).toEqual(
			exits(
				3,
				changesCi,
				`${CHECK}#static: CI sets up runner ubuntu-latest, go-version 1.24.0 (actions/setup-go@v5) at the base and at the head.`,
			),
		);
	});

	test("each job keeps its own tool versions, and a new job sets up only a tool version that CI sets up at the base", () => {
		const job = (name: string, version: string) => [
			`  ${name}:`,
			"    runs-on: ubuntu-latest",
			"    steps:",
			"      - uses: oven-sh/setup-bun@v2",
			"        with:",
			`          bun-version: ${version}`,
		];
		const jobs = (...each: readonly (readonly [string, string])[]) =>
			[
				"name: check",
				"on:",
				"  pull_request:",
				"jobs:",
				...each.flatMap(([name, version]) => job(name, version)),
				"",
			].join("\n");
		const base = { [CHECK]: jobs(["a", "1.4.2"], ["b", "1.4.3"]) };
		const same = (name: string, version: string) =>
			`${CHECK}#${name}: CI sets up runner ubuntu-latest, bun ${version} (oven-sh/setup-bun@v2) at the base and at the head.`;
		expect(
			run(base, { [CHECK]: jobs(["a", "1.4.3"], ["b", "1.4.2"]) }),
		).toEqual(
			exits(
				1,
				changesCi,
				`${CHECK}#a: CI sets up runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2) at the base and runner ubuntu-latest, bun 1.4.3 (oven-sh/setup-bun@v2) at the head, so the PR changes a tool version.`,
				`${CHECK}#b: CI sets up runner ubuntu-latest, bun 1.4.3 (oven-sh/setup-bun@v2) at the base and runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2) at the head, so the PR changes a tool version.`,
			),
		);
		expect(
			run(base, {
				[CHECK]: jobs(["a", "1.4.2"], ["b", "1.4.3"], ["c", "1.4.3"]),
			}),
		).toEqual(
			exits(
				3,
				changesCi,
				same("a", "1.4.2"),
				same("b", "1.4.3"),
				`${CHECK}#c: CI sets up runner ubuntu-latest, bun 1.4.3 (oven-sh/setup-bun@v2) at the head only, and CI at the base sets up each of them in another job or action.`,
			),
		);
		expect(
			run(base, {
				[CHECK]: jobs(["a", "1.4.2"], ["b", "1.4.3"], ["c", "1.5.0"]),
			}),
		).toEqual(
			exits(
				1,
				changesCi,
				same("a", "1.4.2"),
				same("b", "1.4.3"),
				`${CHECK}#c: CI sets up runner ubuntu-latest, bun 1.5.0 (oven-sh/setup-bun@v2) at the head only, and CI at the base sets up bun 1.5.0 (oven-sh/setup-bun@v2) in no job or action, so the PR changes a tool version.`,
			),
		);
		expect(run(base, { [CHECK]: jobs(["a", "1.4.2"]) })).toEqual(
			exits(
				3,
				changesCi,
				same("a", "1.4.2"),
				`${CHECK}#b: CI sets up runner ubuntu-latest, bun 1.4.3 (oven-sh/setup-bun@v2) at the base only.`,
			),
		);
	});

	test("a PR that changes the ref, another input or the if of a setup step exits 1, because each of them can change the tool that CI gets", () => {
		const base = {
			[CHECK]: workflow(bunAndCli),
			"package.json": manifest(bun142),
		};
		const bunFile = "          bun-version-file: package.json";
		const withBun = (line: string) =>
			workflow(bunAndCli.replace(bunFile, `${bunFile}\n${line}`));
		const was =
			"runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2), supabase 2.117.0 (supabase/setup-cli@v1)";
		const changes = (now: string) =>
			`${CHECK}#static: CI sets up ${was} at the base and ${now} at the head, so the PR changes a tool version.`;
		expect(
			run(base, {
				[CHECK]: workflow(
					bunAndCli.replace("setup-cli@v1", "setup-cli@v3.0.1"),
				),
			}),
		).toEqual(
			exits(
				1,
				changesCi,
				sameBun,
				changes(
					"runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2), supabase 2.117.0 (supabase/setup-cli@v3.0.1)",
				),
			),
		);
		expect(
			run(base, {
				[CHECK]: withBun(
					"          bun-download-url: https://example.com/bun.zip",
				),
			}),
		).toEqual(
			exits(
				1,
				changesCi,
				sameBun,
				changes(
					"runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2, bun-download-url https://example.com/bun.zip), supabase 2.117.0 (supabase/setup-cli@v1)",
				),
			),
		);
		expect(run(base, { [CHECK]: withBun("        if: false") })).toEqual(
			exits(
				1,
				changesCi,
				sameBun,
				changes(
					"runner ubuntu-latest, bun 1.4.2 (oven-sh/setup-bun@v2, if false), supabase 2.117.0 (supabase/setup-cli@v1)",
				),
			),
		);
	});

	const ciJobs = (jobs: Readonly<Record<string, readonly string[]>>) =>
		[
			"name: check",
			"on:",
			"  pull_request:",
			"jobs:",
			...Object.entries(jobs).flatMap(([name, steps]) => [
				`  ${name}:`,
				"    runs-on: ubuntu-latest",
				"    steps:",
				...steps,
			]),
			"",
		].join("\n");
	const bunAction = (version: string) =>
		[
			"runs:",
			"  using: composite",
			"  steps:",
			"    - uses: oven-sh/setup-bun@v2",
			"      with:",
			`        bun-version: ${version}`,
			"",
		].join("\n");
	const callAction = (name: string, bun?: string) => [
		`      - uses: ./.github/actions/${name}`,
		...(bun === undefined ? [] : ["        with:", `          bun: ${bun}`]),
	];
	const cli = [
		"      - uses: supabase/setup-cli@v1",
		"        with:",
		"          version: 2.117.0",
	];
	const bun = (version: string) => `bun ${version} (oven-sh/setup-bun@v2)`;
	const supabase = "supabase 2.117.0 (supabase/setup-cli@v1)";
	const onRunner = (pins: string) => `runner ubuntu-latest, ${pins}`;
	const changed = (job: string, was: string, now: string) =>
		`${CHECK}#${job}: CI sets up ${was} at the base and ${now} at the head, so the PR changes a tool version.`;

	test("a job that calls a local action gets the tool versions of that action in its own place, with the inputs of that call only", () => {
		const actions = {
			".github/actions/stable/action.yml": bunAction("1.2.3"),
			".github/actions/canary/action.yml": bunAction("1.3.0"),
		};
		expect(
			run(
				{ ...actions, [CHECK]: ciJobs({ static: callAction("stable") }) },
				{ [CHECK]: ciJobs({ static: callAction("canary") }) },
			),
		).toEqual(
			exits(
				1,
				changesCi,
				changed("static", onRunner(bun("1.2.3")), onRunner(bun("1.3.0"))),
			),
		);
		const shared = {
			".github/actions/setup/action.yml": [
				"inputs:",
				"  bun:",
				"    required: true",
				bunAction(expression("inputs.bun")),
			].join("\n"),
		};
		const callers = (lint: string, test: string) =>
			ciJobs({
				lint: callAction("setup", lint),
				test: callAction("setup", test),
			});
		expect(
			run(
				{ ...shared, [CHECK]: callers("1.2.3", "1.3.0") },
				{ [CHECK]: callers("1.3.0", "1.2.3") },
			),
		).toEqual(
			exits(
				1,
				changesCi,
				changed("lint", onRunner(bun("1.2.3")), onRunner(bun("1.3.0"))),
				changed("test", onRunner(bun("1.3.0")), onRunner(bun("1.2.3"))),
			),
		);
		const local = { ".github/actions/bun/action.yml": bunAction("1.4.2") };
		expect(
			run(
				{
					...local,
					[CHECK]: ciJobs({ static: [...callAction("bun"), ...cli] }),
				},
				{ [CHECK]: ciJobs({ static: [...cli, ...callAction("bun")] }) },
			),
		).toEqual(
			exits(
				1,
				changesCi,
				changed(
					"static",
					onRunner(`${bun("1.4.2")}, ${supabase}`),
					onRunner(`${supabase}, ${bun("1.4.2")}`),
				),
			),
		);
	});

	test("an if in a local action that reads an input counts with the inputs of each call, so a swap of those inputs between jobs exits 1", () => {
		const step = (condition: string, version: string) => [
			"    - uses: oven-sh/setup-bun@v2",
			`      if: ${condition}`,
			"      with:",
			`        bun-version: ${version}`,
		];
		const stable = "inputs.canary != 'true'";
		const canary = "inputs.canary == 'true'";
		const action = [
			"inputs:",
			"  canary:",
			"    default: 'false'",
			"runs:",
			"  using: composite",
			"  steps:",
			...step(stable, "1.2.3"),
			...step(canary, "1.3.0"),
			"",
		].join("\n");
		const call = (value: string) => [
			"      - uses: ./.github/actions/setup",
			"        with:",
			`          canary: '${value}'`,
		];
		const callers = (lint: string, test: string) =>
			ciJobs({ lint: call(lint), test: call(test) });
		const pins = (value: string) =>
			[
				`bun 1.2.3 (oven-sh/setup-bun@v2, if ${stable}, canary ${value})`,
				`bun 1.3.0 (oven-sh/setup-bun@v2, if ${canary}, canary ${value})`,
			].join(", ");
		expect(
			run(
				{
					".github/actions/setup/action.yml": action,
					[CHECK]: callers("false", "true"),
				},
				{ [CHECK]: callers("true", "false") },
			),
		).toEqual(
			exits(
				1,
				changesCi,
				changed("lint", onRunner(pins("false")), onRunner(pins("true"))),
				changed("test", onRunner(pins("true")), onRunner(pins("false"))),
			),
		);
	});

	test("a job that loses its last setup step, or a job that a rename gives the tool of another job, exits 1", () => {
		const node = [
			"      - uses: actions/setup-node@v4",
			"        with:",
			"          node-version: 20.11.0",
		];
		const npm = ["      - run: npm test"];
		expect(
			run(
				{ [CHECK]: ciJobs({ test: [...node, ...npm] }) },
				{ [CHECK]: ciJobs({ test: npm }) },
			),
		).toEqual(
			exits(
				1,
				changesCi,
				changed(
					"test",
					onRunner("node 20.11.0 (actions/setup-node@v4)"),
					"runner ubuntu-latest",
				),
			),
		);
		const setupBun = (version: string) => [
			"      - uses: oven-sh/setup-bun@v2",
			"        with:",
			`          bun-version: ${version}`,
		];
		expect(
			run(
				{
					[CHECK]: ciJobs({ a: setupBun("1.4.2"), b: setupBun("1.4.3") }),
				},
				{
					[CHECK]: ciJobs({ b: setupBun("1.4.3"), c: setupBun("1.4.3") }),
				},
			),
		).toEqual(
			exits(
				1,
				changesCi,
				`${CHECK}#a: CI sets up ${onRunner(bun("1.4.2"))} at the base only.`,
				`${CHECK}#b: CI sets up ${onRunner(bun("1.4.3"))} at the base and at the head.`,
				`${CHECK}#c: CI sets up ${onRunner(bun("1.4.3"))} at the head only, and the PR also removes ${CHECK}#a, so a tool version can move from one job to another.`,
			),
		);
	});

	test("a PR that changes the runner, a container or service image, the ref of a remote workflow or adds a setup action with no input exits 1", () => {
		const steps = ["      - run: bun test"];
		const base = { [CHECK]: ciJobs({ static: steps }) };
		const runner = "runner ubuntu-latest";
		const withJob = (lines: readonly string[]) =>
			ciJobs({ static: steps }).replace(
				"    runs-on: ubuntu-latest\n",
				`    runs-on: ubuntu-latest\n${lines.join("\n")}\n`,
			);
		expect(
			run(base, {
				[CHECK]: ciJobs({ static: steps }).replace(
					"ubuntu-latest",
					"ubuntu-24.04",
				),
			}),
		).toEqual(
			exits(1, changesCi, changed("static", runner, "runner ubuntu-24.04")),
		);
		const container = (tag: string) =>
			withJob([`    container: oven/bun:${tag}`]);
		expect(
			run({ [CHECK]: container("1.4.2") }, { [CHECK]: container("1.4.3") }),
		).toEqual(
			exits(
				1,
				changesCi,
				changed(
					"static",
					`${runner}, container oven/bun:1.4.2`,
					`${runner}, container oven/bun:1.4.3`,
				),
			),
		);
		const service = (tag: string) =>
			withJob(["    services:", "      db:", `        image: postgres:${tag}`]);
		expect(run({ [CHECK]: service("16") }, { [CHECK]: service("17") })).toEqual(
			exits(
				1,
				changesCi,
				changed(
					"static",
					`${runner}, service db postgres:16`,
					`${runner}, service db postgres:17`,
				),
			),
		);
		const remote = (ref: string) =>
			[
				"name: check",
				"on:",
				"  pull_request:",
				"jobs:",
				"  call:",
				`    uses: example/ci/.github/workflows/test.yml@${ref}`,
				"",
			].join("\n");
		expect(run({ [CHECK]: remote("v1") }, { [CHECK]: remote("v2") })).toEqual(
			exits(
				1,
				changesCi,
				changed(
					"call",
					"workflow (example/ci/.github/workflows/test.yml@v1)",
					"workflow (example/ci/.github/workflows/test.yml@v2)",
				),
			),
		);
		expect(
			run(base, {
				[CHECK]: ciJobs({
					static: ["      - uses: actions/setup-python@v5", ...steps],
				}),
			}),
		).toEqual(
			exits(
				1,
				changesCi,
				changed(
					"static",
					runner,
					`${runner}, default version (actions/setup-python@v5)`,
				),
			),
		);
		const unread = `${CHECK}:6: astack cannot read the tool version that this step gets, so it cannot tell whether the PR changes it.`;
		expect(
			run(
				{
					[CHECK]: ciJobs({ static: steps }).replace(
						"ubuntu-latest",
						expression("matrix.os"),
					),
				},
				{
					[CHECK]: ciJobs({ static: ["      - run: bun test --bail"] }).replace(
						"ubuntu-latest",
						expression("matrix.os"),
					),
				},
			),
		).toEqual(
			exits(
				1,
				changesCi,
				`CI at the base: ${unread}`,
				`CI at the head: ${unread}`,
			),
		);
	});

	test("a version input with an underscore or a toolchain input of another action is a tool version, so its change exits 1", () => {
		const step = (input: string, value: string) =>
			ciJobs({
				static: [
					"      - uses: example/build-action@v1",
					"        with:",
					`          ${input}: ${value}`,
				],
			});
		for (const [input, was, now] of [
			["node_version", "20.11.0", "20.12.0"],
			["toolchain", "1.80.0", "1.81.0"],
		] as const)
			expect(
				run({ [CHECK]: step(input, was) }, { [CHECK]: step(input, now) }),
			).toEqual(
				exits(
					1,
					changesCi,
					changed(
						"static",
						onRunner(`${input} ${was} (example/build-action@v1)`),
						onRunner(`${input} ${now} (example/build-action@v1)`),
					),
				),
			);
	});

	test("a plain version input, a version-file path and an expression in a version input of another action each count", () => {
		const step = (input: string, value: string) =>
			ciJobs({
				static: [
					"      - uses: example/build-action@v1",
					"        with:",
					`          ${input}: ${value}`,
				],
			});
		const files = {
			".python-version": "3.12.1\n",
			"tools/.python-version": "3.13.0\n",
		};
		const noVersion = `tools/.python-version: astack reads no version from the python-version-file of example/build-action at ${CHECK}:10. The PR does not change the file.`;
		for (const [input, was, now, ...read] of [
			["version", "9.0.0", "9.1.0"],
			[
				"python-version-file",
				".python-version",
				"tools/.python-version",
				noVersion,
			],
		] as const)
			expect(
				run(
					{ ...files, [CHECK]: step(input, was) },
					{ [CHECK]: step(input, now) },
				),
			).toEqual(
				exits(
					1,
					changesCi,
					...read,
					changed(
						"static",
						onRunner(`${input} ${was} (example/build-action@v1)`),
						onRunner(`${input} ${now} (example/build-action@v1)`),
					),
				),
			);
		const unread = `${CHECK}:10: astack cannot read the tool version that this step gets, so it cannot tell whether the PR changes it.`;
		const matrix = step("go-version", expression("matrix.go"));
		expect(
			run({ [CHECK]: matrix }, { [CHECK]: `${matrix}      - run: go test\n` }),
		).toEqual(
			exits(
				1,
				changesCi,
				`CI at the base: ${unread}`,
				`CI at the head: ${unread}`,
			),
		);
	});
});
