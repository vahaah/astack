import { relative, resolve } from "node:path";
import { tierOf } from "../../plan/check.ts";
import {
	gitText,
	latestRecord,
	planSettings,
	readRecord,
	readText,
	writeRecord,
} from "../../plan/edge.ts";
import { frontmatterValue, parsePlan } from "../../plan/parse.ts";
import { slugOf } from "../../plan/planset.ts";
import {
	branchName,
	checkpointPackage,
	handoff,
	nextScope,
	type ProofLog,
	pickSession,
	recordFromHistory,
	resumePrompt,
	type SessionOutput,
	type SessionRecord,
	startSession,
} from "../../plan/session.ts";
import { appendTrail, trailPath } from "../../plan/trail.ts";
import type { Plan, Session } from "../../plan/types.ts";
import { positional, valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";
import { rootOf } from "./plan.ts";

const USAGE = [
	"session start <plan> [<session>] [--prefix <name>] [--ultracode] [--json]",
	"session checkpoint <plan> [<session>] [--steps <n,n> | --wave <W>] [--gates <counts>] [--summary <file|->] [--proof <log>] [--screenshot <file>] [--pr <n>] [--json]",
	"session handoff <plan> [<session>] [--json]",
	"session resume <plan> [<session>] [--tracker <pr json file|->]",
];

const VALUE_FLAGS = [
	"--tracker",
	"--prefix",
	"--steps",
	"--wave",
	"--gates",
	"--summary",
	"--proof",
	"--screenshot",
	"--pr",
];

type Loaded = {
	readonly plan: Plan;
	readonly path: string;
	readonly root: string;
	readonly slug: string;
};

function load(file: string, io: Io): Loaded | undefined {
	const root = rootOf(io);
	const absolute = resolve(io.cwd, file);
	const text = readText(absolute);
	if (text === undefined) {
		usageError(io, `astack session: cannot read ${file}`);
		return undefined;
	}
	const path = relative(root, absolute);
	const plan = parsePlan(path, text);
	if (tierOf(plan) === "programme") {
		usageError(
			io,
			"astack session: a programme index holds no sessions; give the block brief",
		);
		return undefined;
	}
	const slug = (
		frontmatterValue(plan, "programme") ?? slugOf(plan, path)
	).toLowerCase();
	return { plan, path, root, slug };
}

function session(
	loaded: Loaded,
	handle: string | undefined,
	io: Io,
): Session | undefined {
	const picked = pickSession(loaded.plan, handle);
	if (!picked.ok) {
		usageError(io, `astack session: ${picked.error}`);
		return undefined;
	}
	return picked.value;
}

function emit(
	io: Io,
	args: readonly string[],
	output: SessionOutput,
	loaded: Loaded,
): number {
	const previous = readRecord(loaded.root, loaded.slug, output.record.session);
	const record =
		previous && output.record.checkpoints.length === 0
			? {
					...output.record,
					started: previous.started,
					base: previous.base,
					pr: previous.pr,
					ultracode: previous.ultracode || output.record.ultracode,
					checkpoints: previous.checkpoints,
				}
			: output.record;
	const saved = writeRecord(loaded.root, loaded.slug, record);
	if (!saved.ok) return usageError(io, `astack session: ${saved.error}`);
	const kept =
		record !== output.record
			? `The record of ${record.session} already existed, so its ${record.checkpoints.length} ${record.checkpoints.length === 1 ? "checkpoint stays" : "checkpoints stay"}.\n`
			: "";
	io.out(
		args.includes("--json")
			? `${JSON.stringify({ ...output, record }, null, 2)}\n`
			: `${output.text}${kept}`,
	);
	return 0;
}

function prefixFor(args: readonly string[], loaded: Loaded): string {
	return (
		valueAfter(args, "--prefix") ??
		planSettings(loaded.root).branchPrefix ??
		gitText(loaded.root, ["config", "user.name"])?.split(/\s+/)[0] ??
		"work"
	);
}

function recordFor(
	loaded: Loaded,
	chosen: Session,
	io: Io,
): SessionRecord | undefined {
	const record = readRecord(loaded.root, loaded.slug, chosen.handle ?? "");
	if (!record)
		usageError(
			io,
			`astack session: ${chosen.handle} has no record; run astack session start first`,
		);
	return record;
}

function start(args: readonly string[], io: Io): number {
	const [file, handle] = positional(args, VALUE_FLAGS);
	if (!file) return usageError(io, "astack session start: give the plan file");
	const loaded = load(file, io);
	if (!loaded) return 2;
	const chosen = session(loaded, handle, io);
	if (!chosen) return 2;
	const base =
		gitText(loaded.root, ["merge-base", "HEAD", "origin/HEAD"]) ??
		gitText(loaded.root, ["rev-parse", "HEAD"]);
	return emit(
		io,
		args,
		startSession(loaded.plan, loaded.path, chosen, {
			prefix: prefixFor(args, loaded),
			ultracode: args.includes("--ultracode"),
			now: io.now,
			base,
		}),
		loaded,
	);
}

function readSummary(
	source: string | null | undefined,
	io: Io,
): string | undefined {
	if (!source) return undefined;
	return source === "-" ? io.input?.() : readText(resolve(io.cwd, source));
}

const PROOF_TAIL = 20;

function proofOf(value: string | undefined, io: Io): ProofLog {
	if (value === undefined || value.trim() === "") return { kind: "none" };
	const log = readText(resolve(io.cwd, value));
	if (log === undefined) return { kind: "text", text: value };
	const lines = log.trimEnd().split("\n");
	return { kind: "log", tail: lines.slice(-PROOF_TAIL).join("\n") };
}

function checkpoint(args: readonly string[], io: Io): number {
	const [file, handle] = positional(args, VALUE_FLAGS);
	if (!file)
		return usageError(io, "astack session checkpoint: give the plan file");
	const loaded = load(file, io);
	if (!loaded) return 2;
	const chosen = session(loaded, handle, io);
	if (!chosen) return 2;
	const found = recordFor(loaded, chosen, io);
	if (!found) return 2;
	const prFlag = Number(valueAfter(args, "--pr") ?? Number.NaN);
	const record: SessionRecord =
		Number.isInteger(prFlag) && prFlag > 0 ? { ...found, pr: prFlag } : found;
	const stepsFlag = valueAfter(args, "--steps");
	const waveFlag = valueAfter(args, "--wave");
	const scope = stepsFlag
		? {
				steps: chosen.steps.filter((step) =>
					stepsFlag
						.split(",")
						.map((id) => id.trim())
						.includes(step.id),
				),
				wave: undefined,
			}
		: waveFlag
			? {
					steps: chosen.steps.filter(
						(step) => (step.wave || "W1") === waveFlag,
					),
					wave: waveFlag,
				}
			: nextScope(chosen, record);
	if (scope.steps.length === 0)
		return usageError(
			io,
			"astack session checkpoint: no step matches. Every step can be done already.",
		);
	const summary = readSummary(valueAfter(args, "--summary"), io);
	if (summary === undefined || summary.trim() === "")
		return usageError(
			io,
			"astack session checkpoint: give --summary <file|-> with the summary of the scope, 10 lines or fewer",
		);
	const since = record.checkpoints.at(-1)?.head ?? record.base;
	const range = since ? `${since}..HEAD` : "HEAD";
	const output = checkpointPackage(
		loaded.plan,
		chosen,
		record,
		scope,
		{
			branch: gitText(loaded.root, ["rev-parse", "--abbrev-ref", "HEAD"]),
			head: gitText(loaded.root, ["rev-parse", "--short", "HEAD"]),
			diffstat:
				gitText(loaded.root, [
					"diff",
					"--stat",
					...(since ? [`${since}...HEAD`] : ["HEAD"]),
				]) ?? "",
			commits: (gitText(loaded.root, ["log", "--format=%h %s", range]) ?? "")
				.split("\n")
				.filter(Boolean),
		},
		{
			gates: valueAfter(args, "--gates") ?? undefined,
			summary,
			proof: proofOf(valueAfter(args, "--proof") ?? undefined, io),
			screenshots: args.flatMap((arg, i) =>
				arg === "--screenshot" && args[i + 1] ? [args[i + 1] ?? ""] : [],
			),
			now: io.now,
		},
	);
	const trail = trailPath(loaded.root, loaded.slug);
	if (trail)
		appendTrail(
			trail,
			[
				"checkpoint",
				`${record.session} steps ${scope.steps.map((step) => step.id).join(",")}`,
				"checkpoint package",
				output.record.checkpoints.at(-1)?.head ?? "no head",
				"report",
			],
			io.now,
		);
	return emit(io, args, output, loaded);
}

function handoffCommand(args: readonly string[], io: Io): number {
	const [file, handle] = positional(args, VALUE_FLAGS);
	if (!file)
		return usageError(io, "astack session handoff: give the plan file");
	const loaded = load(file, io);
	if (!loaded) return 2;
	const chosen = session(loaded, handle, io);
	if (!chosen) return 2;
	const record = recordFor(loaded, chosen, io);
	if (!record) return 2;
	const trail = trailPath(loaded.root, loaded.slug);
	if (trail)
		appendTrail(
			trail,
			[
				"handoff",
				record.session,
				"the session pauses",
				record.branch,
				"paused",
			],
			io.now,
		);
	return emit(
		io,
		args,
		handoff(
			loaded.plan,
			chosen,
			record,
			resumePrompt(loaded.plan, chosen, record),
		),
		loaded,
	);
}

function historyRecord(
	loaded: Loaded,
	handle: string | undefined,
	args: readonly string[],
	io: Io,
): SessionRecord | undefined {
	const picked = pickSession(loaded.plan, handle);
	if (!picked.ok) return undefined;
	const chosen = picked.value;
	const prefix = prefixFor(args, loaded);
	const named = branchName(loaded.plan, chosen, loaded.path, prefix);
	const current = gitText(loaded.root, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const branch =
		gitText(loaded.root, ["rev-parse", "--verify", "--quiet", named]) !==
		undefined
			? named
			: (current ?? named);
	const base = gitText(loaded.root, ["merge-base", branch, "origin/HEAD"]);
	const subjects = (
		gitText(loaded.root, [
			"log",
			"--format=%h %s",
			base ? `${base}..${branch}` : branch,
		]) ?? ""
	)
		.split("\n")
		.filter(Boolean);
	const source = valueAfter(args, "--tracker") ?? undefined;
	const pr =
		source === undefined
			? undefined
			: source === "-"
				? io.input?.()
				: readText(resolve(io.cwd, source));
	return recordFromHistory(loaded.path, chosen, {
		branch,
		base,
		subjects,
		pr,
		now: io.now,
	});
}

function resume(args: readonly string[], io: Io): number {
	const [file, handle] = positional(args, VALUE_FLAGS);
	if (!file) return usageError(io, "astack session resume: give the plan file");
	const loaded = load(file, io);
	if (!loaded) return 2;
	const saved = handle
		? readRecord(loaded.root, loaded.slug, handle)
		: latestRecord(loaded.root, loaded.slug);
	const record = saved ?? historyRecord(loaded, handle, args, io);
	if (!record)
		return usageError(
			io,
			"astack session resume: no session record and no now session. Name the session.",
		);
	const chosen = loaded.plan.sessions.find(
		(candidate) => candidate.handle === record.session,
	);
	if (!chosen)
		return usageError(
			io,
			`astack session resume: the plan no longer holds ${record.session}`,
		);
	io.out(`${resumePrompt(loaded.plan, chosen, record)}\n`);
	return 0;
}

function run(args: readonly string[], io: Io): number {
	const [sub, ...rest] = args;
	switch (sub) {
		case "start":
			return start(rest, io);
		case "checkpoint":
			return checkpoint(rest, io);
		case "handoff":
			return handoffCommand(rest, io);
		case "resume":
			return resume(rest, io);
		default:
			return usageError(
				io,
				`astack session: give one of\n${USAGE.map((line) => `  astack ${line}`).join("\n")}`,
			);
	}
}

export const command: Command = {
	name: "session",
	summary:
		"Starts, checkpoints, hands off and resumes one plan session. State lives in git and the tracker. Tracker writes print as a plan for the skill to run.",
	usage: USAGE.join("\n"),
	run,
};
