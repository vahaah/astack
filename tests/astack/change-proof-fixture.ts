import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const marker = (kind: string, id: string): string => `[${kind}:${id}]`;

export const GATE_TLA = `---- MODULE Gate ----
EXTENDS Naturals
VARIABLES fresh, status
vars == <<fresh, status>>
Init == fresh = TRUE /\\ status = "open"
Expire == status = "open" /\\ fresh /\\ fresh' = FALSE /\\ UNCHANGED status
Admit == status = "open" /\\ fresh /\\ status' = "admitted" /\\ UNCHANGED fresh
Reject == status = "open" /\\ ~fresh /\\ status' = "rejected" /\\ UNCHANGED fresh
Done == status # "open" /\\ UNCHANGED vars
Next == Expire \\/ Admit \\/ Reject \\/ Done
Spec == Init /\\ [][Next]_vars /\\ WF_vars(Next)
TypeOK == fresh \\in BOOLEAN /\\ status \\in {"open", "admitted", "rejected"}
AdmitFresh == status = "admitted" => fresh
Ends == <>(status # "open")
====
`;

export const SLOW_GATE_TLA = GATE_TLA.replace(
	"VARIABLES fresh, status\nvars == <<fresh, status>>",
	"VARIABLES fresh, status, tick\nvars == <<fresh, status, tick>>",
)
	.replace(
		'Init == fresh = TRUE /\\ status = "open"',
		'Init == fresh = TRUE /\\ status = "open" /\\ tick = 0',
	)
	.replace("UNCHANGED status\n", "UNCHANGED <<status, tick>>\n")
	.replaceAll("UNCHANGED fresh\n", "UNCHANGED <<fresh, tick>>\n")
	.replace(
		"Next == Expire",
		"Tick == tick' = tick + 1 /\\ UNCHANGED <<fresh, status>>\nNext == Tick \\/ Expire",
	);

export const GATE_CFG =
	"SPECIFICATION Spec\nINVARIANTS TypeOK AdmitFresh\nPROPERTY Ends\n";

export type Files = Readonly<Record<string, string>>;

export const BASE_FILES: Files = {
	"README.md": "# Gate\n",
	"notes/old.md": "an old note\n",
};

export const PROOF_FILES: Files = {
	"CONTEXT.md":
		"# Gate admission\n\n## Language\n\n### Gate\n\nA gate admits a **Fresh input** only.\n",
	"docs/adr/0001-gate.md":
		"# 0001. Gate\n\nStatus: Accepted\n\n## Decisions\n\n### D1. Admit fresh input\n\nThe gate admits fresh input.\n\n#### Formal claim\n\nformal/Gate.tla checks AdmitFresh under formal/Gate.cfg.\n\n#### Category composition\n\nparseGate >=> admitGate preserves rejection.\n\n#### Implementation correspondence\n\nadmitGate maps to Admit.\n\n#### Verification\n\n.astack/matrix.json names the control.\n",
	"docs/adr/0002-old.md":
		"# 0002. Old gate\n\nStatus: Superseded by 0001\n\n## Decisions\n\n### D1. Admit any input\n\nOld text.\n",
	"spec/gate.md": `- ${marker("criterion", "P1")} the gate admits fresh input only\n`,
	"tests/gate.txt": `test ${marker("control", "C1")} admits fresh input\n`,
	".astack/matrix.json": `${JSON.stringify({
		version: 1,
		specs: ["spec/gate.md"],
		tests: ["tests/gate.txt"],
		links: [{ criterion: "P1", controls: ["C1"] }],
	})}\n`,
	"src/gate.ts":
		"export type Text = string;\nexport type Gate = { readonly fresh: boolean };\nexport type Admitted = { readonly gate: Gate };\nexport function parseGate(text: Text): Gate {\n\treturn { fresh: text === 'fresh' };\n}\nexport function admitGate(gate: Gate): Admitted {\n\treturn { gate };\n}\n",
	"tests/gate-types.ts":
		"import { admitGate, parseGate } from '../src/gate.ts';\nexport const witness = admitGate(parseGate('fresh'));\n",
	"formal/Gate.tla": GATE_TLA,
	"formal/Gate.cfg": GATE_CFG,
};

export function validProof(base: string) {
	const dependencies: string[] = [];
	const carrier: Record<string, string> = {
		kind: "result",
		error: "Rejection",
	};
	const laws: Record<string, string>[] = [
		{ law: "id-left", status: "witnessed", witness: "control:C1" },
		{ law: "id-right", status: "witnessed", witness: "control:C1" },
		{ law: "assoc", status: "witnessed", witness: "control:C1" },
		{ law: "functor-id", status: "not_applicable", reason: "no map changes" },
		{ law: "functor-comp", status: "not_applicable", reason: "no map changes" },
		{ law: "monad-left", status: "witnessed", witness: "model:TypeOK" },
		{ law: "monad-right", status: "witnessed", witness: "model:TypeOK" },
		{ law: "monad-assoc", status: "witnessed", witness: "control:C1" },
	];
	return {
		version: 1,
		change: "gate-admission",
		base,
		scope: [
			{ path: ".astack/**", obligation: "P1", modelRefs: ["AdmitFresh"] },
			{ path: "CONTEXT.md", obligation: "P1", modelRefs: ["TypeOK"] },
			{ path: "docs/**", obligation: "P1", modelRefs: ["AdmitFresh"] },
			{ path: "spec/**", obligation: "P1", modelRefs: ["AdmitFresh"] },
			{ path: "tests/**", obligation: "P1", modelRefs: ["Admit"] },
			{ path: "src/**", obligation: "P1", modelRefs: ["Admit"] },
			{ path: "formal/*", obligation: "P1", modelRefs: ["Ends"] },
		],
		domain: {
			context: "Gate admission",
			glossary: "CONTEXT.md",
			aggregate: { path: "src/gate.ts", symbol: "Gate" },
			terms: ["Gate", "Fresh input"],
			invariants: [
				{ name: "Only fresh input is admitted", modelRef: "AdmitFresh" },
			],
			adrs: [{ file: "docs/adr/0001-gate.md", decision: "D1" }],
			controls: { matrix: ".astack/matrix.json", criteria: ["P1"] },
		},
		category: {
			carrier,
			objects: [
				{ name: "Text", link: { path: "src/gate.ts", symbol: "Text" } },
				{ name: "Gate", link: { path: "src/gate.ts", symbol: "Gate" } },
				{ name: "Admitted", link: { path: "src/gate.ts", symbol: "Admitted" } },
			],
			arrows: [
				{
					name: "parse",
					from: "Text",
					to: "Gate",
					link: { path: "src/gate.ts", symbol: "parseGate" },
					effects: [],
				},
				{
					name: "admit",
					from: "Gate",
					to: "Admitted",
					link: { path: "src/gate.ts", symbol: "admitGate" },
					effects: [],
				},
			],
			composites: [{ arrows: ["parse", "admit"], op: ">=>" }],
			equality: "structural equality of the returned Result",
			laws,
			typedWitness: "tests/gate-types.ts",
		},
		abstraction: {
			hides: "the freshness rule of admission",
			callersKnow: ["a stale gate is rejected"],
			deletionTest: "each caller would check freshness again",
			alternatives: [
				{ name: "a flag on the caller", rejectedBecause: "callers forget it" },
			],
			relation: [
				{
					concrete: { path: "src/gate.ts", symbol: "admitGate" },
					modelAction: "Admit",
				},
			],
			omitted: ["the text format"],
		},
		model: {
			module: "formal/Gate.tla",
			config: "formal/Gate.cfg",
			dependencies,
			bounds: ["one gate with two variables"],
			fairness: ["weak fairness on Next"],
			invariants: ["TypeOK", "AdmitFresh"],
			properties: ["Ends"],
		},
		negative: {
			file: "formal/Gate.tla",
			action: "Admit",
			original: '/\\ fresh /\\ status\' = "admitted"',
			replacement: '/\\ status\' = "admitted"',
			defect: "admission skips the freshness guard",
			expect: { kind: "invariant", name: "AdmitFresh" },
		},
		limits: ["the model does not prove that admitGate implements Admit"],
	};
}

export type Proof = ReturnType<typeof validProof>;

export function scratchDir(prefix: string): string {
	return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function writeFiles(root: string, files: Files): void {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
}

export function git(root: string, ...args: string[]): string {
	const result = spawnSync(
		"git",
		[
			"-c",
			"user.name=Proof",
			"-c",
			"user.email=proof@example.invalid",
			...args,
		],
		{ cwd: root, encoding: "utf8" },
	);
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

export type ProofRepo = { readonly root: string; readonly base: string };

export function proofRepo(
	parent: string,
	edit: (proof: Proof) => void = () => {},
	files: Files = PROOF_FILES,
): ProofRepo {
	const root = mkdtempSync(join(parent, "repo-"));
	git(root, "init", "-q", "-b", "main");
	writeFiles(root, BASE_FILES);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
	const base = git(root, "rev-parse", "HEAD");
	const proof = validProof(base);
	edit(proof);
	writeFiles(root, {
		...files,
		".astack/proof.json": `${JSON.stringify(proof, null, 2)}\n`,
	});
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "proof");
	return { root, base };
}
