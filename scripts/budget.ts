import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { err, ok, type Result } from "../src/astack/result.ts";
import { listFiles, REPO_ROOT } from "./lib/files.ts";

export type Budget = {
	readonly total: number;
	readonly skills: Readonly<Record<string, number>>;
	readonly lines: Readonly<Record<string, number>>;
};

export type WordCounts = ReadonlyMap<string, number>;
export type LineCounts = ReadonlyMap<string, number>;

const BUDGET_FILE = "scripts/lib/budget.json";
const SKILLS_DIR = "marketplace/plugins/astack/skills";
const LOWER_HINT = "Run bun scripts/budget.ts --lower";

function sum(counts: WordCounts): number {
	return [...counts.values()].reduce((total, count) => total + count, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown, name: string): Result<number, string> {
	return typeof value === "number" && Number.isInteger(value) && value >= 0
		? ok(value)
		: err(`${BUDGET_FILE}: ${name} must be a whole number`);
}

function caps(
	raw: Record<string, unknown>,
	key: string,
): Result<Record<string, number>, string> {
	const parsed: Record<string, number> = {};
	for (const [name, value] of Object.entries(raw)) {
		const cap = wholeNumber(value, `${key}.${name}`);
		if (!cap.ok) return cap;
		parsed[name] = cap.value;
	}
	return ok(parsed);
}

export function parseBudget(raw: unknown): Result<Budget, string> {
	if (!isRecord(raw) || !isRecord(raw.skills) || !isRecord(raw.lines))
		return err(`${BUDGET_FILE}: expected { total, skills, lines }`);
	const total = wholeNumber(raw.total, "total");
	if (!total.ok) return total;
	const skills = caps(raw.skills, "skills");
	if (!skills.ok) return skills;
	const lines = caps(raw.lines, "lines");
	if (!lines.ok) return lines;
	return ok({ total: total.value, skills: skills.value, lines: lines.value });
}

export function skillWords(skillsDir: string): WordCounts {
	const counts = new Map<string, number>();
	for (const entry of readdirSync(skillsDir, { withFileTypes: true }).sort(
		(a, b) => a.name.localeCompare(b.name),
	)) {
		if (!entry.isDirectory()) continue;
		const root = join(skillsDir, entry.name);
		const words = listFiles(root)
			.filter((path) => path.endsWith(".md"))
			.reduce(
				(total, path) =>
					total +
					(readFileSync(join(root, path), "utf8").match(/\S+/g) ?? []).length,
				0,
			);
		counts.set(entry.name, words);
	}
	return counts;
}

export function lineCounts(root: string, budget: Budget): LineCounts {
	return new Map(
		Object.keys(budget.lines).map((path) => [
			path,
			Math.max(
				0,
				...readFileSync(join(root, path), "utf8")
					.split("\n")
					.map((line) => [...line].length),
			),
		]),
	);
}

export type BudgetReport = {
	readonly problems: readonly string[];
	readonly notes: readonly string[];
};

export function budgetReport(
	counts: WordCounts,
	lines: LineCounts,
	budget: Budget,
): BudgetReport {
	const problems: string[] = [];
	const notes: string[] = [];
	const check = (name: string, count: number, cap: number, unit = "words") => {
		if (count > cap)
			problems.push(`${name}: ${count} ${unit}, over its cap of ${cap}`);
		else if (count < cap)
			notes.push(
				`${name}: ${count} ${unit}, under its cap of ${cap}. ${LOWER_HINT}`,
			);
	};
	for (const [name, count] of counts) {
		const cap = budget.skills[name];
		if (cap === undefined)
			problems.push(
				`${name}: ${count} words, and ${BUDGET_FILE} gives it no cap`,
			);
		else check(name, count, cap);
	}
	for (const name of Object.keys(budget.skills))
		if (!counts.has(name))
			notes.push(`${name}: the skill is gone. ${LOWER_HINT}`);
	check("total", sum(counts), budget.total);
	for (const [path, longest] of lines)
		check(
			path,
			longest,
			budget.lines[path] ?? 0,
			"characters in its longest line",
		);
	return { problems, notes };
}

export function lowerBudget(
	counts: WordCounts,
	lines: LineCounts,
	budget: Budget,
): Budget {
	const skills = Object.fromEntries(
		Object.entries(budget.skills).flatMap(([name, cap]) => {
			const count = counts.get(name);
			return count === undefined ? [] : [[name, Math.min(cap, count)]];
		}),
	);
	return {
		total: Math.min(budget.total, sum(counts)),
		skills,
		lines: Object.fromEntries(
			Object.entries(budget.lines).map(([path, cap]) => [
				path,
				Math.min(cap, lines.get(path) ?? cap),
			]),
		),
	};
}

function main(): number {
	const { values } = parseArgs({ options: { lower: { type: "boolean" } } });
	const path = join(REPO_ROOT, BUDGET_FILE);
	const parsed = parseBudget(JSON.parse(readFileSync(path, "utf8")));
	if (!parsed.ok) {
		console.error(parsed.error);
		return 1;
	}
	const counts = skillWords(join(REPO_ROOT, SKILLS_DIR));
	const lines = lineCounts(REPO_ROOT, parsed.value);
	const budget = values.lower
		? lowerBudget(counts, lines, parsed.value)
		: parsed.value;
	if (values.lower)
		writeFileSync(path, `${JSON.stringify(budget, null, "\t")}\n`);
	const { problems, notes } = budgetReport(counts, lines, budget);
	for (const note of notes) console.log(`budget: note: ${note}`);
	if (problems.length > 0) {
		for (const problem of problems) console.error(`budget: ${problem}`);
		return 1;
	}
	console.log(
		`budget: ${counts.size} skills, ${sum(counts)} words, cap ${budget.total}`,
	);
	return 0;
}

if (import.meta.main) process.exit(main());
