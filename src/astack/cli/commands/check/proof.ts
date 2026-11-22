import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
	type AdmissionFacts,
	admitChangeProof,
	type ChangedPath,
	checkReferences,
	type FileRead,
	type IntegrationHistory,
	type ModelEvidence,
	matrixSourcePaths,
	modelPaths,
	modelRuns,
	type ProofBase,
	planModelFiles,
	type RepoView,
	referencedPaths,
	type Snapshot,
} from "../../../change-proof/admission.ts";
import {
	changedPaths,
	type DiffTarget,
	mergeBase,
	proofBase,
	readCommittedFile,
	readIntegrationHistory,
	readRepoFile,
	snapshot,
} from "../../../change-proof/candidate.ts";
import {
	type ChangeProof,
	DEFAULT_PROOF_MANIFEST,
	parseChangeProof,
	type Rejection,
	STAGE_SECTIONS,
	type Stage,
} from "../../../change-proof/contract.ts";
import { parseRegistry } from "../../../change-proof/registry.ts";
import {
	deriveLadder,
	type Ladder,
	type LadderRun,
	type ModelRegistry,
	modelFiles,
	REGISTRY_PATH,
	type Rung,
} from "../../../change-proof/rung.ts";
import {
	type Checker,
	DEADLINE_CAP_MS,
	deadlineMs,
	javaRuntime,
	type ModelRun,
	pinnedJar,
	runModel,
	TLC_PIN,
} from "../../../change-proof/runner.ts";
import type { ModelFile, ModelPlan } from "../../../change-proof/tla.ts";
import {
	type Counts,
	judgeNegative,
	judgePositive,
	type RunEnd,
	type RunLabel,
	type Violation,
} from "../../../change-proof/tlc.ts";
import { repoRoot } from "../../../git.ts";
import { PROFILE_PATH, proofFloor } from "../../../profile.ts";
import { err, ok, type Result } from "../../../result.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check proof";

type ManifestInput = { readonly path: string; readonly text: string };

type Options = {
	readonly manifest: string | undefined;
	readonly base: string | undefined;
	readonly summary: boolean;
};

function options(args: readonly string[]): Result<Options, string> {
	let manifest: string | undefined;
	let base: string | undefined;
	let summary = false;
	for (let at = 0; at < args.length; at++) {
		const arg = args[at] ?? "";
		if (arg === "--summary") summary = true;
		else if (arg === "--base") {
			const value = args[at + 1];
			if (value === undefined || value.startsWith("-") || value === "")
				return err("--base needs a ref");
			if (base !== undefined) return err("give --base once");
			base = value;
			at++;
		} else if (arg.startsWith("-")) return err(`unknown argument ${arg}`);
		else if (manifest !== undefined)
			return err("give at most one manifest path");
		else manifest = arg;
	}
	return ok({ manifest, base, summary });
}

const LINE_BREAKING = /[\p{Cc}\u2028\u2029]/gu;

function oneLine(text: string): string {
	return text.replace(
		LINE_BREAKING,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

function stop(io: Io, rejection: Rejection): number {
	io.out(`stop: proof ${rejection.stage}: ${oneLine(rejection.message)}\n`);
	io.err(
		`rule: read the section "${STAGE_SECTIONS[rejection.stage]}" of the file that "astack skill-path astack:pr-review-hardening references/proof-contract.md" prints\n`,
	);
	return rejection.stage === "schema" ? 2 : 1;
}

function stopAt(io: Io, stage: Stage, message: string): number {
	return stop(io, { stage, message });
}

function summaryLines(proof: ChangeProof): readonly string[] {
	const { domain, category, abstraction, model, negative } = proof;
	const laws = (status: "witnessed" | "not_applicable"): string =>
		category.laws
			.flatMap((law) => {
				if (law.status !== status) return [];
				if (law.status === "not_applicable")
					return [`${law.law} (${law.reason})`];
				return [
					`${law.law} by ${law.witness.kind}:${law.witness.kind === "model" ? law.witness.name : law.witness.id}`,
				];
			})
			.join(", ") || "none";
	return [
		`Change: ${proof.change} from base ${proof.base}`,
		`Domain: ${domain.context}; aggregate ${domain.aggregate.symbol} in ${domain.aggregate.path}; terms ${domain.terms.join(", ")}; invariants ${domain.invariants.map((row) => `${row.name} -> ${row.modelRef}`).join(", ")}`,
		`Category: carrier ${category.carrier.kind}; arrows ${category.arrows.map((arrow) => `${arrow.name}: ${arrow.from} -> ${arrow.to}`).join(", ")}; composites ${category.composites.map((composite) => composite.arrows.join(` ${composite.op} `)).join(", ") || "none"}; equality ${category.equality}; witnessed ${laws("witnessed")}; not applicable ${laws("not_applicable")}`,
		`Abstraction: hides ${abstraction.hides}; callers know ${abstraction.callersKnow.join(", ")}; deletion test ${abstraction.deletionTest}`,
		`ADR: ${domain.adrs.map((adr) => `${adr.file} ${adr.decision}`).join(", ")}`,
		`Formal: ${model.module} with ${model.config}; invariants ${model.invariants.join(", ")}; properties ${model.properties.join(", ") || "none"}; negative ${negative.action} expects ${negative.expect.kind} ${negative.expect.name}: ${negative.defect}`,
		`Limits: ${proof.limits.join(", ")}`,
		"status: UNVERIFIED. This summary ran no check and no model, so it is not a proof.",
	];
}

function readManifest(
	io: Io,
	root: string,
	arg: string | undefined,
): Result<ManifestInput, Rejection> {
	const path = resolve(
		arg === undefined ? root : io.cwd,
		arg ?? DEFAULT_PROOF_MANIFEST,
	);
	const shown = relative(root, path) || path;
	const read = readRepoFile(root, relative(root, path));
	if (read.kind === "text")
		return ok({ path: relative(root, path), text: read.text });
	return err({
		stage: read.problem === "missing" ? "schema" : "domain",
		message:
			read.problem === "missing"
				? `${shown} is missing`
				: `${shown} cannot be read inside the repository`,
	});
}

function repoView(
	root: string,
	proof: ChangeProof,
	base: ProofBase,
	changed: RepoView["changed"],
	ratifications: ReadonlyMap<string, Result<IntegrationHistory, string>>,
): RepoView {
	const files = new Map<string, FileRead>();
	for (const path of referencedPaths(proof))
		files.set(path, readRepoFile(root, path));
	const matrix = files.get(proof.domain.controls.matrix);
	if (matrix?.kind === "text")
		for (const path of matrixSourcePaths(matrix.text))
			files.set(path, readRepoFile(root, path));
	const modelFiles = new Map(
		modelPaths(proof).map((path) => [path, readRepoFile(root, path)]),
	);
	return { base, files, modelFiles, changed, ratifications };
}

function ratificationHistories(
	root: string,
	proof: ChangeProof,
	base: ProofBase,
): ReadonlyMap<string, Result<IntegrationHistory, string>> {
	const histories = new Map<string, Result<IntegrationHistory, string>>();
	for (const adr of proof.domain.adrs) {
		const ratification = adr.ratification;
		if (ratification === undefined || histories.has(ratification.integratedAt))
			continue;
		const paths = [
			...new Set(
				proof.domain.adrs.flatMap((reference) =>
					reference.ratification?.integratedAt === ratification.integratedAt
						? [reference.file, reference.ratification.process.file]
						: [],
				),
			),
		].sort();
		histories.set(
			ratification.integratedAt,
			readIntegrationHistory(root, base, ratification.integratedAt, paths),
		);
	}
	return histories;
}

function historyState(
	histories: ReadonlyMap<string, Result<IntegrationHistory, string>>,
): string {
	if (histories.size === 0) return "";
	return JSON.stringify(
		[...histories].map(([commit, read]) => [
			commit,
			read.ok
				? {
						base: read.value.base,
						mergeBase: read.value.mergeBase,
						integratedAt: read.value.integratedAt,
						files: [...read.value.files],
						baseFiles: [...read.value.baseFiles],
						mergeBaseFiles: [...read.value.mergeBaseFiles],
					}
				: { error: read.error },
		]),
	);
}

function countsLine(label: RunLabel, counts: Counts): string {
	return `${label}: ${counts.distinct} distinct states, ${counts.generated} generated, ${counts.queued} left on queue\n`;
}

type StartedRun = {
	readonly label: RunLabel;
	readonly run: Promise<ModelRun>;
};

function leftRoot(label: RunLabel, run: ModelRun): string | undefined {
	return run.cleanup.ok
		? undefined
		: `the ${label} run left its temp root: ${run.cleanup.error}`;
}

async function ended(started: StartedRun): Promise<Result<RunEnd, string>> {
	const run = await started.run;
	const leak = leftRoot(started.label, run);
	return leak === undefined ? ok(run.end) : err(leak);
}

async function stopRuns(
	io: Io,
	cancel: AbortController,
	runs: readonly StartedRun[],
	stage: Stage,
	message: string,
): Promise<number> {
	cancel.abort();
	const leaks = await Promise.all(
		runs.map(async (started) => leftRoot(started.label, await started.run)),
	);
	const lines = new Set([
		message,
		...leaks.filter((leak) => leak !== undefined),
	]);
	return stopAt(io, stage, [...lines].join("; "));
}

function registryAt(
	read: FileRead,
	where: string,
): Result<ModelRegistry | undefined, string> {
	if (read.kind === "problem")
		return read.problem === "missing"
			? ok(undefined)
			: err(`${REGISTRY_PATH} ${where} cannot be read`);
	const parsed = parseRegistry(read.text);
	return parsed.ok ? parsed : err(`${REGISTRY_PATH} ${where}: ${parsed.error}`);
}

function floorAt(read: FileRead, where: string): Result<Rung, string> {
	if (read.kind === "problem")
		return read.problem === "missing"
			? ok("R0")
			: err(`${PROFILE_PATH} ${where} cannot be read`);
	let parsed: unknown;
	try {
		parsed = JSON.parse(read.text);
	} catch {
		return err(`${PROFILE_PATH} ${where} is not valid JSON`);
	}
	const floor = proofFloor(parsed);
	return floor.ok ? floor : err(`${PROFILE_PATH} ${where}: ${floor.error}`);
}

const AT_BASE = "at the diff base";
const IN_TREE = "in the tree";

const LADDER_FILES = [REGISTRY_PATH, PROFILE_PATH] as const;
type LadderReads = Readonly<Record<(typeof LADDER_FILES)[number], FileRead>>;

function ladderReads(root: string): LadderReads {
	return {
		[REGISTRY_PATH]: readRepoFile(root, REGISTRY_PATH),
		[PROFILE_PATH]: readRepoFile(root, PROFILE_PATH),
	};
}

function sameRead(read: FileRead, again: FileRead): boolean {
	if (read.kind === "text")
		return again.kind === "text" && read.text === again.text;
	return again.kind === "problem" && read.problem === again.problem;
}

function readLadder(
	root: string,
	diffBase: string,
	changed: readonly ChangedPath[],
	proof: ChangeProof,
	reads: LadderReads,
): Result<Ladder, string> {
	const tree = registryAt(reads[REGISTRY_PATH], IN_TREE);
	if (!tree.ok) return tree;
	const base = registryAt(
		readCommittedFile(root, diffBase, REGISTRY_PATH),
		AT_BASE,
	);
	if (!base.ok) return base;
	if (tree.value === undefined && base.value === undefined)
		return ok({ kind: "legacy" });
	const baseFloor = floorAt(
		readCommittedFile(root, diffBase, PROFILE_PATH),
		AT_BASE,
	);
	if (!baseFloor.ok) return baseFloor;
	const treeFloor = floorAt(reads[PROFILE_PATH], IN_TREE);
	if (!treeFloor.ok) return treeFloor;
	return deriveLadder({
		changed,
		registry: { base: base.value, tree: tree.value },
		floor: { base: baseFloor.value, tree: treeFloor.value },
		manifest: proof,
		inTree: (path) => readRepoFile(root, path).kind === "text",
	});
}

function rungLine(ladder: Extract<Ladder, { kind: "ladder" }>): string {
	const { rung, cause } = ladder;
	const by =
		cause.kind === "path"
			? `the changed path ${oneLine(cause.path)}`
			: `proof.minRung ${rung} of ${PROFILE_PATH} ${cause.side === "base" ? AT_BASE : IN_TREE}`;
	return `rung: ${rung} by ${by}\n`;
}

function planRun(root: string, run: LadderRun): Result<ModelPlan, string> {
	const files = new Map(
		modelFiles(run.model).map((path) => [path, readRepoFile(root, path)]),
	);
	const plan = planModelFiles(run.model, run.negative, files);
	return plan.ok ? plan : err(`model ${run.name}: ${plan.error}`);
}

async function runTriple(
	io: Io,
	checker: Checker,
	plan: ModelPlan,
	run: LadderRun,
	timeoutMs: number,
): Promise<Result<ModelEvidence, number>> {
	const { properties } = plan.config;
	const cancel = new AbortController();
	const start = (label: RunLabel, files: readonly ModelFile[]): StartedRun => ({
		label,
		run: runModel(
			io.env,
			checker,
			files,
			plan.moduleFile,
			plan.configFile,
			timeoutMs,
			cancel.signal,
		),
	});
	const positiveRun = start("positive", plan.positive);
	const negativeRun = start("negative", plan.negative);
	const restoredRun = start("restored", plan.positive);
	const runs = [positiveRun, negativeRun, restoredRun];
	const halt = async (stage: Stage, message: string) =>
		err(await stopRuns(io, cancel, runs, stage, message));

	const positiveEnd = await ended(positiveRun);
	const positive = positiveEnd.ok
		? judgePositive("positive", positiveEnd.value, properties)
		: positiveEnd;
	if (!positive.ok) return halt("model", positive.error);
	io.out(countsLine("positive", positive.value));

	const negativeEnd = await ended(negativeRun);
	const negative: Result<Violation, string> = negativeEnd.ok
		? judgeNegative(negativeEnd.value, run.negative.expect)
		: negativeEnd;
	if (!negative.ok) return halt("countermodel", negative.error);
	io.out(
		`negative: ${run.negative.action} violates ${negative.value.name} with a counterexample of ${negative.value.states} states: ${negative.value.trace}\n`,
	);

	const restoredEnd = await ended(restoredRun);
	const restored = restoredEnd.ok
		? judgePositive("restored", restoredEnd.value, properties)
		: restoredEnd;
	if (!restored.ok) return halt("model", restored.error);
	io.out(countsLine("restored", restored.value));
	return ok({ positive, negative, restored });
}

async function prove(
	io: Io,
	root: string,
	proof: ChangeProof,
	target: DiffTarget,
	manifest: ManifestInput,
): Promise<number> {
	const base = proofBase(root, proof.base, target);
	if (!base.ok) return stopAt(io, "stale", base.error);
	const changed = changedPaths(root, base.value.diff);
	if (!changed.ok) return stopAt(io, "controls", changed.error);
	const reads = ladderReads(root);
	const ladder = readLadder(root, base.value.diff, changed.value, proof, reads);
	const runs = ladder.ok ? modelRuns(proof, ladder.value) : [];
	const matrix = readRepoFile(root, proof.domain.controls.matrix);
	const inputs = [
		manifest.path,
		...referencedPaths(proof),
		...modelPaths(proof),
		...(matrix.kind === "text" ? matrixSourcePaths(matrix.text) : []),
		...(ladder.ok && ladder.value.kind === "legacy"
			? []
			: [
					REGISTRY_PATH,
					PROFILE_PATH,
					...runs.flatMap((run) => modelFiles(run.model)),
				]),
	];
	const histories = ratificationHistories(root, proof, base.value);
	const before = snapshot(
		root,
		base.value.diff,
		changed.value,
		inputs,
		historyState(histories),
	);
	if (!before.ok) return stopAt(io, "stale", before.error);
	const view = repoView(root, proof, base.value, changed.value, histories);
	const references = checkReferences(proof, view);
	if (!references.ok) return stop(io, references.error);
	if (!ladder.ok) return stopAt(io, "rung", ladder.error);
	if (ladder.value.kind === "ladder") io.out(rungLine(ladder.value));
	const [manifestRun, ...selectedRuns] = runs;
	const planned: { readonly run: LadderRun; readonly plan: ModelPlan }[] =
		manifestRun === undefined
			? []
			: [{ run: manifestRun, plan: references.value }];
	for (const run of selectedRuns) {
		const plan = planRun(root, run);
		if (!plan.ok) return stopAt(io, "model", plan.error);
		planned.push({ run, plan: plan.value });
	}
	const timeoutMs = deadlineMs(io.env);
	if (!timeoutMs.ok) return usageError(io, `${NAME}: ${timeoutMs.error}`);
	let checker: Checker | undefined;
	const evidence: ModelEvidence[] = [];
	if (planned.length > 0) {
		const jar = await pinnedJar(io.env, root);
		if (!jar.ok) return stopAt(io, "model", jar.error);
		const java = javaRuntime(io.env);
		if (!java.ok) return stopAt(io, "model", java.error);
		checker = {
			jar: jar.value,
			java: java.value.java,
			javaVersion: java.value.version,
		};
		for (const { run, plan } of planned) {
			if (ladder.value.kind === "ladder")
				io.out(`model: ${oneLine(run.name)} ${oneLine(run.model.module)}\n`);
			const triple = await runTriple(io, checker, plan, run, timeoutMs.value);
			if (!triple.ok) return triple.error;
			evidence.push(triple.value);
		}
	}

	const changedAfter = changedPaths(root, base.value.diff);
	if (!changedAfter.ok) return stopAt(io, "stale", changedAfter.error);
	const after: Result<Snapshot, string> = snapshot(
		root,
		base.value.diff,
		changedAfter.value,
		inputs,
		historyState(ratificationHistories(root, proof, base.value)),
	);
	if (!after.ok) return stopAt(io, "stale", after.error);
	const currentManifest = readRepoFile(root, manifest.path);
	if (currentManifest.kind !== "text" || currentManifest.text !== manifest.text)
		return stopAt(io, "stale", "the manifest changed during the proof");
	const current = ladderReads(root);
	const moved = LADDER_FILES.filter(
		(path) => !sameRead(reads[path], current[path]),
	);
	if (moved.length > 0)
		return stopAt(
			io,
			"stale",
			`the candidate inputs changed during the proof: ${moved.join(", ")}`,
		);
	const facts: AdmissionFacts = {
		view,
		ladder,
		before: before.value,
		after: after.value,
		evidence,
	};
	const admitted = admitChangeProof(proof, facts);
	if (!admitted.ok) return stop(io, admitted.error);
	const proved = admitted.value;
	const tool =
		checker === undefined
			? ""
			: `, tla2tools ${TLC_PIN.version} sha256:${TLC_PIN.sha256} on Java ${checker.javaVersion}`;
	io.out(
		`receipt: change ${proved.change} base ${proved.base} diff base ${proved.diffBase} head ${proved.head} digest ${proved.digest} over ${proved.files} files${tool}\n`,
	);
	io.out(`ok: proof ${proved.change} admitted at ${proved.head}\n`);
	return 0;
}

async function run(args: readonly string[], io: Io): Promise<number> {
	const parsed = options(args);
	if (!parsed.ok) return usageError(io, `${NAME}: ${parsed.error}`);
	const top = repoRoot(io.cwd);
	if (top === undefined)
		return usageError(io, `${NAME}: not inside a git repository`);
	const root = realpathSync(top);
	const text = readManifest(io, root, parsed.value.manifest);
	if (!text.ok) {
		stop(io, text.error);
		return 1;
	}
	const proof = parseChangeProof(text.value.text);
	if (!proof.ok) return stop(io, proof.error);
	if (parsed.value.summary) {
		io.out(`${summaryLines(proof.value).join("\n")}\n`);
		return 0;
	}
	const ref = parsed.value.base;
	const target: Result<DiffTarget, string> =
		ref === undefined ? ok({ kind: "manifest-base" }) : mergeBase(root, ref);
	if (!target.ok) return stopAt(io, "stale", target.error);
	return prove(io, root, proof.value, target.value, text.value);
}

export const command: Command<Promise<number>> = {
	name: "proof",
	summary: `Admits one ChangeProof manifest (default ${DEFAULT_PROOF_MANIFEST}). It parses the strict version 1 JSON, resolves its glossary, aggregate, accepted ADR decisions, spec-drift matrix, composition links and model closure, and checks that the scope rows cover every changed, staged, removed and untracked path since the diff base. Then it reads formal/models.json and the proof.minRung floor of ${PROFILE_PATH} at the diff base and in the tree, and prints the proof rung and its cause. Below R4 it starts no Java process. At R4 it runs the manifest model first and then each other selected model, one after another. For each model it starts the pinned tla2tools.jar ${TLC_PIN.version} in three owned temporary copies at once: the positive model, the one named mutation, which must produce the expected violation, and the unchanged model again. It judges the runs in that order, and a stop kills the runs that are still live and starts no later model. A repo with no registry runs only the manifest model and prints no rung line. It hashes the candidate inputs before and after and never reads a stored receipt. With no --base, the diff base is the manifest base, which must be an ancestor of HEAD. With --base <ref>, the diff base is the merge base of the ref and HEAD, and the manifest base must be an ancestor of it. Git reads of the bases and the diff ignore replace objects and grafts. --summary prints the intent as UNVERIFIED and runs nothing. ASTACK_TLC_JAR names a pinned jar outside the repository, and ASTACK_PROOF_TIMEOUT_MS can lower the ${DEADLINE_CAP_MS / 1000} second deadline of each run. Exits 0 when admitted, 1 for missing or invalid evidence or a tool failure, and 2 for wrong arguments or a schema failure.`,
	usage: "check proof [manifest.json] [--base <ref>] [--summary]",
	run,
};
