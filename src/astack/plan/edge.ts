import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { runGit } from "../git.ts";
import { profileSection } from "../profile.ts";
import { err, ok, type Result } from "../result.ts";
import { type PlanSet, planSetFromText } from "./planset.ts";
import type { SessionRecord } from "./session.ts";
import { parseSnapshot, type Snapshot } from "./tracker.ts";
import { planStateDir } from "./trail.ts";

export function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

export function gitText(cwd: string, args: string[]): string | undefined {
	const result = runGit(cwd, args);
	const text = result.ok ? result.stdout.toString("utf8").trim() : "";
	return text || undefined;
}

export function planCommit(root: string, paths: readonly string[]): string {
	return (
		gitText(root, ["log", "-1", "--format=%h", "--", ...paths]) ?? "uncommitted"
	);
}

export function renderAt(
	root: string,
	set: PlanSet,
): (sha: string) => PlanSet | undefined {
	return (sha) => {
		if (!/^[0-9a-f]{4,40}$/.test(sha)) return undefined;
		const text = gitText(root, ["show", `${sha}:${set.path}`]);
		return text === undefined
			? undefined
			: planSetFromText(set.path, `${text}\n`, (path) => {
					const brief = gitText(root, ["show", `${sha}:${path}`]);
					return brief === undefined ? undefined : `${brief}\n`;
				});
	};
}

export type PlanSettings = {
	readonly branchPrefix: string | undefined;
	readonly wip: number | undefined;
	readonly team: string | undefined;
};

export function planSettings(root: string): PlanSettings {
	const block = profileSection(root, "plan");
	const record: Readonly<Record<string, unknown>> =
		typeof block === "object" && block !== null && !Array.isArray(block)
			? Object.fromEntries(Object.entries(block))
			: {};
	const text = (key: string): string | undefined =>
		typeof record[key] === "string" && record[key] !== ""
			? String(record[key])
			: undefined;
	const wip = record.wip;
	return {
		branchPrefix: text("branchPrefix"),
		wip:
			typeof wip === "number" && Number.isInteger(wip) && wip > 0
				? wip
				: undefined,
		team: text("team"),
	};
}

export function readSnapshot(
	source: string | undefined,
	input: (() => string) | undefined,
	cwd: string,
): Result<Snapshot, readonly string[]> {
	if (source === undefined) return parseSnapshot("");
	const raw =
		source === "-"
			? (input?.() ?? "")
			: (readText(join(cwd, source)) ?? readText(source));
	return raw === undefined
		? err([`cannot read ${source}`])
		: parseSnapshot(raw);
}

function recordFile(
	root: string,
	slug: string,
	session: string,
): string | undefined {
	const dir = planStateDir(root, slug);
	return dir
		? join(dir, `session-${session.replace(/\//g, "-")}.json`)
		: undefined;
}

function isRecord(value: unknown): value is SessionRecord {
	return (
		typeof value === "object" &&
		value !== null &&
		"session" in value &&
		"branch" in value &&
		"checkpoints" in value &&
		Array.isArray(value.checkpoints)
	);
}

export function readRecord(
	root: string,
	slug: string,
	session: string,
): SessionRecord | undefined {
	const path = recordFile(root, slug, session);
	const text = path ? readText(path) : undefined;
	if (text === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function latestRecord(
	root: string,
	slug: string,
): SessionRecord | undefined {
	const dir = planStateDir(root, slug);
	if (!dir || !existsSync(dir)) return undefined;
	return readdirSync(dir)
		.filter((name) => /^session-.+\.json$/.test(name))
		.map((name) => readText(join(dir, name)))
		.flatMap((text) => {
			try {
				const parsed: unknown = JSON.parse(text ?? "");
				return isRecord(parsed) ? [parsed] : [];
			} catch {
				return [];
			}
		})
		.sort((a, b) =>
			(a.checkpoints.at(-1)?.at ?? a.started).localeCompare(
				b.checkpoints.at(-1)?.at ?? b.started,
			),
		)
		.at(-1);
}

export function writeRecord(
	root: string,
	slug: string,
	record: SessionRecord,
): Result<string, string> {
	const path = recordFile(root, slug, record.session);
	if (!path) return err("not inside a git repository");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
	return ok(path);
}
