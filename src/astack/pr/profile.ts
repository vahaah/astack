import { readProfileJson } from "../profile.ts";

export type MergeAuthority = "standing" | "turn";

export type MergeProfile = {
	readonly authority: MergeAuthority;
	readonly standingBases: readonly string[];
	readonly requireChecks: boolean;
};

export const DEFAULT_MERGE_PROFILE: MergeProfile = {
	authority: "turn",
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

export function parseMergeProfile(parsed: unknown): MergeProfile {
	const merge = record(record(parsed).merge);
	return {
		authority: merge.authority === "standing" ? "standing" : "turn",
		standingBases: branchNames(merge.standingBases),
		requireChecks: merge.requireChecks !== false,
	};
}

export function partOfRequired(projectDir: string): boolean {
	return (
		record(record(readProfileJson(projectDir)).tracker).requirePartOf === true
	);
}
