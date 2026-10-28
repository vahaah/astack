import { posix } from "node:path";
import type { ProfileGate } from "../../src/astack/pr-review-profile.ts";
import { type PackageScripts, reachedScripts } from "./task-cache.ts";

export type ScriptRepo = {
	readonly packages: readonly PackageScripts[];
	readonly read: (path: string) => string | undefined;
};

export const PLATFORM_TOOLS: Readonly<Record<string, string>> = {
	lockf: "macOS and BSD",
	flock: "Linux",
	launchctl: "macOS",
	osascript: "macOS",
	pbcopy: "macOS",
	pbpaste: "macOS",
	sw_vers: "macOS",
	xcodebuild: "macOS",
	xcrun: "macOS",
};

const RUNTIME_FILE =
	/(?:\bcd\s+(?:\.\/)?([\w@./-]+?)\/?\s*&&\s*)?(?<![\w./-])(?:bun|node|tsx|bash|sh)\s+(?:-\S+\s+)*((?:\.\/)?[\w@./-]+\.(?:[cm]?[jt]s|sh))(?![\w./-])/g;

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

const LINE_COMMENT = /(?<![:\w"'`])\/\/.*$/gm;

const SHELL_COMMENT = /(?:^|\s)#.*$/gm;

function codeOf(path: string, text: string): string {
	return path.endsWith(".sh")
		? text.replace(SHELL_COMMENT, "")
		: text.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

function names(text: string, tool: string): boolean {
	return new RegExp(String.raw`(?<![\w.-])${tool}(?![\w.-])`).test(text);
}

function testsFor(step: string, tool: string): boolean {
	const path = String.raw`["']?(?:[\w./-]*\/)?${tool}(?![\w.-])`;
	return new RegExp(
		String.raw`^(?:(?:command\s+-v|type|which|hash)\s+${path}|(?:\[\[?\s+|test\s+)-[efx]\s+${path})`,
	).test(step);
}

const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g;

function splitList(text: string, operator: RegExp): string[] {
	const masked = text.replace(QUOTED, (quoted) => "_".repeat(quoted.length));
	let offset = 0;
	return masked.split(operator).map((piece) => {
		const part = text.slice(offset, offset + piece.length);
		offset += piece.length;
		return part.trim();
	});
}

function stepFails(step: string, tool: string): boolean {
	return testsFor(splitList(step, /(\|)/).at(-1) ?? "", tool);
}

function failsWithout(list: string, tool: string): boolean {
	const chain = splitList(list, /(;|\n)/)
		.filter((part, index) => index % 2 === 0 && part !== "")
		.at(-1);
	if (chain === undefined) return false;
	const [first = "", ...rest] = splitList(chain, /(&&|\|\|)/);
	const links = rest.flatMap((operator, index) =>
		index % 2 === 0 ? [{ operator, step: rest[index + 1] ?? "" }] : [],
	);
	return links.reduce(
		(fails, { operator, step }) =>
			operator === "&&"
				? fails || stepFails(step, tool)
				: fails && stepFails(step, tool),
		stepFails(first, tool),
	);
}

const NO_IF = String.raw`(?:(?!\b(?:if|fi)\b)[\s\S])*?`;

const IF_ELSE = new RegExp(
	String.raw`\bif\s+(${NO_IF})\bthen\b${NO_IF}\belse\b(${NO_IF})\bfi\b`,
	"g",
);

const PRINTS: readonly string[] = ["echo", "printf"];

const RUNS_NOTHING: readonly string[] = [
	...PRINTS,
	"cd",
	"exit",
	"return",
	"true",
	"false",
	":",
];

function firstWord(step: string): string {
	return step.split(/\s+/)[0] ?? "";
}

type Reached = { readonly via: string; readonly text: string };

function reached(
	text: string,
	context: string,
	repo: ScriptRepo,
	via: string,
	seen: ReadonlySet<string>,
): Reached[] {
	const files = [...text.matchAll(RUNTIME_FILE)].flatMap(
		([, cd, file = ""]): Reached[] => {
			const path = posix.normalize(posix.join(context, cd ?? "", file));
			const source = seen.has(path) ? undefined : repo.read(path);
			return source === undefined
				? []
				: [{ via: `${via}, through ${path}`, text: codeOf(path, source) }];
		},
	);
	const scripts = reachedScripts(text, context, repo.packages).flatMap(
		({ dir, script, body }) => {
			const key = `${dir}#${script}`;
			if (seen.has(key)) return [];
			const folder = dir === "." ? "the repo root" : dir;
			return reached(
				body,
				dir,
				repo,
				`the ${script} script of ${folder}`,
				new Set([...seen, key]),
			);
		},
	);
	return [{ via, text }, ...files, ...scripts];
}

function portable(fallback: string, tool: string, repo: ScriptRepo): boolean {
	const steps = fallback
		.split(/;|&&|\|\||\||\n/)
		.map((step) => step.trim())
		.filter((step) => step !== "" && !PRINTS.includes(firstWord(step)));
	return (
		steps.some((step) => !RUNS_NOTHING.includes(firstWord(step))) &&
		!reached(steps.join(" && "), ".", repo, "its else branch", new Set()).some(
			(entry) => names(entry.text, tool),
		)
	);
}

function withoutGuardedIfs(
	command: string,
	tool: string,
	repo: ScriptRepo,
): string {
	return command.replace(IF_ELSE, (guard, condition = "", fallback = "") =>
		failsWithout(condition, tool) && portable(fallback, tool, repo)
			? "true"
			: guard,
	);
}

export function platformToolGaps(
	repo: ScriptRepo,
	gates: readonly ProfileGate[],
): string[] {
	return gates.flatMap((gate) => {
		const preparation = gate.preparation.flatMap((entry) =>
			reached(entry, ".", repo, "a setup or prerequisite entry", new Set()),
		);
		return Object.entries(PLATFORM_TOOLS).flatMap(([tool, platforms]) => {
			if (gate.checks.some((check) => failsWithout(check, tool))) return [];
			const texts = [
				...reached(
					withoutGuardedIfs(gate.command, tool, repo),
					".",
					repo,
					"its command",
					new Set(),
				),
				...preparation,
			];
			const found = texts.find((entry) => names(entry.text, tool));
			return found === undefined
				? []
				: [
						`The gate ${gate.name} needs ${tool} in ${found.via}. ${tool} ships only on ${platforms}, so the gate cannot start on another host. Add a prerequisite whose check tests for ${tool}, such as \`command -v ${tool}\`. Or make the gate command an if that tests for ${tool}, and run a portable form with no ${tool} in its else branch.`,
					];
		});
	});
}
