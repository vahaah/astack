import {
	type AllowEntry,
	applyAllowlist,
	parseAllowFile,
	type Residual,
	type ResidualPattern,
} from "../validate.ts";
import { type FileTree, isText, textOf } from "./tree.ts";

export const CLAUDE_TERMS: readonly ResidualPattern[] = [
	{ id: "claude-env", pattern: /\bCLAUDE_[A-Z_]+/ },
	{
		id: "namespaced-name",
		pattern: /(?<![\w.:-])(?<!skill-path )\/?(?:astack|flow|pstack):[a-z0-9]/,
	},
	{ id: "skill-tool", pattern: /\bSkill tool\b|`Skill`/ },
	{ id: "agent-tool", pattern: /\bAgent tool\b|`Agent`|\bsubagent_type\b/ },
	{ id: "bash-rule", pattern: /\bBash\(/ },
	{ id: "claude-home", pattern: /~\/\.claude\b|\.claude\// },
	{ id: "claude-product", pattern: /\bClaude\b/ },
	{ id: "claude-md", pattern: /\bCLAUDE(?:\.local)?\.md\b/ },
	{ id: "arguments", pattern: /\$ARGUMENTS\b/ },
	{
		id: "claude-tools",
		pattern: /\b(?:ExitPlanMode|EnterPlanMode|AskUserQuestion|TodoWrite)\b/,
	},
	{ id: "claude-models", pattern: /\bmodel:? "?(?:opus|sonnet|haiku)\b/ },
	{ id: "claude-cli", pattern: /\bclaude (?:-p|plugin)\b/ },
	{ id: "argument-hint", pattern: /^argument-hint:/ },
];

export const FLAT_ROOTS = ["cursor/", "grok-bot/", "agentskills/"];

const SKIPPED =
	/(?:^|\/)(?:LICENSE|LICENSE\.txt|NOTICE)$|\/bin\/|\/third_party\//;

export function lintedPath(path: string): boolean {
	return (
		FLAT_ROOTS.some((root) => path.startsWith(root)) && !SKIPPED.test(path)
	);
}

export function scanTree(
	tree: FileTree,
	patterns: readonly ResidualPattern[] = CLAUDE_TERMS,
): Residual[] {
	const residuals: Residual[] = [];
	for (const [path, entry] of tree) {
		if (!lintedPath(path) || !isText(entry)) continue;
		textOf(entry)
			.split("\n")
			.forEach((text, index) => {
				for (const { id, pattern } of patterns) {
					const match = pattern.exec(text);
					if (match)
						residuals.push({
							relpath: path,
							line: index + 1,
							patternId: id,
							text,
							index: match.index,
						});
				}
			});
	}
	return residuals;
}

export type LintResult = {
	readonly unallowed: readonly Residual[];
	readonly allowed: number;
	readonly unused: readonly AllowEntry[];
	readonly errors: readonly string[];
};

export function lintClaudeTerms(tree: FileTree, allowText: string): LintResult {
	const { entries, errors } = parseAllowFile(allowText);
	const { unallowed, allowed } = applyAllowlist(scanTree(tree), entries);
	return {
		unallowed,
		allowed: allowed.length,
		unused: entries.filter((entry) => entry.used === 0),
		errors: errors.map((error) =>
			error.replace(/^residuals\.allow/, "claude-terms.allow"),
		),
	};
}
