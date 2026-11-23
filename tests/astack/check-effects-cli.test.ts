import { afterAll, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { command } from "../../src/astack/cli/commands/check/effects.ts";
import type { Io } from "../../src/astack/cli/io.ts";
import { DEFAULT_CODE_ROOTS } from "../../src/astack/domain/profile.ts";
import { effectReport, findingLine } from "../../src/astack/domain/report.ts";
import { loadDomainEnv, planProfileFor } from "../../src/astack/plan/files.ts";
import { processPorts } from "../../src/astack/ports.ts";
import { git, scratchDir, writeFiles } from "./change-proof-fixture.ts";

const parent = scratchDir("astack-check-effects-");
afterAll(() => rmSync(parent, { recursive: true, force: true }));

const CARD = [
	"# Store",
	"",
	"## Contexts",
	"",
	"```domain",
	"context Store : src/**",
	"pure src/grant.ts",
	"```",
	"",
].join("\n");

const PLAN = [
	"# Store plan",
	"",
	"## Domain and effects",
	"",
	"```domain",
	"context Store",
	"abs  src/grant.ts: hides the grant, callers src/run.ts, deletion spreads 1, alt inline it",
	"```",
	"",
	"## Sessions",
	"",
	"### S1 Store the grant",
	"",
	"| # | Step | Files | Exit |",
	"|---|---|---|---|",
	"| 1 | Read the grant | src/grant.ts | The test passes |",
	"",
].join("\n");

function repo(name: string, files: Readonly<Record<string, string>>): string {
	const root = join(parent, name);
	git(parent, "init", "-q", name);
	writeFiles(root, files);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
	return root;
}

const root = repo("store", {
	"CONTEXT.md": CARD,
	"docs/plans/store.md": PLAN,
	"src/grant.ts":
		'import { writeFileSync } from "node:fs";\nexport const save = writeFileSync;\n',
	"src/run.ts":
		'import { save } from "./grant.ts";\nexport const run = save;\n',
});

type Run = {
	readonly code: number;
	readonly out: string;
	readonly err: string;
};

function effects(args: readonly string[], cwd = root): Run {
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

describe("astack check effects", () => {
	test("[control:check-effects-advice] it prints each finding and a count line, and exits 0", () => {
		expect(effects([])).toEqual({
			code: 0,
			out: "advice: src/grant.ts:1: pure: a pure line of CONTEXT.md names this module, but it has fs-read, fs-write (fs-read by node:fs, fs-write by node:fs writeFileSync)\neffects: 1 advice and 0 reports in 2 modules\n",
			err: "",
		});
	});

	test("with --base, a module that gains spawn and no block line of it gives advice with both class sets", () => {
		writeFileSync(
			join(root, "src/run.ts"),
			'import { save } from "./grant.ts";\nimport { spawnSync } from "node:child_process";\nexport const run = [save, spawnSync];\n',
		);
		try {
			const found = effects([
				"--plan",
				"docs/plans/store.md",
				"--base",
				"HEAD",
			]);
			expect(
				found.out.split("\n").filter((line) => line.includes(": change: ")),
			).toEqual([
				"advice: src/run.ts:2: change: the own classes change from none at the base to spawn, and no step link or cap port of the plan block names this module",
			]);
			expect(found.code).toBe(0);
		} finally {
			git(root, "checkout", "-q", "--", "src/run.ts");
		}
	});

	test("with totality off, as check proof reads it, an alias import gives no report", () => {
		const aliased = repo("aliased", {
			"CONTEXT.md": CARD,
			"src/c.ts": 'import { a } from "@/lib/a";\nexport const c = a;\n',
		});
		const ports = processPorts();
		const read = loadDomainEnv(
			ports,
			aliased,
			planProfileFor(ports, aliased).glossary,
		).card;
		const card = read.ok && read.value.kind === "card" ? read.value : undefined;
		if (card === undefined) throw new Error("no card");
		const lines = (totality: boolean) => {
			const report = effectReport({
				root: aliased,
				codeRoots: DEFAULT_CODE_ROOTS,
				card,
				plan: undefined,
				base: undefined,
				totality,
			});
			return report.ok ? report.value.findings.map(findingLine) : report;
		};
		expect({ proof: lines(false), cli: lines(true) }).toEqual({
			proof: [],
			cli: [
				"report: src/c.ts:1: import: the alias import @/lib/a names no module that the check can read, so it gives no class",
			],
		});
	});

	test("--json gives the same findings", () => {
		const found = effects(["--json"]);
		expect(JSON.parse(found.out)).toEqual({
			modules: 2,
			findings: [
				{
					kind: "advice",
					path: "src/grant.ts",
					line: 1,
					rule: "pure",
					message:
						"a pure line of CONTEXT.md names this module, but it has fs-read, fs-write (fs-read by node:fs, fs-write by node:fs writeFileSync)",
				},
			],
		});
	});

	test("with no card it prints one line and exits 0", () => {
		const bare = repo("bare", { "src/a.ts": "export const a = 1;\n" });
		expect(effects([], bare)).toEqual({
			code: 0,
			out: "effects: no contexts card, the domain fence under ## Contexts of the glossary, so no rule applies\n",
			err: "",
		});
	});

	test.each([
		[["--strict"], "astack check effects: unknown argument --strict\n"],
		[
			["--base", "no-such-ref"],
			"astack check effects: no-such-ref has no merge base with HEAD\n",
		],
		[
			["--plan", "docs/plans/none.md"],
			"astack check effects: cannot read the plan docs/plans/none.md\n",
		],
		[
			["--plan", "CONTEXT.md"],
			"astack check effects: CONTEXT.md needs one domain fence under ## Domain and effects, not 0\n",
		],
	])("%p exits 2", (args, message) => {
		expect(effects(args)).toEqual({ code: 2, out: "", err: message });
	});
});
