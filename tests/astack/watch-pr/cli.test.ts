import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { command as watchPrCommand } from "../../../src/astack/cli/commands/watch-pr.ts";
import { err, ok } from "../../../src/astack/result.ts";
import {
	type CliRuntime,
	main,
	parseWatchArgs,
} from "../../../src/astack/watch-pr/cli.ts";
import {
	renderJson,
	renderPretty,
} from "../../../src/astack/watch-pr/render.ts";
import {
	type GitHubReader,
	parsePrNumber,
	type WatcherVerdict,
} from "../../../src/astack/watch-pr/types.ts";
import { fakeReader, passingCheck } from "./fakes.ts";

const ROOT = join(import.meta.dir, "../../..");
const SKILLS = "marketplace/plugins/astack/skills";

function testRuntime(reader: GitHubReader): {
	readonly runtime: CliRuntime;
	readonly stdout: string[];
	readonly stderr: string[];
} {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		runtime: {
			reader,
			clock: {
				now: () => 0,
				observedAt: () => "2026-07-26T00:00:00.000Z",
				async sleep() {
					throw new Error("test unexpectedly slept");
				},
			},
			stdout: (value) => stdout.push(value),
			stderr: (value) => stderr.push(value),
		},
	};
}

describe("parseWatchArgs", () => {
	test("uses the specified defaults", () => {
		expect(parseWatchArgs([])).toEqual(
			ok({
				kind: "watch",
				options: {
					owner: null,
					repo: null,
					pr: null,
					mode: "single",
					statusOnly: false,
					pretty: false,
					polling: {
						interval: 60,
						timeout: 0,
						maxQueryErrors: 5,
						allowDraft: false,
					},
				},
			}),
		);
	});

	test("parses each option, and a PR number with a #", () => {
		expect(
			parseWatchArgs([
				"--owner",
				"octo",
				"--repo",
				"hello",
				"--pr",
				"#7",
				"--interval=2.5",
				"--timeout",
				"0",
				"--max-query-errors",
				"3",
				"--allow-draft",
				"--status-only",
				"--pretty",
			]),
		).toEqual(
			ok({
				kind: "watch",
				options: {
					owner: "octo",
					repo: "hello",
					pr: parsePrNumber(7),
					mode: "single",
					statusOnly: true,
					pretty: true,
					polling: {
						interval: 2.5,
						timeout: 0,
						maxQueryErrors: 3,
						allowDraft: true,
					},
				},
			}),
		);
	});

	test.each([["--help"], ["-h"]])("reads %s as a help request", (flag) => {
		expect(parseWatchArgs([flag])).toEqual(ok({ kind: "help" }));
	});

	test.each([
		[
			"a zero interval",
			["--interval", "0"],
			"error: option '--interval <seconds>' argument '0' is invalid. must be greater than zero",
		],
		[
			"a negative timeout",
			["--timeout=-1"],
			"error: option '--timeout <seconds>' argument '-1' is invalid. must be zero or greater",
		],
		[
			"a fractional query-error budget",
			["--max-query-errors", "1.5"],
			"error: option '--max-query-errors <count>' argument '1.5' is invalid. must be a positive integer",
		],
		[
			"a PR number of zero",
			["--pr", "#0"],
			"error: option '--pr <number>' argument '#0' is invalid. must be a positive integer",
		],
	])("refuses %s", (_, argv, message) => {
		expect(parseWatchArgs(argv)).toEqual(err(message));
	});

	test.each([
		["an unknown flag", ["--unknown"], "'--unknown'"],
		["a value flag with no value", ["--interval"], "'--interval"],
		["a switch with a value", ["--pretty=yes"], "'--pretty'"],
		["a positional argument", ["42"], "'42'"],
	])("refuses %s with the parser message", (_, argv, quoted) => {
		const parsed = parseWatchArgs(argv);
		expect(parsed.ok).toBe(false);
		expect(parsed.ok ? "" : parsed.error).toStartWith("error: ");
		expect(parsed.ok ? "" : parsed.error).toContain(quoted);
	});

	test("[control:wp-text-commands] each astack watch-pr command of the skill texts and the README parses, with a number for each placeholder", () => {
		const commands = [
			"README.md",
			...readdirSync(join(ROOT, SKILLS), { recursive: true, encoding: "utf8" })
				.filter((path) => path.endsWith(".md"))
				.map((path) => join(SKILLS, path)),
		].flatMap((file) =>
			readFileSync(join(ROOT, file), "utf8")
				.split("\n")
				.flatMap((line, at) =>
					[...line.matchAll(/`astack watch-pr([^`]*)`/g)].map((match) => ({
						where: `${file}:${at + 1}`,
						argv: (match[1] ?? "")
							.replace(/[[\]]/g, " ")
							.replace(/<[^>]+>/g, "12")
							.split(/\s+/)
							.filter((arg) => arg !== ""),
					})),
				),
		);
		expect(commands.some(({ argv }) => argv.includes("--pr"))).toBe(true);
		expect(
			commands.flatMap(({ where, argv }) => {
				const parsed = parseWatchArgs(argv);
				return parsed.ok ? [] : [`${where}: ${parsed.error}`];
			}),
		).toEqual([]);
	});
});

describe("rendering", () => {
	const context = {
		owner: "owner",
		repo: "repo",
		number: parsePrNumber(1),
	};
	const status = {
		schemaVersion: 1,
		sequence: 1,
		observedAt: "2026-07-26T00:00:00.000Z",
		mode: "single",
		kind: "STATUS",
		terminal: true,
		exitCode: 0,
		reason: "status-only",
		rows: [
			{
				kind: "merged",
				context,
				facts: {
					context,
					mergeable: "MERGEABLE",
					mergeStateStatus: "CLEAN",
					reviewDecision: "APPROVED",
					headRefOid: "head",
					headRefName: "feature",
					baseRefName: "main",
					state: "MERGED",
					mergedAt: "now",
					isDraft: false,
				},
			},
		],
	} satisfies WatcherVerdict;

	test("emits compact valid JSON by default", () => {
		const rendered = renderJson(status);
		expect(rendered.endsWith("\n")).toBe(true);
		expect(JSON.parse(rendered)).toEqual(status);
	});

	test("renders the Markdown table from the same verdict only", () => {
		expect(renderPretty(status)).toBe(
			[
				"| PR | CI | Review | Merge |",
				"| --- | --- | --- | --- |",
				"| [#1](https://github.com/owner/repo/pull/1) | — | — | ✅ merged |",
				"",
			].join("\n"),
		);
	});
});

describe("main", () => {
	test("returns EX_USAGE 64 and writes a usage error only to stderr", async () => {
		const reader = fakeReader();
		const harness = testRuntime(reader);
		expect(await main(["--interval", "0"], harness.runtime)).toBe(64);
		expect(harness.stdout).toEqual([]);
		expect(harness.stderr).toEqual([
			"error: option '--interval <seconds>' argument '0' is invalid. must be greater than zero\n",
		]);
		expect(reader.calls).toEqual([]);
	});

	test("returns exit 4 for a hidden GitHub-side CI refusal", async () => {
		const reader = fakeReader({
			facts: { mergeStateStatus: "BLOCKED" },
			fastPath: { kind: "checks", checks: [passingCheck()] },
			commitRollups: [{ oid: "head", state: "FAILURE" }],
		});
		const harness = testRuntime(reader);
		const code = await main(
			["--owner", "owner", "--repo", "repo", "--pr", "1"],
			harness.runtime,
		);
		expect(code).toBe(4);
		expect(harness.stdout).toHaveLength(1);
		expect(JSON.parse(harness.stdout.join(""))).toMatchObject({
			kind: "BLOCKER",
			exitCode: 4,
			blocker: {
				kind: "failing-checks",
				ci: { kind: "ci-github-rejected" },
			},
		});
	});

	test.each([
		[
			"--pr 12",
			["--pr", "12"],
			'{"schemaVersion":1,"sequence":1,"observedAt":"2026-07-26T00:00:00.000Z","mode":"single","kind":"READY","terminal":true,"exitCode":0,"scope":{"kind":"single","pr":{"kind":"ready-pr","context":{"owner":"owner","repo":"repo","number":12},"proof":{"mergeability":"clear","threads":[],"ci":{"source":"gh-pr-checks","all":[{"kind":"passed","name":"ci","reportedState":"SUCCESS","description":"","link":"","workflow":""}],"hadPreviousPassingCi":false,"kind":"ci-clean","failed":[],"pending":[],"github":{"kind":"allowed","basis":"merge-state","mergeStateStatus":"CLEAN","headRollupState":"SUCCESS"}},"gate":{"state":"OPEN","reviewDecision":"APPROVED","draft":"not-draft"}}}}}\n',
		],
		[
			"--pr 12 --status-only",
			["--pr", "12", "--status-only"],
			'{"schemaVersion":1,"sequence":1,"observedAt":"2026-07-26T00:00:00.000Z","mode":"single","kind":"STATUS","terminal":true,"exitCode":0,"reason":"status-only","rows":[{"kind":"open","context":{"owner":"owner","repo":"repo","number":12},"facts":{"context":{"owner":"owner","repo":"repo","number":12},"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","reviewDecision":"APPROVED","headRefOid":"head","headRefName":"feature","baseRefName":"main","state":"OPEN","mergedAt":null,"isDraft":false},"threads":[],"ci":{"source":"gh-pr-checks","all":[{"kind":"passed","name":"ci","reportedState":"SUCCESS","description":"","link":"","workflow":""}],"hadPreviousPassingCi":false,"kind":"ci-clean","failed":[],"pending":[],"github":{"kind":"allowed","basis":"merge-state","mergeStateStatus":"CLEAN","headRollupState":"SUCCESS"}},"reviewAutomationRunning":false}]}\n',
		],
	])(
		"[control:wp-single-json] astack watch-pr %s on one ready PR prints the JSON line of trunk, byte for byte",
		async (_, argv, line) => {
			const harness = testRuntime(fakeReader());
			expect(await main(argv, harness.runtime)).toBe(0);
			expect(harness.stdout).toEqual([line]);
			expect(harness.stderr).toEqual([]);
		},
	);

	test("[control:wp-one-pr] each removed stack flag exits 64 with an unknown option error and no reader call, and the help, the usage and the summary name no stack mode", async () => {
		for (const argv of [
			["--stack"],
			["--queued-stack"],
			["--stack-prs", "3,4"],
			["--sweep-interval", "30"],
		]) {
			const reader = fakeReader();
			const harness = testRuntime(reader);
			expect(await main(argv, harness.runtime)).toBe(64);
			expect(harness.stdout).toEqual([]);
			expect(harness.stderr).toEqual([`error: Unknown option '${argv[0]}'\n`]);
			expect(reader.calls).toEqual([]);
		}
		const help = testRuntime(fakeReader());
		expect(await main(["--help"], help.runtime)).toBe(0);
		for (const text of [
			help.stdout.join(""),
			watchPrCommand.usage,
			watchPrCommand.summary,
		])
			expect(text).not.toMatch(/\b(?:stack|queue)/i);
	});

	test("shows help on stdout without touching the reader", async () => {
		const reader = fakeReader();
		const harness = testRuntime(reader);
		expect(await main(["--help"], harness.runtime)).toBe(0);
		const help = harness.stdout.join("");
		expect(help).toStartWith(
			"Usage: astack watch-pr [options]\n\nWatch one pull request.\nJSON (NDJSON while polling) is the default; --pretty renders human text.\n",
		);
		expect(help).toContain(
			"  --interval <seconds>        poll interval (default: 60)\n",
		);
		expect(harness.stderr).toEqual([]);
		expect(reader.calls).toEqual([]);
	});
});
