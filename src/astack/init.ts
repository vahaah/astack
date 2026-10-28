import {
	type CommitStyle,
	commitSubject,
	detectCommitStyle,
} from "./commit-style.ts";
import { formatJson, type Json } from "./json-format.ts";
import {
	MARKETPLACE_NAME,
	MARKETPLACE_REPO,
	PLUGIN_IDS,
} from "./marketplace.ts";
import { err, ok, type Result } from "./result.ts";

export type TrackerChoice =
	| { readonly kind: "linear"; readonly team: string }
	| { readonly kind: "github" }
	| { readonly kind: "none" };

export type SteMode = "deny" | "advise";

export type InitFlags = {
	readonly tracker: TrackerChoice | undefined;
	readonly requirePartOf: boolean;
	readonly ste: SteMode | undefined;
	readonly dryRun: boolean;
	readonly force: boolean;
};

export type RepoFacts = {
	readonly branches: readonly string[];
	readonly subjects: readonly string[];
	readonly remoteUrl: string | undefined;
	readonly defaultBranch: string;
	readonly prTemplate: string | undefined;
	readonly glossary: string | undefined;
	readonly adrDir: string | undefined;
	readonly issueTemplate: string | undefined;
	readonly indent: string;
};

export type TrackerFinding = {
	readonly choice: TrackerChoice;
	readonly evidence: string;
};

export const SETUP_BRANCH = "astack/setup";
export const DEFAULT_ADR_DIR = "docs/adr";

export const GLOSSARY_CANDIDATES: readonly string[] = [
	"CONTEXT.md",
	"GLOSSARY.md",
	"docs/CONTEXT.md",
	"docs/GLOSSARY.md",
	"docs/glossary.md",
];
export const ADR_CANDIDATES: readonly string[] = [
	"docs/adr",
	"docs/adrs",
	"docs/decisions",
	"adr",
];

const NOT_TICKET_KEYS: ReadonlySet<string> = new Set([
	"ADR",
	"BLOCK",
	"CVE",
	"GH",
	"HOTFIX",
	"ISO",
	"ISSUE",
	"PART",
	"PHASE",
	"PR",
	"RC",
	"RELEASE",
	"RFC",
	"ROUND",
	"SESSION",
	"SHA",
	"SPRINT",
	"STAGE",
	"STEP",
	"UTF",
	"V",
	"WAVE",
]);
const BRANCH_KEY = /(?:^|\/)([a-z][a-z0-9]{0,9})-(\d+)(?=[-/_]|$)/i;
const KEY = /\b([A-Z][A-Z0-9]{0,9})-(\d+)\b/g;
const KEY_LIST = "[A-Z][A-Z0-9]{0,9}-\\d+(?:,\\s*[A-Z][A-Z0-9]{0,9}-\\d+)*";
const TICKET_PLACES: readonly RegExp[] = [
	new RegExp(`\\bPart of (${KEY_LIST})`, "g"),
	new RegExp(`[([](${KEY_LIST})[)\\]]`, "g"),
];
const BRANCH_ISSUE = /(?:^|\/)(?:(?:issue|gh)-)?(\d+)(?:-[a-z]|$)/i;
const SUBJECT_ISSUE =
	/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part of|refs?)\s+#\d+/gi;
const GITHUB_REMOTE = /github\.com[:/]/;

type KeyCount = { readonly team: string; readonly count: number };

function bestTeam(
	keys: readonly (readonly [string, string])[],
): KeyCount | undefined {
	const refs = new Map<string, Set<number>>();
	for (const [key, number] of keys) {
		const team = key.toUpperCase();
		if (NOT_TICKET_KEYS.has(team)) continue;
		refs.set(team, (refs.get(team) ?? new Set<number>()).add(Number(number)));
	}
	const [best] = [...refs.entries()]
		.map(([team, numbers]) => ({ team, count: numbers.size }))
		.sort(
			(left, right) =>
				right.count - left.count || left.team.localeCompare(right.team),
		);
	return best !== undefined && best.count >= 2 ? best : undefined;
}

function pairs(text: string, pattern: RegExp): (readonly [string, string])[] {
	return [...text.matchAll(pattern)].flatMap((match) =>
		match[1] !== undefined && match[2] !== undefined
			? [[match[1], match[2]] as const]
			: [],
	);
}

function branchKeys(
	branches: readonly string[],
): (readonly [string, string])[] {
	return branches.flatMap((branch) => {
		const match = BRANCH_KEY.exec(branch);
		return match?.[1] !== undefined && match[2] !== undefined
			? [[match[1], match[2]] as const]
			: [];
	});
}

function subjectKeys(
	subjects: readonly string[],
): (readonly [string, string])[] {
	return subjects.flatMap((subject) =>
		TICKET_PLACES.flatMap((place) =>
			[...subject.matchAll(place)].flatMap((match) =>
				pairs(match[1] ?? "", KEY),
			),
		),
	);
}

function githubRefs(
	branches: readonly string[],
	subjects: readonly string[],
): number {
	return (
		branches.filter((branch) => BRANCH_ISSUE.test(branch)).length +
		subjects.reduce(
			(count, subject) => count + [...subject.matchAll(SUBJECT_ISSUE)].length,
			0,
		)
	);
}

function linearFinding(found: KeyCount, where: string): TrackerFinding {
	return {
		choice: { kind: "linear", team: found.team },
		evidence: `Linear team ${found.team}. ${where} name ${found.count} tickets such as ${found.team}-<n>.`,
	};
}

export function detectTracker(
	facts: Pick<
		RepoFacts,
		"branches" | "subjects" | "remoteUrl" | "issueTemplate"
	>,
): TrackerFinding {
	const fromBranches = bestTeam(branchKeys(facts.branches));
	if (fromBranches !== undefined)
		return linearFinding(fromBranches, "Branch names");
	const fromSubjects = bestTeam(subjectKeys(facts.subjects));
	if (fromSubjects !== undefined)
		return linearFinding(fromSubjects, "Commit subjects");
	if (GITHUB_REMOTE.test(facts.remoteUrl ?? "")) {
		const issues = githubRefs(facts.branches, facts.subjects);
		if (issues >= 2)
			return {
				choice: { kind: "github" },
				evidence: `GitHub issues. Branch names and commit subjects name issues ${issues} times.`,
			};
		if (facts.issueTemplate !== undefined)
			return {
				choice: { kind: "github" },
				evidence: `GitHub issues. The repo has ${facts.issueTemplate}.`,
			};
	}
	return {
		choice: { kind: "none" },
		evidence:
			"none found in branch names and commit subjects. Pass --tracker to set one.",
	};
}

export function parseTrackerFlag(value: string): Result<TrackerChoice, string> {
	if (value === "github") return ok({ kind: "github" });
	if (value === "none") return ok({ kind: "none" });
	const team = /^linear:([A-Za-z][A-Za-z0-9]*)$/.exec(value)?.[1];
	return team === undefined
		? err(
				`--tracker takes linear:<TEAM>, github or none, not "${value}". TEAM is a Linear team key such as ABC.`,
			)
		: ok({ kind: "linear", team: team.toUpperCase() });
}

function trackerJson(choice: TrackerChoice, requirePartOf: boolean): Json {
	switch (choice.kind) {
		case "linear":
			return { kind: "linear", team: choice.team, requirePartOf };
		case "github":
			return { kind: "github", requirePartOf };
		case "none":
			return { kind: "none", requirePartOf: false };
	}
}

export function initProfile(
	facts: RepoFacts,
	tracker: TrackerChoice,
	flags: Pick<InitFlags, "requirePartOf" | "ste">,
): Result<Json, string> {
	if (flags.requirePartOf && tracker.kind === "none")
		return err(
			"--require-part-of needs a tracker. Pass --tracker linear:<TEAM> or --tracker github.",
		);
	return ok({
		tracker: trackerJson(tracker, flags.requirePartOf),
		merge: { authority: "turn" },
		ste: { mode: flags.ste ?? "advise", technicalNouns: [] },
		plan: {
			...(facts.glossary === undefined ? {} : { glossary: facts.glossary }),
			adr: facts.adrDir ?? DEFAULT_ADR_DIR,
		},
	});
}

function trackerLine(
	finding: TrackerFinding,
	fromFlag: TrackerChoice | undefined,
): string {
	if (fromFlag === undefined) return `- Tracker: ${finding.evidence}`;
	switch (fromFlag.kind) {
		case "linear":
			return `- Tracker: Linear team ${fromFlag.team}, from --tracker.`;
		case "github":
			return "- Tracker: GitHub issues, from --tracker.";
		case "none":
			return "- Tracker: none, from --tracker.";
	}
}

export function foundLines(
	facts: RepoFacts,
	finding: TrackerFinding,
	fromFlag: TrackerChoice | undefined,
): readonly string[] {
	return [
		trackerLine(finding, fromFlag),
		`- Default branch: ${facts.defaultBranch}.`,
		facts.prTemplate === undefined
			? "- PR template: none."
			: `- PR template: ${facts.prTemplate}.`,
		facts.glossary === undefined
			? "- Glossary: none. The profile has no plan.glossary."
			: `- Glossary: ${facts.glossary}.`,
		facts.adrDir === undefined
			? `- ADR folder: none. The profile uses ${DEFAULT_ADR_DIR}.`
			: `- ADR folder: ${facts.adrDir}.`,
	];
}

function code(lines: readonly string[]): string[] {
	return ["", ...lines.map((line) => `    ${line}`), ""];
}

function partOfLine(
	tracker: TrackerChoice,
	requirePartOf: boolean,
): readonly string[] {
	if (!requirePartOf) return [];
	switch (tracker.kind) {
		case "linear":
			return [
				`Put "Part of ${tracker.team}-<n>" on the first line of the body.`,
			];
		case "github":
			return ['Put "Part of #<n>" on the first line of the body.'];
		case "none":
			return [];
	}
}

export function settingsWiring(repo: string): readonly string[] {
	return formatJson({
		extraKnownMarketplaces: {
			[MARKETPLACE_NAME]: { source: { source: "github", repo } },
		},
		enabledPlugins: Object.fromEntries(PLUGIN_IDS.map((id) => [id, true])),
	})
		.trimEnd()
		.split("\n");
}

export function initNextSteps(
	facts: RepoFacts,
	tracker: TrackerChoice,
	requirePartOf: boolean,
	style: CommitStyle = detectCommitStyle(facts.subjects),
): readonly string[] {
	const subject = commitSubject(style, ["the astack profile"], false);
	return [
		"## Next steps",
		"",
		"Review the profile. To change a value, edit the file. You can also run astack init again with flags and --force.",
		"",
		"Commit the profile on a new branch. astack init never makes a commit.",
		...code([
			`git switch -c ${SETUP_BRANCH}`,
			"git add .astack/profile.json",
			`git commit -m "${subject}"`,
		]),
		`Push the branch. Then open a pull request against ${facts.defaultBranch}.`,
		facts.prTemplate === undefined
			? "Write the body with the astack:write-docs skill."
			: `Write the body in the template from ${facts.prTemplate}.`,
		...partOfLine(tracker, requirePartOf),
		...code([
			`git push -u origin ${SETUP_BRANCH}`,
			`gh pr create --base ${facts.defaultBranch}`,
		]),
		"Teammates need the published astack marketplace. Each teammate installs it one time for each tool. In Claude Code, run these commands.",
		...code([
			`claude plugin marketplace add ${MARKETPLACE_REPO}`,
			...PLUGIN_IDS.map((id) => `claude plugin install ${id}`),
		]),
		"The README of the marketplace gives the steps for Codex, Cursor and Grok Bot.",
		"",
		"To show the plugins to each teammate who opens this repo in Claude Code, add this block to .claude/settings.json. Use a GitHub source, never a local folder.",
		...code(settingsWiring(MARKETPLACE_REPO)),
		"To add the review loop, run /astack:pr-review-hardening in the repo. When the repo has no review profile, the skill writes a draft of .claude/pr-review-hardening.profile.md for your approval.",
		"",
		"To add the flow config, run /astack:setup in the repo. It writes docs/agents/ and an Agent skills section.",
	];
}

export function initReport(
	facts: RepoFacts,
	finding: TrackerFinding,
	flags: InitFlags,
	profile: Json,
): string {
	return [
		flags.dryRun
			? "astack init --dry-run: it wrote no file."
			: "astack init: wrote .astack/profile.json.",
		"",
		"## Found in the repo",
		"",
		...foundLines(facts, finding, flags.tracker),
		"",
		"## .astack/profile.json",
		...code(formatJson(profile, facts.indent).trimEnd().split("\n")),
		...initNextSteps(
			facts,
			flags.tracker ?? finding.choice,
			flags.requirePartOf,
		),
		"",
	].join("\n");
}
