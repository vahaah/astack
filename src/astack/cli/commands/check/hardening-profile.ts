import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../../../git.ts";
import { MANAGED_PATHS } from "../../../managed.ts";
import {
	MISSING_PROFILE_REPAIR,
	NO_BLOCK_REPAIR,
	problemText,
	reviewProfileState,
} from "../../../pr-review-profile.ts";
import { loadProfile } from "../../../profile.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check hardening-profile";

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function run(args: readonly string[], io: Io): number {
	if (args.length > 0) return usageError(io, `${NAME}: takes no argument`);
	const root = repoRoot(io.cwd) ?? io.cwd;
	const path = join(root, MANAGED_PATHS.reviewProfile);
	const state = reviewProfileState(
		path,
		readText(path),
		loadProfile(root).commentKeep,
	);
	switch (state.kind) {
		case "missing":
			return usageError(
				io,
				`${NAME}: ${path} is missing. ${MISSING_PROFILE_REPAIR}`,
			);
		case "no-block":
			return usageError(
				io,
				`${NAME}: ${path} has no fenced yaml or json block. ${NO_BLOCK_REPAIR}`,
			);
		case "checked":
			if (state.problems.length === 0) {
				io.out(`ok: ${path} passes the hardening profile rules\n`);
				return 0;
			}
			for (const problem of state.problems)
				io.out(`${path}: ${problemText(problem)}\n`);
			return 1;
		default: {
			const exhaustive: never = state;
			return exhaustive;
		}
	}
}

export const command: Command = {
	name: "hardening-profile",
	summary:
		"Checks .claude/pr-review-hardening.profile.md in the repo root with the rules that astack apply uses. It prints each problem with its repair and exits 1. A missing profile or a profile with no fenced yaml or json block exits 2 with the path and its repair. Exits 0 with an ok: line when each rule passes.",
	usage: "check hardening-profile",
	run,
};
