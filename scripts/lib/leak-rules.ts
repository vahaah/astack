import { basename, isAbsolute, relative } from "node:path";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { type Companion, companionPaths } from "./companion.ts";
import type { FileScan, Finding, TextFile } from "./neutrality.ts";
import type { ProjectConfig } from "./projects.ts";

export const LEAK_RULES = [
	"profile-dir",
	"owner-handle",
	"owner-email",
	"branch-prefix",
	"local-path",
	"session-url",
	"session-id",
	"ticket-key",
	"team-key",
	"private-pr",
	"secret",
	"host-name",
	"companion-path",
] as const;

export type LeakRule = (typeof LEAK_RULES)[number];

type LeakPattern = {
	readonly rule: LeakRule;
	readonly detail: string;
	readonly pattern: RegExp;
};

type Machine = {
	readonly home: string;
	readonly profiles: readonly string[];
	readonly handles: readonly string[];
	readonly emails: readonly string[];
	readonly hosts: readonly string[];
};

const FROZEN_DIR = "upstream/";

export function isFrozen(path: string): boolean {
	return path.startsWith(FROZEN_DIR);
}

const FROZEN_EXEMPT: ReadonlySet<LeakRule> = new Set<LeakRule>([
	"session-url",
	"session-id",
]);

const SECRET_FORMATS: readonly (readonly [string, RegExp])[] = [
	["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
	["aws access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
	["github token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{22,})/g],
	["anthropic api key", /\bsk-ant-[\w-]{20,}/g],
	["openai api key", /\bsk-proj-[\w-]{20,}/g],
	["slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
	["stripe live key", /\b[rs]k_live_[A-Za-z0-9]{20,}/g],
	["google api key", /\bAIza[\w-]{35}/g],
];

const SESSION_KEYS = ["session_id", "prompt_id", "transcript_path"];

const FORMAT_PATTERNS: readonly LeakPattern[] = [
	{
		rule: "local-path",
		detail: "claude temp dir",
		pattern: /(?:\/private)?\/tmp\/claude-\d+(?!\w)/g,
	},
	{
		rule: "session-url",
		detail: "agent session",
		pattern:
			/\b(?:claude\.ai\/(?:code\/session_|chat\/|share\/)|chatgpt\.com\/(?:c\/|share\/|codex\/tasks\/)|cursor\.com\/agents\?id=)[\w-]+/g,
	},
	...SESSION_KEYS.map(
		(key): LeakPattern => ({
			rule: "session-id",
			detail: key,
			pattern: new RegExp(
				`\\b${key}"?\\s*[:=]\\s*"[^"\\n]*?(?<![0-9a-f])(?!0{8}-)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`,
				"gi",
			),
		}),
	),
	...SECRET_FORMATS.map(
		([detail, pattern]): LeakPattern => ({ rule: "secret", detail, pattern }),
	),
];

function escaped(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function word(rule: LeakRule, detail: string, value: string): LeakPattern {
	return {
		rule,
		detail,
		pattern: new RegExp(`(?<![\\w-])${escaped(value)}(?![\\w-])`, "gi"),
	};
}

const keyedProfile = /^\.\w+-[\w.-]+$/;

function machinePatterns(machine: Machine): LeakPattern[] {
	const user = basename(machine.home);
	const homes = new Set([
		machine.home,
		`/Users/${user}`,
		`/home/${user}`,
		`-Users-${user}`,
		`-home-${user}`,
	]);
	return [
		...machine.profiles.flatMap((profile, index) =>
			keyedProfile.test(basename(profile))
				? [
						word(
							"profile-dir",
							`machine.json profiles[${index}]`,
							basename(profile),
						),
					]
				: [],
		),
		...machine.handles.map((handle, index) =>
			word("owner-handle", `machine.json handles[${index}]`, handle),
		),
		...machine.emails.map((email, index) =>
			word("owner-email", `machine.json emails[${index}]`, email),
		),
		...[...homes].map(
			(home): LeakPattern => ({
				rule: "local-path",
				detail: "machine.json home",
				pattern: new RegExp(`${escaped(home)}(?!\\w)`, "g"),
			}),
		),
		...machine.hosts.map((host, index) =>
			word("host-name", `machine.json hosts[${index}]`, host),
		),
	];
}

const branchPrefix = /^[^/{}]+\//;

function projectPatterns(project: ProjectConfig, index: number): LeakPattern[] {
	const at = `projects[${index}]`;
	const patterns: LeakPattern[] = [
		{
			rule: "private-pr",
			detail: `${at} path`,
			pattern: new RegExp(
				`(?<![\\w.-])${escaped(basename(project.path))}/pulls?/\\d+`,
				"gi",
			),
		},
	];
	const prefix = branchPrefix.exec(project.branchTemplate ?? "")?.[0];
	if (prefix !== undefined)
		patterns.push({
			rule: "branch-prefix",
			detail: `${at} branchTemplate`,
			pattern: new RegExp(`(?<![\\w./-])${escaped(prefix)}(?=[\\w{])`, "g"),
		});
	if (project.tracker.kind === "linear") {
		const team = escaped(project.tracker.team);
		patterns.push(
			{
				rule: "ticket-key",
				detail: `${at} tracker.team`,
				pattern: new RegExp(`\\b${team}-\\d+\\b`, "g"),
			},
			{
				rule: "team-key",
				detail: `${at} tracker.team`,
				pattern: new RegExp(`\\b${team}\\b(?!-\\d)`, "g"),
			},
		);
	}
	return patterns;
}

function companionPatterns(root: string, home: string): LeakPattern[] {
	const inside = relative(home, root);
	const forms =
		inside === "" || inside.startsWith("..") || isAbsolute(inside)
			? [root]
			: [root, `~/${inside}`, `$HOME/${inside}`, `\${HOME}/${inside}`];
	return forms.map((form) => ({
		rule: "companion-path",
		detail: "companion root",
		pattern: new RegExp(`${escaped(form)}(?![\\w-])`, "g"),
	}));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const strings = value.filter(
		(item): item is string => typeof item === "string" && item !== "",
	);
	return strings.length === value.length ? strings : undefined;
}

function parseMachine(value: unknown, path: string): Result<Machine, string> {
	if (!isRecord(value)) return err(`${path} is not a JSON object`);
	const home = value.home;
	if (typeof home !== "string" || !isAbsolute(home))
		return err(`${path}: home must be an absolute path`);
	const profiles = stringList(value.profiles);
	const handles = stringList(value.handles);
	const emails = stringList(value.emails);
	const hosts = stringList(value.hosts);
	if (profiles === undefined)
		return err(`${path}: profiles must be a list of strings`);
	if (handles === undefined)
		return err(`${path}: handles must be a list of strings`);
	if (emails === undefined)
		return err(`${path}: emails must be a list of strings`);
	if (hosts === undefined)
		return err(`${path}: hosts must be a list of strings`);
	return ok({ home, profiles, handles, emails, hosts });
}

const creditFile = /^(?:LICENSE|NOTICE)(?:\.(?:md|txt))?$/;
const manifestFile = /^(?:plugin|marketplace|package)\.json$/;
const authorField = /^\s*"author"\s*:\s*"[^"]*",?\s*$/;
const nameField = /^\s*"name"\s*:\s*"[^"]*",?\s*$/;
const authorObject = /^\s*"(?:author|owner)"\s*:\s*\{\s*$/;
const publicRepo = /^\/astack(?![\w-])/;

function isPublicHandleForm(
	path: string,
	line: string,
	previous: string,
	after: string,
): boolean {
	if (publicRepo.test(after)) return true;
	const name = basename(path);
	if (creditFile.test(name)) return true;
	return (
		manifestFile.test(name) &&
		(authorField.test(line) ||
			(nameField.test(line) && authorObject.test(previous)))
	);
}

function leaksIn(
	path: string,
	line: string,
	previous: string,
	{ rule, pattern }: LeakPattern,
): boolean {
	return [...line.matchAll(pattern)].some(
		(match) =>
			rule !== "owner-handle" ||
			!isPublicHandleForm(
				path,
				line,
				previous,
				line.slice(match.index + match[0].length),
			),
	);
}

function scanLeaks(
	file: TextFile,
	patterns: readonly LeakPattern[],
): Finding[] {
	const active = isFrozen(file.path)
		? patterns.filter(({ rule }) => !FROZEN_EXEMPT.has(rule))
		: patterns;
	const findings: Finding[] = active
		.filter((pattern) => leaksIn(file.path, file.path, "", pattern))
		.map(({ rule, detail }) => ({ file: file.path, rule, detail }));
	const lines = file.content.split("\n");
	lines.forEach((line, index) => {
		for (const pattern of active) {
			if (leaksIn(file.path, line, lines[index - 1] ?? "", pattern))
				findings.push({
					file: file.path,
					line: index + 1,
					rule: pattern.rule,
					detail: pattern.detail,
				});
		}
	});
	return findings;
}

export async function readLeakScan(
	companion: Companion,
	projects: readonly ProjectConfig[],
): Promise<Result<FileScan, string>> {
	if (companion.source === "example")
		return ok((file) => scanLeaks(file, FORMAT_PATTERNS));
	const path = companionPaths(companion).machine;
	const file = Bun.file(path);
	if (!(await file.exists()))
		return err(
			`${path} does not exist. Write the home dir, the profile dirs, the handles, the emails and the hosts of the owner in it.`,
		);
	const machine = parseMachine(await file.json(), path);
	if (!machine.ok) return machine;
	const patterns = [
		...FORMAT_PATTERNS,
		...machinePatterns(machine.value),
		...projects.flatMap(projectPatterns),
		...companionPatterns(companion.root, machine.value.home),
	];
	return ok((scanned) => scanLeaks(scanned, patterns));
}
