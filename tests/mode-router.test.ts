import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	measure,
	scenarios,
	workingTree,
} from "../scripts/skill-load-report.ts";
import { rowFor } from "./supervision-text.test.ts";

const ROOT = join(import.meta.dir, "..");
const MODE = "marketplace/plugins/astack/skills/mode";
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

function tableRows(text: string, heading: string): readonly string[] {
	const start = text.indexOf(`\n## ${heading}\n`);
	if (start === -1) return [];
	const end = text.indexOf("\n## ", start + 1);
	const body = text.slice(start, end === -1 ? undefined : end);
	return body
		.split("\n")
		.filter((line) => line.startsWith("| "))
		.slice(1);
}

function ownerWords(row: string): readonly string[] {
	const cell = (row.split("|")[1] ?? "").trim();
	return cell
		.split(",")
		.map((item) =>
			item
				.trim()
				.replace(/^["'`]+|["'`]+$/g, "")
				.toLowerCase(),
		)
		.filter((item) => item !== "");
}

function heldByCard(cardText: string, routesText: string): readonly string[] {
	const cardItems = tableRows(cardText, "Routes").map(ownerWords);
	return tableRows(routesText, "Route table")
		.filter((row) => {
			const items = ownerWords(row);
			return (
				items.length > 0 &&
				cardItems.some((cardRow) =>
					items.every((item) => cardRow.includes(item)),
				)
			);
		})
		.map((row) => (row.split("|")[1] ?? "").trim());
}

function fallbackModePlaybooks(routesText: string): readonly string[] {
	return tableRows(routesText, "Fallbacks")
		.map((row) => (row.split("|")[1] ?? "").trim())
		.filter((cell) => /playbook\b/i.test(cell));
}

export type RuleHome =
	| { readonly phrase: string; readonly home: string }
	| { readonly phrase: string; readonly cut: string };

const RULE_HOMES: readonly RuleHome[] = [
	{
		phrase: "Plan mode, concise, unresolved questions last",
		home: `${MODE}/references/card.md`,
	},
	{
		phrase: "S0 to S3, S5 and S6",
		home: "marketplace/plugins/astack/skills/plan/references/tiers.md",
	},
	{
		phrase: "first write `docs/plans/<slug>.md`",
		home: "marketplace/plugins/astack/skills/plan/references/tiers.md",
	},
	{
		phrase: "Record the grant",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Continue to the next step",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase:
			"Every change follows [the required proof contract](references/change-proof.md)",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "name each principle that shaped a decision",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "A delegation grant never removes harness restrictions",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Always pause for these irreversible writes",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "this doesn't earn its place",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Write short declarative sentences with one thought each",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Keep a checkpoint reply to 6 lines or fewer",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Owner gates always stop work",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Copy the matched playbook's steps into the task list",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase: "Without astack fallback lines in Triggers",
		cut: "astack-only triggers omit without-astack fallback clauses",
	},
	{
		phrase: "`astack:comment-judge` holds the comment rules",
		home: `${MODE}/SKILL.md`,
	},
	{
		phrase:
			'Use `triage` for "comments", "check github comments", and "fix CI"',
		home: `${MODE}/playbooks/babysit.md`,
	},
	{
		phrase: "Classify each open thread: Fix (true and in scope)",
		home: `${MODE}/playbooks/babysit.md`,
	},
	{
		phrase: "Resolve each handled thread:",
		home: `${MODE}/playbooks/babysit.md`,
	},
	{
		phrase: "follow the managed-file rule in `references/fix.md`",
		home: `${MODE}/playbooks/babysit.md`,
	},
	{
		phrase: "The plan, the tracker and git hold the state",
		home: `${MODE}/references/resume.md`,
	},
	{
		phrase: "One grill round at most",
		home: `${MODE}/references/card.md`,
	},
	{
		phrase: "Keep the steps together in one run",
		cut: "tiers.md gives the quick tier one session",
	},
	{
		phrase: "Write `Root cause: X because Y` before the fix",
		home: `${MODE}/references/card.md`,
	},
	{
		phrase: "Read a tester report critically before you accept its scope",
		home: `${MODE}/playbooks/bug-fix.md`,
	},
	{
		phrase: "One reviewer from each entry of the council members role",
		home: "marketplace/plugins/astack/skills/council/SKILL.md",
	},
	{
		phrase: "Make the smallest changes that satisfy the reviewer",
		home: "marketplace/plugins/astack/skills/sol-loop/SKILL.md",
	},
	{
		phrase: "shows a concrete failure that the PR introduces",
		home: "marketplace/plugins/astack/skills/pr-review-hardening/references/review.md",
	},
	{
		phrase: "reads that clause as a merge grant for this prompt",
		home: "marketplace/plugins/astack/skills/full-send/SKILL.md",
	},
	{
		phrase: "Walk the journey as a real persona",
		cut: "the card already asks for a persona walk and a measure first",
	},
	{
		phrase: 'Give this prompt for "pause" and "prompt for next session"',
		home: `${MODE}/references/resume.md`,
	},
	{
		phrase: "The script reads paths from `git worktree list`",
		home: `${MODE}/playbooks/worktree-cleanup.md`,
	},
	{
		phrase: "Bug fix playbook fallback",
		cut: "a mode playbook cannot be missing when mode loads",
	},
	{
		phrase: "Babysit playbook fallback",
		cut: "a mode playbook cannot be missing when mode loads",
	},
	{
		phrase: "Shipping playbook fallback",
		cut: "a mode playbook cannot be missing when mode loads",
	},
	{
		phrase: "Pause safely playbook fallback",
		cut: "a mode playbook cannot be missing when mode loads",
	},
	{
		phrase: "Orchestrate playbook fallback",
		cut: "a mode playbook cannot be missing when mode loads",
	},
];

function ruleHomeProblems(rows: readonly RuleHome[]): readonly string[] {
	return rows.flatMap((row) => {
		const words = row.phrase.trim().split(/\s+/).filter(Boolean).length;
		if (words < 3 || words > 12)
			return [`phrase "${row.phrase}" has ${words} words`];
		if ("cut" in row)
			return row.cut.trim() === "" ? [`cut "${row.phrase}" has no reason`] : [];
		const text = flat(read(row.home));
		return text.includes(row.phrase)
			? []
			: [`${row.home} lacks "${row.phrase}"`];
	});
}

describe("mode router routes and rule homes", () => {
	test("[control:mr-routes-add] each route row adds an owner word that no card row holds, and Fallbacks name no mode playbook", () => {
		const card = read(`${MODE}/references/card.md`);
		const routes = read(`${MODE}/references/routes.md`);
		expect(heldByCard(card, routes)).toEqual([]);
		expect(fallbackModePlaybooks(routes)).toEqual([]);
		expect(rowFor(routes, "what waits on me")).toContain("where are we");
		const withPlan = routes.replace(
			"| Owner words | Route | How it runs |\n|---|---|---|\n",
			"| Owner words | Route | How it runs |\n|---|---|---|\n| `/plan` | Plan mode | Repeat of the card |\n",
		);
		expect(heldByCard(card, withPlan)).toEqual(["`/plan`"]);
	});

	test("[control:mr-no-lost-rule] each sentence of a deleted file or row keeps a home phrase or a cut reason", () => {
		expect(ruleHomeProblems(RULE_HOMES)).toEqual([]);
		expect(
			ruleHomeProblems([
				{
					phrase: "a phrase no file holds",
					home: `${MODE}/references/card.md`,
				},
				{ phrase: "a cut with no reason", cut: "" },
			]),
		).toEqual([
			`${MODE}/references/card.md lacks "a phrase no file holds"`,
			'cut "a cut with no reason" has no reason',
		]);
	});

	test("[control:mr-worker-rule] worker.md stays at or under 300 words with the four fixed rules in rule 1, and delegate.md reads only SKILL.md and worker.md", () => {
		const workerProblems = (text: string): readonly string[] => {
			const words = text.trim().split(/\s+/).filter(Boolean).length;
			const problems: string[] = [];
			if (words > 300) problems.push(`worker.md has ${words} words (> 300)`);
			const rule1 =
				/(?:^|\n)1\.\s+([\s\S]*?)(?=\n2\.\s|\n## |$)/.exec(text)?.[1] ?? "";
			const flatRule1 = flat(rule1);
			for (const [label, pattern] of [
				["owner gates", /owner gates/i],
				["money", /money/i],
				["legal sign-off", /legal sign-off/i],
				["merge grant", /merge grant/i],
				["ChangeProof", /ChangeProof/],
				["check proof", /astack check proof/],
				["STE replies", /\bSTE\b/],
			] as const)
				if (!pattern.test(flatRule1)) problems.push(`rule 1 lacks ${label}`);
			return problems;
		};
		const workerPath = `${MODE}/references/worker.md`;
		expect(existsSync(join(ROOT, workerPath))).toBe(true);
		const worker = read(workerPath);
		expect(workerProblems(worker)).toEqual([]);
		expect(
			workerProblems(worker.replace(/merge grant/gi, "approval")),
		).toContain("rule 1 lacks merge grant");

		const delegate = read("marketplace/plugins/astack/agents/delegate.md");
		expect(delegate).toContain("SKILL.md");
		expect(delegate).toContain("worker.md");
		const otherModeFiles = [
			...delegate.matchAll(
				/\b(?:references|playbooks)\/[a-z0-9-]+\.md\b|\b(?:non-negotiables|autonomy|subagents|paths-and-wakeups|writing-the-reply|delegation|playbooks|routes|card|comments-triage|resume|refresh|create-pr)\.md\b/g,
			),
		]
			.map((match) => match[0])
			.filter(
				(name) =>
					name !== "references/worker.md" &&
					name !== "references/proof-contract.md",
			);
		expect(otherModeFiles).toEqual([]);

		const subagents = read(`${MODE}/references/subagents.md`);
		expect(subagents).toContain("worker.md");
		expect(rowFor(subagents, "Prompt")).toMatch(/mode folder/i);
	});

	test("[control:mr-delegate-set] the delegate scenario lists SKILL.md and worker.md at or under 2,000 words, and SKILL.md stays at or under 1,700", () => {
		const list = scenarios("", () => undefined);
		const delegate = list.find(
			(scenario) => scenario.name === "mode delegate or unclear role",
		);
		expect(delegate?.after).toEqual([
			`${MODE}/SKILL.md`,
			`${MODE}/references/worker.md`,
		]);
		const skillWords = measure(read(`${MODE}/SKILL.md`)).words;
		const workerWords = measure(read(`${MODE}/references/worker.md`)).words;
		expect(skillWords).toBeLessThanOrEqual(1700);
		expect(skillWords + workerWords).toBeLessThanOrEqual(2000);
		const current = workingTree(ROOT);
		expect(delegate?.after.every((path) => current(path) !== undefined)).toBe(
			true,
		);
	});

	test("[control:mr-principle-index] mode SKILL.md lists each of the 24 principle references once, and principles SKILL.md lists none", () => {
		const names = readdirSync(
			join(ROOT, "marketplace/plugins/astack/skills/principles/references"),
		)
			.filter((name) => name.endsWith(".md"))
			.map((name) => name.slice(0, -3))
			.sort();
		expect(names.length).toBe(24);
		const modeSkill = read(`${MODE}/SKILL.md`);
		const principlesSkill = read(
			"marketplace/plugins/astack/skills/principles/SKILL.md",
		);
		const missing = names.filter(
			(name) => modeSkill.split(`\`${name}\``).length - 1 !== 1,
		);
		expect(missing).toEqual([]);
		const leaked = names.filter((name) => principlesSkill.includes(name));
		expect(leaked).toEqual([]);
	});

	test("[control:mr-no-stale-name] no tracked Markdown or JSON outside adr, plans, upstream and dist names a deleted mode file or part", () => {
		const STALE =
			/\b(?:non-negotiables|autonomy|writing-the-reply|delegation|playbooks|comments-triage)\.md\b|\bNon-negotiables\b|\bWriting the reply\b/;
		const findStale = (
			entries: readonly (readonly [path: string, text: string])[],
		): readonly string[] =>
			entries.filter(([, text]) => STALE.test(text)).map(([path]) => path);
		const listed = spawnSync("git", ["ls-files", "*.md", "*.json"], {
			cwd: ROOT,
			encoding: "utf8",
		});
		expect(listed.status).toBe(0);
		const files = listed.stdout
			.split("\n")
			.filter(Boolean)
			.filter(
				(path) =>
					!path.startsWith("docs/adr/") &&
					!path.startsWith("docs/plans/") &&
					!path.startsWith("upstream/") &&
					!path.startsWith("dist/") &&
					path !== "CHANGELOG.md" &&
					existsSync(join(ROOT, path)),
			)
			.map((path) => [path, read(path)] as const);
		expect(findStale(files)).toEqual([]);
		expect(
			findStale([
				[
					"marketplace/plugins/astack/skills/council/SKILL.md",
					"Use `references/comments-triage.md`.",
				],
			]),
		).toEqual(["marketplace/plugins/astack/skills/council/SKILL.md"]);
	});

	test("babysit triage keeps the explicit PR selector when a PR number is named", () => {
		const babysit = read(`${MODE}/playbooks/babysit.md`);
		expect(babysit).toContain(
			"When the owner names a PR, put its number after `view`",
		);
		expect(babysit).toContain("gh pr checks <number>");
	});

	test("babysit triage reads review bodies and general PR comments alongside review threads", () => {
		const babysit = read(`${MODE}/playbooks/babysit.md`);
		expect(babysit).toContain("review bodies");
		expect(babysit).toContain("general PR comments");
		expect(babysit).toContain("reviews(first: 100)");
		expect(babysit).toContain("comments(first: 100)");
	});
});
