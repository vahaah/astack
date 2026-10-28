import {
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

const BLOCKERS = new Set([
	"a",
	"after",
	"an",
	"any",
	"avoid",
	"before",
	"can't",
	"cannot",
	"cant",
	"don't",
	"dont",
	"how",
	"never",
	"no",
	"not",
	"prevent",
	"ready",
	"safe",
	"shall",
	"should",
	"shouldn't",
	"stop",
	"the",
	"till",
	"until",
	"wait",
	"whether",
	"without",
	"won't",
	"wont",
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
		.map((word) => word.replace(/^[^\w#'/]+|[^\w#'/]+$/g, ""))
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

function clauseGrant(clause: string): MergeGrant {
	const tokens = words(clause);
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index] ?? "";
		if (token !== "merge" && token !== "squash-merge") continue;
		const before = tokens.slice(Math.max(0, index - 3), index);
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

export function mergeGrantIn(prompt: string): MergeGrant {
	return prose(prompt)
		.split(/[!?;,\n]+|[.:](?=\s|$)|\s+(?:but|then)\s+/)
		.map(clauseGrant)
		.reduce(joinGrants, NO_GRANT);
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

export function loadGrant(env: Env, session: string | undefined): MergeGrant {
	const path = session === undefined ? undefined : grantPath(env, session);
	if (!path) return NO_GRANT;
	try {
		return parseGrant(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return NO_GRANT;
	}
}
