import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Io } from "../../src/astack/cli/io.ts";
import { checkEnv } from "../../src/astack/plan/files.ts";
import {
	type PlanSet,
	planSetFromText,
} from "../../src/astack/plan/planset.ts";
import type { CheckEnv } from "../../src/astack/plan/types.ts";
import { processPorts } from "../../src/astack/ports.ts";
import { DEFAULT_PLAN_PROFILE } from "../../src/astack/profile.ts";

export const FIXTURES = resolve(import.meta.dir, "../fixtures/plans");
export const REPO = join(FIXTURES, "repo");
export const PRINCIPLES_REFS = resolve(
	import.meta.dir,
	"../../marketplace/plugins/astack/skills/principles/references",
);

export function principles(): ReadonlySet<string> {
	return new Set(
		readdirSync(PRINCIPLES_REFS)
			.filter((name) => name.endsWith(".md"))
			.map((name) => name.slice(0, -".md".length)),
	);
}

export function fixture(path: string): string {
	return readFileSync(join(FIXTURES, path), "utf8");
}

export function fixtureEnv(root: string = REPO): CheckEnv {
	return checkEnv(processPorts(), {
		root,
		config: DEFAULT_PLAN_PROFILE,
		slug: "fixture",
		today: "2026-10-16",
		trail: false,
		principles: principles(),
	});
}

export function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

export function commitAll(cwd: string, message: string): void {
	git(cwd, "add", "-A");
	git(
		cwd,
		"-c",
		"user.email=test@example.com",
		"-c",
		"user.name=Test Owner",
		"commit",
		"-qm",
		message,
	);
}

export function freshRepo(dirs: string[]): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-plan-")));
	dirs.push(dir);
	cpSync(REPO, dir, { recursive: true });
	git(dir, "init", "-q");
	git(dir, "config", "user.name", "Test Owner");
	git(dir, "config", "user.email", "test@example.com");
	commitAll(dir, "init");
	return dir;
}

export type Run = { code: number; out: string; err: string };

export function run(
	command: (args: readonly string[], io: Io) => number,
	args: readonly string[],
	cwd: string,
	options: { input?: string; env?: Record<string, string | undefined> } = {},
): Run {
	let out = "";
	let err = "";
	const io: Io = {
		out: (text) => {
			out += text;
		},
		err: (text) => {
			err += text;
		},
		cwd,
		env: options.env ?? {},
		today: "2026-10-16",
		now: new Date("2026-10-16T12:00:00Z"),
		scriptPath: undefined,
		input: () => options.input ?? "",
	};
	const code = command(args, io);
	return { code, out, err };
}

export function setFromRepo(root: string, path: string): PlanSet {
	return planSetFromText(
		path,
		readFileSync(join(root, path), "utf8"),
		(brief) => {
			const file = join(root, brief);
			return existsSync(file) ? readFileSync(file, "utf8") : undefined;
		},
	);
}
