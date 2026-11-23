import { writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sessionAttended } from "../../attended.ts";
import { repoRoot } from "../../git.ts";
import { readOptional } from "../../paths.ts";
import { driftReport, driftText } from "../../plan/drift.ts";
import {
	planCommit,
	planSettings,
	readSnapshot,
	renderAt,
} from "../../plan/edge.ts";
import { exportPlan, writePlanText } from "../../plan/export.ts";
import {
	type PlanState,
	planProfileFor,
	planStateFor,
} from "../../plan/files.ts";
import { parseKeys, setFrontmatter, writeKeys } from "../../plan/keys.ts";
import { frontmatterValue } from "../../plan/parse.ts";
import {
	loadPlanSet,
	type PlanSet,
	planSetFromText,
} from "../../plan/planset.ts";
import { type Snapshot, TARGETS, type Target } from "../../plan/tracker.ts";
import {
	appendDraft,
	appendTrail,
	draftEntry,
	parseTrailBatch,
	phaseProblem,
	readTrail,
	SLUG,
	sinceLastStart,
	TRAIL_HEADER,
	type TrailCells,
} from "../../plan/trail.ts";
import type { TrailRow } from "../../plan/types.ts";
import { extractCopy } from "../../plan/units.ts";
import { processPorts } from "../../ports.ts";
import { err, ok, type Result } from "../../result.ts";
import { checkText, denied } from "../../ste/check.ts";
import { denyMessage } from "../../ste/format.ts";
import { loadSettings } from "../../ste/profile.ts";
import { positional, valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const USAGE = [
	"plan attended",
	"plan trail <plan or slug> [<phase> <decision> <why> <evidence> <result> | -]",
	"plan draft <plan or slug> [<title> <why>]",
	"plan delegate <plan> on|off",
	"plan export <plan> --to linear|github [--team <name>] [--repo <owner/repo>] [--initiative <name>] [--tracker <file|->] [--overwrite] [--json]",
	"plan drift <plan or slug> [--tracker <file|->] [--json]",
	"plan keys <plan>",
];

export const VALUE_FLAGS = [
	"--to",
	"--team",
	"--repo",
	"--initiative",
	"--tracker",
	"--wip",
];

function attended(args: readonly string[], io: Io): number {
	if (args.length !== 0)
		return usageError(io, "astack plan attended: takes no arguments");
	io.out(sessionAttended(io.env) ? "attended\n" : "unattended\n");
	return 0;
}

function stateFor(
	name: string,
	target: string | undefined,
	io: Io,
): PlanState | undefined {
	const state = planStateFor(target ?? "", io.cwd);
	if (state.ok) return state.value;
	usageError(io, `astack plan ${name}: ${state.error}`);
	return undefined;
}

function trailRows(
	cells: readonly string[],
	io: Io,
): Result<readonly TrailCells[], string> {
	if (cells.length === 1 && cells[0] === "-")
		return parseTrailBatch(io.input?.() ?? "");
	if (cells.length !== 5)
		return err(
			"give <phase> <decision> <why> <evidence> <result>, quoted, or - to read rows from stdin",
		);
	const problem = phaseProblem(cells[0] ?? "");
	return problem === undefined ? ok([cells]) : err(problem);
}

function trail(args: readonly string[], io: Io): number {
	const [target, ...cells] = args;
	const state = stateFor("trail", target, io);
	if (!state) return 2;
	if (cells.length === 0) {
		const rows = readTrail(state.trail);
		io.out(`${state.trail}\n`);
		for (const row of sinceLastStart(rows ?? []))
			io.out(`${TRAIL_HEADER.map((key) => row[key]).join("\t")}\n`);
		return 0;
	}
	const rows = trailRows(cells, io);
	if (!rows.ok) return usageError(io, `astack plan trail: ${rows.error}`);
	appendTrail(state.trail, rows.value, io.now);
	io.out(`${state.trail}\n`);
	return 0;
}

function draft(args: readonly string[], io: Io): number {
	const [target, title, why, ...rest] = args;
	if (rest.length > 0 || (title !== undefined && why === undefined))
		return usageError(
			io,
			"astack plan draft: give <plan or slug>, or <plan or slug> <title> <why>, quoted",
		);
	const state = stateFor("draft", target, io);
	if (!state) return 2;
	if (title !== undefined && why !== undefined) {
		const blocked = denied(
			checkText(`${title}\n\n${why}`, {
				surface: "ticket",
				enforcement: "deny",
				glossary: loadSettings(state.root).glossary,
				titleLines: [1],
			}),
		);
		if (blocked.length > 0) {
			io.err(`${denyMessage("this draft", blocked)}\n`);
			return 1;
		}
		appendDraft(state.drafts, draftEntry(title, why, io.now));
	}
	io.out(`${state.drafts}\n`);
	if (title === undefined)
		io.out(readOptional(state.drafts) ?? "No drafts yet.\n");
	return 0;
}

function rootOf(io: Io): string {
	return repoRoot(io.cwd) ?? io.cwd;
}

function delegate(args: readonly string[], io: Io): number {
	const [file, value] = args;
	if (!file || (value !== "on" && value !== "off") || args.length !== 2)
		return usageError(io, "astack plan delegate: give <plan> on|off");
	const path = resolve(io.cwd, file);
	const text = readOptional(path);
	if (text === undefined)
		return usageError(io, `astack plan delegate: cannot read ${file}`);
	const state = stateFor("delegate", file, io);
	if (!state) return 2;
	const set = planSetFromText(file, text, () => undefined);
	const prior = frontmatterValue(set.root, "checkpoints") ?? "report";
	const restored =
		value === "off" ? checkpointsBefore(readTrail(state.trail)) : undefined;
	const checkpoints = value === "on" ? "report" : restored;
	const next = setFrontmatter(
		checkpoints === undefined
			? text
			: setFrontmatter(text, "checkpoints", checkpoints),
		"delegate",
		value,
	);
	writeFileSync(path, next);
	appendTrail(
		state.trail,
		[
			[
				"delegated",
				`delegate ${value}`,
				value === "on"
					? "the owner granted delegation"
					: "the owner asked to be asked",
				value === "on"
					? `owner prompt, checkpoints were ${prior}`
					: "owner prompt",
				value,
			],
		],
		io.now,
	);
	io.out(
		`${file}: delegate ${value}${checkpoints === undefined ? "" : `, checkpoints ${checkpoints}`}\n`,
	);
	return 0;
}

export function checkpointsBefore(
	rows: readonly TrailRow[] | undefined,
): string | undefined {
	const grant = [...(rows ?? [])]
		.reverse()
		.find((row) => row.phase === "delegated" && row.decision === "delegate on");
	return /checkpoints were (report|approve)\b/.exec(grant?.evidence ?? "")?.[1];
}

function targetFlag(args: readonly string[], io: Io): Target | undefined {
	const value = valueAfter(args, "--to");
	const target = TARGETS.find((candidate) => candidate === value);
	if (!target) usageError(io, "astack plan: --to takes linear or github");
	return target;
}

export function snapshotFrom(
	args: readonly string[],
	io: Io,
	stdinDefault: boolean,
): Snapshot | undefined {
	const flag = valueAfter(args, "--tracker");
	if (flag === null) {
		usageError(io, "astack plan: --tracker needs a file, or - for stdin");
		return undefined;
	}
	const result = readSnapshot(
		flag ?? (stdinDefault ? "-" : undefined),
		io.input,
		io.cwd,
	);
	if (!result.ok) {
		io.err(
			`${result.error.map((problem) => `astack plan: ${problem}`).join("\n")}\n`,
		);
		return undefined;
	}
	return result.value;
}

export function setFor(
	file: string,
	io: Io,
): { set: PlanSet; root: string } | undefined {
	const root = rootOf(io);
	const loaded = loadPlanSet(root, resolve(io.cwd, file), readOptional);
	if (!loaded.ok) {
		usageError(io, `astack plan: ${loaded.error}`);
		return undefined;
	}
	return { set: loaded.value, root };
}

function shaOf(root: string, set: PlanSet): string {
	return planCommit(root, [
		set.path,
		...[...set.briefs.values()].map((brief) => brief.path),
	]);
}

export function printPlan(
	io: Io,
	args: readonly string[],
	value: unknown,
	text: string,
): void {
	io.out(
		args.includes("--json") ? `${JSON.stringify(value, null, 2)}\n` : text,
	);
}

function exportCommand(args: readonly string[], io: Io): number {
	const [file] = positional(args, VALUE_FLAGS);
	if (!file) return usageError(io, "astack plan export: give the plan file");
	const target = targetFlag(args, io);
	if (!target) return 2;
	const loaded = setFor(file, io);
	if (!loaded) return 2;
	const snapshot = snapshotFrom(args, io, false);
	if (!snapshot) return 2;
	const edited = new Set(
		driftReport(loaded.set, snapshot, {
			target,
			today: io.today,
			now: io.now,
			renderAt: renderAt(loaded.root, loaded.set),
		})
			.filter((found) => found.kind === "edited-in-tracker")
			.map((found) => found.unit),
	);
	const result = exportPlan(loaded.set, snapshot, {
		target,
		sha: shaOf(loaded.root, loaded.set),
		team:
			valueAfter(args, "--team") ?? planSettings(loaded.root).team ?? undefined,
		repo: valueAfter(args, "--repo") ?? undefined,
		initiative: valueAfter(args, "--initiative") ?? undefined,
		edited,
		overwrite: args.includes("--overwrite"),
	});
	if (!result.ok) {
		io.err(
			`${result.error.map((problem) => `astack plan export: ${problem}`).join("\n")}\n`,
		);
		return 1;
	}
	printPlan(io, args, result.value, writePlanText(result.value));
	return 0;
}

function setFromSnapshot(
	slug: string,
	snapshot: Snapshot,
): PlanSet | undefined {
	const copies = new Map(
		snapshot.objects.flatMap((object) => {
			const copy = object.link?.endsWith("/copy")
				? extractCopy(object.body)
				: undefined;
			return copy ? [[copy.path, copy.text] as const] : [];
		}),
	);
	const root = snapshot.objects.find(
		(object) => object.link === `${slug}/copy`,
	);
	const copy = root ? extractCopy(root.body) : undefined;
	return copy
		? planSetFromText(copy.path, copy.text, (path) => copies.get(path))
		: undefined;
}

function slugFile(root: string, slug: string): string | undefined {
	if (!SLUG.test(slug)) return undefined;
	const dir = join(root, planProfileFor(processPorts(), root).dir);
	return [join(dir, `${slug}.md`), join(dir, slug, "index.md")].find(
		(candidate) => readOptional(candidate) !== undefined,
	);
}

function drift(args: readonly string[], io: Io): number {
	const [file] = positional(args, VALUE_FLAGS);
	if (!file)
		return usageError(
			io,
			"astack plan drift: give the plan file, or the slug of a moved plan",
		);
	const snapshot = snapshotFrom(args, io, true);
	if (!snapshot) return 2;
	const root = rootOf(io);
	const path =
		readOptional(resolve(io.cwd, file)) !== undefined
			? file
			: slugFile(root, file);
	const loaded = path === undefined ? undefined : setFor(path, io);
	if (path !== undefined && !loaded) return 2;
	const set = loaded?.set ?? setFromSnapshot(file, snapshot);
	if (!set)
		return usageError(
			io,
			`astack plan drift: ${file} is not a file, and the snapshot holds no plan copy for it`,
		);
	const drifts = driftReport(set, snapshot, {
		target: snapshot.target ?? "linear",
		today: io.today,
		now: io.now,
		renderAt: renderAt(root, set),
	});
	printPlan(io, args, { slug: set.slug, drifts }, driftText(set.slug, drifts));
	return drifts.length > 0 ? 1 : 0;
}

function keys(args: readonly string[], io: Io): number {
	const [file] = args;
	if (!file || args.length !== 1)
		return usageError(
			io,
			'astack plan keys: give the plan file and pipe {"<unit>": "<key>"} on stdin',
		);
	const parsed = parseKeys(io.input?.() ?? "");
	if (!parsed)
		return usageError(
			io,
			"astack plan keys: stdin is a JSON object of unit to key",
		);
	const loaded = setFor(file, io);
	if (!loaded) return 2;
	const applied = new Set<string>();
	for (const path of [
		loaded.set.path,
		...[...loaded.set.briefs.values()].map((brief) => brief.path),
	]) {
		const absolute = resolve(loaded.root, path);
		const text = readOptional(absolute) ?? "";
		const result = writeKeys(text, loaded.set.slug, parsed, {
			root: path === loaded.set.path,
		});
		if (result.text !== text) writeFileSync(absolute, result.text);
		for (const unit of result.applied) applied.add(unit);
		if (result.text !== text)
			io.out(`${relative(io.cwd, absolute) || absolute}\n`);
	}
	const skipped = [...parsed.keys()].filter((unit) => !applied.has(unit));
	io.out(
		`${applied.size} keys written${skipped.length > 0 ? `; ${skipped.length} kept only in the tracker back-links (${skipped.join(", ")})` : ""}. Commit the plan files in one commit.\n`,
	);
	return 0;
}

function run(args: readonly string[], io: Io): number {
	const [sub, ...rest] = args;
	switch (sub) {
		case "attended":
			return attended(rest, io);
		case "trail":
			return trail(rest, io);
		case "draft":
			return draft(rest, io);
		case "delegate":
			return delegate(rest, io);
		case "export":
			return exportCommand(rest, io);
		case "drift":
			return drift(rest, io);
		case "keys":
			return keys(rest, io);
		default:
			return usageError(
				io,
				`astack plan: give one of\n${USAGE.map((line) => `  astack ${line}`).join("\n")}`,
			);
	}
}

export const command: Command = {
	name: "plan",
	summary:
		"Keeps the plan trail and drafts, sets the delegation grant, and prints the tracker write plan of export, drift and key write-back. It never calls a tracker.",
	usage: USAGE.join("\n"),
	run,
};
