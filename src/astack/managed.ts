export const MANAGED_PATHS = {
	profile: ".astack/profile.json",
	notice: ".astack/NOTICE",
	reviewStub: ".claude/skills/pr-review-hardening/SKILL.md",
	reviewProfile: ".claude/pr-review-hardening.profile.md",
	settings: ".claude/settings.json",
} as const;

export function mirroredStubPath(skillsDir: string): string {
	return `${skillsDir}/pr-review-hardening/SKILL.md`;
}

export type RetiredPath = { readonly path: string; readonly reason: string };

export const RETIRED_PATHS: readonly RetiredPath[] = [
	{
		path: ".claude/commands/pr-review-hardening.md",
		reason:
			"A skill wins over a command file with the same name, so the review stub serves /pr-review-hardening.",
	},
	{
		path: ".claude/GOAL-pr-review-hardening.txt",
		reason: "The hardening skill makes its /goal text from the profile.",
	},
];

export const MERGED_PATHS: readonly string[] = [MANAGED_PATHS.settings];

export type Ownership =
	| { readonly kind: "written" }
	| { readonly kind: "retired"; readonly reason: string }
	| { readonly kind: "merged" }
	| { readonly kind: "repo"; readonly reason: string }
	| { readonly kind: "unknown" };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function managedList(profile: unknown): readonly string[] | undefined {
	const list = isRecord(profile) ? profile.managed : undefined;
	return Array.isArray(list) && list.every((entry) => typeof entry === "string")
		? list
		: undefined;
}

export function ownership(path: string, profile: unknown): Ownership {
	if (!isRecord(profile))
		return { kind: "repo", reason: "the repo has no astack profile" };
	const retired = RETIRED_PATHS.find((entry) => entry.path === path);
	if (retired !== undefined) return { kind: "retired", reason: retired.reason };
	if (MERGED_PATHS.includes(path)) return { kind: "merged" };
	const list = managedList(profile);
	if (list === undefined) return { kind: "unknown" };
	return list.includes(path)
		? { kind: "written" }
		: { kind: "repo", reason: "astack apply does not write it" };
}
