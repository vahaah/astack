import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { cpus, loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { valueAfter } from "../src/astack/cli/args.ts";

const ROOT = resolve(import.meta.dir, "..");
const LAUNCHER = join(ROOT, "marketplace/plugins/astack/bin/astack");
const BUNDLE = join(ROOT, "marketplace/plugins/astack/bin/astack.js");
const FALLBACK = join(ROOT, "templates/pr-review-hardening.stub.FALLBACK.md");
const ENGINE = join(
	ROOT,
	"marketplace/plugins/astack/skills/pr-review-hardening/SKILL.md",
);
const MIN_RUNS = 5;
const DEFAULT_RUNS = 9;
const PR_NUMBER = "12";
const SELECTION_FIELDS =
	"headRefName,headRefOid,baseRefName,state,isCrossRepository";

const GH_SHIM = `#!/bin/sh
echo "$*" >> "$SHIM_DIR/gh.calls"
cat "$SHIM_DIR/gh.json"
`;
const GIT_SHIM = `#!/bin/sh
echo "$*" >> "$SHIM_DIR/git.calls"
exec "$REAL_GIT" "$@"
`;

type Side = "manual" | "wrapper";

type Case = {
	readonly name: string;
	readonly explicit: boolean;
	readonly unpushed: number;
};

const CASES: readonly Case[] = [
	{ name: "current branch, HEAD at the PR head", explicit: false, unpushed: 0 },
	{ name: "current branch, 3 unpushed commits", explicit: false, unpushed: 3 },
	{ name: "explicit PR, HEAD at the PR head", explicit: true, unpushed: 0 },
];

type World = {
	readonly dir: string;
	readonly work: string;
	readonly state: string;
	readonly env: Readonly<Record<string, string>>;
	readonly head: string;
	readonly prHead: string;
	readonly unpushed: readonly string[];
};

type Outcome = {
	readonly head: string;
	readonly prHead: string;
	readonly unpushed: readonly string[];
};

type Sample = {
	readonly ms: number;
	readonly topLevel: number;
	readonly gh: readonly string[];
	readonly git: readonly string[];
	readonly outcome: Outcome;
};

type Timing = {
	readonly runs: number;
	readonly failed: readonly string[];
	readonly ms: readonly number[];
	readonly median: number | null;
	readonly min: number | null;
	readonly max: number | null;
};

type Stats = Timing & {
	readonly processes: {
		readonly topLevel: number;
		readonly gh: number;
		readonly git: number;
	} | null;
};

function findGit(): string {
	const found = Bun.which("git");
	if (found === null) throw new Error("git is not on PATH");
	return found;
}

const REAL_GIT = findGit();

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync(
		REAL_GIT,
		[
			"-c",
			"user.name=Bench",
			"-c",
			"user.email=bench@example.com",
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
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
	return result.stdout.trim();
}

function commit(cwd: string, subject: string): string {
	git(cwd, "commit", "-q", "--allow-empty", "-m", subject);
	return git(cwd, "rev-parse", "HEAD");
}

function runtimePath(): string {
	const node = Bun.which("node");
	if (node !== null) {
		const version = spawnSync(node, ["--version"], { encoding: "utf8" });
		const major = Number(/^v(\d+)\./.exec(version.stdout)?.[1]);
		if (major >= 22) return node;
	}
	return process.execPath;
}

function createWorld(unpushed: number, runtime: string): World {
	const dir = mkdtempSync(join(tmpdir(), "astack-bench-pr-head-"));
	const origin = join(dir, "origin.git");
	const work = join(dir, "work");
	const bin = join(dir, "bin");
	const state = join(dir, "state");
	git(dir, "init", "-q", "--bare", "-b", "main", origin);
	git(dir, "clone", "-q", origin, work);
	git(work, "checkout", "-q", "-b", "feature");
	const prHead = commit(work, "pushed");
	git(work, "push", "-q", "origin", "feature");
	const subjects = Array.from(
		{ length: unpushed },
		(_, at) => `unpushed ${at + 1}`,
	);
	const shas = subjects.map((subject) => commit(work, subject));
	mkdirSync(bin);
	mkdirSync(state);
	for (const [name, text] of [
		["gh", GH_SHIM],
		["git", GIT_SHIM],
	] as const) {
		writeFileSync(join(bin, name), text);
		chmodSync(join(bin, name), 0o755);
	}
	writeFileSync(
		join(state, "gh.json"),
		JSON.stringify({
			number: Number(PR_NUMBER),
			headRefOid: prHead,
			headRefName: "feature",
			baseRefName: "main",
			state: "OPEN",
			isCrossRepository: false,
		}),
	);
	return {
		dir,
		work,
		state,
		env: {
			PATH: `${bin}:/usr/bin:/bin`,
			HOME: dir,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
			SHIM_DIR: state,
			REAL_GIT: REAL_GIT,
			ASTACK_RUNTIME: runtime,
		},
		head: shas.at(-1) ?? prHead,
		prHead,
		unpushed: shas
			.map((sha, at) => `${sha.slice(0, 7)} ${subjects[at]}`)
			.reverse(),
	};
}

function lines(path: string): string[] {
	return existsSync(path)
		? readFileSync(path, "utf8").split("\n").filter(Boolean)
		: [];
}

function spawnIn(
	world: World,
	program: string,
	args: readonly string[],
): { readonly status: number | null; readonly stdout: string } {
	const result = spawnSync(program, args, {
		cwd: world.work,
		env: world.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return { status: result.status, stdout: result.stdout };
}

function headOf(text: string): string | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null) return undefined;
	if (!("headRefOid" in value)) return undefined;
	return typeof value.headRefOid === "string" ? value.headRefOid : undefined;
}

function manual(world: World, explicit: boolean): Sample | string {
	let topLevel = 0;
	const start = performance.now();
	const run = (program: string, args: readonly string[]) => {
		topLevel += 1;
		return spawnIn(world, program, args);
	};
	const view = run(
		"gh",
		explicit
			? ["pr", "view", PR_NUMBER, "--json", SELECTION_FIELDS]
			: ["pr", "view", "--json", "number,headRefOid"],
	);
	const prHead = headOf(view.stdout);
	if (prHead === undefined) return "gh printed no head commit";
	const fetched = run("git", ["fetch", "origin", prHead]);
	const head = run("git", ["rev-parse", "HEAD"]).stdout.trim();
	const ancestry = run("git", ["merge-base", "--is-ancestor", prHead, "HEAD"]);
	const log = run("git", ["log", "--oneline", `${prHead}..HEAD`]);
	const ms = performance.now() - start;
	if (view.status !== 0 || fetched.status !== 0)
		return "a read or the fetch failed";
	if (ancestry.status !== 0) return "the ancestry check failed";
	return {
		ms,
		topLevel,
		gh: lines(join(world.state, "gh.calls")),
		git: lines(join(world.state, "git.calls")),
		outcome: {
			head,
			prHead,
			unpushed: log.stdout.split("\n").filter(Boolean),
		},
	};
}

function wrapper(world: World, explicit: boolean): Sample | string {
	let topLevel = 0;
	const start = performance.now();
	if (explicit) {
		topLevel += 1;
		spawnIn(world, "gh", ["pr", "view", PR_NUMBER, "--json", SELECTION_FIELDS]);
	}
	topLevel += 1;
	const checked = spawnIn(world, LAUNCHER, [
		"check",
		"pr-head",
		...(explicit ? ["--pr", PR_NUMBER] : []),
	]);
	const ms = performance.now() - start;
	const output = checked.stdout.split("\n").filter(Boolean);
	if (checked.status !== 0 || !(output.at(-1) ?? "").startsWith("ok:"))
		return `the command exited ${checked.status} with last line ${output.at(-1)}`;
	const lineValue = (key: string) =>
		output.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1) ??
		"";
	const listed = output.indexOf("UNPUSHED:");
	return {
		ms,
		topLevel,
		gh: lines(join(world.state, "gh.calls")),
		git: lines(join(world.state, "git.calls")),
		outcome: {
			head: lineValue("HEAD"),
			prHead: lineValue("PR_HEAD"),
			unpushed: listed < 0 ? [] : output.slice(listed + 1, -1),
		},
	};
}

function expectedProcesses(world: World, side: Side, explicit: boolean) {
	const read = explicit
		? `pr view ${PR_NUMBER} --json ${SELECTION_FIELDS}`
		: "pr view --json number,headRefOid";
	const reread = `pr view ${PR_NUMBER} --json number,headRefOid`;
	return {
		gh: side === "wrapper" && explicit ? [read, reread] : [read],
		git: [
			`fetch origin ${world.prHead}`,
			"rev-parse HEAD",
			`merge-base --is-ancestor ${world.prHead} HEAD`,
			`log --oneline ${world.prHead}..HEAD`,
		],
	};
}

function sameLines(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((l, at) => l === right[at]);
}

function verified(
	world: World,
	side: Side,
	explicit: boolean,
	sample: Sample,
): string | undefined {
	const expected = expectedProcesses(world, side, explicit);
	if (!sameLines(sample.gh, expected.gh))
		return `gh calls were ${JSON.stringify(sample.gh)}`;
	if (!sameLines(sample.git, expected.git))
		return `git calls were ${JSON.stringify(sample.git)}`;
	const { outcome } = sample;
	if (outcome.head !== world.head || outcome.prHead !== world.prHead)
		return "HEAD or PR_HEAD differs from the fixture";
	return sameLines(outcome.unpushed, world.unpushed)
		? undefined
		: "the unpushed list differs from the fixture";
}

function startupRun(world: World): number | string {
	rmSync(join(world.state, "gh.calls"), { force: true });
	rmSync(join(world.state, "git.calls"), { force: true });
	const start = performance.now();
	const checked = spawnIn(world, LAUNCHER, ["check", "pr-head", "--pr", "0"]);
	const ms = performance.now() - start;
	if (checked.status !== 2) return `the usage error exited ${checked.status}`;
	return lines(join(world.state, "gh.calls")).length +
		lines(join(world.state, "git.calls")).length ===
		0
		? ms
		: "the usage error started a process";
}

function oneRun(world: World, side: Side, explicit: boolean): Sample | string {
	rmSync(join(world.state, "gh.calls"), { force: true });
	rmSync(join(world.state, "git.calls"), { force: true });
	const sample =
		side === "manual" ? manual(world, explicit) : wrapper(world, explicit);
	if (typeof sample === "string") return sample;
	return verified(world, side, explicit, sample) ?? sample;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

function median(values: readonly number[]): number | null {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length === 0) return null;
	return sorted.length % 2 === 1
		? (sorted[middle] ?? null)
		: round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function summary(
	measured: readonly number[],
	failed: readonly string[],
): Timing {
	const ms = measured.map(round);
	return {
		runs: ms.length,
		failed,
		ms,
		median: median(ms),
		min: ms.length === 0 ? null : Math.min(...ms),
		max: ms.length === 0 ? null : Math.max(...ms),
	};
}

function statsOf(samples: readonly (Sample | string)[]): Stats {
	const good = samples.filter((sample) => typeof sample !== "string");
	const first = good[0];
	return {
		...summary(
			good.map((sample) => sample.ms),
			samples.filter((sample) => typeof sample === "string"),
		),
		processes:
			first === undefined
				? null
				: {
						topLevel: first.topLevel,
						gh: first.gh.length,
						git: first.git.length,
					},
	};
}

function startupStats(samples: readonly (number | string)[]) {
	return summary(
		samples.filter((sample) => typeof sample === "number"),
		samples.filter((sample) => typeof sample === "string"),
	);
}

function verdict(manualStats: Stats, wrapperStats: Stats): string {
	const { min: m0, max: m1 } = manualStats;
	const { min: w0, max: w1 } = wrapperStats;
	if (
		manualStats.runs < MIN_RUNS ||
		wrapperStats.runs < MIN_RUNS ||
		m0 === null ||
		m1 === null ||
		w0 === null ||
		w1 === null
	)
		return "inconclusive";
	if (w1 < m0) return "faster";
	if (w0 > m1) return "slower";
	return "no measurable difference";
}

function numberedSteps(text: string, from: string, to: string): number {
	const start = text.indexOf(from);
	const end = text.indexOf(to, start);
	if (start < 0 || end < 0)
		throw new Error(`no text from "${from}" to "${to}"`);
	return text
		.slice(start, end)
		.split("\n")
		.filter((line) => /^\d+\. /.test(line)).length;
}

function sourceSteps() {
	const fallback = readFileSync(FALLBACK, "utf8");
	const engine = readFileSync(ENGINE, "utf8");
	return {
		manualHeadCheckSteps: numberedSteps(
			fallback,
			"When `command -v astack` fails, do the head check by hand:",
			"Print `WORKTREE` as the output",
		),
		commandHeadCheckSteps: numberedSteps(
			engine,
			"## The head check",
			"## Authority",
		),
		manualCommandsPerCheck: 5,
		commandCommandsPerCheck: 1,
	};
}

function benchmark(explicitRuns: number | undefined, runtime: string) {
	const runs = explicitRuns ?? DEFAULT_RUNS;
	const results = CASES.map((current) => {
		const world = createWorld(current.unpushed, runtime);
		try {
			oneRun(world, "manual", current.explicit);
			oneRun(world, "wrapper", current.explicit);
			startupRun(world);
			const manualSamples: (Sample | string)[] = [];
			const wrapperSamples: (Sample | string)[] = [];
			const startupSamples: (number | string)[] = [];
			for (let at = 0; at < runs; at++) {
				manualSamples.push(oneRun(world, "manual", current.explicit));
				wrapperSamples.push(oneRun(world, "wrapper", current.explicit));
				startupSamples.push(startupRun(world));
			}
			const manualStats = statsOf(manualSamples);
			const wrapperStats = statsOf(wrapperSamples);
			return {
				name: current.name,
				manual: manualStats,
				wrapper: wrapperStats,
				startup: startupStats(startupSamples),
				verdict: verdict(manualStats, wrapperStats),
			};
		} finally {
			rmSync(world.dir, { recursive: true, force: true });
		}
	});
	return results;
}

function main(): number {
	const runsArg = valueAfter(process.argv, "--runs");
	const outArg = valueAfter(process.argv, "--out");
	const runs = typeof runsArg === "string" ? Number(runsArg) : undefined;
	if (runs !== undefined && (!Number.isInteger(runs) || runs < MIN_RUNS)) {
		console.error(
			`bench-pr-head: --runs must be a whole number of ${MIN_RUNS} or more`,
		);
		return 2;
	}
	const out =
		typeof outArg === "string"
			? resolve(outArg)
			: join(tmpdir(), "astack-bench-pr-head", "result.json");
	const runtime = runtimePath();
	const loadBefore = loadavg();
	const cases = benchmark(runs, runtime);
	const result = {
		claim:
			"Process time of the built astack check pr-head command against the same operations run as separate processes. It states the difference and the limiter, and it claims nothing about model time or tokens.",
		scope:
			"Process time on this machine only. Model response time, model tool calls, tokens and complete PR time are not measured.",
		machine: {
			platform: process.platform,
			cpus: cpus().length,
			loadBefore,
			loadAfter: loadavg(),
			bun: Bun.version,
			runtime,
			git: spawnSync(REAL_GIT, ["--version"], {
				encoding: "utf8",
			}).stdout.trim(),
		},
		cli: {
			launcher: "marketplace/plugins/astack/bin/astack",
			bundleSha256: createHash("sha256")
				.update(readFileSync(BUNDLE))
				.digest("hex"),
		},
		runsPerSide: runs ?? DEFAULT_RUNS,
		method:
			"One discarded warm-up run per side, then alternating manual, wrapper and startup runs. Each run is checked against the fixture, and each side counts its processes from shims. The startup run is the launcher with a usage error, so it starts no gh or git process and times the runtime start alone.",
		cases,
		sourceSteps: sourceSteps(),
		observed: {
			modelToolCalls: null,
			tokens: null,
			cachedInputTokens: null,
			completePrMs: null,
			reason: "No model run was observed, so these counters are unavailable.",
		},
	};
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
	for (const entry of result.cases) {
		const show = (stats: Timing) =>
			`${stats.median} ms (${stats.min} to ${stats.max}), ${stats.runs} runs, ${stats.failed.length} failed`;
		console.log(
			`${entry.name}\n  manual : ${show(entry.manual)}, processes ${JSON.stringify(entry.manual.processes)}\n  wrapper: ${show(entry.wrapper)}, processes ${JSON.stringify(entry.wrapper.processes)}\n  startup: ${show(entry.startup)}\n  verdict: ${entry.verdict}`,
		);
	}
	console.log(`source steps: ${JSON.stringify(result.sourceSteps)}`);
	console.log(`observed: ${JSON.stringify(result.observed)}`);
	console.log(`result: ${out}`);
	return cases.some(
		(entry) =>
			entry.manual.failed.length +
				entry.wrapper.failed.length +
				entry.startup.failed.length >
			0,
	)
		? 1
		: 0;
}

process.exitCode = main();
