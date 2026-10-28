import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	COMPANION_ENV,
	exampleCompanionRoot,
} from "../../scripts/lib/companion.ts";
import { sha256 } from "../../scripts/lib/neutrality.ts";
import { repoRoot } from "../../scripts/lib/projects.ts";
import { envWithoutCompanion } from "../child-env.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	dirs.push(dir);
	return dir;
}

function git(cwd: string, ...args: string[]): void {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

function write(root: string, path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function readIfPresent(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function targetRepo(): string {
	const repo = tempDir("astack-flag-repo-");
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.name", "Test Owner");
	git(repo, "config", "user.email", "owner@example.com");
	write(repo, "CONTEXT.md", "# Context\n");
	write(repo, "docs/adr/0001-start.md", "# Start\n");
	write(repo, "CLAUDE.md", "# Acme\n");
	git(repo, "add", "-A");
	git(repo, "commit", "-qm", "feat(core): start the repo");
	return repo;
}

function companionFor(path: string, profileNote: string): string {
	const root = tempDir("astack-flag-companion-");
	cpSync(exampleCompanionRoot, root, { recursive: true });
	const canary = "flagcanary";
	write(root, "deny/names.sha256", `${sha256(canary)}\n`);
	write(root, "deny/canary", `${canary}\n`);
	const configPath = join(root, "projects/acme.json");
	const config = JSON.parse(readFileSync(configPath, "utf8"));
	writeFileSync(
		configPath,
		JSON.stringify({
			...config,
			path,
			artifacts: {
				rules: false,
				settings: false,
				reviewStub: true,
				agentDocs: false,
				profile: true,
			},
			gates: [],
			ciOnlyGates: [],
			ciParity: { setup: [], map: [], exclude: [] },
		}),
	);
	const profilePath = join(
		root,
		"projects/acme/pr-review-hardening.profile.md",
	);
	writeFileSync(
		profilePath,
		readFileSync(profilePath, "utf8").replace(
			"Settings for the PR review hardening loop",
			`${profileNote} Settings for the PR review hardening loop`,
		),
	);
	return root;
}

describe("apply --worktree", () => {
	test("refuses the example companion when no flag and no variable names another", () => {
		const run = spawnSync(
			"bun",
			["scripts/apply.ts", "--project", "acme", "--worktree"],
			{ cwd: repoRoot, encoding: "utf8", env: envWithoutCompanion() },
		);
		expect({
			code: run.status,
			stdout: run.stdout,
			stderr: run.stderr,
		}).toEqual({
			code: 1,
			stdout: "",
			stderr: `${exampleCompanionRoot} is the synthetic example companion. Pass --companion <dir> or set ASTACK_COMPANION_DIR to write.\n`,
		});
	});
});

describe("apply --companion", () => {
	test("a dry run fails on a name of the deny list of the flag folder in a rendered file", () => {
		const repo = targetRepo();
		const flagged = companionFor(repo, "Flagcanary notes.");
		const run = spawnSync(
			"bun",
			[
				"scripts/apply.ts",
				"--project",
				"acme",
				"--dry-run",
				"--scratch",
				tempDir("astack-flag-scratch-"),
				"--companion",
				flagged,
			],
			{ cwd: repoRoot, encoding: "utf8" },
		);
		expect({
			code: run.status,
			findings: run.stdout
				.split("\n")
				.filter((line) => line.startsWith("- ") && line.includes("denied")),
		}).toEqual({
			code: 1,
			findings: [
				"- .claude/pr-review-hardening.profile.md:3: denied-name: hash ec450180",
			],
		});
	});

	test("reads the config and the profile only from the flag folder while the variable names another", () => {
		const repo = targetRepo();
		const flagged = companionFor(repo, "From the flag.");
		const named = companionFor(join(repo, "absent"), "From the variable.");
		const scratch = tempDir("astack-flag-scratch-");
		const run = spawnSync(
			"bun",
			[
				"scripts/apply.ts",
				"--project",
				"acme",
				"--dry-run",
				"--keep",
				"--scratch",
				scratch,
				"--companion",
				flagged,
			],
			{
				cwd: repoRoot,
				encoding: "utf8",
				env: { ...process.env, [COMPANION_ENV]: named },
			},
		);
		const [copy] = readdirSync(scratch);
		expect({
			code: run.status,
			profile: readIfPresent(
				join(scratch, copy ?? "", ".claude/pr-review-hardening.profile.md"),
			),
		}).toEqual({
			code: 0,
			profile: readFileSync(
				join(flagged, "projects/acme/pr-review-hardening.profile.md"),
				"utf8",
			),
		});
	});
});
