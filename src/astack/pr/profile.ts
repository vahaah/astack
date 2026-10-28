import { readProfileJson } from "../profile.ts";

export type MergeAuthority = "standing" | "turn";

export type PrProfile = {
	readonly requirePartOf: boolean;
	readonly mergeAuthority: MergeAuthority;
	readonly standingBases: readonly string[];
	readonly requireChecks: boolean;
};

export const DEFAULT_PR_PROFILE: PrProfile = {
	requirePartOf: false,
	mergeAuthority: "turn",
	standingBases: [],
	requireChecks: true,
};

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Fields {
	return isFields(value) ? value : {};
}

function branchNames(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter(
				(name): name is string =>
					typeof name === "string" && name.trim() !== "",
			)
		: [];
}

export function parsePrProfile(parsed: unknown): PrProfile {
	const root = record(parsed);
	const tracker = record(root.tracker);
	const merge = record(root.merge);
	return {
		requirePartOf: tracker.requirePartOf === true,
		mergeAuthority: merge.authority === "standing" ? "standing" : "turn",
		standingBases: branchNames(merge.standingBases),
		requireChecks: merge.requireChecks !== false,
	};
}

export function loadPrProfile(projectDir: string): PrProfile {
	return parsePrProfile(readProfileJson(projectDir));
}
