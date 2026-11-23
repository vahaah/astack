import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRegistry } from "../../src/astack/change-proof/registry.ts";
import { REGISTRY_PATH } from "../../src/astack/change-proof/rung.ts";
import type {
	BaseAuthority,
	PullRequestState,
} from "../../src/astack/pr/github.ts";
import { DEFAULT_MERGE_PROFILE } from "../../src/astack/pr/profile.ts";

type TlaValue =
	| string
	| number
	| boolean
	| readonly TlaValue[]
	| { readonly [field: string]: TlaValue };

export type Command = {
	readonly name: string;
	readonly lost: string;
	readonly scope: string;
	readonly effect: string;
};

export type Change = { readonly kind: string; readonly place: string };

export type FileFact = {
	readonly inProject: boolean;
	readonly inTemp: boolean;
	readonly git: boolean;
	readonly marked: boolean;
};

export type SessionGuardsModel = {
	readonly path: string;
	readonly text: string;
	readonly prs: readonly number[];
	readonly clauses: readonly string[];
	readonly prompts: readonly (readonly string[])[];
	readonly sources: readonly string[];
	readonly baseAuthorities: readonly string[];
	readonly channels: readonly string[];
	readonly kinds: readonly string[];
	readonly places: readonly string[];
	readonly changes: readonly Change[];
	readonly commands: readonly Command[];
	readonly files: readonly FileFact[];
	readonly targets: readonly string[];
};

const DEFINITION = /^([A-Za-z]\w*)(?:\([^)]*\))?\s*==/;

export function definition(text: string, name: string): string {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => DEFINITION.exec(line)?.[1] === name);
	if (start < 0) throw new Error(`the model defines no ${name}`);
	const body = [lines[start] ?? ""];
	for (const line of lines.slice(start + 1)) {
		if (!/^\s+\S/.test(line)) break;
		body.push(line);
	}
	return body.join(" ").replace(/\s+/g, " ").trim();
}

const TOKEN =
	/\s*("(?:[^"\\]|\\.)*"|\d+|\\cup|\\in|\|->|[A-Za-z_]\w*|[{}[\](),:])/y;

function tokens(source: string): string[] {
	const found: string[] = [];
	TOKEN.lastIndex = 0;
	while (TOKEN.lastIndex < source.length) {
		if (/^\s*$/.test(source.slice(TOKEN.lastIndex))) break;
		const at = TOKEN.lastIndex;
		const match = TOKEN.exec(source);
		if (!match?.[1])
			throw new Error(`cannot read the model at "${source.slice(at)}"`);
		found.push(match[1]);
	}
	return found;
}

function key(value: TlaValue): string {
	return JSON.stringify(value);
}

function setOf(values: readonly TlaValue[]): readonly TlaValue[] {
	const unique = new Map(values.map((value) => [key(value), value]));
	return [...unique.keys()].sort().map((name) => unique.get(name) ?? name);
}

function product(
	fields: readonly (readonly [string, readonly TlaValue[]])[],
): readonly TlaValue[] {
	return fields.reduce<readonly Record<string, TlaValue>[]>(
		(rows, [field, values]) =>
			rows.flatMap((row) =>
				values.map((value) => ({ ...row, [field]: value })),
			),
		[{}],
	);
}

function subsets(
	values: readonly TlaValue[],
): readonly (readonly TlaValue[])[] {
	const all: (readonly TlaValue[])[] = [[]];
	for (const value of values)
		for (const subset of all.slice()) all.push([...subset, value]);
	return all;
}

class Reader {
	private at = 0;

	constructor(
		private readonly words: readonly string[],
		private readonly resolve: (name: string) => TlaValue,
	) {}

	read(): TlaValue {
		const value = this.union();
		if (this.at !== this.words.length)
			throw new Error(`unread model text at ${this.words[this.at]}`);
		return value;
	}

	private peek(offset = 0): string | undefined {
		return this.words[this.at + offset];
	}

	private take(expected?: string): string {
		const word = this.words[this.at++];
		if (word === undefined || (expected !== undefined && word !== expected))
			throw new Error(`the model reader expected ${expected} at ${word}`);
		return word;
	}

	private union(): TlaValue {
		let value = this.term();
		while (this.peek() === "\\cup") {
			this.take();
			value = setOf([...this.set(value), ...this.set(this.term())]);
		}
		return value;
	}

	private set(value: TlaValue): readonly TlaValue[] {
		if (!Array.isArray(value))
			throw new Error("the model reader expected a set");
		return value;
	}

	private term(): TlaValue {
		const word = this.peek();
		if (word === "{")
			return this.peek(2) === "\\in" && this.peek(3) === "SUBSET"
				? this.subsetFilter()
				: this.setLiteral();
		if (word === "[")
			return this.peek(2) === "|->" ? this.record() : this.recordSet();
		const name = this.take();
		if (name === "BOOLEAN") return [false, true];
		if (name.startsWith('"')) return JSON.parse(name);
		if (/^\d+$/.test(name)) return Number(name);
		return this.resolve(name);
	}

	private setLiteral(): TlaValue {
		this.take("{");
		const values: TlaValue[] = [];
		while (this.peek() !== "}") {
			values.push(this.term());
			if (this.peek() === ",") this.take();
		}
		this.take("}");
		return setOf(values);
	}

	private record(): TlaValue {
		this.take("[");
		const fields: Record<string, TlaValue> = {};
		while (this.peek() !== "]") {
			const field = this.take();
			this.take("|->");
			fields[field] = this.term();
			if (this.peek() === ",") this.take();
		}
		this.take("]");
		return fields;
	}

	private recordSet(): TlaValue {
		this.take("[");
		const fields: (readonly [string, readonly TlaValue[]])[] = [];
		while (this.peek() !== "]") {
			const field = this.take();
			this.take(":");
			fields.push([field, this.set(this.union())]);
			if (this.peek() === ",") this.take();
		}
		this.take("]");
		return setOf(product(fields));
	}

	private subsetFilter(): TlaValue {
		this.take("{");
		const bound = this.take();
		this.take("\\in");
		this.take("SUBSET");
		const base = this.set(this.term());
		this.take(":");
		this.take("Cardinality");
		this.take("(");
		this.take(bound);
		this.take(")");
		this.take("\\in");
		const sizes = this.set(this.setLiteral());
		this.take("}");
		return setOf(
			subsets(base)
				.filter((subset) => sizes.includes(subset.length))
				.map(setOf),
		);
	}
}

function evaluate(text: string, name: string): TlaValue {
	const body = definition(text, name);
	return new Reader(tokens(body.slice(body.indexOf("==") + 2)), (other) =>
		evaluate(text, other),
	).read();
}

function members(text: string, name: string): readonly TlaValue[] {
	const value = evaluate(text, name);
	if (!Array.isArray(value)) throw new Error(`${name} is not a set`);
	return value;
}

function strings(text: string, name: string): readonly string[] {
	return members(text, name).map((value) => {
		if (typeof value !== "string")
			throw new Error(`${name} holds a value that is not a string`);
		return value;
	});
}

function field(value: TlaValue, name: string): TlaValue {
	if (typeof value !== "object" || Array.isArray(value))
		throw new Error(`a model row is not a record`);
	const found = Reflect.get(value, name);
	if (found === undefined) throw new Error(`a model row has no ${name}`);
	return found;
}

function stringField(value: TlaValue, name: string): string {
	const found = field(value, name);
	if (typeof found !== "string") throw new Error(`${name} is not a string`);
	return found;
}

function booleanField(value: TlaValue, name: string): boolean {
	const found = field(value, name);
	if (typeof found !== "boolean") throw new Error(`${name} is not a boolean`);
	return found;
}

export function modelPath(root: string): string {
	const registry = parseRegistry(
		readFileSync(join(root, REGISTRY_PATH), "utf8"),
	);
	if (!registry.ok) throw new Error(registry.error);
	const entry = registry.value.models.find(
		(model) => model.name === "SessionGuards",
	);
	if (entry === undefined) throw new Error("the registry has no SessionGuards");
	return entry.model.module;
}

export function readSessionGuards(
	path: string,
	text: string,
): SessionGuardsModel {
	return {
		path,
		text,
		prs: members(text, "PRs").map((value) => {
			if (typeof value !== "number") throw new Error("a PR is not a number");
			return value;
		}),
		clauses: strings(text, "Clauses"),
		prompts: members(text, "Prompts").map((prompt) => {
			if (!Array.isArray(prompt)) throw new Error("a prompt is not a set");
			return prompt.map((clause) => {
				if (typeof clause !== "string") throw new Error("a clause is not text");
				return clause;
			});
		}),
		sources: strings(text, "Sources"),
		baseAuthorities: strings(text, "BaseAuthorities"),
		channels: strings(text, "Channels"),
		kinds: strings(text, "Kinds"),
		places: strings(text, "Places"),
		changes: members(text, "Changes").map((row) => ({
			kind: stringField(row, "kind"),
			place: stringField(row, "place"),
		})),
		commands: members(text, "Commands").map((row) => ({
			name: stringField(row, "name"),
			lost: stringField(row, "lost"),
			scope: stringField(row, "scope"),
			effect: stringField(row, "effect"),
		})),
		files: members(text, "Files").map((row) => ({
			inProject: booleanField(row, "inProject"),
			inTemp: booleanField(row, "inTemp"),
			git: booleanField(row, "git"),
			marked: booleanField(row, "marked"),
		})),
		targets: strings(text, "Targets"),
	};
}

export function loadSessionGuards(root: string): SessionGuardsModel {
	const path = modelPath(root);
	return readSessionGuards(path, readFileSync(join(root, path), "utf8"));
}

export const PINS = {
	ClauseGrant:
		'ClauseGrant(c) == CASE c \\in {"merge", "fullSend"} -> PRs [] c = "mergeOne" -> {1} [] OTHER -> {}',
	HumanPrompt:
		'HumanPrompt(source, attended) == IF source = "none" THEN attended ELSE source = "user"',
	Withholds:
		'Withholds(p) == p \\cap {"negatedMerge", "negatedFullSend", "fullStop"} # {}',
	PromptGrant:
		'PromptGrant(p) == UNION {ClauseGrant(c) : c \\in IF Withholds(p) THEN p \\ {"fullSend"} ELSE p}',
	ModeOf:
		'ModeOf(p) == IF p = {"fullStop"} THEN "fullStop" ELSE IF "fullSend" \\in p THEN "fullSend" ELSE "plain"',
	StartsFullStop:
		'StartsFullStop(p, source) == source # "frame" /\\ ModeOf(p) = "fullStop"',
	ProfileCovers:
		'ProfileCovers(authority, n) == \\/ authority = "standing" \\/ authority = "base" /\\ n = 1',
	Prompt:
		"Prompt == /\\ concern = \"merge\" /\\ \\E p \\in Prompts, source \\in Sources : IF HumanPrompt(source, attended) THEN /\\ grant' = PromptGrant(p) /\\ said' = p /\\ saidBy' = source /\\ mode' = ModeOf(p) ELSE /\\ mode' = IF StartsFullStop(p, source) THEN \"fullStop\" ELSE mode /\\ UNCHANGED <<grant, said, saidBy>> /\\ UNCHANGED <<concern, attended, baseAuthority, workingAuthority, merged, unauthorized, stopMerged, mcpMerged, faultMerged, writeVars, gitVars, pushVars>>",
	Merge:
		'Merge == /\\ concern = "merge" /\\ mode # "fullStop" /\\ \\E n \\in PRs \\ merged, channel \\in Channels, fault \\in BOOLEAN : /\\ channel = "gh" /\\ ~fault /\\ ProfileCovers(baseAuthority, n) \\/ n \\in grant /\\ merged\' = merged \\cup {n} /\\ mcpMerged\' = (mcpMerged \\/ channel = "mcp") /\\ faultMerged\' = (faultMerged \\/ fault) /\\ unauthorized\' = (unauthorized \\/ ~(ProfileCovers(baseAuthority, n) \\/ (OwnerCovers(said, n) /\\ PersonTyped(saidBy, attended)))) /\\ stopMerged\' = (stopMerged \\/ mode = "fullStop") /\\ UNCHANGED <<concern, attended, baseAuthority, workingAuthority, said, saidBy, grant, mode, writeVars, gitVars, pushVars>>',
	Scratch: "Scratch(f) == ~f.inProject /\\ ~(f.git \\/ f.marked)",
	CodeKindLost:
		'CodeKindLost(lost, kind) == CASE lost = "untracked" -> kind = "untracked" [] lost = "tracked" -> kind # "untracked" [] lost = "unstaged" -> kind \\in {"unstaged", "both"} [] OTHER -> FALSE',
	CodeScopeHit:
		'CodeScopeHit(scope, place) == scope = "tree" \\/ (scope = "folder" /\\ place = "folder")',
	CodeLost:
		"CodeLost(cmd, t) == {c \\in t : CodeKindLost(cmd.lost, c.kind) /\\ CodeScopeHit(cmd.scope, c.place)}",
	GitScope: 'GitScope(scope, place) == scope = "tree" \\/ scope = place',
	Loses:
		'Loses(effect, kind) == CASE effect = "tracked" -> kind # "untracked" [] effect = "worktree" -> kind \\in {"unstaged", "both"} [] effect = "untracked" -> kind = "untracked" [] effect = "index" -> kind = "both" [] OTHER -> FALSE',
	Touches:
		'Touches(effect, kind) == \\/ Loses(effect, kind) \\/ effect = "index" /\\ kind = "staged" \\/ effect = "stash" /\\ kind # "untracked"',
	Rest: 'Rest(effect, kind) == CASE effect = "worktree" /\\ kind = "both" -> "staged" [] effect = "index" /\\ kind \\in {"staged", "both"} -> "unstaged" [] OTHER -> "gone"',
	GitLost:
		"GitLost(cmd, t) == {c \\in t : GitScope(cmd.scope, c.place) /\\ Loses(cmd.effect, c.kind)}",
	Touched:
		"Touched(cmd, t) == {c \\in t : GitScope(cmd.scope, c.place) /\\ Touches(cmd.effect, c.kind)}",
	After:
		'After(cmd, t) == (t \\ Touched(cmd, t)) \\cup {[c EXCEPT !.kind = Rest(cmd.effect, c.kind)] : c \\in {d \\in Touched(cmd, t) : Rest(cmd.effect, d.kind) # "gone"}}',
	Push: 'Push == /\\ concern = "push" /\\ ~acted /\\ \\E skips \\in BOOLEAN, target \\in Targets : /\\ ~skips \\/ (target = "head" /\\ recorded) /\\ acted\' = TRUE /\\ ungated\' = (skips /\\ ~(target = "head" /\\ green)) /\\ UNCHANGED <<concern, green, recorded, mergeVars, writeVars, gitVars>>',
} as const;

export function pinFailures(text: string): readonly string[] {
	return Object.entries(PINS).flatMap(([name, pin]) =>
		definition(text, name) === pin ? [] : [name],
	);
}

export function clauseGrant(
	model: SessionGuardsModel,
	c: string,
): readonly number[] {
	if (c === "merge" || c === "fullSend") return model.prs;
	if (c === "mergeOne") return [1];
	return [];
}

export function humanPrompt(source: string, attended: boolean): boolean {
	return source === "none" ? attended : source === "user";
}

export function withholds(p: readonly string[]): boolean {
	return p.some((c) =>
		["negatedMerge", "negatedFullSend", "fullStop"].includes(c),
	);
}

export function promptGrant(
	model: SessionGuardsModel,
	p: readonly string[],
): readonly number[] {
	const granting = withholds(p) ? p.filter((c) => c !== "fullSend") : p;
	return [...new Set(granting.flatMap((c) => clauseGrant(model, c)))].sort();
}

export function modeOf(p: readonly string[]): string {
	if (p.length === 1 && p[0] === "fullStop") return "fullStop";
	return p.includes("fullSend") ? "fullSend" : "plain";
}

export function startsFullStop(p: readonly string[], source: string): boolean {
	return source !== "frame" && modeOf(p) === "fullStop";
}

export function profileCovers(authority: string, n: number): boolean {
	return authority === "standing" || (authority === "base" && n === 1);
}

export type MergeState = {
	readonly grant: readonly number[];
	readonly mode: string;
};

export const MERGE_START: MergeState = { grant: [], mode: "plain" };

export function prompt(
	model: SessionGuardsModel,
	state: MergeState,
	p: readonly string[],
	source: string,
	attended: boolean,
): MergeState {
	if (humanPrompt(source, attended))
		return { grant: promptGrant(model, p), mode: modeOf(p) };
	return startsFullStop(p, source) ? { ...state, mode: "fullStop" } : state;
}

export function merge(
	state: MergeState,
	baseAuthority: string,
	n: number,
	channel: string,
	fault: boolean,
): boolean {
	return (
		state.mode !== "fullStop" &&
		channel === "gh" &&
		!fault &&
		(profileCovers(baseAuthority, n) || state.grant.includes(n))
	);
}

export function scratch(f: FileFact): boolean {
	return !f.inProject && !(f.git || f.marked);
}

export function codeKindLost(lost: string, kind: string): boolean {
	if (lost === "untracked") return kind === "untracked";
	if (lost === "tracked") return kind !== "untracked";
	if (lost === "unstaged") return kind === "unstaged" || kind === "both";
	return false;
}

export function codeScopeHit(scope: string, place: string): boolean {
	return scope === "tree" || (scope === "folder" && place === "folder");
}

export function codeLost(
	cmd: Command,
	t: readonly Change[],
): readonly Change[] {
	return t.filter(
		(c) => codeKindLost(cmd.lost, c.kind) && codeScopeHit(cmd.scope, c.place),
	);
}

export function gitScope(scope: string, place: string): boolean {
	return scope === "tree" || scope === place;
}

export function loses(effect: string, kind: string): boolean {
	if (effect === "tracked") return kind !== "untracked";
	if (effect === "worktree") return kind === "unstaged" || kind === "both";
	if (effect === "untracked") return kind === "untracked";
	if (effect === "index") return kind === "both";
	return false;
}

export function touches(effect: string, kind: string): boolean {
	return (
		loses(effect, kind) ||
		(effect === "index" && kind === "staged") ||
		(effect === "stash" && kind !== "untracked")
	);
}

export function rest(effect: string, kind: string): string {
	if (effect === "worktree" && kind === "both") return "staged";
	if (effect === "index" && (kind === "staged" || kind === "both"))
		return "unstaged";
	return "gone";
}

export function gitLost(cmd: Command, t: readonly Change[]): readonly Change[] {
	return t.filter(
		(c) => gitScope(cmd.scope, c.place) && loses(cmd.effect, c.kind),
	);
}

export function touched(cmd: Command, t: readonly Change[]): readonly Change[] {
	return t.filter(
		(c) => gitScope(cmd.scope, c.place) && touches(cmd.effect, c.kind),
	);
}

export function after(cmd: Command, t: readonly Change[]): readonly Change[] {
	const hit = touched(cmd, t);
	return [
		...t.filter(
			(c) => !(gitScope(cmd.scope, c.place) && touches(cmd.effect, c.kind)),
		),
		...hit.flatMap((c) => {
			const kind = rest(cmd.effect, c.kind);
			return kind === "gone" ? [] : [{ ...c, kind }];
		}),
	];
}

export function push(
	skips: boolean,
	target: string,
	recorded: boolean,
): boolean {
	return !skips || (target === "head" && recorded);
}

export function oneOf<T>(table: Readonly<Record<string, T>>, name: string): T {
	const found = table[name];
	if (found === undefined) throw new Error(`no conformance form for ${name}`);
	return found;
}

export const CLAUSE_TEXT: Readonly<Record<string, string>> = {
	merge: "Merge it.",
	mergeOne: "Merge #12.",
	negatedMerge: "Do not merge.",
	fullSend: "Full send.",
	negatedFullSend: "No full send.",
	fullStop: "Full stop.",
	other: "Fix the tests.",
};
export const PR_OF: Readonly<Record<number, { number: number; base: string }>> =
	{
		1: { number: 12, base: "main" },
		2: { number: 34, base: "dev" },
	};
const HEAD_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

function committed(merge: object): BaseAuthority {
	return {
		kind: "committed",
		commit: HEAD_SHA,
		profile: { ...DEFAULT_MERGE_PROFILE, ...merge },
	};
}

export const AUTHORITY: Readonly<Record<string, BaseAuthority>> = {
	turn: committed({}),
	standing: committed({ authority: "standing" }),
	base: committed({ standingBases: ["main"] }),
	unread: { kind: "unread", reason: "the conformance test gives no profile" },
};

export function pullRequest(
	n: number,
	authority: BaseAuthority,
): PullRequestState {
	const { number, base } = oneOf(PR_OF, String(n));
	return {
		number,
		url: `https://github.com/o/r/pull/${number}`,
		title: "feat: x",
		body: "Part of ABC-1",
		base,
		head: HEAD_SHA,
		openThreads: 0,
		threadsListed: true,
		checks: "success",
		checkedHead: HEAD_SHA,
		authority,
	};
}

export function orderedPrompts(
	model: SessionGuardsModel,
): readonly (readonly string[])[] {
	return model.prompts.flatMap((p) =>
		p.length === 1 ? [p] : [p, [...p].reverse()],
	);
}

export function promptPayload(
	session: string,
	project: string,
	clauses: readonly string[],
	source: string,
): string {
	const text = clauses.map((clause) => oneOf(CLAUSE_TEXT, clause)).join(" ");
	const sources: Readonly<Record<string, object>> = {
		user: { prompt: text, source: "user" },
		none: { prompt: text },
		frame: { prompt: `[Workflow harness] ${text}` },
		machine: { prompt: text, source: "agent" },
	};
	return JSON.stringify({
		session_id: session,
		cwd: project,
		hook_event_name: "UserPromptSubmit",
		...oneOf(sources, source),
	});
}

export function toolPayload(
	session: string,
	project: string,
	name: string,
	input: object,
): string {
	return JSON.stringify({
		session_id: session,
		cwd: project,
		hook_event_name: "PreToolUse",
		tool_name: name,
		tool_input: input,
	});
}
