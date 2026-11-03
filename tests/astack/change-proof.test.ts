import { describe, expect, test } from "bun:test";
import { PUBLIC_REPO } from "../../scripts/dist/build.ts";
import {
	type AdmissionFacts,
	admitChangeProof,
	type FileRead,
	type ModelEvidence,
	type Snapshot,
} from "../../src/astack/change-proof/admission.ts";
import {
	type ChangeProof,
	parseChangeProof,
} from "../../src/astack/change-proof/contract.ts";
import { proofGateIssues } from "../../src/astack/change-proof/profile.ts";
import {
	judgeNegative,
	judgePositive,
	type RunEnd,
} from "../../src/astack/change-proof/tlc.ts";
import { ok } from "../../src/astack/result.ts";
import { PROOF_FILES, type Proof, validProof } from "./change-proof-fixture.ts";

const BASE = "a".repeat(40);

function parsed(edit: (proof: Proof) => void = () => {}) {
	const proof = validProof(BASE);
	edit(proof);
	return parseChangeProof(JSON.stringify(proof));
}

function validChangeProof(): ChangeProof {
	const result = parsed();
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

describe("parseChangeProof", () => {
	test.each<[string, (proof: Proof) => void, string]>([
		[
			"arrows whose endpoints do not meet",
			(p) => {
				p.category.composites = [{ arrows: ["admit", "parse"], op: ">=>" }];
			},
			"arrows admit and parse do not compose: admit ends at Admitted, parse starts at Text",
		],
		[
			"a pure carrier that claims a monad law",
			(p) => {
				p.category.carrier = { kind: "pure" };
				p.category.composites = [{ arrows: ["admit", "parse"], op: "o" }];
			},
			"carrier pure cannot claim monad-left",
		],
		[
			"a result carrier with a monad law marked not applicable",
			(p) => {
				p.category.laws[7] = {
					law: "monad-assoc",
					status: "not_applicable",
					reason: "it looks fine",
				};
			},
			"carrier result needs a witness for monad-assoc",
		],
		[
			"a Kleisli composite under an artifact carrier",
			(p) => {
				p.category.carrier = { kind: "artifact", contract: "the gate text" };
			},
			"composite parse >=> admit uses >=>, but carrier artifact composes with o",
		],
		[
			"a functor claim with one law",
			(p) => {
				p.category.laws[3] = {
					law: "functor-id",
					status: "witnessed",
					witness: "control:C1",
				};
			},
			"a functor claim needs witnesses for both functor-id and functor-comp",
		],
	])(
		"[control:proof-category-arrows] %s is a category rejection",
		(_name, edit, message) => {
			expect(parsed(edit)).toEqual({
				ok: false,
				error: { stage: "category", message },
			});
		},
	);
});

const VIEW_FILES = new Map<string, FileRead>(
	Object.entries(PROOF_FILES).map(([path, text]) => [
		path,
		{ kind: "text", text },
	]),
);
const CHANGED = [...Object.keys(PROOF_FILES), ".astack/proof.json"].map(
	(path) => ({ path, present: true }),
);
const COUNTS = { generated: 6, distinct: 4, queued: 0 };
const EVIDENCE: ModelEvidence = {
	positive: ok(COUNTS),
	negative: ok({ name: "AdmitFresh", states: 3 }),
	restored: ok(COUNTS),
};
const SNAPSHOT: Snapshot = {
	head: "b".repeat(40),
	digest: `sha256:${"c".repeat(64)}`,
	files: 13,
};

function facts(
	after: Snapshot,
	evidence: ModelEvidence = EVIDENCE,
): AdmissionFacts {
	return {
		view: { files: VIEW_FILES, modelFiles: VIEW_FILES, changed: CHANGED },
		before: SNAPSHOT,
		after,
		evidence,
	};
}

describe("admitChangeProof", () => {
	test("admits fresh evidence with unchanged inputs", () => {
		expect(admitChangeProof(validChangeProof(), facts(SNAPSHOT))).toEqual(
			ok({
				change: "gate-admission",
				base: BASE,
				head: SNAPSHOT.head,
				digest: SNAPSHOT.digest,
				files: 13,
				positive: COUNTS,
				negative: { name: "AdmitFresh", states: 3 },
				action: "Admit",
				restored: COUNTS,
			}),
		);
	});

	test("[control:proof-stale-digest] rejects evidence when the input digest changed during the runs", () => {
		const stale = { ...SNAPSHOT, digest: `sha256:${"d".repeat(64)}` };
		expect(admitChangeProof(validChangeProof(), facts(stale))).toEqual({
			ok: false,
			error: {
				stage: "stale",
				message: `the candidate inputs changed during the proof: digest ${SNAPSHOT.digest} became ${stale.digest}`,
			},
		});
	});

	test("[control:proof-restored-run] rejects a restored run whose counts differ from the positive run", () => {
		const evidence = { ...EVIDENCE, restored: ok({ ...COUNTS, distinct: 5 }) };
		expect(
			admitChangeProof(validChangeProof(), facts(SNAPSHOT, evidence)),
		).toEqual({
			ok: false,
			error: {
				stage: "model",
				message:
					"the restored run found other state counts than the positive run",
			},
		});
	});
});

const record = (code: number, severity: number, body: string): string =>
	`@!@!@STARTMSG ${code}:${severity} @!@!@\n${body}\n@!@!@ENDMSG ${code} @!@!@\n`;

const POSITIVE_OUTPUT = [
	record(
		2187,
		0,
		"Running breadth-first search Model-Checking with seed 1 with 1 worker",
	),
	record(2192, 0, "Checking temporal properties for the complete state space"),
	record(2267, 0, "Finished checking temporal properties"),
	record(2193, 0, "Model checking completed. No error has been found."),
	record(
		2199,
		0,
		"6 states generated, 4 distinct states found, 0 states left on queue.",
	),
	record(2186, 0, "Finished in 1s"),
].join("");

const exited = (code: number, stdout: string): RunEnd => ({
	kind: "exited",
	code,
	stdout,
	stderr: "",
});

describe("TLC output judges, from parser fixtures only", () => {
	test.each<[string, RunEnd, boolean, string | undefined]>([
		["a complete temporal run", exited(0, POSITIVE_OUTPUT), true, undefined],
		[
			"a run with no success record",
			exited(
				0,
				POSITIVE_OUTPUT.replace(
					record(2193, 0, "Model checking completed. No error has been found."),
					"",
				),
			),
			false,
			"the positive run has no single success record 2193",
		],
		[
			"a run with a warning",
			exited(
				0,
				`${record(2401, 3, "use the parallel collector")}${POSITIVE_OUTPUT}`,
			),
			false,
			"the positive run printed warning 2401",
		],
		[
			"a temporal claim with no temporal check",
			exited(
				0,
				POSITIVE_OUTPUT.replace(
					record(2267, 0, "Finished checking temporal properties"),
					"",
				),
			),
			true,
			"the positive run has no single temporal check completion record 2267",
		],
		[
			"a truncated record",
			exited(0, POSITIVE_OUTPUT.slice(0, -25)),
			false,
			"the positive run printed malformed output: record 2186 has no end",
		],
	])(
		"[control:proof-output-protocol] judgePositive: %s",
		(_name, end, temporal, problem) => {
			expect(judgePositive("positive", end, temporal)).toEqual(
				problem === undefined
					? ok({ generated: 6, distinct: 4, queued: 0 })
					: { ok: false, error: problem },
			);
		},
	);

	test("judgeNegative accepts a temporal violation with exit 13, record 2116 and a counterexample", () => {
		const output = [
			record(2116, 1, "Temporal properties were violated."),
			record(2264, 1, "The following behavior constitutes a counter-example:"),
			record(2217, 4, "1: <Initial predicate>"),
			record(2218, 4, "2: Stuttering"),
			record(2186, 0, "Finished in 1s"),
		].join("");
		expect(
			judgeNegative(exited(13, output), { kind: "temporal", name: "Ends" }),
		).toEqual(ok({ name: "Ends", states: 2 }));
	});
});

const PROOF_COMMAND = "astack check proof --base origin/main";

describe("proofGateIssues", () => {
	test("accepts the pinned GitHub CLI form that the distribution emits", () => {
		expect(
			proofGateIssues({
				gates: [
					{
						name: "change-proof",
						command: `bunx github:${PUBLIC_REPO}#v0.2.0 check proof`,
					},
				],
			}),
		).toEqual([]);
	});
	test.each<
		[
			string,
			readonly Readonly<Record<string, unknown>>[],
			readonly { path: string; message: string }[],
		]
	>([
		[
			"a direct proof gate",
			[{ name: "change-proof", command: PROOF_COMMAND }],
			[],
		],
		[
			"a pinned bunx proof gate with an empty when_changed",
			[
				{
					name: "change-proof",
					command: `bunx github:${PUBLIC_REPO}#v0.2.0 check-proof .astack/proof.json`,
					when_changed: [],
				},
			],
			[],
		],
		[
			"an optional proof gate",
			[{ name: "change-proof", command: PROOF_COMMAND, optional: true }],
			[
				{
					path: "gates[1].optional",
					message: "must be false, because every change needs a checked proof",
				},
			],
		],
		[
			"a narrow proof gate",
			[
				{
					name: "change-proof",
					command: PROOF_COMMAND,
					when_changed: ["src/**"],
				},
			],
			[
				{
					path: "gates[1].when_changed",
					message:
						"must be absent or empty, because the proof gate covers every path",
				},
			],
		],
		[
			"a suppressed proof gate",
			[{ name: "change-proof", command: `${PROOF_COMMAND} || true` }],
			[
				{
					path: "gates[1].command",
					message:
						"must be one direct astack check proof command, with no &&, ||, ;, pipe or second command",
				},
			],
		],
		[
			"a summary in place of a proof",
			[{ name: "change-proof", command: "astack check proof --summary" }],
			[
				{
					path: "gates[1].command",
					message: "passes --summary, which the proof gate does not allow",
				},
			],
		],
		[
			"a printf in place of a proof",
			[{ name: "change-proof", command: "printf 'ok: proof done\\n'" }],
			[
				{
					path: "gates[1].command",
					message:
						"must start with astack, a path to its launcher, bun or node with its CLI, or bunx or npx with a pinned GitHub astack release or commit",
				},
			],
		],
		[
			"a profile with no proof gate",
			[],
			[
				{
					path: "gates",
					message:
						"needs one gate named change-proof that runs astack check proof",
				},
			],
		],
	])("[control:proof-profile-gate] %s", (_name, gates, issues) => {
		expect(
			proofGateIssues({
				gates: [{ name: "lint", command: "bun run lint" }, ...gates],
			}),
		).toEqual(issues);
	});
});
