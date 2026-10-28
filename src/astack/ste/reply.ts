import { checkText, denied } from "./check.ts";
import { fenceInfo, PROSE_FENCE } from "./scope.ts";
import type { Finding, Glossary } from "./types.ts";

export type ReplyInput = {
	readonly text: string | undefined;
	readonly interactive: boolean;
	readonly subagent: boolean;
};

export type ReplyExemption =
	| "empty"
	| "headless"
	| "subagent"
	| "json"
	| "yaml"
	| "fenced"
	| "clean";

export type ReplyDecision =
	| { readonly kind: "allow"; readonly why: ReplyExemption }
	| { readonly kind: "rewrite"; readonly findings: readonly Finding[] };

const YAML_KEY = /^[A-Za-z_][\w.-]*:(?:\s+(.*))?$/;
const YAML_SCALAR =
	/^(?:|[|>][+-]?\d*|"[^"]*"|'[^']*'|\[.*\]|\{.*\}|-?\d+(?:\.\d+)?|true|false|null|~|&\w+|\*\w+)$/i;
const BARE_TOKEN = /^[^\s'"]+$/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;

export function isJsonReply(text: string): boolean {
	const trimmed = text.trim();
	if (!/^[[{]/.test(trimmed)) return false;
	try {
		const parsed: unknown = JSON.parse(trimmed);
		return typeof parsed === "object" && parsed !== null;
	} catch {
		return false;
	}
}

function plainValue(value: string): string {
	return value.replace(/\s+#.*$/, "").trim();
}

function yamlValue(value: string): boolean {
	const plain = plainValue(value);
	return YAML_SCALAR.test(plain) || BARE_TOKEN.test(plain);
}

function yamlOnly(value: string): boolean {
	const plain = plainValue(value);
	return plain !== "" && YAML_SCALAR.test(plain);
}

export function isYamlReply(text: string): boolean {
	const lines = text
		.trim()
		.split(/\r?\n/)
		.filter((line) => line.trim() !== "" && !/^\s*#/.test(line));
	const topLevel = lines.filter((line) => !/^\s/.test(line));
	const body = topLevel.filter((line) => !/^(?:---|\.\.\.)\s*$/.test(line));
	if (body.length === 0) return false;
	const documentStart = topLevel[0]?.trim() === "---";
	if (body.length < 2 && !documentStart) return false;
	const values = body.map((line) => YAML_KEY.exec(line));
	if (!values.every((key) => key !== null && yamlValue(key[1] ?? "")))
		return false;
	const nested = lines.length > topLevel.length;
	return (
		documentStart || nested || values.some((key) => yamlOnly(key?.[1] ?? ""))
	);
}

export function isSingleFence(text: string): boolean {
	const lines = text.trim().split(/\r?\n/);
	const open = FENCE_LINE.exec(lines[0] ?? "");
	const marker = open?.[1];
	if (!marker || lines.length < 2) return false;
	const last = (lines[lines.length - 1] ?? "").trim();
	const closes =
		last.length >= marker.length &&
		[...last].every((char) => char === marker[0]);
	const inner = lines.slice(1, -1);
	const info = fenceInfo(lines[0] ?? "", marker);
	return (
		closes &&
		!PROSE_FENCE.test(info) &&
		!inner.some((line) => FENCE_LINE.test(line))
	);
}

export function replyExemption(input: ReplyInput): ReplyExemption | undefined {
	if (input.text === undefined || input.text.trim() === "") return "empty";
	if (input.subagent) return "subagent";
	if (!input.interactive) return "headless";
	if (isJsonReply(input.text)) return "json";
	if (isYamlReply(input.text)) return "yaml";
	if (isSingleFence(input.text)) return "fenced";
	return undefined;
}

export function decideReply(
	input: ReplyInput,
	glossary: Glossary,
): ReplyDecision {
	const exempt = replyExemption(input);
	if (exempt !== undefined || input.text === undefined)
		return { kind: "allow", why: exempt ?? "empty" };
	const report = checkText(input.text, {
		surface: "reply",
		enforcement: "deny",
		glossary,
	});
	const findings = denied(report);
	return findings.length === 0
		? { kind: "allow", why: "clean" }
		: { kind: "rewrite", findings };
}
