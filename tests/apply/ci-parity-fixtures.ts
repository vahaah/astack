import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CiParityConfig } from "../../scripts/lib/ci-parity.ts";

const fixtures = join(import.meta.dir, "../fixtures/ci-parity");
export const repo = join(fixtures, "repo");
const fragment = (name: string) => readFileSync(join(fixtures, name), "utf8");

export function fixtureProfile(gates: "before" | "after"): string {
	return [
		"# PR review hardening profile",
		"",
		"```yaml",
		fragment("profile-head.yml").trimEnd(),
		fragment(`gates-${gates}.yml`).trimEnd(),
		fragment("profile-tail.yml").trimEnd(),
		"```",
		"",
	].join("\n");
}

export const fixtureConfig: CiParityConfig = {
	setup: [
		{
			command: "bun install --frozen-lockfile",
			reason: "Installs the workspace. The gates run in a tree that has it.",
		},
	],
	map: [
		{
			job: "check.yml#browser-smoke",
			gates: ["layout-smoke"],
			reason: "The gate's prerequisites start the same stack.",
			differs: "A prerequisite checks the stack, and the suite starts the app.",
		},
		{
			job: "check.yml#manifests",
			gates: ["manifest-lint"],
			reason: "The gate runs the tool that the action wraps.",
			differs: "The gate runs the release of the tool that the action wraps.",
		},
	],
	exclude: [
		{ job: "check.yml#judge", reason: "Advisory: continue-on-error." },
		{ job: "check.yml#nightly", reason: "Runs only on the schedule." },
	],
};
