import { isTypeTest } from "../types/policy.ts";
import type { LanguageId } from "./lexer.ts";
import type { CommentLimits, CommentSize, LengthKind } from "./limits.ts";
import { parseSuppression } from "./suppressions.ts";
import type { CommentLine, CommentUnit } from "./units.ts";

export type Verdict = "deny" | "keep" | "judge";

export type DenyRule =
	| "narration"
	| "provenance"
	| "file-line"
	| "own-path"
	| "banner"
	| "commented-out-code"
	| "restating"
	| "suppression"
	| "long-comment";

export type KeepRule =
	| "project-keep"
	| "directive"
	| "license"
	| "suppression"
	| "doc-contract"
	| "linked-constraint";

export type JudgeRule =
	| "judge"
	| "todo"
	| "marker"
	| "suppression"
	| "long-comment";

export type Classification =
	| { verdict: "deny"; rule: DenyRule; lines: number[]; size?: CommentSize }
	| { verdict: "keep"; rule: KeepRule; lines: number[] }
	| { verdict: "judge"; rule: JudgeRule; lines: number[]; size?: CommentSize };

export interface CommentPolicy {
	keep: RegExp[];
	limits: CommentLimits;
}

export interface ClassifyContext extends CommentPolicy {
	language: LanguageId;
	relPath: string;
	typeHook?: boolean;
}

const DIRECTIVE_TEXT: RegExp[] = [
	/^<reference\s/,
	/^<amd-(?:module|dependency)\b/,
	/^@ts-check\b/,
	/^@jsx(?:ImportSource|Runtime|Frag)?\s+\S/,
	/^@flow\b/,
	/^@refresh\s+reset\b/,
	/^eslint-env\s/,
	/^globals?\s+[\w$]/,
	/^webpack[A-Z]\w*\s*:/,
	/^@vite-ignore\b/,
	/^[#@]__(?:PURE|NO_SIDE_EFFECTS|INLINE)__$/,
	/^@(?:vitest|jest)-environment\s/,
	/^-\*-.*-\*-$/,
	/^(?:frozen_string_literal|(?:en)?coding)[:=]/,
	/^shellcheck\s+(?:shell|source)=/,
	/^@generated\b/,
	/^@(?:type|satisfies)\s*\{/,
	/^@(?:typedef|callback|template)\b/,
];

const DIRECTIVE_RAW: RegExp[] = [
	/^\/\/go:[a-z]+\b/,
	/^\/\/\s?\+build\s/,
	/^\/\/export\s/,
	/^\/\/\/\s*</,
];

const MARKER = /^(?:MARK:|#?(?:region|endregion)\b)/;
const TODO = /^(?:TODO|FIXME|HACK|XXX)\b/;

const LICENSE_NAME =
	"(?:MIT|ISC|BSD(?: [0-4]-Clause)?|Apache|Mozilla Public|Eclipse Public|Boost Software|(?:GNU )?(?:Affero |Lesser |Library )?General Public)";

const LICENSE_LINE: RegExp[] = [
	/SPDX-License-Identifier\s*:|^@(?:license|preserve)\b/i,
	/\bcopyright\s*(?:\(c\)|©|\d{4})|©\s*\d{4}|\ball rights reserved\b/i,
	/\bthe above copyright\b|\bcopyright notice and this permission notice\b|\bname of the copyright holder\b|\bcopyright holders and contributors\b/i,
	/\blicen[sc]ed under\b|\bpermission is hereby granted\b|\bfree software(?: foundation\b|[:;,] you can redistribute\b)|\bredistribution and use in source and binary forms\b|\bsubject to the terms of the Mozilla Public\b/i,
	/\bwithout (?:any warranty|warranty of any kind|warranties or conditions of any kind|even the implied warranty)\b|\bdisclaims all warranties\b/i,
	/\bhttps?:\/\/(?:www\.)?(?:apache\.org\/licenses|gnu\.org\/licenses|opensource\.org\/licenses?|mozilla\.org\/MPL)\b/i,
	new RegExp(
		`^(?:The )?${LICENSE_NAME} Licen[sc]e(?:,? Version \\d+(?:\\.\\d+)*)?(?: \\([\\w.+-]+\\))?$`,
		"i",
	),
];

function isLicenseLine(text: string): boolean {
	return LICENSE_LINE.some((pattern) => pattern.test(text));
}

const URL = /\bhttps?:\/\/\S+/gi;
const UPSTREAM_REF = /\b[\w.-]+\/[\w.-]+#\d+\b|\b(?:RFC|CVE|CWE)[ -]?\d/i;
const UPSTREAM_CUE =
	/\b(?:upstream|vendor|work(?:s|ed)? ?around|known issue|bug in|regression in|fixed in|released in)\b/i;
const CONSTRAINT =
	/\b(?:because|since|requires?|required|must|cannot|can't|won't|doesn't|does not|don't|do not|otherwise|workaround|works around|bug|quirk|limitation|unsupported|not supported|only (?:supports?|accepts?|allows?)|rejects?|expects?|mandates?|per (?:the )?(?:spec|rfc|docs?))\b/i;
const RUNTIME_CUE =
	/\b(?:after|once|when|whenever|until|if|unless|while|before)\b/i;

const NOT_TICKET_PREFIXES = new Set([
	"ADR",
	"ASCII",
	"AES",
	"AMD",
	"ANSI",
	"ARM",
	"BASE",
	"CP",
	"CRC",
	"CVE",
	"CWE",
	"COVID",
	"EAN",
	"ECMA",
	"ES",
	"FIPS",
	"GPT",
	"GS1",
	"HS",
	"HTTP",
	"IE",
	"IEC",
	"IEEE",
	"IPV",
	"ISBN",
	"ISO",
	"LATIN",
	"MD",
	"MP",
	"NIST",
	"PG",
	"PKCS",
	"POSIX",
	"PS",
	"RFC",
	"RGB",
	"RS",
	"SHA",
	"SSL",
	"TLS",
	"UPC",
	"UTF",
	"WCAG",
	"WIN",
	"X86",
]);

const NOT_PLAN_CODES = new Set([
	"S3",
	"V8",
	"R2",
	"D1",
	"B2",
	"T4",
	"L4",
	"C4",
	"M1",
	"M2",
	"M3",
	"M4",
	"P50",
	"P90",
	"P95",
	"P99",
	"P999",
	"A100",
	"H100",
	"V100",
	...[1, 2, 3, 4, 5, 6].map((n) => `H${n}`),
	...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `A${n}`),
	...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `F${n}`),
	...[1, 2, 3, 4].map((n) => `Q${n}`),
]);

const PLAN_CODE = "[A-Z]\\d{1,3}[a-z]?";
const PLAN_LABEL = new RegExp(
	`^(${PLAN_CODE})(?:\\s*\\(\\s*${PLAN_CODE}(?:\\s*,\\s*${PLAN_CODE})*\\s*\\))?\\s*(?::|—|–|-\\s)`,
);
const PLAN_LIST = new RegExp(`\\((${PLAN_CODE}(?:\\s*,\\s*${PLAN_CODE})+)\\)`);
const PLAN_POSSESSIVE = new RegExp(`\\b(${PLAN_CODE})'s\\b`);
const PLAN_ACTION = new RegExp(
	`^(${PLAN_CODE})\\s+(?:adds|lands|writes|removes|replaces|wires|ships|introduces|drops|owns)\\b|\\buntil (${PLAN_CODE})(?:\\/[A-Z]\\d+)? (?:lands|ships|adds|merges)\\b`,
);
const SESSION_CODE = /\b([A-Z]\d{1,3})[a-z]?\/([A-Z]\d{1,3})[a-z]?\b/g;
const SECTION_ROW = /§\s?\d+(?:\.\d+)* row \d+/i;
const PR_REF = /\b(?:PR|pull request)\s?#\d+\b/i;
const REVIEW_ROUND =
	/\breview round\b|\bround \d+ (?:of )?(?:the )?review\b|\b(?:codex|greptile|coderabbit|copilot)(?:'s)?\b[^.]{0,40}?\b(?:review\w*|flagged|found|finding\w*|P\d)\b|\b[A-Z]{1,3}\d+-P\d\b|\bpre-PR review\b|\b(?:addressing|addressed|per|from) (?:the )?(?:PR |code )?review (?:feedback|comments?|findings?)\b/i;
const DATED_MEASUREMENT =
	/\b(?:measured|observed|benchmarked|probed|verified|checked|tested|confirmed|recorded|captured|last (?:updated|checked|verified|reviewed))(?: on)?:? 20\d\d-[01]\d-[0-3]\d\b/i;
const DATE_LABEL = /^20\d\d-[01]\d-[0-3]\d\b\s*(?::|—|–|-\s)/;
const CODE_AND_DATE = new RegExp(
	`\\(\\s*${PLAN_CODE}\\s*,\\s*20\\d\\d-[01]\\d-[0-3]\\d\\s*\\)`,
);
const TICKET_KEY = /(?<![\w-])([A-Z]{2}[A-Z0-9]{0,8})-(\d{1,6})(?![\w-]|\.\d)/g;
const COPIED_FROM =
	/^(?:copied|adapted|borrowed|lifted|vendored)(?: verbatim)? from\b/i;

const NARRATION: { pattern: RegExp; unlessRuntime: boolean }[] = [
	{
		pattern:
			/\bno longer\s+(?:needs?|needed|uses?|used|calls?|called|gets?|does|do|required|requires?|necessary|prefetch\w*|reads?|writes?|returns?|throws?|renders?|sends?|imports?|depends)\b/i,
		unlessRuntime: true,
	},
	{ pattern: /\b(?:this|it|we)\s+used to\b/i, unlessRuntime: false },
	{ pattern: /\bused to be\b/i, unlessRuntime: false },
	{
		pattern:
			/^previously(?:,|\s+(?:we|this|it|they|the (?:code|function|implementation|logic|component|query|layout|test)\b))/i,
		unlessRuntime: false,
	},
	{
		pattern:
			/\b(?:the|an?)\s+(?:old|earlier|previous|original)\s+(?:implementation|code path|approach|editor|logic|version of this)\b/i,
		unlessRuntime: false,
	},
	{
		pattern:
			/\bbefore (?:this (?:change|pr|fix|commit|refactor|rewrite|patch)|the (?:fix|refactor|rewrite))\b/i,
		unlessRuntime: false,
	},
	{ pattern: /\bbefore [A-Z][A-Z0-9]{1,9}-\d+\b/, unlessRuntime: false },
	{ pattern: /\bred[- ]first\b/i, unlessRuntime: false },
	{
		pattern:
			/\bnow (?:uses|calls|lives in|goes through|reads from|writes to|points (?:at|to)|delegates to|relies on|depends on)\b/i,
		unlessRuntime: true,
	},
	{
		pattern:
			/\b(?:we|i)\s+(?:changed|switched|moved|replaced|removed|added|refactored|renamed|rewrote|migrated|dropped|reverted)\b/i,
		unlessRuntime: true,
	},
	{
		pattern:
			/\b(?:this (?:pr|change|commit|patch|diff)|the pr)\s+(?:adds|removes|changes|fixes|introduces|replaces|moves)\b/i,
		unlessRuntime: false,
	},
	{ pattern: /\binstead of the old\b/i, unlessRuntime: false },
	{
		pattern:
			/^(?:changed|switched|moved|migrated|refactored|rewrote|rewritten|renamed|updated|converted|ported)\s+(?:to|from)\b/i,
		unlessRuntime: false,
	},
	{
		pattern:
			/^(?:fix(?:ed)?|added|changed|updated|removed|refactored|new)\s*:/i,
		unlessRuntime: false,
	},
	{
		pattern:
			/^(?:added|removed|replaced|introduced)\s+(?:a|an|the|support for|handling (?:for|of)|\w+ (?:logic|support|handling|check|guard|fallback))\b/i,
		unlessRuntime: false,
	},
	{
		pattern:
			/^new\s+(?:implementation|version|approach|logic|code path|behaviou?r)\b/i,
		unlessRuntime: false,
	},
];

const STEP_NARRATION =
	/^(?:now|next|then|first|finally|here),?\s+(?:we|let's|let us)\b/i;

const FILE_LINE =
	/(?<![\w/.:-])(?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx?|jsx?|mjs|cjs|mts|cts|sql|mdx?|py|go|rs|swift|kts?|s?css|json|ya?ml|sh|toml|java|rb|php|cc|cpp|hpp|[ch]):L?\d+(?:[-:]\d+)?\b/;

const RULE_CHARS = "─━═—–=\\-*#~_+";
const RULE_LINE = new RegExp(`^[${RULE_CHARS}/\\s]{5,}$`);
const LABEL_BANNER = new RegExp(
	`^[${RULE_CHARS}]{2,}\\s+\\S.{0,60}?\\s+[${RULE_CHARS}]{2,}$`,
);

const JS_CODE_LINE: RegExp[] = [
	/^(?:const|let|var)\s+[\w${}[\],\s]+=\s*\S/,
	/^(?:await\s+)?[\w$]+(?:(?:\.|\?\.)[\w$]+)*\((?:[^()]|\([^()]*\))*\);?$/,
	/^(?:return|throw|break|continue|yield)\b.*;$/,
	/^[\w$.[\]]+\s*(?:[-+*/]?=)\s*[^=].*;$/,
	/^import\s.+\sfrom\s+['"].+['"];?$/,
	/^import\s+['"].+['"];?$/,
	/^export\s+(?:default\s+[\w$.]+;?$|(?:const|let|var)\s+[\w$]+\s*[:=]|(?:async\s+)?function\*?\s+[\w$]+\s*[(<]|class\s+[\w$]+|type\s+[\w$]+(?:<[^>]*>)?\s*=|interface\s+[\w$]+|\{[^}]*\}(?:\s+from\s+['"][^'"]+['"])?;?$|\*\s+from\s+['"])/,
	/^(?:if|for|while|switch)\s*\(.*\)\s*\{?$/,
	/^(?:\}\s*)?(?:else|try|finally|do)\s*\{$/,
	/^(?:\}\s*)?catch\s*(?:\(.*\))?\s*\{$/,
	/^(?:\}\)?|\)|\]|\}\s*else\s*\{);?,?$/,
	/^(?:export\s+)?(?:async\s+)?function\*?\s+[\w$]+\s*\((?:[^()]|\([^()]*\))*\)\s*(?::\s*[^{]+)?\{?$/,
	/^(?:export\s+)?(?:default\s+)?class\s+[\w$]+.*\{$/,
	/^<\/?[A-Za-z][\w.]*(?:\s+[^<>]*)?\/?>$/,
	/^[\w$]+:\s*(?:['"`].*['"`]|-?\d[\d_.]*|true|false|null|undefined|[\w$.]+(?:\(.*\))?)\s*,$/,
];

const LANGUAGE_CODE_LINE: Partial<Record<LanguageId, RegExp[]>> = {
	kotlin: [
		/^(?:val|var)\s+\w+(?:\s*:\s*[\w<>?.,\s]+)?\s*=\s*\S/,
		/^(?:(?:private|internal|public|override|suspend)\s+)*fun\s+(?:<[^>]*>\s*)?[\w.]+\s*\(/,
	],
	go: [
		/^[\w.]+(?:\s*,\s*[\w.]+)*\s*:=\s*\S/,
		/^func\s+(?:\([^)]*\)\s*)?\w+\s*\(/,
		/^(?:defer|go)\s+[\w.]+\((?:[^()]|\([^()]*\))*\)$/,
	],
	swift: [
		/^(?:let|var)\s+\w+\s*:\s*[\w<>?.,:[\]\s]+=\s*\S/,
		/^func\s+\w+\s*[(<]/,
	],
	rust: [
		/^let\s+(?:mut\s+)?\w+(?:\s*:\s*[\w<>&'\s]+)?\s*=\s*\S.*;$/,
		/^(?:pub\s+)?fn\s+\w+\s*[(<]/,
	],
};

const SQL_CODE_START =
	/^(?:select|insert|update|delete|create|alter|drop|grant|revoke|with|truncate)\b/i;
const SQL_CODE_BODY =
	/\b(?:from|into|table|set|values|on|index|function|policy|view|where)\b/i;
const PYTHON_CODE_LINE =
	/^(?:def \w+\(.*\).*:|class \w+.*:|import [\w.]+(?: as \w+)?|from [\w.]+ import .+|return\b.*|print\(.*\)|raise \w+.*|(?:if|elif|while) .+:|for .+ in .+:|else:|try:|except\b.*:)$/;
const EXAMPLE_CUE = /\b(?:e\.g\.|example|usage|for instance)\b/i;
const PROSE_LABEL =
	/^(?:note|nb|todo|fixme|warning|example|see|why|reason|usage|source|context)\s*:/i;

const STOPWORDS = new Set(
	`a an the of for to in on at by with from and or nor is are be been being this that these those it its as into whether
	true false when if then else return returns returned get gets set sets type types interface function func fn method class
	const constant value values object helper new all each every given which some any our my your export exports exported default
	used uses use do does not no just also here there via per`.split(/\s+/),
);

export interface UnitFacts {
	text: string;
	hasLink: boolean;
	hasUpstreamCue: boolean;
	hasConstraint: boolean;
}

function facts(unit: CommentUnit): UnitFacts {
	const text = unit.lines.map((line) => line.text).join(" ");
	return {
		text,
		hasLink: /\bhttps?:\/\//i.test(text) || UPSTREAM_REF.test(text),
		hasUpstreamCue: UPSTREAM_CUE.test(text),
		hasConstraint: CONSTRAINT.test(text),
	};
}

function withoutUrls(text: string): string {
	return text.replace(URL, " ");
}

function sentenceAround(text: string, index: number): string {
	const before = text.slice(0, index);
	const start = Math.max(
		before.lastIndexOf("."),
		before.lastIndexOf(";"),
		before.lastIndexOf("!"),
		before.lastIndexOf("?"),
	);
	const rest = text.slice(index);
	const endMatch = /[.;!?](?:\s|$)/.exec(rest);
	return text.slice(start + 1, endMatch ? index + endMatch.index : text.length);
}

function isNarration(raw: string, unitFacts: UnitFacts): boolean {
	if (unitFacts.hasLink) return false;
	const text = withoutQuotes(raw, true);
	for (const { pattern, unlessRuntime } of NARRATION) {
		const match = pattern.exec(text);
		if (!match) continue;
		if (unlessRuntime && RUNTIME_CUE.test(sentenceAround(text, match.index)))
			continue;
		return true;
	}
	return STEP_NARRATION.test(text) && !unitFacts.hasConstraint;
}

function hasSessionCode(text: string): boolean {
	for (const match of text.matchAll(SESSION_CODE)) {
		const [first = "", second = ""] = [match[1], match[2]];
		if (first[0] === second[0]) continue;
		if (!NOT_PLAN_CODES.has(first) || !NOT_PLAN_CODES.has(second)) return true;
	}
	return false;
}

function withoutQuotes(text: string, backticks: boolean): string {
	return text.replace(
		backticks ? /"[^"]*"|“[^”]*”|`[^`]*`/g : /"[^"]*"|“[^”]*”/g,
		" ",
	);
}

function planCodeHit(pattern: RegExp, text: string): boolean {
	const match = pattern.exec(text);
	if (!match) return false;
	const codes = match
		.slice(1)
		.filter((group): group is string => Boolean(group))
		.flatMap((group) => group.split(/\s*,\s*/));
	return codes.length > 0 && codes.every((code) => !NOT_PLAN_CODES.has(code));
}

function hasTicketKey(text: string): boolean {
	for (const match of text.matchAll(TICKET_KEY)) {
		const prefix = match[1] ?? "";
		if (!NOT_TICKET_PREFIXES.has(prefix)) return true;
	}
	return false;
}

function isProvenance(text: string, unitFacts: UnitFacts): boolean {
	const clean = withoutUrls(text);
	if (
		REVIEW_ROUND.test(clean) ||
		DATED_MEASUREMENT.test(clean) ||
		DATE_LABEL.test(clean.trim()) ||
		CODE_AND_DATE.test(clean)
	)
		return true;
	if (SECTION_ROW.test(clean)) return true;
	if (TODO.test(clean)) return false;
	if (hasSessionCode(clean)) return true;
	if (planCodeHit(PLAN_LABEL, clean) || planCodeHit(PLAN_LIST, clean))
		return true;
	if (planCodeHit(PLAN_POSSESSIVE, clean) || planCodeHit(PLAN_ACTION, clean))
		return true;
	const upstream = unitFacts.hasLink || unitFacts.hasUpstreamCue;
	if (!upstream && COPIED_FROM.test(clean.trim())) return true;
	if (!upstream && PR_REF.test(clean)) return true;
	return !upstream && hasTicketKey(clean);
}

function isOwnPath(text: string, relPath: string): boolean {
	const path = relPath.replace(/^\.\//, "");
	if (path.startsWith("..") || path.startsWith("/")) return false;
	const base = path.slice(path.lastIndexOf("/") + 1);
	const stripped = text.replace(/[`'"]/g, "").trim();
	if (stripped === base || stripped === path) return true;
	if (
		path.includes("/") &&
		new RegExp(`^${escapeRegExp(path)}\\s+[—–:-]\\s`).test(stripped)
	)
		return true;
	const labelled =
		/^(?:repo path|file path|file|path|filename|@file|@module)\s*:?\s+(\S+)$/i.exec(
			stripped,
		);
	return Boolean(
		labelled?.[1] &&
			(labelled[1] === base ||
				labelled[1] === path ||
				path.endsWith(`/${labelled[1]}`)),
	);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBannerLine(line: { text: string; raw: string }): boolean {
	const raw = line.raw
		.replace(/^(?:\/\/+|\/\*+|#+|--+)/, "")
		.replace(/\*+\/$/, "");
	const text = line.text.trim();
	if (/^[#=\-*/~_+─━═]{5,}$/.test(line.raw.trim())) return true;
	if (!text) return false;
	return (
		RULE_LINE.test(text) ||
		RULE_LINE.test(raw.trim()) ||
		LABEL_BANNER.test(text)
	);
}

function isCodeLine(text: string, language: LanguageId): boolean {
	if (PROSE_LABEL.test(text) || TODO.test(text)) return false;
	if (language === "python") return PYTHON_CODE_LINE.test(text);
	if (language === "shell" || language === "sql" || language === "css")
		return false;
	return (
		JS_CODE_LINE.some((pattern) => pattern.test(text)) ||
		(LANGUAGE_CODE_LINE[language]?.some((pattern) => pattern.test(text)) ??
			false)
	);
}

function isCommentedOutCode(
	unit: CommentUnit,
	language: LanguageId,
	unitFacts: UnitFacts,
): boolean {
	if (unit.doc || EXAMPLE_CUE.test(unitFacts.text)) return false;
	const lines = unit.lines.map((line) => line.text).filter(Boolean);
	if (lines.length === 0) return false;
	if (language === "sql") {
		const joined = lines.join(" ");
		return (
			SQL_CODE_START.test(joined) &&
			SQL_CODE_BODY.test(joined) &&
			joined.endsWith(";")
		);
	}
	return lines.every((line) => isCodeLine(line, language));
}

function rawWords(text: string): string[] {
	return text
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((word) => word.toLowerCase());
}

export function identifierWords(code: string): string[] {
	return rawWords(code).map(stem);
}

function stem(word: string): string {
	const lower = word.toLowerCase();
	if (lower.length > 4 && lower.endsWith("ies"))
		return `${lower.slice(0, -3)}y`;
	if (lower.length > 4 && /(?:ss|x|ch|sh)es$/.test(lower))
		return lower.slice(0, -2);
	if (lower.length > 3 && lower.endsWith("s") && !lower.endsWith("ss"))
		return lower.slice(0, -1);
	return lower;
}

function covered(word: string, vocabulary: string[]): boolean {
	return vocabulary.some(
		(known) =>
			known === word ||
			(word.length >= 4 && known.startsWith(word)) ||
			(known.length >= 4 && word.startsWith(known)),
	);
}

export function restates(commentText: string, code: string): boolean {
	if (!code || /@(?!param\b|returns?\b)\w+/.test(commentText)) return false;
	const vocabulary = identifierWords(code);
	if (vocabulary.length === 0) return false;
	const content = rawWords(
		withoutUrls(commentText.replace(/@(?:param|returns?)\b/g, " ")),
	)
		.filter((word) => !STOPWORDS.has(word))
		.map(stem);
	return (
		content.length > 0 && content.every((word) => covered(word, vocabulary))
	);
}

const DECLARATION =
	/^(?:export\s+|public\s+|open\s+|pub(?:\([\w\s]+\))?\s+|internal\s+|private\s+|protected\s+|static\s+|readonly\s+|abstract\s+|async\s+|default\s+|declare\s+|override\s+|final\s+|data\s+|sealed\s+|inline\s+)*(?:function\*?|class|interface|type|const|let|var|val|enum|namespace|module|struct|protocol|extension|func|fun|fn|trait|impl|object|mod|def)\b/;

function isExported(code: string, language: LanguageId): boolean {
	switch (language) {
		case "ts":
		case "tsx":
		case "jsx":
			return /^export\b/.test(code);
		case "swift":
			return /^(?:@\w+\s+)*(?:public|open)\b/.test(code);
		case "rust":
			return /^pub\b/.test(code);
		case "kotlin":
			return (
				DECLARATION.test(code) &&
				!/^(?:private|internal|protected)\b/.test(code)
			);
		case "go":
			return /^(?:func\s+(?:\([^)]*\)\s*)?|type\s+|var\s+|const\s+)[A-Z]/.test(
				code,
			);
		default:
			return false;
	}
}

const TS_MEMBER =
	/^(?!(?:if|for|while|switch|catch|with|function)\b)(?:(?:public|protected|static|readonly|abstract|override|async|declare|get|set)\s+)*\*?[\w$]+\??\s*(?:<[^>]*>\s*)?(?::(?!.*,$)|\($|\((?:[^()]|\([^()]*\))*\)\s*[:{])/;
const GO_MEMBER = /^[A-Z]\w*(?:\s+[*[\]\w.]|\()/;

const PUBLIC_MEMBER: Partial<Record<LanguageId, RegExp>> = {
	ts: TS_MEMBER,
	tsx: TS_MEMBER,
	jsx: TS_MEMBER,
	go: GO_MEMBER,
};

function isPublicSurface(code: string, language: LanguageId): boolean {
	return (
		isExported(code, language) || (PUBLIC_MEMBER[language]?.test(code) ?? false)
	);
}

function lengthKind(
	unit: CommentUnit,
	docLike: boolean,
	language: LanguageId,
): LengthKind {
	return docLike && !unit.trailing && isPublicSurface(unit.codeAfter, language)
		? "export-doc"
		: "block";
}

function lineIndexes(
	unit: CommentUnit,
	predicate: (text: string) => boolean,
): number[] {
	const hits: number[] = [];
	unit.lines.forEach((line, index) => {
		if (line.text && predicate(line.text)) hits.push(index);
	});
	return hits;
}

function allLines(unit: CommentUnit): number[] {
	return unit.lines.flatMap((line, index) => (line.text ? [index] : []));
}

export function isStandaloneComment(text: string): boolean {
	const trimmed = text.trim();
	return (
		parseSuppression(trimmed) !== undefined ||
		DIRECTIVE_TEXT.some((pattern) => pattern.test(trimmed)) ||
		MARKER.test(trimmed)
	);
}

function isDocLike(unit: CommentUnit, language: LanguageId): boolean {
	return (
		unit.doc || (language === "go" && unit.marker === "//" && !unit.trailing)
	);
}

const MARKER_ANCHORED = /^\^(?:--|\\\/\\\/|#|\\\/\\\*)/;

function keepMatch(pattern: RegExp, line: CommentLine): RegExpExecArray | null {
	const raw = pattern.exec(line.raw);
	if (MARKER_ANCHORED.test(pattern.source)) return raw;
	return pattern.exec(line.text) ?? raw;
}

function freeText(line: CommentLine, keep: readonly RegExp[]): string {
	const rests = keep.flatMap((pattern) => {
		const match = keepMatch(pattern, line);
		return match ? [match.groups?.rest ?? ""] : [];
	});
	if (rests.length === 0) return line.text;
	return rests.includes("") ? "" : (rests[0] ?? "");
}

function lineDenial(
	unit: CommentUnit,
	ctx: ClassifyContext,
	unitFacts: UnitFacts,
): Classification | undefined {
	const provenance = lineIndexes(unit, (text) => isProvenance(text, unitFacts));
	if (provenance.length > 0)
		return { verdict: "deny", rule: "provenance", lines: provenance };
	const narration = lineIndexes(unit, (text) => isNarration(text, unitFacts));
	if (narration.length > 0)
		return { verdict: "deny", rule: "narration", lines: narration };
	const fileLine = lineIndexes(unit, (text) =>
		FILE_LINE.test(withoutQuotes(withoutUrls(text), false)),
	);
	if (fileLine.length > 0)
		return { verdict: "deny", rule: "file-line", lines: fileLine };
	const ownPath = lineIndexes(unit, (text) => isOwnPath(text, ctx.relPath));
	if (ownPath.length > 0)
		return { verdict: "deny", rule: "own-path", lines: ownPath };
	if (!unit.doc) {
		const banners = unit.lines.flatMap((line, index) =>
			isBannerLine(line) ? [index] : [],
		);
		if (banners.length > 0)
			return { verdict: "deny", rule: "banner", lines: banners };
	}
	if (isCommentedOutCode(unit, ctx.language, unitFacts))
		return {
			verdict: "deny",
			rule: "commented-out-code",
			lines: allLines(unit),
		};
	return undefined;
}

function denialBeside(
	unit: CommentUnit,
	ctx: ClassifyContext,
	free: (line: CommentLine) => string,
): Classification | undefined {
	const rest: CommentUnit = {
		...unit,
		lines: unit.lines.map((line) => {
			const text = free(line);
			return text === line.text ? line : { ...line, text, raw: "" };
		}),
	};
	return lineDenial(rest, ctx, facts(rest));
}

function freeOfLicense(line: CommentLine, keep: readonly RegExp[]): string {
	return isLicenseLine(line.text) || isBannerLine(line)
		? ""
		: freeText(line, keep);
}

export function classify(
	unit: CommentUnit,
	ctx: ClassifyContext,
): Classification {
	const every = allLines(unit);
	const lines = unit.lines.filter((line) => line.text);
	if (lines.length === 0)
		return { verdict: "keep", rule: "directive", lines: [] };
	if (lines.some((line) => isLicenseLine(line.text)))
		return (
			denialBeside(unit, ctx, (line) => freeOfLicense(line, ctx.keep)) ?? {
				verdict: "keep",
				rule: "license",
				lines: every,
			}
		);

	if (
		ctx.keep.some((pattern) =>
			unit.lines.some((line) => keepMatch(pattern, line) !== null),
		)
	) {
		const freeDenial = denialBeside(unit, ctx, (line) =>
			freeText(line, ctx.keep),
		);
		if (freeDenial) return freeDenial;
		const kind = lengthKind(unit, isDocLike(unit, ctx.language), ctx.language);
		const limit = ctx.limits[kind];
		if (lines.length > limit.max) {
			const size = { kind, lines: lines.length, limit: limit.max };
			return { verdict: limit.over, rule: "long-comment", lines: every, size };
		}
		return { verdict: "keep", rule: "project-keep", lines: every };
	}

	const first = lines[0]?.text ?? "";
	if (lines.length === 1) {
		const suppression = parseSuppression(first);
		if (suppression) {
			const rule = "suppression" as const;
			if (suppression.tool === "typescript" && ctx.typeHook)
				return { verdict: "keep", rule, lines: every };
			const typeTest =
				suppression.rules.includes("@ts-expect-error") &&
				isTypeTest(ctx.relPath);
			if (suppression.verdict === "deny" && !typeTest)
				return { verdict: "deny", rule, lines: every };
			if (suppression.verdict === "keep")
				return { verdict: "keep", rule, lines: every };
			return { verdict: "judge", rule, lines: every };
		}
	}

	const directive = (line: { text: string; raw: string }) =>
		DIRECTIVE_TEXT.some((pattern) => pattern.test(line.text)) ||
		DIRECTIVE_RAW.some((pattern) => pattern.test(line.raw));
	if (lines.every(directive))
		return { verdict: "keep", rule: "directive", lines: every };

	const unitFacts = facts(unit);
	const denial = lineDenial(unit, ctx, unitFacts);
	if (denial) return denial;

	const docLike = isDocLike(unit, ctx.language);
	const kind = lengthKind(unit, docLike, ctx.language);
	const limit = ctx.limits[kind];
	if (lines.length > limit.max) {
		const size = { kind, lines: lines.length, limit: limit.max };
		return { verdict: limit.over, rule: "long-comment", lines: every, size };
	}

	const code = unit.trailing ? unit.codeBefore : unit.codeAfter;
	if (restates(unitFacts.text, code))
		return { verdict: "deny", rule: "restating", lines: every };

	if (docLike && !unit.trailing && isExported(unit.codeAfter, ctx.language)) {
		return { verdict: "keep", rule: "doc-contract", lines: every };
	}
	if (unitFacts.hasLink && unitFacts.hasConstraint)
		return { verdict: "keep", rule: "linked-constraint", lines: every };

	if (TODO.test(first)) return { verdict: "judge", rule: "todo", lines: every };
	if (MARKER.test(first))
		return { verdict: "judge", rule: "marker", lines: every };
	return { verdict: "judge", rule: "judge", lines: every };
}
