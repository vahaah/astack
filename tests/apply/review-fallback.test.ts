import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import type { ProjectConfig } from "../../scripts/lib/projects.ts";
import { hasManagedShape, planRemovals } from "../../scripts/lib/removals.ts";
import {
	renderRepoArtifacts,
	renderReviewCopies,
	reviewFallbackSource,
	reviewStubSource,
} from "../../scripts/lib/render.ts";
import { lintTarget } from "../../scripts/lib/target-lint.ts";
import type { PathKind } from "../../scripts/lib/write-paths.ts";
import { managedList } from "../../src/astack/managed.ts";

const root = resolve(import.meta.dir, "../..");
const profileDir = join(root, "examples/companion/projects/acme");
const stub = readFileSync(reviewStubSource, "utf8");
const fallback = readFileSync(reviewFallbackSource, "utf8");

const project: ProjectConfig = {
	name: "acme",
	path: "~/Projects/acme",
	mode: "write",
	rulesDir: ".claude/rules/standards",
	artifacts: {
		rules: false,
		settings: false,
		reviewStub: true,
		agentDocs: false,
		profile: true,
	},
	tracker: { kind: "none", dir: ".scratch" },
	domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
	keepPatterns: ["\\bADR-\\d{4}\\b"],
	lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
	gates: [],
	ciOnlyGates: [],
	commentConflicts: [],
	adrNeeded: [],
	skillMirrors: [
		".agents/skills",
		"agent-skills",
		"tooling/nested/agent/skills",
	],
};

const stubFolders = [
	".claude/skills/pr-review-hardening",
	...(project.skillMirrors ?? []).map((dir) => `${dir}/pr-review-hardening`),
];

describe("the review stubs link to one shared fallback", () => {
	test("the fallback respects existing file-scoped tool-name exceptions", async () => {
		const restricted: ProjectConfig = {
			...project,
			lint: {
				...project.lint,
				denySubstrings: ["astack"],
				denySubstringsExempt: [
					...stubFolders.map((folder) => `${folder}/SKILL.md`),
					".claude/pr-review-hardening.profile.md",
					".astack/",
				],
			},
		};
		const rendered = renderReviewCopies(restricted, profileDir);
		const result = await lintTarget(restricted, rendered.artifacts, {
			projects: [restricted],
			hashes: new Set(),
		});
		expect(rendered.problems).toEqual([]);
		expect(result.findings).toEqual([]);
		expect(
			rendered.artifacts.some((file) => file.content.includes("astack")),
		).toBe(true);
	});

	test("the stub holds no line of the fallback", () => {
		const copied = fallback
			.split("\n")
			.filter((line) => line.length >= 40 && stub.includes(line));
		expect(copied).toEqual([]);
		expect(stub).not.toContain("## Fallback");
	});

	test("each stub link resolves to the complete shared fallback at every mirror depth", () => {
		const rendered = renderReviewCopies(project, profileDir);
		expect(rendered.problems).toEqual([]);
		const entries = rendered.artifacts.filter((artifact) =>
			artifact.path.endsWith("/SKILL.md"),
		);
		expect(entries.map((entry) => entry.path)).toEqual(
			stubFolders.map((folder) => `${folder}/SKILL.md`),
		);
		expect(
			rendered.artifacts
				.filter((artifact) => artifact.path.endsWith("/FALLBACK.md"))
				.map((artifact) => [artifact.path, artifact.content]),
		).toEqual([[".astack/pr-review-hardening/FALLBACK.md", fallback]]);
		for (const entry of entries) {
			const target = /\[FALLBACK\.md\]\(([^)]+)\)/.exec(entry.content)?.[1];
			if (target === undefined)
				throw new Error(`no fallback link in ${entry.path}`);
			const linked = posix.normalize(
				posix.join(posix.dirname(entry.path), target),
			);
			expect(
				rendered.artifacts.find((artifact) => artifact.path === linked)
					?.content,
			).toBe(fallback);
		}
	});

	test("the astack profile lists every stub and the shared fallback as managed", () => {
		const { artifacts } = renderRepoArtifacts(project, [], profileDir);
		const profile = artifacts.find(
			(artifact) => artifact.path === ".astack/profile.json",
		);
		const managed = managedList(JSON.parse(profile?.content ?? "{}"));
		expect(managed).toEqual(
			expect.arrayContaining([
				...stubFolders.map((folder) => `${folder}/SKILL.md`),
				".astack/pr-review-hardening/FALLBACK.md",
			]),
		);
		expect(managed?.filter((path) => path.endsWith("/FALLBACK.md"))).toEqual([
			".astack/pr-review-hardening/FALLBACK.md",
		]);
	});
});

describe("cleanup of the fallback", () => {
	const probe = (files: Readonly<Record<string, PathKind>>) => (path: string) =>
		files[path] ?? "missing";

	test("apply deletes the shared fallback when the review artifacts are disabled", () => {
		const plan = planRemovals({
			project: {
				...project,
				artifacts: { ...project.artifacts, reviewStub: false },
			},
			written: [],
			previous: [".astack/pr-review-hardening/FALLBACK.md"],
			probe: probe({
				".astack/pr-review-hardening/FALLBACK.md": "file",
				".astack/pr-review-hardening": "directory",
				".astack": "directory",
			}),
		});
		expect(plan.refused).toEqual([]);
		expect(plan.remove.map((removal) => removal.path)).toEqual([
			".astack/pr-review-hardening/FALLBACK.md",
		]);
	});

	test.each([
		[".astack/pr-review-hardening/FALLBACK.md", true],
		[".claude/skills/pr-review-hardening/FALLBACK.md", false],
		["docs/FALLBACK.md", false],
		[".claude/skills/other/FALLBACK.md", false],
	])("%s has the managed shape: %p", (path, expected) => {
		expect(hasManagedShape(path, project)).toBe(expected);
	});
});
