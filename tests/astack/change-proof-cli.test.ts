import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	git,
	PROOF_FILES,
	type Proof,
	proofRepo,
	SLOW_GATE_TLA,
	scratchDir,
} from "./change-proof-fixture.ts";

const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
const scratch = scratchDir("astack-change-proof-cli-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

type Run = { code: number | null; out: string; err: string };

function proofEnv(
	extra: Readonly<Record<string, string>>,
): Record<string, string> {
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? homedir(),
		...extra,
	};
	const jar = process.env.ASTACK_TLC_JAR;
	if (jar !== undefined && extra.ASTACK_TLC_JAR === undefined)
		env.ASTACK_TLC_JAR = jar;
	if (process.env.XDG_CACHE_HOME !== undefined)
		env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME;
	if (process.env.JAVA_HOME !== undefined)
		env.JAVA_HOME = process.env.JAVA_HOME;
	return env;
}

function proof(
	cwd: string,
	args: readonly string[] = [],
	env: Readonly<Record<string, string>> = {},
	name: readonly string[] = ["check", "proof"],
): Run {
	const result = spawnSync(process.execPath, [CLI, ...name, ...args], {
		cwd,
		encoding: "utf8",
		env: proofEnv(env),
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const lastLine = (text: string): string =>
	text.trimEnd().split("\n").at(-1) ?? "";

describe("astack check proof", () => {
	test.each(["check proof", "check-proof"])(
		"[control:proof-valid-triple] %s admits a valid proof after a fresh positive, the named negative and an unchanged positive TLC run",
		(name) => {
			const repo = proofRepo(scratch);
			const args = name === "check proof" ? ["--base", repo.base] : [];
			const run = proof(repo.root, args, {}, name.split(" "));
			expect(run.err).toBe("");
			expect(run.out).toStartWith(
				"positive: 4 distinct states, 6 generated, 0 left on queue\nnegative: Admit violates AdmitFresh with a counterexample of 3 states\nrestored: 4 distinct states, 6 generated, 0 left on queue\nreceipt: change gate-admission base ",
			);
			expect(lastLine(run.out)).toStartWith(
				"ok: proof gate-admission admitted at ",
			);
			expect(run.code).toBe(0);
		},
	);

	test("[control:proof-missing-manifest] a repo with no proof manifest fails", () => {
		const root = join(scratch, "empty");
		mkdirSync(root);
		git(root, "init", "-q", "-b", "main");
		const run = proof(root);
		expect(run.out).toBe("stop: proof schema: .astack/proof.json is missing\n");
		expect(run.code).toBe(1);
	});

	test("an ignored manifest still belongs to the proof input digest", () => {
		const repo = proofRepo(scratch);
		const path = join(repo.root, ".astack/proof.json");
		const manifest: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (
			typeof manifest !== "object" ||
			manifest === null ||
			!("scope" in manifest) ||
			!Array.isArray(manifest.scope)
		)
			throw new Error("the proof fixture has no scope");
		manifest.scope.push({
			path: ".gitignore",
			obligation: "P1",
			modelRefs: ["AdmitFresh"],
		});
		writeFileSync(path, JSON.stringify(manifest));
		git(repo.root, "rm", "--cached", "-q", ".astack/proof.json");
		writeFileSync(join(repo.root, ".gitignore"), ".astack/proof.json\n");
		git(repo.root, "add", "-A");
		git(repo.root, "commit", "-q", "-m", "ignore the intent record");
		const tracked = git(repo.root, "ls-files", "-z")
			.split("\0")
			.filter(Boolean).length;
		const run = proof(repo.root);
		expect(run.code).toBe(0);
		expect(run.out).toContain(` over ${tracked + 1} files, tla2tools `);
	});

	test("[control:proof-index-binding] an index-only change during model execution makes the proof stale", async () => {
		const repo = proofRepo(scratch);
		const path = join(repo.root, "formal/Gate.tla");
		const original = readFileSync(path, "utf8");
		let changed = false;
		const run = await new Promise<Run>((done) => {
			const child = spawn(process.execPath, [CLI, "check", "proof"], {
				cwd: repo.root,
				env: proofEnv({}),
			});
			let out = "";
			let err = "";
			child.stdout.on("data", (chunk: Buffer) => {
				out += chunk.toString();
				if (!changed && out.includes("positive:")) {
					changed = true;
					writeFileSync(
						path,
						original.replace("/\\ fresh /\\ status'", "/\\ status'"),
					);
					git(repo.root, "add", "formal/Gate.tla");
					writeFileSync(path, original);
				}
			});
			child.stderr.on("data", (chunk: Buffer) => {
				err += chunk.toString();
			});
			child.on("close", (code) => done({ code, out, err }));
		});
		expect(changed).toBe(true);
		expect(run.err).toBe("");
		expect(run.code).toBe(1);
		expect(run.out).toContain(
			"stop: proof stale: the candidate inputs changed during the proof",
		);
		expect(readFileSync(path, "utf8")).toBe(original);
		expect(
			git(repo.root, "diff", "--cached", "--", "formal/Gate.tla"),
		).toContain("-Admit ==");
	});

	test("[control:proof-symlink-reference] a glossary cannot hide unbound input bytes behind an in-repo symlink", () => {
		const context = PROOF_FILES["CONTEXT.md"];
		if (context === undefined)
			throw new Error("the context fixture is missing");
		const repo = proofRepo(
			scratch,
			(p) => {
				p.scope.push({
					path: ".gitignore",
					obligation: "P1",
					modelRefs: ["AdmitFresh"],
				});
			},
			{
				...PROOF_FILES,
				".gitignore": "private/\n",
				"private/context.md": context,
			},
		);
		unlinkSync(join(repo.root, "CONTEXT.md"));
		symlinkSync("private/context.md", join(repo.root, "CONTEXT.md"));
		git(repo.root, "add", "CONTEXT.md");
		git(repo.root, "commit", "-q", "-m", "link the glossary");
		const run = proof(repo.root);
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"stop: proof domain: CONTEXT.md has a symbolic link in its path\n",
		);
	});

	test.each<[string, (proof: Proof) => void, string]>([
		[
			"a superseded ADR",
			(p) => {
				p.domain.adrs = [{ file: "docs/adr/0002-old.md", decision: "D1" }];
			},
			'stop: proof domain: docs/adr/0002-old.md has status "Superseded by 0001", not Accepted\n',
		],
		[
			"an ADR decision with no heading",
			(p) => {
				p.domain.adrs = [{ file: "docs/adr/0001-gate.md", decision: "D7" }];
			},
			"stop: proof domain: docs/adr/0001-gate.md has no ### D7. decision heading\n",
		],
		[
			"a term that the glossary does not define",
			(p) => {
				p.domain.terms = ["Gate", "Stale receipt"];
			},
			'stop: proof domain: CONTEXT.md defines no term "Stale receipt"\n',
		],
	])("[control:proof-domain-reference] %s fails", (_name, edit, expected) => {
		const repo = proofRepo(scratch, edit);
		const run = proof(repo.root);
		expect(run.out).toBe(expected);
		expect(run.code).toBe(1);
	});

	test("[control:proof-adr-contract] a governing ADR without its category explanation fails", () => {
		const adr = PROOF_FILES["docs/adr/0001-gate.md"];
		if (adr === undefined) throw new Error("the ADR fixture is missing");
		const repo = proofRepo(scratch, () => {}, {
			...PROOF_FILES,
			"docs/adr/0001-gate.md": adr.replace(
				"#### Category composition",
				"#### Unlinked explanation",
			),
		});
		const run = proof(repo.root);
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"stop: proof domain: docs/adr/0001-gate.md has no nonempty Category composition proof section\n",
		);
	});

	test.each<[string, (root: string) => void, string]>([
		[
			"a dirty tracked file",
			(root) => writeFileSync(join(root, "README.md"), "# Changed\n"),
			"README.md",
		],
		[
			"an untracked file",
			(root) => writeFileSync(join(root, "notes/new.md"), "new\n"),
			"notes/new.md",
		],
		[
			"a staged removal",
			(root) => git(root, "rm", "-q", "notes/old.md"),
			"notes/old.md",
		],
		[
			"a removal in the worktree only",
			(root) => unlinkSync(join(root, "notes/old.md")),
			"notes/old.md",
		],
	])(
		"[control:proof-scope-hole] %s outside every scope row fails",
		(_name, change, path) => {
			const repo = proofRepo(scratch);
			change(repo.root);
			const run = proof(repo.root);
			expect(run.out).toBe(
				`stop: proof controls: no scope row covers the changed path ${path}\n`,
			);
			expect(run.code).toBe(1);
		},
	);

	test("[control:proof-bad-jar] a TLC jar with other bytes fails before any model run", () => {
		const repo = proofRepo(scratch);
		const jar = join(scratch, "bad-tla2tools.jar");
		writeFileSync(jar, "not the pinned jar");
		const run = proof(repo.root, [], { ASTACK_TLC_JAR: jar });
		expect(run.out).toStartWith(
			`stop: proof model: ${jar} does not have the pinned sha256 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`,
		);
		expect(run.out).not.toContain("positive:");
		expect(run.code).toBe(1);
	});

	test("[control:proof-reserved-module] a project dependency cannot activate the pinned jar's Randomization override", () => {
		const repo = proofRepo(
			scratch,
			(p) => {
				p.model.dependencies = ["formal/Randomization.tla"];
			},
			{
				...PROOF_FILES,
				"formal/Gate.tla":
					PROOF_FILES["formal/Gate.tla"]
						?.replace("EXTENDS Naturals", "EXTENDS Naturals, Randomization")
						.replace(
							"Init == fresh = TRUE",
							"Init == RandomSubset(1, {1, 2}) # {} /\\ fresh = TRUE",
						) ?? "",
				"formal/Randomization.tla":
					"---- MODULE Randomization ----\nRandomSubset(k, S) == {}\n====\n",
			},
		);
		const run = proof(repo.root);
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"stop: proof model: formal/Randomization.tla shadows the standard module Randomization\n",
		);
	});

	test("[control:proof-mutation-boundary] a mutation cannot comment out and replace protected model definitions", () => {
		const original = PROOF_FILES["formal/Gate.tla"];
		if (original === undefined) throw new Error("the model fixture is missing");
		const replacement = [
			'/\\ fresh /\\ status\' = "admitted" /\\ UNCHANGED fresh',
			'Reject == status = "open" /\\ ~fresh /\\ status\' = "rejected" /\\ UNCHANGED fresh',
			'Done == status # "open" /\\ UNCHANGED vars',
			"Next == Expire \\/ Admit \\/ Reject \\/ Done",
			"Spec == Init /\\ [][Next]_vars /\\ WF_vars(Next)",
			'TypeOK == fresh \\in BOOLEAN /\\ status \\in {"open", "admitted", "rejected"}',
			'AdmitFresh == status # "admitted"',
			'Ends == <>(status # "open")',
			"(*",
		].join("\n");
		const repo = proofRepo(
			scratch,
			(p) => {
				p.negative.replacement = replacement;
			},
			{
				...PROOF_FILES,
				"formal/Gate.tla": original.replace("====", "\\* *)\n===="),
			},
		);
		const run = proof(repo.root);
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"stop: proof model: the negative replacement changes code outside action Admit\n",
		);
	});

	test.each<[string, (proof: Proof) => void, string]>([
		[
			"a violation of another invariant",
			(p) => {
				p.negative.expect = { kind: "invariant", name: "TypeOK" };
			},
			"stop: proof countermodel: the negative run violated AdmitFresh, not the expected invariant TypeOK\n",
		],
		[
			"a mutation that breaks the syntax",
			(p) => {
				p.negative.replacement = '/\\ status\' == "admitted"';
			},
			"stop: proof countermodel: the negative run exited 150 with error 3002, not the expected invariant violation\n",
		],
	])(
		"[control:proof-wrong-countermodel] %s is not an accepted countermodel",
		(_name, edit, expected) => {
			const repo = proofRepo(scratch, edit);
			const run = proof(repo.root);
			expect(run.out).toBe(
				`positive: 4 distinct states, 6 generated, 0 left on queue\n${expected}`,
			);
			expect(run.code).toBe(1);
		},
	);

	test.each<[string, (proof: Proof) => void, string]>([
		[
			"an original text that occurs twice in the action",
			(p) => {
				p.negative.original = "status";
				p.negative.replacement = "fresh";
			},
			'stop: proof model: the negative original "status" occurs 2 times in action Admit, not once\n',
		],
		[
			"a mutation of a configured invariant",
			(p) => {
				p.negative.action = "AdmitFresh";
				p.negative.original = "=> fresh";
				p.negative.replacement = "=> TRUE";
			},
			"stop: proof model: the negative action AdmitFresh is a configured invariant or property, not an action\n",
		],
	])(
		"[control:proof-mutation-scope] %s fails before any model run",
		(_name, edit, expected) => {
			const repo = proofRepo(scratch, edit);
			const run = proof(repo.root);
			expect(run.out).toBe(expected);
			expect(run.code).toBe(1);
		},
	);

	test("[control:proof-timeout-cleanup] a model run past the deadline is killed and its temp root is removed", () => {
		const repo = proofRepo(scratch, () => {}, {
			...PROOF_FILES,
			"formal/Gate.tla": SLOW_GATE_TLA,
		});
		const tmp = join(scratch, "tmp-timeout");
		mkdirSync(tmp);
		const run = proof(repo.root, [], {
			TMPDIR: tmp,
			ASTACK_PROOF_TIMEOUT_MS: "3000",
		});
		expect(run.out).toBe(
			"stop: proof model: the positive run passed the 3000 ms deadline and was stopped\n",
		);
		expect(run.code).toBe(1);
		expect(readdirSync(tmp)).toEqual([]);
	});

	test("[control:proof-summary-unverified] --summary prints the intent as unverified and runs no model", () => {
		const repo = proofRepo(scratch);
		const run = proof(repo.root, ["--summary"], {
			ASTACK_TLC_JAR: join(scratch, "no-such.jar"),
		});
		expect(run.out).toContain("Domain: Gate admission; aggregate Gate");
		expect(run.out).toContain("Formal: formal/Gate.tla");
		expect(lastLine(run.out)).toBe(
			"status: UNVERIFIED. This summary ran no check and no model, so it is not a proof.",
		);
		expect(run.out).not.toMatch(/^ok:/m);
		expect(run.code).toBe(0);
	});

	test.each<[string, readonly string[], string]>([
		[
			"an unknown flag",
			["--fast"],
			"astack check proof: unknown argument --fast\n",
		],
		[
			"two manifests",
			["a.json", "b.json"],
			"astack check proof: give at most one manifest path\n",
		],
		[
			"--base with no ref",
			["--base"],
			"astack check proof: --base needs a ref\n",
		],
	])("%s is a usage error", (_name, args, expected) => {
		const repo = proofRepo(scratch);
		const run = proof(repo.root, args);
		expect(run.err).toBe(expected);
		expect(run.code).toBe(2);
	});

	test("a manifest with an unknown key is a schema error", () => {
		const repo = proofRepo(scratch, (p) => {
			Object.assign(p, { receipt: "stored" });
		});
		const run = proof(repo.root);
		expect(run.out).toBe(
			'stop: proof schema: the proof has the unknown key "receipt"\n',
		);
		expect(run.code).toBe(2);
	});

	test("a --base ref that is not the manifest base fails", () => {
		const repo = proofRepo(scratch);
		const run = proof(repo.root, ["--base", "HEAD"]);
		expect(run.out).toBe(
			`stop: proof stale: --base HEAD resolves to ${git(repo.root, "rev-parse", "HEAD")}, not the manifest base ${repo.base}\n`,
		);
		expect(run.code).toBe(1);
	});
});
