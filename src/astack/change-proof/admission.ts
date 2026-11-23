import { adrProse, adrStatus, decisionSpan, PROOF_TITLES } from "../adr.ts";
import type { DomainBlock } from "../domain/notation.ts";
import {
	type ContextsCard,
	domainFindings,
	type FilesCell,
} from "../domain/rules.ts";
import type { WitnessStop, WitnessVerdict } from "../domain/witness-run.ts";
import { anyGlob, globMatches } from "../glob.ts";
import { all, andThen, err, map, ok, type Result } from "../result.ts";
import { checkDrift, parseMatrix, type Source } from "../spec-drift.ts";
import {
	type AdrReference,
	type ChangeProof,
	type FileLink,
	isManifestPath,
	type ModelContract,
	type NegativeControl,
	type Rejection,
	rejection,
	type Stage,
} from "./contract.ts";
import { compareLandedAuthority } from "./governing-authority.ts";
import {
	type Ladder,
	type LadderRun,
	type ModelRegistry,
	modelFiles,
	moduleName,
	REGISTRY_PATH,
	type Rung,
} from "./rung.ts";
import { type ModelPlan, planModel } from "./tla.ts";
import type { Counts, Violation } from "./tlc.ts";

export type FileProblem =
	| "missing"
	| "outside"
	| "not-a-file"
	| "symlink"
	| "unreadable";

export type FileRead =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "problem"; readonly problem: FileProblem };

export type ChangedPath = { readonly path: string; readonly present: boolean };

export type PlanRecord = {
	readonly block: DomainBlock;
	readonly cells: readonly FilesCell[];
	readonly card: ContextsCard;
};

export type PlanEvidence = {
	readonly record: Result<PlanRecord, Rejection>;
	readonly registry: ModelRegistry | undefined;
	readonly witness: Result<WitnessVerdict, WitnessStop> | undefined;
};

export function compositionNames(
	proof: ChangeProof,
	plan: PlanEvidence | undefined,
): Result<readonly string[], string> {
	const { composition } = proof;
	if (composition.kind === "category")
		return ok(composition.category.arrows.map((arrow) => arrow.link.symbol));
	if (plan === undefined) return err("the plan record was not read");
	return plan.record.ok
		? ok(plan.record.value.block.steps.map((step) => step.name))
		: err(plan.record.error.message);
}

export type ProofBase = {
	readonly manifest: string;
	readonly diff: string;
};

export type RepoView = {
	readonly base: ProofBase;
	readonly files: ReadonlyMap<string, FileRead>;
	readonly modelFiles: ReadonlyMap<string, FileRead>;
	readonly changed: readonly ChangedPath[];
	readonly plan?: PlanEvidence;
	readonly ratifications?: ReadonlyMap<
		string,
		Result<IntegrationHistory, string>
	>;
};

export type IntegrationHistory = {
	readonly integratedAt: string;
	readonly base: string;
	readonly mergeBase: string;
	readonly files: ReadonlyMap<string, FileRead>;
	readonly baseFiles: ReadonlyMap<string, FileRead>;
	readonly mergeBaseFiles: ReadonlyMap<string, FileRead>;
};

export type Snapshot = {
	readonly head: string;
	readonly digest: string;
	readonly files: number;
	readonly index: string;
	readonly history: string;
	readonly entries: ReadonlyMap<string, string>;
};

export type ModelEvidence = {
	readonly positive: Result<Counts, string>;
	readonly negative: Result<Violation, string>;
	readonly restored: Result<Counts, string>;
};

export type AdmissionFacts = {
	readonly view: RepoView;
	readonly ladder: Result<Ladder, string>;
	readonly before: Snapshot;
	readonly after: Snapshot;
	readonly evidence: readonly ModelEvidence[];
};

export type ModelAdmission = {
	readonly name: string;
	readonly positive: Counts;
	readonly negative: Violation;
	readonly action: string;
	readonly restored: Counts;
};

export type Admitted = {
	readonly change: string;
	readonly base: string;
	readonly diffBase: string;
	readonly head: string;
	readonly digest: string;
	readonly files: number;
	readonly rung: Rung | undefined;
	readonly models: readonly ModelAdmission[];
};

const PROBLEM_TEXT: Readonly<Record<FileProblem, string>> = {
	missing: "is missing",
	outside: "resolves outside the repository",
	"not-a-file": "is not a regular file",
	symlink: "has a symbolic link in its path",
	unreadable: "cannot be read",
};

export function compositionPaths(proof: ChangeProof): readonly string[] {
	const { composition } = proof;
	if (composition.kind === "plan") return [composition.plan];
	const { category } = composition;
	return [
		category.typedWitness,
		...category.objects.map((object) => object.link.path),
		...category.arrows.map((arrow) => arrow.link.path),
	];
}

export function referencedPaths(proof: ChangeProof): readonly string[] {
	const { domain, abstraction } = proof;
	const links: readonly FileLink[] = [
		domain.aggregate,
		...abstraction.relation.map((row) => row.concrete),
	];
	return [
		...new Set([
			domain.glossary,
			domain.controls.matrix,
			...compositionPaths(proof),
			...domain.adrs.map((adr) => adr.file),
			...domain.adrs.flatMap((adr) =>
				adr.ratification === undefined
					? []
					: [adr.ratification.process.file, adr.ratification.proofRecord],
			),
			...links.map((link) => link.path),
		]),
	];
}

export function modelPaths(proof: ChangeProof): readonly string[] {
	return modelFiles(proof.model);
}

export function modelRuns(
	proof: ChangeProof,
	ladder: Ladder,
): readonly LadderRun[] {
	if (ladder.kind === "ladder") return ladder.runs;
	return [
		{
			name: moduleName(proof.model.module),
			model: proof.model,
			negative: proof.negative,
		},
	];
}

export function matrixSourcePaths(matrixText: string): readonly string[] {
	const matrix = parseMatrix(matrixText);
	return matrix.ok ? [...matrix.value.specs, ...matrix.value.tests] : [];
}

type Check = Result<undefined, string>;
const PASS: Check = ok(undefined);
const fail = (message: string): Check => err(message);

function textOf(
	files: ReadonlyMap<string, FileRead>,
	path: string,
): Result<string, string> {
	const read = files.get(path);
	if (read === undefined) return err(`${path} was not read`);
	return read.kind === "text"
		? ok(read.text)
		: err(`${path} ${PROBLEM_TEXT[read.problem]}`);
}

function mentions(text: string, symbol: string): boolean {
	const escaped = symbol.replaceAll("$", "\\$");
	return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(text);
}

function linkCheck(
	files: ReadonlyMap<string, FileRead>,
	link: FileLink,
): Check {
	const text = textOf(files, link.path);
	if (!text.ok) return fail(text.error);
	return mentions(text.value, link.symbol)
		? PASS
		: fail(`${link.path} does not mention the symbol ${link.symbol}`);
}

function first<E>(
	checks: readonly (() => Result<unknown, E>)[],
): Result<undefined, E> {
	return map(
		checks.reduce<Result<unknown, E>>(
			(done, check) => andThen(done, check),
			ok(undefined),
		),
		() => undefined,
	);
}

function headings(text: string): readonly string[] {
	return [...text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map(
		(match) => match[1] ?? "",
	);
}

function adrMetadata(
	text: string,
	file: string,
	decision: string,
	expected: "Accepted" | "Proposed",
): Check {
	const status = adrStatus(text);
	if (!status.ok)
		switch (status.error.kind) {
			case "missing":
				return fail(`${file} has no Status line`);
			case "multiple":
				return fail(`${file} has multiple Status lines`);
			case "unknown":
				return fail(
					`${file} has status ${JSON.stringify(status.error.text)}, not ${expected}`,
				);
			default: {
				const unreachable: never = status.error;
				return unreachable;
			}
		}
	if (status.value.lifecycle.kind !== expected)
		return fail(
			`${file} has status ${JSON.stringify(status.value.text)}, not ${expected}`,
		);
	const span = decisionSpan(text, decision);
	if (span === undefined)
		return fail(`${file} has no ### ${decision}. decision heading`);
	return adrProse(span).trim() === ""
		? fail(`${file} has no nonempty ${decision} decision text`)
		: PASS;
}

function sectionBodies(text: string, title: string): readonly string[] {
	const prose = adrProse(text);
	return [
		...prose.matchAll(new RegExp(`^#{3,6} ${title}[ \\t]*\\r?$`, "gm")),
	].map((heading) => {
		const start = heading.index + heading[0].length;
		const next = prose.slice(start).search(/^#{1,6}[ \t]+/m);
		return text.slice(start, next < 0 ? undefined : start + next).trim();
	});
}

export function proofSections(
	proof: ChangeProof,
	names: readonly string[],
	files: ReadonlyMap<string, FileRead>,
	file: string,
	decision: string,
): Check {
	const text = textOf(files, file);
	if (!text.ok) return fail(text.error);
	const span = decisionSpan(text.value, decision);
	const sections = new Map<string, string>();
	for (const title of PROOF_TITLES) {
		const own = span === undefined ? [] : sectionBodies(span, title);
		const body = (own.length > 0 ? own : sectionBodies(text.value, title))
			.join("\n")
			.trim();
		if (body === "")
			return fail(`${file} has no nonempty ${title} proof section`);
		sections.set(title, body);
	}
	const category = sections.get("Category composition") ?? "";
	for (const name of names)
		if (!mentions(category, name))
			return fail(`${file} does not explain ${name} in Category composition`);
	for (const path of [
		proof.model.module,
		proof.model.config,
		proof.domain.controls.matrix,
	])
		if (!text.value.includes(path))
			return fail(`${file} does not link the proof artifact ${path}`);
	return PASS;
}

function authorityMoved(
	history: IntegrationHistory,
	file: string,
	landed: boolean,
): boolean {
	if (history.mergeBase === history.base) return false;
	const atBase = history.baseFiles.get(file);
	const atMerge = history.mergeBaseFiles.get(file);
	if (atBase?.kind !== "text") return false;
	if (atMerge?.kind !== "text") return true;
	if (!landed) return atMerge.text !== atBase.text;
	const integrated = history.files.get(file);
	return (
		integrated?.kind === "text" &&
		!compareLandedAuthority({
			candidate: atMerge.text,
			integration: integrated.text,
			base: atBase.text,
		}).ok
	);
}

function adrCheck(
	proof: ChangeProof,
	view: RepoView,
	adr: AdrReference,
): Check {
	const text = textOf(view.files, adr.file);
	if (!text.ok) return fail(text.error);
	const ratification = adr.ratification;
	if (ratification === undefined) {
		const metadata = adrMetadata(
			text.value,
			adr.file,
			adr.decision,
			"Accepted",
		);
		return metadata;
	}
	const history = view.ratifications?.get(ratification.integratedAt);
	if (history === undefined)
		return fail(
			`ratification history ${ratification.integratedAt} was not read`,
		);
	if (!history.ok) return fail(history.error);
	if (
		history.value.base !== proof.base ||
		history.value.mergeBase !== view.base.diff ||
		history.value.integratedAt !== ratification.integratedAt
	)
		return fail("ratification history does not match the fixed proof base");
	for (const reference of [adr, ratification.process]) {
		const current = textOf(view.files, reference.file);
		if (!current.ok) return fail(current.error);
		const governingMetadata =
			reference === adr ? ratification.governingMetadata : undefined;
		const { mergeBase } = history.value;
		if (
			authorityMoved(
				history.value,
				reference.file,
				governingMetadata === "landed-header-value",
			)
		)
			return fail(
				`${reference.file} changed between the manifest base ${proof.base} and the merge base ${mergeBase}. Set base to ${mergeBase}, set integratedAt to a commit that holds the new text, and prove the change again.`,
			);
		switch (governingMetadata) {
			case undefined:
				for (const [commit, files] of [
					[ratification.integratedAt, history.value.files],
					[proof.base, history.value.baseFiles],
				] satisfies readonly (readonly [
					string,
					ReadonlyMap<string, FileRead>,
				])[]) {
					const integrated = textOf(files, reference.file);
					if (!integrated.ok) return fail(`${integrated.error} at ${commit}`);
					if (integrated.value !== current.value)
						return fail(
							`${reference.file} differs from its ratified bytes at ${commit}`,
						);
				}
				break;
			case "landed-header-value": {
				const integrated = textOf(history.value.files, reference.file);
				if (!integrated.ok)
					return fail(`${integrated.error} at ${ratification.integratedAt}`);
				const base = textOf(history.value.baseFiles, reference.file);
				if (!base.ok) return fail(`${base.error} at ${proof.base}`);
				const comparison = compareLandedAuthority({
					candidate: current.value,
					integration: integrated.value,
					base: base.value,
				});
				if (!comparison.ok) {
					const problem = comparison.error;
					const commit =
						problem.view === "integration"
							? ratification.integratedAt
							: problem.view === "base"
								? proof.base
								: undefined;
					return fail(
						problem.kind === "changed-authority"
							? `${reference.file} differs from its ratified authority at ${commit}`
							: `${reference.file} has an invalid Landed header${commit === undefined ? "" : ` at ${commit}`}: ${problem.reason}`,
					);
				}
				break;
			}
			default: {
				const unreachable: never = governingMetadata;
				return unreachable;
			}
		}
		const metadata = adrMetadata(
			current.value,
			reference.file,
			reference.decision,
			reference === adr ? "Proposed" : "Accepted",
		);
		if (!metadata.ok) return metadata;
	}
	if ([adr.file, ratification.process.file].includes(ratification.proofRecord))
		return fail(
			"ratification proofRecord must be separate from its governing and process ADRs",
		);
	const names = compositionNames(proof, view.plan);
	if (!names.ok) return names;
	return proofSections(
		proof,
		names.value,
		view.files,
		ratification.proofRecord,
		adr.decision,
	);
}

function cardContext(
	proof: ChangeProof,
	plan: PlanEvidence | undefined,
): Check {
	if (plan === undefined) return fail("the plan record was not read");
	if (!plan.record.ok)
		return plan.record.error.stage === "domain"
			? fail(plan.record.error.message)
			: PASS;
	const { card, block } = plan.record.value;
	const { context } = proof.domain;
	if (!card.contexts.some((one) => one.name === context))
		return fail(
			`the contexts card in ${card.path} has no context "${context}"; it holds ${card.contexts.map((one) => one.name).join(", ")}`,
		);
	return block.context.name === context
		? PASS
		: fail(
				`domain.context "${context}" is not the context ${block.context.name} of the plan block`,
			);
}

export function glossaryTerms(text: string): ReadonlySet<string> {
	return new Set([
		...headings(text),
		...[...text.matchAll(/\*\*([^*\n]+)\*\*/g)].map((match) => match[1] ?? ""),
	]);
}

function domainCheck(proof: ChangeProof, view: RepoView): Check {
	const { domain } = proof;
	const { files } = view;
	const glossary = textOf(files, domain.glossary);
	if (!glossary.ok) return fail(glossary.error);
	const titles = headings(glossary.value);
	const terms = glossaryTerms(glossary.value);
	return first([
		() =>
			proof.composition.kind === "plan"
				? cardContext(proof, view.plan)
				: titles.includes(domain.context)
					? PASS
					: fail(
							`${domain.glossary} has no heading for the context "${domain.context}"`,
						),
		() =>
			domain.terms
				.filter((term) => !terms.has(term))
				.map((term) =>
					fail(`${domain.glossary} defines no term "${term}"`),
				)[0] ?? PASS,
		() => linkCheck(files, domain.aggregate),
		...domain.adrs.map((adr) => () => adrCheck(proof, view, adr)),
	]);
}

function linkedControls(
	proof: ChangeProof,
	files: ReadonlyMap<string, FileRead>,
): Result<ReadonlySet<string>, string> {
	const { matrix: path, criteria } = proof.domain.controls;
	const text = textOf(files, path);
	if (!text.ok) return text;
	const matrix = parseMatrix(text.value);
	if (!matrix.ok) return err(`${path}: ${matrix.error}`);
	const source = (file: string): Source => {
		const read = files.get(file);
		if (read?.kind === "text") return { file, text: read.text };
		const problem = read?.problem;
		return {
			file,
			problem:
				problem === "outside" ||
				problem === "not-a-file" ||
				problem === "unreadable"
					? problem
					: "missing",
		};
	};
	const drift = checkDrift(
		matrix.value,
		matrix.value.specs.map(source),
		matrix.value.tests.map(source),
	);
	if (drift.findings.length > 0)
		return err(
			`${path} has ${drift.findings.length} spec-drift findings: ${drift.findings.join("; ")}`,
		);
	const unlinked = criteria.find(
		(criterion) =>
			!matrix.value.links.some((link) => link.criterion === criterion),
	);
	if (unlinked !== undefined)
		return err(`${path} has no links row for criterion ${unlinked}`);
	return ok(new Set(matrix.value.links.flatMap((link) => link.controls)));
}

function planCheck(
	proof: ChangeProof,
	plan: PlanEvidence | undefined,
	controls: Result<ReadonlySet<string>, string>,
): Check {
	if (plan === undefined) return fail("the plan record was not read");
	if (!plan.record.ok) return fail(plan.record.error.message);
	const { block, cells, card } = plan.record.value;
	const path = proof.composition.kind === "plan" ? proof.composition.plan : "";
	const [finding] = domainFindings(block, {
		card,
		cells,
		registry: plan.registry,
	});
	if (finding !== undefined)
		return fail(`${path}:${finding.line}: ${finding.message}`);
	const { witness } = plan;
	if (witness === undefined) return fail("the tsc witness did not run");
	if (!witness.ok)
		return fail(`the tsc witness stopped: ${witness.error.message}`);
	if (witness.value.kind === "fail")
		return fail(
			`the tsc witness fails: ${witness.value.findings.map((one) => `${path}:${one.line}: ${one.message}`).join("; ")}`,
		);
	for (const law of block.laws) {
		const { check } = law;
		if (
			check?.kind === "prop" &&
			controls.ok &&
			!controls.value.has(check.control)
		)
			return fail(
				`${path}:${law.line}: law ${law.id} cites control:${check.control}, which no matrix links row lists`,
			);
		if (check?.kind === "tla" && plan.registry === undefined)
			return fail(
				`${path}:${law.line}: law ${law.id} checks tla ${check.model}.${check.invariant}, but the repo has no ${REGISTRY_PATH}`,
			);
	}
	return PASS;
}

function categoryCheck(
	proof: ChangeProof,
	view: RepoView,
	controls: Result<ReadonlySet<string>, string>,
): Check {
	const { files } = view;
	const { composition, abstraction, model } = proof;
	if (composition.kind === "plan")
		return first([
			() => planCheck(proof, view.plan, controls),
			...abstraction.relation.map(
				(row) => () => linkCheck(files, row.concrete),
			),
		]);
	const { category } = composition;
	const checked = [...model.invariants, ...model.properties];
	const witness = textOf(files, category.typedWitness);
	return first([
		...[
			...category.objects.map((object) => object.link),
			...category.arrows.map((arrow) => arrow.link),
		].map((link) => () => linkCheck(files, link)),
		...abstraction.relation.map((row) => () => linkCheck(files, row.concrete)),
		() => (witness.ok ? PASS : fail(witness.error)),
		() =>
			category.arrows
				.filter(
					(arrow) => witness.ok && !mentions(witness.value, arrow.link.symbol),
				)
				.map((arrow) =>
					fail(
						`the typed witness ${category.typedWitness} does not mention arrow ${arrow.name} (${arrow.link.symbol})`,
					),
				)[0] ?? PASS,
		...category.laws.map((law) => (): Check => {
			if (law.status !== "witnessed") return PASS;
			const { witness: by } = law;
			if (by.kind === "model")
				return checked.includes(by.name)
					? PASS
					: fail(
							`law ${law.law} cites model:${by.name}, which the model does not check`,
						);
			if (!controls.ok) return PASS;
			return controls.value.has(by.id)
				? PASS
				: fail(
						`law ${law.law} cites control:${by.id}, which no matrix links row lists`,
					);
		}),
	]);
}

function scopeCheck(proof: ChangeProof, view: RepoView): Check {
	const { changed } = view;
	const patterns = proof.scope.map((row) => row.path);
	if (changed.length === 0)
		return fail(`the candidate has no change from base ${view.base.diff}`);
	const problems = [
		...changed
			.filter((entry) => !anyGlob(patterns, entry.path))
			.map((hole) => `no scope row covers the changed path ${hole.path}`),
		...proof.scope
			.filter(
				(row) =>
					!isManifestPath(row.path) &&
					!changed.some((entry) => globMatches(row.path, entry.path)),
			)
			.map((idle) => `scope row ${idle.path} covers no changed path`),
	];
	return problems.length === 0 ? PASS : fail(problems.join("; "));
}

export function planModelFiles(
	model: ModelContract,
	negative: NegativeControl,
	files: ReadonlyMap<string, FileRead>,
): Result<ModelPlan, string> {
	return andThen(textOf(files, model.module), (module) =>
		andThen(textOf(files, model.config), (config) =>
			andThen(
				all(
					model.dependencies.map((path) =>
						map(textOf(files, path), (text) => [path, text] as const),
					),
				),
				(dependencies) =>
					planModel(model, negative, {
						module,
						config,
						dependencies: new Map(dependencies),
					}),
			),
		),
	);
}

function modelCheck(
	proof: ChangeProof,
	files: ReadonlyMap<string, FileRead>,
): Result<ModelPlan, string> {
	return andThen(
		planModelFiles(proof.model, proof.negative, files),
		(planned) => {
			const action = proof.abstraction.relation.find(
				(row) => !planned.actions.has(row.modelAction),
			);
			if (action !== undefined)
				return err(
					`abstraction relation cites ${action.modelAction}, which is no action of the model`,
				);
			return ok(planned);
		},
	);
}

function stageOf<T>(
	stage: Stage,
	result: Result<T, string>,
): Result<T, Rejection> {
	return result.ok ? result : rejection(stage, result.error);
}

export function checkReferences(
	proof: ChangeProof,
	view: RepoView,
): Result<ModelPlan, Rejection> {
	const linked = linkedControls(proof, view.files);
	return andThen(
		first([
			() => stageOf("domain", domainCheck(proof, view)),
			() => stageOf("category", categoryCheck(proof, view, linked)),
			() => stageOf("controls", linked),
			() => stageOf("controls", scopeCheck(proof, view)),
		]),
		() => stageOf("model", modelCheck(proof, view.modelFiles)),
	);
}

const STALE_NAMES = 10;

export function staleInputs(
	before: Snapshot,
	after: Snapshot,
): readonly string[] {
	const paths = [
		...new Set([...before.entries.keys(), ...after.entries.keys()]),
	]
		.sort()
		.filter((path) => before.entries.get(path) !== after.entries.get(path));
	return [
		...(before.history === after.history ? [] : ["the ratification history"]),
		...(before.index === after.index ? [] : ["the index"]),
		...paths,
	];
}

function evidenceCheck(
	run: LadderRun,
	evidence: ModelEvidence | undefined,
): Result<ModelAdmission, Rejection> {
	if (evidence === undefined)
		return rejection("model", `model ${run.name} has no triple`);
	const { positive, negative, restored } = evidence;
	if (!positive.ok) return rejection("model", positive.error);
	if (!negative.ok) return rejection("countermodel", negative.error);
	if (!restored.ok) return rejection("model", restored.error);
	if (
		restored.value.distinct !== positive.value.distinct ||
		restored.value.generated !== positive.value.generated
	)
		return rejection(
			"model",
			"the restored run found other state counts than the positive run",
		);
	return ok({
		name: run.name,
		positive: positive.value,
		negative: negative.value,
		action: run.negative.action,
		restored: restored.value,
	});
}

export function admitChangeProof(
	proof: ChangeProof,
	facts: AdmissionFacts,
): Result<Admitted, Rejection> {
	const references = checkReferences(proof, facts.view);
	if (!references.ok) return references;
	if (!facts.ladder.ok) return rejection("rung", facts.ladder.error);
	const ladder = facts.ladder.value;
	const runs = modelRuns(proof, ladder);
	if (facts.evidence.length > runs.length)
		return rejection(
			"model",
			`the proof holds ${facts.evidence.length} triples for ${runs.length} selected models`,
		);
	const models: ModelAdmission[] = [];
	for (const [index, run] of runs.entries()) {
		const checked = evidenceCheck(run, facts.evidence[index]);
		if (!checked.ok) return checked;
		models.push(checked.value);
	}
	const { before, after } = facts;
	if (before.head !== after.head)
		return rejection(
			"stale",
			`HEAD moved from ${before.head} to ${after.head} during the proof`,
		);
	const stale = staleInputs(before, after);
	if (stale.length > 0) {
		const rest = stale.length - STALE_NAMES;
		return rejection(
			"stale",
			`the candidate inputs changed during the proof: ${stale.slice(0, STALE_NAMES).join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`,
		);
	}
	return ok({
		change: proof.change,
		base: proof.base,
		diffBase: facts.view.base.diff,
		head: after.head,
		digest: after.digest,
		files: after.files,
		rung: ladder.kind === "ladder" ? ladder.rung : undefined,
		models,
	});
}
