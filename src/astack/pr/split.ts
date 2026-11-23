import { type Clause, clausesOf, NEGATIONS } from "./grant.ts";
import { partOf } from "./links.ts";
import type { NewPr, OpenPr } from "./open.ts";

export type { NewPr, OpenPr } from "./open.ts";

export type SessionOpen = {
	readonly root: string;
	readonly repo: string;
	readonly base: string;
	readonly head: string;
};

export type SessionPrs = {
	readonly split: boolean;
	readonly opens: readonly SessionOpen[];
};

export const NO_SESSION_PRS: SessionPrs = { split: false, opens: [] };

const SPLITS = "split";
const NEW_PR = new Set(["second", "separate", "another", "two"]);
const OPENS_PR = new Set([
	"create",
	"file",
	"make",
	"open",
	"put",
	"raise",
	"ship",
	SPLITS,
]);
const JOINED = new Set(["one", "first"]);

function prWordAt(tokens: readonly string[], index: number): boolean {
	const token = tokens[index];
	if (token === "pr" || token === "prs") return true;
	return token === "pull" && /^requests?$/.test(tokens[index + 1] ?? "");
}

function joinsPrs(tokens: readonly string[]): boolean {
	return tokens.some((token, index) => {
		if (token === "one") return prWordAt(tokens, index + 1);
		if (token !== "into") return false;
		const next = tokens[index + 1] === "the" ? index + 2 : index + 1;
		return JOINED.has(tokens[next] ?? "");
	});
}

function clauseSplits({ tokens, question }: Clause): boolean {
	if (question || tokens.some((token) => NEGATIONS.has(token))) return false;
	if (joinsPrs(tokens)) return false;
	return tokens.some((_, index) => {
		if (!prWordAt(tokens, index)) return false;
		const before = tokens.slice(0, index);
		return (
			before.some((token) => OPENS_PR.has(token)) &&
			(NEW_PR.has(tokens[index - 1] ?? "") || before.includes(SPLITS))
		);
	});
}

export function splitInstructionIn(prompt: string): boolean {
	return clausesOf(prompt).some(clauseSplits);
}

function linkedBy(refs: readonly string[], pr: OpenPr): boolean {
	const url = pr.url.toLowerCase();
	return refs.some((ref) => {
		const named = ref.toLowerCase();
		return (
			named === `#${pr.number}` ||
			named === url ||
			url.endsWith(`/${named.replace("#", "/pull/")}`)
		);
	});
}

export function sessionReasons(
	pr: NewPr,
	record: SessionPrs,
	open: readonly OpenPr[],
): string[] {
	if (record.split || open.some((one) => one.head === pr.base)) return [];
	const found = pr.body === undefined ? undefined : partOf(pr.body);
	const refs = found?.kind === "found" ? found.refs : [];
	const opened = new Set(
		record.opens
			.filter(
				(prior) =>
					prior.head !== pr.head &&
					prior.root === pr.root &&
					prior.repo === pr.repo &&
					prior.base === pr.base,
			)
			.map((prior) => prior.head),
	);
	return open.flatMap((one) => {
		const cause = linkedBy(refs, one)
			? "the Part of line of this PR links it"
			: opened.has(one.head)
				? `this session opened it from this worktree to ${pr.base}`
				: undefined;
		return cause === undefined
			? []
			: [
					`#${one.number} (${one.url}) is open, and ${cause}. Push to ${one.head}, or stack this PR on it with --base ${one.head}.`,
				];
	});
}
