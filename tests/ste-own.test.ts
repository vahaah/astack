import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
	exemptPaths,
	STE_EXEMPT_CAP,
	STE_EXEMPT_DIR,
} from "../scripts/lib/ste-exempt.ts";
import {
	astackWrittenText,
	COMMENTS_RULE,
	exemptProblems,
	ownTextPaths,
	ownTextReport,
	quotedSections,
	readOwnText,
	renderedTextReport,
	withoutQuotedSections,
} from "../scripts/lib/ste-own.ts";
import { checkOwnSte } from "../scripts/validate.ts";
import { ok } from "../src/astack/result.ts";
import { DEFAULT_GLOSSARY } from "../src/astack/ste/check.ts";
import { loadSettings } from "../src/astack/ste/profile.ts";
import { exampleProjects } from "./profile-paths.ts";
import {
	copiedFrom,
	readUpstreamRuns,
	runsOf,
	SHARED_BOILERPLATE,
} from "./upstream-runs.ts";

const rule = `# Comments

Write no comment by default.

## Keep clauses

- Keep A; keep B.
- Keep C.

## Suppressions

\`@ts-ignore\` and friends stink; kill them.

## Claims that a comment must stay

\`IMPORTANT\` and \`do not remove\` are scent; read the code.

## Long justifications

A long justification is a confession; kill it.
`;

const acme: Readonly<Record<string, string>> = {
	"examples/companion/projects/acme.json": JSON.stringify({
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
		tracker: { kind: "none", dir: ".scratch" },
		domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
		keepPatterns: [],
		lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
		gates: [],
		ciOnlyGates: [],
		commentConflicts: [],
		adrNeeded: [],
	}),
};

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function repo(files: Readonly<Record<string, string>>): string {
	const root = mkdtempSync(join(tmpdir(), "ste-own-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}

describe("the Comment Sicko quote", () => {
	test("takes the body of each quoted section in file order", () => {
		expect(quotedSections(rule)).toEqual(
			ok([
				"- Keep A; keep B.\n- Keep C.",
				"`@ts-ignore` and friends stink; kill them.",
				"`IMPORTANT` and `do not remove` are scent; read the code.",
				"A long justification is a confession; kill it.",
			]),
		);
	});

	test("blanks each line of the quoted sections and keeps the headings and the line numbers", () => {
		expect(withoutQuotedSections(rule)).toEqual(
			ok(rule.replace(/^(- Keep|`|A long).*$/gm, "")),
		);
	});

	test.each([
		[
			"a quoted heading is missing",
			rule.replace("## Suppressions", "## Other"),
		],
		[
			"a quoted heading appears twice",
			`${rule}\n## Suppressions\n\nMore text.\n`,
		],
	])("gives an error when %s", (_, text) => {
		expect(quotedSections(text)).toEqual({
			ok: false,
			error:
				'rules/comments.md must hold exactly one "## Suppressions" section.',
		});
	});

	test("exempts the semicolons of the quote but not those of the frame", () => {
		const root = repo({
			[COMMENTS_RULE]: rule.replace(
				"Write no comment by default.",
				"Write no comment by default; delete it.",
			),
		});
		const { sources, errors } = readOwnText(root);
		expect(errors).toEqual([]);
		const report = ownTextReport(sources, DEFAULT_GLOSSARY);
		expect(
			report.findings.map(({ path, finding }) => [
				path,
				finding.rule,
				finding.line,
			]),
		).toEqual([[COMMENTS_RULE, "semicolon", 3]]);
	});

	test("refuses the rule when it no longer holds the quoted sections", () => {
		const root = repo({ [COMMENTS_RULE]: "# Comments\n" });
		expect(readOwnText(root).errors).toEqual([
			{
				path: COMMENTS_RULE,
				message:
					'rules/comments.md must hold exactly one "## Keep clauses" section.',
			},
		]);
	});
});

describe("the own text of astack", () => {
	test("walks the own roots, skips the card copy, node_modules and each listed exempt file", () => {
		const root = repo({
			"README.md": "# A\n",
			"AGENTS.md": "# B\n",
			"rules/coding.md": "# C\n",
			"rules/astack.md": "# copy\n",
			"docs/design.md": "# D\n",
			"templates/pr-review-hardening.stub.SKILL.md": "# H\n",
			"examples/companion/projects/acme/pr-review-hardening.profile.md":
				"# I\n",
			"marketplace/plugins/astack/skills/a/SKILL.md": "# F\n",
			"marketplace/plugins/astack/skills/a/moved.md": "It's theirs.\n",
			[`${STE_EXEMPT_DIR}/a.txt`]:
				"marketplace/plugins/astack/skills/a/moved.md\n",
			"marketplace/plugins/astack/node_modules/x/README.md": "# G\n",
			"upstream/pstack/README.md": "It's theirs.\n",
		});
		expect(ownTextPaths(root)).toEqual([
			"AGENTS.md",
			"README.md",
			"docs/design.md",
			"examples/companion/projects/acme/pr-review-hardening.profile.md",
			"marketplace/plugins/astack/skills/a/SKILL.md",
			"rules/coding.md",
			"templates/pr-review-hardening.stub.SKILL.md",
		]);
	});

	test("examines the frontmatter description at its own line", () => {
		const report = ownTextReport(
			[
				{
					path: "skills/a/SKILL.md",
					text: "---\nname: a\ndescription: Use it when it's late.\n---\n\n# A\n\nRun it.\n",
				},
			],
			DEFAULT_GLOSSARY,
		);
		expect(report.descriptions).toBe(1);
		expect(
			report.findings.map(({ finding }) => [finding.rule, finding.line]),
		).toEqual([["contraction", 3]]);
	});

	test("the validate check fails on a deny finding and passes clean text", () => {
		const dirty = checkOwnSte(
			repo({ ...acme, "README.md": "# A\n\nIt works, e.g. here.\n" }),
		);
		expect(dirty.findings.map((finding) => finding.file)).toEqual([
			"README.md",
		]);
		expect(dirty.findings[0]?.severity).toBe("error");
		const clean = checkOwnSte(
			repo({ ...acme, "README.md": "# A\n\nIt works here.\n" }),
		);
		expect(clean.findings).toEqual([]);
	});
});

describe("the STE exemption lists", () => {
	test("name a missing file, a file with 0 findings and a file that shares no run with its item origin", () => {
		const upstream = "run the whole suite before you open the pull request";
		const skill = "marketplace/plugins/astack/skills/a";
		const root = repo({
			[`${skill}/SKILL.md`]: `---\nname: a\nmetadata:\n  origin: pstack\n---\n\nIt's late, so ${upstream}.\n`,
			[`${skill}/clean.md`]: `You must ${upstream}.\n`,
			[`${skill}/own.md`]: "It's ours, and no upstream holds this text.\n",
			[`${STE_EXEMPT_DIR}/a.txt`]: [
				`${skill}/SKILL.md`,
				`${skill}/gone.md`,
				`${skill}/clean.md`,
				`${skill}/own.md`,
			].join("\n"),
		});
		const index = new Map(
			runsOf(upstream).map((run) => [run, new Set(["pstack"])]),
		);
		expect(
			exemptProblems(root, DEFAULT_GLOSSARY, (text) => copiedFrom(index, text)),
		).toEqual([
			`${STE_EXEMPT_DIR}/a.txt: ${skill}/gone.md does not exist`,
			`${STE_EXEMPT_DIR}/a.txt: ${skill}/clean.md has 0 deny findings, so it must leave the list`,
			`${STE_EXEMPT_DIR}/a.txt: ${skill}/own.md shares no run of words with its item origin "pstack"`,
		]);
	});

	test("each listed file of the repo exists, has a deny finding and shares a run with its item origin", () => {
		const root = resolve(import.meta.dir, "..");
		const index = readUpstreamRuns();
		expect(exemptPaths(root)).toHaveLength(STE_EXEMPT_CAP);
		expect(
			exemptProblems(root, loadSettings(root).glossary, (text) =>
				copiedFrom(index, text, SHARED_BOILERPLATE),
			),
		).toEqual([]);
	});
});

describe("the text that apply renders into a repo", () => {
	test("fails on 0 project configs, so a gate with nothing to render cannot pass", () => {
		const root = repo({ "rules/coding.md": "# C\n" });
		const projects = join(root, "examples/companion/projects");
		expect(renderedTextReport(root, projects)).toEqual({
			files: 0,
			descriptions: 0,
			findings: [],
			errors: [
				{
					path: projects,
					message:
						"holds 0 project configs, so the gate examines no text that apply renders",
				},
			],
		});
	});

	test("the rendered files of each project pass the deny rules", () => {
		const report = renderedTextReport(
			resolve(import.meta.dir, ".."),
			exampleProjects,
		);
		expect(report.errors).toEqual([]);
		expect(
			report.findings.map(
				({ path, finding }) => `${path} L${finding.line} ${finding.rule}`,
			),
		).toEqual([]);
	});

	test("a rule copy is checked only after the copied rule, and a flow doc in full", () => {
		const rule = {
			name: "coding.md",
			content: "# Coding\n\nKeep it short; it is easy.\n",
		};
		const copy = astackWrittenText(
			{
				path: ".claude/rules/x/coding.md",
				kind: "rule",
				content: `${rule.content}\n## Keep patterns\n\nIt's kept.\n`,
			},
			[rule],
		);
		const doc = astackWrittenText(
			{
				path: "docs/agents/domain.md",
				kind: "flow-config",
				content: "# Domain\n\nIt's long; read it.\n",
			},
			[rule],
		);
		if (!copy.ok || !doc.ok) throw new Error("expected text");
		const report = ownTextReport(
			[
				{ path: "copy", text: copy.value ?? "" },
				{ path: "doc", text: doc.value ?? "" },
			],
			DEFAULT_GLOSSARY,
		);
		expect(
			report.findings.map(({ path, finding }) => [
				path,
				finding.rule,
				finding.line,
			]),
		).toEqual([
			["copy", "contraction", 7],
			["doc", "contraction", 3],
			["doc", "semicolon", 3],
		]);
		expect(
			astackWrittenText(
				{
					path: ".claude/skills/pr-review-hardening/SKILL.md",
					kind: "review-stub",
					content: "It's a copy.\n",
				},
				[rule],
			),
		).toEqual({ ok: true, value: undefined });
		expect(
			astackWrittenText(
				{
					path: ".claude/rules/x/comments.md",
					kind: "rule",
					content: "# Comments\n",
				},
				[rule],
			),
		).toEqual({
			ok: false,
			error:
				".claude/rules/x/comments.md does not start with a copy of a rule in rules/",
		});
	});
});
