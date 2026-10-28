import { describe, expect, test } from "bun:test";
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
					stackPrs: [],
					statusOnly: false,
					pretty: false,
					polling: {
						interval: 60,
						sweepInterval: 300,
						timeout: 0,
						maxQueryErrors: 5,
						allowDraft: false,
					},
				},
			}),
		);
	});

	test("parses a frozen queued stack bottom-to-top", () => {
		expect(
			parseWatchArgs([
				"--owner",
				"octo",
				"--repo",
				"hello",
				"--queued-stack",
				"--stack-prs",
				"#10, 11,#12",
				"--interval=2.5",
				"--sweep-interval",
				"30",
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
					pr: null,
					mode: "queued-stack",
					stackPrs: [10, 11, 12].map((number) => parsePrNumber(number)),
					statusOnly: true,
					pretty: true,
					polling: {
						interval: 2.5,
						sweepInterval: 30,
						timeout: 0,
						maxQueryErrors: 3,
						allowDraft: true,
					},
				},
			}),
		);
	});

	test("reads --stack as the stack mode and a PR number with a #", () => {
		const parsed = parseWatchArgs(["--stack", "--pr", "#7"]);
		expect(
			parsed.ok && parsed.value.kind === "watch" ? parsed.value.options : null,
		).toMatchObject({ mode: "stack", pr: parsePrNumber(7) });
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
			"a negative sweep interval",
			["--sweep-interval=-1"],
			"error: option '--sweep-interval <seconds>' argument '-1' is invalid. must be greater than zero",
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
		[
			"a duplicate queued PR",
			["--queued-stack", "--stack-prs", "1,1"],
			"error: option '--stack-prs <n,...>' argument '1,1' is invalid. contains a duplicate PR",
		],
		[
			"both stack modes",
			["--stack", "--queued-stack"],
			"error: option '--stack' cannot be used with option '--queued-stack'",
		],
		[
			"a frozen queue without the queued mode",
			["--stack-prs", "1,2"],
			"error: --stack-prs requires --queued-stack",
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

	test("bypasses the queue machine for queued-stack status-only", async () => {
		const harness = testRuntime(fakeReader());
		const code = await main(
			[
				"--owner",
				"owner",
				"--repo",
				"repo",
				"--queued-stack",
				"--stack-prs",
				"1",
				"--status-only",
			],
			harness.runtime,
		);
		expect(code).toBe(0);
		expect(harness.stdout).toHaveLength(1);
		const line = harness.stdout.join("");
		expect(JSON.parse(line)).toMatchObject({
			kind: "STATUS",
			terminal: true,
			exitCode: 0,
			mode: "queued-stack",
		});
		expect(line).not.toContain('"kind":"QUEUE"');
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

	test("shows help on stdout without touching the reader", async () => {
		const reader = fakeReader();
		const harness = testRuntime(reader);
		expect(await main(["--help"], harness.runtime)).toBe(0);
		const help = harness.stdout.join("");
		expect(help).toStartWith(
			"Usage: astack watch-pr [options]\n\nWatch one pull request, a connected stack, or an immutable queued stack.\nJSON (NDJSON while polling) is the default; --pretty renders human text.\n",
		);
		expect(help).toContain(
			"  --stack-prs <n,...>         frozen bottom-to-top queue (queued mode only)\n",
		);
		expect(help).toContain(
			"  --interval <seconds>        poll interval (default: 60)\n",
		);
		expect(harness.stderr).toEqual([]);
		expect(reader.calls).toEqual([]);
	});
});
