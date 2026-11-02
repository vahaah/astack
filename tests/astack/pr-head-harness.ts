import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
function findGit(): string {
	const found = Bun.which("git");
	if (found === null) throw new Error("git is not on PATH");
	return found;
}

const realGit = findGit();

const GH_SHIM = `#!/bin/sh
dir="$SHIM_DIR/gh"
n=$(( $(cat "$dir/count" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$dir/count"
{ for a in "$@"; do printf '%s\\n' "$a"; done; echo '--'; } >> "$dir/calls"
if [ ! -f "$dir/$n.code" ]; then
	echo "fake gh: call $n has no scripted response" >&2
	exit 99
fi
cat "$dir/$n.out"
cat "$dir/$n.err" >&2
exit "$(cat "$dir/$n.code")"
`;

const GIT_SHIM = `#!/bin/sh
{ for a in "$@"; do printf '%s\\n' "$a"; done; echo '--'; } >> "$SHIM_DIR/git.calls"
if [ "$1" = "$SHIM_FAIL_GIT" ]; then
	echo "fatal: injected failure of git $1" >&2
	exit 128
fi
if [ "$1" = "$SHIM_GARBLE_GIT" ]; then
	echo "not a commit id"
	exit 0
fi
exec "$REAL_GIT" "$@"
`;

const worlds: string[] = [];

export function removeWorlds(): void {
	for (const dir of worlds) rmSync(dir, { recursive: true, force: true });
}

export type World = {
	readonly base: string;
	readonly work: string;
	readonly other: string;
	readonly bin: string;
	readonly state: string;
};

export type Reply = {
	readonly code: number;
	readonly out: string;
	readonly err: string;
};

export type Run = {
	readonly code: number | null;
	readonly out: string;
	readonly err: string;
	readonly gh: string[][];
	readonly git: string[][];
};

export function gitResult(cwd: string, ...args: string[]) {
	return spawnSync(
		realGit,
		[
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{
			cwd,
			encoding: "utf8",
			env: {
				PATH: "/usr/bin:/bin",
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
			},
		},
	);
}

export function git(cwd: string, ...args: string[]): string {
	const result = gitResult(cwd, ...args);
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return result.stdout.trim();
}

export function commit(cwd: string, subject: string): string {
	git(cwd, "commit", "-q", "--allow-empty", "-m", subject);
	return git(cwd, "rev-parse", "HEAD");
}

export function createWorld(): World {
	const base = mkdtempSync(join(tmpdir(), "astack-pr-head-"));
	worlds.push(base);
	const origin = join(base, "origin.git");
	const work = join(base, "work");
	const other = join(base, "other");
	const bin = join(base, "bin");
	const state = join(base, "state");
	git(base, "init", "-q", "--bare", "-b", "main", origin);
	git(base, "clone", "-q", origin, work);
	git(work, "checkout", "-q", "-b", "feature");
	commit(work, "first");
	git(work, "push", "-q", "origin", "feature");
	git(base, "clone", "-q", "-b", "feature", origin, other);
	mkdirSync(bin);
	mkdirSync(join(state, "gh"), { recursive: true });
	for (const [name, text] of [
		["gh", GH_SHIM],
		["git", GIT_SHIM],
	] as const) {
		writeFileSync(join(bin, name), text);
		chmodSync(join(bin, name), 0o755);
	}
	return { base, work, other, bin, state };
}

export function script(world: World, call: number, reply: Reply): void {
	const dir = join(world.state, "gh");
	writeFileSync(join(dir, `${call}.code`), `${reply.code}\n`);
	writeFileSync(join(dir, `${call}.out`), reply.out);
	writeFileSync(join(dir, `${call}.err`), reply.err);
}

export function viewing(number: number, oid: string): Reply {
	return { code: 0, out: JSON.stringify({ number, headRefOid: oid }), err: "" };
}

function recorded(path: string): string[][] {
	if (!existsSync(path)) return [];
	const found: string[][] = [];
	let current: string[] = [];
	for (const line of readFileSync(path, "utf8").split("\n").slice(0, -1)) {
		if (line === "--") {
			found.push(current);
			current = [];
		} else current.push(line);
	}
	return found;
}

export function astack(
	world: World,
	args: readonly string[],
	env: Readonly<Record<string, string>> = {},
): Run {
	rmSync(join(world.state, "git.calls"), { force: true });
	const before = recorded(join(world.state, "gh", "calls")).length;
	const result = spawnSync(
		process.execPath,
		[CLI, "check", "pr-head", ...args],
		{
			cwd: world.work,
			encoding: "utf8",
			maxBuffer: Infinity,
			env: {
				PATH: `${world.bin}:/usr/bin:/bin`,
				HOME: world.base,
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
				SHIM_DIR: world.state,
				REAL_GIT: realGit,
				...env,
			},
		},
	);
	return {
		code: result.status,
		out: result.stdout,
		err: result.stderr,
		gh: recorded(join(world.state, "gh", "calls")).slice(before),
		git: recorded(join(world.state, "git.calls")),
	};
}

export const sequence = (oid: string): string[][] => [
	["fetch", "origin", oid],
	["rev-parse", "HEAD"],
	["merge-base", "--is-ancestor", oid, "HEAD"],
	["log", "--oneline", `${oid}..HEAD`],
];
