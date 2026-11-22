import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { heavyTestTimeout } from "../heavy-test.ts";
import {
	BASE_FILES,
	type Files,
	git,
	LADDER_FILES,
	PROOF_FILES,
	scratchDir,
	validProof,
	writeFiles,
} from "./change-proof-fixture.ts";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = scratchDir("astack-change-proof-manifest-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const OLDER = '{"version":1,"change":"an-older-change"}\n';
const M0 = ".astack/proof/m0.json";
const LEGACY = ".astack/proof.json";

type Run = { code: number | null; lines: readonly string[]; err: string };

function proof(root: string, args: readonly string[] = []): Run {
	const result = spawnSync(process.execPath, [CLI, "check", "proof", ...args], {
		cwd: root,
		encoding: "utf8",
		env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? homedir() },
	});
	return {
		code: result.status,
		lines: result.stdout.trimEnd().split("\n"),
		err: result.stderr,
	};
}

type Main = { readonly root: string; readonly base: string };

function mainRepo(held: Files = { [M0]: OLDER }): Main {
	const root = mkdtempSync(join(scratch, "repo-"));
	git(root, "init", "-q", "-b", "main");
	writeFiles(root, { ...BASE_FILES, ...PROOF_FILES, ...LADDER_FILES, ...held });
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "main");
	return { root, base: git(root, "rev-parse", "HEAD") };
}

function manifest(base: string, change: string, paths: readonly string[]) {
	const proof = validProof(base);
	proof.change = change;
	proof.scope.splice(
		0,
		proof.scope.length,
		...paths.map((path) => ({ path, obligation: "P1" })),
	);
	return `${JSON.stringify(proof, null, 2)}\n`;
}

type Change = {
	readonly name: string;
	readonly manifests: readonly string[];
	readonly remove?: readonly string[];
	readonly scope?: readonly string[];
};

function change(main: Main, plan: Change): void {
	const own = `docs/${plan.name}.md`;
	const scope = [
		...plan.manifests,
		...(plan.remove ?? []),
		own,
		...(plan.scope ?? []),
	];
	for (const path of plan.remove ?? []) git(main.root, "rm", "-q", path);
	writeFiles(main.root, {
		[own]: `# ${plan.name}\n`,
		...Object.fromEntries(
			plan.manifests.map((path) => [
				path,
				manifest(main.base, plan.name, scope),
			]),
		),
	});
	git(main.root, "add", "-A");
	git(main.root, "commit", "-q", "-m", plan.name);
}

function branch(main: Main, plan: Change): void {
	git(main.root, "checkout", "-q", "-b", plan.name, "main");
	change(main, plan);
	git(main.root, "checkout", "-q", "main");
}

const head = (root: string): string => git(root, "rev-parse", "HEAD");

const rule = (section: string): string =>
	`rule: read the section "${section}" of the file that "astack skill-path astack:pr-review-hardening references/proof-contract.md" prints\n`;

const receipt = (change: string, base: string, diffBase: string, at: string) =>
	expect.stringMatching(
		new RegExp(
			`^receipt: change ${change} base ${base} diff base ${diffBase} head ${at} digest sha256:[0-9a-f]{64} over \\d+ files$`,
		),
	);

describe("the manifest of the change", () => {
	test(
		"[control:cp-manifest-merge] two branches that each replace the base manifest merge with 0 conflicts, and the second admits with --base main",
		() => {
			const main = mainRepo();
			for (const name of ["first", "second"])
				branch(main, {
					name,
					manifests: [`.astack/proof/${name}.json`],
					remove: [M0],
				});
			git(main.root, "merge", "-q", "--squash", "first");
			git(main.root, "commit", "-q", "-m", "squash first");
			const trunk = head(main.root);
			git(main.root, "checkout", "-q", "second");
			const merge = spawnSync(
				"git",
				[
					"-c",
					"user.name=Proof",
					"-c",
					"user.email=proof@example.invalid",
				].concat(["merge", "-q", "--no-edit", "main"]),
				{ cwd: main.root, encoding: "utf8" },
			);
			const conflicts = git(
				main.root,
				"diff",
				"--name-only",
				"--diff-filter=U",
			);
			const run = proof(main.root, ["--base", "main"]);
			expect({ merge: merge.status, conflicts, ...run }).toEqual({
				merge: 0,
				conflicts: "",
				code: 0,
				lines: [
					"manifest: .astack/proof/second.json",
					"rung: R0 by the changed path .astack/proof/second.json",
					receipt("second", main.base, trunk, head(main.root)),
					`ok: proof second admitted at ${head(main.root)}`,
				],
				err: "",
			});
		},
		heavyTestTimeout,
	);

	test("[control:cp-manifest-search] one present manifest with no --base prints its path first, also with --summary, and admits", () => {
		const main = mainRepo();
		change(main, {
			name: "own",
			manifests: [".astack/proof/own.json"],
			remove: [M0],
		});
		const run = proof(main.root);
		const summary = proof(main.root, ["--summary"]);
		expect(run).toEqual({
			code: 0,
			lines: [
				"manifest: .astack/proof/own.json",
				"rung: R0 by the changed path .astack/proof/m0.json",
				receipt("own", main.base, main.base, head(main.root)),
				`ok: proof own admitted at ${head(main.root)}`,
			],
			err: "",
		});
		expect(summary.lines[0]).toBe("manifest: .astack/proof/own.json");
		expect(summary.lines[1]).toBe(`Change: own from base ${main.base}`);
	});

	test("[control:cp-manifest-search] two present manifests with no --base stop with both names", () => {
		const main = mainRepo();
		change(main, {
			name: "pair",
			manifests: [".astack/proof/one.json", ".astack/proof/two.json"],
			remove: [M0],
		});
		expect(proof(main.root)).toEqual({
			code: 1,
			lines: [
				"stop: proof schema: the tree holds more than one manifest under .astack/proof/: .astack/proof/one.json, .astack/proof/two.json. Pass --base <ref> or a manifest path",
			],
			err: rule("Required records"),
		});
	});

	test("[control:cp-manifest-search] a folder with no manifest directly under it reads .astack/proof.json", () => {
		const main = mainRepo({
			".astack/proof/notes.md": "# Notes\n",
			".astack/proof/old/nested.json": OLDER,
		});
		expect(proof(main.root).lines).toEqual([
			"stop: proof schema: .astack/proof.json is missing",
		]);
	});

	test("[control:cp-manifest-base] two manifests that the diff from the merge base changes stop with both names", () => {
		const main = mainRepo();
		branch(main, {
			name: "pair",
			manifests: [".astack/proof/one.json", ".astack/proof/two.json"],
			remove: [M0],
		});
		git(main.root, "checkout", "-q", "pair");
		expect(proof(main.root, ["--base", "main"])).toMatchObject({
			code: 1,
			lines: [
				`stop: proof schema: the diff from the merge base ${main.base} of main and HEAD changes more than one manifest under .astack/proof/: .astack/proof/one.json, .astack/proof/two.json. Pass a manifest path`,
			],
		});
	});

	test("[control:cp-manifest-base] a diff from the merge base that changes no manifest stops and names the merge base", () => {
		const main = mainRepo();
		git(main.root, "checkout", "-q", "-b", "docs");
		writeFiles(main.root, { "docs/only.md": "# Only\n" });
		git(main.root, "add", "-A");
		git(main.root, "commit", "-q", "-m", "docs only");
		expect(proof(main.root, ["--base", "main"])).toMatchObject({
			code: 1,
			lines: [
				`stop: proof schema: the diff from the merge base ${main.base} of main and HEAD changes no manifest under .astack/proof/`,
			],
		});
	});

	test.each<[string, Files, Change, readonly string[], readonly string[]]>([
		[
			"a tree that keeps the base manifest beside its own",
			{ [M0]: OLDER },
			{ name: "kept", manifests: [".astack/proof/kept.json"] },
			["--base", "main"],
			[
				"manifest: .astack/proof/kept.json",
				"stop: proof stale: delete .astack/proof/m0.json, which the manifest base BASE holds",
			],
		],
		[
			"a change that rewrites the base manifest as its own",
			{ [M0]: OLDER },
			{ name: "reuse", manifests: [M0] },
			[],
			[
				"manifest: .astack/proof/m0.json",
				"stop: proof stale: delete .astack/proof/m0.json, which the manifest base BASE holds",
			],
		],
		[
			"a legacy manifest of the base beside a new manifest",
			{ [LEGACY]: OLDER },
			{ name: "beside", manifests: [".astack/proof/beside.json"] },
			[],
			[
				"manifest: .astack/proof/beside.json",
				"stop: proof stale: delete .astack/proof.json, which the manifest base BASE holds",
			],
		],
	])(
		"[control:cp-manifest-held] %s stops with that path",
		(_name, held, plan, args, lines) => {
			const main = mainRepo(held);
			branch(main, plan);
			git(main.root, "checkout", "-q", plan.name);
			expect(proof(main.root, args)).toEqual({
				code: 1,
				lines: lines.map((line) => line.replace("BASE", main.base)),
				err: rule("Base"),
			});
		},
	);

	test("[control:cp-manifest-held] an unstaged delete of the base manifest admits", () => {
		const main = mainRepo();
		unlinkSync(join(main.root, M0));
		const scope = [".astack/proof/own.json", M0, "docs/own.md"];
		writeFiles(main.root, {
			"docs/own.md": "# Own\n",
			".astack/proof/own.json": manifest(main.base, "own", scope),
		});
		const run = proof(main.root);
		expect(run.code).toBe(0);
		expect(run.lines[0]).toBe("manifest: .astack/proof/own.json");
		expect(run.lines.at(-1)).toBe(`ok: proof own admitted at ${main.base}`);
	});
});
