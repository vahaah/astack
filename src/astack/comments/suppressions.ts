export type SuppressionVerdict = "keep" | "deny" | "judge";

export interface Suppression {
	tool: string;
	rules: string[];
	reason: string;
	verdict: SuppressionVerdict;
}

export const BIOME_GROUP_VERDICTS: Record<string, SuppressionVerdict> = {
	style: "keep",
	correctness: "deny",
	suspicious: "deny",
	security: "deny",
};

export const BIOME_NURSERY_STYLE_RULES = new Set([
	"useSortedClasses",
	"useConsistentObjectKeys",
	"useConsistentFunctionStyle",
	"useConsistentTestIt",
	"useExplicitReturnType",
	"useExplicitType",
	"useImportsFirst",
	"useVarsOnTop",
	"useTailwindShorthandClasses",
]);

export const ESLINT_STYLE_RULES = [
	"@stylistic/",
	"prettier/",
	"simple-import-sort/",
	"perfectionist/",
	"import/order",
	"import/first",
	"import/newline-after-import",
	"react/jsx-sort-props",
	"react/jsx-max-props-per-line",
	"tailwindcss/classnames-order",
	"@typescript-eslint/naming-convention",
	"@typescript-eslint/member-ordering",
	"@typescript-eslint/consistent-type-definitions",
	"@typescript-eslint/array-type",
	"max-len",
	"indent",
	"quotes",
	"semi",
	"comma-dangle",
	"sort-keys",
	"sort-imports",
	"camelcase",
	"padding-line-between-statements",
	"lines-between-class-members",
	"arrow-body-style",
	"object-shorthand",
	"prefer-template",
];

function withReason(
	verdict: SuppressionVerdict,
	reason: string,
): SuppressionVerdict {
	return verdict === "keep" && !reason ? "judge" : verdict;
}

function combine(verdicts: SuppressionVerdict[]): SuppressionVerdict {
	if (verdicts.length === 0) return "judge";
	if (verdicts.includes("deny")) return "deny";
	if (verdicts.every((verdict) => verdict === "keep")) return "keep";
	return "judge";
}

export function biomeCategoryVerdict(category: string): SuppressionVerdict {
	const [kind, group, rule] = category.replace(/\(.*\)$/, "").split("/");
	if (kind === "format" || kind === "assist") return "keep";
	if (kind !== "lint" || !group) return "judge";
	if (group === "nursery")
		return rule && BIOME_NURSERY_STYLE_RULES.has(rule) ? "keep" : "judge";
	return BIOME_GROUP_VERDICTS[group] ?? "judge";
}

export function eslintRuleVerdict(rule: string): SuppressionVerdict {
	const stylistic = ESLINT_STYLE_RULES.some((style) =>
		style.endsWith("/") ? rule.startsWith(style) : rule === style,
	);
	return stylistic ? "keep" : "judge";
}

interface SuppressionSyntax {
	tool: string;
	pattern: RegExp;
	read: (match: RegExpExecArray) => Omit<Suppression, "tool">;
}

const SYNTAXES: SuppressionSyntax[] = [
	{
		tool: "formatter",
		pattern:
			/^(?:prettier-ignore|dprint-ignore(?:-file)?|@formatter:(?:off|on)|fmt:\s*(?:off|on|skip)|clang-format\s+(?:off|on)|isort:\s*(?:skip|skip_file|off|on))\b/,
		read: () => ({ rules: [], reason: "", verdict: "keep" }),
	},
	{
		tool: "typescript",
		pattern: /^@ts-(ignore|nocheck|expect-error)\b\s*(.*)$/,
		read: (match) => ({
			rules: [`@ts-${match[1]}`],
			reason: match[2] ?? "",
			verdict: "deny",
		}),
	},
	{
		tool: "biome",
		pattern: /^biome-ignore(-all|-start|-end)?\s+([^:]+?)\s*(?::\s*(.*))?$/,
		read: (match) => {
			const rules = (match[2] ?? "").split(/\s+/).filter(Boolean);
			const reason = (match[3] ?? "").trim();
			if (match[1] === "-end") return { rules, reason, verdict: "keep" };
			const verdict = combine(rules.map(biomeCategoryVerdict));
			return { rules, reason, verdict: withReason(verdict, reason) };
		},
	},
	{
		tool: "eslint",
		pattern: /^eslint-(disable|enable)(?:-next-line|-line)?\b(.*)$/,
		read: (match) => {
			const [ruleText = "", reason = ""] = (match[2] ?? "").split(/\s--\s/);
			const rules = ruleText
				.split(",")
				.map((rule) => rule.trim())
				.filter(Boolean);
			if (match[1] === "enable") return { rules, reason, verdict: "keep" };
			return {
				rules,
				reason: reason.trim(),
				verdict: combine(rules.map(eslintRuleVerdict)),
			};
		},
	},
	{
		tool: "other",
		pattern:
			/^(?:oxlint-disable\S*|tslint:disable\S*|jshint\b|stylelint-disable\S*|deno-lint-ignore\S*|swiftlint:disable\S*|rubocop:disable|nolint\b|NOSONAR\b|noqa\b|type:\s*ignore\b|pyright:\s*ignore\b|pylint:\s*disable|shellcheck\s+disable|istanbul\s+ignore|[cv]8\s+ignore|pragma:\s*no cover|ktlint-disable)(.*)$/,
		read: (match) => ({
			rules: [],
			reason: (match[1] ?? "").trim(),
			verdict: "judge",
		}),
	},
];

export function parseSuppression(text: string): Suppression | undefined {
	const trimmed = text.trim();
	for (const syntax of SYNTAXES) {
		const match = syntax.pattern.exec(trimmed);
		if (match) return { tool: syntax.tool, ...syntax.read(match) };
	}
	return undefined;
}

export function classifySuppression(text: string): SuppressionVerdict {
	return parseSuppression(text)?.verdict ?? "judge";
}
