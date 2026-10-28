import { describe, expect, test } from "bun:test";
import {
	envApps,
	envFileGaps,
	exampleTarget,
	namedEnvPaths,
} from "../../scripts/lib/env-files.ts";
import { packageScripts } from "../../scripts/lib/task-cache.ts";
import { profileGates } from "../../src/astack/pr-review-profile.ts";

function gates(
	...entries: {
		name: string;
		command: string;
		setup?: string[];
		requires?: { name: string; check: string; on_missing: "stop" }[];
	}[]
) {
	return profileGates({ version: 1, gates: entries });
}

const names: Readonly<Record<string, string>> = {
	"apps/app": "@acme/app",
	"apps/api": "@acme/api",
};

const apps = envApps(
	[
		"apps/app/.env.local.example",
		"apps/app/package.json",
		"apps/api/.env-template",
		".env.example",
		"apps/app/src/env.ts",
	],
	(dir) => names[dir],
);

const ignored = new Set([
	"apps/app/.env.local",
	"apps/api/.env",
	"apps/api/.env.local",
	".env",
]);

const portalCheck = {
	name: "apps/app/.env.local of this worktree",
	check: "test -f apps/app/.env.local",
	on_missing: "stop" as const,
};

const gap = (gate: string) =>
	`The gate ${gate} runs apps/app, and git tracks apps/app/.env.local.example there. The app reads an env file that git ignores, so a new worktree does not have it, and the gate fails on the base too. Add a prerequisite whose check names that file, such as \`test -f apps/app/.env.local\`.`;

describe("envApps", () => {
	test("groups the tracked env examples by folder, with the package name of the folder", () => {
		expect(apps).toEqual([
			{
				dir: "apps/app",
				name: "@acme/app",
				examples: ["apps/app/.env.local.example"],
			},
			{
				dir: "apps/api",
				name: "@acme/api",
				examples: ["apps/api/.env-template"],
			},
			{ dir: ".", name: undefined, examples: [".env.example"] },
		]);
	});

	test.each([
		["apps/app/.env.local.example", "apps/app/.env.local"],
		["apps/api/.env-template", "apps/api/.env"],
		[".env.sample", ".env"],
		["apps/app/.env.local", undefined],
		["apps/app/.envrc", undefined],
	])("the example %s is for %p", (path, target) => {
		expect(exampleTarget(path)).toBe(target);
	});

	test("a check names the env files that it reads, and an example is not one of them", () => {
		expect(
			namedEnvPaths(
				"test -f apps/app/.env.local && grep -q '^DATABASE_URL=' .env && cat apps/app/.env.local.example",
			),
		).toEqual(["apps/app/.env.local", ".env"]);
	});
});

describe("envFileGaps", () => {
	test("a gate that runs a script or a runtime of an app folder with an ignored env file, and has no check for it, is a gap", () => {
		expect(
			envFileGaps(
				apps,
				gates(
					{ name: "by-package", command: "bun run --filter=@acme/app build" },
					{ name: "by-folder", command: "cd apps/app && bun run build" },
					{ name: "by-cwd", command: "bun run --cwd apps/app start" },
					{
						name: "in-setup",
						command: "bun run e2e",
						setup: ["turbo run build --filter=@acme/app"],
					},
					{
						name: "example-only",
						command: "cd apps/app && next build",
						requires: [
							{
								name: "the example",
								check: "test -f apps/app/.env.local.example",
								on_missing: "stop",
							},
						],
					},
				),
				ignored,
			),
		).toEqual([
			gap("by-package"),
			gap("by-folder"),
			gap("by-cwd"),
			gap("in-setup"),
			gap("example-only"),
		]);
	});

	test("a gate with a check that names an ignored env file of the folder has no gap", () => {
		expect(
			envFileGaps(
				apps,
				gates(
					{
						name: "portal-build",
						command: "bun run --filter=@acme/app build",
						requires: [portalCheck],
					},
					{
						name: "smoke",
						command:
							"(cd apps/api && exec bun src/serve.ts) & bun run --filter=@acme/app start",
						requires: [
							portalCheck,
							{
								name: "apps/api/.env of this worktree",
								check: "test -f apps/api/.env",
								on_missing: "stop",
							},
						],
					},
				),
				ignored,
			),
		).toEqual([]);
	});

	test("the server of a folder needs its own check, not the check of another folder", () => {
		expect(
			envFileGaps(
				apps,
				gates({
					name: "smoke",
					command:
						"(cd apps/api && exec bun src/serve.ts) & bun run --filter=@acme/app start",
					requires: [portalCheck],
				}),
				ignored,
			),
		).toEqual([
			"The gate smoke runs apps/api, and git tracks apps/api/.env-template there. The app reads an env file that git ignores, so a new worktree does not have it, and the gate fails on the base too. Add a prerequisite whose check names that file, such as `test -f apps/api/.env`.",
		]);
	});

	test("a gate that runs no script of the folder, or a folder whose env file git tracks, has no gap", () => {
		expect(
			envFileGaps(
				apps,
				gates(
					{ name: "sql", command: "cd apps/api && psql -f seed.sql" },
					{ name: "other", command: "bun run --filter=@acme/app-docs build" },
					{ name: "root", command: "bun run lint" },
				),
				ignored,
			),
		).toEqual([]);
		expect(
			envFileGaps(
				apps,
				gates({ name: "build", command: "cd apps/app && bun run build" }),
				new Set(),
			),
		).toEqual([]);
	});
});

describe("envFileGaps through the scripts of the repo", () => {
	const scripts = (dir: string, json: object) => {
		const entry = packageScripts(dir, JSON.stringify(json));
		return entry === undefined ? [] : [entry];
	};
	const packages = [
		...scripts(".", {
			name: "acme",
			scripts: {
				"e2e:app": "dotenv -c -- bun run --cwd packages/e2e e2e",
				"dev:api": "bun run --cwd apps/api dev",
				"db:migrate": "dotenv -c -- bun run --cwd apps/api migrate",
			},
		}),
		...scripts("packages/e2e", {
			name: "@acme/e2e",
			scripts: { e2e: "playwright test" },
		}),
		...scripts("apps/api", {
			name: "@acme/api",
			scripts: {
				start: "bun src/serve.ts",
				dev: "bun --watch src/serve.ts",
				migrate: "supabase migration up",
			},
		}),
		...scripts("apps/app", {
			name: "@acme/app",
			scripts: { start: "next start" },
		}),
	];
	const config = [
		"const isCI = Boolean(process.env.CI);",
		"export default defineConfig({",
		"  webServer: [",
		'    { command: isCI ? "PORT=3003 bun run --cwd ../../apps/api start" : "bun run --cwd ../.. dev:api", url: "http://localhost:3003" },',
		'    { command: "NEXT_PUBLIC_API_URL=http://localhost:3003 bun run --cwd ../../apps/app start", url: "http://localhost:3000" },',
		"  ],",
		"});",
	].join("\n");
	const repo = {
		packages,
		read: (path: string) =>
			path === "packages/e2e/playwright.config.ts" ? config : undefined,
	};
	const apiGap = `The gate e2e runs apps/api, and git tracks apps/api/.env-template there. The app reads an env file that git ignores, so a new worktree does not have it, and the gate fails on the base too. Add a prerequisite whose check names that file, such as \`test -f apps/api/.env\`.`;
	const appGap = gap("e2e");
	const e2e = `( set -m; bun run --cwd packages/dynamics sim:serve > "\${TMPDIR:-/tmp}/sim.log" 2>&1 & sim=$!; set +m; trap 'kill -TERM -- "-$sim"' EXIT; bun run e2e:app )`;

	test("a gate whose root script starts a Playwright suite needs a check for each app that the web servers of the suite start", () => {
		expect(
			envFileGaps(apps, gates({ name: "e2e", command: e2e }), ignored, repo),
		).toEqual([appGap, apiGap]);
		expect(
			envFileGaps(
				apps,
				gates({
					name: "e2e",
					command: e2e,
					requires: [
						portalCheck,
						{
							name: "apps/api/.env.local of this worktree",
							check: "test -f apps/api/.env.local",
							on_missing: "stop",
						},
					],
				}),
				ignored,
				repo,
			),
		).toEqual([]);
	});

	test("a root script that runs a tool in an app folder and starts no server needs no check", () => {
		expect(
			envFileGaps(
				apps,
				gates({ name: "migrate", command: "bun run db:migrate" }),
				ignored,
				repo,
			),
		).toEqual([]);
	});
});
