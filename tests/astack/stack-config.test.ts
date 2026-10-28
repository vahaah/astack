import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-stack-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const bin = join(scratch, "bin");
mkdirSync(bin, { recursive: true });
writeFileSync(
	join(bin, "docker"),
	[
		"#!/bin/sh",
		'echo "$*" >> "$ASTACK_TEST_STATE/docker.log"',
		'case "$1" in',
		'  ps) case "$*" in',
		'    *--filter*) cat "$ASTACK_TEST_STATE/ids" 2>/dev/null ;;',
		'    *) cat "$ASTACK_TEST_STATE/ids" "$ASTACK_TEST_STATE/other-ids" 2>/dev/null ;;',
		"  esac",
		"  exit 0 ;;",
		'  inspect) shift 3; for _ in "$@"; do echo 2026-10-10T09:00:00Z; done ;;',
		"  *) exit 3 ;;",
		"esac",
		"",
	].join("\n"),
);
chmodSync(join(bin, "docker"), 0o755);

const restart = "cd supabase && supabase stop && supabase start >/dev/null";
const startTwo = `printf 'c0\\nc1\\n' > "$ASTACK_TEST_STATE/ids"`;
const watched = [
	"--watch",
	"supabase/config.toml",
	"--watch",
	"supabase/templates",
];
const paths = "supabase/config.toml, supabase/templates";
let count = 0;

function git(cwd: string, args: readonly string[], at?: string): string {
	const dated =
		at === undefined ? {} : { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at };
	const result = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.com",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.com",
			...dated,
		},
	});
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

type Fixture = { readonly root: string; readonly state: string };

function fixture(): Fixture {
	count += 1;
	const root = join(scratch, `repo-${count}`);
	const state = join(scratch, `state-${count}`);
	mkdirSync(join(root, "supabase", "templates"), { recursive: true });
	mkdirSync(state, { recursive: true });
	git(root, ["init", "-q", "-b", "main"]);
	writeConfig(root, 6);
	writeFileSync(
		join(root, "supabase", "templates", "invite.html"),
		"<p>invite</p>\n",
	);
	git(root, ["add", "-A"]);
	git(root, ["commit", "-q", "-m", "base"], "2026-10-01T10:00:00Z");
	return { root, state };
}

function writeConfig(root: string, length: number): void {
	writeFileSync(
		join(root, "supabase", "config.toml"),
		`project_id = "demo"\n\n[auth]\nminimum_password_length = ${length}\n`,
	);
}

function commitConfig(root: string, length: number): void {
	writeConfig(root, length);
	git(
		root,
		["commit", "-q", "-am", `password length ${length}`],
		"2026-10-05T10:00:00Z",
	);
}

function astack(
	cwd: string,
	state: string,
	args: readonly string[],
): { code: number | null; out: string; err: string } {
	const result = spawnSync(process.execPath, [CLI, ...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${bin}:${process.env.PATH ?? ""}`,
			ASTACK_TEST_STATE: state,
		},
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

function start(
	{ root, state }: Fixture,
	run = startTwo,
	folder = "supabase",
	watch: readonly string[] = watched,
) {
	return astack(root, state, [
		"stack",
		"start",
		folder,
		...watch,
		"--run",
		run,
	]);
}

function check(
	{ root, state }: Fixture,
	folder = "supabase",
	watch: readonly string[] = watched,
	restartCommand = restart,
) {
	return astack(root, state, [
		"check",
		"stack-config",
		folder,
		...watch,
		"--restart",
		restartCommand,
	]);
}

function restartLines(root: string): string[] {
	return [
		"astack never restarts a stack. To start it with the files of this checkout, run this command yourself:",
		`  cd ${root} && astack stack start supabase --watch supabase/config.toml --watch supabase/templates --run 'cd supabase && supabase stop && supabase start >/dev/null'`,
		"",
	];
}

const recorded = (root: string) =>
	`astack recorded the files of ${paths} in ${root} for the local stack demo.\n`;
const passed = `The local stack demo started with the files of ${paths} that this checkout holds.\n`;

describe("astack stack start and astack check stack-config", () => {
	test("a stack that this checkout started through astack stack start passes, and docker gives the containers of its project", () => {
		const repo = fixture();
		const started = start(repo);
		expect(started.err).toBe("");
		expect(started.out).toBe(recorded(repo.root));
		expect(started.code).toBe(0);
		const result = check(repo);
		expect(result.err).toBe("");
		expect(result.out).toBe(passed);
		expect(result.code).toBe(0);
		expect(readFileSync(join(repo.state, "docker.log"), "utf8")).toBe(
			[
				"ps -q --no-trunc",
				"ps -q --no-trunc --filter label=com.supabase.cli.project=demo",
				"ps -q --no-trunc --filter label=com.supabase.cli.project=demo",
				"",
			].join("\n"),
		);
	});

	test("a stack that another checkout started later with another config fails, as when the owner starts the shared stack from main after the PR commit", () => {
		const main = fixture();
		const pr: Fixture = {
			root: join(scratch, `pr-${count}`),
			state: main.state,
		};
		git(main.root, ["worktree", "add", "-q", "-b", "pr", pr.root]);
		commitConfig(pr.root, 12);
		expect(start(main).code).toBe(0);
		const result = check(pr);
		expect(result.out).toBe(
			[
				`The local stack demo started from ${main.root} with files of ${paths} that are not the files of this checkout.`,
				"A local stack keeps the config of its start. So a gate on it can test a config that is not the config of this branch.",
				"astack never restarts a stack. To start it with the files of this checkout, run this command yourself:",
				`  cd ${pr.root} && astack stack start supabase --watch supabase/config.toml --watch supabase/templates --run 'cd supabase && supabase stop && supabase start >/dev/null'`,
				"",
			].join("\n"),
		);
		expect(result.code).toBe(1);
		expect(check(main).code).toBe(0);
	});

	test("a commit that changes a watched file after the start fails", () => {
		const repo = fixture();
		expect(start(repo).code).toBe(0);
		commitConfig(repo.root, 12);
		const result = check(repo);
		expect(result.out).toStartWith(
			`The local stack demo started from ${repo.root} with files of ${paths} that are not the files of this checkout.\n`,
		);
		expect(result.code).toBe(1);
	});

	test("a start from a checkout with an uncommitted change records the files on disk, so the clean checkout fails", () => {
		const repo = fixture();
		writeConfig(repo.root, 12);
		expect(start(repo).code).toBe(0);
		git(repo.root, ["checkout", "--", "supabase/config.toml"]);
		expect(check(repo).code).toBe(1);
	});

	test("a stack that started again after the record fails, because astack cannot tell which files it read", () => {
		const repo = fixture();
		expect(start(repo).code).toBe(0);
		writeFileSync(join(repo.state, "ids"), "c2\nc3\n");
		const result = check(repo);
		expect(result.out).toBe(
			[
				"The local stack demo started again after astack recorded its files, so astack cannot tell which files it read.",
				...restartLines(repo.root),
			].join("\n"),
		);
		expect(result.code).toBe(1);
	});

	test("a database reset that makes one container again keeps the record", () => {
		const repo = fixture();
		expect(start(repo).code).toBe(0);
		writeFileSync(join(repo.state, "ids"), "c0\nc9\n");
		expect(check(repo).out).toBe(passed);
	});

	test("a start command that finds the stack running records nothing, because the stack keeps the config of an earlier start", () => {
		const repo = fixture();
		writeFileSync(join(repo.state, "ids"), "c0\n");
		writeFileSync(join(repo.state, "other-ids"), "x0\n");
		const started = start(repo, "true");
		expect(started.out).toBe(
			"The local stack demo ran before the start command, so it kept the config of an earlier start, and astack recorded nothing. Stop the stack. Then run this command again.\n",
		);
		expect(started.code).toBe(1);
		expect(check(repo).out).toBe(
			[
				"astack has no record of the files that the local stack demo read at its start. Only astack stack start writes that record.",
				...restartLines(repo.root),
			].join("\n"),
		);
	});

	test("a failed start command records nothing", () => {
		const repo = fixture();
		const started = start(repo, `${startTwo}; exit 4`);
		expect(started.out).toBe(
			"The start command exited 4, so astack recorded nothing.\n",
		);
		expect(started.code).toBe(1);
		expect(check(repo).code).toBe(1);
	});

	test("a start command that leaves no container of the stack records nothing", () => {
		const repo = fixture();
		const started = start(repo, "true");
		expect(started.out).toBe(
			"No container of the local stack demo runs after the start command, so astack recorded nothing.\n",
		);
		expect(started.code).toBe(1);
	});

	test("a stack with no running container fails", () => {
		const repo = fixture();
		expect(start(repo).code).toBe(0);
		rmSync(join(repo.state, "ids"));
		const result = check(repo);
		expect(result.out).toBe(
			[
				"No container of the local stack demo runs.",
				...restartLines(repo.root),
			].join("\n"),
		);
		expect(result.code).toBe(1);
	});

	test("a record that astack cannot read fails", () => {
		const repo = fixture();
		expect(start(repo).code).toBe(0);
		const record = join(
			repo.root,
			".git",
			"astack",
			"stack-config",
			"demo.json",
		);
		expect(existsSync(record)).toBe(true);
		writeFileSync(record, "{");
		const result = check(repo);
		expect(result.out).toBe(
			[
				`astack cannot read its record of the local stack demo at ${record}.`,
				...restartLines(repo.root),
			].join("\n"),
		);
		expect(result.code).toBe(1);
	});

	test("a config that the start command renders from a template is read after the start, and a later change of the template fails", () => {
		const repo = fixture();
		writeFileSync(join(repo.root, ".gitignore"), ".stack/\n");
		writeFileSync(
			join(repo.root, "supabase", "config.toml.template"),
			'project_id = "demo-{{lane}}"\n',
		);
		git(repo.root, ["add", "-A"]);
		git(repo.root, ["commit", "-q", "-m", "template"], "2026-10-02T10:00:00Z");
		const lane = ".stack/b/supabase";
		const template = ["--watch", "supabase/config.toml.template"];
		const render = `mkdir -p ${lane} && printf 'project_id = "demo-b"\\n' > ${lane}/config.toml && ${startTwo}`;
		const started = start(repo, render, lane, template);
		expect(started.out).toBe(
			`astack recorded the files of supabase/config.toml.template in ${repo.root} for the local stack demo-b.\n`,
		);
		expect(check(repo, lane, template).code).toBe(0);
		writeFileSync(
			join(repo.root, "supabase", "config.toml.template"),
			'project_id = "demo-{{lane}}"\n[auth]\nminimum_password_length = 12\n',
		);
		git(repo.root, ["commit", "-q", "-am", "template"], "2026-10-03T10:00:00Z");
		const result = check(repo, lane, template, "bun run stack:new b --force");
		expect(result.out).toBe(
			[
				`The local stack demo-b started from ${repo.root} with files of supabase/config.toml.template that are not the files of this checkout.`,
				"A local stack keeps the config of its start. So a gate on it can test a config that is not the config of this branch.",
				"astack never restarts a stack. To start it with the files of this checkout, run this command yourself:",
				`  cd ${repo.root} && astack stack start .stack/b/supabase --watch supabase/config.toml.template --run 'bun run stack:new b --force'`,
				"",
			].join("\n"),
		);
		expect(result.code).toBe(1);
	});

	test.each([
		["check", "stack-config"],
		["stack", "start"],
	])(
		"a watched path with no file is a usage error of astack %s %s, so a wrong path never passes",
		(group, name) => {
			const repo = fixture();
			const last = group === "check" ? "--restart" : "--run";
			const result = astack(repo.root, repo.state, [
				group,
				name,
				"supabase",
				"--watch",
				"supabase/missing.toml",
				last,
				startTwo,
			]);
			expect(result.code).toBe(2);
			expect(result.err).toBe(
				`astack ${group} ${name}: no file of this checkout is at supabase/missing.toml\n`,
			);
		},
	);

	test("the folder, a watched path and the restart or start command are required", () => {
		const repo = fixture();
		const checked = astack(repo.root, repo.state, [
			"check",
			"stack-config",
			"supabase",
			"--restart",
			restart,
		]);
		expect(checked.code).toBe(2);
		expect(checked.err).toBe(
			"astack check stack-config: give the Supabase folder, at least one --watch <path> and --restart <command>\n",
		);
		const started = astack(repo.root, repo.state, [
			"stack",
			"start",
			"supabase",
			...watched,
		]);
		expect(started.code).toBe(2);
		expect(started.err).toBe(
			"astack stack start: give the Supabase folder, at least one --watch <path> and --run <command>\n",
		);
		const bare = astack(repo.root, repo.state, ["stack"]);
		expect(bare.code).toBe(2);
		expect(bare.err).toBe("astack stack: give start\n");
	});

	test("a folder with no project_id in its config.toml is a usage error", () => {
		const repo = fixture();
		mkdirSync(join(repo.root, "empty"), { recursive: true });
		writeFileSync(join(repo.root, "empty", "config.toml"), "[auth]\n");
		const result = check(repo, "empty");
		expect(result.code).toBe(2);
		expect(result.err).toBe(
			"astack check stack-config: empty/config.toml names no project_id\n",
		);
	});
});
