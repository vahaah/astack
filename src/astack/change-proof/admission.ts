import { anyGlob, globMatches } from "../glob.ts";
import { err, ok, type Result } from "../result.ts";
import { checkDrift, parseMatrix, type Source } from "../spec-drift.ts";
import {
	type AdrReference,
	type ChangeProof,
	type FileLink,
	type Rejection,
	rejection,
	type Stage,
} from "./contract.ts";
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

export type RepoView = {
	readonly files: ReadonlyMap<string, FileRead>;
	readonly modelFiles: ReadonlyMap<string, FileRead>;
	readonly changed: readonly ChangedPath[];
	readonly ratifications?: ReadonlyMap<
		string,
		Result<IntegrationHistory, string>
	>;
};

export type IntegrationHistory = {
	readonly integratedAt: string;
	readonly base: string;
	readonly files: ReadonlyMap<string, FileRead>;
	readonly baseFiles: ReadonlyMap<string, FileRead>;
};

export type Snapshot = {
	readonly head: string;
	readonly digest: string;
	readonly files: number;
};

export type ModelEvidence = {
	readonly positive: Result<Counts, string>;
	readonly negative: Result<Violation, string>;
	readonly restored: Result<Counts, string>;
};

export type AdmissionFacts = {
	readonly view: RepoView;
	readonly before: Snapshot;
	readonly after: Snapshot;
	readonly evidence: ModelEvidence;
};

export type Admitted = {
	readonly change: string;
	readonly base: string;
	readonly head: string;
	readonly digest: string;
	readonly files: number;
	readonly positive: Counts;
	readonly negative: Violation;
	readonly action: string;
	readonly restored: Counts;
};

const PROBLEM_TEXT: Readonly<Record<FileProblem, string>> = {
	missing: "is missing",
	outside: "resolves outside the repository",
	"not-a-file": "is not a regular file",
	symlink: "has a symbolic link in its path",
	unreadable: "cannot be read",
};

export function referencedPaths(proof: ChangeProof): readonly string[] {
	const { domain, category, abstraction } = proof;
	const links: readonly FileLink[] = [
		domain.aggregate,
		...category.objects.map((object) => object.link),
		...category.arrows.map((arrow) => arrow.link),
		...abstraction.relation.map((row) => row.concrete),
	];
	return [
		...new Set([
			domain.glossary,
			domain.controls.matrix,
			category.typedWitness,
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
	return [proof.model.module, proof.model.config, ...proof.model.dependencies];
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

function first(checks: readonly (() => Check)[]): Check {
	for (const check of checks) {
		const result = check();
		if (!result.ok) return result;
	}
	return PASS;
}

function headings(text: string): readonly string[] {
	return [...text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map(
		(match) => match[1] ?? "",
	);
}

function adrProse(text: string): string {
	let closing: RegExp | undefined;
	return text
		.split("\n")
		.map((line) => {
			if (closing !== undefined) {
				if (closing.test(line)) closing = undefined;
				return line.replace(/[^\r]/g, " ");
			}
			const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
			if (marker === undefined) return line;
			const character = marker.startsWith("`") ? "`" : "~";
			closing = new RegExp(
				`^ {0,3}${character}{${marker.length},}[ \\t]*\\r?$`,
			);
			return line.replace(/[^\r]/g, " ");
		})
		.join("\n");
}

function adrMetadata(
	text: string,
	file: string,
	decision: string,
	expected: "Accepted" | "Proposed",
	requireBody = false,
): Check {
	const prose = adrProse(text);
	const statuses = [
		...prose.matchAll(/^(?:Status:|-\s+\*\*Status:\*\*)[ \t]*(.*?)[ \t]*$/gm),
	].map((match) => match[1] ?? "");
	const [status] = statuses;
	if (status === undefined) return fail(`${file} has no Status line`);
	if (statuses.length !== 1) return fail(`${file} has multiple Status lines`);
	if (
		!new RegExp(`^${expected}(?:[ \\t]+·[ \\t]+\\S(?:.*\\S)?)?$`).test(status)
	)
		return fail(
			`${file} has status ${JSON.stringify(status)}, not ${expected}`,
		);
	const heading = new RegExp(
		`^###[ \\t]+${decision}(?:\\.[ \\t]+|[ \\t]+—[ \\t]+)\\S`,
		"m",
	).exec(prose);
	if (heading === null)
		return fail(`${file} has no ### ${decision}. decision heading`);
	if (requireBody) {
		const lineEnd = prose.indexOf("\n", heading.index);
		const tail = lineEnd < 0 ? "" : prose.slice(lineEnd + 1);
		const end = tail.search(/^#{1,6}[ \t]+/m);
		if ((end < 0 ? tail : tail.slice(0, end)).trim() === "")
			return fail(`${file} has no nonempty ${decision} decision text`);
	}
	return PASS;
}

function proofSections(
	proof: ChangeProof,
	files: ReadonlyMap<string, FileRead>,
	file: string,
): Check {
	const text = textOf(files, file);
	if (!text.ok) return fail(text.error);
	const prose = adrProse(text.value);
	const sections = new Map<string, string>();
	for (const title of [
		"Formal claim",
		"Category composition",
		"Implementation correspondence",
		"Verification",
	]) {
		const heading = new RegExp(`^#{3,6} ${title}[ \\t]*\\r?$`, "m").exec(prose);
		const start = heading === null ? 0 : heading.index + heading[0].length;
		const next = prose.slice(start).search(/^#{1,6}[ \t]+/m);
		const body =
			heading === null
				? ""
				: text.value.slice(start, next < 0 ? undefined : start + next).trim();
		if (body === "")
			return fail(`${file} has no nonempty ${title} proof section`);
		sections.set(title, body);
	}
	const category = sections.get("Category composition") ?? "";
	for (const arrow of proof.category.arrows)
		if (!mentions(category, arrow.link.symbol))
			return fail(
				`${file} does not explain ${arrow.link.symbol} in Category composition`,
			);
	for (const path of [
		proof.model.module,
		proof.model.config,
		proof.domain.controls.matrix,
	])
		if (!text.value.includes(path))
			return fail(`${file} does not link the proof artifact ${path}`);
	return PASS;
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
		return metadata.ok ? proofSections(proof, view.files, adr.file) : metadata;
	}
	const history = view.ratifications?.get(ratification.integratedAt);
	if (history === undefined)
		return fail(
			`ratification history ${ratification.integratedAt} was not read`,
		);
	if (!history.ok) return fail(history.error);
	if (
		history.value.base !== proof.base ||
		history.value.integratedAt !== ratification.integratedAt
	)
		return fail("ratification history does not match the fixed proof base");
	for (const reference of [adr, ratification.process]) {
		const current = textOf(view.files, reference.file);
		if (!current.ok) return fail(current.error);
		for (const [commit, files] of [
			[ratification.integratedAt, history.value.files],
			[proof.base, history.value.baseFiles],
		] satisfies readonly (readonly [string, ReadonlyMap<string, FileRead>])[]) {
			const integrated = textOf(files, reference.file);
			if (!integrated.ok) return fail(`${integrated.error} at ${commit}`);
			if (integrated.value !== current.value)
				return fail(
					`${reference.file} differs from its ratified bytes at ${commit}`,
				);
		}
		const metadata = adrMetadata(
			current.value,
			reference.file,
			reference.decision,
			reference === adr ? "Proposed" : "Accepted",
			true,
		);
		if (!metadata.ok) return metadata;
	}
	if ([adr.file, ratification.process.file].includes(ratification.proofRecord))
		return fail(
			"ratification proofRecord must be separate from its governing and process ADRs",
		);
	return proofSections(proof, view.files, ratification.proofRecord);
}

function domainCheck(proof: ChangeProof, view: RepoView): Check {
	const { domain } = proof;
	const { files } = view;
	const glossary = textOf(files, domain.glossary);
	if (!glossary.ok) return fail(glossary.error);
	const titles = headings(glossary.value);
	const bold = [...glossary.value.matchAll(/\*\*([^*\n]+)\*\*/g)].map(
		(match) => match[1] ?? "",
	);
	return first([
		() =>
			titles.includes(domain.context)
				? PASS
				: fail(
						`${domain.glossary} has no heading for the context "${domain.context}"`,
					),
		() =>
			domain.terms
				.filter((term) => !titles.includes(term) && !bold.includes(term))
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
	const [finding] = drift.findings;
	if (finding !== undefined)
		return err(
			`${path} has ${drift.findings.length} spec-drift findings; the first is: ${finding}`,
		);
	const unlinked = criteria.find(
		(criterion) =>
			!matrix.value.links.some((link) => link.criterion === criterion),
	);
	if (unlinked !== undefined)
		return err(`${path} has no links row for criterion ${unlinked}`);
	return ok(new Set(matrix.value.links.flatMap((link) => link.controls)));
}

function categoryCheck(
	proof: ChangeProof,
	files: ReadonlyMap<string, FileRead>,
	controls: Result<ReadonlySet<string>, string>,
): Check {
	const { category, abstraction, model } = proof;
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

function scopeCheck(
	proof: ChangeProof,
	changed: readonly ChangedPath[],
): Check {
	const patterns = proof.scope.map((row) => row.path);
	if (changed.length === 0)
		return fail(`the candidate has no change from base ${proof.base}`);
	const hole = changed.find((entry) => !anyGlob(patterns, entry.path));
	if (hole !== undefined)
		return fail(`no scope row covers the changed path ${hole.path}`);
	const idle = proof.scope.find(
		(row) => !changed.some((entry) => globMatches(row.path, entry.path)),
	);
	return idle === undefined
		? PASS
		: fail(`scope row ${idle.path} covers no changed path`);
}

function modelCheck(
	proof: ChangeProof,
	files: ReadonlyMap<string, FileRead>,
): Result<ModelPlan, string> {
	const { model } = proof;
	const module = textOf(files, model.module);
	if (!module.ok) return module;
	const config = textOf(files, model.config);
	if (!config.ok) return config;
	const dependencies = new Map<string, string>();
	for (const path of model.dependencies) {
		const text = textOf(files, path);
		if (!text.ok) return text;
		dependencies.set(path, text.value);
	}
	const plan = planModel(model, proof.negative, {
		module: module.value,
		config: config.value,
		dependencies,
	});
	if (!plan.ok) return plan;
	const known = new Set([
		...model.invariants,
		...model.properties,
		...plan.value.actions,
	]);
	const ref = proof.scope
		.flatMap((row) => row.modelRefs)
		.find((name) => !known.has(name));
	if (ref !== undefined)
		return err(
			`a scope row cites ${ref}, which is no configured property and no model action`,
		);
	const action = proof.abstraction.relation.find(
		(row) => !plan.value.actions.has(row.modelAction),
	);
	if (action !== undefined)
		return err(
			`abstraction relation cites ${action.modelAction}, which is no action of the model`,
		);
	return plan;
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
	const domain = stageOf("domain", domainCheck(proof, view));
	if (!domain.ok) return domain;
	const linked = linkedControls(proof, view.files);
	const category = stageOf(
		"category",
		categoryCheck(proof, view.files, linked),
	);
	if (!category.ok) return category;
	const controls = stageOf("controls", linked);
	if (!controls.ok) return controls;
	const scope = stageOf("controls", scopeCheck(proof, view.changed));
	if (!scope.ok) return scope;
	return stageOf("model", modelCheck(proof, view.modelFiles));
}

export function admitChangeProof(
	proof: ChangeProof,
	facts: AdmissionFacts,
): Result<Admitted, Rejection> {
	const references = checkReferences(proof, facts.view);
	if (!references.ok) return references;
	const { positive, negative, restored } = facts.evidence;
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
	const { before, after } = facts;
	if (before.head !== after.head)
		return rejection(
			"stale",
			`HEAD moved from ${before.head} to ${after.head} during the proof`,
		);
	if (before.digest !== after.digest)
		return rejection(
			"stale",
			`the candidate inputs changed during the proof: digest ${before.digest} became ${after.digest}`,
		);
	return ok({
		change: proof.change,
		base: proof.base,
		head: after.head,
		digest: after.digest,
		files: after.files,
		positive: positive.value,
		negative: negative.value,
		action: proof.negative.action,
		restored: restored.value,
	});
}
