import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import type { ProjectConfig } from "../../scripts/lib/projects.ts";
import { planRemovals } from "../../scripts/lib/removals.ts";
import {
	renderRepoArtifacts,
	renderReviewCopies,
} from "../../scripts/lib/render.ts";
import { lintTarget } from "../../scripts/lib/target-lint.ts";
import type { PathKind } from "../../scripts/lib/write-paths.ts";
import { managedList } from "../../src/astack/managed.ts";

const root = resolve(import.meta.dir, "../..");
const profileDir = join(root, "examples/companion/projects/acme");

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

const installLine =
	"claude plugin marketplace add vahaah/astack && claude plugin install astack@astack";
const fallbackPath = ".astack/pr-review-hardening/FALLBACK.md";
const fallbackTree: Readonly<Record<string, PathKind>> = {
	[fallbackPath]: "file",
	".astack/pr-review-hardening": "directory",
	".astack": "directory",
};
const retiredReason =
	"The review stub needs the astack plugin, which holds the one copy of the loop.";

describe("the review stub without the plugin", () => {
	test("[control:rs-install] each primary and mirrored stub holds the install line, links to no fallback and runs no step after the line", () => {
		const rendered = renderReviewCopies(project, profileDir);
		expect(rendered.problems).toEqual([]);
		const stubs = rendered.artifacts.filter(
			(artifact) => artifact.kind === "review-stub",
		);
		expect(stubs.map((artifact) => artifact.path)).toEqual(
			stubFolders.map((folder) => `${folder}/SKILL.md`),
		);
		for (const entry of stubs) {
			expect(entry.content).not.toContain("FALLBACK.md");
			expect(entry.content).toEndWith(
				`\`\`\`sh\n${installLine}\n\`\`\`\n\nThe README of that marketplace repo gives the steps for Codex, Cursor and Grok Bot.\n`,
			);
		}
	});

	test.each([
		[true, retiredReason],
		[false, "astack apply no longer writes it."],
	])(
		"[control:rs-retire] with reviewStub %p, apply deletes a tracked fallback once, with the reason %p",
		(reviewStub, reason) => {
			const plan = planRemovals({
				project: {
					...project,
					artifacts: { ...project.artifacts, reviewStub },
				},
				written: [],
				previous: [fallbackPath],
				probe: (path) => fallbackTree[path] ?? "missing",
			});
			expect(plan).toEqual({
				remove: [{ path: fallbackPath, reason }],
				refused: [],
			});
		},
	);
});

describe("the review stubs of each mirror", () => {
	test("the stubs respect existing file-scoped tool-name exceptions", async () => {
		const restricted: ProjectConfig = {
			...project,
			lint: {
				...project.lint,
				denySubstrings: ["astack"],
				denySubstringsExempt: [
					...stubFolders.map((folder) => `${folder}/SKILL.md`),
					".claude/pr-review-hardening.profile.md",
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

	test("the astack profile lists every stub as managed, and no fallback", () => {
		const { artifacts } = renderRepoArtifacts(project, [], profileDir);
		const profile = artifacts.find(
			(artifact) => artifact.path === ".astack/profile.json",
		);
		expect(managedList(JSON.parse(profile?.content ?? "{}"))).toEqual(
			[
				".astack/profile.json",
				...stubFolders.map((folder) => `${folder}/SKILL.md`),
				".claude/pr-review-hardening.profile.md",
			].sort(),
		);
	});
});
