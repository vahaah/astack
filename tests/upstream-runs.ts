import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { componentOrigin, componentPath } from "../scripts/build.ts";
import { isText, textOf } from "../scripts/dist/tree.ts";
import { listComponents } from "../scripts/lib/frontmatter.ts";
import type { UpstreamName } from "../scripts/lib/upstreams.ts";
import type { Result } from "../src/astack/result.ts";

export const SCANNED_UPSTREAMS = [
	"pstack",
	"mattpocock-skills",
	"cursor-team-kit",
] as const;

export const UNSCANNED_UPSTREAMS: Readonly<Record<string, string>> = {
	"cursor-plugin-schemas":
		"it holds only JSON schemas that scripts/dist.ts reads to validate the Cursor build, and dist/ never ships them",
};

export type ScannedUpstream = (typeof SCANNED_UPSTREAMS)[number];

export type RunIndex<T extends string = ScannedUpstream> = ReadonlyMap<
	string,
	ReadonlySet<T>
>;

const root = join(import.meta.dir, "..");
const runLength = 8;

function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/’/g, "'")
		.split(/[^a-z0-9']+/)
		.filter(Boolean);
}

export function runsOf(text: string, length = runLength): string[] {
	const list = words(text);
	const runs: string[] = [];
	for (let at = 0; at + length <= list.length; at++)
		runs.push(list.slice(at, at + length).join(" "));
	return runs;
}

function filesUnder(path: string): string[] {
	return statSync(path).isDirectory()
		? readdirSync(path).flatMap((name) => filesUnder(join(path, name)))
		: [path];
}

export function textsUnder(path: string): string[] {
	return filesUnder(path).flatMap((file) => {
		const entry = { bytes: readFileSync(file), executable: false };
		return isText(entry) ? [textOf(entry)] : [];
	});
}

export function upstreamTexts(upstream: string): string[] {
	return filesUnder(join(root, "upstream", upstream))
		.filter((file) => basename(file) !== "LICENSE")
		.flatMap((file) => textsUnder(file));
}

function indexRuns<T extends string>(
	upstreams: readonly T[],
	length = runLength,
): RunIndex<T> {
	const index = new Map<string, Set<T>>();
	for (const upstream of upstreams)
		for (const text of upstreamTexts(upstream))
			for (const run of runsOf(text, length))
				index.set(run, new Set(index.get(run)).add(upstream));
	return index;
}

export function readUpstreamRuns(length = runLength): RunIndex {
	return indexRuns(SCANNED_UPSTREAMS, length);
}

export function readUnscannedRuns(): RunIndex<string> {
	return indexRuns(Object.keys(UNSCANNED_UPSTREAMS));
}

export function copiedFrom<T extends string>(
	index: RunIndex<T>,
	text: string,
	ignored: ReadonlySet<string> = new Set(),
	length = runLength,
): T[] {
	const found = new Set<T>();
	for (const run of runsOf(text, length)) {
		if (ignored.has(run)) continue;
		for (const upstream of index.get(run) ?? []) found.add(upstream);
	}
	return [...found].sort();
}

const GITHUB_REVIEW_REPLY_CALL =
	"with `gh api --method POST repos/<owner>/<repo>/pulls/<pr>/comments/<comment-id>/replies --input <file>`";
const BASH_STRICT_MODE_HEADER =
	"#!/usr/bin/env bash\n\nset -euo pipefail\n\nif";

export const SHARED_BOILERPLATE: ReadonlySet<string> = new Set(
	[GITHUB_REVIEW_REPLY_CALL, BASH_STRICT_MODE_HEADER].flatMap((text) =>
		runsOf(text),
	),
);

export type OriginItem = {
	readonly label: string;
	readonly texts: readonly string[];
	readonly origin: Result<readonly UpstreamName[], string>;
};

export function pluginItems(pluginRoot: string): OriginItem[] {
	return listComponents(pluginRoot).map((component) => {
		const path = componentPath(component);
		return {
			label: relative(pluginRoot, path),
			texts: textsUnder(path),
			origin: componentOrigin(component),
		};
	});
}

export type OriginFindings = {
	readonly gaps: readonly string[];
	readonly notes: readonly string[];
};

export function originFindings(
	items: readonly OriginItem[],
	index: RunIndex,
): OriginFindings {
	const gaps: string[] = [];
	const notes: string[] = [];
	for (const { label, texts, origin } of items) {
		if (!origin.ok) {
			gaps.push(`${label}: ${origin.error}`);
			continue;
		}
		const copied = new Set(
			texts.flatMap((text) => copiedFrom(index, text, SHARED_BOILERPLATE)),
		);
		for (const upstream of SCANNED_UPSTREAMS) {
			const named = origin.value.includes(upstream);
			if (copied.has(upstream) && !named) gaps.push(`${label}: ${upstream}`);
			if (named && !copied.has(upstream)) notes.push(`${label}: ${upstream}`);
		}
	}
	return { gaps, notes };
}

export function upstreamCopyright(upstream: ScannedUpstream): string {
	const line = readFileSync(join(root, "upstream", upstream, "LICENSE"), "utf8")
		.split("\n")
		.find((entry) => entry.startsWith("Copyright "));
	if (line === undefined)
		throw new Error(`upstream/${upstream}/LICENSE has no Copyright line`);
	return line.trim();
}
