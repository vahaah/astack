export type CommitStyle =
	| { readonly kind: "conventional"; readonly scope: string | undefined }
	| { readonly kind: "prefixed"; readonly prefix: string }
	| { readonly kind: "plain" };

const CONVENTIONAL =
	/^(?:feat|fix|chore|docs|test|tests|refactor|ci|build|perf|style|revert)(?:\(([^)]+)\))?!?: \S/;
const SESSION_TAG = String.raw`(?:B\d+/)?S\d+(?:\.\d+)?`;
const PREFIXED = new RegExp(String.raw`^(${SESSION_TAG}) — \S`);
const TAGGED = new RegExp(String.raw`^${SESSION_TAG} — (?=\S)`);
const MERGE = /^Merge (?:pull request|branch|remote-tracking branch) /;
const TOOLING_SCOPES: readonly string[] = ["agents", "agent"];

export function withoutSessionTag(title: string): string {
	return title.replace(TAGGED, "");
}

export function isMergeSubject(subject: string): boolean {
	return MERGE.test(subject);
}

function mostCommon(values: readonly string[]): string | undefined {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()].sort(
		(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
	)[0]?.[0];
}

export function detectCommitStyle(subjects: readonly string[]): CommitStyle {
	const own = subjects.filter(
		(subject) => subject.trim() !== "" && !isMergeSubject(subject),
	);
	const half = own.length / 2;
	const conventional = own.flatMap((subject) => {
		const match = CONVENTIONAL.exec(subject);
		return match ? [match[1] ?? ""] : [];
	});
	if (own.length > 0 && conventional.length >= half) {
		return {
			kind: "conventional",
			scope: TOOLING_SCOPES.find((scope) => conventional.includes(scope)),
		};
	}
	const prefixes = own.flatMap((subject) => {
		const prefix = PREFIXED.exec(subject)?.[1];
		return prefix === undefined ? [] : [prefix];
	});
	const prefix = mostCommon(prefixes);
	if (own.length > 0 && prefix !== undefined && prefixes.length >= half)
		return { kind: "prefixed", prefix };
	return { kind: "plain" };
}

export function joinList(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

type SubjectVerbs = {
	readonly conventional: string;
	readonly prefixed: string;
	readonly plain: string;
};

const ADDS: SubjectVerbs = {
	conventional: "add",
	prefixed: "carries",
	plain: "Add",
};

const UPDATES: SubjectVerbs = {
	conventional: "update",
	prefixed: "carries an update of",
	plain: "Update",
};

export type CommitWords = {
	readonly tool: string;
	readonly writer: string;
	readonly agentDocs: string;
};

export const ASTACK_WORDS: CommitWords = {
	tool: "astack",
	writer: "astack",
	agentDocs: "flow docs",
};

export const NEUTRAL_WORDS: CommitWords = {
	tool: "agent tooling",
	writer: "the agent tooling",
	agentDocs: "agent docs",
};

const dropped = (words: CommitWords) =>
	`the files that ${words.writer} replaces`;

function subjectWith(
	verbs: SubjectVerbs,
	style: CommitStyle,
	parts: readonly string[],
	removes: boolean,
	words: CommitWords,
): string {
	const list = joinList(parts);
	const changed = parts.length > 0;
	const files = dropped(words);
	switch (style.kind) {
		case "conventional": {
			const type = `chore${style.scope === undefined ? "" : `(${style.scope})`}`;
			if (!changed) return `${type}: remove ${files}`;
			return `${type}: ${verbs.conventional} ${list}${removes ? `, and remove ${files}` : ""}`;
		}
		case "prefixed":
			if (!changed) return `${style.prefix} — the repo drops ${files}`;
			return `${style.prefix} — the repo ${verbs.prefixed} ${list}${removes ? `, and drops ${files}` : ""}`;
		case "plain":
			if (!changed) return `Remove ${files}`;
			return `${verbs.plain} ${list}${removes ? `, and remove ${files}` : ""}`;
	}
}

export function subjectWithRemoval(
	subject: string,
	style: CommitStyle,
	words: CommitWords = ASTACK_WORDS,
): string {
	return `${subject}, and ${style.kind === "prefixed" ? "drops" : "remove"} ${dropped(words)}`;
}

export function commitSubject(
	style: CommitStyle,
	parts: readonly string[],
	removes: boolean,
	words: CommitWords = ASTACK_WORDS,
): string {
	return subjectWith(ADDS, style, parts, removes, words);
}

export function updateSubject(
	style: CommitStyle,
	parts: readonly string[],
	removes: boolean,
	words: CommitWords = ASTACK_WORDS,
): string {
	return subjectWith(UPDATES, style, parts, removes, words);
}

const TRAILER = /^[A-Za-z][A-Za-z0-9-]*: \S.*$/;

export function isTrailer(line: string): boolean {
	return TRAILER.test(line);
}

export function commitParagraphs(
	subject: string,
	body: readonly string[],
	trailers: readonly string[],
): string[] {
	return [
		subject,
		...body,
		...(trailers.length > 0 ? [trailers.join("\n")] : []),
	];
}
