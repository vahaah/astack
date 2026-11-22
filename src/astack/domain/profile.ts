export const CARRIERS = ["result", "effect"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const DEFAULT_CODE_ROOTS: readonly string[] = [
	"src/**",
	"packages/**",
	"apps/**",
	"lib/**",
	"*.ts",
	"*.tsx",
	"*.swift",
];

export type DomainProfile = {
	readonly carrier: Carrier;
	readonly codeRoots: readonly string[];
};

export const DEFAULT_DOMAIN_PROFILE: DomainProfile = {
	carrier: "result",
	codeRoots: DEFAULT_CODE_ROOTS,
};

const KEYS = ["carrier", "codeRoots"];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCarrier(value: unknown): value is Carrier {
	return CARRIERS.some((carrier) => carrier === value);
}

function isGlob(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.trim() === value &&
		value !== "" &&
		!value.startsWith("/") &&
		!value.split("/").includes("..")
	);
}

function isGlobList(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.length > 0 && value.every(isGlob);
}

export function domainValueProblems(
	block: Readonly<Record<string, unknown>>,
	at: string,
): string[] {
	return [
		...(block.carrier === undefined || isCarrier(block.carrier)
			? []
			: [
					`${at}.carrier must be ${CARRIERS.map((c) => `"${c}"`).join(" or ")}`,
				]),
		...(block.codeRoots === undefined || isGlobList(block.codeRoots)
			? []
			: [`${at}.codeRoots must be a list of one or more globs in the repo`]),
	];
}

export function domainProblems(value: unknown): string[] {
	if (!isRecord(value)) return ["domain must be an object"];
	return [
		...Object.keys(value)
			.filter((key) => !KEYS.includes(key))
			.map((key) => `domain.${key} is not a known key`),
		...domainValueProblems(value, "domain"),
	];
}

export function domainProfile(value: unknown): DomainProfile {
	if (!isRecord(value)) return DEFAULT_DOMAIN_PROFILE;
	return {
		carrier: isCarrier(value.carrier)
			? value.carrier
			: DEFAULT_DOMAIN_PROFILE.carrier,
		codeRoots: isGlobList(value.codeRoots)
			? value.codeRoots
			: DEFAULT_DOMAIN_PROFILE.codeRoots,
	};
}
