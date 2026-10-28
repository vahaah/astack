import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { platformToolGaps } from "../../scripts/lib/platform-tools.ts";
import { packageScripts } from "../../scripts/lib/task-cache.ts";
import {
	parseProfile,
	profileGates,
} from "../../src/astack/pr-review-profile.ts";
import { profilePaths } from "../profile-paths.ts";

type Requirement = { name: string; check: string; on_missing: "stop" };

function gates(
	...entries: {
		name: string;
		command: string;
		requires?: Requirement[];
	}[]
) {
	return profileGates({ version: 1, gates: entries });
}

const requiring = (check: string): Requirement[] => [
	{ name: "lockf on this host", check, on_missing: "stop" },
];

const root = packageScripts(
	".",
	JSON.stringify({
		scripts: {
			"e2e:full": "bun tooling/stack/e2e-lock.ts",
			e2e: "bun run e2e:full",
			lint: "biome ci .",
		},
	}),
);

const files: Readonly<Record<string, string>> = {
	"tooling/stack/e2e-lock.ts": [
		"/** `flock(1)` does not exist on this host, and `lockf(1)` does. */",
		'for (const candidate of ["/usr/bin/lockf", "/usr/local/bin/lockf"]) {}',
	].join("\n"),
	"tooling/clip.sh": "# copies the report\ncat report.txt | pbcopy\n",
};

const repo = {
	packages: root === undefined ? [] : [root],
	read: (path: string) => files[path],
};

const portable =
	'if [ -e /usr/bin/lockf ] || [ -e /usr/local/bin/lockf ]; then bun run e2e:full "$@"; else cd apps/app && bunx playwright test "$@"; fi';

const direct = "lockf -k -t 0 /tmp/e2e.lock bunx playwright test";

describe("a gate that needs a tool that only one platform ships", () => {
	const lockf =
		"lockf ships only on macOS and BSD, so the gate cannot start on another host. Add a prerequisite whose check tests for lockf, such as `command -v lockf`. Or make the gate command an if that tests for lockf, and run a portable form with no lockf in its else branch.";
	const throughLock = `The gate e2e needs lockf in the e2e:full script of the repo root, through tooling/stack/e2e-lock.ts. ${lockf}`;
	const inCommand = `The gate e2e needs lockf in its command. ${lockf}`;

	test.each([
		[
			"a script whose file holds lockf",
			"bun run e2e:full --grep @lane:a",
			[],
			throughLock,
		],
		["a script that runs that script", "bun run e2e", [], throughLock],
		[
			"a shell file that pipes to pbcopy",
			"bash tooling/clip.sh",
			[],
			"The gate e2e needs pbcopy in its command, through tooling/clip.sh. pbcopy ships only on macOS, so the gate cannot start on another host. Add a prerequisite whose check tests for pbcopy, such as `command -v pbcopy`. Or make the gate command an if that tests for pbcopy, and run a portable form with no pbcopy in its else branch.",
		],
		["a direct call of lockf", direct, [], inCommand],
		[
			"a test for lockf with no else branch, so another host runs nothing",
			`command -v lockf >/dev/null && ${direct}`,
			[],
			inCommand,
		],
		[
			"an if that tests for lockf with no else branch",
			'if [ -e /usr/bin/lockf ] || [ -e /usr/local/bin/lockf ]; then bun run e2e:full "$@"; fi',
			[],
			inCommand,
		],
		[
			"an else branch that only prints",
			`if command -v lockf >/dev/null; then ${direct}; else echo "no lockf, so no e2e run"; fi`,
			[],
			inCommand,
		],
		[
			"an else branch that reaches lockf through a script",
			`if command -v lockf >/dev/null; then ${direct}; else bun run e2e; fi`,
			[],
			inCommand,
		],
		[
			"a prerequisite whose check only names lockf",
			"bun run e2e:full",
			requiring("echo lockf"),
			throughLock,
		],
		[
			"a prerequisite whose check passes when lockf is missing",
			"bun run e2e:full",
			requiring("! command -v lockf >/dev/null"),
			throughLock,
		],
		[
			"a prerequisite whose check ends in || true",
			"bun run e2e:full",
			requiring("command -v lockf >/dev/null || true"),
			throughLock,
		],
		[
			"a prerequisite whose check prints when lockf is missing",
			"bun run e2e:full",
			requiring("command -v lockf >/dev/null || echo 'no lockf'"),
			throughLock,
		],
		[
			"a prerequisite whose check ends in ; true",
			"bun run e2e:full",
			requiring("command -v lockf >/dev/null; true"),
			throughLock,
		],
		[
			"an if whose condition passes when lockf is missing",
			`if command -v lockf >/dev/null || true; then ${direct}; else bunx playwright test; fi`,
			[],
			inCommand,
		],
		[
			"a direct call of lockf after a guarded if",
			`if command -v lockf >/dev/null; then ${direct}; else bunx playwright test; fi && lockf -t 0 /tmp/r.lock bun scripts/report.ts`,
			[],
			inCommand,
		],
		[
			"a direct call of lockf before a guarded if",
			`lockf -t 0 /tmp/a.lock true && if command -v lockf >/dev/null; then ${direct}; else bunx playwright test; fi`,
			[],
			inCommand,
		],
		[
			"a script that reaches lockf after a guarded if",
			`if command -v lockf >/dev/null; then ${direct}; else bunx playwright test; fi && bun run e2e`,
			[],
			throughLock,
		],
	])("finds %s", (_, command, requires, gap) => {
		expect(
			platformToolGaps(repo, gates({ name: "e2e", command, requires })),
		).toEqual([gap]);
	});

	test("reads no tool in a comment of a script file", () => {
		expect(
			platformToolGaps(
				{
					...repo,
					read: (path) => (path === "a.ts" ? "// flock\n" : undefined),
				},
				gates({ name: "a", command: "bun a.ts" }),
			),
		).toEqual([]);
	});

	test.each([
		["a command that tests for lockf and runs a portable form", portable, []],
		[
			"an else branch that prints the word lockf and runs a portable form",
			'if [ -e /usr/bin/lockf ]; then bun run e2e:full; else echo "this host has no lockf"; cd apps/app && bunx playwright test; fi',
			[],
		],
		[
			"a prerequisite whose check tests for lockf",
			"bun run e2e:full",
			requiring("command -v lockf >/dev/null"),
		],
	])("passes %s", (_, command, requires) => {
		expect(
			platformToolGaps(repo, gates({ name: "e2e", command, requires })),
		).toEqual([]);
	});
});

describe("the platform tool check over each profile that apply writes", () => {
	const noScripts = { packages: [], read: () => undefined };
	const gatesOf = (path: string) =>
		profileGates(
			parseProfile(
				readFileSync(resolve(import.meta.dir, "../..", path), "utf8"),
			).data,
		);

	test.each(profilePaths)(
		"%s has no gate whose own text needs a tool of one platform with no test for it",
		(path) => {
			expect(platformToolGaps(noScripts, gatesOf(path))).toEqual([]);
		},
	);
});
