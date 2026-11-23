import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { command } from "../../src/astack/cli/commands/check/adr.ts";
import type { Io } from "../../src/astack/cli/io.ts";
import { git, scratchDir, writeFiles } from "./change-proof-fixture.ts";

const parent = scratchDir("astack-check-adr-");
afterAll(() => rmSync(parent, { recursive: true, force: true }));

const ALPHA = "docs/adr/0001-alpha-holds.md";

const NEW_ADR = [
	"# 0002. Exports stream rows",
	"",
	"Status: Accepted",
	"Date: 2026-11-05",
	"Supersedes: none",
	"Amends: none",
	"",
	"## Context",
	"",
	"Exports build the file in memory.",
	"",
	"## Decisions",
	"",
	"### D1. Exports write each row as the query returns it",
	"",
	"Text.",
	"",
	"## Domain and effects",
	"",
	"",
	"Terms. Export",
	"",
	"```domain",
	"context Billing",
	"agg  Export @ src/export.ts: ExportState",
	"inv  EX1 Export: an export sends each row once",
	"law  L1 EX1 each row reaches the response once   check: prop export-rows-once",
	"rung R3",
	"```",
	"",
	"## Consequences",
	"",
	"Memory stays flat.",
	"",
	"## Alternatives considered",
	"",
	"- Build the file in memory. Rejected because it used 3 GB.",
	"",
].join("\n");

const ALPHA_TEXT = [
	"# 0001. Alpha holds",
	"",
	"Status: Accepted",
	"Date: 2026-11-01",
	"Supersedes: none",
	"",
	"## Decisions",
	"",
	"### D4. Adoption keeps review",
	"",
	"Review stays required.",
	"",
].join("\n");

const INDEX = [
	"# Architecture decision records",
	"",
	"| Number | Title | Status |",
	"|---|---|---|",
	"| [0001](0001-alpha-holds.md) | Alpha holds | Accepted |",
	"",
].join("\n");

function repo(name: string): { root: string; base: string } {
	const root = join(parent, name);
	git(parent, "init", "-q", "-b", "main", name);
	writeFiles(root, { [ALPHA]: ALPHA_TEXT, "docs/adr/README.md": INDEX });
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
	return { root, base: git(root, "rev-parse", "HEAD") };
}

type Run = {
	readonly code: number;
	readonly out: string;
	readonly err: string;
};

function adr(args: readonly string[], cwd: string): Run {
	let out = "";
	let err = "";
	const io: Io = {
		out: (text) => {
			out += text;
		},
		err: (text) => {
			err += text;
		},
		cwd,
		env: {},
		today: "2026-11-23",
		now: new Date(0),
		scriptPath: undefined,
	};
	return { code: command.run(args, io), out, err };
}

describe("astack check adr", () => {
	test("[control:adr-cli] in a repo with no profile, an in-place edit of an Accepted decision exits 1, a dated note exits 0, and a bad --base exits 1 with the ref", () => {
		const { root, base } = repo("plain");
		expect(existsSync(join(root, ".astack/profile.json"))).toBe(false);
		writeFileSync(
			join(root, ALPHA),
			ALPHA_TEXT.replace(
				"Review stays required.",
				"Review stays required.\nThe CI classifier can admit the manifest.",
			),
		);
		const short = base.slice(0, 12);
		expect(adr(["--base", "main"], root)).toEqual({
			code: 1,
			out: `${ALPHA}:12: ADR 0001 is Accepted at the base, so it changes only by a dated > Note or > Amended block, a status line or its Amended by: line\nadr: 1 problem in 1 ADR file, from the merge base ${short} of main\n`,
			err: "",
		});
		writeFileSync(
			join(root, ALPHA),
			ALPHA_TEXT.replace(
				"Review stays required.",
				"Review stays required.\n\n> Note 2026-11-23: The CI classifier can admit the manifest.",
			),
		);
		expect(adr(["--base", "main"], root)).toEqual({
			code: 0,
			out: `adr: 0 problems in 1 ADR file, from the merge base ${short} of main\n`,
			err: "",
		});
		expect(adr(["--base", "no-such-ref"], root)).toEqual({
			code: 1,
			out: "",
			err: "astack check adr: git cannot read the base no-such-ref\n",
		});
	});

	test("with no --base, the index and relation rules run and the output names the two rules that it skipped", () => {
		const { root } = repo("tree");
		expect(adr([], root)).toEqual({
			code: 0,
			out: "adr: 0 problems in 1 ADR file; with no --base, the amend-only and template rules did not run\n",
			err: "",
		});
		writeFileSync(
			join(root, "docs/adr/README.md"),
			INDEX.replace("| Alpha holds |", "| Alpha |"),
		);
		expect(adr([], root).code).toBe(1);
	});

	test("[control:adr-cli-template] with --base, a new ADR reads its Terms. from CONTEXT.md, its context from the card and its controls from tests/", () => {
		const { root } = repo("template");
		writeFiles(root, {
			"CONTEXT.md": [
				"# Billing",
				"",
				"## Contexts",
				"",
				"```domain",
				"context Billing : src/**",
				"```",
				"",
				"## Language",
				"",
				"### Export",
				"",
				"A file of rows.",
				"",
			].join("\n"),
			"tests/export.test.ts": `test("${["[control", "export-rows-once]"].join(":")} rows", () => {});\n`,
			"docs/adr/README.md": `${INDEX}| [0002](0002-exports-stream-rows.md) | Exports stream rows | Accepted |\n`,
			"docs/adr/0002-exports-stream-rows.md": NEW_ADR,
		});
		git(root, "add", "-A");
		expect(adr(["--base", "main"], root).code).toBe(0);
		writeFileSync(
			join(root, "docs/adr/0002-exports-stream-rows.md"),
			NEW_ADR.replace("Terms. Export", "Terms. Invoice"),
		);
		expect(adr(["--base", "main"], root).out.split("\n")[0]).toBe(
			'docs/adr/0002-exports-stream-rows.md:21: Terms. names "Invoice", which CONTEXT.md does not define',
		);
	});

	test.each([
		[["--bogus"], "astack check adr: unknown argument --bogus\n"],
		[["--base"], "astack check adr: --base needs a value\n"],
	])("%j is a usage error", (args, message) => {
		const { root } = repo(`usage${args.join("")}`);
		const run = adr(args, root);
		expect([run.code, run.err.split("\n")[0]]).toEqual([2, message.trimEnd()]);
	});
});
