import { basename, dirname } from "node:path";
import { MANAGED_PATHS, RETIRED_PATHS } from "../../src/astack/managed.ts";
import type { ProjectConfig } from "./projects.ts";
import { type PathProbe, writeRefusal } from "./write-paths.ts";

export type Removal = { readonly path: string; readonly reason: string };

export type RemovalPlan = {
	readonly remove: readonly Removal[];
	readonly refused: readonly string[];
};

const ownFiles: readonly string[] = [
	MANAGED_PATHS.profile,
	MANAGED_PATHS.notice,
	MANAGED_PATHS.reviewStub,
	MANAGED_PATHS.reviewProfile,
];

const stubShape = /(?:^|\/)skills\/pr-review-hardening\/SKILL\.md$/;

export function hasManagedShape(path: string, project: ProjectConfig): boolean {
	if (ownFiles.includes(path)) return true;
	if (stubShape.test(path)) return true;
	const inDir = (dir: string) =>
		path.startsWith(`${dir}/`) &&
		!path.slice(dir.length + 1).includes("/") &&
		path.endsWith(".md");
	return inDir(project.rulesDir) || inDir("docs/agents");
}

export type RemovalInput = {
	readonly project: ProjectConfig;
	readonly written: readonly string[];
	readonly previous: readonly string[] | undefined;
	readonly probe: PathProbe;
};

export function planRemovals(input: RemovalInput): RemovalPlan {
	const { project, written, previous, probe } = input;
	const candidates: Removal[] = [
		...(project.artifacts.reviewStub
			? RETIRED_PATHS.map(({ path, reason }) => ({ path, reason }))
			: []),
		...(previous ?? [])
			.filter((path) => !written.includes(path))
			.map((path) => ({
				path,
				reason: "astack apply no longer writes it.",
			})),
	];
	const remove: Removal[] = [];
	const refused: string[] = [];
	for (const candidate of candidates) {
		const kind = probe(candidate.path);
		if (kind === "missing") continue;
		const retired = RETIRED_PATHS.some(({ path }) => path === candidate.path);
		const refusal = !(retired || hasManagedShape(candidate.path, project))
			? "the old managed list names a path that astack never writes"
			: (writeRefusal(candidate.path, probe) ??
				(kind === "file" ? undefined : `it is a ${kind}, not a file`));
		if (refusal === undefined) remove.push(candidate);
		else refused.push(`${candidate.path}: ${refusal}`);
	}
	return { remove, refused };
}

const managedSkill = basename(dirname(MANAGED_PATHS.reviewStub));

const managedSkillWord = new RegExp(
	`(?<![a-z0-9])${managedSkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`,
	"i",
);

function namesManagedSkill(path: string): boolean {
	return path.split("/").some((segment) => managedSkillWord.test(segment));
}

export type StrayInput = {
	readonly project: ProjectConfig;
	readonly tracked: readonly string[];
	readonly written: readonly string[];
	readonly removed: readonly string[];
};

export function strayCopies(input: StrayInput): string[] {
	const { project, tracked, written, removed } = input;
	if (!project.artifacts.reviewStub) return [];
	return tracked
		.filter(
			(path) =>
				namesManagedSkill(path) &&
				!written.includes(path) &&
				!removed.includes(path) &&
				!RETIRED_PATHS.some((retired) => retired.path === path),
		)
		.map(
			(path) =>
				`${path}: a tracked copy of the ${managedSkill} skill or command that apply neither writes nor deletes. A harness can load it in place of the review stub. Delete it in the repo, or add it to RETIRED_PATHS in src/astack/managed.ts so apply deletes it.`,
		);
}
