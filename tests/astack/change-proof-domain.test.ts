import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseChangeProof } from "../../src/astack/change-proof/contract.ts";
import { heavyTestTimeout } from "../heavy-test.ts";
import {
	git,
	LADDER_FILES,
	PLAN_BLOCK,
	PLAN_FILES,
	PLAN_RECORD,
	planProofRepo,
	planRecordProof,
	planText,
	scratchDir,
	validProof,
} from "./change-proof-fixture.ts";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = scratchDir("astack-change-proof-domain-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function proof(cwd: string): { code: number | null; out: string } {
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? homedir(),
	};
	for (const name of ["ASTACK_TLC_JAR", "XDG_CACHE_HOME", "JAVA_HOME"]) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	const run = spawnSync(process.execPath, [CLI, "check", "proof"], {
		cwd,
		encoding: "utf8",
		env,
	});
	return { code: run.status, out: run.stdout };
}

const firstLine = (text: string): string => text.split("\n")[0] ?? "";
const lastLine = (text: string): string =>
	text.trimEnd().split("\n").at(-1) ?? "";

describe("a manifest that cites a plan record", () => {
	test(
		"[control:proof-plan-record] a manifest with domain.plan and no category is admitted",
		() => {
			const repo = planProofRepo(scratch);
			const run = proof(repo.root);
			expect({
				code: run.code,
				last: lastLine(run.out).split(" at ")[0],
			}).toEqual({
				code: 0,
				last: "ok: proof gate-admission admitted",
			});
		},
		heavyTestTimeout,
	);

	test.each<[string, Readonly<Record<string, string>>, string]>([
		[
			"a linked step whose type differs from its line",
			{
				"src/gate.ts": (PLAN_FILES["src/gate.ts"] ?? "")
					.replace(
						"parseGate(text: Text): Gate {",
						"parseGate(text: Text): Gate[] {",
					)
					.replace(
						"return { fresh: text === 'fresh' };",
						"return [{ fresh: text === 'fresh' }];",
					),
			},
			`stop: proof category: the tsc witness fails: ${PLAN_RECORD}:9: step parseGate output: Type '{ readonly linked: Gate[]; readonly declared: Gate; }' does not satisfy the constraint 'true'.; ${PLAN_RECORD}:11: flow admit parseGate >=> admitGate (Gate): Type '{ readonly gives: Gate[]; readonly takes: Gate; }' does not satisfy the constraint 'true'.`,
		],
		[
			"an unlinked step",
			{
				[PLAN_RECORD]: planText().replace(
					"src/gate.ts#parseGate",
					"src/gate.ts",
				),
			},
			`stop: proof category: ${PLAN_RECORD}:9: step parseGate needs one Files cell <module>#parseGate`,
		],
		[
			"a prop law whose control no links row lists",
			{
				[PLAN_RECORD]: planText(
					PLAN_BLOCK.replace("check: prop C1", "check: prop C9"),
				),
			},
			`stop: proof category: ${PLAN_RECORD}:12: law L1 cites control:C9, which no matrix links row lists`,
		],
		[
			"a tla law in a repo with no registry",
			{
				[PLAN_RECORD]: planText(
					PLAN_BLOCK.replace("check: prop C1", "check: tla Gate.Nope").replace(
						"rung R3",
						"rung R4",
					),
				),
			},
			`stop: proof category: ${PLAN_RECORD}:12: law L1 checks tla Gate.Nope, but the repo has no formal/models.json`,
		],
		[
			"a tla law whose invariant the registry does not hold",
			{
				...LADDER_FILES,
				[PLAN_RECORD]: planText(
					PLAN_BLOCK.replace("check: prop C1", "check: tla Gate.Nope").replace(
						"rung R3",
						"rung R4",
					),
				),
			},
			`stop: proof category: ${PLAN_RECORD}:12: law L1 checks tla Gate.Nope, which formal/models.json does not hold`,
		],
		[
			"a context that the card does not hold",
			{
				[PLAN_RECORD]: planText(
					PLAN_BLOCK.replace("context Gate", "context Desk"),
				),
			},
			'stop: proof domain: domain.context "Gate" is not the context Desk of the plan block',
		],
	])(
		"[control:proof-plan-record-stops] %s stops",
		(_name, files, stop) => {
			const repo = planProofRepo(scratch, () => {}, {
				...PLAN_FILES,
				...files,
			});
			const run = proof(repo.root);
			expect({ code: run.code, first: firstLine(run.out) }).toEqual({
				code: 1,
				first: stop,
			});
		},
		heavyTestTimeout,
	);

	test.each<[string, (outside: string) => string]>([
		["a parent path", () => "../outside.ts"],
		["an absolute path", (outside) => outside],
		["a symlink to a file outside the repo", () => "src/link.ts"],
	])(
		"[control:proof-plan-record-outside] a linked module at %s stops at category",
		(_name, linked) => {
			const outside = join(scratch, "outside.ts");
			writeFileSync(outside, PLAN_FILES["src/gate.ts"] ?? "");
			const module = linked(outside);
			const repo = planProofRepo(scratch, () => {}, {
				...PLAN_FILES,
				[PLAN_RECORD]: planText().replace(
					"src/gate.ts#parseGate",
					`${module}#parseGate`,
				),
			});
			if (module === "src/link.ts") {
				symlinkSync(outside, join(repo.root, module));
				git(repo.root, "add", module);
				git(repo.root, "commit", "-q", "-m", "link");
			}
			const run = proof(repo.root);
			expect({ code: run.code, first: firstLine(run.out) }).toEqual({
				code: 1,
				first: `stop: proof category: the plan record links ${module}, which is not a regular file inside the repo`,
			});
		},
		heavyTestTimeout,
	);

	test(
		"[control:proof-effects-advice] each effects finding prints as an advice line, and the exit and the verdict equal those of a tree with no finding",
		() => {
			const stamped = {
				...PLAN_FILES,
				"src/gate.ts": `${PLAN_FILES["src/gate.ts"] ?? ""}export const stamp = (): number => Date.now();\n`,
			};
			const run = (files: Readonly<Record<string, string>>) => {
				const out = proof(planProofRepo(scratch, () => {}, files).root);
				return {
					code: out.code,
					last: lastLine(out.out).split(" at ")[0],
					advice: out.out
						.split("\n")
						.filter((line) => line.startsWith("advice:")),
				};
			};
			const pure = (text: string | undefined): string =>
				(text ?? "").replace(
					"context Gate : src/**\n",
					"context Gate : src/**\npure src/gate.ts\n",
				);
			expect({
				clean: run(PLAN_FILES),
				advised: run({ ...stamped, "CONTEXT.md": pure(stamped["CONTEXT.md"]) }),
			}).toEqual({
				clean: {
					code: 0,
					last: "ok: proof gate-admission admitted",
					advice: [],
				},
				advised: {
					code: 0,
					last: "ok: proof gate-admission admitted",
					advice: [
						"advice: src/gate.ts:10: pure: a pure line of CONTEXT.md names this module, but it has clock (clock by Date.now)",
						"advice: src/gate.ts:10: step: step parseGate allows none by its row, but its module has clock (clock by Date.now)",
						"advice: src/gate.ts:10: step: step admitGate allows none by its row, but its module has clock (clock by Date.now)",
					],
				},
			});
		},
		heavyTestTimeout,
	);

	test("[control:proof-plan-record-schema] a manifest needs domain.plan or category, and not both", () => {
		const both = {
			...planRecordProof(validProof("a".repeat(40))),
			category: validProof("a".repeat(40)).category,
		};
		const { category: _category, ...neither } = validProof("a".repeat(40));
		expect([
			parseChangeProof(JSON.stringify(both)),
			parseChangeProof(JSON.stringify(neither)),
		]).toEqual([
			{
				ok: false,
				error: {
					stage: "schema",
					message:
						"category must be absent, because domain.plan cites a plan record",
				},
			},
			{
				ok: false,
				error: {
					stage: "schema",
					message: "category or domain.plan must be present",
				},
			},
		]);
	});
});
