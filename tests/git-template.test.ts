import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	type BranchSpec,
	buildTemplate,
	commitTree,
	copyRepo,
	type FixtureSpec,
	removeTemplate,
} from "./git-template.ts";

const scratch = realpathSync(
	mkdtempSync(join(tmpdir(), "astack-git-template-")),
);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(cwd: string, args: readonly string[]) {
	return spawnSync(
		"git",
		["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
		{
			cwd,
			encoding: "utf8",
			env: {
				...process.env,
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
			},
		},
	);
}

function git(cwd: string, ...args: string[]): string {
	const result = run(cwd, args);
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout;
}

function commitAndPush(work: string, file: string): void {
	writeFileSync(join(work, file), `${file}\n`);
	git(work, "add", file);
	git(work, "commit", "-qm", file);
	git(work, "push", "-q", "origin", "main");
}

const world: FixtureSpec = {
	name: "world",
	repos: ["origin.git", "work"],
	build: (root) => {
		git(root, "init", "-q", "--bare", "-b", "main", "origin.git");
		git(root, "clone", "-q", join(root, "origin.git"), "work");
		commitAndPush(join(root, "work"), "a.txt");
	},
};

const empty: FixtureSpec = {
	name: "empty",
	repos: ["."],
	build: (root) => {
		git(root, "init", "-q", "-b", "main");
	},
};

const refs = (repo: string) =>
	git(repo, "for-each-ref", "--format=%(refname) %(objectname)");

function tree(repo: string, rev: string): Record<string, string> {
	return Object.fromEntries(
		git(repo, "ls-tree", "-r", rev)
			.trimEnd()
			.split("\n")
			.map((line) => {
				const [meta = "", path = ""] = line.split("\t");
				const [mode, , id = ""] = meta.split(" ");
				return [path, `${mode} ${git(repo, "cat-file", "blob", id)}`];
			}),
	);
}

describe("a copy of a git template", () => {
	test("[control:fx-isolate] a commit and a push in one copy leave the template, its origin and a second copy unchanged", () => {
		const template = buildTemplate(world, scratch);
		const one = copyRepo(template, join(scratch, "isolate-one"));
		const two = copyRepo(template, join(scratch, "isolate-two"));
		const others = [template.root, two.root].flatMap((root) => [
			join(root, "origin.git"),
			join(root, "work"),
		]);
		const before = others.map(refs);
		commitAndPush(join(one.root, "work"), "b.txt");
		expect(others.map(refs)).toEqual(before);
		expect(git(join(one.root, "origin.git"), "rev-parse", "main")).toBe(
			git(join(one.root, "work"), "rev-parse", "HEAD"),
		);
	});

	test("[control:fx-index] a copy of a template with a tracked file passes git diff-index --quiet HEAD", () => {
		const copy = copyRepo(
			buildTemplate(world, scratch),
			join(scratch, "index"),
		);
		expect(
			run(join(copy.root, "work"), ["diff-index", "--quiet", "HEAD"]).status,
		).toBe(0);
	});

	test("[control:fx-tree] commitTree writes the exact files, links and bytes of each branch, with the same ids in each copy", () => {
		const template = buildTemplate(empty, scratch);
		const spec: BranchSpec = {
			commits: [
				{
					branch: "main",
					files: {
						"a.txt": "a\r\n",
						"docs/b.md": "café\n",
						link: { link: "a.txt" },
					},
				},
				{ branch: "pr", from: "main", files: { "a.txt": "b\n", "c.txt": "" } },
			],
			checkout: "pr",
		};
		const one = commitTree(copyRepo(template, join(scratch, "tree-one")), spec);
		const two = commitTree(copyRepo(template, join(scratch, "tree-two")), spec);
		expect([tree(one.root, "main"), tree(one.root, "pr")]).toEqual([
			{
				"a.txt": "100644 a\r\n",
				"docs/b.md": "100644 café\n",
				link: "120000 a.txt",
			},
			{
				"a.txt": "100644 b\n",
				"c.txt": "100644 ",
				"docs/b.md": "100644 café\n",
				link: "120000 a.txt",
			},
		]);
		expect([
			git(one.root, "symbolic-ref", "HEAD"),
			git(one.root, "status", "--porcelain"),
			readFileSync(join(one.root, "a.txt"), "utf8"),
			readlinkSync(join(one.root, "link")),
		]).toEqual(["refs/heads/pr\n", "", "b\n", "a.txt"]);
		expect(git(two.root, "rev-parse", "main", "pr")).toBe(
			git(one.root, "rev-parse", "main", "pr"),
		);
	});
});

describe("a template build", () => {
	test("[control:fx-atomic] a build that throws leaves no template and no build folder", () => {
		const parent = mkdtempSync(join(scratch, "atomic-"));
		expect(() =>
			buildTemplate(
				{
					name: "broken",
					repos: ["."],
					build: (root) => {
						git(root, "init", "-q");
						throw new Error("the build stops");
					},
				},
				parent,
			),
		).toThrow("the build stops");
		expect(readdirSync(parent)).toEqual([]);
	});

	test("[control:fx-own-dir] two builds of one spec give two folders, and the cleanup removes both", () => {
		const parent = mkdtempSync(join(scratch, "own-"));
		const first = buildTemplate(world, parent);
		const second = buildTemplate(world, parent);
		expect(readdirSync(parent).sort()).toEqual(
			[first, second]
				.map((template) => basename(dirname(template.root)))
				.sort(),
		);
		removeTemplate(first);
		removeTemplate(second);
		expect(readdirSync(parent)).toEqual([]);
	});
});
