import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pinnedJar } from "../../src/astack/change-proof/runner.ts";
import {
	BASE_FILES,
	git,
	PROOF_FILES,
	scratchDir,
	validProof,
	writeFiles,
} from "./change-proof-fixture.ts";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = scratchDir("astack-ratification-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const GOVERNING = "docs/adr/0001-gate.md";
const PROCESS = "docs/adr/0003-process.md";
const RECORD = "spec/ratification-proof.md";
const PROPOSAL =
	"# Gate\n\nStatus: Proposed · lands B01\n\n### D1. Admit fresh input\n\nThe gate admits fresh input.\n";
const POLICY =
	"# Process\n\nStatus: Accepted\n\n### D1. Integrated decisions are ratified\n\nA merged Proposed decision may be implemented.\n";
const existingRecord = (() => {
	const record = PROOF_FILES[GOVERNING];
	if (record === undefined) throw new Error("the proof record is missing");
	return record;
})();

function environment(): Record<string, string> {
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? homedir(),
	};
	for (const name of ["JAVA_HOME", "ASTACK_TLC_JAR", "XDG_CACHE_HOME"]) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	return env;
}

const checker = await pinnedJar(environment(), scratch);
if (!checker.ok) throw new Error(checker.error);

function candidate(
	proposal = PROPOSAL,
	policy = POLICY,
	beforeIntegration: (root: string) => void = () => {},
) {
	const root = mkdtempSync(join(scratch, "repo-"));
	git(root, "init", "-q", "-b", "main");
	writeFiles(root, { ...BASE_FILES, [GOVERNING]: proposal, [PROCESS]: policy });
	beforeIntegration(root);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "integrate the decisions");
	const integratedAt = git(root, "rev-parse", "HEAD");
	writeFileSync(join(root, "README.md"), "# Gate\n\nFixed base.\n");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "fix the implementation base");
	const base = git(root, "rev-parse", "HEAD");
	const original = validProof(base);
	const manifest = {
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
						integratedAt,
						proofRecord: RECORD,
					},
				},
			],
		},
	};
	for (const path of [GOVERNING, PROCESS])
		rmSync(join(root, path), { recursive: true, force: true });
	writeFiles(root, {
		...PROOF_FILES,
		[GOVERNING]: proposal,
		[PROCESS]: policy,
		[RECORD]: existingRecord,
		".astack/proof.json": JSON.stringify(manifest),
	});
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "add the implementation proof");
	return { root, base, manifest };
}

type Candidate = ReturnType<typeof candidate>;

function save(repo: Candidate): void {
	writeFileSync(
		join(repo.root, ".astack/proof.json"),
		JSON.stringify(repo.manifest),
	);
}

function run(root: string, extra: Readonly<Record<string, string>> = {}) {
	const result = spawnSync(process.execPath, [CLI, "check", "proof"], {
		cwd: root,
		env: { ...environment(), ...extra },
		encoding: "utf8",
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

function refusal(repo: Candidate, message: string, stage = "domain"): void {
	const result = run(repo.root);
	expect(result).toEqual({
		code: stage === "schema" ? 2 : 1,
		out: `stop: proof ${stage}: ${message}\n`,
		err: "",
	});
}

function reference(repo: Candidate) {
	const adr = repo.manifest.domain.adrs[0];
	if (adr === undefined) throw new Error("the governing reference is missing");
	return adr;
}

function landingCandidate() {
	const proposal = PROPOSAL.replace(
		"Status: Proposed · lands B01\n",
		"Status: Proposed · lands B01\nLanded: none yet\n",
	);
	const policy = POLICY.replace(
		"Status: Accepted\n",
		"Status: Accepted\nLanded: none yet\n",
	);
	return candidate(
		proposal,
		`${policy}\nImplementers update the factual Landed header value without changing decision authority.\n`,
	);
}

function selectLanding(
	repo: Candidate,
	option: unknown = "landed-header-value",
): void {
	const adr = reference(repo);
	writeFileSync(
		join(repo.root, ".astack/proof.json"),
		JSON.stringify({
			...repo.manifest,
			domain: {
				...repo.manifest.domain,
				adrs: [
					{
						...adr,
						ratification: { ...adr.ratification, governingMetadata: option },
					},
				],
			},
		}),
	);
}

function promisorCandidate() {
	const repo = candidate();
	git(repo.root, "config", "extensions.partialclone", "origin");
	git(repo.root, "config", "remote.origin.promisor", "true");
	git(
		repo.root,
		"config",
		"remote.origin.url",
		"file:///nonexistent-proof-fixture-origin",
	);
	git(repo.root, "config", "remote.origin.partialclonefilter", "blob:none");
	return repo;
}

describe("integrated ADR ratification", () => {
	test("[control:proof-landing-selected-header] admits an explicit landing value update after the complete model triple", () => {
		const repo = landingCandidate();
		selectLanding(repo);
		writeFileSync(
			join(repo.root, GOVERNING),
			readFileSync(join(repo.root, GOVERNING), "utf8").replace(
				"Landed: none yet",
				"Landed: fresh-input checks",
			),
		);
		const result = run(repo.root);
		expect(result.code).toBe(0);
		expect(result.err).toBe("");
		expect(result.out).toStartWith(
			"positive: 4 distinct states, 6 generated, 0 left on queue\nnegative: Admit violates AdmitFresh with a counterexample of 3 states\nrestored: 4 distinct states, 6 generated, 0 left on queue\nreceipt:",
		);
		expect(result.out.trimEnd().split("\n").at(-1)).toBe(
			`ok: proof gate-admission admitted at ${git(repo.root, "rev-parse", "HEAD")}`,
		);
	});

	test("[control:proof-landing-default-strict] retains whole-byte comparison without the option", () => {
		const repo = landingCandidate();
		writeFileSync(
			join(repo.root, GOVERNING),
			readFileSync(join(repo.root, GOVERNING), "utf8").replace(
				"Landed: none yet",
				"Landed: fresh-input checks",
			),
		);
		refusal(
			repo,
			`${GOVERNING} differs from its ratified bytes at ${reference(repo).ratification.integratedAt}`,
		);
	});

	test.each([null, "all-metadata", { field: "Landed" }])(
		"[control:proof-landing-closed-schema] refuses unsupported metadata option %j",
		(option) => {
			const repo = landingCandidate();
			selectLanding(repo, option);
			refusal(
				repo,
				"domain.adrs[0].ratification.governingMetadata must be one of landed-header-value",
				"schema",
			);
		},
	);

	test("[control:proof-landing-process-strict] keeps even process landing metadata byte-strict", () => {
		const repo = landingCandidate();
		selectLanding(repo);
		writeFileSync(
			join(repo.root, PROCESS),
			readFileSync(join(repo.root, PROCESS), "utf8").replace(
				"Landed: none yet",
				"Landed: implementation",
			),
		);
		refusal(
			repo,
			`${PROCESS} differs from its ratified bytes at ${reference(repo).ratification.integratedAt}`,
		);
	});

	test.each(["integration", "base"])(
		"[control:proof-landing-historical-authority] refuses protected authority drift in %s",
		(view) => {
			const repo = landingCandidate();
			const original = readFileSync(join(repo.root, GOVERNING), "utf8");
			writeFileSync(
				join(repo.root, GOVERNING),
				original.replace(
					"The gate admits fresh input.",
					"The gate admits other input.",
				),
			);
			if (view === "base") {
				git(repo.root, "add", "-A");
				git(repo.root, "commit", "-q", "-m", "amend protected authority");
				repo.manifest.base = git(repo.root, "rev-parse", "HEAD");
				writeFileSync(join(repo.root, GOVERNING), original);
			}
			selectLanding(repo);
			const commit =
				view === "base"
					? repo.manifest.base
					: reference(repo).ratification.integratedAt;
			refusal(
				repo,
				`${GOVERNING} differs from its ratified authority at ${commit}`,
			);
		},
	);

	test("[control:proof-ratification-fetch-witness] the local promisor fixture records an ordinary resolver fetch", () => {
		const repo = promisorCandidate();
		const trace = join(repo.root, "ordinary.trace");
		const module = resolve(
			import.meta.dir,
			"../../src/astack/change-proof/candidate.ts",
		);
		const script = `import { resolveCommit } from ${JSON.stringify(module)}; console.log(JSON.stringify({resolved:resolveCommit(${JSON.stringify(repo.root)},${JSON.stringify("a".repeat(40))}) ?? null}));`;
		const result = spawnSync(process.execPath, ["--eval", script], {
			env: { ...environment(), GIT_TRACE: trace },
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('{"resolved":null}\n');
		expect(/\bfetch origin\b/.test(readFileSync(trace, "utf8"))).toBe(true);
	});

	test.each(["integration", "base", "cli-base", "cli-option"])(
		"[control:proof-ratification-no-lazy-fetch] rejects missing %s history without a promisor fetch",
		(mode) => {
			const repo = promisorCandidate();
			const missing = "a".repeat(40);
			const trace = join(repo.root, "history.trace");
			const module = resolve(
				import.meta.dir,
				"../../src/astack/change-proof/candidate.ts",
			);
			const base = mode === "base" ? missing : repo.base;
			const integrated =
				mode === "integration"
					? missing
					: reference(repo).ratification.integratedAt;
			if (mode === "cli-base") {
				repo.manifest.base = missing;
				save(repo);
			}
			const script = `import { readIntegrationHistory } from ${JSON.stringify(module)}; console.log(JSON.stringify(readIntegrationHistory(${JSON.stringify(repo.root)},${JSON.stringify(base)},${JSON.stringify(integrated)},[])));`;
			const args = mode.startsWith("cli-")
				? [
						CLI,
						"check",
						"proof",
						...(mode === "cli-option" ? ["--base", missing] : []),
					]
				: ["--eval", script];
			const result = spawnSync(process.execPath, args, {
				cwd: repo.root,
				env: { ...environment(), GIT_TRACE: trace },
				encoding: "utf8",
			});
			if (mode.startsWith("cli-")) {
				expect(result.status).toBe(1);
				const message =
					mode === "cli-base"
						? `the base ${missing} is not a commit in this repository`
						: `--base ${missing} resolves to no commit, not the manifest base ${repo.base}`;
				expect(result.stdout).toBe(`stop: proof stale: ${message}\n`);
			} else {
				expect(result.status).toBe(0);
				const error =
					mode === "integration"
						? `ratification ${missing} is not a full commit in this repository`
						: `the fixed proof base ${missing} is not an ancestor of HEAD`;
				expect(result.stdout).toBe(`${JSON.stringify({ ok: false, error })}\n`);
			}
			expect(/\bfetch origin\b/.test(readFileSync(trace, "utf8"))).toBe(false);
		},
	);

	test("[control:proof-ratification] ignores grafted ancestry supplied through the environment", () => {
		const repo = candidate();
		const sibling = git(
			repo.root,
			"commit-tree",
			`${repo.base}^{tree}`,
			"-m",
			"unrelated integration",
		);
		const grafts = join(scratch, `grafts-${sibling}`);
		writeFileSync(grafts, `${repo.base} ${sibling}\n`);
		reference(repo).ratification.integratedAt = sibling;
		save(repo);
		expect(run(repo.root, { GIT_GRAFT_FILE: grafts })).toEqual({
			code: 1,
			out: `stop: proof domain: ratification ${sibling} is not an ancestor of the fixed proof base ${repo.base}\n`,
			err: "",
		});
	});

	test("[control:proof-ratification-does-not-accept-replacement-trees-as-integrated-history] does not accept replacement trees as integrated history", () => {
		const repo = candidate(PROPOSAL, POLICY, (root) =>
			rmSync(join(root, GOVERNING)),
		);
		const index = resolve(
			repo.root,
			git(repo.root, "rev-parse", "--git-path", "index"),
		);
		const previousIndex = readFileSync(index);
		const proposal = git(repo.root, "rev-parse", `HEAD:${GOVERNING}`);
		git(repo.root, "read-tree", repo.base);
		git(
			repo.root,
			"update-index",
			"--add",
			"--cacheinfo",
			"100644",
			proposal,
			GOVERNING,
		);
		const tree = git(repo.root, "write-tree");
		writeFileSync(index, previousIndex);
		const integratedAt = reference(repo).ratification.integratedAt;
		const fakeIntegration = git(
			repo.root,
			"commit-tree",
			tree,
			"-m",
			"replacement integration",
		);
		const fakeBase = git(
			repo.root,
			"commit-tree",
			tree,
			"-p",
			integratedAt,
			"-m",
			"replacement base",
		);
		git(repo.root, "replace", integratedAt, fakeIntegration);
		git(repo.root, "replace", repo.base, fakeBase);
		refusal(repo, `${GOVERNING} is missing at ${integratedAt}`);
	});

	test("[control:proof-ratification-keeps-bare-proposed-records-rejected-by-default] keeps bare Proposed records rejected by default", () => {
		const repo = candidate();
		writeFileSync(
			join(repo.root, ".astack/proof.json"),
			JSON.stringify({
				...repo.manifest,
				domain: {
					...repo.manifest.domain,
					adrs: [{ file: GOVERNING, decision: "D1" }],
				},
			}),
		);
		refusal(
			repo,
			`${GOVERNING} has status "Proposed · lands B01", not Accepted`,
		);
	});

	test("[control:proof-ratification-refuses-an-authority-first-added-after-the-integrated-base] refuses an authority first added after the integrated base", () => {
		const repo = candidate(PROPOSAL, POLICY, (root) =>
			rmSync(join(root, PROCESS)),
		);
		refusal(
			repo,
			`${PROCESS} is missing at ${reference(repo).ratification.integratedAt}`,
		);
	});

	test("[control:proof-ratification-requires-the-accepted-process-decision] requires the accepted process decision", () => {
		refusal(
			candidate(PROPOSAL, POLICY.replace("### D1.", "### D2.")),
			`${PROCESS} has no ### D1. decision heading`,
		);
	});

	test.each(["kind", "extra"])(
		"[control:proof-ratification-refuses-an-invalid-ratification-s-declaration] refuses an invalid ratification %s declaration",
		(change) => {
			const repo = candidate();
			const adr = reference(repo);
			const ratification =
				change === "kind"
					? { ...adr.ratification, kind: "proposal" }
					: { ...adr.ratification, allow: true };
			writeFileSync(
				join(repo.root, ".astack/proof.json"),
				JSON.stringify({
					...repo.manifest,
					domain: { ...repo.manifest.domain, adrs: [{ ...adr, ratification }] },
				}),
			);
			refusal(
				repo,
				change === "kind"
					? "domain.adrs[0].ratification.kind must be one of integrated-proposal"
					: 'domain.adrs[0].ratification has the unknown key "allow"',
				"schema",
			);
		},
	);

	test("[control:proof-ratification-cannot-reuse-the-governing-adr-as-its-proof-record] cannot reuse the governing ADR as its proof record", () => {
		const repo = candidate();
		reference(repo).ratification.proofRecord = GOVERNING;
		save(repo);
		refusal(
			repo,
			"ratification proofRecord must be separate from its governing and process ADRs",
		);
	});

	test("[control:proof-ratification-admits-an-unchanged-integrated-proposal-only-after-the-full-model-triple] admits an unchanged integrated proposal only after the full model triple", () => {
		const repo = candidate();
		const result = run(repo.root);
		expect(result.code).toBe(0);
		expect(result.err).toBe("");
		expect(result.out).toStartWith(
			"positive: 4 distinct states, 6 generated, 0 left on queue\nnegative: Admit violates AdmitFresh with a counterexample of 3 states\nrestored: 4 distinct states, 6 generated, 0 left on queue\nreceipt:",
		);
		expect(result.out.trimEnd().split("\n").at(-1)).toBe(
			`ok: proof gate-admission admitted at ${git(repo.root, "rev-parse", "HEAD")}`,
		);
	});

	test.each([
		["the governing decision", GOVERNING],
		["the accepted process", PROCESS],
	])(
		"[control:proof-ratification-refuses-changed-bytes-in-s] refuses changed bytes in %s",
		(_name, path) => {
			const repo = candidate();
			writeFileSync(
				join(repo.root, path),
				`${readFileSync(join(repo.root, path), "utf8")}\nChanged.\n`,
			);
			refusal(
				repo,
				`${path} differs from its ratified bytes at ${reference(repo).ratification.integratedAt}`,
			);
		},
	);

	test("[control:proof-ratification-compares-the-fixed-base-even-when-current-bytes-match-the-older-integration] compares the fixed base even when current bytes match the older integration", () => {
		const repo = candidate();
		writeFileSync(join(repo.root, GOVERNING), `${PROPOSAL}\nChanged.\n`);
		git(repo.root, "add", "-A");
		git(repo.root, "commit", "-q", "-m", "amend the proposal");
		repo.manifest.base = git(repo.root, "rev-parse", "HEAD");
		writeFileSync(join(repo.root, GOVERNING), PROPOSAL);
		save(repo);
		refusal(
			repo,
			`${GOVERNING} differs from its ratified bytes at ${repo.manifest.base}`,
		);
	});

	test("[control:proof-ratification-refuses-a-proposal-first-added-after-the-integrated-base] refuses a proposal first added after the integrated base", () => {
		const repo = candidate(PROPOSAL, POLICY, (root) =>
			rmSync(join(root, GOVERNING)),
		);
		refusal(
			repo,
			`${GOVERNING} is missing at ${reference(repo).ratification.integratedAt}`,
		);
	});

	test("[control:proof-ratification-refuses-a-newly-accepted-process-rather-than-trusting-its-current-stamp] refuses a newly accepted process rather than trusting its current stamp", () => {
		const repo = candidate(
			PROPOSAL,
			POLICY.replace("Status: Accepted", "Status: Proposed"),
		);
		writeFileSync(join(repo.root, PROCESS), POLICY);
		refusal(
			repo,
			`${PROCESS} differs from its ratified bytes at ${reference(repo).ratification.integratedAt}`,
		);
	});

	test.each([
		[
			"unaccepted process",
			PROPOSAL,
			POLICY.replace("Status: Accepted", "Status: Proposed"),
			`${PROCESS} has status "Proposed", not Accepted`,
		],
		[
			"missing decision",
			PROPOSAL.replace("### D1.", "### D2."),
			POLICY,
			`${GOVERNING} has no ### D1. decision heading`,
		],
		[
			"empty decision",
			PROPOSAL.replace("The gate admits fresh input.", ""),
			POLICY,
			`${GOVERNING} has no nonempty D1 decision text`,
		],
		[
			"fenced metadata",
			`\`\`\`text\n${PROPOSAL}\`\`\`\n`,
			POLICY,
			`${GOVERNING} has no Status line`,
		],
		[
			"duplicate status",
			PROPOSAL.replace(
				"Status: Proposed",
				"Status: Accepted\nStatus: Proposed",
			),
			POLICY,
			`${GOVERNING} has multiple Status lines`,
		],
		[
			"superseded status",
			PROPOSAL.replace(
				"Status: Proposed · lands B01",
				"Status: Superseded by 0002",
			),
			POLICY,
			`${GOVERNING} has status "Superseded by 0002", not Proposed`,
		],
	])(
		"[control:proof-ratification-refuses-integrated-s] refuses integrated %s",
		(_name, proposal, policy, message) => {
			refusal(candidate(proposal, policy), message);
		},
	);

	test.each([
		["missing commit", (_repo: Candidate) => "a".repeat(40)],
		[
			"blob object",
			(repo: Candidate) => git(repo.root, "hash-object", "-w", "README.md"),
		],
		[
			"annotated tag object",
			(repo: Candidate) => {
				git(
					repo.root,
					"tag",
					"-a",
					"integration",
					"-m",
					"integration",
					repo.base,
				);
				return git(repo.root, "rev-parse", "refs/tags/integration");
			},
		],
	])(
		"[control:proof-ratification-refuses-a-s-as-integration-history] refuses a %s as integration history",
		(_name, object) => {
			const repo = candidate();
			const commit = object(repo);
			reference(repo).ratification.integratedAt = commit;
			save(repo);
			refusal(
				repo,
				`ratification ${commit} is not a full commit in this repository`,
			);
		},
	);

	test("[control:proof-ratification-refuses-real-history-from-another-branch] refuses real history from another branch", () => {
		const repo = candidate();
		const sibling = git(
			repo.root,
			"commit-tree",
			`${repo.base}^{tree}`,
			"-m",
			"unrelated integration",
		);
		reference(repo).ratification.integratedAt = sibling;
		save(repo);
		refusal(
			repo,
			`ratification ${sibling} is not an ancestor of the fixed proof base ${repo.base}`,
		);
	});

	test.each([
		[
			"short commit",
			(repo: Candidate) => {
				reference(repo).ratification.integratedAt = repo.base.slice(0, 12);
			},
			"domain.adrs[0].ratification.integratedAt must be a full lowercase commit SHA",
		],
		[
			"outside path",
			(repo: Candidate) => {
				reference(repo).ratification.process.file = "../process.md";
			},
			"domain.adrs[0].ratification.process.file must be a repository path, outside .git",
		],
	])(
		"[control:proof-ratification-rejects-a-s-while-parsing-the-manifest] rejects a %s while parsing the manifest",
		(_name, edit, message) => {
			const repo = candidate();
			edit(repo);
			save(repo);
			refusal(repo, message, "schema");
		},
	);

	test.each([
		[
			"symlink",
			(root: string) => {
				rmSync(join(root, GOVERNING));
				symlinkSync("0003-process.md", join(root, GOVERNING));
			},
			"has a symbolic link in its path",
		],
		[
			"directory",
			(root: string) => {
				rmSync(join(root, GOVERNING));
				mkdirSync(join(root, GOVERNING));
				writeFileSync(join(root, GOVERNING, "record.md"), PROPOSAL);
			},
			"is not a regular file",
		],
		[
			"invalid UTF-8",
			(root: string) => {
				writeFileSync(join(root, GOVERNING), Buffer.from([0xff]));
			},
			"cannot be read",
		],
	])(
		"[control:proof-ratification-refuses-a-historical-s] refuses a historical %s",
		(_name, edit, message) => {
			const repo = candidate(PROPOSAL, POLICY, edit);
			refusal(
				repo,
				`${GOVERNING} ${message} at ${reference(repo).ratification.integratedAt}`,
			);
		},
	);

	test.each([
		[
			"verification section",
			existingRecord.replace("#### Verification", "#### Other"),
			`${RECORD} has no nonempty Verification proof section`,
		],
		[
			"arrow explanation",
			existingRecord.replace("parseGate >=>", "other >=>"),
			`${RECORD} does not explain parseGate in Category composition`,
		],
		[
			"model link",
			existingRecord.replace("formal/Gate.cfg", "other.cfg"),
			`${RECORD} does not link the proof artifact formal/Gate.cfg`,
		],
	])(
		"[control:proof-ratification-requires-the-separate-proof-record-s-s] requires the separate proof record's %s",
		(_name, record, message) => {
			const repo = candidate();
			writeFileSync(join(repo.root, RECORD), record);
			refusal(repo, message);
		},
	);

	test("[control:proof-ratification-binds-history-availability-again-after-model-execution] binds history availability again after model execution", async () => {
		const repo = candidate();
		const commit = reference(repo).ratification.integratedAt;
		const object = git(
			repo.root,
			"rev-parse",
			"--git-path",
			`objects/${commit.slice(0, 2)}/${commit.slice(2)}`,
		);
		let removed = false;
		const result = await new Promise<{
			code: number | null;
			out: string;
			err: string;
		}>((done) => {
			const child = spawn(process.execPath, [CLI, "check", "proof"], {
				cwd: repo.root,
				env: environment(),
			});
			let out = "";
			let err = "";
			child.stdout.on("data", (chunk: Buffer) => {
				out += chunk.toString();
				if (!removed && out.includes("positive:")) {
					unlinkSync(resolve(repo.root, object));
					removed = true;
				}
			});
			child.stderr.on("data", (chunk: Buffer) => {
				err += chunk.toString();
			});
			child.on("close", (code) => done({ code, out, err }));
		});
		expect(removed).toBe(true);
		expect(result.code).toBe(1);
		expect(result.err).toBe("");
		const last = result.out.trimEnd().split("\n").at(-1) ?? "";
		expect(last).toMatch(
			/^stop: proof stale: the candidate inputs changed during the proof: digest sha256:[0-9a-f]{64} became sha256:[0-9a-f]{64}$/,
		);
		const hashes = [...last.matchAll(/sha256:([0-9a-f]{64})/g)].map(
			(match) => match[1],
		);
		expect(hashes).toHaveLength(2);
		expect(hashes[0]).not.toBe(hashes[1]);
	});

	test("[control:proof-ratification-binds-an-ignored-proof-record-across-model-execution] binds an ignored proof record across model execution", async () => {
		const repo = candidate(PROPOSAL, POLICY, (root) =>
			writeFileSync(join(root, ".gitignore"), "ignored/\n"),
		);
		mkdirSync(join(repo.root, "ignored"));
		const record = join(repo.root, "ignored/proof.md");
		writeFileSync(record, existingRecord);
		reference(repo).ratification.proofRecord = "ignored/proof.md";
		save(repo);
		let changed = false;
		const result = await new Promise<{
			code: number | null;
			out: string;
			err: string;
		}>((done) => {
			const child = spawn(process.execPath, [CLI, "check", "proof"], {
				cwd: repo.root,
				env: environment(),
			});
			let out = "";
			let err = "";
			child.stdout.on("data", (chunk: Buffer) => {
				out += chunk.toString();
				if (!changed && out.includes("positive:")) {
					writeFileSync(record, `${existingRecord}\nChanged.\n`);
					changed = true;
				}
			});
			child.stderr.on("data", (chunk: Buffer) => {
				err += chunk.toString();
			});
			child.on("close", (code) => done({ code, out, err }));
		});
		expect(changed).toBe(true);
		expect(result.code).toBe(1);
		expect(result.err).toBe("");
		expect(result.out.trimEnd().split("\n").at(-1)).toMatch(
			/^stop: proof stale: the candidate inputs changed during the proof: digest sha256:[0-9a-f]{64} became sha256:[0-9a-f]{64}$/,
		);
	});
});
