import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
	type AdmissionFacts,
	admitChangeProof,
	checkReferences,
	type FileRead,
	type IntegrationHistory,
	matrixSourcePaths,
	modelPaths,
	type RepoView,
	referencedPaths,
	type Snapshot,
} from "../../../change-proof/admission.ts";
import {
	changedPaths,
	isAncestor,
	readIntegrationHistory,
	readRepoFile,
	resolveCommit,
	snapshot,
} from "../../../change-proof/candidate.ts";
import {
	type ChangeProof,
	parseChangeProof,
	type Rejection,
	type Stage,
} from "../../../change-proof/contract.ts";
import {
	type Checker,
	DEADLINE_CAP_MS,
	deadlineMs,
	javaRuntime,
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
import { err, ok, type Result } from "../../../result.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check proof";
const DEFAULT_MANIFEST = ".astack/proof.json";

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

function stop(io: Io, rejection: Rejection): number {
	io.out(`stop: proof ${rejection.stage}: ${rejection.message}\n`);
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
		arg ?? DEFAULT_MANIFEST,
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
	return { files, modelFiles, changed, ratifications };
}

function ratificationHistories(
	root: string,
	proof: ChangeProof,
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
			readIntegrationHistory(
				root,
				proof.base,
				ratification.integratedAt,
				paths,
			),
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
						integratedAt: read.value.integratedAt,
						files: [...read.value.files],
						baseFiles: [...read.value.baseFiles],
					}
				: { error: read.error },
		]),
	);
}

function countsLine(label: RunLabel, counts: Counts): string {
	return `${label}: ${counts.distinct} distinct states, ${counts.generated} generated, ${counts.queued} left on queue\n`;
}

type RunPlan = {
	readonly label: RunLabel;
	readonly files: readonly ModelFile[];
};

async function modelRun(
	io: Io,
	checker: Checker,
	plan: ModelPlan,
	run: RunPlan,
	timeoutMs: number,
): Promise<Result<RunEnd, string>> {
	const { end, cleanup } = await runModel(
		io.env,
		checker,
		run.files,
		plan.moduleFile,
		plan.configFile,
		timeoutMs,
	);
	if (!cleanup.ok)
		return err(`the ${run.label} run left its temp root: ${cleanup.error}`);
	return ok(end);
}

async function prove(
	io: Io,
	root: string,
	proof: ChangeProof,
	baseRef: string | undefined,
	manifest: ManifestInput,
): Promise<number> {
	if (resolveCommit(root, proof.base) !== proof.base)
		return stopAt(
			io,
			"stale",
			`the base ${proof.base} is not a commit in this repository`,
		);
	if (baseRef !== undefined) {
		const resolved = resolveCommit(root, baseRef);
		if (resolved !== proof.base)
			return stopAt(
				io,
				"stale",
				`--base ${baseRef} resolves to ${resolved ?? "no commit"}, not the manifest base ${proof.base}`,
			);
	}
	if (!isAncestor(root, proof.base, "HEAD"))
		return stopAt(
			io,
			"stale",
			`the base ${proof.base} is not an ancestor of HEAD`,
		);
	const changed = changedPaths(root, proof.base);
	if (!changed.ok) return stopAt(io, "controls", changed.error);
	const matrix = readRepoFile(root, proof.domain.controls.matrix);
	const inputs = [
		manifest.path,
		...referencedPaths(proof),
		...modelPaths(proof),
		...(matrix.kind === "text" ? matrixSourcePaths(matrix.text) : []),
	];
	const histories = ratificationHistories(root, proof);
	const before = snapshot(
		root,
		proof.base,
		changed.value,
		inputs,
		historyState(histories),
	);
	if (!before.ok) return stopAt(io, "stale", before.error);
	const view = repoView(root, proof, changed.value, histories);
	const plan = checkReferences(proof, view);
	if (!plan.ok) return stop(io, plan.error);
	const timeoutMs = deadlineMs(io.env);
	if (!timeoutMs.ok) return usageError(io, `${NAME}: ${timeoutMs.error}`);
	const jar = await pinnedJar(io.env, root);
	if (!jar.ok) return stopAt(io, "model", jar.error);
	const java = javaRuntime(io.env);
	if (!java.ok) return stopAt(io, "model", java.error);
	const checker: Checker = {
		jar: jar.value,
		java: java.value.java,
		javaVersion: java.value.version,
	};
	const temporal = plan.value.config.properties.length > 0;

	const positiveEnd = await modelRun(
		io,
		checker,
		plan.value,
		{ label: "positive", files: plan.value.positive },
		timeoutMs.value,
	);
	const positive = positiveEnd.ok
		? judgePositive("positive", positiveEnd.value, temporal)
		: positiveEnd;
	if (!positive.ok) return stopAt(io, "model", positive.error);
	io.out(countsLine("positive", positive.value));

	const negativeEnd = await modelRun(
		io,
		checker,
		plan.value,
		{ label: "negative", files: plan.value.negative },
		timeoutMs.value,
	);
	const negative: Result<Violation, string> = negativeEnd.ok
		? judgeNegative(negativeEnd.value, proof.negative.expect)
		: negativeEnd;
	if (!negative.ok) return stopAt(io, "countermodel", negative.error);
	io.out(
		`negative: ${proof.negative.action} violates ${negative.value.name} with a counterexample of ${negative.value.states} states\n`,
	);

	const restoredEnd = await modelRun(
		io,
		checker,
		plan.value,
		{ label: "restored", files: plan.value.positive },
		timeoutMs.value,
	);
	const restored = restoredEnd.ok
		? judgePositive("restored", restoredEnd.value, temporal)
		: restoredEnd;
	if (!restored.ok) return stopAt(io, "model", restored.error);
	io.out(countsLine("restored", restored.value));

	const changedAfter = changedPaths(root, proof.base);
	if (!changedAfter.ok) return stopAt(io, "stale", changedAfter.error);
	const after: Result<Snapshot, string> = snapshot(
		root,
		proof.base,
		changedAfter.value,
		inputs,
		historyState(ratificationHistories(root, proof)),
	);
	if (!after.ok) return stopAt(io, "stale", after.error);
	const currentManifest = readRepoFile(root, manifest.path);
	if (currentManifest.kind !== "text" || currentManifest.text !== manifest.text)
		return stopAt(io, "stale", "the manifest changed during the proof");
	const facts: AdmissionFacts = {
		view,
		before: before.value,
		after: after.value,
		evidence: { positive, negative, restored },
	};
	const admitted = admitChangeProof(proof, facts);
	if (!admitted.ok) return stop(io, admitted.error);
	const proved = admitted.value;
	io.out(
		`receipt: change ${proved.change} base ${proved.base} head ${proved.head} digest ${proved.digest} over ${proved.files} files, tla2tools ${TLC_PIN.version} sha256:${TLC_PIN.sha256} on Java ${checker.javaVersion}\n`,
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
	return prove(io, root, proof.value, parsed.value.base, text.value);
}

export const command: Command<Promise<number>> = {
	name: "proof",
	summary: `Admits one ChangeProof manifest (default ${DEFAULT_MANIFEST}). It parses the strict version 1 JSON, resolves its glossary, aggregate, accepted ADR decisions, spec-drift matrix, composition links and model closure, and checks that the scope rows cover every changed, staged, removed and untracked path since the fixed base. Then it runs the pinned tla2tools.jar ${TLC_PIN.version} three times in owned temporary copies: the positive model, the one named mutation, which must produce the expected violation, and the unchanged model again. It hashes the candidate inputs before and after and never reads a stored receipt. --base must resolve to the manifest base. --summary prints the intent as UNVERIFIED and runs nothing. ASTACK_TLC_JAR names a pinned jar outside the repository, and ASTACK_PROOF_TIMEOUT_MS can lower the ${DEADLINE_CAP_MS / 1000} second deadline of each run. Exits 0 when admitted, 1 for missing or invalid evidence or a tool failure, and 2 for wrong arguments or a schema failure.`,
	usage: "check proof [manifest.json] [--base <ref>] [--summary]",
	run,
};
