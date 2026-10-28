import type { Masked } from "./types.ts";

const OPEN = "\uE000";
const CLOSE = "\uE001";
const SLASH = "\u2215";

export const AND_OR = `and${SLASH}or`;
export const PLACEHOLDER_SOURCE = `${OPEN}\\d+${CLOSE}`;

const PLACEHOLDER = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");
const ONE_PLACEHOLDER = new RegExp(`^${PLACEHOLDER_SOURCE}$`);
const TRAILING = /[.,;:!?)\]'"]+$/;

type Step =
	| {
			readonly kind: "mask";
			readonly pattern: RegExp;
			readonly trim: boolean;
	  }
	| { readonly kind: "replace"; readonly pattern: RegExp; readonly by: string };

function mask(pattern: RegExp, trim = false): Step {
	return { kind: "mask", pattern, trim };
}

function replace(pattern: RegExp, by: string): Step {
	return { kind: "replace", pattern, by };
}

const P = PLACEHOLDER_SOURCE;

const LEADING: readonly Step[] = [
	mask(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g),
	replace(/\band\s*\/\s*or\b/gi, AND_OR),
	replace(/!\[[^\]]*\]\([^)]*\)/g, " "),
	mask(
		/\[[^\]\n]+\]\(https?:\/\/(?:github\.com\/[^\s()]+\/(?:pull|issues|commit)\/[^\s()]+|linear\.app\/[^\s()]+)\)/g,
	),
	replace(/\[([^\]]+)\]\((?:[^()\s]+|\([^)\s]*\))*(?:\s+"[^"]*")?\)/g, "$1"),
	replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1"),
	mask(/<(?:https?:|mailto:)[^>\s]+>/g),
	mask(/\b(?:https?|ftp|file):\/\/[^\s<>]+/g, true),
	mask(/\bwww\.[^\s<>]+/g, true),
	mask(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, true),
	mask(/(?:~|\.{1,2})?\/?[\w.@*{}<>$-]+(?:\/[\w.@*{}<>$-]+)+\/?/g, true),
	mask(/(?<![\w/])\/[a-z][\w:-]*/g, true),
	mask(
		/\b[\w.-]+\.(?:md|mdx|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonl|sql|ya?ml|toml|sh|py|rb|go|rs|html|css|lock|txt|env|tsv|csv|log|pdf|png|svg|mdc)\b/g,
	),
	mask(/(?<![\w.])\.[A-Za-z][\w-]*(?:\.[\w-]+)*/g, true),
	replace(/<\/?[A-Za-z][^>]*>|&(?:[A-Za-z]+|#\d+|#x[0-9a-fA-F]+);/g, " "),
	mask(/"[^"\n]{1,200}"|“[^”\n]{1,200}”/g),
	mask(/(?<![\w'’])['‘](?:[^'‘’\n]|['’](?=\w)){1,200}['’](?![\w'’])/g),
];

const TRAILING_STEPS: readonly Step[] = [
	mask(/\$\{[^}\s]+\}|\$[A-Za-z_][A-Za-z0-9_]*/g),
	mask(/(?<![\w-])--?[A-Za-z][\w-]*/g),
	mask(/\bv?\d+(?:\.\d+)+(?:-[\w.]+)?\b/g),
	mask(/\b[A-Z][A-Z0-9]+-\d+\b/g),
	mask(/(?<![\w&])#\d+\b/g),
	mask(/(?<![\w])@[\w-]+(?:\/[\w.-]+)?/g),
	mask(/\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b/g),
	mask(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g),
	mask(/\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g),
	mask(/\b[A-Za-z_$][\w$]*\(\)/g),
	mask(/\b[A-Za-z_$][\w$]+(?:\.[A-Za-z_$][\w$]+)+\b/g),
	mask(/\b[a-z][\w-]*:[a-z][\w-]*\b/g),
	mask(/\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{2,}\b/g),
	mask(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,64}\b/g),
	mask(new RegExp(`${P}(?:\\s*,\\s*${P})+(?:,?\\s+(?:and|or)\\s+${P})?`, "g")),
	replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2"),
	replace(/(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1"),
	replace(/(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, "$1"),
	replace(/~~(?=\S)([^~\n]*?\S)~~/g, "$1"),
	replace(/\\([\\`*_{}[\]()#+.!~|-])/g, "$1"),
];

export function restore(text: string, spans: readonly string[]): string {
	return text
		.replace(PLACEHOLDER, (_match, index: string) => spans[Number(index)] ?? "")
		.replaceAll(SLASH, "/");
}

export function isPlaceholder(word: string): boolean {
	return ONE_PLACEHOLDER.test(word);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesStep(names: readonly string[]): readonly Step[] {
	const usable = names
		.map((name) => name.trim())
		.filter((name) => name.length > 1)
		.sort((a, b) => b.length - a.length);
	if (usable.length === 0) return [];
	const alternatives = usable.map(escapeRegExp).join("|");
	return [mask(new RegExp(`(?<![\\w-])(?:${alternatives})(?![\\w-])`, "gi"))];
}

function apply(state: Masked, step: Step): Masked {
	switch (step.kind) {
		case "replace":
			return { ...state, text: state.text.replace(step.pattern, step.by) };
		case "mask": {
			const spans = [...state.spans];
			const text = state.text.replace(step.pattern, (match: string) => {
				const tail = step.trim ? (TRAILING.exec(match)?.[0] ?? "") : "";
				const body = match.slice(0, match.length - tail.length);
				if (body === "") return match;
				spans.push(restore(body, spans));
				return `${OPEN}${spans.length - 1}${CLOSE}${tail}`;
			});
			return { text, spans };
		}
	}
}

export function maskInline(
	text: string,
	technicalNames: readonly string[] = [],
): Masked {
	const steps = [...LEADING, ...namesStep(technicalNames), ...TRAILING_STEPS];
	const masked = steps.reduce(apply, { text, spans: [] });
	return { ...masked, text: masked.text.replace(/\s+/g, " ").trim() };
}
