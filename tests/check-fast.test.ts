import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	changedTestCommand,
	launcherTests,
	REBUILD,
} from "../scripts/check-fast.ts";
import { generatedTreeCopy } from "./generated-tree.ts";
import { heavyTestTimeout } from "./heavy-test.ts";

const ROOT = resolve(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "astack-check-fast-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync(
		"git",
		["-c", "user.name=Fast", "-c", "user.email=fast@example.invalid", ...args],
		{ cwd, encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout.trim();
}

test("the fast tests hold the three hook test files that reach turn.ts only through the bundle", () => {
	expect(launcherTests(ROOT)).toEqual(
		expect.arrayContaining([
			"tests/astack/hook.test.ts",
			"tests/astack/launcher.test.ts",
			"tests/astack/ste-hook.test.ts",
		]),
	);
});

test(
	"the rebuild steps leave no drift after a source edit, so the drift test of the launcher set passes",
	() => {
		const tree = generatedTreeCopy();
		try {
			appendFileSync(
				join(tree, "src/astack/cli/bin.ts"),
				'\nprocess.stderr.write("new source behavior\\n");\n',
			);
			const statuses = REBUILD.map(
				(args) =>
					spawnSync(process.execPath, [...args], {
						cwd: tree,
						encoding: "utf8",
					}).status,
			);
			expect(statuses).toEqual(REBUILD.map(() => 0));
			const drift = spawnSync(process.execPath, ["scripts/drift.ts"], {
				cwd: tree,
				encoding: "utf8",
			});
			expect(`${drift.stdout}${drift.stderr}`).toBe("drift: 0 differences\n");
		} finally {
			rmSync(tree, { recursive: true, force: true });
		}
	},
	heavyTestTimeout,
);

test(
	"a committed change selects the test file that imports it and no other",
	() => {
		const repo = join(scratch, "repo");
		mkdirSync(join(repo, "src"), { recursive: true });
		mkdirSync(join(repo, "tests"));
		git(repo, "init", "-q", "-b", "main");
		writeFileSync(join(repo, "src/a.ts"), "export const a = 1;\n");
		writeFileSync(join(repo, "src/b.ts"), "export const b = 1;\n");
		for (const name of ["a", "b"])
			writeFileSync(
				join(repo, `tests/${name}.test.ts`),
				`import { expect, test } from "bun:test";\nimport { ${name} } from "../src/${name}.ts";\ntest("${name} changed", () => expect(${name}).toBe(1));\n`,
			);
		git(repo, "add", "-A");
		git(repo, "commit", "-q", "-m", "base");
		git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
		git(
			repo,
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		);
		git(repo, "checkout", "-q", "-b", "topic");
		writeFileSync(join(repo, "src/a.ts"), "export const a = 2;\n");
		git(repo, "commit", "-q", "-am", "change a");
		const [command = "", ...args] = changedTestCommand(repo);
		const run = spawnSync(command, args, { cwd: repo, encoding: "utf8" });
		const output = `${run.stdout}${run.stderr}`;
		expect(output).toContain("(fail) a changed");
		expect(output).not.toContain("b changed");
		expect(output).toContain("Ran 1 test across 1 file.");
		expect(run.status).toBe(1);
	},
	heavyTestTimeout,
);
