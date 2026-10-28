export const RULE_IDS = [
	"contraction",
	"semicolon",
	"dash",
	"latin",
	"and-or",
	"sentence-length",
	"word-list",
	"word-broad",
	"perfect",
	"progressive",
	"modal",
	"passive",
	"paragraph-length",
	"one-instruction",
	"ing-form",
	"noun-cluster",
	"hedge",
	"symbol",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export type FindingRule = RuleId | "language";

export type Severity = "deny" | "advise";

export type TextKind = "procedural" | "descriptive";

export type UnitKind = "paragraph" | "item" | "field" | "heading" | "title";

export type Surface = "doc" | "pr" | "ticket" | "commit" | "comment" | "reply";

export type Enforcement = "deny" | "advise";

export type Basis =
	| { readonly kind: "ste-public"; readonly citation: string }
	| { readonly kind: "ste-checkers" }
	| { readonly kind: "house" };

export type Masked = {
	readonly text: string;
	readonly spans: readonly string[];
};

export type RawLine = { readonly line: number; readonly text: string };

export type Unit = {
	readonly kind: UnitKind;
	readonly line: number;
	readonly text: string;
	readonly spans: readonly string[];
	readonly raw: readonly RawLine[];
};

export type Sentence = {
	readonly unit: Unit;
	readonly line: number;
	readonly text: string;
	readonly words: readonly string[];
	readonly kind: TextKind;
	readonly key: string;
};

export type Hit = {
	readonly rule: RuleId;
	readonly sentence: Sentence;
	readonly excerpt: string;
	readonly fix: string;
};

export type Finding = {
	readonly rule: FindingRule;
	readonly severity: Severity;
	readonly line: number;
	readonly sentence: string;
	readonly excerpt: string;
	readonly fix: string;
	readonly fingerprint: string;
};

export type Glossary = {
	readonly technicalNames: readonly string[];
	readonly technicalVerbs: ReadonlySet<string>;
};

export type Report = {
	readonly findings: readonly Finding[];
	readonly sentences: number;
	readonly skipped: "none" | "language";
};
