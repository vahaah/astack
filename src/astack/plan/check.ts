import { basename, dirname, resolve } from "node:path";
import {
	bullets,
	DECISION_HEADER,
	fieldText,
	frontmatterValue,
	listValue,
	STEP_COLUMNS,
	sectionByTitle,
	stateOf,
	stepTable,
	stripPeriod,
} from "./parse.ts";
import { proseFindings } from "./prose.ts";
import {
	type CheckEnv,
	DECISION_KINDS,
	DEFAULT_OWNER_GATES,
	type DecisionRow,
	type Group,
	HANDLE,
	HOMES,
	INTEGRATOR_LANE,
	isOneOf,
	MILESTONE_STATES,
	type Milestone,
	type Plan,
	type PlanFinding,
	SESSION_STATES,
	type Session,
	type Severity,
	STATUSES,
	STEP_CHECKPOINTS,
	type Step,
	TIERS,
	type Tier,
	type TrailRow,
	type Unit,
} from "./types.ts";

export const PLAN_CAPS = {
	planWarnBytes: 24 * 1024,
	planWarnLines: 400,
	planDenyBytes: 32 * 1024,
	indexWarnLines: 250,
	indexLiveRows: 15,
	indexDenyBytes: 16 * 1024,
	intro: 5,
	bullets: 7,
	decisionRowChars: 400,
	sessionSteps: 12,
	stepsPerCheckpoint: 8,
	milestones: 8,
	staleDays: 45,
} as const;

export function denyBytes(tier: string | undefined): number {
	return tier === "programme"
		? PLAN_CAPS.indexDenyBytes
		: PLAN_CAPS.planDenyBytes;
}

export const GATES = [
	"foundational thinking",
	"subtract before you add",
	"sequence verifiable units",
	"outcome-oriented execution",
	"migrate callers then delete legacy APIs",
	"exhaust the design space",
	"prove it works",
	"attack the premise",
	"interrogate",
] as const;

export const SUBAGENT_GATES: readonly string[] = [
	"exhaust the design space",
	"interrogate",
];
const SUBAGENT_EVIDENCE = /^(?:agent|branch):\S/;

const FIXED_OWNER_GATES = DEFAULT_OWNER_GATES.filter(
	(gate) => gate !== "hosted migration",
);

const FRONTMATTER_KEYS = new Set([
	"plan",
	"tier",
	"status",
	"home",
	"tracker",
	"delegate",
	"checkpoints",
	"owner-gates",
	"execute",
	"reviewed",
	"programme",
	"block",
	"terms",
	"supersedes",
]);
const REQUIRED_KEYS = ["plan", "tier", "status", "reviewed"];

const SECTION_ORDER: Record<Tier, readonly string[]> = {
	standard: [
		"Context",
		"Goal",
		"Scope",
		"Decisions",
		"Sessions",
		"How each step runs",
		"Proof",
		"Premises",
		"Risks",
		"Gates",
		"Unresolved questions",
	],
	brief: [
		"Context",
		"Goal",
		"Scope",
		"Decisions",
		"Sessions",
		"How each step runs",
		"Proof",
		"Premises",
		"Risks",
		"Gates",
		"Unresolved questions",
	],
	programme: [
		"Context",
		"Goal",
		"Scope",
		"Lanes",
		"Decisions",
		"Milestones",
		"Not yet specified",
		"Premises",
		"Risks",
		"Gates",
		"Unresolved questions",
	],
};

const LEDGER_SECTION =
	/^(progress|log|status|changelog|history|updates|defects|hidden work|register|findings|spin-offs|follow-ups)\b/i;
export const REGISTER_COLUMN =
	/^(status|state|owner|assignee|found|found in|opened|closed|resolved|severity|priority|defect|bug|finding|hidden work)$/i;
export const CHECKBOX = /^\s*[-*+]\s+\[[ xX]\]/;
export const STATUS_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*)?status(?:\*\*)?\s*:/i;

const SUBJECTIVE =
	/\b(easy|easily|easier|clean|cleanly|cleaner|intuitive|intuitively|better|proper|properly|fast|faster|quick|quickly)\b/i;
const BUCKET_TITLE =
	/\b(misc|miscellaneous|follow-ups?|tidy-up|various|odds and ends)\b/i;
const ADR_CITE = /\bADR (\d{4}) D(\d+)\b/g;
const USER_ROUND = /^user R\d+$/;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const HEX_SHA = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/;
const OLD_CODE = /\b[GTQE]\d{1,3}\b/;
const PRINCIPLE_CITE = /\(principle[ -]([a-z0-9]+(?:-[a-z0-9]+)*)\)/g;
const DATE_FIELD = /^Target\.\s/;

export function normalizeGate(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9/]+/g, " ")
		.trim()
		.replace(/^principle /, "");
}

const GATE_KEYS = GATES.map(normalizeGate);

export function gateOf(text: string): string | undefined {
	const normalized = normalizeGate(text);
	return GATE_KEYS.find(
		(gate) => normalized === gate || normalized.startsWith(`${gate} `),
	);
}

export function planSlug(path: string): string {
	const name = basename(path).replace(/\.md$/i, "");
	return name === "index" ? basename(dirname(path)) : name;
}

export function daysBetween(from: string, to: string): number | undefined {
	const a = Date.parse(`${from}T00:00:00Z`);
	const b = Date.parse(`${to}T00:00:00Z`);
	if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
	return Math.round((b - a) / 86_400_000);
}

export function tierOf(plan: Pick<Plan, "frontmatter">): Tier {
	const tier = frontmatterValue(plan, "tier");
	return isOneOf(TIERS, tier) ? tier : "standard";
}

export function liveDecisionRows(plan: Plan): DecisionRow[] {
	return plan.decisions.rows.filter(
		(row) => HANDLE.decision.test(row.handle) && !row.supersededBy,
	);
}

export function laneOf(unit: Unit): string {
	return stripPeriod(unit.fields.get("Lane")?.value ?? "") || "main";
}

export function nowSessions(plan: Plan): Session[] {
	return plan.sessions.filter((session) => stateOf(session) === "now");
}

export function nowMilestone(plan: Plan): Milestone | undefined {
	return plan.milestones.find((milestone) => stateOf(milestone) === "now");
}

type Ctx = {
	readonly plan: Plan;
	readonly env: CheckEnv;
	readonly tier: Tier;
	readonly status: string | undefined;
	readonly live: readonly DecisionRow[];
	readonly handles: ReadonlySet<string>;
};

type Emit = (
	severity: Severity,
	group: Group,
	line: number,
	message: string,
) => void;

function collector(file: string): {
	emit: Emit;
	findings: PlanFinding[];
} {
	const findings: PlanFinding[] = [];
	return {
		findings,
		emit: (severity, group, line, message) =>
			findings.push({ file, line, severity, group, message }),
	};
}

function checkFrontmatter(ctx: Ctx, emit: Emit): void {
	const { plan, env } = ctx;
	const fm = plan.frontmatter;
	if (!fm.present) {
		emit(
			"error",
			"frontmatter",
			1,
			"no frontmatter; start from astack check-plan --template",
		);
		return;
	}
	for (const [key, field] of fm.fields)
		if (!FRONTMATTER_KEYS.has(key))
			emit(
				"error",
				"frontmatter",
				field.line,
				`unknown frontmatter key ${key}`,
			);
	for (const key of REQUIRED_KEYS)
		if (!fm.fields.get(key)?.value)
			emit("error", "frontmatter", 1, `frontmatter needs ${key}`);
	const field = (key: string) => fm.fields.get(key);
	const check = (
		key: string,
		allowed: readonly string[],
		message: string,
	): void => {
		const value = field(key);
		if (value?.value && !allowed.includes(value.value))
			emit(
				"error",
				"frontmatter",
				value.line,
				`${key} ${value.value} ${message}`,
			);
	};
	const slug = planSlug(plan.path);
	const planKey = field("plan");
	if (planKey?.value && planKey.value !== slug)
		emit(
			"error",
			"frontmatter",
			planKey.line,
			`plan is ${planKey.value} but the file slug is ${slug}`,
		);
	const tier = field("tier");
	if (tier?.value === "quick")
		emit(
			"error",
			"frontmatter",
			tier.line,
			"a quick plan has no file; keep it in chat or plan mode",
		);
	else check("tier", TIERS, "is not standard, programme or brief");
	check("status", STATUSES, "is not draft, active or paused");
	check("home", HOMES, "is not repo, linear or github");
	check("delegate", ["on", "off"], "is not on or off");
	check("checkpoints", ["report", "approve"], "is not report or approve");
	const home = field("home");
	if (home?.value && home.value !== "repo")
		emit(
			"warning",
			"frontmatter",
			home.line,
			`home is ${home.value}, so the tracker copy is the plan; run astack plan import before you edit this file`,
		);
	const gates = field("owner-gates");
	if (gates) {
		const listed = listValue(gates.value).map((gate) => gate.toLowerCase());
		for (const gate of FIXED_OWNER_GATES)
			if (!listed.some((item) => item.startsWith(gate)))
				emit(
					"error",
					"frontmatter",
					gates.line,
					`owner-gates drops ${gate}; it is a fixed owner gate`,
				);
		if (
			ctx.tier !== "programme" &&
			!listed.some((item) => item.startsWith("hosted migration"))
		)
			emit(
				"error",
				"frontmatter",
				gates.line,
				"only a programme can lift the hosted migration gate",
			);
	}
	const briefKeys = ["programme", "block"];
	for (const key of briefKeys) {
		const value = field(key);
		if (ctx.tier === "brief" && !value?.value)
			emit("error", "frontmatter", 1, `a brief needs ${key}`);
		if (ctx.tier !== "brief" && value)
			emit("error", "frontmatter", value.line, `only a brief carries ${key}`);
	}
	const block = field("block");
	if (block?.value && !HANDLE.block.test(block.value))
		emit(
			"error",
			"frontmatter",
			block.line,
			`block ${block.value} is not a B<nn> handle`,
		);
	checkExecute(ctx, emit);
	const reviewed = field("reviewed");
	if (reviewed?.value) {
		const age = daysBetween(reviewed.value, env.today);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewed.value) || age === undefined)
			emit(
				"error",
				"frontmatter",
				reviewed.line,
				`reviewed ${reviewed.value} is not a YYYY-MM-DD date`,
			);
		else if (ctx.status === "active" && age > PLAN_CAPS.staleDays)
			emit(
				"warning",
				"frontmatter",
				reviewed.line,
				`reviewed ${age} days ago; resume it with /astack:plan ${slug}`,
			);
	}
}

function checkExecute(ctx: Ctx, emit: Emit): void {
	const field = ctx.plan.frontmatter.fields.get("execute");
	const value = field?.value ?? "none";
	const line = field?.line ?? 1;
	if (value === "none") return;
	if (ctx.status === "draft")
		emit(
			"error",
			"frontmatter",
			line,
			"a draft plan has execute none; only an owner answer grants execution",
		);
	if (ctx.tier === "programme") {
		emit(
			"error",
			"frontmatter",
			line,
			"a programme index has execute none; each brief holds its own grant",
		);
		return;
	}
	const now = new Set(nowSessions(ctx.plan).map((session) => session.handle));
	for (const handle of handleListValue(value))
		if (!now.has(handle))
			emit(
				"error",
				"frontmatter",
				line,
				`execute names ${handle}, which is not a now session`,
			);
}

function handleListValue(value: string): string[] {
	return listValue(value).flatMap((item) => item.split(/\s+/));
}

function sectionsFor(tier: Tier): readonly string[] {
	return SECTION_ORDER[tier];
}

function checkShape(ctx: Ctx, emit: Emit): void {
	const { plan } = ctx;
	if (plan.titles.length !== 1)
		emit(
			"error",
			"shape",
			plan.titles[1]?.line ?? 1,
			`the plan has ${plan.titles.length} H1 titles; it needs exactly one`,
		);
	if (plan.intro.length > PLAN_CAPS.intro)
		emit(
			"error",
			"shape",
			plan.intro[0]?.n ?? 1,
			`the intro is ${plan.intro.length} lines; keep it to ${PLAN_CAPS.intro} and put facts under ## Context`,
		);
	const order = sectionsFor(ctx.tier);
	const seen = new Set<string>();
	let last = -1;
	for (const section of plan.sections) {
		const at = order.indexOf(section.title);
		if (at < 0) {
			emit(
				"error",
				"shape",
				section.line,
				LEDGER_SECTION.test(section.title)
					? `## ${section.title} is a ledger or a register; status and findings live in the tracker or the drafts file`
					: `## ${section.title} is not a ${ctx.tier} section; the order is ${order.join(", ")}`,
			);
			continue;
		}
		if (seen.has(section.title))
			emit("error", "shape", section.line, `## ${section.title} appears twice`);
		else if (at < last)
			emit(
				"error",
				"shape",
				section.line,
				`## ${section.title} is out of order; the order is ${order.join(", ")}`,
			);
		seen.add(section.title);
		last = Math.max(last, at);
	}
	const required = [
		"Goal",
		"Scope",
		"Decisions",
		...(ctx.tier === "programme"
			? ["Milestones", "Not yet specified"]
			: ["Sessions"]),
		...(ctx.tier !== "programme" && ctx.status === "active" ? ["Proof"] : []),
		"Unresolved questions",
	];
	for (const title of required)
		if (!seen.has(title)) emit("error", "shape", 1, `missing ## ${title}`);
	const open = sectionByTitle(plan, "Unresolved questions");
	const lastSection = plan.sections.at(-1);
	if (open && lastSection && lastSection !== open)
		emit(
			"error",
			"shape",
			lastSection.line,
			"## Unresolved questions comes last",
		);
	if (open && plan.questions.length === 0 && !isNone(open.body))
		emit(
			"error",
			"shape",
			open.line,
			"Unresolved questions lists numbered questions, or says None.",
		);
	const fog = sectionByTitle(plan, "Not yet specified");
	if (fog && bullets(fog).length === 0 && !isNone(fog.body))
		emit(
			"error",
			"shape",
			fog.line,
			"Not yet specified lists fog as bullets, or says None.",
		);
}

function isNone(body: readonly { readonly text: string }[]): boolean {
	return (
		body
			.map((line) => line.text)
			.join(" ")
			.trim() === "None."
	);
}

function subjective(
	emit: Emit,
	group: Group,
	line: number,
	text: string,
	where: string,
): void {
	const word = SUBJECTIVE.exec(text)?.[1];
	if (word && !/\d/.test(text))
		emit(
			"error",
			group,
			line,
			`${where} says "${word}" with no number; state a check that can fail`,
		);
}

function checkGoal(ctx: Ctx, emit: Emit): void {
	const section = sectionByTitle(ctx.plan, "Goal");
	if (section)
		for (const name of ["Goal", "Decision", "Done when"])
			if (!fieldText(ctx.plan.goal.get(name)))
				emit(
					"error",
					"goal",
					section.line,
					`## Goal needs a ${name}. line${name === "Decision" ? ", the one decision this work drives" : ""}`,
				);
	const done = ctx.plan.goal.get("Done when");
	if (done) subjective(emit, "goal", done.line, fieldText(done), "Done when");
	const scope = sectionByTitle(ctx.plan, "Scope");
	if (!scope) return;
	const items = bullets(scope);
	if (!items.some((item) => /^In\.\s+\S/.test(item.text)))
		emit("error", "goal", scope.line, "Scope has no In. bullet");
	if (!items.some((item) => /^Out\.\s+\S/.test(item.text)))
		emit("error", "goal", scope.line, "Scope has no Out. bullet");
}

function adrResolves(
	env: CheckEnv,
	number: string,
	decision: string,
): "ok" | "no-file" | "no-heading" {
	const dir = resolve(env.root, env.adrDir);
	const file = env
		.listDir(dir)
		.find(
			(name) =>
				name === `${number}.md` ||
				(name.startsWith(`${number}-`) && name.endsWith(".md")),
		);
	if (!file) return "no-file";
	const text = env.readFile(resolve(dir, file)) ?? "";
	return new RegExp(`^###\\s+D${decision}\\.`, "m").test(text)
		? "ok"
		: "no-heading";
}

function settledBy(plan: Plan): Map<string, number> {
	const settles = new Map<string, number>();
	for (const question of plan.questions)
		for (const handle of question.settles) settles.set(handle, question.line);
	return settles;
}

function checkDecisions(ctx: Ctx, emit: Emit): void {
	const { plan } = ctx;
	const section = sectionByTitle(plan, "Decisions");
	if (!section) return;
	const table = plan.decisions;
	if (table.headerLine === undefined) {
		if (!isNone(section.body))
			emit(
				"error",
				"decisions",
				section.line,
				`Decisions needs the table | ${DECISION_HEADER.join(" | ")} |, or None.`,
			);
		return;
	}
	if (table.header.join("|") !== DECISION_HEADER.join("|"))
		emit(
			"error",
			"decisions",
			table.headerLine,
			`the Decisions header is | ${DECISION_HEADER.join(" | ")} |`,
		);
	const settles = settledBy(plan);
	const handles = new Set<string>();
	for (const row of table.rows) {
		if (!HANDLE.decision.test(row.handle)) {
			emit(
				"error",
				"decisions",
				row.line,
				`a decision row starts with its D<n> handle, not "${row.handle}"`,
			);
			continue;
		}
		if (handles.has(row.handle))
			emit(
				"error",
				"decisions",
				row.line,
				`${row.handle} appears twice; handles are never reused`,
			);
		handles.add(row.handle);
	}
	for (const row of table.rows) {
		if (!HANDLE.decision.test(row.handle)) continue;
		checkDecisionRow(ctx, emit, row, handles, settles);
	}
	for (const [handle, line] of settles)
		if (!handles.has(handle))
			emit(
				"error",
				"decisions",
				line,
				`Settles. ${handle} names no decision row`,
			);
	if (ctx.tier === "programme" && ctx.live.length > PLAN_CAPS.indexLiveRows)
		emit(
			"warning",
			"decisions",
			table.headerLine,
			`${ctx.live.length} live decisions in the index; graduate settled rows to ADRs or move them to briefs to stay at ${PLAN_CAPS.indexLiveRows}`,
		);
}

function checkDecisionRow(
	ctx: Ctx,
	emit: Emit,
	row: DecisionRow,
	handles: ReadonlySet<string>,
	settles: ReadonlyMap<string, number>,
): void {
	const h = row.handle;
	if (row.cells.length !== DECISION_HEADER.length)
		emit(
			"error",
			"decisions",
			row.line,
			`${h} has ${row.cells.length} cells; the table has ${DECISION_HEADER.length}`,
		);
	if (row.supersededBy) {
		if (!handles.has(row.supersededBy) || row.supersededBy === h)
			emit(
				"error",
				"decisions",
				row.line,
				`${h} is superseded by ${row.supersededBy}, which is not another row`,
			);
		if (row.cells.some((cell, i) => i !== 0 && i !== 2 && cell !== ""))
			emit(
				"error",
				"decisions",
				row.line,
				`superseded ${h} keeps only | ${h} | | Superseded by ${row.supersededBy} | | | | |`,
			);
		return;
	}
	if (!isOneOf(DECISION_KINDS, row.kind))
		emit(
			"error",
			"decisions",
			row.line,
			`${h} kind is "${row.kind}"; use ${DECISION_KINDS.join(", ")}`,
		);
	if (!row.decision)
		emit("error", "decisions", row.line, `${h} has no decision text`);
	if (row.door !== "one-way" && row.door !== "two-way")
		emit(
			"error",
			"decisions",
			row.line,
			`${h} door is "${row.door}"; use one-way or two-way`,
		);
	if (row.door === "one-way" && !row.rejected)
		emit(
			"error",
			"decisions",
			row.line,
			`${h} is a one-way door; name the rejected option and why it lost`,
		);
	const settled = row.settled;
	if (
		!USER_ROUND.test(settled) &&
		!["delegated", "evidence", "default"].includes(settled)
	)
		emit(
			"error",
			"decisions",
			row.line,
			`${h} settled is "${settled}"; use user R<n>, delegated, evidence or default`,
		);
	if (!row.record)
		emit(
			"error",
			"decisions",
			row.line,
			`${h} has no Record; write plan, an ADR cite, a ticket or a pointer`,
		);
	else if (settled === "evidence" && row.record === "plan")
		emit(
			"error",
			"decisions",
			row.line,
			`${h} is settled by evidence; Record points at the prototype, the arena result or the research branch`,
		);
	if (settled === "default" && !settles.has(h))
		emit(
			"error",
			"decisions",
			row.line,
			`${h} is a default; an unresolved question must say Settles. ${h}.`,
		);
	if (
		row.door === "one-way" &&
		!/\bADR \d{4} D\d+\b/.test(row.record) &&
		!settles.has(h)
	)
		emit(
			"error",
			"decisions",
			row.line,
			`${h} is a one-way door; cite its ADR in Record or ask a question that says Settles. ${h}.`,
		);
	if (ctx.status === "active" && settled === "default")
		emit(
			"error",
			"gates",
			row.line,
			`${h} is still a default; ratify it in a round before active`,
		);
	const length = `${row.decision} ${row.rejected}`.length;
	if (length > PLAN_CAPS.decisionRowChars)
		emit(
			"warning",
			"decisions",
			row.line,
			`${h} runs ${length} characters; keep a row near 300 and move detail to an ADR or the step`,
		);
}

const SESSION_FIELDS: Record<
	string,
	{ readonly required: readonly string[]; readonly optional: readonly string[] }
> = {
	now: {
		required: ["State", "Depends on", "Exit", "Proof"],
		optional: ["Ticket", "Branch", "Lane", "Baseline"],
	},
	next: {
		required: ["State", "Depends on", "Exit", "Proof"],
		optional: ["Ticket", "Branch", "Lane", "Baseline"],
	},
	later: {
		required: ["State"],
		optional: ["Depends on", "Exit", "Proof", "Fog", "Lane", "Ticket"],
	},
	done: { required: ["State"], optional: ["Ticket", "Lane"] },
};

const MILESTONE_FIELDS: Record<
	string,
	{ readonly required: readonly string[]; readonly optional: readonly string[] }
> = {
	now: {
		required: ["State", "Demo", "Proof", "Blocks"],
		optional: ["Depends on", "Target", "Ticket"],
	},
	next: {
		required: ["State", "Demo", "Proof"],
		optional: ["Depends on", "Target", "Ticket", "Blocks", "Fog"],
	},
	later: {
		required: ["State", "Demo"],
		optional: ["Depends on", "Target", "Ticket", "Blocks", "Fog", "Proof"],
	},
	exited: { required: ["State"], optional: ["Ticket", "Demo"] },
};

function checkFieldSet(
	emit: Emit,
	group: Group,
	unit: Unit,
	kind: string,
	set: {
		readonly required: readonly string[];
		readonly optional: readonly string[];
	},
): void {
	const name = unit.handle ?? unit.title;
	for (const field of set.required) {
		const value = unit.fields.get(field);
		if (!value || (!value.value && value.bullets.length === 0))
			emit("error", group, unit.line, `${name}: a ${kind} needs ${field}.`);
	}
	for (const [field, value] of unit.fields)
		if (!set.required.includes(field) && !set.optional.includes(field))
			emit(
				"error",
				group,
				value.line,
				`${name}: a ${kind} carries no ${field}.`,
			);
	for (const field of unit.duplicates)
		emit("error", group, field.line, `${name}: ${field.name}. appears twice`);
	for (const line of unit.stray)
		emit(
			"error",
			group,
			line.n,
			`${name}: "${line.text.trim().slice(0, 40)}" is not a field line`,
		);
}

function checkExit(
	emit: Emit,
	group: Group,
	unit: Unit,
	strict: boolean,
): void {
	const exit = unit.fields.get("Exit");
	if (!exit) return;
	const name = unit.handle ?? unit.title;
	const count = exit.bullets.length + (exit.value ? 1 : 0);
	if (strict && (exit.value || count < 1 || count > PLAN_CAPS.bullets))
		emit(
			"error",
			group,
			exit.line,
			`${name}: Exit holds 1 to ${PLAN_CAPS.bullets} bullets`,
		);
	else if (count > PLAN_CAPS.bullets)
		emit(
			"error",
			group,
			exit.line,
			`${name}: Exit holds at most ${PLAN_CAPS.bullets} lines`,
		);
	for (const bullet of exit.bullets)
		subjective(emit, group, bullet.line, bullet.text, `${name} Exit`);
	if (exit.value)
		subjective(emit, group, exit.line, exit.value, `${name} Exit`);
}

function checkProof(emit: Emit, group: Group, unit: Unit): void {
	const proof = unit.fields.get("Proof");
	if (proof && !/`[^`]+`/.test(fieldText(proof)))
		emit(
			"error",
			group,
			proof.line,
			`${unit.handle ?? unit.title}: Proof names a command in backticks`,
		);
	const baseline = unit.fields.get("Baseline");
	if (baseline && !/\d/.test(fieldText(baseline)))
		emit(
			"error",
			group,
			baseline.line,
			`${unit.handle ?? unit.title}: Baseline holds the number Proof prints on trunk today`,
		);
}

function checkSessions(ctx: Ctx, emit: Emit): void {
	const { plan } = ctx;
	const block = frontmatterValue(plan, "block");
	const seen = new Set<string>();
	const titles = new Set<string>();
	const perLane = new Map<string, { now: number; next: number }>();
	plan.sessions.forEach((session, index) => {
		const name = session.handle ?? session.title;
		if (!session.handle)
			emit(
				"error",
				"sessions",
				session.line,
				`session "${session.title}" starts with its handle, ${ctx.tier === "brief" ? `${block ?? "B<nn>"}/S<n>` : "S<n>"}`,
			);
		else if (ctx.tier === "brief" && !session.handle.startsWith(`${block}/`))
			emit(
				"error",
				"sessions",
				session.line,
				`${session.handle} belongs to another block; this brief is ${block}`,
			);
		else if (ctx.tier === "standard" && session.handle.includes("/"))
			emit(
				"error",
				"sessions",
				session.line,
				`${session.handle} is a programme handle; a standard plan uses S<n>`,
			);
		if (session.handle && seen.has(session.handle))
			emit(
				"error",
				"sessions",
				session.line,
				`${session.handle} appears twice`,
			);
		if (session.handle) seen.add(session.handle);
		if (!session.title)
			emit(
				"error",
				"sessions",
				session.line,
				`${name}: the heading says what becomes true after its PR`,
			);
		if (titles.has(session.title.toLowerCase()))
			emit("error", "sessions", session.line, `${name}: title appears twice`);
		titles.add(session.title.toLowerCase());
		const state = stateOf(session);
		if (!isOneOf(SESSION_STATES, state)) {
			emit(
				"error",
				"sessions",
				session.fields.get("State")?.line ?? session.line,
				`${name}: State is done, now, next or later`,
			);
			return;
		}
		const set = SESSION_FIELDS[state];
		if (set) checkFieldSet(emit, "sessions", session, `${state} session`, set);
		const lane = laneOf(session);
		const count = perLane.get(lane) ?? { now: 0, next: 0 };
		if (state === "now") count.now++;
		if (state === "next") count.next++;
		perLane.set(lane, count);
		if (state === "done") return;
		checkDependsOn(ctx, emit, session, index);
		checkExit(emit, "sessions", session, state === "now" || state === "next");
		checkProof(emit, "sessions", session);
		if (state === "now" && session.steps.length === 0)
			emit(
				"error",
				"steps",
				session.line,
				`${name}: a now session lists its steps in a table with the columns ${STEP_COLUMNS.join(", ")}`,
			);
		checkSteps(ctx, emit, session);
	});
	for (const [lane, count] of perLane) {
		const where = lane === "main" ? "" : ` in lane ${lane}`;
		if (count.now > 1)
			emit(
				"error",
				"sessions",
				1,
				`${count.now} sessions are now${where}; keep one now session per lane`,
			);
		if (count.next > 1)
			emit(
				"error",
				"sessions",
				1,
				`${count.next} sessions are next${where}; keep at most one per lane`,
			);
	}
	if (
		ctx.tier !== "programme" &&
		ctx.status === "active" &&
		nowSessions(plan).length === 0
	)
		emit(
			"error",
			"sessions",
			sectionByTitle(plan, "Sessions")?.line ?? 1,
			"an active plan has a now session",
		);
}

function checkDependsOn(
	ctx: Ctx,
	emit: Emit,
	session: Session,
	index: number,
): void {
	const field = session.fields.get("Depends on");
	if (!field) return;
	const value = fieldText(field);
	if (/^none\.?$/i.test(value)) return;
	const earlier = new Set(
		ctx.plan.sessions.slice(0, index).flatMap((other) => other.handle ?? []),
	);
	const name = session.handle ?? session.title;
	for (const handle of value
		.replace(/\.$/, "")
		.split(/\s*(?:,|\band\b)\s*/)
		.map((item) => item.trim().split(/\s+/)[0] ?? "")) {
		if (!HANDLE.session.test(handle)) {
			emit(
				"error",
				"sessions",
				field.line,
				`${name}: Depends on lists session handles or None.`,
			);
			return;
		}
		const local =
			ctx.tier === "standard" ||
			handle.startsWith(`${frontmatterValue(ctx.plan, "block")}/`);
		if (handle === session.handle)
			emit("error", "sessions", field.line, `${name}: depends on itself`);
		else if (local && !earlier.has(handle))
			emit(
				"error",
				"sessions",
				field.line,
				`${name}: depends on ${handle}, which is not an earlier session in this plan`,
			);
	}
}

function overlaps(a: string, b: string): boolean {
	const [pathA = "", regionA] = a.split("#");
	const [pathB = "", regionB] = b.split("#");
	if (pathA.endsWith("/") && pathB.startsWith(pathA)) return true;
	if (pathB.endsWith("/") && pathA.startsWith(pathB)) return true;
	if (pathA !== pathB) return false;
	return !regionA || !regionB || regionA === regionB;
}

function checkSteps(ctx: Ctx, emit: Emit, session: Session): void {
	const name = session.handle ?? session.title;
	const table = stepTable(session);
	if (!table) return;
	const known: readonly string[] = STEP_COLUMNS.map((column) =>
		column.toLowerCase(),
	);
	for (const cell of table.header) {
		const column = cell.trim().toLowerCase();
		if (REGISTER_COLUMN.test(column))
			emit(
				"error",
				"ledger",
				table.line,
				`${name}: the steps table has a ${cell} column; status lives in the tracker`,
			);
		else if (!known.includes(column))
			emit(
				"error",
				"steps",
				table.line,
				`${name}: the steps table has no ${cell} column; use ${STEP_COLUMNS.join(", ")}`,
			);
	}
	for (const column of ["#", "step", "exit"])
		if (!table.header.some((cell) => cell.trim().toLowerCase() === column))
			emit(
				"error",
				"steps",
				table.line,
				`${name}: the steps table needs a ${column === "#" ? "#" : column[0]?.toUpperCase() + column.slice(1)} column`,
			);
	const ids = new Set<string>();
	let lastWave = 0;
	for (const step of session.steps) {
		const label = `${name} step ${step.id || "?"}`;
		if (!HANDLE.step.test(step.id))
			emit(
				"error",
				"steps",
				step.line,
				`${label}: # is a step number such as 3 or 3a`,
			);
		if (ids.has(step.id))
			emit("error", "steps", step.line, `${label}: the number appears twice`);
		ids.add(step.id);
		if (!step.title)
			emit(
				"error",
				"steps",
				step.line,
				`${label}: name the step with a verb phrase`,
			);
		if (BUCKET_TITLE.test(step.title))
			emit(
				"error",
				"steps",
				step.line,
				`${label}: "${step.title}" is a grab bag; name what the step changes`,
			);
		if (!step.exit)
			emit("error", "steps", step.line, `${label}: a step needs an Exit check`);
		subjective(emit, "steps", step.line, step.exit, `${label} Exit`);
		if (step.wave && !HANDLE.wave.test(step.wave))
			emit("error", "steps", step.line, `${label}: Wave is W<n>`);
		const wave = Number(step.wave.slice(1) || "1");
		if (wave < lastWave)
			emit(
				"warning",
				"steps",
				step.line,
				`${label}: W${wave} comes after W${lastWave}; list steps in wave order, because the integrator lands them in plan order`,
			);
		lastWave = Math.max(lastWave, wave);
		if (step.lane && !HANDLE.lane.test(step.lane))
			emit("error", "steps", step.line, `${label}: Lane is a lowercase label`);
		for (const handle of step.covers)
			if (!ctx.handles.has(handle))
				emit(
					"error",
					"steps",
					step.line,
					`${label}: Covers names ${handle}, which is not a live decision`,
				);
		if (step.checkpoint && !STEP_CHECKPOINTS.includes(step.checkpoint))
			emit(
				"error",
				"steps",
				step.line,
				`${label}: Checkpoint is report, approve ui or approve one-way; approve only UI taste and one-way doors`,
			);
		if (step.proof && !/`[^`]+`/.test(step.proof))
			emit(
				"error",
				"steps",
				step.line,
				`${label}: Proof is a command in backticks`,
			);
	}
	checkHotFiles(emit, session);
	if (session.steps.length > PLAN_CAPS.sessionSteps)
		emit(
			"note",
			"steps",
			session.line,
			`${name} has ${session.steps.length} steps. Past ${PLAN_CAPS.sessionSteps} the session runs long. Keep it as one session, and split it only on an owner call`,
		);
	const waves = new Set(session.steps.map((step) => step.wave || "W1"));
	if (session.steps.length > PLAN_CAPS.stepsPerCheckpoint && waves.size < 2)
		emit(
			"warning",
			"steps",
			session.line,
			`${name} has ${session.steps.length} steps in one wave; label waves so a checkpoint comes once per wave`,
		);
}

function checkHotFiles(emit: Emit, session: Session): void {
	const name = session.handle ?? session.title;
	const byWave = new Map<string, Step[]>();
	for (const step of session.steps) {
		const wave = step.wave || "W1";
		byWave.set(wave, [...(byWave.get(wave) ?? []), step]);
	}
	for (const [wave, group] of byWave) {
		if (group.length < 2) continue;
		for (const step of group)
			if (step.files.length === 0 && step.lane !== INTEGRATOR_LANE)
				emit(
					"warning",
					"steps",
					step.line,
					`${name} step ${step.id}: list its Files, so the checker keeps one editor per region in ${wave}`,
				);
		group.forEach((step, i) => {
			for (const other of group.slice(i + 1)) {
				if (step.lane === INTEGRATOR_LANE && other.lane === INTEGRATOR_LANE)
					continue;
				const shared = step.files.find((file) =>
					other.files.some((candidate) => overlaps(file, candidate)),
				);
				if (shared)
					emit(
						"error",
						"steps",
						other.line,
						`${name} steps ${step.id} and ${other.id} both edit ${shared} in ${wave}; one editor per hot-file region per wave, so move one to another wave`,
					);
			}
		});
	}
}

function checkMilestones(ctx: Ctx, emit: Emit): void {
	const { plan, env } = ctx;
	const live = plan.milestones.filter((m) => stateOf(m) !== "exited");
	if (live.length > PLAN_CAPS.milestones)
		emit(
			"error",
			"milestones",
			live[PLAN_CAPS.milestones]?.line ?? 1,
			`${live.length} live milestones; a programme holds ${PLAN_CAPS.milestones}`,
		);
	const handles = new Set<string>();
	const blocks = new Map<string, number>();
	let now = 0;
	plan.milestones.forEach((milestone, index) => {
		const name = milestone.handle ?? milestone.title;
		if (!milestone.handle)
			emit(
				"error",
				"milestones",
				milestone.line,
				`milestone "${milestone.title}" starts with its M<n> handle`,
			);
		else if (handles.has(milestone.handle))
			emit("error", "milestones", milestone.line, `${name} appears twice`);
		if (milestone.handle) handles.add(milestone.handle);
		const state = stateOf(milestone);
		if (!isOneOf(MILESTONE_STATES, state)) {
			emit(
				"error",
				"milestones",
				milestone.fields.get("State")?.line ?? milestone.line,
				`${name}: State is exited, now, next or later`,
			);
			return;
		}
		if (state === "now") now++;
		const set = MILESTONE_FIELDS[state];
		if (set)
			checkFieldSet(emit, "milestones", milestone, `${state} milestone`, set);
		checkProof(emit, "milestones", milestone);
		const target = milestone.fields.get("Target");
		if (target && !/^\d{4}-\d{2}-\d{2}\.?$/.test(target.value))
			emit(
				"error",
				"milestones",
				target.line,
				`${name}: Target is a YYYY-MM-DD date`,
			);
		const depends = fieldText(milestone.fields.get("Depends on"));
		const earlier = plan.milestones.slice(0, index).map((m) => m.handle);
		if (depends && !/^none\.?$/i.test(depends))
			for (const handle of depends.replace(/\.$/, "").split(/\s*,\s*/))
				if (!earlier.includes(handle.trim()))
					emit(
						"error",
						"milestones",
						milestone.fields.get("Depends on")?.line ?? milestone.line,
						`${name}: depends on ${handle.trim()}, which is not an earlier milestone`,
					);
		const blockField = milestone.fields.get("Blocks");
		if (blockField && milestone.blocks.length !== blockField.bullets.length)
			emit(
				"error",
				"milestones",
				blockField.line,
				`${name}: each Blocks bullet reads B<nn> <outcome>. Lane. <x>. Depends on. <B handles>. Brief. <file|stub|done>.`,
			);
		for (const block of milestone.blocks) {
			if (blocks.has(block.handle))
				emit(
					"error",
					"milestones",
					block.line,
					`${block.handle} appears twice`,
				);
			blocks.set(block.handle, block.line);
			const lanes = plan.lanes.map((lane) => lane.name);
			if (block.lane && lanes.length > 0 && !lanes.includes(block.lane))
				emit(
					"error",
					"milestones",
					block.line,
					`${block.handle}: lane ${block.lane} is not under ## Lanes`,
				);
			const brief = block.brief ?? "stub";
			if (!["stub", "done"].includes(brief)) {
				const path = resolve(
					dirname(resolve(env.root, plan.path)),
					brief.replace(/`/g, ""),
				);
				if (!env.exists(path))
					emit(
						"error",
						"milestones",
						block.line,
						`${block.handle}: brief ${brief} does not exist; write it, or say Brief. stub`,
					);
			}
		}
	});
	for (const milestone of plan.milestones)
		for (const block of milestone.blocks)
			for (const handle of block.dependsOn)
				if (!blocks.has(handle))
					emit(
						"error",
						"milestones",
						block.line,
						`${block.handle}: depends on ${handle}, which is not a block in this index`,
					);
	if (now > 1)
		emit("error", "milestones", 1, `${now} milestones are now; keep one`);
	if (ctx.status === "active" && now === 0)
		emit(
			"error",
			"milestones",
			sectionByTitle(plan, "Milestones")?.line ?? 1,
			"an active programme has one now milestone",
		);
}

function checkQuestions(ctx: Ctx, emit: Emit): void {
	const { plan } = ctx;
	const sessions = new Set(plan.sessions.flatMap((s) => s.handle ?? []));
	const now = new Set(nowSessions(plan).flatMap((s) => s.handle ?? []));
	const units = new Set([
		...sessions,
		...plan.milestones.flatMap((m) => m.handle ?? []),
		...plan.milestones.flatMap((m) => m.blocks.map((b) => b.handle)),
	]);
	plan.questions.forEach((question, index) => {
		if (question.number !== index + 1)
			emit(
				"error",
				"shape",
				question.line,
				`question ${question.number} is out of sequence; number them from 1`,
			);
		for (const handle of question.blocks) {
			if (ctx.tier !== "brief" && !units.has(handle))
				emit(
					"error",
					"shape",
					question.line,
					`Blocks. ${handle} names no unit in this plan`,
				);
			if (ctx.status === "active" && now.has(handle))
				emit(
					"error",
					"gates",
					question.line,
					`question ${question.number} blocks the now session ${handle}`,
				);
		}
		for (const handle of question.binds)
			if (!HANDLE.session.test(handle) && !HANDLE.block.test(handle))
				emit(
					"error",
					"shape",
					question.line,
					`Binds. ${handle} is not a block or session handle`,
				);
	});
}

function checkGates(ctx: Ctx, emit: Emit): void {
	const { plan, env } = ctx;
	const lines = new Map<string, number>();
	for (const item of plan.gates) {
		const match = /^(.+?)\.\s+(fail|n\/a|waived)\.\s+(.+)$/i.exec(item.text);
		const gate = match ? gateOf(match[1] ?? "") : undefined;
		if (!match || !gate) {
			emit(
				"error",
				"gates",
				item.line,
				`a Gates line reads "<gate>. fail|n/a|waived. <reason>" for one of ${GATES.join(", ")}`,
			);
			continue;
		}
		lines.set(gate, item.line);
		const verdict = (match[2] ?? "").toLowerCase();
		if (verdict === "waived" && !/\buser R\d+\b/.test(match[3] ?? ""))
			emit(
				"error",
				"gates",
				item.line,
				`the ${gate} waiver cites the user R<n> that granted it`,
			);
		if (verdict === "fail" && ctx.status === "active")
			emit(
				"error",
				"gates",
				item.line,
				`the ${gate} gate failed; an active plan has no failed gate`,
			);
	}
	if (ctx.status !== "active" || !env.trail || ctx.tier === "programme") return;
	const passed = new Set<string>();
	const bySubagent = new Set<string>();
	for (const row of env.trail) {
		if (row.phase !== "gate") continue;
		const gate = gateOf(row.decision);
		if (!gate) continue;
		passed.add(gate);
		if (SUBAGENT_EVIDENCE.test(row.evidence.trim())) bySubagent.add(gate);
	}
	GATES.forEach((gate, index) => {
		const key = GATE_KEYS[index] ?? "";
		if (!passed.has(key) && !lines.has(key))
			emit(
				"error",
				"gates",
				1,
				`gate ${gate} has no trail row and no Gates line`,
			);
		else if (
			SUBAGENT_GATES.includes(gate) &&
			!lines.has(key) &&
			!bySubagent.has(key)
		)
			emit(
				"error",
				"gates",
				1,
				`gate ${gate} passed without a subagent; its trail evidence is agent:<id or report> or branch:<sketch branch>`,
			);
	});
}

function allowedTable(ctx: Ctx, line: number): boolean {
	if (ctx.plan.decisions.headerLine === line) return true;
	return ctx.plan.sessions.some((session) => stepTable(session)?.line === line);
}

function checkLedger(ctx: Ctx, emit: Emit): void {
	const { plan } = ctx;
	const lineCount =
		plan.text.split(/\r?\n/).length - (plan.text.endsWith("\n") ? 1 : 0);
	const bytes = Buffer.byteLength(plan.text, "utf8");
	const index = ctx.tier === "programme";
	const warnLines = index ? PLAN_CAPS.indexWarnLines : PLAN_CAPS.planWarnLines;
	const what = index ? "a programme index" : `a ${ctx.tier} plan`;
	if (bytes > denyBytes(ctx.tier))
		emit(
			"error",
			"ledger",
			1,
			`${bytes} bytes; ${what} stops at ${denyBytes(ctx.tier)}. Graduate decisions to ADRs, collapse done sessions, or split blocks into briefs`,
		);
	else if (!index && bytes > PLAN_CAPS.planWarnBytes)
		emit(
			"note",
			"ledger",
			1,
			`${bytes} bytes, more than the ${PLAN_CAPS.planWarnBytes} bytes of ${what}. Move file:line detail into the step hand-in`,
		);
	if (lineCount > warnLines)
		emit(
			"note",
			"ledger",
			warnLines + 1,
			`${lineCount} lines, more than the ${warnLines} lines of ${what}`,
		);
	const recordLines = new Map(
		plan.decisions.rows.map((row) => [row.line, row]),
	);
	const tableHeaders = new Set<number>();
	for (const section of plan.sections)
		for (const line of section.body) {
			if (line.code || !line.text.trim().startsWith("|")) continue;
			const previous = section.body.find((other) => other.n === line.n - 1);
			if (!previous?.text.trim().startsWith("|")) tableHeaders.add(line.n);
		}
	for (const line of plan.lines) {
		if (line.code) continue;
		if (CHECKBOX.test(line.text))
			emit(
				"error",
				"ledger",
				line.n,
				"a checkbox; progress lives in the tracker, and Exit uses plain bullets",
			);
		if (STATUS_LINE.test(line.text))
			emit(
				"error",
				"ledger",
				line.n,
				"a Status: line; status lives in the tracker",
			);
		if (
			tableHeaders.has(line.n) &&
			!allowedTable(ctx, line.n) &&
			isRegisterHeader(line.text)
		)
			emit(
				"error",
				"ledger",
				line.n,
				"a register table; defects and hidden work go in the PR body or the drafts file, or become issues in a programme",
			);
		const row = recordLines.get(line.n);
		const text = row ? row.cells.slice(0, 6).join(" | ") : line.text;
		if (ISO_DATE.test(text) && !DATE_FIELD.test(line.text))
			emit(
				"warning",
				"ledger",
				line.n,
				"a date outside frontmatter; dates belong in the tracker or the commit",
			);
		if (HEX_SHA.test(text))
			emit(
				"warning",
				"ledger",
				line.n,
				"a commit SHA; point at a branch, a ticket or an ADR instead",
			);
		const code = OLD_CODE.exec(text.replace(/`[^`]*`/g, " "))?.[0];
		if (code)
			emit(
				"warning",
				"ledger",
				line.n,
				`${code} reads like a typed ID; use one D<n> family with a Kind`,
			);
	}
}

export function isRegisterHeader(text: string): boolean {
	return text
		.split("|")
		.map((cell) => cell.trim())
		.some((cell) => REGISTER_COLUMN.test(cell));
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkProse(ctx: Ctx, emit: Emit): void {
	for (const finding of proseFindings(ctx.plan.lines))
		emit(finding.severity, finding.group, finding.line, finding.message);
	const avoid = [...(ctx.env.glossary?.avoid ?? new Map<string, string>())].map(
		([word, term]) => ({
			word,
			term,
			pattern: new RegExp(`\\b${escapeRegExp(word)}\\b`, "i"),
		}),
	);
	for (const line of ctx.plan.lines) {
		if (line.code) continue;
		for (const entry of avoid)
			if (entry.pattern.test(line.text.replace(/`[^`]*`/g, " ")))
				emit(
					"warning",
					"prose",
					line.n,
					`"${entry.word}" is on the glossary's avoid list; say ${entry.term}`,
				);
	}
	if (!ctx.env.principles) return;
	for (const question of ctx.plan.questions)
		for (const match of question.text.matchAll(PRINCIPLE_CITE))
			if (!ctx.env.principles.has(match[1] ?? ""))
				emit(
					"warning",
					"prose",
					question.line,
					`principle ${match[1]} is not one of pstack's principle skills; cite a principle-* skill without the prefix`,
				);
}

function checkLinks(ctx: Ctx, emit: Emit): void {
	const { plan, env } = ctx;
	const planDir = dirname(resolve(env.root, plan.path));
	for (const line of plan.lines) {
		if (line.code) continue;
		for (const match of line.text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
			const target = match[1] ?? "";
			if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#"))
				continue;
			const path = decodeURI(target.replace(/[#?].*$/, ""));
			if (path && !env.exists(resolve(planDir, path)))
				emit("error", "links", line.n, `link target ${path} does not exist`);
		}
		for (const match of line.text.matchAll(ADR_CITE)) {
			const [cite, number = "", decision = ""] = match;
			const found = adrResolves(env, number, decision);
			if (found === "no-file")
				emit(
					"error",
					"links",
					line.n,
					`${cite}: no ADR ${number} under ${env.adrDir}`,
				);
			else if (found === "no-heading")
				emit(
					"error",
					"links",
					line.n,
					`${cite}: ADR ${number} has no ### D${decision}. heading`,
				);
		}
	}
	const terms = listValue(frontmatterValue(plan, "terms") ?? "");
	const line = plan.frontmatter.fields.get("terms")?.line ?? 1;
	if (terms.length > 0 && !env.glossary)
		emit(
			"error",
			"links",
			line,
			"terms are listed but the repo has no glossary (CONTEXT.md or GLOSSARY.md)",
		);
	for (const term of terms)
		if (env.glossary && !env.glossary.terms.has(term.toLowerCase()))
			emit(
				"error",
				"links",
				line,
				`term ${term} is not a bold term in ${env.glossary.paths.join(", ")}`,
			);
}

export function checkPlan(plan: Plan, env: CheckEnv): PlanFinding[] {
	const live = liveDecisionRows(plan);
	const ctx: Ctx = {
		plan,
		env,
		tier: tierOf(plan),
		status: frontmatterValue(plan, "status"),
		live,
		handles: new Set(live.map((row) => row.handle)),
	};
	const { emit, findings } = collector(plan.path);
	checkFrontmatter(ctx, emit);
	checkShape(ctx, emit);
	checkGoal(ctx, emit);
	checkDecisions(ctx, emit);
	if (ctx.tier === "programme") checkMilestones(ctx, emit);
	else checkSessions(ctx, emit);
	checkQuestions(ctx, emit);
	checkGates(ctx, emit);
	checkLedger(ctx, emit);
	checkProse(ctx, emit);
	checkLinks(ctx, emit);
	return findings.sort((a, b) => a.line - b.line);
}

function normalizeText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function decisionNumber(handle: string): number {
	return Number(handle.slice(1));
}

export function checkAgainstBase(
	head: Plan,
	base: Plan,
	env: CheckEnv,
): PlanFinding[] {
	const { emit, findings } = collector(head.path);
	const headRows = new Map(
		head.decisions.rows
			.filter((row) => HANDLE.decision.test(row.handle))
			.map((row) => [row.handle, row]),
	);
	const baseHandles = base.decisions.rows
		.map((row) => row.handle)
		.filter((handle) => HANDLE.decision.test(handle));
	const maxBase = Math.max(0, ...baseHandles.map(decisionNumber));
	const headStates = new Map(head.sessions.map((s) => [s.handle, stateOf(s)]));
	const closed = base.sessions.some(
		(s) => stateOf(s) !== "done" && headStates.get(s.handle) === "done",
	);
	const headerLine =
		head.decisions.headerLine ?? sectionByTitle(head, "Decisions")?.line ?? 1;
	for (const row of base.decisions.rows) {
		if (!HANDLE.decision.test(row.handle)) continue;
		const now = headRows.get(row.handle);
		if (!now) {
			const adr = [...row.record.matchAll(ADR_CITE)].some(
				([, number = "", decision = ""]) =>
					adrResolves(env, number, decision) === "ok",
			);
			if (!adr && !closed)
				emit(
					"error",
					"base",
					headerLine,
					`${row.handle} disappeared; supersede it, or graduate it to an ADR or with a session that closed`,
				);
			continue;
		}
		if (row.supersededBy && !now.supersededBy)
			emit(
				"error",
				"base",
				now.line,
				`${row.handle} was superseded at the base and is live again; handles are never reused`,
			);
		else if (
			USER_ROUND.test(row.settled) &&
			!now.supersededBy &&
			normalizeText(now.decision) !== normalizeText(row.decision)
		)
			emit(
				"error",
				"base",
				now.line,
				`${row.handle} is an owner decision; add a new row and supersede it instead of rewording`,
			);
	}
	for (const [handle, row] of headRows)
		if (!baseHandles.includes(handle) && decisionNumber(handle) <= maxBase)
			emit(
				"error",
				"base",
				row.line,
				`${handle} reuses a number at or below D${maxBase}; number new rows from D${maxBase + 1}`,
			);
	return findings.sort((a, b) => a.line - b.line);
}

export function parseTrail(text: string): TrailRow[] {
	return text
		.split(/\r?\n/)
		.slice(1)
		.filter((line) => line.trim() !== "")
		.map((line) => {
			const [
				ts = "",
				phase = "",
				decision = "",
				why = "",
				evidence = "",
				result = "",
			] = line.split("\t");
			return { ts, phase, decision, why, evidence, result };
		});
}

export function parseGlossary(text: string): {
	terms: string[];
	avoid: [string, string][];
} {
	const terms: string[] = [];
	const avoid: [string, string][] = [];
	let current: string | undefined;
	for (const line of text.split(/\r?\n/)) {
		const term = /^\s*(?:[-*]\s+)?\*\*([^*]+?)\*\*/.exec(line);
		if (term) {
			current = (term[1] ?? "").replace(/:$/, "").trim();
			terms.push(current);
		}
		const words = /_Avoid_:?\s*(.+)$/.exec(line);
		if (words && current)
			for (const word of (words[1] ?? "").split(",")) {
				const clean = word.trim().replace(/\.$/, "");
				if (clean) avoid.push([clean.toLowerCase(), current]);
			}
	}
	return { terms, avoid };
}

export function isStale(plan: Plan, today: string): boolean {
	if (frontmatterValue(plan, "status") !== "active") return false;
	const age = daysBetween(frontmatterValue(plan, "reviewed") ?? "", today);
	return age !== undefined && age > PLAN_CAPS.staleDays;
}

export function readyToDelete(plan: Plan): boolean {
	return tierOf(plan) === "programme"
		? plan.milestones.length > 0 &&
				plan.milestones.every((milestone) => stateOf(milestone) === "exited")
		: plan.sessions.length > 0 &&
				plan.sessions.every((session) => stateOf(session) === "done");
}
