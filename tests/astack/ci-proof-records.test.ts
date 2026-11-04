import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { ciProofRecords } from "../../src/astack/change-proof/ci-records.ts";
import { parseChangeProof } from "../../src/astack/change-proof/contract.ts";
import {
	git,
	marker,
	PROOF_FILES,
	scratchDir,
	validProof,
	writeFiles,
} from "./change-proof-fixture.ts";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = scratchDir("astack-ci-records-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const MANIFEST = ".astack/proof.json";
const RECORD = "formal/ci/contract.md";
const GOVERNING = "docs/adr/0001-gate.md";
const PROCESS = "docs/adr/0003-process.md";
const WORKFLOW = ".github/workflows/check.yml";
const workflow = (command: string, version = "1.4.3") =>
	`on: pull_request\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: ${version}\n      - run: ${command}\n`;
const record = (() => {
	const text = PROOF_FILES[GOVERNING];
	if (text === undefined) throw new Error("the fixture has no proof record");
	return text;
})();

function candidate(matrixRole?: "spec" | "control") {
	const root = mkdtempSync(join(scratch, "repo-"));
	git(root, "init", "-q", "-b", "main");
	writeFiles(root, {
		...PROOF_FILES,
		[GOVERNING]:
			"# Gate\n\nStatus: Proposed\n\n### D1. Admit fresh input\n\nThe gate admits fresh input.\n",
		[PROCESS]:
			"# Process\n\nStatus: Accepted\n\n### D1. Ratify integrated proposals\n\nIntegrated proposals govern implementation.\n",
		[WORKFLOW]: workflow("bun run check"),
		...(matrixRole === undefined
			? {}
			: {
					[RECORD]: `${record}\n${marker("criterion", "P1")} Fresh inputs only.\ntest ${marker("control", "C1")} admits fresh inputs\n`,
					".astack/matrix.json": JSON.stringify({
						version: 1,
						specs: matrixRole === "spec" ? [RECORD] : ["spec/gate.md"],
						tests: matrixRole === "control" ? [RECORD] : ["tests/gate.txt"],
						links: [{ criterion: "P1", controls: ["C1"] }],
					}),
				}),
	});
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
	const base = git(root, "rev-parse", "HEAD");
	const original = validProof(base);
	const proof = {
		...original,
		domain: {
			...original.domain,
			adrs: [
				{
					file: GOVERNING,
					decision: "D1",
					ratification: {
						kind: "integrated-proposal",
						process: { file: PROCESS, decision: "D1" },
						integratedAt: base,
						proofRecord: RECORD,
					},
				},
			],
		},
	};
	writeFiles(root, {
		[MANIFEST]: JSON.stringify(proof),
		[RECORD]: record,
		[WORKFLOW]: workflow("bun run check --strict"),
	});
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "CI with current proof");
	return { root, base, proof };
}

type Candidate = ReturnType<typeof candidate>;

function save(repo: Candidate): void {
	writeFileSync(join(repo.root, MANIFEST), JSON.stringify(repo.proof));
	git(repo.root, "add", "-A");
	git(repo.root, "commit", "-q", "-m", "change the candidate");
}

function run(repo: Candidate) {
	const result = spawnSync(
		process.execPath,
		[CLI, "check", "ci-pins", "--base", repo.base],
		{ cwd: repo.root, encoding: "utf8" },
	);
	return { code: result.status, out: result.stdout, err: result.stderr };
}

function refuses(repo: Candidate, reason: string): void {
	const result = run(repo);
	expect(result.code).toBe(1);
	expect(result.err).toBe("");
	expect(result.out).toContain(reason);
	expect(result.out).toEndWith(
		"stop: only CI can prove this PR, for the reason in each line above\n",
	);
}

describe("CI changes with required proof records", () => {
	test("[control:ci-proof-records] a committed manifest and separate current proof record permit CI classification without proof admission", () => {
		const result = run(candidate());
		expect(result.err).toBe("");
		expect(result.code).toBe(3);
		expect(result.out).toContain(
			"ci_proof: the PR changes CI and no tool version that CI sets up, so only CI on the head of the PR can prove it\n",
		);
		expect(result.out).not.toContain("admitted");
	});

	test.each(["src/extra.ts", "formal/Gate.tla", "formal/extra.md"])(
		"[control:ci-proof-record-scope] a change to %s stays outside CI classification",
		(path) => {
			const repo = candidate();
			writeFiles(repo.root, { [path]: "A changed input.\n" });
			save(repo);
			refuses(repo, `${path}: the PR also changes this file`);
		},
	);

	test.each(["invalid JSON", "wrong base"])(
		"[control:ci-proof-record-manifest] a committed manifest with %s cannot supply proof records",
		(defect) => {
			const repo = candidate();
			if (defect === "wrong base") {
				repo.proof.base = "0".repeat(40);
				save(repo);
			} else {
				writeFileSync(join(repo.root, MANIFEST), "{");
				git(repo.root, "add", "-A");
				git(repo.root, "commit", "-q", "-m", "break the manifest");
			}
			refuses(
				repo,
				defect === "wrong base"
					? "proof records: the committed proof base does not match the merge base"
					: "proof records: the proof is not valid JSON",
			);
		},
	);

	test("[control:ci-proof-record-sections] a declared record needs all four proof sections", () => {
		const repo = candidate();
		writeFileSync(join(repo.root, RECORD), "### Formal claim\n\nA claim.\n");
		save(repo);
		refuses(
			repo,
			`${RECORD} has no nonempty Category composition proof section`,
		);
	});

	test.each(["glossary", "typed witness"])(
		"[control:ci-proof-record-role] a proof record cannot also supply the %s",
		(role) => {
			const repo = candidate();
			if (role === "glossary") repo.proof.domain.glossary = RECORD;
			else repo.proof.category.typedWitness = RECORD;
			save(repo);
			if (role === "glossary")
				refuses(repo, `${RECORD} also supplies another proof input`);
			else {
				const parsed = parseChangeProof(JSON.stringify(repo.proof));
				if (!parsed.ok) throw new Error(parsed.error.message);
				expect(ciProofRecords(parsed.value, repo.base, new Map())).toEqual({
					ok: false,
					error: `${RECORD} also supplies another proof input`,
				});
			}
		},
	);

	test.each(["spec", "control"] as const)(
		"[control:ci-proof-matrix-source] a proof record cannot also supply a matrix %s source",
		(role) => {
			const repo = candidate(role);
			writeFileSync(
				join(repo.root, RECORD),
				`${record}\n${marker("criterion", "P1")} Any inputs.\ntest ${marker("control", "C1")} admits every input\n`,
			);
			save(repo);
			refuses(repo, `${RECORD} also supplies a matrix source`);
		},
	);

	test.each(["missing", "malformed"])(
		"[control:ci-proof-matrix-read] an unreadable %s matrix cannot hide its listed source roles",
		(defect) => {
			const repo = candidate();
			repo.proof.domain.controls.matrix =
				defect === "missing" ? "missing-matrix.json" : "CONTEXT.md";
			save(repo);
			refuses(
				repo,
				defect === "missing"
					? "missing-matrix.json is missing from the committed proof inputs"
					: "CONTEXT.md: the matrix is not valid JSON",
			);
		},
	);

	test.each(["executable", "symlink", "invalid UTF-8", "missing"])(
		"[control:ci-proof-record-blobs] a committed %s record cannot be classified with CI",
		(defect) => {
			const repo = candidate();
			const full = join(repo.root, RECORD);
			if (defect === "executable") chmodSync(full, 0o755);
			else if (defect === "invalid UTF-8")
				writeFileSync(full, Buffer.from([255]));
			else {
				unlinkSync(full);
				if (defect === "symlink") symlinkSync("../../src/gate.ts", full);
			}
			save(repo);
			refuses(
				repo,
				defect === "missing"
					? `${RECORD} is missing from the committed proof inputs`
					: defect === "invalid UTF-8"
						? `${RECORD} must be readable committed UTF-8 text`
						: `${RECORD} must be a committed non-executable regular file`,
			);
		},
	);

	test("[control:ci-proof-manifest-mode] an executable manifest cannot supply a proof record declaration", () => {
		const repo = candidate();
		chmodSync(join(repo.root, MANIFEST), 0o755);
		save(repo);
		refuses(
			repo,
			`${MANIFEST} must be a committed non-executable regular file`,
		);
	});

	test("[control:ci-proof-record-tool-pin] proof records cannot permit a changed tool pin", () => {
		const repo = candidate();
		writeFileSync(
			join(repo.root, WORKFLOW),
			workflow("bun run check --strict", "1.4.2"),
		);
		save(repo);
		refuses(repo, "so the PR changes a tool version.");
	});

	test.each(["manifest", "record"])(
		"[control:ci-proof-committed-inputs] an uncommitted %s edit cannot repair or replace committed evidence",
		(input) => {
			const repo = candidate();
			const path = input === "manifest" ? MANIFEST : RECORD;
			const original =
				input === "manifest" ? JSON.stringify(repo.proof) : record;
			writeFileSync(join(repo.root, path), "broken");
			expect(run(repo).code).toBe(3);
			git(repo.root, "add", "-A");
			git(repo.root, "commit", "-q", "-m", "commit the broken input");
			writeFileSync(join(repo.root, path), original);
			refuses(repo, "proof records:");
		},
	);
});
