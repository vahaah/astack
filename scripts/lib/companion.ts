import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { expandHome, repoRoot } from "./projects.ts";

export const COMPANION_ENV = "ASTACK_COMPANION_DIR";

export const PROFILE_SCAN_ENV = "ASTACK_PROFILE_SCAN_DIR";

export function exampleCompanion(root: string): Companion {
	return { source: "example", root: join(root, "examples", "companion") };
}

export const exampleCompanionRoot = exampleCompanion(repoRoot).root;

export type CompanionSource = "flag" | "env" | "example";

export type Companion = {
	readonly source: CompanionSource;
	readonly root: string;
};

export type CompanionPaths = {
	readonly projects: string;
	readonly deny: string;
	readonly canary: string;
	readonly machine: string;
	readonly rules: string;
	readonly docs: string;
	readonly profileScan: string;
	readonly tests: string;
};

export function companionFrom(
	flag: string | undefined,
	env: Readonly<Record<string, string | undefined>>,
): Companion {
	if (flag !== undefined)
		return { source: "flag", root: resolve(expandHome(flag)) };
	const value = env[COMPANION_ENV];
	if (value !== undefined && value !== "")
		return { source: "env", root: resolve(expandHome(value)) };
	return { source: "example", root: exampleCompanionRoot };
}

export function companionPaths(companion: Companion): CompanionPaths {
	return {
		projects: join(companion.root, "projects"),
		deny: join(companion.root, "deny", "names.sha256"),
		canary: join(companion.root, "deny", "canary"),
		machine: join(companion.root, "machine.json"),
		rules: join(companion.root, "rules"),
		docs: join(companion.root, "docs"),
		profileScan: join(companion.root, "profile-scan.json"),
		tests: join(companion.root, "tests"),
	};
}

export function openCompanion(
	flag: string | undefined,
	env: Readonly<Record<string, string | undefined>>,
): Result<Companion, string> {
	const companion = companionFrom(flag, env);
	return existsSync(companionPaths(companion).projects)
		? ok(companion)
		: err(`${companion.root} holds no projects/ folder`);
}

export function writable(companion: Companion): Result<Companion, string> {
	return companion.source === "example"
		? err(
				`${companion.root} is the synthetic example companion. Pass --companion <dir> or set ${COMPANION_ENV} to write.`,
			)
		: ok(companion);
}
