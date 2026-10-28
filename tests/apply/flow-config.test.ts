import { describe, expect, test } from "bun:test";
import {
	companionPaths,
	exampleCompanionRoot,
} from "../../scripts/lib/companion.ts";
import {
	agentDocPaths,
	domainProblems,
	labelSetup,
	renderAgentSkillsBlock,
	renderDomain,
	renderFlowConfig,
	renderIssueTracker,
	renderTriageLabels,
	wantedLabels,
} from "../../scripts/lib/flow-config.ts";
import {
	type DomainConfig,
	loadAllProjects,
	type ProjectConfig,
	type TrackerConfig,
} from "../../scripts/lib/projects.ts";

const linear: TrackerConfig = {
	kind: "linear",
	team: "ABC",
	requirePartOf: true,
	categoryLabels: { bug: "Bug", enhancement: "Feature" },
};

const github: TrackerConfig = {
	kind: "github",
	requirePartOf: false,
	categoryLabels: { bug: "bug", enhancement: "enhancement" },
};

const githubWithClaims: TrackerConfig = {
	kind: "github",
	requirePartOf: true,
	categoryLabels: { bug: "defect", enhancement: "enhancement" },
	researchClaimComment: "AFK research started",
	otherClaims: [
		{
			work: "A session issue `B<nn>/S<n>`",
			claim:
				"Run `bun run session start B<nn>/S<n>` as the session's first write.",
		},
		{
			work: "A decision issue",
			claim: "The board claims it. Never assign it to yourself.",
		},
	],
};

const local: TrackerConfig = { kind: "none", dir: ".scratch" };

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
	return {
		name: "acme",
		path: "~/Projects/acme",
		mode: "write",
		rulesDir: ".claude/rules/standards",
		artifacts: {
			rules: true,
			settings: true,
			reviewStub: true,
			agentDocs: true,
			profile: true,
		},
		tracker: linear,
		domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
		keepPatterns: [],
		lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
		gates: [],
		ciOnlyGates: [],
		commentConflicts: [],
		adrNeeded: [],
		...overrides,
	};
}

describe("renderFlowConfig", () => {
	test("writes the three agent docs and an unscoped rule in the neutral rules dir", () => {
		const artifacts = renderFlowConfig(project());
		expect(artifacts.map((artifact) => artifact.path)).toEqual([
			"docs/agents/issue-tracker.md",
			"docs/agents/triage-labels.md",
			"docs/agents/domain.md",
			".claude/rules/standards/agent-skills.md",
		]);
		const rule = artifacts.at(-1)?.content ?? "";
		expect(rule.startsWith("## Agent skills\n")).toBe(true);
		expect(rule).not.toContain("paths:");
		for (const path of Object.values(agentDocPaths)) {
			expect(rule).toContain(`\`${path}\``);
		}
	});

	test("every file ends with one newline and names no project", () => {
		for (const tracker of [linear, github, githubWithClaims, local]) {
			for (const artifact of renderFlowConfig(project({ tracker }))) {
				expect(artifact.content.endsWith("\n")).toBe(true);
				expect(artifact.content.endsWith("\n\n")).toBe(false);
				expect(artifact.content).not.toContain("acme");
			}
		}
	});
});

describe("renderIssueTracker", () => {
	test("puts the Linear team key into create, list and ticket references", () => {
		const doc = renderIssueTracker(linear);
		expect(doc).toContain("# Issue tracker: Linear");
		expect(doc).toContain('`team: "ABC"`');
		expect(doc).toContain("`ABC-123`");
		expect(doc).toContain('`state: "completed"`');
		expect(doc).toContain("`astack:write-ticket`");
		expect(doc).toContain("`insert_before`");
	});

	test("uses addLabels and removeLabels only when the save_issue schema lists them, else the full labels list", () => {
		expect(renderIssueTracker(linear)).toContain(
			"- Apply or remove labels: when the `save_issue` schema lists `addLabels` and `removeLabels`, send `id` with them. Otherwise read the current labels with `get_issue`. Then send `id` and the full new list as `labels`.",
		);
	});

	test("adds a map decision with patch only when the save_issue schema lists it, else with the full description", () => {
		expect(renderIssueTracker(linear)).toContain(
			"When the `save_issue` schema lists `patch`, send the map's `id` and a `patch` with one `insert_before` operation. Its anchor is the `## Not yet specified` heading. Otherwise read the map's description with `get_issue`. Put the line before that heading. Send the full text as `description`.",
		);
	});

	test("requires the Part of line only when the repo sets requirePartOf", () => {
		const strict = renderIssueTracker(linear);
		expect(strict).toContain(
			"A PR names its ticket on the first line of its body as `Part of ABC-123`.",
		);
		expect(strict).toContain("refuses a PR body without that line");
		const loose = renderIssueTracker({ ...linear, requirePartOf: false });
		expect(loose).toContain("When a PR serves a ticket, name it");
		expect(loose).not.toContain("refuses a PR body without that line");
		for (const doc of [strict, loose]) {
			expect(doc).toContain(
				"Never put a ticket key or an issue number after a closing word",
			);
			expect(doc).not.toContain("`Closes ABC-123`");
		}
	});

	test("uses native gh sub-issues and dependencies for GitHub", () => {
		const doc = renderIssueTracker(github);
		expect(doc).toContain("--parent <parent>");
		expect(doc).toContain("--add-blocked-by");
		expect(doc).toContain(".github/ISSUE_TEMPLATE/");
		expect(doc).toContain("as `Part of #123`");
		expect(doc).toContain("When a PR serves a ticket");
	});

	test("a GitHub tracker keeps the assignee claim that the frontier query reads, and puts each other claim on a line of its own", () => {
		const doc = renderIssueTracker(githubWithClaims);
		const claimLine =
			"- Claim: `gh issue edit <number> --add-assignee @me`, as the session's first write.";
		expect(doc).toContain(
			`${claimLine} On a \`wayfinder:research\` ticket, then post the comment \`AFK research started\` with \`gh issue comment <number>\`.\n`,
		);
		expect(doc).toContain(
			"drop any with an assignee or an open issue in `blockedBy`",
		);
		expect(doc.slice(doc.indexOf("\n## Claim other work\n"))).toBe(
			[
				"",
				"## Claim other work",
				"",
				"The frontier query reads only the children of the map. Claim each other kind of work as its line says.",
				"",
				"- A session issue `B<nn>/S<n>`: Run `bun run session start B<nn>/S<n>` as the session's first write.",
				"- A decision issue: The board claims it. Never assign it to yourself.",
				"",
			].join("\n"),
		);
		const plain = renderIssueTracker(github);
		expect(plain).toContain(`${claimLine}\n`);
		expect(plain).not.toContain("## Claim other work");
		expect(plain).not.toContain("wayfinder:research` ticket");
	});

	test("a GitHub tracker drops each child with a skipped label from the frontier, and names that label before the other claims", () => {
		const doc = renderIssueTracker({
			...githubWithClaims,
			frontierSkipLabels: ["decision", "portal-only"],
		});
		expect(doc).toContain(
			"- Frontier query: `gh issue view <map> --json subIssues`, keep the open children, then drop any with an assignee, an open issue in `blockedBy`, or the `decision` or `portal-only` label. First in map order wins.\n",
		);
		expect(doc).toContain(
			"The frontier query reads only the children of the map, and it skips a child with the `decision` or `portal-only` label. Claim each other kind of work as its line says.\n",
		);
		expect(renderIssueTracker(githubWithClaims)).toContain(
			"drop any with an assignee or an open issue in `blockedBy`. First in map order wins.\n",
		);
	});

	test("keeps local tickets under the configured dir", () => {
		const doc = renderIssueTracker({ kind: "none", dir: "work/tickets" });
		expect(doc).toContain("`work/tickets/<feature-slug>/`");
		expect(doc).toContain("`work/tickets/<effort>/map.md`");
		expect(doc).not.toContain(".scratch");
	});
});

describe("renderTriageLabels", () => {
	test("maps wontfix to the canceled state and the rest to labels in Linear", () => {
		const doc = renderTriageLabels(linear);
		expect(doc).toContain("| `wontfix` | The team's canceled state |");
		expect(doc).toContain("| `needs-triage` | The `needs-triage` label |");
		expect(doc).toContain("the `Bug` label");
		expect(doc).toContain(
			"When a skill names a role, use the matching row of this table.",
		);
	});

	test("a bug label without the word bug says that the hook takes such a bug from its headings or its title", () => {
		const doc = renderTriageLabels(githubWithClaims);
		expect(doc).toContain(
			'Category roles map to existing labels: `bug` is the `defect` label and `enhancement` is the `enhancement` label. The `defect` label does not contain the word "bug". So the astack hook takes an issue with that label as a bug only from its headings or its title. Give a bug the `Steps to reproduce` heading.\n',
		);
		expect(renderTriageLabels(github)).toContain(
			'The astack hook files an issue whose label contains the word "bug" with the bug headings.\n',
		);
		expect(wantedLabels(githubWithClaims)).toContain("defect");
	});

	test("a bug that carries more labels names them after the category roles", () => {
		const doc = renderTriageLabels({
			...githubWithClaims,
			categoryLabels: {
				bug: "defect",
				enhancement: "enhancement",
				bugAlso: ["block:B<nn>"],
			},
		});
		expect(doc).toContain(
			"Category roles map to existing labels: `bug` is the `defect` label and `enhancement` is the `enhancement` label. A bug also carries the `block:B<nn>` label. The `defect` label",
		);
		expect(renderTriageLabels(githubWithClaims)).not.toContain(
			"A bug also carries",
		);
	});

	test("maps needs-triage to a Linear triage state when the team has one", () => {
		expect(renderTriageLabels({ ...linear, triageState: "Triage" })).toContain(
			"| `needs-triage` | The `Triage` state |",
		);
	});

	test("uses Status lines for a repo without a tracker", () => {
		const doc = renderTriageLabels(local);
		expect(doc).toContain("`Status: ready-for-agent`");
		expect(doc).not.toContain("label |");
	});
});

function skillNames(doc: string): Record<string, string> {
	return Object.fromEntries(
		[
			...doc.matchAll(
				/^Where a skill names `([^`]+)` or `([^`]+)`, it means `([^`]+)`\.$/gm,
			),
		].flatMap(([, first = "", second = "", target = ""]) => [
			[first, target],
			[second, target],
		]),
	);
}

const projects = await loadAllProjects(
	companionPaths({ source: "example", root: exampleCompanionRoot }).projects,
);

const CONTEXT_MAP = /(?:^|\/)(?:context|glossary)[-_]map\.md$/i;

function wantedSkillNames(domain: DomainConfig): Record<string, string> {
	const map = [domain.contextMap, ...(domain.readFirst ?? [])].find(
		(path) => path !== undefined && CONTEXT_MAP.test(path),
	);
	return {
		...(domain.glossary === "CONTEXT.md"
			? {}
			: { "CONTEXT.md": domain.glossary, "GLOSSARY.md": domain.glossary }),
		...(map === undefined || map === "CONTEXT-MAP.md"
			? {}
			: { "CONTEXT-MAP.md": map, "GLOSSARY-MAP.md": map }),
	};
}

describe("renderDomain", () => {
	test("points at the repo's glossary, context map, extra reading and ADR dir", () => {
		const doc = renderDomain({
			glossary: "docs/product/glossary.md",
			contextMap: "docs/product/domain/context-map.md",
			adrDir: "docs/adr",
			readFirst: ["docs/product/sessions.md"],
		});
		expect(doc).toContain("- `docs/product/glossary.md`, the glossary.");
		expect(doc).toContain(
			"- `docs/product/domain/context-map.md`, the context map.",
		);
		expect(doc).toContain("- `docs/product/sessions.md`.");
		expect(skillNames(doc)).toEqual({
			"CONTEXT.md": "docs/product/glossary.md",
			"GLOSSARY.md": "docs/product/glossary.md",
			"CONTEXT-MAP.md": "docs/product/domain/context-map.md",
			"GLOSSARY-MAP.md": "docs/product/domain/context-map.md",
		});
		expect(doc).toContain("`docs/adr/`");
	});

	test.each(projects)(
		"the domain doc of $name sends CONTEXT.md and GLOSSARY.md to its glossary, and CONTEXT-MAP.md and GLOSSARY-MAP.md to its context map",
		(project) => {
			expect(skillNames(renderDomain(project.domain))).toEqual(
				wantedSkillNames(project.domain),
			);
		},
	);

	test("tells a skill to name a missing file in its output, never to proceed silently", () => {
		const doc = renderDomain({ glossary: "CONTEXT.md", adrDir: "docs/adr" });
		expect(
			doc
				.split("\n")
				.filter((line) => line.startsWith("If one of these files is missing")),
		).toEqual([
			"If one of these files is missing, name it in your output. Do not work as if you read it.",
		]);
	});

	test("says nothing about renaming when the glossary is CONTEXT.md", () => {
		expect(
			renderDomain({ glossary: "CONTEXT.md", adrDir: "docs/adr" }),
		).not.toContain("it means");
	});

	test("reports a context map, a reading path or an ADR dir that is missing or of the wrong kind", () => {
		const kinds: Record<string, string> = {
			"CONTEXT.md": "file",
			"docs/context-map": "directory",
			"docs/adr": "file",
		};
		expect(
			domainProblems(
				{
					glossary: "CONTEXT.md",
					contextMap: "docs/context-map",
					adrDir: "docs/adr",
					readFirst: ["map.md"],
				},
				(path) => kinds[path] ?? "missing",
			),
		).toEqual([
			"domain points at docs/context-map, which is directory, not a file",
			"domain points at map.md, which is missing, not a file",
			"domain points at docs/adr, which is file, not a directory",
		]);
	});
});

describe("renderAgentSkillsBlock", () => {
	test("summarises each tracker kind in one line", () => {
		expect(renderAgentSkillsBlock(project())).toContain(
			"- Issue tracker: Linear team ABC.",
		);
		expect(renderAgentSkillsBlock(project({ tracker: github }))).toContain(
			"- Issue tracker: GitHub issues in this repo.",
		);
		expect(renderAgentSkillsBlock(project({ tracker: local }))).toContain(
			"no tracker, so local Markdown under `.scratch/`",
		);
	});
});

describe("labels", () => {
	test("Linear needs the four role labels and the wayfinder labels, not wontfix", () => {
		expect(wantedLabels(linear)).toEqual([
			"needs-triage",
			"needs-info",
			"ready-for-agent",
			"ready-for-human",
			"wayfinder:map",
			"wayfinder:research",
			"wayfinder:prototype",
			"wayfinder:grilling",
			"wayfinder:task",
		]);
		expect(wantedLabels({ ...linear, triageState: "Triage" })).not.toContain(
			"needs-triage",
		);
	});

	test("GitHub lists only the labels gh reports missing, as commands", () => {
		const existing = [...wantedLabels(github)].filter(
			(label) => label !== "needs-info",
		);
		expect(labelSetup(github, existing)).toEqual([
			"Create the missing labels from inside the repo. Checked against `gh label list`.",
			"  $ gh label create 'needs-info'",
		]);
		expect(labelSetup(github, wantedLabels(github))).toEqual([
			"Every label the skills use exists.",
		]);
	});

	test("an unread label list lists every label", () => {
		expect(labelSetup(github, undefined)).toHaveLength(
			wantedLabels(github).length + 1,
		);
	});

	test("a local tracker needs no labels", () => {
		expect(wantedLabels(local)).toEqual([]);
		expect(labelSetup(local, undefined)[0]).toContain("No labels");
	});
});
