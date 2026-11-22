import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
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
import { pathToFileURL } from "node:url";
import { isMap, isSeq, parseDocument } from "yaml";
import { pinnedJar } from "../../src/astack/change-proof/runner.ts";
import { heavyTestTimeout } from "../heavy-test.ts";
import {
	GATE_RUNS,
	git,
	LADDER_FILES,
	ladderRepo,
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
	if (process.env.JAVA_HOME !== undefined && extra.JAVA_HOME === undefined)
		env.JAVA_HOME = process.env.JAVA_HOME;
	return env;
}

const preparedTlc = await pinnedJar(proofEnv({}), scratch);
if (!preparedTlc.ok) throw new Error(preparedTlc.error);

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

const rule = (section: string): string =>
	`rule: read the section "${section}" of the file that "astack skill-path astack:pr-review-hardening references/proof-contract.md" prints\n`;

const TLC_RECORD = (code: number): string =>
	`echo '@!@!@STARTMSG ${code}:1 @!@!@'; echo 'fake'; echo '@!@!@ENDMSG ${code} @!@!@'`;

const REAL_JAVA = process.env.JAVA_HOME
	? join(process.env.JAVA_HOME, "bin", "java")
	: spawnSync("sh", ["-c", "command -v java"], {
			encoding: "utf8",
		}).stdout.trim();

function javaShim(dir: string, body: readonly string[]): string {
	const home = join(scratch, dir);
	mkdirSync(join(home, "bin"), { recursive: true });
	const java = join(home, "bin", "java");
	writeFileSync(
		java,
		[
			"#!/bin/sh",
			`for last; do :; done; echo "$last" >> '${join(home, "starts.log")}'`,
			...body,
			"",
		].join("\n"),
	);
	chmodSync(java, 0o755);
	return home;
}

function fakeJava(dir: string, positive: string, negative: string): string {
	return javaShim(dir, [
		`if [ "$1" = -version ]; then echo 'openjdk version "21.0.2"' >&2; exit 0; fi`,
		`if grep -qF '/\\ fresh /\\ status' Gate.tla; then ${positive}; fi`,
		negative,
	]);
}

function loggingJava(dir: string, gatePositive = ""): string {
	return javaShim(dir, [
		...(gatePositive === ""
			? []
			: [
					`if [ "$last" = Gate.tla ] && grep -qF '/\\ fresh /\\ status' Gate.tla; then ${gatePositive}; fi`,
				]),
		`exec '${REAL_JAVA}' "$@"`,
	]);
}

function starts(home: string): Readonly<Record<string, number>> {
	let log = "";
	try {
		log = readFileSync(join(home, "starts.log"), "utf8");
	} catch {
		return {};
	}
	const counts: Record<string, number> = {};
	for (const name of log.split("\n").filter(Boolean))
		counts[name] = (counts[name] ?? 0) + 1;
	return counts;
}

describe("astack check proof", () => {
	test.each(["check proof", "check-proof"])(
		"[control:proof-valid-triple] [control:rl-legacy] %s admits a valid proof after a fresh positive, the named negative and an unchanged positive TLC run, with the output of a repo with no registry",
		(name) => {
			const repo = proofRepo(scratch);
			const args = name === "check proof" ? ["--base", repo.base] : [];
			const run = proof(repo.root, args, {}, name.split(" "));
			expect(run.err).toBe("");
			expect(run.out).toStartWith(
				`${GATE_RUNS}receipt: change gate-admission base `,
			);
			expect(lastLine(run.out)).toStartWith(
				"ok: proof gate-admission admitted at ",
			);
			expect(run.code).toBe(0);
		},
		heavyTestTimeout,
	);

	test(
		"[control:proof-release-history] the release verification checkout can admit a proof against its historical base",
		() => {
			const workflow = parseDocument(
				readFileSync(
					resolve(import.meta.dir, "../../.github/workflows/release.yml"),
					"utf8",
				),
			);
			const steps = workflow.getIn(["jobs", "verify", "steps"], true);
			if (!isSeq(steps)) throw new Error("release verification has no steps");
			const checkout = steps.items.find((step) => {
				if (!isMap(step)) return false;
				const action = step.get("uses");
				return (
					typeof action === "string" && action.startsWith("actions/checkout@")
				);
			});
			if (!isMap(checkout))
				throw new Error("release verification has no checkout");
			const depth = checkout.getIn(["with", "fetch-depth"]) ?? 1;
			if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 0)
				throw new Error("release verification has no valid fetch depth");
			const repo = proofRepo(scratch);
			git(repo.root, "tag", "v0.1.0");
			const source = pathToFileURL(repo.root).href;
			const shallow = join(scratch, "release-shallow");
			git(
				scratch,
				"clone",
				"-q",
				"--branch",
				"v0.1.0",
				"--depth",
				"1",
				source,
				shallow,
			);
			expect(proof(shallow)).toEqual({
				code: 1,
				err: rule("Base"),
				out: `stop: proof stale: the base ${repo.base} is not a commit in this repository\n`,
			});
			const verified = join(scratch, "release-verify");
			const depthArgs = depth === 0 ? [] : ["--depth", String(depth)];
			git(
				scratch,
				"clone",
				"-q",
				"--branch",
				"v0.1.0",
				...depthArgs,
				source,
				verified,
			);
			const run = proof(verified);
			expect(run.err).toBe("");
			expect(lastLine(run.out)).toBe(
				`ok: proof gate-admission admitted at ${git(repo.root, "rev-parse", "HEAD")}`,
			);
			expect(run.code).toBe(0);
		},
		heavyTestTimeout,
	);

	test("[control:proof-missing-manifest] a repo with no proof manifest fails", () => {
		const root = join(scratch, "empty");
		mkdirSync(root);
		git(root, "init", "-q", "-b", "main");
		const run = proof(root);
		expect(run.out).toBe("stop: proof schema: .astack/proof.json is missing\n");
		expect(run.code).toBe(1);
	});

	test(
		"an ignored manifest still belongs to the proof input digest",
		() => {
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
		},
		heavyTestTimeout,
	);

	test(
		"[control:proof-index-binding] an index-only change during model execution makes the proof stale",
		async () => {
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
			expect(run.err).toBe(rule("Base"));
			expect(run.code).toBe(1);
			expect(lastLine(run.out)).toBe(
				"stop: proof stale: the candidate inputs changed during the proof: the index",
			);
			expect(readFileSync(path, "utf8")).toBe(original);
			expect(
				git(repo.root, "diff", "--cached", "--", "formal/Gate.tla"),
			).toContain("-Admit ==");
		},
		heavyTestTimeout,
	);

	test(
		"[control:proof-worktree-mode] losing an unstaged launcher execute bit during model execution makes the proof stale",
		async () => {
			const repo = proofRepo(scratch);
			git(repo.root, "config", "core.fileMode", "true");
			const launcher = join(repo.root, "src/launcher.sh");
			const content = "#!/bin/sh\nprintf 'ready\\n'\n";
			writeFileSync(launcher, content);
			chmodSync(launcher, 0o755);
			git(repo.root, "add", "src/launcher.sh");
			git(repo.root, "commit", "-q", "-m", "add the launcher");
			const index = git(repo.root, "ls-files", "--stage", "-z");
			const executable = spawnSync(launcher, [], { encoding: "utf8" });
			expect({ code: executable.status, out: executable.stdout }).toEqual({
				code: 0,
				out: "ready\n",
			});
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
						chmodSync(launcher, 0o644);
					}
				});
				child.stderr.on("data", (chunk: Buffer) => {
					err += chunk.toString();
				});
				child.on("close", (code) => done({ code, out, err }));
			});
			expect(changed).toBe(true);
			expect(run.err).toBe(rule("Base"));
			expect(readFileSync(launcher, "utf8")).toBe(content);
			expect(git(repo.root, "ls-files", "--stage", "-z")).toBe(index);
			expect(git(repo.root, "diff", "--summary", "--", "src/launcher.sh")).toBe(
				"mode change 100755 => 100644 src/launcher.sh",
			);
			const blocked = spawnSync(launcher, [], { encoding: "utf8" });
			expect(blocked.error?.message).toContain("EACCES");
			expect(lastLine(run.out)).toBe(
				"stop: proof stale: the candidate inputs changed during the proof: src/launcher.sh",
			);
			expect(run.code).toBe(1);
		},
		heavyTestTimeout,
	);

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
		[
			"an untracked file whose name holds a line feed and an ok line",
			(root) => writeFileSync(join(root, "notes/a\nok: proof forged"), "new\n"),
			"notes/a\\u000aok: proof forged",
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
			'stop: proof countermodel: the negative run exited 150 with error 3002, not the expected invariant violation. SANY reports module Gate, line 7, column 29: Encountered "Beginning of definition" at line 7, column 29 and token "/\\\\"\n',
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
		heavyTestTimeout,
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

	test(
		"[control:proof-timeout-cleanup] a model run past the deadline is killed and its temp root is removed",
		() => {
			const deadlineMs = 200;
			const repo = proofRepo(scratch, () => {}, {
				...PROOF_FILES,
				"formal/Gate.tla": SLOW_GATE_TLA,
			});
			const tmp = join(scratch, "tmp-timeout");
			mkdirSync(tmp);
			const run = proof(repo.root, [], {
				TMPDIR: tmp,
				ASTACK_PROOF_TIMEOUT_MS: String(deadlineMs),
			});
			expect(run.out).toBe(
				`stop: proof model: the positive run passed the ${deadlineMs} ms deadline and was stopped\n`,
			);
			expect(run.code).toBe(1);
			expect(readdirSync(tmp)).toEqual([]);
		},
		heavyTestTimeout,
	);

	test("[control:proof-run-order] a failing positive run that ends after a wrong negative run stops on the positive run", () => {
		const repo = proofRepo(scratch);
		const tmp = join(scratch, "tmp-order");
		mkdirSync(tmp);
		const ended = join(scratch, "order-negative-ended");
		const run = proof(repo.root, [], {
			TMPDIR: tmp,
			ASTACK_PROOF_TIMEOUT_MS: "5000",
			JAVA_HOME: fakeJava(
				"java-order",
				`while [ ! -f '${ended}' ]; do sleep 0.02; done; ${TLC_RECORD(1000)}; exit 150`,
				`touch '${ended}'; exit 0`,
			),
		});
		expect(run.out).toBe(
			"stop: proof model: the positive run exited 150 with error 1000\n",
		);
		expect(run.code).toBe(1);
		expect(readdirSync(tmp)).toEqual([]);
	});

	test("[control:proof-run-stop] a positive parse error stops the proof at once, kills the held negative run and removes every temp root", () => {
		const repo = proofRepo(scratch);
		const tmp = join(scratch, "tmp-stop");
		mkdirSync(tmp);
		const started = performance.now();
		const run = proof(repo.root, [], {
			TMPDIR: tmp,
			JAVA_HOME: fakeJava(
				"java-stop",
				`${TLC_RECORD(3002)}; exit 150`,
				"exec sleep 30",
			),
		});
		expect(performance.now() - started).toBeLessThan(2000);
		expect(run.out).toBe(
			"stop: proof model: the positive run exited 150 with error 3002\n",
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

	test("[control:proof-stop-section] a schema stop keeps its stdout line and writes the section of its stage to stderr", () => {
		const repo = proofRepo(scratch, (p) => {
			Object.assign(p, { receipt: "stored" });
		});
		const run = proof(repo.root);
		expect(run.out).toBe(
			'stop: proof schema: the proof has the unknown key "receipt"\n',
		);
		expect(run.err).toBe(rule("Required records"));
		expect(run.code).toBe(2);
	});

	test(
		"[control:proof-base-ancestor] a manifest base older than the merge base admits, prints both bases and keeps the files of main out of scope",
		() => {
			const repo = proofRepo(scratch);
			git(repo.root, "checkout", "-q", "-b", "trunk", repo.base);
			writeFileSync(join(repo.root, "README.md"), "# Gate\n\nMain moved.\n");
			git(repo.root, "commit", "-q", "-am", "main moves");
			const moved = git(repo.root, "rev-parse", "HEAD");
			git(repo.root, "update-ref", "refs/remotes/origin/main", moved);
			git(repo.root, "checkout", "-q", "main");
			git(repo.root, "merge", "-q", "--no-edit", "trunk");
			expect(proof(repo.root).out).toBe(
				"stop: proof controls: no scope row covers the changed path README.md\n",
			);
			const run = proof(repo.root, ["--base", "origin/main"]);
			expect(run.err).toBe("");
			expect(run.out).toContain(
				`\nreceipt: change gate-admission base ${repo.base} diff base ${moved} head ${git(repo.root, "rev-parse", "HEAD")} digest `,
			);
			expect(lastLine(run.out)).toStartWith(
				"ok: proof gate-admission admitted at ",
			);
			expect(run.code).toBe(0);
		},
		heavyTestTimeout,
	);

	test("[control:proof-base-not-ancestor] a manifest base that is not an ancestor of the merge base stops and names both commits", () => {
		const repo = proofRepo(scratch);
		const own = git(repo.root, "rev-parse", "HEAD");
		git(repo.root, "update-ref", "refs/remotes/origin/main", repo.base);
		const path = join(repo.root, ".astack/proof.json");
		writeFileSync(
			path,
			readFileSync(path, "utf8").replace(`"${repo.base}"`, `"${own}"`),
		);
		git(repo.root, "commit", "-q", "-am", "base the proof on its own commit");
		const run = proof(repo.root, ["--base", "origin/main"]);
		expect(run.out).toBe(
			`stop: proof stale: the manifest base ${own} is not an ancestor of the merge base ${repo.base} of origin/main and HEAD\n`,
		);
		expect(run.code).toBe(1);
	});

	test("[control:proof-base-replace] a replace object on the merge base cannot hide a changed path from the scope check", () => {
		const repo = proofRepo(scratch);
		writeFileSync(join(repo.root, "README.md"), "# Changed\n");
		git(repo.root, "commit", "-q", "-am", "change the readme");
		git(repo.root, "checkout", "-q", "-b", "fake", repo.base);
		writeFileSync(join(repo.root, "README.md"), "# Changed\n");
		git(repo.root, "commit", "-q", "-am", "fake base");
		const tree = git(repo.root, "rev-parse", "HEAD^{tree}");
		git(repo.root, "checkout", "-q", "main");
		const fake = git(repo.root, "commit-tree", tree, "-m", "fake base");
		git(repo.root, "replace", repo.base, fake);
		git(repo.root, "update-ref", "refs/remotes/origin/main", repo.base);
		const run = proof(repo.root, ["--base", "origin/main"]);
		expect(run.out).toBe(
			"stop: proof controls: no scope row covers the changed path README.md\n",
		);
		expect(run.code).toBe(1);
	});

	describe("the proof rung", () => {
		const head = (root: string): string => git(root, "rev-parse", "HEAD");
		test("[control:rl-r0] a docs-only diff prints rung R0, admits with a receipt that names no jar and starts no Java process, also with no Java on PATH", () => {
			const repo = ladderRepo(scratch, {
				change: { "docs/notes.md": "# Notes\n" },
			});
			const java = loggingJava("java-r0");
			const run = proof(repo.root, [], { JAVA_HOME: java });
			const bin = join(scratch, "git-only");
			mkdirSync(bin, { recursive: true });
			const gitPath = spawnSync("sh", ["-c", "command -v git"], {
				encoding: "utf8",
			}).stdout.trim();
			symlinkSync(gitPath, join(bin, "git"));
			const bare = proof(repo.root, [], { PATH: bin });
			expect({
				lines: run.out.split("\n"),
				err: run.err,
				code: run.code,
			}).toEqual({
				lines: [
					"rung: R0 by the changed path .astack/proof.json",
					expect.stringMatching(
						new RegExp(
							`^receipt: change gate-admission base ${repo.base} diff base ${repo.base} head ${head(repo.root)} digest sha256:[0-9a-f]{64} over \\d+ files$`,
						),
					),
					`ok: proof gate-admission admitted at ${head(repo.root)}`,
					"",
				],
				err: "",
				code: 0,
			});
			expect(bare).toEqual(run);
			expect(starts(java)).toEqual({});
		});

		test(
			"[control:rl-floor] a base floor of R4 raises a docs-only diff to R4 and runs the manifest model, and a lower tree floor cannot lower it",
			() => {
				const repo = ladderRepo(scratch, {
					base: { ".astack/profile.json": '{"proof":{"minRung":"R4"}}\n' },
					change: {
						"docs/notes.md": "# Notes\n",
						".astack/profile.json": '{"proof":{"minRung":"R0"}}\n',
					},
				});
				const java = loggingJava("java-floor");
				const run = proof(repo.root, [], { JAVA_HOME: java });
				expect(run.out).toStartWith(
					`rung: R4 by proof.minRung R4 of .astack/profile.json at the diff base\nmodel: Gate formal/Gate.tla\n${GATE_RUNS}receipt: change gate-admission base `,
				);
				expect(run.out).toContain(" files, tla2tools 1.7.4 sha256:");
				expect(run.code).toBe(0);
				expect(starts(java)).toEqual({ "-version": 1, "Gate.tla": 3 });
			},
			heavyTestTimeout,
		);

		test(
			"[control:rl-select] a covered path runs the manifest model first and then the model of the path, one triple each",
			() => {
				const repo = ladderRepo(scratch, {
					change: { "src/lock/lock.ts": "export const lock = 2;\n" },
				});
				const java = loggingJava("java-select");
				const run = proof(repo.root, [], { JAVA_HOME: java });
				expect(run.out).toStartWith(
					`rung: R4 by the changed path src/lock/lock.ts\nmodel: Gate formal/Gate.tla\n${GATE_RUNS}model: Lock formal/Lock.tla\npositive: 2 distinct states, 3 generated, 0 left on queue\nnegative: Close violates TypeOK with a counterexample of 2 states: `,
				);
				expect(lastLine(run.out)).toBe(
					`ok: proof gate-admission admitted at ${head(repo.root)}`,
				);
				expect(starts(java)).toEqual({
					"-version": 1,
					"Gate.tla": 3,
					"Lock.tla": 3,
				});
			},
			heavyTestTimeout,
		);

		test(
			"[control:rl-one-run] a manifest model that a path also selects runs one triple with the manifest negative",
			() => {
				const repo = ladderRepo(scratch, {
					change: {
						"src/gate.ts": `${PROOF_FILES["src/gate.ts"]}export const again = 1;\n`,
					},
				});
				const java = loggingJava("java-one");
				const run = proof(repo.root, [], { JAVA_HOME: java });
				expect(run.out).toStartWith(
					`rung: R4 by the changed path src/gate.ts\nmodel: Gate formal/Gate.tla\n${GATE_RUNS}receipt: `,
				);
				expect(run.code).toBe(0);
				expect(starts(java)).toEqual({ "-version": 1, "Gate.tla": 3 });
			},
			heavyTestTimeout,
		);

		const lowered = (): string => {
			const registry = JSON.parse(LADDER_FILES["formal/models.json"] ?? "");
			for (const entry of registry.models) entry.covers = [];
			registry.contractOnly = ["**"];
			return `${JSON.stringify(registry, null, 2)}\n`;
		};
		test.each<
			[string, Parameters<typeof ladderRepo>[1], (root: string) => void]
		>([
			[
				"a skip-worktree edit of the registry",
				{
					change: {
						"src/gate.ts": `${PROOF_FILES["src/gate.ts"]}export const again = 1;\n`,
					},
				},
				(root) => {
					git(root, "update-index", "--skip-worktree", "formal/models.json");
					writeFileSync(join(root, "formal/models.json"), lowered());
				},
			],
			[
				"an ignored registry that only the tree holds",
				{
					omit: ["formal/models.json"],
					change: {
						"src/gate.ts": `${PROOF_FILES["src/gate.ts"]}export const again = 1;\n`,
					},
				},
				(root) => {
					writeFileSync(
						join(root, ".git/info/exclude"),
						"formal/models.json\n",
					);
					writeFileSync(join(root, "formal/models.json"), lowered());
				},
			],
		])(
			"[control:rl-hidden-registry] %s that git diff does not list runs each model at R4",
			(_name, plan, hide) => {
				const repo = ladderRepo(scratch, plan);
				hide(repo.root);
				expect(git(repo.root, "status", "--porcelain")).toBe("");
				const java = loggingJava(`java-hidden-${plan.omit === undefined}`);
				const run = proof(repo.root, [], { JAVA_HOME: java });
				expect(run.out).toStartWith(
					`rung: R4 by the changed path formal/models.json\nmodel: Gate formal/Gate.tla\n${GATE_RUNS}model: Lock formal/Lock.tla\npositive: 2 distinct states, 3 generated, 0 left on queue\n`,
				);
				expect(lastLine(run.out)).toBe(
					`ok: proof gate-admission admitted at ${head(repo.root)}`,
				);
				expect(starts(java)).toEqual({
					"-version": 1,
					"Gate.tla": 3,
					"Lock.tla": 3,
				});
			},
			heavyTestTimeout,
		);

		test.each<[string, Parameters<typeof ladderRepo>[1], string, string]>([
			[
				"[control:rl-fail-closed] an uncovered file under a fail-closed glob",
				{ change: { "src/guard/new.ts": "export const guard = 1;\n" } },
				"rung",
				"the changed path src/guard/new.ts is under the fail-closed glob src/guard/** of formal/models.json, but no model glob and no unmodelled entry names it",
			],
			[
				"[control:rl-registry-gone] a deleted registry",
				{ remove: ["formal/models.json"] },
				"rung",
				"the diff base holds formal/models.json, but the tree does not. A model leaves the registry only through an edit of formal/models.json",
			],
			[
				"[control:rl-stage-order-cli] a domain error with an uncovered fail-closed file",
				{
					change: { "src/guard/new.ts": "export const guard = 1;\n" },
					edit: (p) => {
						p.domain.terms = ["Gate", "Stale receipt"];
					},
				},
				"domain",
				'CONTEXT.md defines no term "Stale receipt"',
			],
		])("%s stops before any Java process", (_name, plan, stage, message) => {
			const repo = ladderRepo(scratch, plan);
			const java = loggingJava(`java-stop-${stage}-${message.length}`);
			const run = proof(repo.root, [], { JAVA_HOME: java });
			expect(run).toEqual({
				code: 1,
				out: `stop: proof ${stage}: ${message}\n`,
				err: rule(
					stage === "rung" ? "Rungs and models" : "Domain and decisions",
				),
			});
			expect(starts(java)).toEqual({});
		});

		test(
			"[control:rl-stop-order] a failed positive run of the first model stops at model and starts no triple of the second model",
			() => {
				const repo = ladderRepo(scratch, {
					change: { "src/lock/lock.ts": "export const lock = 2;\n" },
				});
				const java = loggingJava(
					"java-stop-order",
					`${TLC_RECORD(1000)}; exit 150`,
				);
				const run = proof(repo.root, [], { JAVA_HOME: java });
				expect(run.out).toBe(
					"rung: R4 by the changed path src/lock/lock.ts\nmodel: Gate formal/Gate.tla\nstop: proof model: the positive run exited 150 with error 1000\n",
				);
				expect(run.code).toBe(1);
				expect(starts(java)).toEqual({ "-version": 1, "Gate.tla": 3 });
			},
			heavyTestTimeout,
		);

		test(
			"[control:rl-stale] an edit of formal/models.json during the runs makes the proof stale and names the file",
			async () => {
				const repo = ladderRepo(scratch, {
					change: {
						"src/gate.ts": `${PROOF_FILES["src/gate.ts"]}export const again = 1;\n`,
					},
				});
				const path = join(repo.root, "formal/models.json");
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
							writeFileSync(path, `${original}\n`);
						}
					});
					child.stderr.on("data", (chunk: Buffer) => {
						err += chunk.toString();
					});
					child.on("close", (code) => done({ code, out, err }));
				});
				expect(changed).toBe(true);
				expect(lastLine(run.out)).toBe(
					"stop: proof stale: the candidate inputs changed during the proof: formal/models.json",
				);
				expect(run.err).toBe(rule("Base"));
				expect(run.code).toBe(1);
			},
			heavyTestTimeout,
		);
	});
});
