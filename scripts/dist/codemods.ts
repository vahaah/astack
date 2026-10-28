export type Plugin = string;

export type Owner = Plugin | "rules";

export type FlatContext = {
	readonly owner: Owner;
	readonly astackSkills: ReadonlySet<string>;
	readonly cli?: string;
};

const CLI_FALLBACK = `"\${CLAUDE_SKILL_DIR}/../../bin/astack"`;
export const PLUGIN_CLI = `"<skill-dir>/../../bin/astack"`;

const NAME = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SKILL_PATH = new RegExp(`\\bastack skill-path astack:${NAME}`, "g");
const NAMESPACED = new RegExp(`(?<![\\w.:-])(\\/)?astack:(${NAME})`, "g");
const SIBLING = new RegExp(`(?<![\\w.])\\.\\./(${NAME})/`, "g");
const AGENT_SKILL = new RegExp(`(?<![\\w.])\\.\\./skills/(${NAME})/`, "g");
const FENCE = /^\s*(?:```|~~~)/;
const SKILL_DIR = `\${CLAUDE_SKILL_DIR}`;

export function flatName(name: string): string {
	return `astack-${name}`;
}

function protect(
	text: string,
	pattern: RegExp,
	rewrite: (text: string) => string,
): string {
	const kept: string[] = [];
	const masked = text.replace(pattern, (match) => {
		kept.push(match);
		return `\uE000${kept.length - 1}\uE001`;
	});
	return rewrite(masked).replace(
		/\uE000(\d+)\uE001/g,
		(_, index: string) => kept[Number(index)] ?? "",
	);
}

const VERB: Readonly<Record<string, string>> = {
	call: "invoke",
	Call: "Invoke",
	calls: "invokes",
	calling: "invoking",
};

type Phrase = readonly [RegExp, string | ((...groups: string[]) => string)];

const SKILL_TOOL_PHRASES: readonly Phrase[] = [
	[
		/\b(call|Call|calls|calling) the Skill tool twice, for (["`])([^"`]+)\2 and (["`])([^"`]+)\4/g,
		(_, verb = "", q1 = "", a = "", q2 = "", b = "") =>
			`${VERB[verb]} the ${q1}${a}${q1} and ${q2}${b}${q2} skills`,
	],
	[
		/\b(call|Call|calls|calling) the Skill tool with (["`])([^"`]+)\2 and with (["`])([^"`]+)\4/g,
		(_, verb = "", q1 = "", a = "", q2 = "", b = "") =>
			`${VERB[verb]} the ${q1}${a}${q1} and ${q2}${b}${q2} skills`,
	],
	[
		/\b(call|Call|calls|calling) the Skill tool with (["`])([^"`]+)\2/g,
		(_, verb = "", quote = "", name = "") =>
			`${VERB[verb]} the ${quote}${name}${quote} skill`,
	],
	[/\bCall the Skill tool for these\b/g, "Invoke these skills"],
	[/\bcall the Skill tool for\b/g, "invoke"],
	[/\bnames the Skill tool\b/g, "names the skill"],
	[
		/\binvoke: the Skill tool with ([\w:-]+)/g,
		(_, name = "") => `invoke: the ${name} skill`,
	],
	[/\bthe Skill tool refuses (them|it)\b/g, "the model cannot invoke $1"],
	[
		/\bthe Skill tool cannot find an astack skill\b/g,
		"an astack skill is missing",
	],
	[
		/\bIf the Skill tool does not list (`[^`]+`) or refuses it\b/g,
		"If $1 is missing or refuses to run",
	],
	[/ with the Skill tool\b/g, ""],
];

const ARGUMENT_PHRASES: readonly Phrase[] = [
	[/`\$ARGUMENTS`/g, "the user's request"],
];

function applyPhrases(text: string, phrases: readonly Phrase[]): string {
	return phrases.reduce(
		(current, [pattern, replacement]) =>
			typeof replacement === "string"
				? current.replace(pattern, replacement)
				: current.replace(pattern, replacement),
		text,
	);
}

function rewriteSkillDir(text: string): string {
	let fenced = false;
	return text
		.split("\n")
		.map((line) => {
			if (FENCE.test(line)) {
				fenced = !fenced;
				return line;
			}
			if (!line.includes(SKILL_DIR)) return line;
			const withSiblings = line.replaceAll(`${SKILL_DIR}/../`, "../");
			return fenced
				? withSiblings.replaceAll(SKILL_DIR, "<skill-dir>")
				: withSiblings
						.replaceAll(`${SKILL_DIR}/`, "")
						.replaceAll(SKILL_DIR, ".");
		})
		.join("\n");
}

function rewriteSiblings(text: string, context: FlatContext): string {
	const { owner } = context;
	if (owner === "rules") return text;
	return text
		.replace(AGENT_SKILL, (match, name: string) =>
			context.astackSkills.has(name) ? `../skills/${flatName(name)}/` : match,
		)
		.replace(SIBLING, (match, name: string) =>
			context.astackSkills.has(name) ? `../${flatName(name)}/` : match,
		);
}

function flattenNames(text: string): string {
	return text.replace(
		NAMESPACED,
		(_, slash: string | undefined, name: string) =>
			`${slash ?? ""}${flatName(name)}`,
	);
}

export const SKILL_DIR_NOTE =
	"`<skill-dir>` in a command below is the folder that holds this SKILL.md.";

function noteSkillDir(text: string): string {
	if (!text.includes("<skill-dir>") || text.includes(SKILL_DIR_NOTE))
		return text;
	const lines = text.split("\n");
	const heading = lines.findIndex((line) => /^# /.test(line));
	if (heading === -1) return `${SKILL_DIR_NOTE}\n\n${text}`;
	return [
		...lines.slice(0, heading + 1),
		"",
		SKILL_DIR_NOTE,
		...lines.slice(heading + 1),
	].join("\n");
}

export function toFlat(text: string, context: FlatContext): string {
	const cli = text.replaceAll(CLI_FALLBACK, context.cli ?? PLUGIN_CLI);
	return noteSkillDir(
		protect(cli, SKILL_PATH, (masked) =>
			flattenNames(
				rewriteSiblings(
					rewriteSkillDir(
						applyPhrases(
							applyPhrases(masked, SKILL_TOOL_PHRASES),
							ARGUMENT_PHRASES,
						),
					),
					context,
				),
			),
		),
	);
}

export function toCodex(text: string): string {
	return protect(text, SKILL_PATH, (masked) =>
		applyPhrases(masked, SKILL_TOOL_PHRASES).replace(
			NAMESPACED,
			(_, slash: string | undefined, name: string) =>
				`${slash === undefined ? "" : "$"}astack:${name}`,
		),
	);
}
