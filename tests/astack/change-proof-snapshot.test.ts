import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readlinkSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { snapshot } from "../../src/astack/change-proof/candidate.ts";
import { git, scratchDir } from "./change-proof-fixture.ts";

const scratch = scratchDir("astack-proof-snapshot-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function fixture() {
	const root = mkdtempSync(join(scratch, "repo-"));
	git(root, "init", "-q", "-b", "main");
	git(root, "commit", "--allow-empty", "-q", "-m", "base");
	return { root, base: git(root, "rev-parse", "HEAD") };
}

type Fixture = ReturnType<typeof fixture>;

function candidate(repo: Fixture) {
	const result = snapshot(repo.root, repo.base, [], []);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

test.each<[string, (root: string) => void, (root: string) => void, number]>([
	[
		"a newline in a link target moved into a file name",
		(root) => {
			symlinkSync("target\nbbb", join(root, "aaa"));
			writeFileSync(join(root, "ccc"), "payload\n");
		},
		(root) => {
			unlinkSync(join(root, "aaa"));
			symlinkSync("target", join(root, "aaa"));
			renameSync(join(root, "ccc"), join(root, "bbb\nccc"));
		},
		2,
	],
	[
		"distinct link-target bytes with the same replacement text",
		(root) => {
			const path = join(root, "link");
			symlinkSync(Buffer.from([255]), path);
			expect(readlinkSync(path, { encoding: "buffer" })).toEqual(
				Buffer.from([255]),
			);
		},
		(root) => {
			const path = join(root, "link");
			unlinkSync(path);
			symlinkSync(Buffer.from([254]), path);
		},
		1,
	],
	[
		"a valid UTF-8 file name that starts with a byte order mark",
		(root) => writeFileSync(join(root, "\uFEFFinput.txt"), "before\n"),
		(root) => writeFileSync(join(root, "\uFEFFinput.txt"), "after\n"),
		1,
	],
])(
	"[control:proof-entry-encoding] %s changes the digest",
	(_name, prepare, change, files) => {
		const repo = fixture();
		prepare(repo.root);
		const before = candidate(repo);
		change(repo.root);
		const after = candidate(repo);
		expect(after.head).toBe(repo.base);
		expect(after.digest).not.toBe(before.digest);
		expect(after.files).toBe(files);
	},
);

test("[control:proof-path-encoding] a Git path that is not UTF-8 cannot produce a snapshot", () => {
	const repo = fixture();
	const object = spawnSync("git", ["hash-object", "-w", "--stdin"], {
		cwd: repo.root,
		input: "payload\n",
		encoding: "utf8",
	});
	if (object.status !== 0) throw new Error(object.stderr);
	const index = spawnSync("git", ["update-index", "-z", "--index-info"], {
		cwd: repo.root,
		input: Buffer.concat([
			Buffer.from(`100644 ${object.stdout.trim()}\t`),
			Buffer.from([255, 0]),
		]),
	});
	if (index.status !== 0) throw new Error(index.stderr.toString());
	expect(snapshot(repo.root, repo.base, [], [])).toEqual({
		ok: false,
		error:
			"git ls-files -z --cached --others --exclude-standard returned a path that is not UTF-8",
	});
});
