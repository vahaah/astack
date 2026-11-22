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
import { andThen, err, map, ok } from "../../src/astack/result.ts";
import {
	marker,
	PROOF_FILES,
	type Proof,
	validProof,
} from "./change-proof-fixture.ts";

const BASE = "a".repeat(40);
const DIFF_BASE = "e".repeat(40);

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

const lawNames = (edit: (proof: Proof) => void) =>
	map(parsed(edit), (proof) =>
		proof.category.laws.map((row): string => row.law),
	);

const dropLaws =
	(...laws: readonly string[]) =>
	(proof: Proof) => {
		proof.category.laws = proof.category.laws.filter(
			(row) => !laws.includes(row.law ?? ""),
		);
	};

describe("law claims", () => {
	test("[control:proof-law-claimed] a manifest lists the laws that it claims or needs, and the eight-row form still parses", () => {
		const needed = [
			"id-left",
			"id-right",
			"assoc",
			"monad-left",
			"monad-right",
			"monad-assoc",
		];
		expect(lawNames(dropLaws("functor-id", "functor-comp"))).toEqual(
			ok(needed),
		);
		expect(lawNames(() => {})).toEqual(
			ok([
				"id-left",
				"id-right",
				"assoc",
				"functor-id",
				"functor-comp",
				"monad-left",
				"monad-right",
				"monad-assoc",
			]),
		);
		expect(lawNames(dropLaws("monad-assoc"))).toEqual(
			err({
				stage: "category",
				message: "carrier result needs a witness for monad-assoc",
			}),
		);
		expect(lawNames(dropLaws("assoc"))).toEqual(
			err({
				stage: "category",
				message:
					"category law assoc applies to the declared composites, so it needs a witness",
			}),
		);
		const modelWitnessed = parsed((proof) => {
			dropLaws("functor-id", "functor-comp")(proof);
			proof.category.laws = proof.category.laws.map((row) => ({
				law: row.law ?? "",
				status: "witnessed",
				witness: "model:AdmitFresh",
			}));
		});
		expect(
			map(
				andThen(modelWitnessed, (proof) =>
					admitChangeProof(proof, facts(SNAPSHOT)),
				),
				(admitted) => admitted.change,
			),
		).toEqual(ok("gate-admission"));
	});

	test("[control:proof-monoid-pair] a monoid claim needs both of its witnesses", () => {
		const claim =
			(...laws: readonly string[]) =>
			(proof: Proof) => {
				proof.category.laws.push(
					...laws.map((law) => ({
						law,
						status: "witnessed",
						witness: "control:C1",
					})),
				);
			};
		expect(lawNames(claim("monoid-id"))).toEqual(
			err({
				stage: "category",
				message:
					"a monoid claim needs witnesses for both monoid-id and monoid-assoc",
			}),
		);
		expect(lawNames(claim("monoid-assoc"))).toEqual(
			err({
				stage: "category",
				message:
					"a monoid claim needs witnesses for both monoid-id and monoid-assoc",
			}),
		);
		expect(
			map(parsed(claim("monoid-id", "monoid-assoc")), (proof) =>
				proof.category.laws.slice(-2),
			),
		).toEqual(
			ok([
				{
					law: "monoid-id",
					status: "witnessed",
					witness: { kind: "control", id: "C1" },
				},
				{
					law: "monoid-assoc",
					status: "witnessed",
					witness: { kind: "control", id: "C1" },
				},
			]),
		);
	});
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
const VIOLATION = {
	name: "AdmitFresh",
	states: 3,
	trace: "1: <Initial predicate>",
};
const EVIDENCE: ModelEvidence = {
	positive: ok(COUNTS),
	negative: ok(VIOLATION),
	restored: ok(COUNTS),
};
const SNAPSHOT: Snapshot = {
	head: "b".repeat(40),
	digest: `sha256:${"c".repeat(64)}`,
	files: 13,
	index: "1".repeat(64),
	history: "2".repeat(64),
	entries: new Map(
		Array.from({ length: 13 }, (_, at) => [
			`src/file-${String(at).padStart(2, "0")}.ts`,
			`file 100644 ${"3".repeat(64)}`,
		]),
	),
};

function changedEntries(count: number): Snapshot {
	const entries = new Map(SNAPSHOT.entries);
	for (const path of [...entries.keys()].slice(0, count))
		entries.set(path, `file 100644 ${"4".repeat(64)}`);
	return { ...SNAPSHOT, digest: `sha256:${"d".repeat(64)}`, entries };
}

function facts(
	after: Snapshot,
	evidence: ModelEvidence = EVIDENCE,
): AdmissionFacts {
	return {
		view: {
			base: { manifest: BASE, diff: DIFF_BASE },
			files: VIEW_FILES,
			modelFiles: VIEW_FILES,
			changed: CHANGED,
		},
		before: SNAPSHOT,
		after,
		evidence,
	};
}

function admitAdr(adr: string) {
	const original = facts(SNAPSHOT);
	const files = new Map(original.view.files);
	files.set("docs/adr/0001-gate.md", { kind: "text", text: adr });
	return admitChangeProof(validChangeProof(), {
		...original,
		view: { ...original.view, files },
	});
}

describe("ADR format admission", () => {
	const adr = PROOF_FILES["docs/adr/0001-gate.md"];
	if (adr === undefined) throw new Error("the ADR fixture is missing");

	test.each(["docs PR", "B01"])(
		"[control:proof-adr-format] accepts bold metadata and a numbered decision with a provenance stamp %s",
		(stamp) => {
			const native = adr
				.replace("Status: Accepted", `- **Status:** Accepted · ${stamp}`)
				.replace("### D1. ", "### D1 — ")
				.replace(
					"parseGate >=> admitGate preserves rejection.",
					"```text\nparseGate >=> admitGate preserves rejection.\n```",
				);
			expect(admitAdr(native)).toEqual(
				ok({
					change: "gate-admission",
					base: BASE,
					diffBase: DIFF_BASE,
					head: SNAPSHOT.head,
					digest: SNAPSHOT.digest,
					files: 13,
					positive: COUNTS,
					negative: VIOLATION,
					action: "Admit",
					restored: COUNTS,
				}),
			);
		},
	);

	test.each([
		["Proposed · lands B01", 'has status "Proposed · lands B01", not Accepted'],
		["AcceptedWhatever", 'has status "AcceptedWhatever", not Accepted'],
		["Accepted ·", 'has status "Accepted ·", not Accepted'],
	])("[control:proof-adr-status] refuses the status %s", (status, message) => {
		expect(
			admitAdr(adr.replace("Status: Accepted", `- **Status:** ${status}`)),
		).toEqual({
			ok: false,
			error: { stage: "domain", message: `docs/adr/0001-gate.md ${message}` },
		});
	});

	test("[control:proof-adr-duplicate] refuses conflicting metadata instead of selecting its first accepted value", () => {
		expect(
			admitAdr(
				adr.replace(
					"Status: Accepted",
					"Status: Accepted\n- **Status:** Proposed",
				),
			),
		).toEqual({
			ok: false,
			error: {
				stage: "domain",
				message: "docs/adr/0001-gate.md has multiple Status lines",
			},
		});
	});

	test("[control:proof-adr-examples] fenced metadata and headings cannot supply a missing decision", () => {
		const example =
			"~~~~text\nStatus: Accepted\n### D1. Example\n~~~\n```\n~~~~\n";
		const actual = adr.replace("### D1. ", "### D10. ");
		expect(admitAdr(`${example}\n${actual}`)).toEqual({
			ok: false,
			error: {
				stage: "domain",
				message: "docs/adr/0001-gate.md has no ### D1. decision heading",
			},
		});
	});
});

describe("admitChangeProof", () => {
	test("admits fresh evidence with unchanged inputs", () => {
		expect(admitChangeProof(validChangeProof(), facts(SNAPSHOT))).toEqual(
			ok({
				change: "gate-admission",
				base: BASE,
				diffBase: DIFF_BASE,
				head: SNAPSHOT.head,
				digest: SNAPSHOT.digest,
				files: 13,
				positive: COUNTS,
				negative: VIOLATION,
				action: "Admit",
				restored: COUNTS,
			}),
		);
	});

	test("[control:proof-stale-digest] rejects evidence when an input file changed during the runs, and names it", () => {
		expect(
			admitChangeProof(validChangeProof(), facts(changedEntries(1))),
		).toEqual({
			ok: false,
			error: {
				stage: "stale",
				message:
					"the candidate inputs changed during the proof: src/file-00.ts",
			},
		});
	});

	test.each<[string, Snapshot, string]>([
		[
			"eleven changed paths",
			changedEntries(11),
			"src/file-00.ts, src/file-01.ts, src/file-02.ts, src/file-03.ts, src/file-04.ts, src/file-05.ts, src/file-06.ts, src/file-07.ts, src/file-08.ts, src/file-09.ts and 1 more",
		],
		[
			"ten changed paths",
			changedEntries(10),
			"src/file-00.ts, src/file-01.ts, src/file-02.ts, src/file-03.ts, src/file-04.ts, src/file-05.ts, src/file-06.ts, src/file-07.ts, src/file-08.ts, src/file-09.ts",
		],
		[
			"a removed path",
			{
				...SNAPSHOT,
				entries: new Map(
					[...SNAPSHOT.entries].filter(([path]) => path !== "src/file-12.ts"),
				),
			},
			"src/file-12.ts",
		],
		[
			"the index and the ratification history",
			{ ...SNAPSHOT, index: "5".repeat(64), history: "6".repeat(64) },
			"the ratification history, the index",
		],
	])(
		"[control:proof-stale-paths] a stale stop names %s",
		(_name, after, names) => {
			expect(admitChangeProof(validChangeProof(), facts(after))).toEqual({
				ok: false,
				error: {
					stage: "stale",
					message: `the candidate inputs changed during the proof: ${names}`,
				},
			});
		},
	);

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

describe("admission stops", () => {
	test("name every uncovered changed path and every idle scope row", () => {
		const proof = parsed((p) => {
			p.scope.push(
				{ path: "lib/**", obligation: "P1", modelRefs: ["Admit"] },
				{ path: "bin/*", obligation: "P1", modelRefs: ["Admit"] },
			);
		});
		if (!proof.ok) throw new Error(proof.error.message);
		const original = facts(SNAPSHOT);
		const changed = [
			...CHANGED,
			{ path: "notes/a.md", present: true },
			{ path: "notes/b.md", present: false },
		];
		expect(
			admitChangeProof(proof.value, {
				...original,
				view: { ...original.view, changed },
			}),
		).toEqual({
			ok: false,
			error: {
				stage: "controls",
				message:
					"no scope row covers the changed path notes/a.md; no scope row covers the changed path notes/b.md; scope row lib/** covers no changed path; scope row bin/* covers no changed path",
			},
		});
	});

	test("name every spec-drift finding of the matrix", () => {
		const original = facts(SNAPSHOT);
		const files = new Map(original.view.files);
		files.set("tests/gate.txt", {
			kind: "text",
			text: `${PROOF_FILES["tests/gate.txt"]}${["C2", "C3"].map((id) => `test ${marker("control", id)}\n`).join("")}`,
		});
		expect(
			admitChangeProof(validChangeProof(), {
				...original,
				view: { ...original.view, files },
			}),
		).toEqual({
			ok: false,
			error: {
				stage: "controls",
				message:
					".astack/matrix.json has 2 spec-drift findings: control C2 (tests/gate.txt) is linked by no criterion and has no exemption; control C3 (tests/gate.txt) is linked by no criterion and has no exemption",
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
	test.each<[string, RunEnd, readonly string[], string | undefined]>([
		[
			"a complete temporal run",
			exited(0, POSITIVE_OUTPUT),
			["Ends"],
			undefined,
		],
		[
			"a run with no success record",
			exited(
				0,
				POSITIVE_OUTPUT.replace(
					record(2193, 0, "Model checking completed. No error has been found."),
					"",
				),
			),
			[],
			"the positive run has no single success record 2193",
		],
		[
			"a run with a warning",
			exited(
				0,
				`${record(2401, 3, "use the parallel collector")}${POSITIVE_OUTPUT}`,
			),
			[],
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
			["Ends"],
			"the positive run has no single temporal check completion record 2267",
		],
		[
			"a truncated record",
			exited(0, POSITIVE_OUTPUT.slice(0, -25)),
			[],
			"the positive run printed malformed output: record 2186 has no end",
		],
	])(
		"[control:proof-output-protocol] judgePositive: %s",
		(_name, end, properties, problem) => {
			expect(judgePositive("positive", end, properties)).toEqual(
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
		).toEqual(
			ok({
				name: "Ends",
				states: 2,
				trace: "1: <Initial predicate>; 2: Stuttering",
			}),
		);
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
			"an ampersand in a quoted manifest path",
			[
				{
					name: "change-proof",
					command: 'astack check proof ".astack/a&b.json"',
				},
			],
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
			"a backgrounded proof gate",
			[{ name: "change-proof", command: `${PROOF_COMMAND} &` }],
			[
				{
					path: "gates[1].command",
					message: "must run the proof command in the foreground",
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
