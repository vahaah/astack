import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sessionFileName, stateDir } from "../state.ts";

export type MergeGrant =
	| { readonly kind: "none" }
	| { readonly kind: "any" }
	| { readonly kind: "prs"; readonly numbers: readonly number[] };

export const NO_GRANT: MergeGrant = { kind: "none" };

const NEGATIONS = new Set([
	"avoid",
	"can't",
	"cannot",
	"cant",
	"don't",
	"dont",
	"never",
	"no",
	"not",
	"prevent",
	"shouldn't",
	"stop",
	"without",
	"won't",
	"wont",
]);

const OWNER_MERGES = new Set([...NEGATIONS, "i", "i'll", "leave"]);

const BLOCKERS = new Set([
	...OWNER_MERGES,
	"a",
	"after",
	"an",
	"any",
	"before",
	"how",
	"ready",
	"safe",
	"shall",
	"should",
	"the",
	"till",
	"until",
	"wait",
	"whether",
	"would",
]);

const NOT_A_PR_MERGE = new Set([
	"base",
	"branch",
	"button",
	"commit",
	"commits",
	"conflict",
	"conflicts",
	"from",
	"in",
	"main",
	"master",
	"method",
	"origin",
	"origin/main",
	"pull",
	"queue",
	"request",
	"requests",
	"strategy",
	"upstream",
]);

const FILLER = new Set(["the", "latest", "current"]);

function prose(prompt: string): string {
	let fenced = false;
	return prompt
		.split("\n")
		.filter((line) => {
			if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
				fenced = !fenced;
				return false;
			}
			return !fenced && !/^\s*>/.test(line);
		})
		.join("\n")
		.toLowerCase()
		.replace(/[’‘]/g, "'");
}

function words(text: string): string[] {
	return text
		.split(/\s+/)
		.map((word) => word.replace(/^[^\w#'/$]+|[^\w#'/]+$/g, ""))
		.filter((word) => word !== "");
}

function prNumber(token: string, next: string | undefined): number[] {
	const url = /\/pull\/(\d{1,7})$/.exec(token);
	if (url?.[1]) return [Number(url[1])];
	const hashed = /^#(\d{1,7})$/.exec(token);
	if (hashed?.[1]) return [Number(hashed[1])];
	const bare = /^(\d{2,7})$/.exec(token);
	return bare?.[1] && !next?.endsWith("s") ? [Number(bare[1])] : [];
}

function prNumbers(tokens: readonly string[]): number[] {
	return tokens.flatMap((token, index) => prNumber(token, tokens[index + 1]));
}

const FULL_SEND_COMMAND = /^[/$](?:astack[:-])?full-send$/;
const RUN_FILLER = new Set([
	"ahead",
	"go",
	"it",
	"just",
	"now",
	"ok",
	"okay",
	"please",
	"pr",
	"the",
	"this",
	"yes",
]);

function isRunFiller(word: string): boolean {
	return RUN_FILLER.has(word) || prNumber(word, undefined).length > 0;
}

const FULL_STOP_COMMAND = /^[/$]?(?:astack[:-])?full-stop$/;
const FULL_STOP_INVOKED = /^[/$](?:astack[:-])?full-stop$/;
const MERGE_WORD = /^(?:squash-)?merg(?:e|es|ing)$/;

function withholdsFullSend(clause: Clause): boolean {
	const { tokens } = clause;
	const stops = tokens.some(
		(token, index) =>
			FULL_STOP_COMMAND.test(token) ||
			(token === "full" && tokens[index + 1] === "stop"),
	);
	const grantsNoMerge = clauseGrant(clause, false).kind === "none";
	const keepsTheMerge =
		grantsNoMerge && tokens.some((token) => MERGE_WORD.test(token));
	const refuses = grantsNoMerge && tokens.some((token) => NEGATIONS.has(token));
	return stops || keepsTheMerge || refuses;
}

interface Clause {
	readonly tokens: readonly string[];
	readonly question: boolean;
	readonly opensPrompt: boolean;
}

function clauseGrant(
	{ tokens, question, opensPrompt }: Clause,
	fullSendAllowed: boolean,
): MergeGrant {
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index] ?? "";
		const fullSend =
			fullSendAllowed &&
			(FULL_SEND_COMMAND.test(token) ||
				(token === "full" && tokens[index + 1] === "send"));
		if (!fullSend && token !== "merge" && token !== "squash-merge") continue;
		const before = tokens.slice(Math.max(0, index - 3), index);
		if (fullSend) {
			const command = FULL_SEND_COMMAND.test(token);
			const invoked = opensPrompt && index === 0 && command;
			const others = [
				...tokens.slice(0, index),
				...tokens.slice(index + (command ? 1 : 2)),
			];
			const bare = !question && others.every(isRunFiller);
			if (invoked || bare) return { kind: "any" };
			continue;
		}
		if (before.some((word) => BLOCKERS.has(word))) continue;
		const after = tokens
			.slice(index + 1)
			.filter((word) => !FILLER.has(word))
			.slice(0, 1);
		if (after.some((word) => NOT_A_PR_MERGE.has(word))) continue;
		const numbers = prNumbers(tokens.slice(index + 1));
		return numbers.length > 0 ? { kind: "prs", numbers } : { kind: "any" };
	}
	return NO_GRANT;
}

export function joinGrants(a: MergeGrant, b: MergeGrant): MergeGrant {
	if (a.kind === "any" || b.kind === "any") return { kind: "any" };
	if (a.kind === "none") return b;
	if (b.kind === "none") return a;
	return { kind: "prs", numbers: [...new Set([...a.numbers, ...b.numbers])] };
}

function clausesOf(prompt: string): readonly Clause[] {
	return prose(prompt)
		.split(/(?<=[!?\n])|(?<=[.:])(?=\s|$)/)
		.flatMap((sentence) =>
			sentence
				.split(/[!?;,\n]+|[.:](?=\s|$)|\s+(?:but|then)\s+/)
				.map((text) => ({
					tokens: words(text),
					question: sentence.trimEnd().endsWith("?"),
				})),
		)
		.filter(({ tokens }) => tokens.length > 0)
		.map((clause, index) => ({ ...clause, opensPrompt: index === 0 }));
}

export function mergeGrantIn(prompt: string): MergeGrant {
	const clauses = clausesOf(prompt);
	const fullSendAllowed = !clauses.some(withholdsFullSend);
	return clauses
		.map((clause) => clauseGrant(clause, fullSendAllowed))
		.reduce(joinGrants, NO_GRANT);
}

function bareFullStop({ tokens }: Clause): boolean {
	const index = tokens.findIndex(
		(token, at) => token === "full" && tokens[at + 1] === "stop",
	);
	return (
		index >= 0 &&
		[...tokens.slice(0, index), ...tokens.slice(index + 2)].every(isRunFiller)
	);
}

export function startsFullStop(prompt: string): boolean {
	const clauses = clausesOf(prompt);
	if (FULL_STOP_INVOKED.test(clauses[0]?.tokens[0] ?? "")) return true;
	const [instruction, ...more] = clauses.filter(
		({ tokens }) => !tokens.every(isRunFiller),
	);
	return (
		instruction !== undefined &&
		more.length === 0 &&
		!clauses.some(({ question }) => question) &&
		bareFullStop(instruction)
	);
}

export function grantCovers(grant: MergeGrant, number: number): boolean {
	switch (grant.kind) {
		case "none":
			return false;
		case "any":
			return true;
		case "prs":
			return grant.numbers.includes(number);
	}
}

type Env = Readonly<Record<string, string | undefined>>;

function grantPath(env: Env, session: string): string | undefined {
	const dir = stateDir(env);
	const name = sessionFileName(session);
	return dir && name ? join(dir, "merge-grants", `${name}.json`) : undefined;
}

export function saveGrant(env: Env, session: string, grant: MergeGrant): void {
	const path = grantPath(env, session);
	if (!path) return;
	if (grant.kind === "none") {
		rmSync(path, { force: true });
		return;
	}
	mkdirSync(join(path, ".."), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, JSON.stringify(grant));
	renameSync(temporary, path);
}

function parseGrant(value: unknown): MergeGrant {
	if (typeof value !== "object" || value === null) return NO_GRANT;
	if ("kind" in value && value.kind === "any") return { kind: "any" };
	if (
		"kind" in value &&
		value.kind === "prs" &&
		"numbers" in value &&
		Array.isArray(value.numbers)
	) {
		const numbers = value.numbers.filter(
			(entry): entry is number => typeof entry === "number",
		);
		return numbers.length > 0 ? { kind: "prs", numbers } : NO_GRANT;
	}
	return NO_GRANT;
}

function fullStopPath(env: Env, session: string): string | undefined {
	const path = grantPath(env, session);
	return path === undefined ? undefined : path.replace(/\.json$/, ".full-stop");
}

export function saveFullStop(
	env: Env,
	session: string,
	fullStop: boolean,
): void {
	const path = fullStopPath(env, session);
	if (!path) return;
	if (!fullStop) {
		rmSync(path, { force: true });
		return;
	}
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, "");
}

export function loadFullStop(env: Env, session: string | undefined): boolean {
	const path = session === undefined ? undefined : fullStopPath(env, session);
	return path !== undefined && existsSync(path);
}

export function loadGrant(env: Env, session: string | undefined): MergeGrant {
	const path = session === undefined ? undefined : grantPath(env, session);
	if (!path) return NO_GRANT;
	try {
		return parseGrant(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return NO_GRANT;
	}
}
