import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	companionPaths,
	exampleCompanionRoot,
} from "../../scripts/lib/companion.ts";
import { noticeReference } from "../../scripts/lib/notices.ts";
import { loadAllProjects } from "../../scripts/lib/projects.ts";
import {
	type Artifact,
	noticePath,
	readRuleSources,
	renderRepoArtifacts,
	renderWouldBeArtifacts,
} from "../../scripts/lib/render.ts";
import { UPSTREAMS, type UpstreamName } from "../../scripts/lib/upstreams.ts";
import {
	copiedFrom,
	readUnscannedRuns,
	readUpstreamRuns,
	SCANNED_UPSTREAMS,
	type ScannedUpstream,
	UNSCANNED_UPSTREAMS,
} from "../upstream-runs.ts";

const root = join(import.meta.dir, "../..");
const upstreams: readonly UpstreamName[] = ["pstack", "mattpocock-skills"];
const runs = readUpstreamRuns();

const exampleProjects = companionPaths({
	source: "example",
	root: exampleCompanionRoot,
}).projects;
const projects = await loadAllProjects(exampleProjects);
const rendered = projects.map((project) => ({
	name: project.name,
	artifacts: renderWouldBeArtifacts(
		project,
		readRuleSources(),
		join(exampleProjects, project.name),
	).artifacts,
}));

function declared(artifact: Artifact): ScannedUpstream[] {
	return [
		...new Set((artifact.sources ?? []).map((source) => source.upstream)),
	].sort();
}

const hasName = (value: unknown): value is { name: string } =>
	typeof value === "object" &&
	value !== null &&
	"name" in value &&
	typeof value.name === "string";

function lockSourceNames(): string[] {
	const lock: unknown = JSON.parse(
		readFileSync(join(root, "upstream/lock.json"), "utf8"),
	);
	const sources: unknown[] =
		typeof lock === "object" &&
		lock !== null &&
		"sources" in lock &&
		Array.isArray(lock.sources)
			? lock.sources
			: [];
	return sources
		.filter(hasName)
		.map((source) => source.name)
		.sort();
}

describe("the upstreams that the run scan reads", () => {
	test("each source in upstream/lock.json is scanned, or the unscanned table gives the reason, never both", () => {
		expect(
			[...SCANNED_UPSTREAMS, ...Object.keys(UNSCANNED_UPSTREAMS)].sort(),
		).toEqual(lockSourceNames());
	});
});

describe("text that apply copies from upstream", () => {
	test("the check finds the quoted Comment Sicko sections", () => {
		const comments = rendered[0]?.artifacts.find((artifact) =>
			artifact.path.endsWith("/comments.md"),
		);
		expect(copiedFrom(runs, comments?.content ?? "")).toEqual(["pstack"]);
	});

	test.each(rendered)(
		"$name declares every upstream it copies",
		({ artifacts }) => {
			for (const artifact of artifacts.filter(
				(entry) => entry.kind !== "notice",
			))
				expect({
					path: artifact.path,
					missing: copiedFrom(runs, artifact.content).filter(
						(upstream) => !declared(artifact).includes(upstream),
					),
				}).toEqual({ path: artifact.path, missing: [] });
		},
	);

	test.each(rendered)(
		"$name: each copied file points at the notice",
		({ artifacts }) => {
			for (const artifact of artifacts.filter((entry) => entry.sources)) {
				expect(
					artifact.content
						.trimEnd()
						.endsWith(noticeReference(artifact.sources ?? [])),
				).toBe(true);
			}
		},
	);

	test.each(rendered)(
		"$name: no rendered file shares a run with an upstream of the unscanned table",
		({ artifacts }) => {
			const unscanned = readUnscannedRuns();
			expect(
				artifacts.flatMap((artifact) =>
					copiedFrom(unscanned, artifact.content).map(
						(upstream) => `${artifact.path}: ${upstream}`,
					),
				),
			).toEqual([]);
		},
	);

	test.each(rendered)(
		"$name: the notice lists each copied file and holds each licence",
		({ artifacts }) => {
			const notice = artifacts.find((artifact) => artifact.path === noticePath);
			const text = notice?.content ?? "";
			for (const artifact of artifacts.filter((entry) => entry.sources))
				expect(text).toContain(`- ${artifact.path}: `);
			const copied = [...new Set(artifacts.flatMap(declared))];
			expect(copied).toContain("pstack");
			expect(
				copied.filter(
					(upstream) => !upstreams.some((name) => name === upstream),
				),
			).toEqual([]);
			for (const upstream of upstreams) {
				const license = readFileSync(
					join(root, "upstream", upstream, "LICENSE"),
					"utf8",
				).trimEnd();
				expect(text).toContain(license);
				expect(text).toContain(`${UPSTREAMS[upstream].label}, from https://`);
			}
		},
	);
});

describe("the managed list in the astack profile", () => {
	test.each(projects.filter((project) => project.mode === "write"))(
		"$name lists every file that apply writes, and nothing else",
		(project) => {
			const { artifacts } = renderRepoArtifacts(
				project,
				readRuleSources(),
				join(exampleProjects, project.name),
			);
			const profile = artifacts.find(
				(artifact) => artifact.path === ".astack/profile.json",
			);
			expect(JSON.parse(profile?.content ?? "{}").managed).toEqual(
				artifacts.map((artifact) => artifact.path).sort(),
			);
		},
	);
});
