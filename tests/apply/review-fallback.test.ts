import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ProjectConfig } from "../../scripts/lib/projects.ts";
import { hasManagedShape, planRemovals } from "../../scripts/lib/removals.ts";
import {
	renderRepoArtifacts,
	renderReviewCopies,
	reviewFallbackSource,
	reviewStubSource,
} from "../../scripts/lib/render.ts";
import type { PathKind } from "../../scripts/lib/write-paths.ts";
import {
	managedList,
	mirroredFallbackPath,
	REVIEW_FALLBACK_FILE,
} from "../../src/astack/managed.ts";

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
	skillMirrors: [".agents/skills"],
};

const stubFolders = [
	".claude/skills/pr-review-hardening",
	".agents/skills/pr-review-hardening",
];

describe("the review stub forwards and its fallback is a sibling file", () => {
	test("the stub holds no line of the fallback", () => {
		const copied = fallback
			.split("\n")
			.filter((line) => line.length >= 40 && stub.includes(line));
		expect(copied).toEqual([]);
		expect(stub).not.toContain("## Fallback");
	});

	test("apply renders the fallback beside the stub in the primary folder and in each mirror", () => {
		const rendered = renderReviewCopies(project, profileDir);
		expect(rendered.problems).toEqual([]);
		const bySibling = (name: string) =>
			rendered.artifacts
				.filter((artifact) => artifact.path.endsWith(`/${name}`))
				.map((artifact) => [dirname(artifact.path), artifact.content]);
		expect(bySibling("SKILL.md")).toEqual(
			stubFolders.map((folder) => [folder, stub]),
		);
		expect(bySibling(REVIEW_FALLBACK_FILE)).toEqual(
			stubFolders.map((folder) => [folder, fallback]),
		);
	});

	test("the astack profile lists the stub and the fallback of each folder as managed", () => {
		const { artifacts } = renderRepoArtifacts(project, [], profileDir);
		const profile = artifacts.find(
			(artifact) => artifact.path === ".astack/profile.json",
		);
		const managed = managedList(JSON.parse(profile?.content ?? "{}"));
		expect(managed).toEqual(
			expect.arrayContaining([
				...stubFolders.map((folder) => `${folder}/SKILL.md`),
				...stubFolders.map((folder) => `${folder}/${REVIEW_FALLBACK_FILE}`),
			]),
		);
		expect(mirroredFallbackPath(".agents/skills")).toBe(
			".agents/skills/pr-review-hardening/FALLBACK.md",
		);
	});
});

describe("cleanup of the fallback", () => {
	const probe = (files: Readonly<Record<string, PathKind>>) => (path: string) =>
		files[path] ?? "missing";

	test("a mirror fallback that a repo drops from its managed list is deleted", () => {
		const plan = planRemovals({
			project,
			written: [".claude/skills/pr-review-hardening/FALLBACK.md"],
			previous: [".agents/skills/pr-review-hardening/FALLBACK.md"],
			probe: probe({
				".agents/skills/pr-review-hardening/FALLBACK.md": "file",
				".agents/skills/pr-review-hardening": "directory",
				".agents/skills": "directory",
				".agents": "directory",
			}),
		});
		expect(plan.refused).toEqual([]);
		expect(plan.remove.map((removal) => removal.path)).toEqual([
			".agents/skills/pr-review-hardening/FALLBACK.md",
		]);
	});

	test.each([
		[".claude/skills/pr-review-hardening/FALLBACK.md", true],
		[".agents/skills/pr-review-hardening/FALLBACK.md", true],
		["docs/FALLBACK.md", false],
		[".claude/skills/other/FALLBACK.md", false],
	])("%s has the managed shape: %p", (path, expected) => {
		expect(hasManagedShape(path, project)).toBe(expected);
	});
});
