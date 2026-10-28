import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import {
	ASTACK_WORDS,
	type CommitWords,
	joinList,
} from "../../src/astack/commit-style.ts";
import { checkText, denied } from "../../src/astack/ste/check.ts";
import { commitProse, SUBJECT_LINES } from "../../src/astack/ste/commit.ts";
import { findingLine } from "../../src/astack/ste/format.ts";
import type { Glossary } from "../../src/astack/ste/types.ts";
import type { Gate, TrackerConfig } from "./projects.ts";
import type { ArtifactKind } from "./render.ts";

export const worktreesDefault = "~/.local/state/astack/worktrees";

export type MainState = {
	readonly head: string;
	readonly branch: string;
	readonly statusHash: string;
};

export type TextFile = { readonly path: string; readonly text: string };

export type BranchCheck = {
	readonly path: string;
	readonly line: number;
	readonly command: string;
};

export type BranchShapes = {
	readonly path: string;
	readonly line: number;
	readonly shapes: readonly string[];
};

const BAD_REF_CHARS = /[\s~^:?*[\\]/;

function hasControlChar(text: string): boolean {
	return [...text].some((char) => {
		const code = char.charCodeAt(0);
		return code < 0x20 || code === 0x7f;
	});
}

export function branchRefusal(name: string): string | undefined {
	if (name === "" || name === "@") return "the branch name is empty";
	if (BAD_REF_CHARS.test(name) || hasControlChar(name))
		return `"${name}" has a space or a character that git does not allow in a branch name`;
	if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/"))
		return `"${name}" starts with - or /, or ends with /`;
	if (name.includes("..") || name.includes("@{") || name.includes("//"))
		return `"${name}" has .., @{ or //`;
	if (name.endsWith(".") || name.endsWith(".lock"))
		return `"${name}" ends with . or .lock`;
	if (name.split("/").some((part) => part.startsWith(".")))
		return `"${name}" has a part that starts with .`;
	return undefined;
}

export function expandBranchTemplate(template: string, today: string): string {
	return template.replaceAll("{date}", today);
}

export function branchSlug(branch: string): string {
	return branch.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function worktreePath(
	root: string,
	project: string,
	branch: string,
): string {
	return join(root, project, branchSlug(branch));
}

export function isInside(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || !(rel.startsWith("..") || rel.startsWith("/"));
}

export function statusHash(porcelain: string): string {
	return createHash("sha256").update(porcelain).digest("hex");
}

export function mainStateChanges(
	before: MainState,
	after: MainState,
): string[] {
	return [
		...(before.head === after.head
			? []
			: [`HEAD moved from ${before.head} to ${after.head}`]),
		...(before.branch === after.branch
			? []
			: [`the branch changed from ${before.branch} to ${after.branch}`]),
		...(before.statusHash === after.statusHash
			? []
			: ["the output of git status --porcelain changed"]),
	];
}

export function remoteBranchName(base: string): string | undefined {
	return /^origin\/(.+)$/.exec(base)?.[1];
}

const DEPENDENT_TOOLS: ReadonlySet<string> = new Set([
	"bun",
	"bunx",
	"node",
	"npm",
	"npx",
	"pnpm",
	"yarn",
]);

export function gatesNeedDeps(gates: readonly Gate[]): boolean {
	return gates.some((gate) => {
		const [tool] = gate.run;
		return (
			tool !== undefined &&
			(tool.startsWith("./node_modules/") || DEPENDENT_TOOLS.has(tool))
		);
	});
}

const SCRIPT_RUN =
	/^\s*(?:run:\s*\|?\s*)?((?:bun|bunx|node|npx|tsx|deno|python3?|bash|sh)\s+[^\s\\]+)/;

export function findBranchChecks(
	workflows: readonly TextFile[],
): BranchCheck[] {
	return workflows.flatMap((file) => {
		if (!file.text.includes("github.head_ref")) return [];
		const lines = file.text.split("\n");
		return lines.flatMap((line, index) => {
			if (!/--branch\b/.test(line)) return [];
			for (let at = index; at >= Math.max(0, index - 6); at--) {
				const command = SCRIPT_RUN.exec(lines[at] ?? "")?.[1];
				if (command !== undefined)
					return [{ path: file.path, line: at + 1, command }];
			}
			return [];
		});
	});
}

const SPAN = /`([^`\s]+)`/g;

function isBranchShape(span: string): boolean {
	const filled = span
		.replace(/<[^<>]+>/g, "x")
		.replace(/^(?:\u2026|\.\.\.)\//, "x/");
	return (
		/<[^<>]+>$/.test(span) &&
		span.includes("/") &&
		span.includes("-") &&
		branchRefusal(filled) === undefined
	);
}

export function documentedShapes(docs: readonly TextFile[]): BranchShapes[] {
	return docs.flatMap((file) =>
		file.text.split("\n").flatMap((line, index) => {
			if (!/\bbranch/i.test(line)) return [];
			const shapes = [...line.matchAll(SPAN)]
				.map((match) => match[1] ?? "")
				.filter(isBranchShape);
			return shapes.length === 0
				? []
				: [{ path: file.path, line: index + 1, shapes }];
		}),
	);
}

const ELLIPSIS = /^(?:…|\.\.\.)\//;

function escaped(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function shapeMatches(shape: string, branch: string): boolean {
	const source = shape
		.split(/(<[^<>]+>|…|\.\.\.)/)
		.map((part) => {
			if (part === "…" || part === "...") return ".*";
			if (/^<[^<>]+>$/.test(part)) return "[^/]+";
			return escaped(part);
		})
		.join("");
	return new RegExp(`^${source}$`).test(branch);
}

function placeholders(shape: string): number {
	return (
		(shape.match(/<[^<>]+>/g) ?? []).length + (ELLIPSIS.test(shape) ? 1 : 0)
	);
}

export function suggestedBranch(
	shapes: readonly string[],
	branch: string,
): string | undefined {
	const [simplest] = [...shapes].sort(
		(left, right) => placeholders(left) - placeholders(right),
	);
	if (simplest === undefined) return undefined;
	const prefix = shapes
		.find((shape) => !ELLIPSIS.test(shape) && shape.includes("/"))
		?.replace(/\/[^/]*$/, "");
	const named = simplest.replace("<slug>", branchSlug(branch));
	return ELLIPSIS.test(named) && prefix !== undefined
		? named.replace(ELLIPSIS, `${prefix}/`)
		: named;
}

export function branchWarning(
	branch: string,
	worktree: string,
	checks: readonly BranchCheck[],
	documented: readonly BranchShapes[],
): string[] {
	const shapes = documented.flatMap((entry) => entry.shapes);
	if (checks.length === 0 && shapes.length === 0) return [];
	if (shapes.some((shape) => shapeMatches(shape, branch))) return [];
	const rename = renameCommand(
		worktree,
		branch,
		suggestedBranch(shapes, branch) ?? "<new-name>",
	);
	return [
		`Warning: this repo has a rule for branch names, and ${branch} can fail it.`,
		"",
		...checks.map(
			(check) =>
				`- ${check.path}:${check.line} gives the branch name to \`${check.command}\` in CI.`,
		),
		...documented.map(
			(entry) =>
				`- ${entry.path}:${entry.line} gives the shapes ${joinList(entry.shapes.map((shape) => `\`${shape}\``))}.`,
		),
		"",
		renameAdvice(rename.variables),
		"",
		`    ${rename.command}`,
	];
}

function renameAdvice(variables: readonly string[]): string {
	const [first, ...rest] = variables;
	if (first === undefined) return "Rename the branch before you push it.";
	return rest.length === 0
		? `Rename the branch before you push it. First set the shell variable ${first}. The command stops when it is empty.`
		: `Rename the branch before you push it. First set the shell variables ${joinList(variables)}. The command stops when one is empty.`;
}

const PLACEHOLDER = /(<[^<>]+>)/;

function placeholderVariable(part: string): string | undefined {
	const inner = /^<([^<>]+)>$/.exec(part)?.[1];
	if (inner === undefined) return undefined;
	const name = inner
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return /^[A-Z]/.test(name) ? name : `NAME_${name}`;
}

export type RenameCommand = {
	readonly variables: readonly string[];
	readonly command: string;
};

export function renameCommand(
	worktree: string,
	branch: string,
	name: string,
): RenameCommand {
	const parts = name.split(PLACEHOLDER);
	const variables = [
		...new Set(parts.flatMap((part) => placeholderVariable(part) ?? [])),
	];
	const quoted = parts
		.map((part) => {
			const variable = placeholderVariable(part);
			return variable === undefined
				? part.replace(/["\\$`]/g, "\\$&")
				: `\${${variable}:?set ${variable}}`;
		})
		.join("");
	const target = variables.length === 0 ? shellQuoted(name) : `"${quoted}"`;
	return {
		variables,
		command: `git -C ${worktree} branch -m ${branch} ${target}`,
	};
}

const partLabels = (words: CommitWords): Record<ArtifactKind, string> => ({
	"astack-profile": `the ${words.tool} profile`,
	"review-stub": "review stub",
	"review-profile": "hardening profile",
	"flow-config": words.agentDocs,
	rule: "rule copies",
	notice: "license notices",
	settings: "plugin wiring",
});

const PART_ORDER: readonly ArtifactKind[] = [
	"astack-profile",
	"review-stub",
	"review-profile",
	"flow-config",
	"rule",
	"notice",
	"settings",
];

export function commitParts(
	kinds: readonly ArtifactKind[],
	words: CommitWords = ASTACK_WORDS,
): string[] {
	const labels = partLabels(words);
	const unique = [
		...new Set(
			PART_ORDER.filter((kind) => kinds.includes(kind)).map(
				(kind) => labels[kind],
			),
		),
	];
	const [first, ...rest] = unique;
	if (first === undefined) return [];
	return first === labels["astack-profile"]
		? [first, ...rest]
		: [`the ${words.tool} ${first}`, ...rest];
}

export type NextStepsInput = {
	readonly repo: string;
	readonly worktree: string;
	readonly branch: string;
	readonly baseBranch: string;
	readonly subject: string;
	readonly prTemplate: string | undefined;
	readonly tracker: TrackerConfig;
	readonly branchWarning: readonly string[];
};

function partOf(tracker: TrackerConfig): string[] {
	if (tracker.kind === "none" || !tracker.requirePartOf) return [];
	const key = tracker.kind === "linear" ? `${tracker.team}-<n>` : "#<n>";
	return [`Put "Part of ${key}" on the first line of the body.`];
}

function shellQuoted(text: string): string {
	return `'${text.replaceAll("'", "'\\''")}'`;
}

export function nextSteps(input: NextStepsInput): string[] {
	const renamed = input.branchWarning.length > 0;
	return [
		"## Next steps",
		"",
		"Review the diff of the commit.",
		"",
		`    git -C ${input.worktree} show --stat HEAD`,
		`    git -C ${input.worktree} show HEAD`,
		"",
		...(renamed ? [...input.branchWarning, ""] : []),
		"Push the branch.",
		"",
		`    git -C ${input.worktree} push -u origin ${renamed ? "HEAD" : input.branch}`,
		"",
		`Open the pull request against ${input.baseBranch}.`,
		input.prTemplate === undefined
			? "Write the body with the astack:write-docs skill."
			: `Write the body in the template from ${input.prTemplate}.`,
		...partOf(input.tracker),
		"",
		`    cd ${input.worktree}`,
		`    gh pr create --base ${input.baseBranch} --title ${shellQuoted(input.subject)}`,
		"",
		"After the merge, remove the worktree and the local branch.",
		"",
		...(renamed
			? [
					`    branch=$(git -C ${input.worktree} branch --show-current)`,
					`    git -C ${input.repo} worktree remove ${input.worktree}`,
					`    git -C ${input.repo} branch -D "$branch"`,
				]
			: [
					`    git -C ${input.repo} worktree remove ${input.worktree}`,
					`    git -C ${input.repo} branch -D ${input.branch}`,
				]),
	];
}

export function steRefusals(
	message: string,
	title: string,
	glossary: Glossary,
): string[] {
	const prose = commitProse(message);
	const check = (text: string, surface: "commit" | "pr") =>
		denied(
			checkText(text, {
				surface,
				enforcement: "deny",
				glossary,
				titleLines: SUBJECT_LINES,
			}),
		).map(findingLine);
	return [
		...(prose === undefined ? [] : check(prose, "commit")).map(
			(line) => `the commit message: ${line}`,
		),
		...check(title, "pr").map((line) => `the PR title: ${line}`),
	];
}
