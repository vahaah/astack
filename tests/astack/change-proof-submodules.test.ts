import { afterAll, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	changedPaths,
	snapshot,
} from "../../src/astack/change-proof/candidate.ts";
import { git, scratchDir, writeFiles } from "./change-proof-fixture.ts";

const scratch = scratchDir("astack-proof-submodules-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function repository(root: string): void {
	mkdirSync(root);
	git(root, "init", "-q", "-b", "main");
	writeFiles(root, { "payload.txt": "source\n" });
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
}

function fixture() {
	const root = mkdtempSync(join(scratch, "case-"));
	const parent = join(root, "parent");
	const source = join(root, "source");
	const leaf = join(root, "leaf");
	for (const path of [parent, source, leaf]) repository(path);
	const first = git(leaf, "rev-parse", "HEAD");
	git(leaf, "commit", "--allow-empty", "-q", "-m", "second");
	const second = git(leaf, "rev-parse", "HEAD");
	git(
		source,
		"-c",
		"protocol.file.allow=always",
		"submodule",
		"add",
		"-q",
		leaf,
		"nested",
	);
	git(join(source, "nested"), "checkout", "-q", first);
	git(source, "add", "-A");
	git(source, "commit", "-q", "-m", "nested dependency");
	git(
		parent,
		"-c",
		"protocol.file.allow=always",
		"submodule",
		"add",
		"-q",
		source,
		"deps/module",
	);
	git(
		parent,
		"-c",
		"protocol.file.allow=always",
		"submodule",
		"update",
		"--init",
		"--recursive",
		"-q",
	);
	git(parent, "add", "-A");
	git(parent, "commit", "-q", "-m", "dependency");
	return {
		parent,
		module: join(parent, "deps/module"),
		nested: join(parent, "deps/module/nested"),
		base: git(parent, "rev-parse", "HEAD"),
		second,
	};
}

type Fixture = ReturnType<typeof fixture>;

function candidate(repo: Fixture, explicit: readonly string[] = []) {
	const changed = changedPaths(repo.parent, repo.base);
	if (!changed.ok) throw new Error(changed.error);
	const result = snapshot(repo.parent, repo.base, changed.value, explicit);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

test.each<[string, (repo: Fixture) => void, (repo: Fixture) => void, number]>([
	[
		"a nested checkout",
		() => {},
		(repo) => git(repo.nested, "checkout", "-q", repo.second),
		7,
	],
	[
		"an already dirty nested file",
		(repo) => writeFileSync(join(repo.nested, "payload.txt"), "dirty before\n"),
		(repo) => writeFileSync(join(repo.nested, "payload.txt"), "dirty after\n"),
		7,
	],
	[
		"a checkout inside an untracked Git directory",
		(repo) => git(repo.parent, "rm", "--cached", "-q", "deps/module"),
		(repo) => git(repo.nested, "checkout", "-q", repo.second),
		7,
	],
	[
		"an existing untracked nested file",
		(repo) => writeFileSync(join(repo.nested, "local.txt"), "before\n"),
		(repo) => writeFileSync(join(repo.nested, "local.txt"), "after\n"),
		8,
	],
	[
		"an index-only edit in a nested checkout",
		() => {},
		(repo) => {
			const path = join(repo.nested, "payload.txt");
			const original = readFileSync(path, "utf8");
			writeFileSync(path, "staged\n");
			git(repo.nested, "add", "payload.txt");
			writeFileSync(path, original);
		},
		7,
	],
	[
		"initialization of an empty submodule",
		(repo) =>
			git(repo.parent, "submodule", "deinit", "-f", "--", "deps/module"),
		(repo) =>
			git(
				repo.parent,
				"-c",
				"protocol.file.allow=always",
				"submodule",
				"update",
				"--init",
				"--recursive",
				"-q",
			),
		7,
	],
])(
	"[control:proof-submodule-binding] %s changes the candidate digest",
	(_name, prepare, change, files) => {
		const repo = fixture();
		prepare(repo);
		const index = git(repo.parent, "ls-files", "--stage", "-z");
		const before = candidate(repo);
		change(repo);
		const after = candidate(repo);
		expect(after.head).toBe(repo.base);
		expect(git(repo.parent, "ls-files", "--stage", "-z")).toBe(index);
		expect(after.digest).not.toBe(before.digest);
		expect(after.files).toBe(files);
	},
);

test("[control:proof-submodule-unreadable] a populated submodule without a readable checkout cannot produce a snapshot", () => {
	const repo = fixture();
	git(repo.parent, "submodule", "deinit", "-f", "--", "deps/module");
	writeFiles(repo.module, { "unbound.txt": "unbound\n" });
	const changed = changedPaths(repo.parent, repo.base);
	if (!changed.ok) throw new Error(changed.error);
	expect(snapshot(repo.parent, repo.base, changed.value, [])).toEqual({
		ok: false,
		error: "submodule deps/module has files but is not a readable Git worktree",
	});
});

test("[control:proof-submodule-explicit] an ignored proof input inside a nested checkout stays bound", () => {
	const repo = fixture();
	writeFiles(repo.nested, {
		".gitignore": "ignored.txt\n",
		"ignored.txt": "before\n",
	});
	const explicit = ["deps/module/nested/ignored.txt"];
	const before = candidate(repo, explicit);
	writeFileSync(join(repo.nested, "ignored.txt"), "after\n");
	const after = candidate(repo, explicit);
	expect(after.head).toBe(repo.base);
	expect(after.digest).not.toBe(before.digest);
	expect(after.files).toBe(9);
});
