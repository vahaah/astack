import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { reviewStubSource } from "../scripts/lib/render.ts";
import {
	extractProfileBlock,
	FIXER_FLAGS,
	gateFixers,
	gateForbiddenCommands,
	parseProfile,
	profileGates,
	validateProfile,
} from "../src/astack/pr-review-profile.ts";
import { exampleProfilePaths, profilePaths } from "./profile-paths.ts";

const root = join(import.meta.dir, "..");
const skillDir = join(
	root,
	"marketplace/plugins/astack/skills/pr-review-hardening",
);
const readProfile = (path: string): string =>
	readFileSync(join(root, path), "utf8");

const minimal = {
	version: 1,
	gates: [],
	test: { name: "test", command: "bun run test" },
};

function issuesFor(overrides: Record<string, unknown>) {
	return validateProfile({ ...minimal, ...overrides }).map(
		(issue) => `${issue.path}: ${issue.message}`,
	);
}

describe("project profiles", () => {
	test("the profile tests read the acme profiles of the example companion", () => {
		expect(exampleProfilePaths).toEqual([
			"examples/companion/projects/acme/branches/v2/pr-review-hardening.profile.md",
			"examples/companion/projects/acme/pr-review-hardening.profile.md",
		]);
	});

	test.each(profilePaths)(
		"%s has no prerequisite that stops a gate on the local version of bun or the Supabase CLI",
		(path) => {
			const gates = profileGates(parseProfile(readProfile(path)).data);
			expect(
				gates.flatMap((gate) =>
					gate.preparation.filter((command) =>
						/\b(?:bun|supabase) --version\b/.test(command),
					),
				),
			).toEqual([]);
		},
	);

	test.each(profilePaths)("%s parses with no issues", (path) => {
		expect(parseProfile(readProfile(path)).issues).toEqual([]);
	});

	test("one stub serves every repo, and no repo keeps its own copy", () => {
		const stub = readFileSync(reviewStubSource, "utf8");
		expect(stub).toContain("astack:pr-review-hardening");
		expect(stub).toContain(".claude/pr-review-hardening.profile.md");
		for (const path of profilePaths)
			expect(
				readdirSync(dirname(join(root, path))).filter(
					(entry) => entry !== "branches",
				),
			).toEqual(["pr-review-hardening.profile.md"]);
	});

	test("the shared stub names no old install", () => {
		expect(readFileSync(reviewStubSource, "utf8")).not.toMatch(/agent-stack/i);
	});
});

describe("the documented template", () => {
	test("parses with no issues", () => {
		const reference = readFileSync(
			join(skillDir, "references/profile.md"),
			"utf8",
		);
		const template = reference.slice(reference.indexOf("````markdown"));
		const inner = template.slice(
			template.indexOf("\n") + 1,
			template.lastIndexOf("````"),
		);
		expect(parseProfile(inner).issues).toEqual([]);
	});
});

describe("extractProfileBlock", () => {
	test("takes the first yaml block and skips other fences", () => {
		const markdown = [
			"```sh",
			"echo hi",
			"```",
			"",
			"```yaml",
			"version: 1",
			"```",
			"```json",
			"{}",
			"```",
		].join("\n");
		expect(extractProfileBlock(markdown)).toEqual({
			language: "yaml",
			source: "version: 1",
		});
	});

	test("does not read a yaml block nested inside a longer fence", () => {
		const markdown = [
			"````markdown",
			"```yaml",
			"version: 2",
			"```",
			"````",
			"```json",
			'{"version": 1}',
			"```",
		].join("\n");
		expect(extractProfileBlock(markdown)).toEqual({
			language: "json",
			source: '{"version": 1}',
		});
	});

	test("reports a file with no block", () => {
		expect(parseProfile("# Profile\n\nNo settings.").issues).toEqual([
			{ path: "", message: "no fenced yaml or json block" },
		]);
	});

	test("reads a json block", () => {
		const markdown = ["```json", JSON.stringify(minimal), "```"].join("\n");
		expect(parseProfile(markdown).issues).toEqual([]);
	});
});

describe("validateProfile", () => {
	test("accepts the minimal profile", () => {
		expect(validateProfile(minimal)).toEqual([]);
	});

	test("requires version, gates and test", () => {
		expect(validateProfile({}).map((issue) => issue.path)).toEqual([
			"version",
			"gates",
			"test",
		]);
	});

	test("rejects an unknown key", () => {
		expect(issuesFor({ iteration: { min: 2 } })).toEqual([
			"iteration: is not a known key",
		]);
	});

	test("rejects an unknown push policy", () => {
		expect(issuesFor({ push: "always" })).toEqual([
			"push: must be one of when-authorised, each-commit, never",
		]);
	});

	test("the default cap is 2, so a minimum of 3 alone fails", () => {
		expect(issuesFor({ iterations: { min: 3 } })).toEqual([
			"iterations: min must not exceed max",
		]);
		expect(issuesFor({ iterations: { min: 2 } })).toEqual([]);
	});

	test("after_create_pr is harden or none", () => {
		expect(issuesFor({ after_create_pr: "harden" })).toEqual([]);
		expect(issuesFor({ after_create_pr: "always" })).toEqual([
			"after_create_pr: must be one of harden, none",
		]);
	});

	test("every repo runs one hardening run after create pr, with a cap of 2", () => {
		for (const path of profilePaths) {
			const { data } = parseProfile(readProfile(path));
			expect(data).toMatchObject({
				after_create_pr: "harden",
				iterations: { max: 2 },
			});
		}
	});

	test("rejects min above max", () => {
		expect(issuesFor({ iterations: { min: 3, max: 2 } })).toEqual([
			"iterations: min must not exceed max",
		]);
	});

	test("rejects a duplicate or non-kebab gate name", () => {
		expect(issuesFor({ gates: [{ name: "test", command: "x" }] })).toEqual([
			"gates: gate name test is used twice",
		]);
		expect(
			issuesFor({ gates: [{ name: "Type_Check", command: "x" }] }),
		).toEqual(["gates: gate name Type_Check must be kebab-case"]);
	});

	test("requires a gate env variable to say why", () => {
		expect(
			issuesFor({
				test: { name: "test", command: "x", env: [{ name: "DATABASE_URL" }] },
			}),
		).toEqual(["test.env[0].why: is required"]);
	});

	test("rejects an invalid regular expression", () => {
		expect(issuesFor({ forbidden: { commands: ["^bun ("] } })).toEqual([
			"forbidden.commands[0]: must be a valid regular expression",
		]);
	});

	test("rejects the code-simplifier agent", () => {
		expect(
			issuesFor({ reviewers: { agents: ["code-simplifier"] } }),
		).toHaveLength(1);
	});

	test("requires a keep pattern for a boundary cast marker", () => {
		const typescript = {
			rules: true,
			boundary_cast_marker: "// BOUNDARY-CAST:",
		};
		expect(issuesFor({ typescript })).toEqual([
			"typescript.boundary_cast_marker: needs a comments.keep_patterns entry that matches it",
		]);
		expect(
			issuesFor({
				typescript,
				comments: { keep_patterns: ["^\\s*// BOUNDARY-CAST: "] },
			}),
		).toEqual([]);
	});

	test("requires a merge command and a condition that checks CI on the head when the run may merge", () => {
		expect(issuesFor({ merge: { after_clean_stop: "merge" } })).toEqual([
			"merge.command: is required when after_clean_stop is merge",
			"merge.conditions: needs a condition that checks CI on the head when after_clean_stop is merge, because a local version note is advisory only when CI gates the merge",
		]);
		expect(
			issuesFor({
				merge: {
					after_clean_stop: "merge",
					command: "gh pr merge <pr> --squash",
					conditions: ["CI is green on the head SHA."],
				},
			}),
		).toEqual([]);
	});
});

describe("gate prerequisites, setup and paths", () => {
	const testGate = (extra: Record<string, unknown>) => ({
		test: { name: "test", command: "bun run test", ...extra },
	});
	const database = {
		name: "local database",
		check: "pg_isready -h 127.0.0.1",
		on_missing: "stop",
	};

	test("a prerequisite names its check and what the run does when it is missing", () => {
		expect(issuesFor(testGate({ requires: [database] }))).toEqual([]);
		expect(
			issuesFor(testGate({ requires: [{ name: "db", check: "x" }] })),
		).toEqual(["test.requires[0].on_missing: is required"]);
	});

	test("a prerequisite in prose has no check, so it is refused", () => {
		expect(issuesFor(testGate({ requires: ["Postgres runs"] }))).toEqual([
			"test.requires[0]: must be a mapping",
		]);
	});

	test("a missing prerequisite never skips the gate", () => {
		expect(
			issuesFor(testGate({ requires: [{ ...database, on_missing: "skip" }] })),
		).toEqual(["test.requires[0].on_missing: must be one of stop, start"]);
	});

	test("a prerequisite that the run starts names its start command and the gate's side effects", () => {
		expect(
			issuesFor(testGate({ requires: [{ ...database, on_missing: "start" }] })),
		).toEqual([
			"test.requires[0].start: is required when on_missing is start",
			"test.side_effects: is required when the gate runs setup commands or starts a prerequisite",
		]);
		expect(
			issuesFor(
				testGate({
					requires: [
						{ ...database, on_missing: "start", start: "supabase start" },
					],
					side_effects: "Starts the local database.",
				}),
			),
		).toEqual([]);
	});

	test("setup commands run before the gate, so the gate names their side effects", () => {
		expect(issuesFor(testGate({ setup: ["bun run db:test:setup"] }))).toEqual([
			"test.side_effects: is required when the gate runs setup commands or starts a prerequisite",
		]);
		expect(
			issuesFor(
				testGate({
					setup: ["bun run db:test:setup"],
					side_effects: "Rebuilds the local test database.",
				}),
			),
		).toEqual([]);
	});

	test("a path condition needs a glob that selects paths, and a glob with ! removes paths", () => {
		expect(
			issuesFor({
				gates: [
					{
						name: "e2e",
						command: "bun run e2e",
						when_changed: ["**", "!docs/**"],
					},
				],
			}),
		).toEqual([]);
		expect(
			issuesFor({
				gates: [
					{ name: "e2e", command: "bun run e2e", when_changed: ["!docs/**"] },
				],
			}),
		).toEqual([
			"gates[0].when_changed: needs a glob that does not start with !",
		]);
	});

	test("a gate that needs the output of an earlier gate names it in after, and that gate applies to each diff of this one", () => {
		const build = {
			name: "build",
			command: "bun run build",
			when_changed: ["**", "!docs/**"],
		};
		const e2e = { name: "e2e", command: "bun run e2e" };
		expect(
			issuesFor({
				gates: [build, { ...e2e, when_changed: build.when_changed }],
				test: { ...minimal.test, after: ["build"] },
			}),
		).toEqual([
			"test.after[0]: build must apply to every diff that this gate applies to, so its when_changed must be empty or the same",
		]);
		expect(
			issuesFor({
				gates: [
					build,
					{ ...e2e, when_changed: build.when_changed, after: ["build"] },
				],
			}),
		).toEqual([]);
		expect(
			issuesFor({
				gates: [{ ...e2e, after: ["build"] }, build],
				test: { ...minimal.test, after: ["test"] },
			}),
		).toEqual([
			"gates[0].after[0]: build must be a gate that runs before this gate",
			"test.after[0]: test must be a gate that runs before this gate",
		]);
	});

	test("a branch pattern is a regular expression, or null for none", () => {
		expect(
			issuesFor({
				conventions: { branch: { create: "r/<x>", pattern: null } },
			}),
		).toEqual([]);
		expect(
			issuesFor({ conventions: { branch: { create: "r/<x>", pattern: "(" } } }),
		).toEqual([
			"conventions.branch.pattern: must be a valid regular expression",
		]);
	});

	test("profileGates lists each gate with every command that it runs and its when_changed globs, the test gate last", () => {
		expect(
			profileGates({
				...minimal,
				gates: [
					{
						name: "lint",
						command: "bun run lint",
						when_changed: ["src/**", "!**/*.md"],
					},
				],
				test: {
					name: "test",
					command: "bun run test",
					setup: ["bun run db:test:setup"],
					requires: [
						{ ...database, on_missing: "start", start: "supabase start" },
					],
					side_effects: "Starts and rebuilds the local database.",
				},
			}),
		).toEqual([
			{
				name: "lint",
				test: false,
				command: "bun run lint",
				preparation: [],
				checks: [],
				whenChanged: ["src/**", "!**/*.md"],
				sessionEnv: [],
				ciEnv: [],
				tools: [],
				rewrites: [],
			},
			{
				name: "test",
				test: true,
				command: "bun run test",
				preparation: [
					"bun run db:test:setup",
					"pg_isready -h 127.0.0.1",
					"supabase start",
				],
				checks: ["pg_isready -h 127.0.0.1"],
				whenChanged: [],
				sessionEnv: [],
				ciEnv: [],
				tools: [],
				rewrites: [],
			},
		]);
	});
});

describe("the tool versions of a gate", () => {
	const testGate = (tools: unknown) => ({
		test: { name: "test", command: "bun run test", tools },
	});

	test("tools records the bun and Supabase CLI versions that CI pins, and profileGates lists them", () => {
		const tools = { bun: "1.3.14", supabase: "2.117.0" };
		expect(issuesFor(testGate(tools))).toEqual([]);
		expect(profileGates({ ...minimal, ...testGate(tools) })[0]?.tools).toEqual([
			{ tool: "bun", version: "1.3.14" },
			{ tool: "supabase", version: "2.117.0" },
		]);
	});

	test("tools takes only bun and supabase, each at an exact version", () => {
		expect(
			issuesFor(testGate({ node: "22.11.0", bun: "latest", supabase: 2.1 })),
		).toEqual([
			"test.tools.node: is not a known key",
			"test.tools.bun: must be an exact version, such as 1.3.14",
			"test.tools.supabase: must be an exact version, such as 1.3.14",
		]);
		expect(issuesFor(testGate("1.3.14"))).toEqual([
			"test.tools: must be a mapping",
		]);
	});
});

describe("the tracked files that a gate rewrites", () => {
	const testGate = (rewrites: unknown) => ({
		test: { name: "test", command: "bun run build", rewrites },
	});
	const why = "next build writes the import of its route types.";

	test("rewrites names each file with the reason that a tool writes it, and profileGates lists the paths", () => {
		const rewrites = [{ path: "apps/app/next-env.d.ts", why }];
		expect(issuesFor(testGate(rewrites))).toEqual([]);
		expect(
			profileGates({ ...minimal, ...testGate(rewrites) })[0]?.rewrites,
		).toEqual(["apps/app/next-env.d.ts"]);
	});

	test("an entry needs a why, and its path is one file in the repo, not a glob or a path outside it", () => {
		expect(
			issuesFor(
				testGate([
					{ path: "apps/app/next-env.d.ts" },
					{ path: "apps/*/next-env.d.ts", why },
					{ path: "/tmp/next-env.d.ts", why },
					{ path: "../next-env.d.ts", why },
				]),
			),
		).toEqual([
			"test.rewrites[0].why: is required",
			"test.rewrites[1].path: must be a file path in the repo, with no glob",
			"test.rewrites[2].path: must be a file path in the repo, with no glob",
			"test.rewrites[3].path: must be a file path in the repo, with no glob",
		]);
	});
});

describe("gate entries that fix the tree", () => {
	const fixes = (flag: string) =>
		`runs ${flag}, a flag that changes files, so the gate can fix the tree and hide a red`;
	const profileData = (path: string): unknown =>
		parseProfile(readProfile(path)).data;

	test.each(profilePaths)(
		"%s has no gate command, setup command or prerequisite that runs a fixer flag",
		(path) => {
			expect(gateFixers(profileData(path))).toEqual([]);
		},
	);

	test.each(profilePaths)(
		"%s fails the check when its test gate runs bun run lint -- --write, the gate of the original finding",
		(path) => {
			const data = profileData(path);
			const fixing =
				typeof data === "object" && data !== null
					? {
							...data,
							test: { name: "test", command: "bun run lint -- --write" },
						}
					: data;
			expect(gateFixers(fixing)).toEqual([
				{ path: "test.command", message: fixes("--write") },
			]);
		},
	);

	const fixers: [string, string][] = [
		["--write", "bunx biome check --write ."],
		["--fix", "bunx eslint . --fix"],
		["--unsafe", "bunx biome lint --unsafe ."],
		["--suppress", "bunx biome lint --suppress ."],
		["--update-snapshots", "bunx playwright test --update-snapshots"],
		["--apply", "bunx biome check --apply-unsafe ."],
		["-u", "bun run test -- -u"],
		["biome init", "bunx biome init"],
		["biome migrate", "bunx biome migrate"],
		["manypkg fix", "bunx @manypkg/cli fix"],
	];

	test.each(profilePaths)(
		"%s has no gate entry that runs a command that its forbidden.commands forbids",
		(path) => {
			expect(gateForbiddenCommands(profileData(path))).toEqual([]);
		},
	);

	test("a gate that runs the format script, which the profile forbids, is refused, and a hint for the owner is not a run", () => {
		const data = {
			forbidden: {
				commands: ["^bun (run )?format\\b", "\\bsupabase db reset\\b"],
			},
			gates: [
				{ name: "lint", command: "bun run format && bun run lint" },
				{
					name: "stack",
					command:
						'astack check migrations m --db "$URL" --reset "cd db && supabase db reset"',
					setup: ["(cd db && supabase db reset)"],
				},
			],
		};
		expect(gateForbiddenCommands(data)).toEqual([
			{
				path: "gates[0].command",
				message:
					"runs `bun run format`, which forbidden.commands of the profile forbids",
			},
			{
				path: "gates[1].setup[0]",
				message:
					"runs `supabase db reset`, which forbidden.commands of the profile forbids",
			},
		]);
	});

	test("each fixer flag of the check has a command below", () => {
		expect(fixers.map(([flag]) => flag)).toEqual(
			FIXER_FLAGS.map(({ flag }) => flag),
		);
	});

	test.each(fixers)(
		"a gate command that runs %s is refused, so the gate cannot fix the tree",
		(flag, command) => {
			expect(issuesFor({ gates: [{ name: "lint", command }] })).toEqual([
				`gates[0].command: ${fixes(flag)}`,
			]);
		},
	);

	test("a setup command, a prerequisite check and a prerequisite start that fix the tree are refused too", () => {
		expect(
			issuesFor({
				test: {
					name: "test",
					command: "bun run test",
					setup: ["bun run format -- --write"],
					requires: [
						{
							name: "lint",
							check: "bunx eslint . --fix",
							on_missing: "start",
							start: "bun run test -- -u",
						},
					],
					side_effects: "none",
				},
			}),
		).toEqual([
			`test.setup[0]: ${fixes("--write")}`,
			`test.requires[0].check: ${fixes("--fix")}`,
			`test.requires[0].start: ${fixes("-u")}`,
		]);
	});

	test("a flag in forbidden.gate_flags is refused like a fixer flag", () => {
		expect(
			issuesFor({
				forbidden: { gate_flags: ["--update"] },
				gates: [{ name: "unit", command: "bunx vitest run --update" }],
			}),
		).toEqual([`gates[0].command: ${fixes("--update")}`]);
	});

	test("a read-only command with a similar flag or a -u of another tool is accepted", () => {
		const commands = [
			"./node_modules/.bin/biome ci --reporter=default .",
			"bunx eslint . --fix-dry-run",
			"bun run test --fixture=smoke",
			"curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4310",
			"set -u; bun run test",
			"bun run test | sort -u",
			"bun tooling/licenses.ts --check",
		];
		expect(
			issuesFor({
				gates: commands.map((command, index) => ({
					name: `gate-${index}`,
					command,
				})),
			}),
		).toEqual([]);
	});
});

describe("the CI environment of a gate", () => {
	const testGate = (extra: Record<string, unknown>) => ({
		test: { name: "test", command: "bun run test", ...extra },
	});

	test("an entry copies a CI value, sets another value with a why, or leaves the variable out with a why", () => {
		const ciEnv = [
			{ name: "NODE_OPTIONS", value: "--max-old-space-size=8192" },
			{ name: "NEXT_PUBLIC_SENTRY_DSN", value: "" },
			{
				name: "APP_BASE_URL",
				value: "http://localhost:3100",
				why: "The local portal listens on port 3100.",
			},
			{ name: "TURBO_TOKEN", why: "A local run has no remote cache." },
		];
		expect(issuesFor(testGate({ ci_env: ciEnv }))).toEqual([]);
		expect(
			profileGates({ ...minimal, ...testGate({ ci_env: ciEnv }) }),
		).toEqual([
			{
				name: "test",
				test: true,
				command: "bun run test",
				preparation: [],
				checks: [],
				whenChanged: [],
				sessionEnv: [],
				ciEnv: [
					{
						kind: "copy",
						name: "NODE_OPTIONS",
						value: "--max-old-space-size=8192",
					},
					{ kind: "copy", name: "NEXT_PUBLIC_SENTRY_DSN", value: "" },
					{
						kind: "set",
						name: "APP_BASE_URL",
						value: "http://localhost:3100",
						why: "The local portal listens on port 3100.",
					},
					{
						kind: "leave",
						name: "TURBO_TOKEN",
						why: "A local run has no remote cache.",
					},
				],
				tools: [],
				rewrites: [],
			},
		]);
	});

	test("an entry with no value and no why says nothing, so it is refused", () => {
		expect(issuesFor(testGate({ ci_env: [{ name: "CI" }] }))).toEqual([
			"test.ci_env[0]: needs a value or a why",
		]);
	});

	test("a value is a string, because CI gives every variable as a string", () => {
		expect(
			issuesFor(testGate({ ci_env: [{ name: "WORKERS", value: 1 }] })),
		).toEqual(["test.ci_env[0].value: must be a string"]);
	});

	test("the run never fakes a variable of the GitHub runner", () => {
		for (const name of ["GITHUB_ACTIONS", "GITHUB_STEP_SUMMARY", "RUNNER_OS"])
			expect(
				issuesFor(testGate({ ci_env: [{ name, value: "true" }] })),
			).toEqual([
				"test.ci_env[0].name: the run never sets GITHUB_ACTIONS or another GITHUB_ or RUNNER_ variable",
			]);
		expect(
			issuesFor(
				testGate({
					ci_env: [
						{
							name: "GITHUB_TOKEN",
							why: "CI reads the API with the token of the run.",
						},
					],
				}),
			),
		).toEqual([]);
	});

	test("a variable name is a shell name, and one gate names it once", () => {
		expect(
			issuesFor(testGate({ ci_env: [{ name: "NODE-OPTIONS", value: "x" }] })),
		).toEqual(["test.ci_env[0].name: must be an environment variable name"]);
		expect(
			issuesFor(
				testGate({
					ci_env: [
						{ name: "CI", value: "1" },
						{ name: "CI", value: "true" },
					],
				}),
			),
		).toEqual(["test.ci_env[1].name: CI is in ci_env twice"]);
	});

	test("a variable that the session sets is not in ci_env too", () => {
		expect(
			issuesFor(
				testGate({
					env: [{ name: "DATABASE_URL", why: "The suite reads it." }],
					ci_env: [{ name: "DATABASE_URL", value: "postgres://ci" }],
				}),
			),
		).toEqual([
			"test.ci_env[0].name: DATABASE_URL is in env and in ci_env. Keep it in one list",
		]);
	});

	test("profileGates lists the variables that the session sets", () => {
		expect(
			profileGates({
				...minimal,
				...testGate({
					env: [{ name: "DATABASE_URL", why: "The suite reads it." }],
				}),
			})[0]?.sessionEnv,
		).toEqual(["DATABASE_URL"]);
	});
});
