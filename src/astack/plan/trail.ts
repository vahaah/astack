import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runGit } from "../git.ts";
import { parseTrail } from "./check.ts";
import type { TrailRow } from "./types.ts";

export const TRAIL_KINDS = [
	"start",
	"tier",
	"answer",
	"default",
	"delegated",
	"gate",
	"diverge",
	"boundary",
	"checkpoint",
	"handoff",
] as const;

export const TRAIL_HEADER = [
	"ts",
	"phase",
	"decision",
	"why",
	"evidence",
	"result",
] as const;

export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function gitCommonDir(cwd: string): string | undefined {
	const result = runGit(cwd, ["rev-parse", "--git-common-dir"]);
	if (!result.ok) return undefined;
	const path = result.stdout.toString("utf8").trim();
	return path ? resolve(cwd, path) : undefined;
}

export function planStateDir(cwd: string, slug: string): string | undefined {
	const common = gitCommonDir(cwd);
	return common ? join(common, "astack", "plans", slug) : undefined;
}

export function trailPath(cwd: string, slug: string): string | undefined {
	const dir = planStateDir(cwd, slug);
	return dir ? join(dir, "trail.tsv") : undefined;
}

export function draftsPath(cwd: string, slug: string): string | undefined {
	const dir = planStateDir(cwd, slug);
	return dir ? join(dir, "drafts.md") : undefined;
}

export function draftEntry(title: string, why: string, at: Date): string {
	const flat = (value: string) => value.replace(/\s+/g, " ").trim();
	return `## ${flat(title)}\n\n${flat(why)}\n\nFound ${at.toISOString().slice(0, 10)}.\n\n`;
}

export function appendDraft(path: string, entry: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const header = existsSync(path)
		? ""
		: "# Drafts\n\nOut-of-scope findings. The owner files each one with agree.\n\n";
	appendFileSync(path, `${header}${entry}`);
}

export function trailCell(value: string): string {
	const flat = value.replace(/[\t\r\n]+/g, " ").trim();
	return /^[=+\-@]/.test(flat) ? `'${flat}` : flat;
}

export function trailLine(cells: string[], at: Date): string {
	return [
		at.toISOString().replace(/\.\d{3}Z$/, "Z"),
		...cells.map(trailCell),
	].join("\t");
}

export function appendTrail(path: string, cells: string[], at: Date): void {
	mkdirSync(dirname(path), { recursive: true });
	const header = existsSync(path) ? "" : `${TRAIL_HEADER.join("\t")}\n`;
	appendFileSync(path, `${header}${trailLine(cells, at)}\n`);
}

export function readTrail(path: string | undefined): TrailRow[] | undefined {
	if (!path || !existsSync(path)) return undefined;
	try {
		return parseTrail(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

export function sinceLastStart(rows: TrailRow[]): TrailRow[] {
	const last = rows.map((row) => row.phase).lastIndexOf("start");
	return last < 0 ? rows : rows.slice(last);
}
