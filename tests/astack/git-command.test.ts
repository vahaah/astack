import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { madeRepoTarget } from "../../src/astack/git-command.ts";
import { shellSteps } from "../../src/astack/shell.ts";

const CWD = "/work/app";

function target(command: string, cwd = CWD): string | undefined {
	const steps = shellSteps(command, cwd);
	const last = steps[steps.length - 1];
	return last === undefined ? undefined : madeRepoTarget(last);
}

describe("the folder that a git step makes", () => {
	test.each([
		["git init", "/work/app"],
		["git init -q -b main fresh", "/work/app/fresh"],
		["git init --template /tpl fresh", "/work/app/fresh"],
		["git init --templ /tpl fresh", "/work/app/fresh"],
		["git init --template=/tpl -- fresh", "/work/app/fresh"],
		["git -C sub init fresh", "/work/app/sub/fresh"],
		["git -c init.defaultBranch=main init ../fresh", "/work/fresh"],
		["time env LANG=C git init fresh", "/work/app/fresh"],
		["cd lib && git init", "/work/app/lib"],
		[
			"git clone --depth 1 -b main https://example.com/org/tool.git dest",
			"/work/app/dest",
		],
		["git clone -qb main ../up/tool.git", "/work/app/tool"],
		["git clone -- git@example.com:org/tool.git", "/work/app/tool"],
		["git worktree add ../wt", "/work/wt"],
		[
			"git worktree add -b topic --lock --reason 'one two' wt main",
			"/work/app/wt",
		],
		["git -C repo worktree add -- wt", "/work/app/repo/wt"],
	])("[control:sg-session-repo-target] %s makes %s", (command, folder) => {
		expect(target(command)).toBe(folder);
	});

	test.each([
		"git init --bare fresh",
		"git init --ba fresh",
		"git init --separate-git-dir=/other/.git fresh",
		"git init --separate-git-dir /other/.git fresh",
		"git clone --bare https://example.com/org/tool.git",
		"git clone --mirror https://example.com/org/tool.git",
		"git clone --separate-git-dir /other/.git https://example.com/org/tool.git",
		"git --git-dir=/other/.git init fresh",
		"git --git-dir /other/.git init fresh",
		"git --work-tree=/other init fresh",
		"git --work-tree /other init fresh",
		"git -c core.worktree=/other init fresh",
		"GIT_DIR=/other/.git git init fresh",
		"GIT_WORK_TREE=/other git init fresh",
		"GIT_INDEX_FILE=/other/index git init fresh",
		"env GIT_DIR=/other/.git git init fresh",
		'git init "$folder"',
		"git init -b $branch fresh",
		"git clone $url",
		"git -C $dir init",
		"git worktree add $(pwd)/wt",
		"git worktree list",
		"git worktree remove wt",
		"git status",
		"git clone",
	])("[control:sg-session-repo-target] %s gives no folder", (command) => {
		expect(target(command)).toBeUndefined();
	});
});

describe("the folder that git clone names from a URL", () => {
	let root = "";
	let work = "";

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), "astack-clone-name-"));
		work = join(root, "work");
		mkdirSync(work);
		spawnSync("git", ["init", "-q", join(root, "up", "proj")]);
	});

	afterAll(() => rmSync(root, { recursive: true, force: true }));

	function gitName(url: string): string | undefined {
		const result = spawnSync(
			"git",
			["-c", "protocol.allow=never", "clone", url],
			{ cwd: work, encoding: "utf8" },
		);
		return /Cloning into '([^']*)'/.exec(result.stderr)?.[1];
	}

	test.each([
		"https://example.com/org/tool.git",
		"https://example.com/org/tool.git/",
		"https://example.com/org/tool/.git//",
		"https://user:secret@example.com/org/a.b.git",
		"git@example.com:org/tool.git",
		"example.com:tool.git",
		"ssh://user@example.com:2222/org/tool/",
		"ssh://user@example.com:2222",
		"file:///srv/tool/.git",
		"../up/proj/.git/",
		"UP/proj",
	])(
		"[control:sg-session-repo-target] git clone %s takes the folder that git names",
		(url) => {
			const written = url.replace("UP", join(root, "up"));
			const name = gitName(written);
			expect(name).toBeDefined();
			expect(target(`git clone ${written}`, work)).toBe(join(work, name ?? ""));
		},
	);
});
