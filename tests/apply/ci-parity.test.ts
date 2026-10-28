import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type CiJob,
	type CiParityConfig,
	type CiPaths,
	type CiWorkflow,
	checkCiParity,
	formatParity,
	gateCovers,
	normalizeCommand,
	parityFailures,
	readWorkflows,
} from "../../scripts/lib/ci-parity.ts";
import {
	parseProfile,
	profileGates,
} from "../../src/astack/pr-review-profile.ts";
import { fixtureConfig, fixtureProfile, repo } from "./ci-parity-fixtures.ts";

const none: CiParityConfig = { setup: [], map: [], exclude: [] };

const plainJob = {
	env: {},
	services: [],
	pins: [],
	needs: [],
	continueOnError: false,
	runsOnPullRequest: true,
	aggregates: false,
	paths: { kind: "any" },
} satisfies Omit<CiJob, "id" | "steps">;

const bunPin = {
	kind: "exact",
	tool: "bun",
	version: "1.3.0",
	file: ".bun-version",
	source: ".bun-version, the bun-version-file of oven-sh/setup-bun",
} as const;

function fixtureWorkflows() {
	const files = readdirSync(join(repo, ".github/workflows"))
		.sort()
		.map((name) => ({
			path: `.github/workflows/${name}`,
			text: readFileSync(join(repo, ".github/workflows", name), "utf8"),
		}));
	return readWorkflows(files, (path) => {
		try {
			return readFileSync(join(repo, path), "utf8");
		} catch {
			return undefined;
		}
	});
}

function parity(gates: "before" | "after", config: CiParityConfig) {
	const read = fixtureWorkflows();
	return checkCiParity({
		workflows: read.workflows,
		readProblems: read.problems,
		gates: profileGates(parseProfile(fixtureProfile(gates)).data),
		config,
	});
}

describe("normalizeCommand", () => {
	test.each([
		["bun lint", undefined, "bun run lint"],
		[
			"bun typecheck --concurrency=3",
			undefined,
			"bun run typecheck --concurrency=3",
		],
		["bun test", undefined, "bun test"],
		["bun tooling/gates.ts", undefined, "bun tooling/gates.ts"],
		["bun x sherif", undefined, "bunx sherif"],
		["  bun   run   test  ", undefined, "bun run test"],
		[
			"supabase test db",
			"./packages/supabase/",
			"cd packages/supabase && supabase test db",
		],
		["bun run build", ".", "bun run build"],
		["cd apps/app && bun lint", undefined, "cd apps/app && bun run lint"],
		["bun build ./src/index.ts", undefined, "bun build ./src/index.ts"],
	])("%p in %p reads as %p", (run, workingDirectory, expected) => {
		expect(normalizeCommand(run, workingDirectory)).toBe(expected);
	});

	test("drops comment and blank lines, and joins continued lines", () => {
		expect(
			normalizeCommand(
				[
					"# Start the stack.",
					"set -euo pipefail",
					"",
					'psql "$DB" -v ON_ERROR_STOP=1 \\',
					"  -f a.sql \\",
					"  -f b.sql",
				].join("\n"),
			),
		).toBe(
			'set -euo pipefail\npsql "$DB" -v ON_ERROR_STOP=1 -f a.sql -f b.sql',
		);
	});
});

describe("readWorkflows", () => {
	const read = fixtureWorkflows();
	const check = read.workflows.find(
		(workflow) => workflow.file === "check.yml",
	);

	test("reads the triggers of each workflow file", () => {
		expect(read.problems).toEqual([]);
		expect(
			read.workflows.map((workflow) => [workflow.file, workflow.triggers]),
		).toEqual([
			["check.yml", ["pull_request", "schedule"]],
			["deploy.yaml", ["push", "workflow_dispatch"]],
		]);
	});

	test("expands a local composite action, drops setup actions and steps that run only on failure", () => {
		expect(check?.jobs.find((job) => job.id === "check.yml#validate")).toEqual({
			...plainJob,
			id: "check.yml#validate",
			pins: [bunPin],
			steps: [
				{
					label: "Install dependencies",
					command: "bun install --frozen-lockfile",
				},
				{ label: "Lint", command: "bun run lint" },
				{ label: "Typecheck", command: "bun run typecheck" },
				{
					label: "Build the test database",
					command: "bun run db:test:setup",
				},
				{ label: "Test", command: "bun run test" },
				{
					label: "Bundle the worker",
					command: "cd apps/tasks && bunx worker-cli@1.2.3 deploy --dry-run",
				},
			],
		});
	});

	test("keeps an action that is not a known setup action as a step to map", () => {
		expect(check?.jobs.find((job) => job.id === "check.yml#manifests")).toEqual(
			{
				...plainJob,
				id: "check.yml#manifests",
				steps: [
					{
						label: "acme-tools/manifest-lint@v1",
						command: "uses acme-tools/manifest-lint@v1",
					},
				],
			},
		);
	});

	test("reports a file that does not parse, and a missing local action", () => {
		const broken = readWorkflows(
			[
				{ path: ".github/workflows/bad.yml", text: "on: [push\njobs: {" },
				{
					path: ".github/workflows/local.yml",
					text: "on: pull_request\njobs:\n  a:\n    steps:\n      - uses: ./.github/actions/gone\n",
				},
			],
			() => undefined,
		);
		expect(broken.problems).toHaveLength(1);
		expect(broken.problems[0]).toStartWith(
			".github/workflows/bad.yml does not parse:",
		);
		expect(broken.workflows).toEqual([
			{
				file: "local.yml",
				triggers: ["pull_request"],
				jobs: [
					{
						...plainJob,
						id: "local.yml#a",
						steps: [
							{
								label: "./.github/actions/gone",
								command: "uses ./.github/actions/gone",
							},
						],
					},
				],
			},
		]);
	});
});

test("names a local action whose file does not parse, so the step stays to map", () => {
	const read = readWorkflows(
		[
			{
				path: ".github/workflows/ci.yml",
				text: "on: pull_request\njobs:\n  a:\n    steps:\n      - uses: ./.github/actions/bad\n",
			},
		],
		(path) =>
			path === ".github/actions/bad/action.yml" ? "runs: [\n" : undefined,
	);
	const step = read.workflows[0]?.jobs[0]?.steps[0];
	expect(step?.command).toBe("uses ./.github/actions/bad");
	expect(step?.label).toStartWith(
		"./.github/actions/bad (its action file does not parse: ",
	);
});

describe("checkCiParity", () => {
	test("a lint gate that skips the repo's lint script and a browser job with no gate both fail", () => {
		const report = parity("before", none);
		expect(report.jobs).toEqual([
			{
				kind: "unmapped",
				job: "check.yml#validate",
				uncovered: [
					"bun install --frozen-lockfile",
					"bun run lint",
					"bun run db:test:setup",
					"cd apps/tasks && bunx worker-cli@1.2.3 deploy --dry-run",
				],
			},
			{
				kind: "unmapped",
				job: "check.yml#browser-smoke",
				uncovered: [
					"bun install --frozen-lockfile",
					"Start the stack (a script of 2 lines)",
					"bun run --filter=@acme/e2e e2e",
				],
			},
			{
				kind: "unmapped",
				job: "check.yml#judge",
				uncovered: [
					"bun install --frozen-lockfile",
					"bun run --filter @acme/eval judge",
				],
			},
			{
				kind: "unmapped",
				job: "check.yml#nightly",
				uncovered: ["bun run --filter @acme/contract check"],
			},
			{
				kind: "unmapped",
				job: "check.yml#manifests",
				uncovered: ["uses acme-tools/manifest-lint@v1"],
			},
		]);
		expect(parityFailures(report)).toEqual([
			"check.yml#validate has no gate for: bun install --frozen-lockfile; bun run lint; bun run db:test:setup; cd apps/tasks && bunx worker-cli@1.2.3 deploy --dry-run",
			"check.yml#browser-smoke has no gate for: bun install --frozen-lockfile; Start the stack (a script of 2 lines); bun run --filter=@acme/e2e e2e",
			"check.yml#judge has no gate for: bun install --frozen-lockfile; bun run --filter @acme/eval judge",
			"check.yml#nightly has no gate for: bun run --filter @acme/contract check",
			"check.yml#manifests has no gate for: uses acme-tools/manifest-lint@v1",
		]);
	});

	test("a workflow that never runs on a pull request is listed, not checked", () => {
		expect(parity("before", none).other).toEqual([
			{ file: "deploy.yaml", triggers: ["push", "workflow_dispatch"] },
		]);
	});

	test("gates, setup commands, explicit mappings and exclusions with a reason cover every job", () => {
		const report = parity("after", fixtureConfig);
		expect(report.jobs).toEqual([
			{
				kind: "mapped",
				job: "check.yml#validate",
				via: "command",
				gates: ["lint", "typecheck", "test", "worker-bundle"],
			},
			{
				kind: "mapped",
				job: "check.yml#browser-smoke",
				via: "config",
				gates: ["layout-smoke"],
				reason: "The gate's prerequisites start the same stack.",
			},
			{
				kind: "excluded",
				job: "check.yml#judge",
				proof: "continue-on-error is true",
				reason: "Advisory: continue-on-error.",
			},
			{
				kind: "excluded",
				job: "check.yml#nightly",
				proof: "its if condition is false on a pull request that has no label",
				reason: "Runs only on the schedule.",
			},
			{
				kind: "mapped",
				job: "check.yml#manifests",
				via: "config",
				gates: ["manifest-lint"],
				reason: "The gate runs the tool that the action wraps.",
			},
		]);
		expect(parityFailures(report)).toEqual([]);
	});

	test("a setup step of a gate counts, but a job of setup steps alone maps to no gate", () => {
		const workflows: CiWorkflow[] = [
			{
				file: "ci.yml",
				triggers: ["pull_request"],
				jobs: [
					{
						...plainJob,
						id: "ci.yml#prepare",
						steps: [{ label: "db", command: "bun run db:test:setup" }],
					},
				],
			},
		];
		const report = checkCiParity({
			workflows,
			readProblems: [],
			gates: profileGates(parseProfile(fixtureProfile("after")).data),
			config: none,
		});
		expect(report.jobs).toEqual([
			{ kind: "unmapped", job: "ci.yml#prepare", uncovered: [] },
		]);
		expect(parityFailures(report)).toEqual([
			"ci.yml#prepare runs no gate of the profile",
		]);
	});

	test("a gate that starts the stack of a CI step through astack stack start prepares that step, also when it sends the output to /dev/null", () => {
		const workflows: CiWorkflow[] = [
			{
				file: "ci.yml",
				triggers: ["pull_request"],
				jobs: [
					{
						...plainJob,
						id: "ci.yml#smoke",
						steps: [
							{
								label: "start",
								command: "cd packages/supabase && supabase start",
							},
							{ label: "suite", command: "bun run e2e" },
						],
					},
				],
			},
		];
		const jobsWith = (start: string) =>
			checkCiParity({
				workflows,
				readProblems: [],
				gates: [
					{
						name: "smoke",
						test: false,
						command: "bun run e2e",
						preparation: [start],
						checks: [],
						whenChanged: [],
						sessionEnv: [],
						ciEnv: [],
						tools: [],
						rewrites: [],
					},
				],
				config: none,
			}).jobs;
		expect(
			jobsWith(
				'astack stack start packages/supabase/supabase --watch packages/supabase/supabase/config.toml --run "cd packages/supabase && supabase start >/dev/null"',
			),
		).toEqual([
			{ kind: "mapped", job: "ci.yml#smoke", via: "command", gates: ["smoke"] },
		]);
		expect(
			jobsWith(
				'astack stack start packages/supabase/supabase --watch packages/supabase/supabase/config.toml --run "cd packages/supabase && supabase start -x studio >/dev/null"',
			),
		).toEqual([
			{
				kind: "unmapped",
				job: "ci.yml#smoke",
				uncovered: ["cd packages/supabase && supabase start"],
			},
		]);
	});

	test("a step mapping covers one CI script with a gate, and the rest of its job maps by command", () => {
		const report = parity("after", {
			...fixtureConfig,
			map: [
				{
					job: "check.yml#browser-smoke",
					step: "Start the stack",
					gates: ["layout-smoke"],
					reason: "The gate's prerequisites hold the same stack.",
					differs:
						"A prerequisite checks the stack, and the suite starts the app.",
				},
				...fixtureConfig.map.filter(
					(entry) => entry.job !== "check.yml#browser-smoke",
				),
			],
		});
		expect(report.jobs[1]).toEqual({
			kind: "mapped",
			job: "check.yml#browser-smoke",
			via: "command",
			gates: ["layout-smoke"],
		});
		expect(parityFailures(report)).toEqual([]);
	});

	test("a step mapping in a job that the config maps or excludes is stale", () => {
		const report = parity("after", {
			...fixtureConfig,
			map: [
				...fixtureConfig.map,
				{
					job: "check.yml#judge",
					step: "bun run --filter @acme/eval judge",
					gates: ["test"],
					reason: "Old mapping.",
				},
			],
		});
		expect(parityFailures(report)).toEqual([
			"projects config: the mapping of step bun run --filter @acme/eval judge in check.yml#judge matches no step that the check reads",
		]);
	});

	test("a step exclusion covers one step of a job that maps by command", () => {
		const report = parity("after", {
			...fixtureConfig,
			setup: [],
			exclude: [
				...fixtureConfig.exclude,
				{
					job: "check.yml#validate",
					step: "Install dependencies",
					reason: "Installs the workspace.",
				},
				{
					job: "check.yml#browser-smoke",
					step: "bun install --frozen-lockfile",
					reason: "Installs the workspace.",
				},
			],
		});
		expect(report.jobs[0]).toEqual({
			kind: "mapped",
			job: "check.yml#validate",
			via: "command",
			gates: ["lint", "typecheck", "test", "worker-bundle"],
		});
		expect(parityFailures(report)).toEqual([
			"projects config: the exclusion of step bun install --frozen-lockfile in check.yml#browser-smoke matches no step that the check reads",
		]);
	});

	test("a stale or wrong entry in the config fails, so the config cannot drift from CI", () => {
		const report = parity("after", {
			setup: [
				...fixtureConfig.setup,
				{ command: "bun run seed", reason: "Seeds the database." },
			],
			map: [
				...fixtureConfig.map,
				{ job: "check.yml#gone", gates: ["lint"], reason: "Old job." },
				{
					job: "deploy.yaml#deploy",
					gates: ["no-such-gate"],
					reason: "Not a pull request job.",
				},
			],
			exclude: [
				...fixtureConfig.exclude,
				{ job: "check.yml#judge", reason: "Listed twice." },
				{ job: "check.yml#browser-smoke", reason: "Mapped and excluded." },
			],
		});
		expect(parityFailures(report)).toEqual([
			"check.yml#browser-smoke is excluded, but its workflow does not prove that it never blocks a pull request. A proof is continue-on-error, an if condition that is false on a pull request, no command, or an aggregate of mapped jobs.",
			"projects config: the setup command bun run seed matches no CI step",
			"projects config: check.yml#gone is not a job of a pull request workflow",
			"projects config: deploy.yaml#deploy is not a job of a pull request workflow",
			"projects config: deploy.yaml#deploy names no-such-gate, which the profile does not define",
			"projects config: check.yml#judge has more than one entry",
			"projects config: check.yml#browser-smoke has more than one entry",
		]);
	});

	test("the report names each job and its verdict", () => {
		expect(formatParity(parity("before", none)).slice(0, 4)).toEqual([
			"Pull request workflows: check.yml",
			"Not run on a pull request: deploy.yaml (push, workflow_dispatch)",
			"",
			"- UNMAPPED check.yml#validate. No gate runs: `bun install --frozen-lockfile`, `bun run lint`, `bun run db:test:setup`, `cd apps/tasks && bunx worker-cli@1.2.3 deploy --dry-run`",
		]);
		expect(formatParity(parity("after", fixtureConfig)).slice(3)).toEqual([
			"- check.yml#validate: mapped by command to lint, typecheck, test, worker-bundle",
			"- check.yml#browser-smoke: mapped by the project config to layout-smoke. The gate's prerequisites start the same stack.",
			"- check.yml#judge: excluded, because continue-on-error is true. Advisory: continue-on-error.",
			"- check.yml#nightly: excluded, because its if condition is false on a pull request that has no label. Runs only on the schedule.",
			"- check.yml#manifests: mapped by the project config to manifest-lint. The gate runs the tool that the action wraps.",
			'- DIFFERS check.yml#browser-smoke step "Start the stack", mapped to layout-smoke. No mapped gate runs `supabase start`, `bun run dev &`. A prerequisite checks the stack, and the suite starts the app.',
			'- DIFFERS check.yml#manifests step "acme-tools/manifest-lint@v1", mapped to manifest-lint. No mapped gate runs `uses acme-tools/manifest-lint@v1`. The gate runs the release of the tool that the action wraps.',
			"- check.yml#validate runs the test gate test before worker-bundle, and the run always runs the test gate last.",
			"- lint runs with the CI value of CI.",
			"- typecheck runs with the CI value of CI.",
			"- worker-bundle runs with the CI value of CI.",
			"- manifest-lint runs with the CI value of CI.",
			"- layout-smoke runs with the CI value of CI.",
			"- test runs with the CI value of CI.",
			"- lint runs the CI version of bun 1.3.0.",
			"- typecheck runs the CI version of bun 1.3.0.",
			"- test runs the CI version of bun 1.3.0.",
			"- worker-bundle runs the CI version of bun 1.3.0.",
			"- layout-smoke runs the CI version of bun 1.3.0.",
		]);
	});
});

function inlineParity(
	workflow: string,
	gates: readonly { name: string; command: string; when_changed?: string[] }[],
	config: CiParityConfig,
) {
	const read = readWorkflows(
		[{ path: ".github/workflows/ci.yml", text: workflow }],
		() => undefined,
	);
	return checkCiParity({
		workflows: read.workflows,
		readProblems: read.problems,
		gates: profileGates({
			version: 1,
			gates,
			test: { name: "test", command: "bun run test" },
		}),
		config,
	});
}

const blocking = [
	"on:",
	"  pull_request:",
	"    types: [opened, synchronize, reopened, labeled]",
	"jobs:",
	"  smoke:",
	"    steps:",
	"      - run: bun run e2e",
	"  visual:",
	"    if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'",
	"    steps:",
	"      - run: bun run visual",
	"  judge:",
	"    continue-on-error: true",
	"    steps:",
	"      - run: bun run judge",
	"  nightly:",
	"    if: github.event_name == 'schedule'",
	"    steps:",
	"      - run: bun run contract",
	"  preview:",
	"    if: contains(github.event.pull_request.labels.*.name, 'preview')",
	"    steps:",
	"      - run: bun run deploy",
	"  changes:",
	"    outputs:",
	`      code: \${{ steps.filter.outputs.code }}`,
	"    steps:",
	"      - uses: actions/checkout@v4",
	"      - uses: dorny/paths-filter@v3",
	"        id: filter",
	"        with:",
	"          filters: |",
	"            code:",
	"              - 'apps/**'",
	"  all-green:",
	"    needs: [smoke]",
	"    steps:",
	"      - env:",
	`          NEEDS: \${{ toJSON(needs) }}`,
	`        run: echo "$NEEDS" | jq -e 'all(.[]; .result == "success")'`,
	"  deploy:",
	"    needs: [smoke]",
	"    steps:",
	`      - run: bun run deploy --tag \${{ needs.smoke.outputs.tag }}`,
	"  visual-green:",
	"    needs: [visual]",
	"    steps:",
	`      - run: test "\${{ needs.visual.result }}" = success`,
	"",
].join("\n");

describe("an exclusion holds only when the workflow proves it", () => {
	const exclude = (job: string) => ({ job: `ci.yml#${job}`, reason: "r" });
	const report = inlineParity(
		blocking,
		[{ name: "e2e", command: "bun run e2e" }],
		{
			setup: [],
			map: [],
			exclude: [
				"visual",
				"judge",
				"nightly",
				"preview",
				"changes",
				"all-green",
				"deploy",
				"visual-green",
			].map(exclude),
		},
	);

	test("each job gets the proof that the workflow gives, and a blocking job gets none", () => {
		expect(report.jobs).toEqual([
			{ kind: "mapped", job: "ci.yml#smoke", via: "command", gates: ["e2e"] },
			{ kind: "unproven", job: "ci.yml#visual", reason: "r" },
			{
				kind: "excluded",
				job: "ci.yml#judge",
				proof: "continue-on-error is true",
				reason: "r",
			},
			{
				kind: "excluded",
				job: "ci.yml#nightly",
				proof: "its if condition is false on a pull request that has no label",
				reason: "r",
			},
			{
				kind: "excluded",
				job: "ci.yml#preview",
				proof: "its if condition is false on a pull request that has no label",
				reason: "r",
			},
			{
				kind: "excluded",
				job: "ci.yml#changes",
				proof: "it runs no command",
				reason: "r",
			},
			{
				kind: "excluded",
				job: "ci.yml#all-green",
				proof: "it only reads the results of ci.yml#smoke, which map to gates",
				reason: "r",
			},
			{ kind: "unproven", job: "ci.yml#deploy", reason: "r" },
			{ kind: "unproven", job: "ci.yml#visual-green", reason: "r" },
		]);
	});

	test("an exclusion of a blocking job, of a job that reads only outputs, or of an aggregate of a blocking job fails apply", () => {
		const why =
			"is excluded, but its workflow does not prove that it never blocks a pull request. A proof is continue-on-error, an if condition that is false on a pull request, no command, or an aggregate of mapped jobs.";
		expect(parityFailures(report)).toEqual([
			`ci.yml#visual ${why}`,
			`ci.yml#deploy ${why}`,
			`ci.yml#visual-green ${why}`,
		]);
		expect(formatParity(report)[4]).toBe(
			"- UNPROVEN ci.yml#visual. The workflow does not prove the exclusion. r",
		);
	});
});

test("a step whose if condition is false on a pull request is not a step to map", () => {
	const report = inlineParity(
		[
			"on: pull_request",
			"jobs:",
			"  visual:",
			"    steps:",
			"      - run: bun run visual",
			"      - name: Churn on a refresh run",
			`        if: \${{ !cancelled() && inputs.refresh }}`,
			"        run: git diff --stat",
			"      - name: Tail the log of a red run",
			`        if: \${{ failure() }}`,
			"        run: tail log",
			"      - name: Guard",
			`        if: \${{ !cancelled() && !inputs.refresh }}`,
			"        run: bun run guard",
			"",
		].join("\n"),
		[{ name: "visual", command: "bun run visual" }],
		none,
	);
	expect(report.jobs).toEqual([
		{ kind: "unmapped", job: "ci.yml#visual", uncovered: ["bun run guard"] },
	]);
});

describe("gateCovers", () => {
	const any: CiPaths = { kind: "any" };
	const only: CiPaths = {
		kind: "only",
		globs: ["apps/**", "bun.lock"],
		source: "s",
	};
	const except: CiPaths = { kind: "except", globs: ["docs/**"], source: "s" };
	test.each<[string, string[], CiPaths, boolean]>([
		["an empty list runs on every path", [], any, true],
		["** runs on every path", ["**"], any, true],
		["a folder skips the rest of the repo", ["apps/**"], any, false],
		["a skip glob skips a docs-only diff", ["**", "!docs/**"], any, false],
		["the same globs as the filter", ["apps/**", "bun.lock"], only, true],
		["a parent folder and **", ["**"], only, true],
		["a subfolder of a filter glob", ["apps/app/**", "bun.lock"], only, false],
		["a missing file of the filter", ["apps/**"], only, false],
		[
			"a skip glob that can match inside a filter folder",
			["apps/**", "bun.lock", "!**/*.md"],
			only,
			false,
		],
		[
			"a skip glob outside every filter glob",
			["apps/**", "bun.lock", "!docs/**"],
			only,
			true,
		],
		["the same skip as paths-ignore", ["**", "!docs/**"], except, true],
		["a skip that paths-ignore does not have", ["**", "!*.md"], except, false],
		["a folder against paths-ignore", ["apps/**"], except, false],
	])("%s: %p against the job gives %p", (_name, globs, job, expected) => {
		expect(gateCovers(globs, job)).toBe(expected);
	});
});

describe("a gate runs on every path that its CI job runs on", () => {
	const smoke = [
		"jobs:",
		"  smoke:",
		"    steps:",
		"      - run: bun run e2e",
		"",
	];
	const job = (on: string[]) => [...on, ...smoke].join("\n");

	test("a narrower gate of an unfiltered job fails, a narrow entry allows it, and a stale entry fails", () => {
		const workflow = job(["on: pull_request"]);
		const narrowGate = [
			{ name: "e2e", command: "bun run e2e", when_changed: ["apps/app/**"] },
		];
		expect(parityFailures(inlineParity(workflow, narrowGate, none))).toEqual([
			"e2e runs on fewer paths than ci.yml#smoke. The job runs on every pull request, and the gate runs only on apps/app/**.",
		]);
		const narrow = [
			{ job: "ci.yml#smoke", gates: ["e2e"], reason: "The owner allows it." },
		];
		const allowed = inlineParity(workflow, narrowGate, { ...none, narrow });
		expect(parityFailures(allowed)).toEqual([]);
		expect(formatParity(allowed).slice(3)).toEqual([
			"- ci.yml#smoke: mapped by command to e2e",
			"- ci.yml#smoke: e2e runs on fewer paths than the job. The owner allows it.",
			"- e2e runs with the CI value of CI.",
		]);
		expect(
			parityFailures(
				inlineParity(workflow, [{ name: "e2e", command: "bun run e2e" }], {
					...none,
					narrow,
				}),
			),
		).toEqual([
			"projects config: the narrow entry of e2e in ci.yml#smoke matches no gate of the job that runs on fewer paths than the job",
		]);
	});

	test.each<[string, string[], string]>([
		[
			"the paths filter of the workflow",
			["on:", "  pull_request:", "    paths: ['apps/**', 'bun.lock']"],
			"a change to apps/**, bun.lock (on.pull_request paths)",
		],
		[
			"the paths-ignore filter of the workflow",
			["on:", "  pull_request:", "    paths-ignore: ['apps/**', 'bun.lock']"],
			"a change outside apps/**, bun.lock (on.pull_request paths-ignore)",
		],
	])("the job reads %s", (_name, on, paths) => {
		const failures = parityFailures(
			inlineParity(
				job(on),
				[
					{
						name: "e2e",
						command: "bun run e2e",
						when_changed: ["apps/app/**"],
					},
				],
				none,
			),
		);
		expect(failures).toEqual([
			`e2e runs on fewer paths than ci.yml#smoke. The job runs on ${paths}, and the gate runs only on apps/app/**.`,
		]);
	});

	const filtered = (condition: string, filter: string[]) =>
		[
			"on: pull_request",
			"jobs:",
			"  changes:",
			"    outputs:",
			`      should_run: \${{ steps.filter.outputs.code }}`,
			"    steps:",
			"      - uses: dorny/paths-filter@v3",
			"        id: filter",
			"        with:",
			"          filters: |",
			"            code:",
			...filter.map((glob) => `              - '${glob}'`),
			"  e2e:",
			"    needs: [changes]",
			`    if: ${condition}`,
			"    steps:",
			"      - run: bun run e2e",
			"",
		].join("\n");
	const changesExcluded: CiParityConfig = {
		...none,
		exclude: [{ job: "ci.yml#changes", reason: "The path filter." }],
	};

	test("a job whose if needs a path filter output runs only on the globs of that filter", () => {
		const workflow = filtered("needs.changes.outputs.should_run == 'true'", [
			"apps/**",
			"bun.lock",
		]);
		const read = readWorkflows(
			[{ path: ".github/workflows/ci.yml", text: workflow }],
			() => undefined,
		);
		expect(read.workflows[0]?.jobs.map((entry) => entry.paths)).toEqual([
			{ kind: "any" },
			{
				kind: "only",
				globs: ["apps/**", "bun.lock"],
				source: "needs.changes.outputs.should_run",
			},
		]);
		expect(
			parityFailures(
				inlineParity(
					workflow,
					[
						{
							name: "e2e",
							command: "bun run e2e",
							when_changed: ["apps/**", "bun.lock"],
						},
					],
					changesExcluded,
				),
			),
		).toEqual([]);
		expect(
			parityFailures(
				inlineParity(
					workflow,
					[{ name: "e2e", command: "bun run e2e", when_changed: ["apps/**"] }],
					changesExcluded,
				),
			),
		).toEqual([
			"e2e runs on fewer paths than ci.yml#e2e. The job runs on a change to apps/**, bun.lock (needs.changes.outputs.should_run), and the gate runs only on apps/**.",
		]);
	});

	test.each([
		[
			"an if that can run without the filter",
			"always() || needs.changes.outputs.should_run == 'true'",
			["apps/**"],
		],
		[
			"a filter with a negated glob",
			"needs.changes.outputs.should_run == 'true'",
			["apps/**", "!apps/docs/**"],
		],
	])(
		"%s gives a job that runs on every pull request",
		(_name, condition, filter) => {
			const read = readWorkflows(
				[
					{
						path: ".github/workflows/ci.yml",
						text: filtered(condition, filter),
					},
				],
				() => undefined,
			);
			expect(read.workflows[0]?.jobs[1]?.paths).toEqual({ kind: "any" });
		},
	);
});

type GateInput = {
	name: string;
	command: string;
	env?: { name: string; why: string }[];
	ci_env?: { name: string; value?: string; why?: string }[];
	requires?: { name: string; check: string; on_missing: "stop" }[];
};

function envParity(workflow: string, gates: GateInput[], config = none) {
	const read = readWorkflows(
		[{ path: ".github/workflows/ci.yml", text: workflow }],
		() => undefined,
	);
	expect(read.problems).toEqual([]);
	return checkCiParity({
		workflows: read.workflows,
		readProblems: [],
		gates: profileGates({
			version: 1,
			gates,
			test: { name: "unit", command: "bun run unit" },
		}),
		config,
	});
}

const withEnv = [
	"on: pull_request",
	"env:",
	`  TURBO_TEAM: \${{ secrets.TURBO_TEAM }}`,
	"  TELEMETRY: 1",
	"jobs:",
	"  validate:",
	"    env:",
	"      TELEMETRY: '0'",
	"      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/test",
	"    steps:",
	"      - name: Lint",
	"        run: bun run lint",
	"      - name: Typecheck",
	"        run: bun run typecheck",
	"        env:",
	"          NODE_OPTIONS: --max-old-space-size=8192",
	"      - name: Browser",
	"        run: bun run e2e",
	"        env:",
	"          CI: 1",
	"          FAKE_API: http://127.0.0.1:4310",
	"",
].join("\n");

describe("a gate runs in the env of its CI job", () => {
	test("readWorkflows gives each job the workflow env under its own, and each step its env, all as strings", () => {
		const read = readWorkflows(
			[{ path: ".github/workflows/ci.yml", text: withEnv }],
			() => undefined,
		);
		const job = read.workflows[0]?.jobs[0];
		expect(job?.env).toEqual({
			TURBO_TEAM: `\${{ secrets.TURBO_TEAM }}`,
			TELEMETRY: "0",
			DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/test",
		});
		expect(job?.steps.map((step) => step.env)).toEqual([
			undefined,
			{ NODE_OPTIONS: "--max-old-space-size=8192" },
			{ CI: "1", FAKE_API: "http://127.0.0.1:4310" },
		]);
	});

	const leaveTurbo = {
		name: "TURBO_TEAM",
		why: "CI reads the remote cache. A local run has none.",
	};
	const jobEnv = [
		leaveTurbo,
		{ name: "TELEMETRY", value: "0" },
		{
			name: "DATABASE_URL",
			value: "postgresql://postgres:postgres@127.0.0.1:54322/test",
			why: "The local stack listens on port 54322.",
		},
	];
	const mirrored: GateInput[] = [
		{ name: "lint", command: "bun run lint", ci_env: jobEnv },
		{
			name: "typecheck",
			command: "bun run typecheck",
			ci_env: [
				...jobEnv,
				{ name: "NODE_OPTIONS", value: "--max-old-space-size=8192" },
			],
		},
		{
			name: "e2e",
			command: "bun run e2e",
			env: [{ name: "FAKE_API", why: "The session starts the fake API." }],
			ci_env: [...jobEnv, { name: "CI", value: "1" }],
		},
	];

	test("a gate that copies, sets or leaves out each variable of its job, and of the steps that map to it, passes", () => {
		const report = envParity(withEnv, mirrored);
		expect(parityFailures(report)).toEqual([]);
		expect(formatParity(report).slice(4)).toEqual([
			"- lint runs with the CI value of CI, TELEMETRY.",
			"- lint: leaves TURBO_TEAM as the session has it. CI reads the remote cache. A local run has none.",
			"- lint: DATABASE_URL differs from CI. The local stack listens on port 54322.",
			"- typecheck runs with the CI value of CI, TELEMETRY, NODE_OPTIONS.",
			"- typecheck: leaves TURBO_TEAM as the session has it. CI reads the remote cache. A local run has none.",
			"- typecheck: DATABASE_URL differs from CI. The local stack listens on port 54322.",
			"- e2e runs with the CI value of TELEMETRY, CI. The session sets FAKE_API.",
			"- e2e: leaves TURBO_TEAM as the session has it. CI reads the remote cache. A local run has none.",
			"- e2e: DATABASE_URL differs from CI. The local stack listens on port 54322.",
		]);
	});

	test("a gate with no ci_env misses each variable of its job, and CI=true needs no entry", () => {
		const report = envParity(withEnv, [
			{ name: "lint", command: "bun run lint" },
			...mirrored.slice(1),
		]);
		expect(parityFailures(report)).toEqual([
			`lint does not set TURBO_TEAM, which ci.yml#validate sets from \${{ secrets.TURBO_TEAM }}. Add TURBO_TEAM to the env of the gate, or give it a ci_env entry with a why.`,
			"lint does not set TELEMETRY, which ci.yml#validate sets to 0. Copy the value into the ci_env of the gate, or give a why to leave it out.",
			"lint does not set DATABASE_URL, which ci.yml#validate sets to postgresql://postgres:postgres@127.0.0.1:5432/test. Copy the value into the ci_env of the gate, or give a why to leave it out.",
		]);
		expect(formatParity(report).slice(4, 6)).toEqual([
			"- lint runs with the CI value of CI.",
			`- ENV lint does not set TURBO_TEAM, which ci.yml#validate sets from \${{ secrets.TURBO_TEAM }}. Add TURBO_TEAM to the env of the gate, or give it a ci_env entry with a why.`,
		]);
	});

	test("the env of a step counts only for the gate that the step maps to", () => {
		const report = envParity(withEnv, [
			mirrored[0] ?? { name: "", command: "" },
			{ name: "typecheck", command: "bun run typecheck", ci_env: jobEnv },
			{
				name: "e2e",
				command: "bun run e2e",
				ci_env: [
					...jobEnv,
					{ name: "FAKE_API", value: "http://127.0.0.1:4310" },
				],
			},
		]);
		expect(parityFailures(report)).toEqual([
			'typecheck does not set NODE_OPTIONS, which ci.yml#validate step "Typecheck" sets to --max-old-space-size=8192. Copy the value into the ci_env of the gate, or give a why to leave it out.',
			'e2e does not set CI, which ci.yml#validate step "Browser" sets to 1. Copy the value into the ci_env of the gate, or give a why to leave it out.',
		]);
	});

	test("a copied value that differs from CI, or that copies an expression, fails", () => {
		const report = envParity(withEnv, [
			{
				name: "lint",
				command: "bun run lint",
				ci_env: [
					{ name: "TURBO_TEAM", value: "acme" },
					{ name: "TELEMETRY", value: "1" },
					jobEnv[2] ?? leaveTurbo,
				],
			},
			...mirrored.slice(1),
		]);
		expect(parityFailures(report)).toEqual([
			`lint sets TURBO_TEAM to acme, but ci.yml#validate sets it from \${{ secrets.TURBO_TEAM }}. Copy the CI value, or give a why.`,
			"lint sets TELEMETRY to 1, but ci.yml#validate sets it to 0. Copy the CI value, or give a why.",
		]);
	});

	test("a copied value that no CI job of the gate sets is stale", () => {
		const report = envParity(withEnv, [
			{
				name: "lint",
				command: "bun run lint",
				ci_env: [...jobEnv, { name: "FORCE_COLOR", value: "1" }],
			},
			...mirrored.slice(1),
		]);
		expect(parityFailures(report)).toEqual([
			"lint sets FORCE_COLOR with no why, but no CI job of the gate sets it. Remove it, or give a why.",
		]);
	});

	test("a job that the config maps as a whole gives its job env and the env of each step that does not only prepare, and an excluded step gives none", () => {
		const workflow = [
			"on: pull_request",
			"jobs:",
			"  visual:",
			"    env:",
			"      SNAPSHOTS: compare",
			"    steps:",
			"      - run: bun install --frozen-lockfile",
			"        env:",
			`          NPM_TOKEN: \${{ secrets.NPM }}`,
			"      - run: bun run visual",
			"        env:",
			"          WORKERS: '2'",
			"  validate:",
			"    steps:",
			"      - run: bun run lint",
			"      - name: Summary",
			"        run: bun run summary",
			"        env:",
			`          SUMMARY_TOKEN: \${{ secrets.SUMMARY }}`,
			"",
		].join("\n");
		const config: CiParityConfig = {
			setup: [{ command: "bun install --frozen-lockfile", reason: "r" }],
			map: [
				{
					job: "ci.yml#visual",
					gates: ["visual"],
					reason: "r",
					differs: "The gate runs the suite in a container.",
				},
			],
			exclude: [{ job: "ci.yml#validate", step: "Summary", reason: "r" }],
		};
		const bare = envParity(
			workflow,
			[
				{ name: "visual", command: "docker run visual" },
				{ name: "lint", command: "bun run lint" },
			],
			config,
		);
		expect(parityFailures(bare)).toEqual([
			"visual does not set SNAPSHOTS, which ci.yml#visual sets to compare. Copy the value into the ci_env of the gate, or give a why to leave it out.",
			'visual does not set WORKERS, which ci.yml#visual step "bun run visual" sets to 2. Copy the value into the ci_env of the gate, or give a why to leave it out.',
		]);
	});

	test("a job gives the env of its container under the workflow env and its own", () => {
		const read = readWorkflows(
			[
				{
					path: ".github/workflows/ci.yml",
					text: [
						"on: pull_request",
						"env:",
						"  LEVEL: workflow",
						"jobs:",
						"  visual:",
						"    container:",
						"      image: mcr.microsoft.com/playwright:v1.62.0-noble",
						"      env:",
						"        FONTCONFIG: pinned",
						"        LEVEL: container",
						"        STAGE: container",
						"    env:",
						"      STAGE: job",
						"    steps:",
						"      - run: bun run visual",
						"  lint:",
						"    container: node:22",
						"    steps:",
						"      - run: bun run lint",
						"",
					].join("\n"),
				},
			],
			() => undefined,
		);
		expect(read.workflows[0]?.jobs.map((job) => job.env)).toEqual([
			{ FONTCONFIG: "pinned", LEVEL: "workflow", STAGE: "job" },
			{ LEVEL: "workflow" },
		]);
	});

	test("an override of CI with a why leaves CI out, and the report says why", () => {
		const report = envParity(
			[
				"on: pull_request",
				"jobs:",
				"  a:",
				"    steps:",
				"      - run: bun run lint",
				"",
			].join("\n"),
			[
				{
					name: "lint",
					command: "bun run lint",
					ci_env: [{ name: "CI", why: "The owner keeps lint out of CI mode." }],
				},
			],
		);
		expect(parityFailures(report)).toEqual([]);
		expect(formatParity(report).slice(4)).toEqual([
			"- lint: leaves CI as the session has it. The owner keeps lint out of CI mode.",
		]);
	});
});

test("an empty CI value prints as two quotes", () => {
	const report = envParity(
		[
			"on: pull_request",
			"jobs:",
			"  a:",
			"    env:",
			'      SENTRY_DSN: ""',
			"    steps:",
			"      - run: bun run lint",
			"",
		].join("\n"),
		[
			{
				name: "lint",
				command: "bun run lint",
				ci_env: [{ name: "SENTRY_DSN", value: "x" }],
			},
		],
	);
	expect(parityFailures(report)).toEqual([
		'lint sets SENTRY_DSN to x, but ci.yml#a sets it to "". Copy the CI value, or give a why.',
	]);
});

describe("a gate runs on the tool versions that its CI job pins", () => {
	const workflow = (setup: readonly string[]) =>
		[
			"on: pull_request",
			"jobs:",
			"  e2e:",
			"    steps:",
			...setup,
			"      - run: bun run e2e",
			"      - run: bun run seed",
			"",
		].join("\n");
	const files: Readonly<Record<string, string>> = {
		".bun-version": "1.2.9\n",
		"package.json": '{"packageManager": "bun@1.4.2"}',
		".tool-version": "latest\n",
	};
	const read = (setup: readonly string[]) =>
		readWorkflows(
			[{ path: ".github/workflows/ci.yml", text: workflow(setup) }],
			(path) => files[path],
		);
	const pinned = [
		"      - uses: oven-sh/setup-bun@v2",
		"        with:",
		'          bun-version: "1.3.14"',
		"      - uses: supabase/setup-cli@v2",
		"        with:",
		"          version: 2.106.0",
	];
	const report = (
		setup: readonly string[],
		gate: { tools?: Readonly<Record<string, string>>; requires?: string[] },
	) => {
		const { workflows, problems } = read(setup);
		return checkCiParity({
			workflows,
			readProblems: problems,
			gates: profileGates({
				version: 1,
				gates: [
					{
						name: "e2e",
						command: "bun run e2e",
						tools: gate.tools ?? {},
						requires: (gate.requires ?? []).map((check, index) => ({
							name: `tool ${index}`,
							check,
							on_missing: "stop",
						})),
					},
				],
				test: { name: "test", command: "bun run test" },
			}),
			config: {
				...none,
				setup: [{ command: "bun run seed", reason: "Seeds the stack." }],
			},
		});
	};

	test("readWorkflows gives each job the version of each tool that a setup action pins", () => {
		expect(read(pinned).workflows[0]?.jobs[0]?.pins).toEqual([
			{
				kind: "exact",
				tool: "bun",
				version: "1.3.14",
				file: undefined,
				source: "bun-version of oven-sh/setup-bun",
			},
			{
				kind: "exact",
				tool: "supabase",
				version: "2.106.0",
				file: undefined,
				source: "version of supabase/setup-cli",
			},
		]);
	});

	test("a pin file gives its first line, and package.json gives the version of its packageManager", () => {
		const fromFile = (file: string) =>
			read([
				"      - uses: oven-sh/setup-bun@v2",
				"        with:",
				`          bun-version-file: ${file}`,
			]).workflows[0]?.jobs[0]?.pins;
		expect(fromFile(".bun-version")).toEqual([
			{
				kind: "exact",
				tool: "bun",
				version: "1.2.9",
				file: ".bun-version",
				source: ".bun-version, the bun-version-file of oven-sh/setup-bun",
			},
		]);
		expect(fromFile("package.json")).toEqual([
			{
				kind: "exact",
				tool: "bun",
				version: "1.4.2",
				file: "package.json",
				source: "package.json, the bun-version-file of oven-sh/setup-bun",
			},
		]);
		expect(fromFile(".tool-version")).toEqual([
			{
				kind: "unread",
				tool: "bun",
				source: ".tool-version, the bun-version-file of oven-sh/setup-bun",
			},
		]);
	});

	test("a version that is not exact pins nothing, and the last setup of a tool in a job wins", () => {
		expect(
			read([
				"      - uses: oven-sh/setup-bun@v2",
				"        with:",
				"          bun-version: latest",
				"      - uses: actions/setup-node@v4",
				"        with:",
				"          node-version: 20",
			]).workflows[0]?.jobs[0]?.pins,
		).toEqual([]);
		expect(
			read([
				"      - uses: oven-sh/setup-bun@v2",
				"        with:",
				'          bun-version: "1.3.10"',
				...pinned.slice(0, 3),
			]).workflows[0]?.jobs[0]?.pins,
		).toEqual([
			{
				kind: "exact",
				tool: "bun",
				version: "1.3.14",
				file: undefined,
				source: "bun-version of oven-sh/setup-bun",
			},
		]);
	});

	test("a gate that records each pinned version in its tools passes", () => {
		const recorded = report(pinned, {
			tools: { bun: "1.3.14", supabase: "2.106.0" },
		});
		expect(parityFailures(recorded)).toEqual([]);
		expect(formatParity(recorded)).toContain(
			"- e2e runs the CI version of bun 1.3.14, supabase 2.106.0.",
		);
	});

	test("a gate with no record of a pinned tool fails, and a prerequisite that checks the version is no record", () => {
		expect(
			parityFailures(
				report(pinned, { requires: ['test "$(bun --version)" = 1.3.14'] }),
			),
		).toEqual([
			'e2e runs in ci.yml#e2e, which pins bun 1.3.14 with the bun-version of oven-sh/setup-bun. Record the pin in the tools of the gate as bun: "1.3.14".',
			'e2e runs in ci.yml#e2e, which pins supabase 2.106.0 with the version of supabase/setup-cli. Record the pin in the tools of the gate as supabase: "2.106.0".',
		]);
	});

	test("a gate that records another version fails, so a new pin in CI stops apply", () => {
		expect(
			parityFailures(
				report(pinned, { tools: { bun: "1.3.13", supabase: "2.106.0" } }),
			),
		).toEqual([
			'e2e records bun 1.3.13, but ci.yml#e2e pins bun 1.3.14 with the bun-version of oven-sh/setup-bun. Record the pin in the tools of the gate as bun: "1.3.14".',
		]);
	});

	test("a gate that records a tool that no CI job of the gate pins fails", () => {
		expect(
			parityFailures(
				report(pinned.slice(0, 3), {
					tools: { bun: "1.3.14", supabase: "2.106.0" },
				}),
			),
		).toEqual([
			"e2e records supabase 2.106.0, but no CI job of the gate pins supabase. Remove it from the tools of the gate.",
		]);
	});

	describe("a tool that only a local prerequisite of the gate runs", () => {
		const twoJobs = [
			"on: pull_request",
			"jobs:",
			"  e2e:",
			"    steps:",
			...pinned,
			"      - run: bun run e2e",
			"  validate:",
			"    steps:",
			...pinned.slice(0, 3),
			"      - run: bun run test",
			"",
		].join("\n");
		const withTestTools = (
			tools: Readonly<Record<string, string>>,
			check: string,
		) => {
			const { workflows, problems } = readWorkflows(
				[{ path: ".github/workflows/ci.yml", text: twoJobs }],
				() => undefined,
			);
			return checkCiParity({
				workflows,
				readProblems: problems,
				gates: profileGates({
					version: 1,
					gates: [
						{
							name: "e2e",
							command: "bun run e2e",
							tools: { bun: "1.3.14", supabase: "2.106.0" },
						},
					],
					test: {
						name: "test",
						command: "bun run test",
						tools,
						requires: [{ name: "stack", check, on_missing: "start" }],
					},
				}),
				config: none,
			});
		};
		const stack = "(cd db && supabase status >/dev/null)";

		test("passes when another CI job of the profile pins the version that the gate records, as a test gate on a local Supabase stack needs", () => {
			const report = withTestTools(
				{ bun: "1.3.14", supabase: "2.106.0" },
				stack,
			);
			expect(parityFailures(report)).toEqual([]);
			expect(formatParity(report)).toContain(
				"- test runs supabase 2.106.0, which ci.yml#e2e pins, only in a prerequisite or a setup entry.",
			);
		});

		test("fails when no CI job of the profile pins the version that the gate records", () => {
			expect(
				parityFailures(
					withTestTools({ bun: "1.3.14", supabase: "2.105.0" }, stack),
				),
			).toEqual([
				'test runs supabase 2.105.0, but no CI job of the profile pins that version. Record the version that a CI job pins, such as supabase: "2.106.0" from ci.yml#e2e.',
			]);
		});

		test("stays stale when the gate does not run the tool", () => {
			expect(
				parityFailures(
					withTestTools({ bun: "1.3.14", supabase: "2.106.0" }, "test -f .env"),
				),
			).toEqual([
				"test records supabase 2.106.0, but no CI job of the gate pins supabase. Remove it from the tools of the gate.",
			]);
		});
	});

	test("the version of a pin file is the version that the gate records, and a pin file with no exact version fails", () => {
		const viaFile = [
			"      - uses: oven-sh/setup-bun@v2",
			"        with:",
			"          bun-version-file: .bun-version",
		];
		expect(
			parityFailures(report(viaFile, { tools: { bun: "1.2.9" } })),
		).toEqual([]);
		expect(
			parityFailures(
				report(
					[
						"      - uses: oven-sh/setup-bun@v2",
						"        with:",
						"          bun-version-file: .tool-version",
					],
					{},
				),
			),
		).toEqual([
			"ci.yml#e2e pins bun with .tool-version, the bun-version-file of oven-sh/setup-bun, but the check cannot read an exact version from it.",
		]);
	});

	test("a node pin still needs a prerequisite that checks the version", () => {
		const node = [
			"      - uses: actions/setup-node@v4",
			"        with:",
			"          node-version: 22.11.0",
		];
		const checked = report(node, {
			requires: ['test "$(node --version)" = v22.11.0'],
		});
		expect(parityFailures(checked)).toEqual([]);
		expect(formatParity(checked)).toContain(
			"- e2e runs the CI version of node 22.11.0.",
		);
		expect(parityFailures(report(node, {}))).toEqual([
			'e2e runs in ci.yml#e2e, which pins node 22.11.0 with the node-version of actions/setup-node. Give the gate a prerequisite that checks it, such as test "$(node --version)" = v22.11.0.',
		]);
	});
});

describe("a gate that the config maps to a CI step runs the commands of the step", () => {
	const workflow = [
		"on: pull_request",
		"jobs:",
		"  e2e:",
		"    steps:",
		"      - name: E2E",
		"        run: |",
		'          if [ -n "$LANE_GREP" ]; then',
		'            bunx playwright test --grep "$LANE_GREP"',
		"          else",
		"            bunx playwright test",
		"          fi",
		"",
	].join("\n");
	const laneOnly = [
		{
			name: "e2e",
			command:
				'if [ -n "$LANE_GREP" ]; then bunx playwright test --grep "$LANE_GREP"; fi',
		},
	];
	const entry = {
		job: "ci.yml#e2e",
		step: "E2E",
		gates: ["e2e"],
		reason: "The gate runs the suite of the step.",
	};

	test("a gate that runs only the lane grep of the step fails without a differs reason, and the report prints the reason when the entry has one", () => {
		const unrecorded = inlineParity(workflow, laneOnly, {
			...none,
			map: [entry],
		});
		expect(parityFailures(unrecorded)).toEqual([
			'ci.yml#e2e step "E2E" maps to e2e in the project config, but no mapped gate runs `bunx playwright test`. Run the same commands in a gate, or give the map entry a differs reason.',
		]);
		const recorded = inlineParity(workflow, laneOnly, {
			...none,
			map: [
				{
					...entry,
					differs: "CI runs the whole suite, and the gate runs the lane grep.",
				},
			],
		});
		expect(parityFailures(recorded)).toEqual([]);
		expect(formatParity(recorded)).toContain(
			'- DIFFERS ci.yml#e2e step "E2E", mapped to e2e. No mapped gate runs `bunx playwright test`. CI runs the whole suite, and the gate runs the lane grep.',
		);
	});

	test("a step counts only the commands of the gates that it maps to, not a command that another gate runs", () => {
		const elsewhere = [
			...laneOnly,
			{ name: "suite", command: "bunx playwright test" },
		];
		expect(
			parityFailures(
				inlineParity(workflow, elsewhere, { ...none, map: [entry] }),
			),
		).toEqual([
			'ci.yml#e2e step "E2E" maps to e2e in the project config, but no mapped gate runs `bunx playwright test`. Run the same commands in a gate, or give the map entry a differs reason.',
		]);
	});

	test("a gate that runs each command of the step in another layout needs no differs reason, and a differs reason on it is stale", () => {
		const same = [
			{
				name: "e2e",
				command:
					'set -eo pipefail; if [ -n "$LANE_GREP" ]; then bunx playwright test --grep "$LANE_GREP" >/dev/null; else bunx playwright test; fi',
			},
		];
		expect(
			parityFailures(inlineParity(workflow, same, { ...none, map: [entry] })),
		).toEqual([]);
		expect(
			parityFailures(
				inlineParity(workflow, same, {
					...none,
					map: [{ ...entry, differs: "Old difference." }],
				}),
			),
		).toEqual([
			"projects config: the differs reason of step E2E in ci.yml#e2e matches no step whose commands its gates do not run",
		]);
	});

	test("a job that the config maps as a whole compares each step that no gate runs by command", () => {
		const report = inlineParity(workflow, laneOnly, {
			...none,
			map: [{ job: "ci.yml#e2e", gates: ["e2e"], reason: "r" }],
		});
		expect(parityFailures(report)).toEqual([
			'ci.yml#e2e step "E2E" maps to e2e in the project config, but no mapped gate runs `bunx playwright test`. Run the same commands in a gate, or give the map entry a differs reason.',
		]);
	});
});

describe("gates that map to the steps of one job run in the order of those steps", () => {
	const workflow = [
		"on: pull_request",
		"jobs:",
		"  check:",
		"    steps:",
		"      - run: bun run db:reset",
		"      - run: bun run suite",
		"      - run: bun run test",
		"      - run: bun run roles",
		"",
	].join("\n");
	const gates = (names: readonly string[]) =>
		names.map((name) => ({
			name,
			command:
				{ "db-reset": "bun run db:reset", suite: "bun run suite" }[name] ??
				`bun run ${name}`,
		}));

	test("two gates of one job in the reverse step order fail, and the step order passes", () => {
		expect(
			parityFailures(
				inlineParity(workflow, gates(["suite", "db-reset", "roles"]), none),
			),
		).toEqual([
			"ci.yml#check runs db-reset before suite, but the profile lists suite first. Put db-reset before suite in the gates of the profile, so the run keeps the order of CI.",
		]);
		expect(
			parityFailures(
				inlineParity(workflow, gates(["db-reset", "suite", "roles"]), none),
			),
		).toEqual([]);
	});

	test("a test step before another gate is a note, because the run always runs the test gate last", () => {
		const report = inlineParity(
			workflow,
			gates(["db-reset", "suite", "roles"]),
			none,
		);
		expect(formatParity(report)).toContain(
			"- ci.yml#check runs the test gate test before roles, and the run always runs the test gate last.",
		);
	});
});

describe("a gate runs with each variable that a step of its job writes to $GITHUB_ENV", () => {
	const exporting = (run: readonly string[]) =>
		[
			"on: pull_request",
			"jobs:",
			"  smoke:",
			"    steps:",
			"      - name: Export the stack env",
			"        run: |",
			...run.map((line) => `          ${line}`),
			"      - run: bun run e2e",
			"",
		].join("\n");
	const exportStep: CiParityConfig = {
		...none,
		exclude: [
			{
				job: "ci.yml#smoke",
				step: "Export the stack env",
				reason: "The session exports the keys of the stack.",
			},
		],
	};

	test("readWorkflows reads each name that an echo, a group or a heredoc writes, and marks a write that it cannot read", () => {
		const read = readWorkflows(
			[
				{
					path: ".github/workflows/ci.yml",
					text: exporting([
						'echo "DATABASE_URL=postgresql://127.0.0.1:54322/postgres" >> "$GITHUB_ENV"',
						"{",
						`  echo "API_URL=\${API}"`,
						"  echo 'MODE=ci'",
						'} >> "$GITHUB_ENV"',
						"cat >> $GITHUB_ENV <<EOF",
						"PORT=3300",
						"EOF",
						`echo "LEVEL=debug" | tee -a "\${GITHUB_ENV}"`,
						'echo "SINGLE=one" > "$GITHUB_ENV"',
						'echo "TEED=two" | tee "$GITHUB_ENV"',
						"{",
						"  echo 'GROUPED=three'",
						'} > "$GITHUB_ENV"',
						"{",
						"  echo '### summary'",
						'} >> "$GITHUB_STEP_SUMMARY"',
					]),
				},
			],
			() => undefined,
		);
		expect(read.workflows[0]?.jobs[0]?.steps[0]?.writes).toEqual({
			names: {
				DATABASE_URL: "postgresql://127.0.0.1:54322/postgres",
				API_URL: `\${API}`,
				MODE: "ci",
				PORT: "3300",
				LEVEL: "debug",
				SINGLE: "one",
				TEED: "two",
				GROUPED: "three",
			},
			unread: false,
		});
		const dynamic = readWorkflows(
			[
				{
					path: ".github/workflows/ci.yml",
					text: exporting([
						"printf '%s\\n' \"$status\" | sed 's/^/SUPA_/' >> \"$GITHUB_ENV\"",
					]),
				},
			],
			() => undefined,
		);
		expect(dynamic.workflows[0]?.jobs[0]?.steps[0]?.writes).toEqual({
			names: {},
			unread: true,
		});
		expect(
			readWorkflows(
				[{ path: ".github/workflows/ci.yml", text: exporting(["true"]) }],
				() => undefined,
			).workflows[0]?.jobs[0]?.steps[0]?.writes,
		).toBeUndefined();
	});

	test('a job with echo "DATABASE_URL=..." >> "$GITHUB_ENV" fails a gate with no DATABASE_URL entry, and passes a gate that leaves it out with a why', () => {
		const workflow = exporting([
			'echo "DATABASE_URL=postgresql://127.0.0.1:54322/postgres" >> "$GITHUB_ENV"',
		]);
		expect(
			parityFailures(
				envParity(
					workflow,
					[{ name: "e2e", command: "bun run e2e" }],
					exportStep,
				),
			),
		).toEqual([
			'e2e does not set DATABASE_URL, which ci.yml#smoke step "Export the stack env" through $GITHUB_ENV sets to postgresql://127.0.0.1:54322/postgres. Copy the value into the ci_env of the gate, or give a why to leave it out.',
		]);
		const left = envParity(
			workflow,
			[
				{
					name: "e2e",
					command: "bun run e2e",
					ci_env: [
						{
							name: "DATABASE_URL",
							why: "The local stack gives the session its own URL.",
						},
					],
				},
			],
			exportStep,
		);
		expect(parityFailures(left)).toEqual([]);
		expect(formatParity(left)).toContain(
			"- e2e: leaves DATABASE_URL as the session has it. The local stack gives the session its own URL.",
		);
	});

	test("a write that the check cannot read fails, unless the project config maps or excludes its step with a reason", () => {
		const workflow = exporting([
			"printf '%s\\n' \"$status\" | sed 's/^/SUPA_/' >> \"$GITHUB_ENV\"",
		]);
		const gates = [{ name: "e2e", command: "bun run e2e" }];
		expect(
			parityFailures(
				envParity(workflow, gates, {
					...none,
					setup: [
						{
							command:
								"printf '%s\\n' \"$status\" | sed 's/^/SUPA_/' >> \"$GITHUB_ENV\"",
							reason: "r",
						},
					],
				}),
			),
		).toEqual([
			'ci.yml#smoke step "Export the stack env" writes to $GITHUB_ENV with a command that the check cannot read. Write each name with echo "NAME=value", or map or exclude the step in the project config with a reason that says how each gate gets the names.',
		]);
		const reviewed = envParity(workflow, gates, exportStep);
		expect(parityFailures(reviewed)).toEqual([]);
		expect(formatParity(reviewed)).toContain(
			'- ci.yml#smoke step "Export the stack env" writes names to $GITHUB_ENV that the check cannot read. The session exports the keys of the stack.',
		);
	});
});

describe("a gate accounts for each service of its CI job", () => {
	const workflow = [
		"on: pull_request",
		"jobs:",
		"  validate:",
		"    services:",
		"      postgres:",
		"        image: postgres:17",
		"        env:",
		"          POSTGRES_PASSWORD: postgres",
		"        ports:",
		"          - 5432:5432",
		"      redis:",
		"        image: redis:7",
		"        ports: [6379]",
		"    steps:",
		"      - run: bun run lint",
		"      - run: bun run e2e",
		"",
	].join("\n");

	test("readWorkflows reads the env and the host ports of each service of a job", () => {
		const read = readWorkflows(
			[{ path: ".github/workflows/ci.yml", text: workflow }],
			() => undefined,
		);
		expect(read.workflows[0]?.jobs[0]?.services).toEqual([
			{
				id: "postgres",
				env: { POSTGRES_PASSWORD: "postgres" },
				ports: ["5432"],
			},
			{ id: "redis", env: {}, ports: ["6379"] },
		]);
	});

	test("each gate of the job copies, sets or leaves out the env of a service, and a gate of the job names each port", () => {
		const leave = {
			name: "POSTGRES_PASSWORD",
			why: "The CI Postgres service reads it. The local stack on port 5432 has its own.",
		};
		const bare = envParity(workflow, [
			{ name: "lint", command: "bun run lint" },
			{ name: "e2e", command: "bun run e2e" },
		]);
		expect(parityFailures(bare)).toEqual([
			'lint does not set POSTGRES_PASSWORD, which ci.yml#validate service "postgres" sets to postgres. Copy the value into the ci_env of the gate, or give a why to leave it out.',
			'e2e does not set POSTGRES_PASSWORD, which ci.yml#validate service "postgres" sets to postgres. Copy the value into the ci_env of the gate, or give a why to leave it out.',
			'No gate of ci.yml#validate names port 5432 of its service "postgres". Give the gate that uses the service a prerequisite that checks the port, or name the port in the why of a ci_env entry.',
			'No gate of ci.yml#validate names port 6379 of its service "redis". Give the gate that uses the service a prerequisite that checks the port, or name the port in the why of a ci_env entry.',
		]);
		const covered = envParity(workflow, [
			{ name: "lint", command: "bun run lint", ci_env: [leave] },
			{
				name: "e2e",
				command: "bun run e2e",
				ci_env: [leave],
				requires: [
					{
						name: "Redis on port 6379",
						check: "nc -z 127.0.0.1 6379",
						on_missing: "stop",
					},
				],
			},
		]);
		expect(parityFailures(covered)).toEqual([]);
		expect(formatParity(covered)).toContain(
			'- e2e names port 6379 of the service "redis" of ci.yml#validate.',
		);
	});
});

test("a $GITHUB_ENV value that the shell expands is a CI value that a gate cannot copy", () => {
	const report = envParity(
		[
			"on: pull_request",
			"jobs:",
			"  smoke:",
			"    steps:",
			"      - name: Export",
			`        run: echo "SUPABASE_URL=\${API_URL}" >> "$GITHUB_ENV"`,
			"      - run: bun run e2e",
			"",
		].join("\n"),
		[{ name: "e2e", command: "bun run e2e" }],
		{
			...none,
			exclude: [{ job: "ci.yml#smoke", step: "Export", reason: "r" }],
		},
	);
	expect(parityFailures(report)).toEqual([
		`e2e does not set SUPABASE_URL, which ci.yml#smoke step "Export" through $GITHUB_ENV sets from \${API_URL}. Add SUPABASE_URL to the env of the gate, or give it a ci_env entry with a why.`,
	]);
});
