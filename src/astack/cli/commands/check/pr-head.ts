import { spawnSync } from "node:child_process";
import { err, ok, type Result } from "../../../result.ts";
import { valueAfter } from "../../args.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check pr-head";
const NO_PR_DIAGNOSTIC = /no pull requests found for branch/i;
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PR_NUMBER = /^[1-9][0-9]*$/;

type Failure =
	| {
			readonly kind: "exited";
			readonly code: number;
			readonly stderr: string;
	  }
	| { readonly kind: "lost"; readonly reason: string };

type PullRequest = {
	readonly number: number;
	readonly headRefOid: string;
};

function selectorOf(
	args: readonly string[],
): Result<string | undefined, string> {
	const usage = `${NAME}: give no argument, or --pr <n> with a positive whole number`;
	const number = valueAfter(args, "--pr");
	if (number === undefined)
		return args.length === 0 ? ok(undefined) : err(usage);
	return number !== null && PR_NUMBER.test(number) && args.length === 2
		? ok(number)
		: err(usage);
}

function spawnText(
	io: Io,
	program: string,
	args: readonly string[],
): Result<string, Failure> {
	const result = spawnSync(program, args, {
		cwd: io.cwd,
		env: io.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (result.error !== undefined)
		return err({ kind: "lost", reason: result.error.message });
	if (result.status === null)
		return err({ kind: "lost", reason: `ended by signal ${result.signal}` });
	return result.status === 0
		? ok(result.stdout)
		: err({ kind: "exited", code: result.status, stderr: result.stderr });
}

function stopped(io: Io, label: string, failure: Failure): number {
	if (failure.kind === "exited") {
		io.err(failure.stderr);
		io.out(`stop: ${label} exited ${failure.code}\n`);
	} else {
		io.err(`${label}: ${failure.reason}\n`);
		io.out(`stop: ${label} did not finish\n`);
	}
	return 1;
}

function parsePullRequest(text: string): PullRequest | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null) return undefined;
	if (!("number" in value) || !("headRefOid" in value)) return undefined;
	const { number, headRefOid } = value;
	if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1)
		return undefined;
	if (typeof headRefOid !== "string" || !COMMIT_ID.test(headRefOid))
		return undefined;
	return { number, headRefOid };
}

function run(args: readonly string[], io: Io): number {
	const selector = selectorOf(args);
	if (!selector.ok) return usageError(io, selector.error);
	const explicit = selector.value;
	const view = spawnText(io, "gh", [
		"pr",
		"view",
		...(explicit === undefined ? [] : [explicit]),
		"--json",
		"number,headRefOid",
	]);
	if (!view.ok) {
		const { error } = view;
		if (
			explicit === undefined &&
			error.kind === "exited" &&
			error.code === 1 &&
			NO_PR_DIAGNOSTIC.test(error.stderr)
		) {
			io.err(error.stderr);
			io.out("no_pr: the current branch has no pull request\n");
			return 3;
		}
		return stopped(io, "gh pr view", error);
	}
	const pr = parsePullRequest(view.value);
	if (pr === undefined) {
		io.out("stop: gh pr view printed no valid PR number and head commit ID\n");
		return 1;
	}
	const fetched = spawnText(io, "git", ["fetch", "origin", pr.headRefOid]);
	if (!fetched.ok) return stopped(io, "git fetch", fetched.error);
	const revision = spawnText(io, "git", ["rev-parse", "HEAD"]);
	if (!revision.ok) return stopped(io, "git rev-parse HEAD", revision.error);
	const head = revision.value.trim();
	if (!COMMIT_ID.test(head)) {
		io.out("stop: git rev-parse HEAD printed no commit ID\n");
		return 1;
	}
	io.out(`PR=${pr.number}\nHEAD=${head}\nPR_HEAD=${pr.headRefOid}\n`);
	const ancestry = spawnText(io, "git", [
		"merge-base",
		"--is-ancestor",
		pr.headRefOid,
		"HEAD",
	]);
	if (!ancestry.ok) {
		const { error } = ancestry;
		if (error.kind !== "exited" || error.code !== 1)
			return stopped(io, "git merge-base --is-ancestor", error);
		io.err(error.stderr);
		io.out("stop: HEAD does not hold PR_HEAD, so pull the PR branch first\n");
		return 1;
	}
	const log = spawnText(io, "git", [
		"log",
		"--oneline",
		`${pr.headRefOid}..HEAD`,
	]);
	if (!log.ok) return stopped(io, "git log", log.error);
	const unpushed = log.value.trimEnd();
	io.out(unpushed === "" ? "UNPUSHED: none\n" : `UNPUSHED:\n${unpushed}\n`);
	io.out(
		`ok: HEAD ${head === pr.headRefOid ? "equals" : "descends from"} PR_HEAD\n`,
	);
	return 0;
}

export const command: Command = {
	name: "pr-head",
	summary:
		"Reads the pull request of the current branch, or of --pr <n>, with gh. Then it fetches the head commit of that PR and checks that HEAD equals it or descends from it. It runs gh pr view, git fetch origin, git rev-parse HEAD, git merge-base --is-ancestor and git log --oneline, in that order, and stops at the first failure with the original error of that process. Each call reads the state again. It prints PR, HEAD and PR_HEAD, then the UNPUSHED commits, then a last line. The last line is ok: with exit 0, or no_pr: with exit 3 when gh exits 1 with the message no pull requests found for branch and no --pr is given, or stop: with exit 1. A usage error exits 2. A caller accepts only exit 0 with a last line that starts with ok:, or exit 3 with a last line that starts with no_pr:.",
	usage: "check pr-head [--pr <n>]",
	run,
};
