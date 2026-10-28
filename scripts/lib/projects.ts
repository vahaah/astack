import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	type HookConfig,
	parseHookConfig,
} from "../../src/astack/hook-profile.ts";
import { MERGED_PATHS } from "../../src/astack/managed.ts";
import { standingBaseProblems } from "../../src/astack/profile.ts";
import type { CiParityConfig } from "./ci-parity.ts";
import { coversPath } from "./neutrality.ts";
import { branchRefusal, expandBranchTemplate } from "./worktree.ts";

export const repoRoot = resolve(import.meta.dir, "../..");

export type ProjectMode = "write" | "report-only";

export type Gate = {
	name: string;
	run: string[];
	files?: "written-json";
	timeoutSeconds?: number;
};

export type CiOnlyGate = {
	name: string;
	source: string;
	reason: string;
};

export type CommentConflict = {
	form: string;
	file: string;
	line: number;
	match: string;
	requires: string;
	conflict: string;
	sample?: string;
	samplePath?: string;
};

export type CommentDecision = {
	form: string;
	decision: "keep" | "obsolete";
	reason: string;
	file?: string;
	line?: number;
	match?: string;
	sample?: string;
	samplePath?: string;
};

export type AdrNeed = {
	rule: string;
	source: string;
	need: string;
};

export type ProjectLint = {
	adrCitation: boolean;
	conflictMarkers: boolean;
	neverNameList?: string;
	denySubstrings: string[];
	denySubstringsExempt?: string[];
};

export type CategoryLabels = {
	bug: string;
	enhancement: string;
	bugAlso?: string[];
};

export type OtherClaim = { work: string; claim: string };

export type TrackerConfig =
	| {
			kind: "linear";
			team: string;
			requirePartOf: boolean;
			categoryLabels: CategoryLabels;
			triageState?: string;
	  }
	| {
			kind: "github";
			requirePartOf: boolean;
			categoryLabels: CategoryLabels;
			researchClaimComment?: string;
			otherClaims?: OtherClaim[];
			frontierSkipLabels?: string[];
	  }
	| { kind: "none"; dir: string };

export type DomainConfig = {
	glossary: string;
	contextMap?: string;
	adrDir: string;
	readFirst?: string[];
};

export type MergeConfig = {
	authority: "standing" | "turn";
	requireChecks?: boolean;
	standingBases?: string[];
};

export type SteConfig = {
	mode: "deny" | "advise";
	technicalNouns: string[];
	technicalVerbs?: string[];
	exclude?: string[];
	headerFields?: string[];
};

export type ProjectConfig = {
	name: string;
	path: string;
	mode: ProjectMode;
	rulesDir: string;
	artifacts: {
		rules: boolean;
		settings: boolean;
		reviewStub: boolean;
		agentDocs: boolean;
		profile: boolean;
	};
	tracker: TrackerConfig;
	merge?: MergeConfig;
	ste?: SteConfig;
	hooks?: HookConfig;
	domain: DomainConfig;
	keepPatterns: string[];
	lint: ProjectLint;
	gates: Gate[];
	ciOnlyGates: CiOnlyGate[];
	ciParity?: CiParityConfig;
	commentConflicts: CommentConflict[];
	commentDecisions?: CommentDecision[];
	adrNeeded: AdrNeed[];
	skillMirrors?: string[];
	branchTemplate?: string;
	commitSubject?: string;
	neutralCommit?: NeutralCommit;
	branches?: Record<string, BranchOverlay>;
};

export type BranchOverlay = {
	gates?: Gate[];
	ciOnlyGates?: CiOnlyGate[];
	ciParity?: CiParityConfig;
};

export type NeutralCommit = { provenanceKey: string };

const topLevelKeys = new Set([
	"name",
	"path",
	"mode",
	"rulesDir",
	"artifacts",
	"tracker",
	"merge",
	"ste",
	"hooks",
	"domain",
	"keepPatterns",
	"lint",
	"gates",
	"ciOnlyGates",
	"ciParity",
	"commentConflicts",
	"commentDecisions",
	"adrNeeded",
	"skillMirrors",
	"branchTemplate",
	"commitSubject",
	"neutralCommit",
	"branches",
]);

const overlayKeys = ["gates", "ciOnlyGates", "ciParity"];

export const reviewProfileName = "pr-review-hardening.profile.md";

export function profileDirFor(
	projectDir: string,
	branch: string | undefined,
): string {
	return branch === undefined
		? projectDir
		: join(projectDir, "branches", branch);
}

export function reviewProfileLabel(
	name: string,
	branch: string | undefined,
): string {
	return join("projects", profileDirFor(name, branch), reviewProfileName);
}

export function overlaid(
	project: ProjectConfig,
	branch: string | undefined,
): ProjectConfig {
	const overlay = branch === undefined ? undefined : project.branches?.[branch];
	if (overlay === undefined) return project;
	return {
		...project,
		gates: overlay.gates ?? project.gates,
		ciOnlyGates: overlay.ciOnlyGates ?? project.ciOnlyGates,
		...(overlay.ciParity === undefined ? {} : { ciParity: overlay.ciParity }),
	};
}

export class ProjectConfigError extends Error {
	override name = "ProjectConfigError";
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

type FieldKind = "string" | "number" | "integer" | "boolean" | "strings";

const kindLabels: Record<FieldKind, string> = {
	string: "a string",
	number: "a number",
	integer: "an integer",
	boolean: "a boolean",
	strings: "a string array",
};

function hasKind(value: unknown, kind: FieldKind): boolean {
	if (kind === "strings") return isStringArray(value);
	if (kind === "integer") return Number.isInteger(value);
	return typeof value === kind;
}

function requireFields(
	errors: string[],
	record: Json,
	at: string,
	fields: Record<string, FieldKind>,
	optional: Record<string, FieldKind> = {},
): void {
	for (const [field, kind] of Object.entries(fields)) {
		if (!hasKind(record[field], kind)) {
			errors.push(`${at}.${field} is not ${kindLabels[kind]}`);
		}
	}
	for (const [field, kind] of Object.entries(optional)) {
		if (record[field] !== undefined && !hasKind(record[field], kind)) {
			errors.push(`${at}.${field} is not ${kindLabels[kind]}`);
		}
	}
}

function requireRecords(
	errors: string[],
	value: unknown,
	at: string,
	fields: Record<string, FieldKind>,
	optional: Record<string, FieldKind> = {},
): void {
	if (!Array.isArray(value)) {
		errors.push(`${at} is not an array`);
		return;
	}
	value.forEach((item, index) => {
		if (isRecord(item)) {
			requireFields(errors, item, `${at}[${index}]`, fields, optional);
		} else {
			errors.push(`${at}[${index}] is not an object`);
		}
	});
}

function validateGates(errors: string[], gates: unknown, at = "gates"): void {
	requireRecords(
		errors,
		gates,
		at,
		{ name: "string", run: "strings" },
		{ files: "string", timeoutSeconds: "number" },
	);
	if (!Array.isArray(gates)) return;
	gates.forEach((gate, index) => {
		if (!isRecord(gate)) return;
		if (Array.isArray(gate.run) && gate.run.length === 0) {
			errors.push(`${at}[${index}].run is empty`);
		}
		if (gate.files !== undefined && gate.files !== "written-json") {
			errors.push(`${at}[${index}].files must be "written-json" when set`);
		}
	});
}

function validateArtifacts(errors: string[], value: Json): void {
	const artifacts = value.artifacts;
	if (!isRecord(artifacts)) {
		errors.push("artifacts is not an object");
		return;
	}
	requireFields(errors, artifacts, "artifacts", {
		rules: "boolean",
		settings: "boolean",
		reviewStub: "boolean",
		agentDocs: "boolean",
		profile: "boolean",
	});
	const rendersAny =
		artifacts.rules === true ||
		artifacts.settings === true ||
		artifacts.reviewStub === true ||
		artifacts.agentDocs === true ||
		artifacts.profile === true;
	if (value.mode === "report-only" && rendersAny) {
		errors.push("a report-only project renders no artifacts");
	}
}

export function isRepoRelativePath(path: string): boolean {
	if (path === "" || path.startsWith("/") || path.includes("\\")) {
		return false;
	}
	return path
		.split("/")
		.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function requirePath(errors: string[], value: unknown, at: string): void {
	if (typeof value !== "string" || !isRepoRelativePath(value)) {
		errors.push(`${at} is not a relative path inside the repo`);
	}
}

function validateCategoryLabels(
	errors: string[],
	value: unknown,
	at: string,
): void {
	if (!isRecord(value)) {
		errors.push(`${at} is not an object`);
		return;
	}
	requireFields(errors, value, at, { bug: "string", enhancement: "string" });
	requireLabels(errors, value.bugAlso, `${at}.bugAlso`);
}

function requireLabels(errors: string[], value: unknown, at: string): void {
	if (value === undefined) return;
	if (!Array.isArray(value)) {
		errors.push(`${at} is not a list`);
		return;
	}
	value.forEach((label, index) => {
		if (typeof label !== "string" || label.trim() === "" || /[\n`]/.test(label))
			errors.push(`${at}[${index}] must be one line of text with no backtick`);
	});
}

function requireLine(errors: string[], value: unknown, at: string): void {
	if (
		typeof value === "string" &&
		(value.trim() === "" || value.includes("\n"))
	)
		errors.push(`${at} must be one line of text`);
}

function validateGithubClaims(errors: string[], tracker: Json): void {
	requireFields(
		errors,
		tracker,
		"tracker",
		{},
		{ researchClaimComment: "string" },
	);
	const comment = tracker.researchClaimComment;
	if (
		typeof comment === "string" &&
		(comment.trim() === "" || /[\n`]/.test(comment))
	)
		errors.push(
			"tracker.researchClaimComment must be one line of text with no backtick",
		);
	requireLabels(
		errors,
		tracker.frontierSkipLabels,
		"tracker.frontierSkipLabels",
	);
	if (tracker.otherClaims === undefined) return;
	requireRecords(errors, tracker.otherClaims, "tracker.otherClaims", {
		work: "string",
		claim: "string",
	});
	if (!Array.isArray(tracker.otherClaims)) return;
	tracker.otherClaims.forEach((entry, index) => {
		if (!isRecord(entry)) return;
		requireLine(errors, entry.work, `tracker.otherClaims[${index}].work`);
		requireLine(errors, entry.claim, `tracker.otherClaims[${index}].claim`);
	});
}

function validateTracker(errors: string[], tracker: unknown): void {
	if (!isRecord(tracker)) {
		errors.push("tracker is not an object");
		return;
	}
	if (tracker.kind === "linear") {
		requireFields(
			errors,
			tracker,
			"tracker",
			{ team: "string", requirePartOf: "boolean" },
			{ triageState: "string" },
		);
		if (
			typeof tracker.team === "string" &&
			!/^[A-Z][A-Z0-9]*$/.test(tracker.team)
		) {
			errors.push("tracker.team must be a Linear team key such as ABC");
		}
		validateCategoryLabels(
			errors,
			tracker.categoryLabels,
			"tracker.categoryLabels",
		);
	} else if (tracker.kind === "github") {
		requireFields(errors, tracker, "tracker", { requirePartOf: "boolean" });
		validateCategoryLabels(
			errors,
			tracker.categoryLabels,
			"tracker.categoryLabels",
		);
		validateGithubClaims(errors, tracker);
	} else if (tracker.kind === "none") {
		requirePath(errors, tracker.dir, "tracker.dir");
	} else {
		errors.push('tracker.kind must be "linear", "github" or "none"');
	}
}

function validateMerge(errors: string[], merge: unknown): void {
	if (merge === undefined) return;
	if (!isRecord(merge)) {
		errors.push("merge is not an object");
		return;
	}
	if (merge.authority !== "standing" && merge.authority !== "turn") {
		errors.push('merge.authority must be "standing" or "turn"');
	}
	requireFields(errors, merge, "merge", {}, { requireChecks: "boolean" });
	errors.push(...standingBaseProblems(merge));
}

function validateSte(errors: string[], ste: unknown): void {
	if (ste === undefined) return;
	if (!isRecord(ste)) {
		errors.push("ste is not an object");
		return;
	}
	if (ste.mode !== "deny" && ste.mode !== "advise") {
		errors.push('ste.mode must be "deny" or "advise"');
	}
	requireFields(
		errors,
		ste,
		"ste",
		{ technicalNouns: "strings" },
		{ technicalVerbs: "strings", exclude: "strings", headerFields: "strings" },
	);
}

function validateDomain(errors: string[], domain: unknown): void {
	if (!isRecord(domain)) {
		errors.push("domain is not an object");
		return;
	}
	requirePath(errors, domain.glossary, "domain.glossary");
	if (domain.contextMap !== undefined)
		requirePath(errors, domain.contextMap, "domain.contextMap");
	requirePath(errors, domain.adrDir, "domain.adrDir");
	if (domain.readFirst === undefined) return;
	if (!isStringArray(domain.readFirst)) {
		errors.push("domain.readFirst is not a string array");
		return;
	}
	domain.readFirst.forEach((path, index) => {
		requirePath(errors, path, `domain.readFirst[${index}]`);
	});
}

function validateKeepPatterns(errors: string[], patterns: unknown): void {
	if (!isStringArray(patterns)) {
		errors.push("keepPatterns is not a string array");
		return;
	}
	for (const pattern of patterns) {
		try {
			new RegExp(pattern);
		} catch {
			errors.push(`keepPatterns: "${pattern}" is not a valid RegExp`);
		}
	}
}

function validateLint(errors: string[], lint: unknown): void {
	if (!isRecord(lint)) {
		errors.push("lint is not an object");
		return;
	}
	requireFields(
		errors,
		lint,
		"lint",
		{
			adrCitation: "boolean",
			conflictMarkers: "boolean",
			denySubstrings: "strings",
		},
		{ neverNameList: "string", denySubstringsExempt: "strings" },
	);
	if (!isStringArray(lint.denySubstringsExempt)) return;
	lint.denySubstringsExempt.forEach((entry, index) => {
		const at = `lint.denySubstringsExempt[${index}]`;
		if (!isRepoRelativePath(entry.replace(/\/$/, ""))) {
			errors.push(`${at} is not a relative path inside the repo`);
			return;
		}
		for (const merged of MERGED_PATHS)
			if (coversPath([entry], merged))
				errors.push(
					`${at} covers ${merged}, which apply merges into a file of the repo`,
				);
	});
}

function validateDecisions(errors: string[], decisions: unknown): void {
	if (decisions === undefined) return;
	requireRecords(
		errors,
		decisions,
		"commentDecisions",
		{ form: "string", decision: "string", reason: "string" },
		{
			file: "string",
			line: "integer",
			match: "string",
			sample: "string",
			samplePath: "string",
		},
	);
	if (!Array.isArray(decisions)) return;
	decisions.forEach((decision, index) => {
		if (!isRecord(decision)) return;
		const at = `commentDecisions[${index}]`;
		if (decision.decision !== "keep" && decision.decision !== "obsolete")
			errors.push(`${at}.decision must be "keep" or "obsolete"`);
		if (decision.decision === "keep" && decision.sample === undefined)
			errors.push(
				`${at} keeps a form, so it needs a sample for the hook check`,
			);
		const cited = [decision.file, decision.line, decision.match].filter(
			(field) => field !== undefined,
		).length;
		if (cited !== 0 && cited !== 3)
			errors.push(`${at} needs file, line and match together, or none of them`);
	});
}

function requireText(errors: string[], value: unknown, at: string): void {
	if (typeof value === "string" && value.trim() === "")
		errors.push(`${at} is empty`);
}

function validateCiParity(
	errors: string[],
	ciParity: unknown,
	prefix = "ciParity",
): void {
	if (ciParity === undefined) return;
	if (!isRecord(ciParity)) {
		errors.push(`${prefix} is not an object`);
		return;
	}
	for (const key of Object.keys(ciParity))
		if (!["setup", "map", "exclude", "narrow"].includes(key))
			errors.push(`${prefix}.${key} is not a known key`);
	const { setup, map, exclude, narrow } = ciParity;
	requireRecords(errors, setup, `${prefix}.setup`, {
		command: "string",
		reason: "string",
	});
	requireRecords(
		errors,
		map,
		`${prefix}.map`,
		{ job: "string", gates: "strings", reason: "string" },
		{ step: "string", differs: "string" },
	);
	requireRecords(
		errors,
		exclude,
		`${prefix}.exclude`,
		{ job: "string", reason: "string" },
		{ step: "string" },
	);
	if (narrow !== undefined)
		requireRecords(errors, narrow, `${prefix}.narrow`, {
			job: "string",
			gates: "strings",
			reason: "string",
		});
	for (const [list, name] of [
		[setup, "setup"],
		[map, "map"],
		[exclude, "exclude"],
		[narrow, "narrow"],
	] as const) {
		if (!Array.isArray(list)) continue;
		list.forEach((entry, index) => {
			if (!isRecord(entry)) return;
			const at = `${prefix}.${name}[${index}]`;
			requireText(errors, entry.reason, `${at}.reason`);
			requireText(errors, entry.command, `${at}.command`);
			requireText(errors, entry.differs, `${at}.differs`);
			if (
				typeof entry.job === "string" &&
				!/^[^#\s/]+\.ya?ml#[^#\s]+$/.test(entry.job)
			)
				errors.push(`${at}.job must be "<workflow file>#<job id>"`);
			if (Array.isArray(entry.gates) && entry.gates.length === 0)
				errors.push(`${at}.gates is empty`);
		});
	}
}

function validateCiOnlyGates(
	errors: string[],
	gates: unknown,
	at = "ciOnlyGates",
): void {
	requireRecords(errors, gates, at, {
		name: "string",
		source: "string",
		reason: "string",
	});
}

function validateBranches(errors: string[], branches: unknown): void {
	if (branches === undefined) return;
	if (!isRecord(branches)) {
		errors.push("branches is not an object");
		return;
	}
	for (const [branch, overlay] of Object.entries(branches)) {
		const refusal = branchRefusal(branch);
		const at =
			refusal === undefined
				? `branches.${branch}`
				: `branches.${JSON.stringify(branch)}`;
		if (refusal !== undefined) errors.push(`${at}: ${refusal}`);
		if (!isRecord(overlay)) {
			errors.push(`${at} is not an object`);
			continue;
		}
		for (const key of Object.keys(overlay))
			if (!overlayKeys.includes(key))
				errors.push(
					`${at}.${key} is not a key of an overlay. An overlay sets only ${overlayKeys.join(", ")}, and the rest comes from the top of the config`,
				);
		if (overlay.gates !== undefined)
			validateGates(errors, overlay.gates, `${at}.gates`);
		if (overlay.ciOnlyGates !== undefined)
			validateCiOnlyGates(errors, overlay.ciOnlyGates, `${at}.ciOnlyGates`);
		validateCiParity(errors, overlay.ciParity, `${at}.ciParity`);
	}
}

function validateMirrors(errors: string[], mirrors: unknown): void {
	if (mirrors === undefined) return;
	if (!isStringArray(mirrors)) {
		errors.push("skillMirrors is not a string array");
		return;
	}
	mirrors.forEach((dir, index) => {
		if (!isRepoRelativePath(dir) || dir.split("/").at(-1) !== "skills")
			errors.push(
				`skillMirrors[${index}] must be a relative path inside the repo that ends in /skills`,
			);
	});
}

function validateWriteSettings(errors: string[], value: Json): void {
	requireFields(
		errors,
		value,
		"config",
		{},
		{ branchTemplate: "string", commitSubject: "string" },
	);
	if (typeof value.branchTemplate === "string") {
		const refusal = branchRefusal(
			expandBranchTemplate(value.branchTemplate, "2000-01-01"),
		);
		if (refusal !== undefined) errors.push(`branchTemplate: ${refusal}`);
	}
	if (
		typeof value.commitSubject === "string" &&
		(value.commitSubject.trim() === "" || value.commitSubject.includes("\n"))
	) {
		errors.push("commitSubject must be one line of text");
	}
	validateNeutralCommit(errors, value);
}

function deniedIn(text: string, lint: unknown): string[] {
	if (!isRecord(lint) || !isStringArray(lint.denySubstrings)) return [];
	const lower = text.toLowerCase();
	return lint.denySubstrings.filter((denied) =>
		lower.includes(denied.toLowerCase()),
	);
}

function validateNeutralCommit(errors: string[], value: Json): void {
	const neutral = value.neutralCommit;
	if (neutral === undefined) return;
	if (!isRecord(neutral)) {
		errors.push("neutralCommit is not an object");
		return;
	}
	const key = neutral.provenanceKey;
	if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9-]*$/.test(key))
		errors.push(
			"neutralCommit.provenanceKey must be a trailer key, such as Tooling-Commit",
		);
	else
		for (const denied of deniedIn(key, value.lint))
			errors.push(
				`neutralCommit.provenanceKey holds the denied substring "${denied}"`,
			);
	if (typeof value.commitSubject === "string")
		for (const denied of deniedIn(value.commitSubject, value.lint))
			errors.push(
				`commitSubject holds the denied substring "${denied}", and neutralCommit asks for a commit text with none`,
			);
}

export function validateProjectConfig(
	value: unknown,
	fileStem: string,
): ProjectConfig {
	if (!isRecord(value)) {
		throw new ProjectConfigError(`${fileStem}.json is not a JSON object`);
	}
	const errors: string[] = [];
	for (const key of Object.keys(value)) {
		if (!topLevelKeys.has(key)) {
			errors.push(
				`unknown key "${key}"; live repo state is read at run time, never stored`,
			);
		}
	}
	if (value.name !== fileStem) {
		errors.push(`name must equal the file name "${fileStem}"`);
	}
	requireFields(errors, value, "config", { path: "string" });
	if (value.mode !== "write" && value.mode !== "report-only") {
		errors.push('mode must be "write" or "report-only"');
	}
	if (
		typeof value.rulesDir !== "string" ||
		!/^\.claude\/rules\/[a-z0-9-]+$/.test(value.rulesDir)
	) {
		errors.push("rulesDir must be .claude/rules/<kebab-name>");
	}
	validateArtifacts(errors, value);
	validateTracker(errors, value.tracker);
	validateMerge(errors, value.merge);
	validateSte(errors, value.ste);
	const hooks = parseHookConfig(value.hooks);
	if (!hooks.ok) errors.push(...hooks.error);
	validateDomain(errors, value.domain);
	validateKeepPatterns(errors, value.keepPatterns);
	validateLint(errors, value.lint);
	validateGates(errors, value.gates);
	validateCiOnlyGates(errors, value.ciOnlyGates);
	requireRecords(
		errors,
		value.commentConflicts,
		"commentConflicts",
		{
			form: "string",
			file: "string",
			line: "integer",
			match: "string",
			requires: "string",
			conflict: "string",
		},
		{ sample: "string", samplePath: "string" },
	);
	validateCiParity(errors, value.ciParity);
	validateBranches(errors, value.branches);
	validateDecisions(errors, value.commentDecisions);
	validateMirrors(errors, value.skillMirrors);
	requireRecords(errors, value.adrNeeded, "adrNeeded", {
		rule: "string",
		source: "string",
		need: "string",
	});
	validateWriteSettings(errors, value);
	if (!conforms(value, errors))
		throw new ProjectConfigError(
			`projects/${fileStem}.json:\n${errors.map((error) => `  ${error}`).join("\n")}`,
		);
	return value;
}

function conforms(
	_value: Readonly<Record<string, unknown>>,
	errors: readonly string[],
): _value is ProjectConfig {
	return errors.length === 0;
}

export function projectNames(dir: string): string[] {
	return readdirSync(dir)
		.filter((file) => file.endsWith(".json"))
		.map((file) => file.slice(0, -".json".length))
		.sort();
}

export async function loadProject(
	name: string,
	dir: string,
): Promise<ProjectConfig> {
	const file = Bun.file(join(dir, `${name}.json`));
	if (!(await file.exists())) {
		throw new ProjectConfigError(
			`projects/${name}.json not found. Known projects: ${projectNames(dir).join(", ")}`,
		);
	}
	const project = validateProjectConfig(await file.json(), name);
	const missing = Object.keys(project.branches ?? {}).filter(
		(branch) =>
			!existsSync(
				join(profileDirFor(join(dir, name), branch), reviewProfileName),
			),
	);
	if (missing.length > 0)
		throw new ProjectConfigError(
			`projects/${name}.json:\n${missing.map((branch) => `  branches.${branch} has no ${reviewProfileLabel(name, branch)}`).join("\n")}`,
		);
	return project;
}

export async function loadAllProjects(dir: string): Promise<ProjectConfig[]> {
	return Promise.all(projectNames(dir).map((name) => loadProject(name, dir)));
}

export function expandHome(path: string, home = homedir()): string {
	if (path === "~") return home;
	if (path.startsWith("~/")) return join(home, path.slice(2));
	return path;
}

export function projectPath(project: ProjectConfig): string {
	return resolve(expandHome(project.path));
}
