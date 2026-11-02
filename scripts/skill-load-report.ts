import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { valueAfter } from "../src/astack/cli/args.ts";

export type Measure = { readonly words: number; readonly bytes: number };

export type Reader = (path: string) => string | undefined;

export type Scenario = {
	readonly name: string;
	readonly entry: string;
	readonly before: readonly string[];
	readonly after: readonly string[];
};

export type Row = {
	readonly name: string;
	readonly before: Measure | undefined;
	readonly after: Measure;
	readonly files: { readonly before: number; readonly after: number };
};

export type FallbackParity = {
	readonly identical: boolean;
	readonly onlyInOld: readonly string[];
	readonly onlyInNew: readonly string[];
};

const ROOT = resolve(import.meta.dir, "..");
const PLUGIN = "marketplace/plugins/astack/skills";
const DEFAULT_BASE = "dbed1c9";
const STUB = "templates/pr-review-hardening.stub.SKILL.md";
const FALLBACK = "templates/pr-review-hardening.stub.FALLBACK.md";
const skill = (name: string) => `${PLUGIN}/${name}/SKILL.md`;
const reference = (name: string, file: string) =>
	`${PLUGIN}/${name}/references/${file}`;
const MODE_SECTIONS = [
	"non-negotiables.md",
	"autonomy.md",
	"subagents.md",
	"paths-and-wakeups.md",
	"writing-the-reply.md",
].map((file) => reference("mode", file));
const MODE_PLAYBOOKS = reference("mode", "playbooks.md");
const MODE_ROUTES = reference("mode", "routes.md");

const PLAN_STAGE_READS = [
	"write-docs",
	"in-your-own-words",
	"sharpen",
	"show-me-your-work",
];

export function measure(text: string): Measure {
	return {
		words: text.split(/\s+/).filter((word) => word !== "").length,
		bytes: Buffer.byteLength(text, "utf8"),
	};
}

export function workingTree(root: string): Reader {
	return (path) => {
		const file = join(root, path);
		return existsSync(file) ? readFileSync(file, "utf8") : undefined;
	};
}

export function atRevision(root: string, revision: string): Reader {
	return (path) => {
		const shown = spawnSync("git", ["show", `${revision}:${path}`], {
			cwd: root,
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
		return shown.status === 0 ? shown.stdout : undefined;
	};
}

export function revisionExists(root: string, revision: string): boolean {
	return (
		spawnSync("git", ["cat-file", "-e", `${revision}^{commit}`], { cwd: root })
			.status === 0
	);
}

export function fallbackSection(stub: string): string | undefined {
	const at = stub.indexOf("## Fallback");
	return at < 0 ? undefined : stub.slice(at);
}

function lines(text: string): string[] {
	return text.split("\n").filter((line) => line.trim() !== "");
}

export function fallbackParity(
	oldStub: string,
	newFallback: string,
): FallbackParity {
	const oldText = fallbackSection(oldStub) ?? "";
	const newText = fallbackSection(newFallback) ?? "";
	const oldLines = lines(oldText);
	const newLines = lines(newText);
	return {
		identical: oldText === newText && oldText !== "",
		onlyInOld: oldLines.filter((line) => !newLines.includes(line)),
		onlyInNew: newLines.filter((line) => !oldLines.includes(line)),
	};
}

export function pointerProblems(
	read: Reader,
	scenario: Scenario,
): readonly string[] {
	const entry = read(scenario.entry);
	if (entry === undefined) return [`${scenario.entry} is missing`];
	return scenario.after.flatMap((path) => {
		if (path === scenario.entry) return [];
		if (read(path) === undefined) return [`${path} is missing`];
		const pointer = path.endsWith("/SKILL.md")
			? `astack:${path.split("/").slice(-2)[0] ?? ""}`
			: path === FALLBACK
				? "FALLBACK.md"
				: path.slice(path.lastIndexOf("/") + 1);
		return entry.includes(pointer)
			? []
			: [`${scenario.entry} does not point to ${path} as "${pointer}"`];
	});
}

export function planUpfrontSkills(oldPlan: string): string[] {
	const from = oldPlan.indexOf("## Load the skills you compose");
	const to = oldPlan.indexOf("## Pick the mode");
	if (from < 0 || to < from) return [];
	const names = [
		...oldPlan.slice(from, to).matchAll(/(?<!\/)astack:([a-z-]+)/g),
	].map((match) => match[1] ?? "");
	return [...new Set(names)].filter((name) => name !== "");
}

function planBeforeFiles(oldPlan: string, read: Reader): string[] {
	const names = planUpfrontSkills(oldPlan).filter(
		(name) => read(skill(name)) !== undefined,
	);
	return [
		skill("plan"),
		...names.map(skill),
		...(names.includes("mode") ? [MODE_PLAYBOOKS] : []),
	];
}

export function scenarios(
	oldPlan: string,
	baseRead: Reader,
): readonly Scenario[] {
	const planBefore = planBeforeFiles(oldPlan, baseRead);
	return [
		{
			name: "review stub, plugin available",
			entry: STUB,
			before: [STUB],
			after: [STUB],
		},
		{
			name: "review stub, plugin absent",
			entry: STUB,
			before: [STUB],
			after: [STUB, FALLBACK],
		},
		{
			name: "plan, S0 intake in the main thread",
			entry: skill("plan"),
			before: planBefore,
			after: [skill("plan"), ...PLAN_STAGE_READS.map(skill)],
		},
		{
			name: "plan, resume of an existing plan",
			entry: skill("plan"),
			before: planBefore,
			after: [skill("plan"), reference("plan", "upkeep.md")],
		},
		{
			name: "mode router with no argument",
			entry: skill("mode"),
			before: [
				skill("mode"),
				...MODE_SECTIONS,
				MODE_PLAYBOOKS,
				skill("principles"),
			],
			after: [skill("mode"), ...MODE_SECTIONS, skill("principles")],
		},
		{
			name: "mode router with a routed request",
			entry: skill("mode"),
			before: [
				skill("mode"),
				...MODE_SECTIONS,
				MODE_PLAYBOOKS,
				MODE_ROUTES,
				skill("principles"),
			],
			after: [
				skill("mode"),
				...MODE_SECTIONS,
				MODE_ROUTES,
				skill("principles"),
			],
		},
		{
			name: "mode delegate or unclear role",
			entry: skill("mode"),
			before: [
				skill("mode"),
				...MODE_SECTIONS,
				MODE_PLAYBOOKS,
				MODE_ROUTES,
				skill("principles"),
			],
			after: [
				skill("mode"),
				...MODE_SECTIONS,
				MODE_PLAYBOOKS,
				MODE_ROUTES,
				skill("principles"),
			],
		},
		{
			name: "hardening engine, exit 0 of the CI pin check",
			entry: skill("pr-review-hardening"),
			before: [skill("pr-review-hardening")],
			after: [skill("pr-review-hardening")],
		},
		{
			name: "hardening engine, exit code other than 0",
			entry: skill("pr-review-hardening"),
			before: [skill("pr-review-hardening")],
			after: [
				skill("pr-review-hardening"),
				reference("pr-review-hardening", "ci-pins.md"),
			],
		},
		{
			name: "types, TypeScript rules",
			entry: skill("types"),
			before: [skill("types")],
			after: [skill("types")],
		},
		{
			name: "types, Swift",
			entry: skill("types"),
			before: [skill("types")],
			after: [skill("types"), reference("types", "swift.md")],
		},
		{
			name: "types, hook settings",
			entry: skill("types"),
			before: [skill("types")],
			after: [skill("types"), reference("types", "hook.md")],
		},
		{
			name: "write-docs, ADR",
			entry: skill("write-docs"),
			before: [skill("write-docs"), reference("write-docs", "adr.md")],
			after: [skill("write-docs"), reference("write-docs", "adr.md")],
		},
		{
			name: "write-docs, PR body or commit message",
			entry: skill("write-docs"),
			before: [skill("write-docs")],
			after: [skill("write-docs")],
		},
		{
			name: "control-ui, Playwright MCP",
			entry: skill("control-ui"),
			before: [skill("control-ui")],
			after: [skill("control-ui"), reference("control-ui", "playwright.md")],
		},
		{
			name: "control-ui, argent",
			entry: skill("control-ui"),
			before: [skill("control-ui")],
			after: [skill("control-ui"), reference("control-ui", "argent.md")],
		},
	];
}

function total(
	read: Reader,
	paths: readonly string[],
): { readonly measure: Measure; readonly files: number } | undefined {
	const texts = paths.map(read);
	if (texts.some((text) => text === undefined)) return undefined;
	const joined = texts.join("\n");
	return { measure: measure(joined), files: paths.length };
}

export function report(
	list: readonly Scenario[],
	current: Reader,
	base: Reader | undefined,
): readonly Row[] {
	return list.flatMap((scenario) => {
		const after = total(current, scenario.after);
		if (after === undefined) return [];
		const before =
			base === undefined ? undefined : total(base, scenario.before);
		return [
			{
				name: scenario.name,
				before: before?.measure,
				after: after.measure,
				files: { before: before?.files ?? 0, after: after.files },
			},
		];
	});
}

const LIMITS = [
	"Words are whitespace-delimited source words. Bytes are UTF-8 source bytes.",
	"These are source metrics. They are not prompt tokens, model calls, latency or cost.",
	"A read set lists the files that the instruction text points to for one path. It is not a trace of a real run.",
	"Host loading differs. Claude Code keeps an invoked skill in the conversation, and a host can keep only part of it after a compaction.",
	"`skillOverrides` does not control plugin skills. Use the diagnostics in docs/runbooks/skill-load-measurement.md.",
];

function format(
	rows: readonly Row[],
	parity: FallbackParity | undefined,
	problems: readonly string[],
	base: string,
): string {
	const cell = (value: Measure | undefined) =>
		value === undefined ? "n/a" : `${value.words} w / ${value.bytes} B`;
	const delta = (row: Row) =>
		row.before === undefined
			? "n/a"
			: `${row.after.words - row.before.words >= 0 ? "+" : ""}${row.after.words - row.before.words} w`;
	const table = rows.map(
		(row) =>
			`| ${row.name} | ${cell(row.before)} (${row.files.before} files) | ${cell(row.after)} (${row.files.after} files) | ${delta(row)} |`,
	);
	return [
		`Base revision: ${base}`,
		"",
		"| Read set | Before | After | Words |",
		"|---|---|---|---|",
		...table,
		"",
		parity === undefined
			? "Fallback parity: n/a (the base stub or the current fallback is unavailable)"
			: `Fallback parity: ${parity.identical ? "identical" : "DIFFERENT"} (${parity.onlyInOld.length} lines only in the base inline fallback, ${parity.onlyInNew.length} only in the current fallback)`,
		`Pointer problems: ${problems.length}`,
		...problems.map((problem) => `- ${problem}`),
		"",
		...LIMITS,
		"",
	].join("\n");
}

export function main(args: readonly string[]): number {
	const requested = valueAfter(args, "--base");
	if (requested === null) {
		console.error("--base needs a revision");
		return 2;
	}
	const base = requested ?? DEFAULT_BASE;
	const current = workingTree(ROOT);
	const baseRead = revisionExists(ROOT, base)
		? atRevision(ROOT, base)
		: undefined;
	const oldPlan = baseRead?.(skill("plan")) ?? "";
	const list = scenarios(oldPlan, baseRead ?? (() => undefined));
	const rows = report(list, current, baseRead);
	const problems = list.flatMap((scenario) =>
		pointerProblems(current, scenario),
	);
	const oldStub = baseRead?.(STUB);
	const newFallback = current(FALLBACK);
	const parity =
		oldStub === undefined || newFallback === undefined
			? undefined
			: fallbackParity(oldStub, newFallback);
	if (args.includes("--json"))
		console.log(
			JSON.stringify({ base, rows, parity, problems, limits: LIMITS }, null, 2),
		);
	else console.log(format(rows, parity, problems, base));
	return problems.length === 0 && (parity === undefined || parity.identical)
		? 0
		: 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
