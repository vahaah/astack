import { describe, expect, test } from "bun:test";
import {
	type PackageScripts,
	packageScripts,
	scriptFixerGaps,
	taskCacheGaps,
	uncachedTasks,
} from "../../scripts/lib/task-cache.ts";
import { profileGates } from "../../src/astack/pr-review-profile.ts";

function gates(
	...entries: {
		name: string;
		command: string;
		setup?: string[];
		ci_env?: { name: string; value?: string; why?: string }[];
	}[]
) {
	return profileGates({ version: 1, gates: entries });
}

function scripts(dir: string, json: object): PackageScripts[] {
	const entry = packageScripts(dir, JSON.stringify(json));
	return entry === undefined ? [] : [entry];
}

const packages = [
	...scripts(".", {
		name: "acme",
		scripts: {
			typecheck: "turbo run typecheck",
			lint: "turbo run lint && manypkg check",
			forced: "turbo lint --force --continue",
			build: "dotenv -c -- turbo build",
			e2e: "dotenv -c -- bun run --cwd packages/e2e e2e",
			reset: "dotenv -c -- turbo run reset --filter=@acme/db",
			check:
				'bun tooling/gates.ts "turbo env=bun test tooling/turbo-env.test.ts"',
			inventory: "turbo run test --dry=json",
			loop: "bun run loop",
		},
	}),
	...scripts("apps/app", {
		name: "@acme/app",
		scripts: { build: "next build --turbopack", clean: "rm -rf .turbo" },
	}),
	...scripts("packages/e2e", {
		name: "@acme/e2e",
		scripts: {
			e2e: "playwright test",
			visual: "bunx turbo run build-storybook && playwright test",
		},
	}),
];

const repo = {
	packages,
	uncached: uncachedTasks(
		'{\n  // tasks that never cache\n  "tasks": { "reset": { "cache": false }, "build-storybook": { "cache": false }, "build": {} }\n}',
	),
};

const forced = {
	name: "TURBO_FORCE",
	value: "true",
	why: "CI has no turbo cache.",
};

const gap = (gate: string, turbo: string) =>
	`The gate ${gate} runs \`${turbo}\` with no --force, so turbo can replay a cached green over a red tree. CI has no turbo cache. Set TURBO_FORCE to "true" in the ci_env of the gate, with a why.`;

describe("uncachedTasks", () => {
	test("reads the tasks with cache false from turbo.json with comments, or from a turbo 1 pipeline", () => {
		expect([...repo.uncached]).toEqual(["reset", "build-storybook"]);
		expect([
			...uncachedTasks('{"pipeline": {"dev": {"cache": false}, "lint": {}}}'),
		]).toEqual(["dev"]);
		expect([...uncachedTasks(undefined)]).toEqual([]);
		expect([...uncachedTasks("{")]).toEqual([]);
	});
});

describe("taskCacheGaps", () => {
	test("a gate whose script runs a cached turbo task with no --force and no TURBO_FORCE is a gap", () => {
		expect(
			taskCacheGaps(
				repo,
				gates(
					{ name: "typecheck", command: "bun run typecheck" },
					{ name: "lint", command: "bun run lint --force" },
					{ name: "build", command: "bun run build" },
					{ name: "direct", command: "./node_modules/.bin/turbo run test" },
					{ name: "in-setup", command: "bun run e2e", setup: ["bun run lint"] },
				),
			),
		).toEqual([
			gap("typecheck", "turbo run typecheck"),
			gap("lint", "turbo run lint"),
			gap("build", "turbo run build"),
			gap("direct", "turbo run test"),
			gap("in-setup", "turbo run lint"),
		]);
	});

	test("a gate that runs a script with the short form of bun, pnpm or yarn is followed too, and a command of the tool itself is not", () => {
		expect(
			taskCacheGaps(
				repo,
				gates(
					{ name: "bun-short", command: "bun typecheck" },
					{ name: "pnpm-short", command: "pnpm --filter=@acme/app build" },
					{ name: "yarn-short", command: "cd apps/app && yarn build" },
					{ name: "bun-own", command: "bun test && bun build ./src/index.ts" },
					{ name: "bun-file", command: "bun tooling/gates.ts typecheck" },
				),
			),
		).toEqual([gap("bun-short", "turbo run typecheck")]);
	});

	test("the same gate with TURBO_FORCE true, or a script that passes --force, has no gap", () => {
		expect(
			taskCacheGaps(
				repo,
				gates(
					{ name: "typecheck", command: "bun run typecheck", ci_env: [forced] },
					{
						name: "one",
						command: "bun run typecheck",
						ci_env: [{ name: "TURBO_FORCE", value: "1" }],
					},
					{ name: "forced", command: "bun run forced" },
					{ name: "passed", command: "bun run typecheck --force" },
				),
			),
		).toEqual([]);
	});

	test("TURBO_FORCE that the gate leaves to the session does not count", () => {
		expect(
			taskCacheGaps(
				repo,
				gates({
					name: "typecheck",
					command: "bun run typecheck",
					ci_env: [{ name: "TURBO_FORCE", why: "The session sets it." }],
				}),
			),
		).toEqual([gap("typecheck", "turbo run typecheck")]);
	});

	test("an uncached task, a dry run, a label, a message or a script with no turbo has no gap", () => {
		expect(
			taskCacheGaps(
				repo,
				gates(
					{ name: "reset", command: "bun run reset" },
					{ name: "visual", command: "bun run --filter=@acme/e2e visual" },
					{ name: "inventory", command: "bun run inventory" },
					{ name: "label", command: "bun run check" },
					{
						name: "message",
						command:
							'set -e\necho "::error::turbo test runs no task"\nbun run e2e',
					},
					{ name: "portal", command: "cd apps/app && bun run build" },
					{ name: "loop", command: "bun run loop" },
					{ name: "cache-dir", command: "rm -rf .turbo apps/*/.turbo" },
				),
			),
		).toEqual([]);
	});
});

describe("scriptFixerGaps", () => {
	const fixing = [
		...scripts(".", {
			name: "acme",
			scripts: {
				format: "biome format --write .",
				lint: "turbo run lint",
				check: "bun run format && biome lint .",
				deps: "manypkg check",
			},
		}),
		...scripts("apps/app", {
			name: "@acme/app",
			scripts: { lint: "eslint . --fix", typecheck: "tsc --noEmit" },
		}),
	];
	const fixerGap = (
		gate: string,
		script: string,
		folder: string,
		flag: string,
	) =>
		`The gate ${gate} runs the ${script} script of ${folder}, and that script runs ${flag}, a flag that changes files. So the gate can fix the tree and hide a red. Run a script that only checks.`;

	test("a gate that runs a script whose body, or a script or a turbo task that it runs, holds a fixer flag is a gap", () => {
		expect(
			scriptFixerGaps(
				fixing,
				gates(
					{ name: "format", command: "bun run format && bun run lint" },
					{ name: "check", command: "bun check" },
					{ name: "turbo", command: "bun run lint" },
					{ name: "filter", command: "bun run --filter=@acme/app lint" },
				),
			),
		).toEqual([
			fixerGap("format", "format", "the repo root", "--write"),
			fixerGap("check", "format", "the repo root", "--write"),
			fixerGap("turbo", "lint", "apps/app", "--fix"),
			fixerGap("filter", "lint", "apps/app", "--fix"),
		]);
	});

	test("a gate whose scripts only check has no gap", () => {
		expect(
			scriptFixerGaps(
				fixing,
				gates(
					{ name: "deps", command: "bun run deps" },
					{ name: "types", command: "cd apps/app && bun run typecheck" },
					{ name: "direct", command: "bunx biome ci ." },
				),
			),
		).toEqual([]);
	});
});
