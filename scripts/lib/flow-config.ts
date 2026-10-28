import { detectTicketKind } from "../../src/astack/headings.ts";
import type {
	CategoryLabels,
	DomainConfig,
	OtherClaim,
	ProjectConfig,
	TrackerConfig,
} from "./projects.ts";

export const agentDocPaths = {
	tracker: "docs/agents/issue-tracker.md",
	labels: "docs/agents/triage-labels.md",
	domain: "docs/agents/domain.md",
} as const;

export const agentSkillsRuleName = "agent-skills.md";

export const triageRoles = [
	"needs-triage",
	"needs-info",
	"ready-for-agent",
	"ready-for-human",
	"wontfix",
] as const;

export const wayfinderLabels = [
	"wayfinder:map",
	"wayfinder:research",
	"wayfinder:prototype",
	"wayfinder:grilling",
	"wayfinder:task",
] as const;

export type FlowArtifact = {
	path: string;
	kind: "flow-config";
	content: string;
};

const roleMeanings: Record<(typeof triageRoles)[number], string> = {
	"needs-triage": "A maintainer needs to evaluate it",
	"needs-info": "Waiting on the reporter",
	"ready-for-agent": "Fully specified, ready for an AFK agent",
	"ready-for-human": "Needs a human to implement it",
	wontfix: "Will not be actioned",
};

function lines(...parts: readonly (string | readonly string[])[]): string {
	return `${parts.flat().join("\n")}\n`;
}

function prSection(key: string, requirePartOf: boolean): readonly string[] {
	const naming = requirePartOf
		? `A PR names its ticket on the first line of its body as \`Part of ${key}\`. The astack hook refuses a PR body without that line.`
		: `When a PR serves a ticket, name it on the first line of its body as \`Part of ${key}\`.`;
	return [
		"## Pull requests",
		"",
		`PRs are not a triage surface. ${naming} One line can name more than one ticket, separated by commas. Never put a ticket key or an issue number after a closing word such as \`Closes\`, \`Fixes\` or \`Resolves\`. The astack hook refuses that, because the tracker closes the ticket when the PR merges.`,
	];
}

function linearTracker(
	tracker: Extract<TrackerConfig, { kind: "linear" }>,
): string {
	const { team } = tracker;
	return lines(
		"# Issue tracker: Linear",
		"",
		`Issues and specs live in Linear team ${team}. Use the Linear MCP tools. The tool names below are bare, so any Linear MCP server matches. The update fields of \`save_issue\` are not the same on each server. Where a line below names its schema, examine that schema first. Pull requests live on GitHub.`,
		"",
		"## Conventions",
		"",
		`- Create an issue: \`save_issue\` without \`id\`, with \`team: "${team}"\`, a \`title\`, and a \`description\` in astack's ticket headings (see \`astack:write-ticket\`). Add \`project\`, \`labels\`, \`parentId\` and \`blockedBy\` as they apply. The astack hook refuses a new issue that lacks the headings.`,
		"- Read an issue: `get_issue` with `includeRelations: true`, then `list_comments`.",
		`- List issues: \`list_issues\` with \`team: "${team}"\` and \`project\`, \`label\`, \`state\`, \`parentId\` or \`assignee\` filters.`,
		"- Make a sub-issue: `parentId` on create, or `save_issue` with `id` and `parentId`.",
		"- Comment: `save_comment`.",
		"- Apply or remove labels: when the `save_issue` schema lists `addLabels` and `removeLabels`, send `id` with them. Otherwise read the current labels with `get_issue`. Then send `id` and the full new list as `labels`.",
		'- Close: `save_comment` with the reason, then `save_issue` with `id` and `state: "completed"`, or `state: "canceled"` for a rejection. Both are Linear state types, so they match any team\'s state names.',
		"- Blocking: `blockedBy` and `blocks` on `save_issue`. These are native relations.",
		"",
		...prSection(`${team}-123`, tracker.requirePartOf),
		"",
		'## When a skill says "publish to the issue tracker"',
		"",
		`Create a Linear issue in team ${team} as above.`,
		"",
		'## When a skill says "fetch the relevant ticket"',
		"",
		`Read it as in "Read an issue". Accept a key such as \`${team}-123\` or a Linear URL.`,
		"",
		"## Wayfinding operations",
		"",
		"- Map: one issue labelled `wayfinder:map`, in the wayfinder map template.",
		"- Child ticket: an issue with `parentId` set to the map and one `wayfinder:<type>` label. Once claimed, the ticket is assigned to the driving developer.",
		"- Blocking: `blockedBy`. A ticket is unblocked when every blocker is in a completed or canceled state.",
		"- Frontier query: `list_issues` with `parentId` set to the map and `assignee: null`. Keep the open ones, then drop any whose `get_issue` relations show an open blocker. First in map order wins.",
		'- Claim: `save_issue` with `id` and `assignee: "me"`, as the session\'s first write.',
		"- Resolve: `save_comment` with the answer, then `save_issue` with `id` and `state: \"completed\"`. Then add the decision line at the end of Decisions so far on the map. When the `save_issue` schema lists `patch`, send the map's `id` and a `patch` with one `insert_before` operation. Its anchor is the `## Not yet specified` heading. Otherwise read the map's description with `get_issue`. Put the line before that heading. Send the full text as `description`.",
	);
}

function githubTracker(
	tracker: Extract<TrackerConfig, { kind: "github" }>,
): string {
	const skipped = labelPhrase(tracker.frontierSkipLabels ?? []);
	return lines(
		"# Issue tracker: GitHub",
		"",
		"Issues and specs live as GitHub issues in this repo. Use the `gh` CLI, which infers the repo from `git remote -v` inside a clone.",
		"",
		"## Conventions",
		"",
		"- Create an issue: `gh issue create --title <title> --body-file <file>`. The body needs astack's ticket headings (see `astack:write-ticket`), or the headings of a template in `.github/ISSUE_TEMPLATE/` when one fits. The astack hook checks them.",
		"- Read an issue: `gh issue view <number> --json number,title,body,labels,comments,parent,blockedBy`.",
		"- List issues: `gh issue list --state open --json number,title,labels,assignees` with `--label` and `--state` filters.",
		"- Make a sub-issue: `gh issue create --parent <parent>`, or `gh issue edit <child> --parent <parent>` afterwards.",
		"- Comment: `gh issue comment <number> --body-file <file>`.",
		"- Apply or remove labels: `gh issue edit <number> --add-label <label>` or `--remove-label <label>`.",
		"- Close: `gh issue close <number> --comment <reason>`.",
		"- Blocking: `gh issue create --blocked-by <numbers>`, or `gh issue edit <number> --add-blocked-by <numbers>`. These are native issue dependencies.",
		"",
		...prSection("#123", tracker.requirePartOf),
		"",
		'## When a skill says "publish to the issue tracker"',
		"",
		"Create a GitHub issue as above.",
		"",
		'## When a skill says "fetch the relevant ticket"',
		"",
		'Read it as in "Read an issue". Accept `#123` or an issue URL.',
		"",
		"## Wayfinding operations",
		"",
		"- Map: one issue labelled `wayfinder:map`, in the wayfinder map template.",
		"- Child ticket: a sub-issue of the map with one `wayfinder:<type>` label. Once claimed, the ticket is assigned to the driving developer.",
		"- Blocking: native dependencies, as above. A ticket is unblocked when every issue in its `blockedBy` is closed.",
		`- Frontier query: \`gh issue view <map> --json subIssues\`, keep the open children, then drop any with an assignee${
			skipped === undefined
				? " or an open issue in `blockedBy`"
				: `, an open issue in \`blockedBy\`, or ${skipped}`
		}. First in map order wins.`,
		`- Claim: \`gh issue edit <number> --add-assignee @me\`, as the session's first write.${
			tracker.researchClaimComment === undefined
				? ""
				: ` On a \`wayfinder:research\` ticket, then post the comment \`${tracker.researchClaimComment}\` with \`gh issue comment <number>\`.`
		}`,
		"- Resolve: `gh issue comment <number>` with the answer, `gh issue close <number>`, then add a one-line pointer to the map's Decisions so far.",
		...otherClaimsSection(tracker.otherClaims ?? [], skipped),
	);
}

function labelPhrase(labels: readonly string[]): string | undefined {
	if (labels.length === 0) return undefined;
	const named = labels.map((label) => `\`${label}\``);
	const last = named.pop();
	return `the ${named.length === 0 ? last : `${named.join(", ")} or ${last}`} label`;
}

function otherClaimsSection(
	claims: readonly OtherClaim[],
	skipped: string | undefined,
): readonly string[] {
	if (claims.length === 0 && skipped === undefined) return [];
	return [
		"",
		"## Claim other work",
		"",
		`The frontier query reads only the children of the map${
			skipped === undefined ? "" : `, and it skips a child with ${skipped}`
		}. Claim each other kind of work as its line says.`,
		...(claims.length === 0 ? [] : [""]),
		...claims.map(({ work, claim }) => `- ${work}: ${claim}`),
	];
}

function localTracker(
	tracker: Extract<TrackerConfig, { kind: "none" }>,
): string {
	const dir = tracker.dir;
	return lines(
		"# Issue tracker: local Markdown",
		"",
		`This repo has no issue tracker. Issues and specs live as Markdown files under \`${dir}/\`, committed on the feature branch. Delete a feature's directory when it ships.`,
		"",
		"## Conventions",
		"",
		`- One feature per directory: \`${dir}/<feature-slug>/\`.`,
		`- The spec is \`${dir}/<feature-slug>/spec.md\`, in astack's ticket headings (see \`astack:write-ticket\`).`,
		`- One file per ticket at \`${dir}/<feature-slug>/issues/<NN>-<slug>.md\`, numbered from \`01\`, in the same headings.`,
		"- A `Status:` line near the top of each issue file holds its triage role. See `triage-labels.md`.",
		"- Comments append to the bottom of the file under a `## Comments` heading.",
		"",
		'## When a skill says "publish to the issue tracker"',
		"",
		`Create a file under \`${dir}/<feature-slug>/\`, and the directory when it is missing.`,
		"",
		'## When a skill says "fetch the relevant ticket"',
		"",
		"Read the file at the path or number the user gives.",
		"",
		"## Wayfinding operations",
		"",
		`- Map: \`${dir}/<effort>/map.md\`, in the wayfinder map template.`,
		`- Child ticket: \`${dir}/<effort>/issues/<NN>-<slug>.md\`, with a \`Type:\` line (\`research\`, \`prototype\`, \`grilling\` or \`task\`) and a \`Status:\` line (\`claimed\` or \`resolved\`).`,
		"- Blocking: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.",
		"- Frontier query: the open, unblocked, unclaimed files in `issues/`. The lowest number wins.",
		"- Claim: set `Status: claimed` and save before any other work.",
		"- Resolve: append the answer under `## Answer`, set `Status: resolved`, then add a one-line pointer to the map's Decisions so far.",
	);
}

export function renderIssueTracker(tracker: TrackerConfig): string {
	if (tracker.kind === "linear") return linearTracker(tracker);
	if (tracker.kind === "github") return githubTracker(tracker);
	return localTracker(tracker);
}

function roleTarget(
	tracker: TrackerConfig,
	role: (typeof triageRoles)[number],
): string {
	if (tracker.kind === "none") return `\`Status: ${role}\``;
	if (tracker.kind === "linear") {
		if (role === "wontfix") return "The team's canceled state";
		if (role === "needs-triage" && tracker.triageState !== undefined) {
			return `The \`${tracker.triageState}\` state`;
		}
	}
	return `The \`${role}\` label`;
}

export function renderTriageLabels(tracker: TrackerConfig): string {
	const where =
		tracker.kind === "linear"
			? `In Linear team ${tracker.team}`
			: tracker.kind === "github"
				? "In GitHub"
				: "In the issue file";
	const categories =
		tracker.kind === "none"
			? [
					"Category roles are a `Category:` line with `bug` or `enhancement`. A bug uses astack's bug headings.",
				]
			: [categoryLine(tracker.categoryLabels)];
	return lines(
		"# Triage labels",
		"",
		"The skills speak in five canonical triage roles. This table maps each role to what this repo's tracker uses.",
		"",
		`| Role | ${where} | Meaning |`,
		"|---|---|---|",
		...triageRoles.map(
			(role) =>
				`| \`${role}\` | ${roleTarget(tracker, role)} | ${roleMeanings[role]} |`,
		),
		"",
		"When a skill names a role, use the matching row of this table.",
		"",
		...categories,
	);
}

function categoryLine({ bug, enhancement, bugAlso }: CategoryLabels): string {
	const also = labelPhrase(bugAlso ?? []);
	const roles = `Category roles map to existing labels: \`bug\` is the \`${bug}\` label and \`enhancement\` is the \`${enhancement}\` label.${
		also === undefined ? "" : ` A bug also carries ${also}.`
	}`;
	return detectTicketKind({ labels: [bug], body: "" }) === "bug"
		? `${roles} The astack hook files an issue whose label contains the word "bug" with the bug headings.`
		: `${roles} The \`${bug}\` label does not contain the word "bug". So the astack hook takes an issue with that label as a bug only from its headings or its title. Give a bug the \`Steps to reproduce\` heading.`;
}

export function renderDomain(domain: DomainConfig): string {
	const renamed = domain.glossary !== "CONTEXT.md";
	const mapRenamed =
		domain.contextMap !== undefined && domain.contextMap !== "CONTEXT-MAP.md";
	return lines(
		"# Domain docs",
		"",
		"How the engineering skills read this repo's domain documentation.",
		"",
		"## Before exploring, read these",
		"",
		`- \`${domain.glossary}\`, the glossary.`,
		...(domain.contextMap === undefined
			? []
			: [`- \`${domain.contextMap}\`, the context map.`]),
		...(domain.readFirst ?? []).map((path) => `- \`${path}\`.`),
		`- The ADRs in \`${domain.adrDir}/\` that touch the area you are about to work in.`,
		"",
		...(renamed
			? [
					`Where a skill names \`CONTEXT.md\` or \`GLOSSARY.md\`, it means \`${domain.glossary}\`.`,
					"",
				]
			: []),
		...(mapRenamed
			? [
					`Where a skill names \`CONTEXT-MAP.md\` or \`GLOSSARY-MAP.md\`, it means \`${domain.contextMap}\`.`,
					"",
				]
			: []),
		"If one of these files is missing, name it in your output. Do not work as if you read it.",
		"",
		"## Use the glossary's vocabulary",
		"",
		"Use the glossary's term when your output names a domain concept. This applies to an issue title, a refactor proposal, a hypothesis and a test name. Do not drift to a synonym the glossary avoids.",
		"",
		"A concept that is missing from the glossary means you are inventing language the project does not use, or there is a real gap. Note the gap for `astack:domain-modeling`.",
		"",
		"## Flag ADR conflicts",
		"",
		"When your output contradicts an existing ADR, name the ADR and say why it is worth reopening. Never override it silently.",
		"",
		`New ADRs follow the format of the ADRs already in \`${domain.adrDir}/\`.`,
	);
}

function trackerSummary(tracker: TrackerConfig): string {
	if (tracker.kind === "linear") return `Linear team ${tracker.team}`;
	if (tracker.kind === "github") return "GitHub issues in this repo";
	return `no tracker, so local Markdown under \`${tracker.dir}/\``;
}

function labelSummary(tracker: TrackerConfig): string {
	if (tracker.kind === "none") return "the five roles as `Status:` lines";
	if (tracker.kind === "linear") {
		return "the triage roles as labels, with the canceled state for `wontfix`";
	}
	return "the five triage roles as labels";
}

function domainSummary(domain: DomainConfig): string {
	const extra = [
		...(domain.contextMap === undefined ? [] : [domain.contextMap]),
		...(domain.readFirst ?? []),
	].map((path) => `\`${path}\``);
	const docs = [`\`${domain.glossary}\``, ...extra].join(", ");
	return `${docs} and the ADRs in \`${domain.adrDir}/\``;
}

export function renderAgentSkillsBlock(project: ProjectConfig): string {
	return lines(
		"## Agent skills",
		"",
		`- Issue tracker: ${trackerSummary(project.tracker)}. See \`${agentDocPaths.tracker}\`.`,
		`- Triage labels: ${labelSummary(project.tracker)}. See \`${agentDocPaths.labels}\`.`,
		`- Domain docs: ${domainSummary(project.domain)}. See \`${agentDocPaths.domain}\`.`,
	);
}

export function renderFlowConfig(project: ProjectConfig): FlowArtifact[] {
	return [
		{
			path: agentDocPaths.tracker,
			kind: "flow-config",
			content: renderIssueTracker(project.tracker),
		},
		{
			path: agentDocPaths.labels,
			kind: "flow-config",
			content: renderTriageLabels(project.tracker),
		},
		{
			path: agentDocPaths.domain,
			kind: "flow-config",
			content: renderDomain(project.domain),
		},
		{
			path: `${project.rulesDir}/${agentSkillsRuleName}`,
			kind: "flow-config",
			content: renderAgentSkillsBlock(project),
		},
	];
}

export function domainPaths(
	domain: DomainConfig,
): { path: string; kind: "file" | "directory" }[] {
	return [
		{ path: domain.glossary, kind: "file" },
		...(domain.contextMap === undefined
			? []
			: [{ path: domain.contextMap, kind: "file" as const }]),
		...(domain.readFirst ?? []).map((path) => ({
			path,
			kind: "file" as const,
		})),
		{ path: domain.adrDir, kind: "directory" },
	];
}

export function domainProblems(
	domain: DomainConfig,
	kindOf: (path: string) => string,
): string[] {
	return domainPaths(domain).flatMap(({ path, kind }) => {
		const found = kindOf(path);
		return found === kind
			? []
			: [`domain points at ${path}, which is ${found}, not a ${kind}`];
	});
}

export function wantedLabels(tracker: TrackerConfig): string[] {
	if (tracker.kind === "none") return [];
	const roles = triageRoles.filter(
		(role) =>
			!(
				tracker.kind === "linear" &&
				(role === "wontfix" ||
					(role === "needs-triage" && tracker.triageState !== undefined))
			),
	);
	return [
		...roles,
		...(tracker.kind === "github"
			? [tracker.categoryLabels.bug, tracker.categoryLabels.enhancement]
			: []),
		...wayfinderLabels,
	];
}

export function labelSetup(
	tracker: TrackerConfig,
	existing: readonly string[] | undefined,
): string[] {
	const wanted = wantedLabels(tracker);
	if (wanted.length === 0) {
		return ["No labels: triage roles are `Status:` lines in the issue files."];
	}
	const missing =
		existing === undefined
			? wanted
			: wanted.filter((label) => !existing.includes(label));
	if (missing.length === 0) return ["Every label the skills use exists."];
	if (tracker.kind === "linear") {
		return [
			`Create these labels in Linear team ${tracker.team} with the Linear MCP \`save_issue_label\`, skipping any that exist. It takes the team's id, so look up the team whose key is ${tracker.team} with \`list_teams\` first. If Linear rejects the colon in a \`wayfinder:*\` name, make a label group named wayfinder with the part after the colon as its children. Apply never checks the workspace:`,
			...missing.map((label) => `  ${label}`),
		];
	}
	const checked =
		existing === undefined
			? "The label list could not be read, so every label is listed."
			: "Checked against `gh label list`.";
	return [
		`Create the missing labels from inside the repo. ${checked}`,
		...missing.map((label) => `  $ gh label create '${label}'`),
	];
}
