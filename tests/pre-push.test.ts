import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { exampleCompanionRoot } from "../scripts/lib/companion.ts";
import { cleanEnv } from "../scripts/lib/exec.ts";
import { sha256 } from "../scripts/lib/neutrality.ts";
import { repoRoot } from "../scripts/lib/projects.ts";
import { envWithoutCompanion } from "./child-env.ts";

const backwards = (text: string): string => [...text].reverse().join("");
const denied = backwards("kciweldnirb");
const finding = "docs/notes.md:1: denied-name: hash 6d81cde6";
const publicRemote = "https://github.com/dev-owner/astack.git";
const script = join(repoRoot, "scripts", "pre-push.ts");
const gitEnv = {
	...cleanEnv(),
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync(
		"git",
		[
			"-c",
			"user.name=Test Owner",
			"-c",
			"user.email=owner@example.com",
			...args,
		],
		{ cwd, env: gitEnv, encoding: "utf8" },
	);
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

type Files = Readonly<Record<string, string | null>>;

function repoWith(commits: readonly Files[]): { root: string; head: string } {
	const root = mkdtempSync(join(tmpdir(), "astack-push-"));
	git(root, "init", "-q", "-b", "main");
	commits.forEach((files, index) => {
		for (const [path, content] of Object.entries(files)) {
			const file = join(root, path);
			if (content === null) {
				rmSync(file);
				continue;
			}
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, content);
		}
		git(root, "add", "-A");
		git(root, "commit", "-qm", `commit ${index}`);
	});
	return { root, head: git(root, "rev-parse", "HEAD") };
}

function machine(remote: string | undefined): string {
	return JSON.stringify({
		home: "/home/dev",
		profiles: [],
		handles: [],
		emails: [],
		hosts: [],
		...(remote === undefined ? {} : { publicRemote: remote }),
	});
}

function companionWith(list: string, machineJson: string): string {
	const root = mkdtempSync(join(tmpdir(), "astack-push-companion-"));
	cpSync(exampleCompanionRoot, root, { recursive: true });
	writeFileSync(join(root, "deny", "names.sha256"), list);
	writeFileSync(join(root, "deny", "canary"), `${denied}\n`);
	writeFileSync(join(root, "machine.json"), machineJson);
	return root;
}

const clean: Files = { "docs/notes.md": "plain notes\n" };
const leaked: Files = { "docs/notes.md": `the ${denied} notes\n` };
const deniedList = `${sha256(denied)}\n`;

type Row = {
	readonly commits: readonly Files[];
	readonly list: string;
	readonly remote: string | undefined;
	readonly url: string;
	readonly example?: true;
};

const rows: readonly [string, Row, (companion: string) => string[], number][] =
	[
		[
			"a clean commit to the public remote passes",
			{
				commits: [clean],
				list: deniedList,
				remote: publicRemote,
				url: publicRemote,
			},
			() => [],
			0,
		],
		[
			"a commit with a denied name to the public remote fails",
			{
				commits: [leaked],
				list: deniedList,
				remote: publicRemote,
				url: publicRemote,
			},
			() => [finding],
			1,
		],
		[
			"the scp form of the public remote fails on a denied name",
			{
				commits: [leaked],
				list: deniedList,
				remote: publicRemote,
				url: "git@github.com:Dev-Owner/astack",
			},
			() => [finding],
			1,
		],
		[
			"the ssh form with a port of the public remote fails on a denied name",
			{
				commits: [leaked],
				list: deniedList,
				remote: publicRemote,
				url: "ssh://git@github.com:22/dev-owner/astack.git/",
			},
			() => [finding],
			1,
		],
		[
			"a denied name in a commit that a later commit removes fails",
			{
				commits: [leaked, clean],
				list: deniedList,
				remote: publicRemote,
				url: publicRemote,
			},
			() => [finding],
			1,
		],
		[
			"an empty deny list fails a clean commit to the public remote",
			{ commits: [clean], list: "", remote: publicRemote, url: publicRemote },
			(companion) => [
				`${companion}/deny/names.sha256 holds no hash. Add a name with bun run deny add <name>.`,
			],
			1,
		],
		[
			"a commit with a denied name to another remote passes",
			{
				commits: [leaked],
				list: deniedList,
				remote: publicRemote,
				url: "https://github.com/dev-owner/astack-fork.git",
			},
			() => [],
			0,
		],
		[
			"a machine.json with no public remote fails",
			{
				commits: [clean],
				list: deniedList,
				remote: undefined,
				url: publicRemote,
			},
			(companion) => [
				`${companion}/machine.json: publicRemote must be the URL of the public remote`,
			],
			1,
		],
		[
			"the example companion fails, because it holds no owner value",
			{
				commits: [clean],
				list: deniedList,
				remote: publicRemote,
				url: publicRemote,
				example: true,
			},
			() => [
				`${exampleCompanionRoot} is the synthetic example companion, so the pre-push gate cannot read the owner values. Pass --companion <dir> in .git/hooks/pre-push.`,
			],
			1,
		],
	];

describe("the pre-push gate", () => {
	test.each(rows)("%s", (_name, row, stderr, status) => {
		const { root, head } = repoWith(row.commits);
		const companion = companionWith(row.list, machine(row.remote));
		const result = spawnSync(
			process.execPath,
			[
				script,
				...(row.example === true ? [] : ["--companion", companion]),
				"origin",
				row.url,
			],
			{
				cwd: root,
				input: `refs/heads/main ${head} refs/heads/main ${"0".repeat(40)}\n`,
				encoding: "utf8",
				env: envWithoutCompanion(),
			},
		);
		expect({
			status: result.status,
			stderr: result.stderr.split("\n").filter((line) => line !== ""),
		}).toEqual({ status, stderr: stderr(companion) });
	});

	test("git push runs it as the pre-push hook: the public remote refuses a commit with a denied name, and another remote takes it", () => {
		const { root, head } = repoWith([leaked]);
		const publicBare = mkdtempSync(join(tmpdir(), "astack-push-public-"));
		const otherBare = mkdtempSync(join(tmpdir(), "astack-push-other-"));
		git(publicBare, "init", "-q", "--bare");
		git(otherBare, "init", "-q", "--bare");
		const companion = companionWith(deniedList, machine(publicBare));
		const hooks = join(root, ".git", "astack-hooks");
		mkdirSync(hooks);
		writeFileSync(
			join(hooks, "pre-push"),
			`#!/bin/sh\nexec "${process.execPath}" "${script}" --companion "${companion}" "$@"\n`,
		);
		chmodSync(join(hooks, "pre-push"), 0o755);
		git(root, "config", "core.hooksPath", hooks);
		git(root, "remote", "add", "public", publicBare);
		git(root, "remote", "add", "other", otherBare);
		const push = (remote: string) =>
			spawnSync("git", ["push", "-q", remote, "main"], {
				cwd: root,
				env: gitEnv,
				encoding: "utf8",
			}).status;
		const landed = (bare: string) =>
			spawnSync("git", ["rev-parse", "--verify", "-q", "refs/heads/main"], {
				cwd: bare,
				env: gitEnv,
				encoding: "utf8",
			}).stdout.trim();
		expect({
			public: push("public"),
			publicHead: landed(publicBare),
			other: push("other"),
			otherHead: landed(otherBare),
		}).toEqual({ public: 1, publicHead: "", other: 0, otherHead: head });
	});
});
