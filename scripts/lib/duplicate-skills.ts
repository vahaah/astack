export const flowUpstream = "mattpocock/skills";

export const flowSupersedes: Readonly<Record<string, readonly string[]>> = {
	"ask-matt": ["ask-matt"],
	"code-review": ["code-review"],
	"codebase-design": ["codebase-design"],
	"diagnosing-bugs": ["diagnosing-bugs"],
	"domain-modeling": ["domain-modeling"],
	"grill-me": ["grilling", "grill-me"],
	"grill-with-docs": ["grilling", "grill-with-docs"],
	grilling: ["grilling"],
	handoff: ["handoff"],
	implement: ["implement"],
	"implement-spec": ["implement-spec"],
	"improve-codebase-architecture": ["improve-codebase-architecture"],
	prototype: ["prototype"],
	research: ["research"],
	retro: ["retro"],
	"setup-matt-pocock-skills": ["setup", "setup-matt-pocock-skills"],
	tdd: ["tdd"],
	teach: ["teach"],
	"to-questionnaire": ["to-questionnaire"],
	"to-spec": ["to-spec"],
	"to-tickets": ["to-tickets"],
	triage: ["triage"],
	"wait-what": ["wait-what"],
	wayfinder: ["wayfinder"],
	wizard: ["wizard"],
	"writing-for-agents": ["writing-for-agents"],
};

export type UserSkillEntry = {
	name: string;
	path: string;
	kind: "symlink" | "directory" | "file";
	target?: string;
};

export type SkillsTxtLine = { line: number; text: string };

export type DuplicateVerdict = "superseded" | "name-only" | "not-in-flow";

export type DuplicateSkill = UserSkillEntry & {
	source?: string;
	flowSkill: string;
	verdict: DuplicateVerdict;
	skillsTxt: SkillsTxtLine[];
};

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function lockSource(lock: unknown, name: string): string | undefined {
	const skills = isRecord(lock) ? lock.skills : undefined;
	const entry = isRecord(skills) ? skills[name] : undefined;
	const source = isRecord(entry) ? entry.source : undefined;
	return typeof source === "string" ? source : undefined;
}

export function parseSkillsTxt(
	text: string,
): { line: number; text: string; source: string; name: string }[] {
	return text.split("\n").flatMap((raw, index) => {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) return [];
		const space = line.indexOf(" ");
		if (space === -1) return [];
		return [
			{
				line: index + 1,
				text: line,
				source: (line.slice(0, space).split("#")[0] ?? "").trim(),
				name: line.slice(space + 1).trim(),
			},
		];
	});
}

function flowSkillFor(
	candidates: readonly string[],
	flowSkills: readonly string[] | undefined,
): string | undefined {
	if (flowSkills === undefined) return candidates[0];
	return candidates.find((candidate) => flowSkills.includes(candidate));
}

export function findDuplicateSkills(input: {
	entries: readonly UserSkillEntry[];
	lock: unknown;
	skillsTxt?: string;
	flowSkills?: readonly string[];
}): DuplicateSkill[] {
	const txt =
		input.skillsTxt === undefined ? [] : parseSkillsTxt(input.skillsTxt);
	return input.entries.flatMap((entry) => {
		const candidates = flowSupersedes[entry.name];
		if (candidates === undefined) return [];
		const source = lockSource(input.lock, entry.name);
		const flowName = flowSkillFor(candidates, input.flowSkills);
		const verdict: DuplicateVerdict =
			flowName === undefined
				? "not-in-flow"
				: source === flowUpstream
					? "superseded"
					: "name-only";
		return [
			{
				...entry,
				...(source === undefined ? {} : { source }),
				flowSkill: `astack:${flowName ?? candidates[0]}`,
				verdict,
				skillsTxt: txt
					.filter(
						(line) =>
							line.name === entry.name &&
							(source === undefined || line.source === source),
					)
					.map(({ line, text }) => ({ line, text })),
			},
		];
	});
}

function quoted(path: string): string {
	if (/^[\w@%+=:,./~-]+$/.test(path)) return path;
	if (path.startsWith("~/")) return `~/${quoted(path.slice(2))}`;
	return `'${path.replace(/'/g, "'\\''")}'`;
}

export function removalCommands(
	skills: readonly DuplicateSkill[],
	shown: (path: string) => string,
): { everywhere: string[]; claudeOnly: string[] } {
	const managedNames = [
		...new Set(
			skills
				.filter((skill) => skill.source !== undefined)
				.map((skill) => skill.name),
		),
	];
	const unmanaged = skills.filter((skill) => skill.source === undefined);
	const links = skills.filter((skill) => skill.kind === "symlink");
	const everywhere = [
		...(managedNames.length > 0
			? [`npx skills remove --global -y ${managedNames.join(" ")}`]
			: []),
		...unmanaged.map(
			(skill) =>
				`rm ${skill.kind === "directory" ? "-r " : ""}${quoted(shown(skill.path))}`,
		),
	];
	const claudeOnly =
		links.length > 0
			? [`rm ${links.map((skill) => quoted(shown(skill.path))).join(" ")}`]
			: [];
	return { everywhere, claudeOnly };
}

export function duplicateReportLines(input: {
	skills: readonly DuplicateSkill[];
	shown: (path: string) => string;
	skillsTxtPath?: string;
	flowBuilt: boolean;
}): string[] {
	const { skills, shown } = input;
	if (skills.length === 0) {
		return [
			"None found. No flat user skill shares a name with an astack skill.",
		];
	}
	const describe = (skill: DuplicateSkill) => {
		const where =
			skill.kind === "symlink"
				? `${shown(skill.path)} -> ${shown(skill.target ?? "?")}`
				: `${shown(skill.path)} (a ${skill.kind}, not a link)`;
		return `- ${where}, from ${skill.source ?? "an unknown source"}; astack ships /${skill.flowSkill}`;
	};
	const group = (
		verdict: DuplicateVerdict,
		heading: string,
		withCommands: boolean,
	): string[] => {
		const members = skills.filter((skill) => skill.verdict === verdict);
		if (members.length === 0) return [];
		const out = [heading, ...members.map(describe)];
		if (!withCommands) return [...out, ""];
		const commands = removalCommands(members, shown);
		const seenLines = new Set<number>();
		const txtLines = members
			.flatMap((skill) => skill.skillsTxt)
			.filter((line) => {
				if (seenLines.has(line.line)) return false;
				seenLines.add(line.line);
				return true;
			})
			.sort((left, right) => left.line - right.line);
		out.push(
			"To remove them for every agent the skills CLI manages, with their ~/.agents/skills copies and lock entries:",
			...commands.everywhere.map((command) => `  $ ${command}`),
		);
		if (commands.claudeOnly.length > 0) {
			out.push(
				"To remove only the Claude Code links and keep ~/.agents/skills. The lock keeps their entries, so a skills.txt regenerated from the lock lists them again:",
				...commands.claudeOnly.map((command) => `  $ ${command}`),
			);
		}
		if (input.skillsTxtPath !== undefined) {
			out.push(
				txtLines.length > 0
					? `Either way, delete these lines from ${input.skillsTxtPath}, or its bootstrap installs them again:`
					: `${input.skillsTxtPath} lists none of them.`,
				...txtLines.map((line) => `  ${line.line}: ${line.text}`),
			);
		}
		return [...out, ""];
	};
	const lines = [
		"Report only. Apply never removes a user skill.",
		...(input.flowBuilt
			? []
			: [
					"The astack plugin is not built yet, so the names below come from the upstream skill list.",
				]),
		"",
		...group(
			"superseded",
			`Superseded by the astack skill of the same upstream (${flowUpstream}), which Claude Code invokes as /astack:<name>:`,
			true,
		),
		...group(
			"name-only",
			"Same name as an astack skill, from another or an unknown source. astack may not replace what it does, so remove it only if you no longer want it:",
			true,
		),
		...group(
			"not-in-flow",
			"Not in the built astack plugin, so nothing supersedes them yet. Keep them:",
			false,
		),
	];
	while (lines.at(-1) === "") lines.pop();
	return lines;
}
