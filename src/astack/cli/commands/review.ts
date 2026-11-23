import { join } from "node:path";
import { historyGit, resolveCommit } from "../../change-proof/candidate.ts";
import { repoRoot, runGit } from "../../git.ts";
import { gitCommonDir } from "../../plan/trail.ts";
import { err, ok, type Result } from "../../result.ts";
import {
	deltaBase,
	isStopDecision,
	launchTotal,
	type ReviewedHead,
	type ReviewRecord,
	STOP_DECISIONS,
	withHead,
} from "../../review-record.ts";
import {
	loadRecord,
	type RecordProblem,
	saveRecord,
} from "../../review-store.ts";
import { valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const NAME = "astack review";

type Failure = { readonly code: 1 | 2; readonly message: string };

type Place = { readonly root: string; readonly path: string };

function placeOf(io: Io): Result<Place, Failure> {
	const root = repoRoot(io.cwd);
	if (root === undefined)
		return err({ code: 2, message: `${NAME}: run it inside a git repo` });
	const branch = runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
	const name = branch.stdout.toString("utf8").trim();
	if (!branch.ok || name === "")
		return err({
			code: 1,
			message: `${NAME}: HEAD is on no branch, so no review record belongs to it`,
		});
	const common = gitCommonDir(root);
	if (common === undefined)
		return err({ code: 1, message: `${NAME}: git cannot name its common dir` });
	return ok({
		root,
		path: join(
			common,
			"pr-review-hardening",
			`${name.replaceAll("/", "-")}.review.json`,
		),
	});
}

function commitOf(
	place: Place,
	ref: string,
	command: string,
): Result<string, Failure> {
	const sha = resolveCommit(place.root, ref, historyGit);
	return sha === undefined || sha === ""
		? err({
				code: 2,
				message: `${NAME} ${command}: git cannot find the commit of ${ref}`,
			})
		: ok(sha);
}

function unreadable(problem: Extract<RecordProblem, { kind: "unreadable" }>) {
	return {
		code: 1,
		message: `${NAME}: the review record ${problem.path} is unreadable: ${problem.message}. Repair or move it by hand`,
	} as const satisfies Failure;
}

function holds(root: string, head: string, sha: string): boolean {
	return (
		resolveCommit(root, sha, historyGit) === sha &&
		historyGit(root, ["merge-base", "--is-ancestor", sha, head]).ok
	);
}

function fail(io: Io, failure: Failure): number {
	io.err(`${failure.message}\n`);
	return failure.code;
}

function base(args: readonly string[], io: Io): number {
	const head = valueAfter(args, "--head");
	if (typeof head !== "string")
		return usageError(io, `${NAME} base: give --head <ref>`);
	const place = placeOf(io);
	if (!place.ok) return fail(io, place.error);
	const headSha = commitOf(place.value, head, "base");
	if (!headSha.ok) return fail(io, headSha.error);
	const loaded = loadRecord(place.value.path);
	if (!loaded.ok) {
		if (loaded.error.kind === "unreadable")
			return fail(io, unreadable(loaded.error));
		io.out(`full: no review record at ${place.value.path}\n`);
		return 3;
	}
	const record = loaded.value;
	const ancestors = [...new Set(record.heads.map((one) => one.sha))].filter(
		(sha) => holds(place.value.root, headSha.value, sha),
	);
	const result = deltaBase(record, ancestors);
	io.out(
		[
			`baseSha: ${record.baseSha}`,
			`firstReviewedHead: ${record.firstReviewedHead}`,
			`launches: ${launchTotal(record)}`,
			result.kind === "delta"
				? `delta: ${result.sha}`
				: `full: ${result.reason}`,
			"",
		].join("\n"),
	);
	return result.kind === "delta" ? 0 : 3;
}

type Stop = Omit<ReviewedHead, "sha">;

function stopOf(args: readonly string[]): Result<Stop | undefined, string> {
	const decision = valueAfter(args, "--decision");
	const launches = valueAfter(args, "--launches");
	if (decision === undefined && launches === undefined) return ok(undefined);
	if (decision === undefined || launches === undefined)
		return err("give --decision and --launches together");
	if (typeof decision !== "string" || !isStopDecision(decision))
		return err(`--decision must be one of ${STOP_DECISIONS.join(", ")}`);
	const count = Number(launches);
	if (
		typeof launches !== "string" ||
		!/^\d+$/.test(launches) ||
		!Number.isSafeInteger(count)
	)
		return err("--launches must be a whole number");
	return ok({ decision, launches: count });
}

function firstRecord(
	place: Place,
	baseSha: string,
	headSha: string,
): Result<ReviewRecord, Failure> {
	const merge = historyGit(place.root, ["merge-base", baseSha, headSha]);
	const shared = merge.stdout.toString("utf8").trim();
	return merge.ok && shared !== ""
		? ok({ baseSha: shared, firstReviewedHead: headSha, heads: [] })
		: err({
				code: 1,
				message: `${NAME} record: git finds no merge base of ${baseSha} and ${headSha}`,
			});
}

function record(args: readonly string[], io: Io): number {
	const baseRef = valueAfter(args, "--base");
	const headRef = valueAfter(args, "--head");
	if (typeof baseRef !== "string" || typeof headRef !== "string")
		return usageError(io, `${NAME} record: give --base <ref> and --head <ref>`);
	const stop = stopOf(args);
	if (!stop.ok) return usageError(io, `${NAME} record: ${stop.error}`);
	const place = placeOf(io);
	if (!place.ok) return fail(io, place.error);
	const baseSha = commitOf(place.value, baseRef, "record");
	if (!baseSha.ok) return fail(io, baseSha.error);
	const headSha = commitOf(place.value, headRef, "record");
	if (!headSha.ok) return fail(io, headSha.error);
	const loaded = loadRecord(place.value.path);
	if (!loaded.ok && loaded.error.kind === "unreadable")
		return fail(io, unreadable(loaded.error));
	const current = loaded.ok
		? ok(loaded.value)
		: firstRecord(place.value, baseSha.value, headSha.value);
	if (!current.ok) return fail(io, current.error);
	const next =
		stop.value === undefined
			? current.value
			: withHead(current.value, { sha: headSha.value, ...stop.value });
	if (!loaded.ok || stop.value !== undefined) {
		const saved = saveRecord(next, place.value.path);
		if (!saved.ok)
			return fail(io, {
				code: 1,
				message: `${NAME} record: cannot save ${saved.error.path}: ${saved.error.message}`,
			});
	}
	io.out(
		`ok: ${place.value.path} holds ${next.heads.length} heads and ${launchTotal(next)} launches\n`,
	);
	return 0;
}

function run(args: readonly string[], io: Io): number {
	const [sub, ...rest] = args;
	switch (sub) {
		case "base":
			return base(rest, io);
		case "record":
			return record(rest, io);
		default:
			return usageError(io, `${NAME}: give base or record`);
	}
}

export const command: Command = {
	name: "review",
	summary:
		"Reads and writes the review record of the current branch, at pr-review-hardening/<branch>.review.json in the git common dir, with each / of the branch name as -. The record holds baseSha, firstReviewedHead and each reviewed head with its stop decision and its reviewer launches. base prints both first-review fields and the launch total, then a last line. The last line is delta: <sha> with exit 0 when HEAD holds a stop_clean head of the record, and the sha is the last such head. Otherwise it is full: <reason> with exit 3. It reads ancestry with git --no-replace-objects, so a replace ref cannot fake an ancestor. record creates an absent record from the merge base of --base and --head, and never changes baseSha or firstReviewedHead. With --decision and --launches, it adds the head at the end. A save writes a temporary file and renames it. An unreadable record, a branch name that git cannot give or a failed save exits 1, and no command writes over an unreadable record. Wrong arguments exit 2.",
	usage:
		"review base --head <ref>\nreview record --base <ref> --head <ref> [--decision <stop decision> --launches <n>]",
	run,
};
