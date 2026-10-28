import { describe, expect, test } from "bun:test";
import type { ProjectConfig } from "../../scripts/lib/projects.ts";
import {
	hasManagedShape,
	planRemovals,
	strayCopies,
} from "../../scripts/lib/removals.ts";
import type { PathKind } from "../../scripts/lib/write-paths.ts";

const project: ProjectConfig = {
	name: "acme",
	path: "~/Projects/acme",
	mode: "write",
	rulesDir: ".claude/rules/standards",
	artifacts: {
		rules: true,
		settings: false,
		reviewStub: true,
		agentDocs: true,
		profile: true,
	},
	tracker: { kind: "none", dir: ".scratch" },
	domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
	keepPatterns: [],
	lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
	gates: [],
	ciOnlyGates: [],
	commentConflicts: [],
	adrNeeded: [],
};

function probeOf(files: Readonly<Record<string, PathKind>>) {
	return (path: string): PathKind => files[path] ?? "missing";
}

describe("planRemovals", () => {
	test("deletes the retired hardening command and goal file when they exist", () => {
		const plan = planRemovals({
			project,
			written: [],
			previous: undefined,
			probe: probeOf({
				".claude/commands/pr-review-hardening.md": "file",
				".claude/GOAL-pr-review-hardening.txt": "file",
				".claude": "directory",
				".claude/commands": "directory",
			}),
		});
		expect(plan.refused).toEqual([]);
		expect(plan.remove.map((removal) => removal.path)).toEqual([
			".claude/commands/pr-review-hardening.md",
			".claude/GOAL-pr-review-hardening.txt",
		]);
	});

	test("keeps the retired files when the project writes no review stub", () => {
		const plan = planRemovals({
			project: {
				...project,
				artifacts: { ...project.artifacts, reviewStub: false },
			},
			written: [],
			previous: undefined,
			probe: probeOf({ ".claude/commands/pr-review-hardening.md": "file" }),
		});
		expect(plan.remove).toEqual([]);
	});

	test("deletes a file that the old managed list names and apply no longer writes", () => {
		const plan = planRemovals({
			project,
			written: [".claude/rules/standards/coding.md"],
			previous: [
				".claude/rules/standards/coding.md",
				".claude/rules/standards/old.md",
			],
			probe: probeOf({
				".claude/rules/standards/coding.md": "file",
				".claude/rules/standards/old.md": "file",
			}),
		});
		expect(plan.remove).toEqual([
			{
				path: ".claude/rules/standards/old.md",
				reason: "astack apply no longer writes it.",
			},
		]);
	});

	test("refuses to delete a listed path that astack never writes", () => {
		const plan = planRemovals({
			project,
			written: [],
			previous: ["src/index.ts", "CLAUDE.md"],
			probe: probeOf({ "src/index.ts": "file", "CLAUDE.md": "file" }),
		});
		expect(plan.remove).toEqual([]);
		expect(plan.refused).toEqual([
			"src/index.ts: the old managed list names a path that astack never writes",
			"CLAUDE.md: the old managed list names a path that astack never writes",
		]);
	});

	test("refuses to delete through a symlink", () => {
		const plan = planRemovals({
			project,
			written: [],
			previous: undefined,
			probe: probeOf({
				".claude/commands": "symlink",
				".claude/commands/pr-review-hardening.md": "file",
			}),
		});
		expect(plan.remove).toEqual([]);
		expect(plan.refused[0]).toContain(".claude/commands is a symlink");
	});
});

describe("hasManagedShape", () => {
	test.each([
		[".astack/NOTICE", true],
		[".agents/skills/pr-review-hardening/SKILL.md", true],
		[".claude/rules/standards/comments.md", true],
		["docs/agents/domain.md", true],
		["docs/agents/deep/domain.md", false],
		[".claude/rules/other/comments.md", false],
		[".claude/settings.json", false],
	])("%s is %p", (path, expected) => {
		expect(hasManagedShape(path, project)).toBe(expected);
	});
});

describe("strayCopies", () => {
	const stray = (path: string) =>
		`${path}: a tracked copy of the pr-review-hardening skill or command that apply neither writes nor deletes. A harness can load it in place of the review stub. Delete it in the repo, or add it to RETIRED_PATHS in src/astack/managed.ts so apply deletes it.`;
	const tracked = [
		".claude/skills/pr-review-hardening/SKILL.md",
		".claude/pr-review-hardening.profile.md",
		".claude/commands/pr-review-hardening.md",
		".claude/GOAL-pr-review-hardening.txt",
		".cursor/commands/pr-review-hardening.md",
		".agents/skills/pr-review-hardening/SKILL.md",
		".codex/prompts/pr-review-hardening.toml",
		"docs/adr/0024-a-row-is-approved-in-the-prs-hardening-review.md",
		"src/index.ts",
	];
	const written = [
		".claude/skills/pr-review-hardening/SKILL.md",
		".claude/pr-review-hardening.profile.md",
	];

	test("a tracked copy of the hardening skill or command that apply neither writes nor deletes is a stray copy", () => {
		expect(
			strayCopies({
				project,
				tracked,
				written,
				removed: [".claude/commands/pr-review-hardening.md"],
			}),
		).toEqual([
			stray(".cursor/commands/pr-review-hardening.md"),
			stray(".agents/skills/pr-review-hardening/SKILL.md"),
			stray(".codex/prompts/pr-review-hardening.toml"),
		]);
	});

	test("a tracked file whose name holds the skill name anywhere in a segment is a stray copy too", () => {
		expect(
			strayCopies({
				project,
				tracked: [
					".cursor/GOAL-pr-review-hardening.md",
					".github/prompts/old-pr-review-hardening.prompt.md",
					"docs/pr-review-hardened.md",
					"scripts/pr-review-hardening2.ts",
				],
				written,
				removed: [],
			}),
		).toEqual([
			stray(".cursor/GOAL-pr-review-hardening.md"),
			stray(".github/prompts/old-pr-review-hardening.prompt.md"),
		]);
	});

	test("a mirror that apply writes is no stray copy", () => {
		expect(
			strayCopies({
				project,
				tracked: [".agents/skills/pr-review-hardening/SKILL.md"],
				written: [...written, ".agents/skills/pr-review-hardening/SKILL.md"],
				removed: [],
			}),
		).toEqual([]);
	});

	test("a project that writes no review stub owns no hardening copy", () => {
		expect(
			strayCopies({
				project: {
					...project,
					artifacts: { ...project.artifacts, reviewStub: false },
				},
				tracked,
				written: [],
				removed: [],
			}),
		).toEqual([]);
	});
});
