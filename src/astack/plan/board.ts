import { laneOf, tierOf } from "./check.ts";
import { fieldText, handleList, stateOf, stripPeriod } from "./parse.ts";
import type { PlanSet } from "./planset.ts";
import { objectFor, type Snapshot } from "./tracker.ts";
import type { Plan, Session } from "./types.ts";

export const DEFAULT_WIP = 5;

export type BoardStatus = "done" | "in-review" | "in-progress" | "todo";

export type BoardRow = {
	readonly handle: string;
	readonly title: string;
	readonly lane: string;
	readonly path: string;
	readonly status: BoardStatus;
	readonly key: string | undefined;
	readonly pr: number | undefined;
	readonly dependsOn: readonly string[];
	readonly detailed: boolean;
	readonly questions: readonly number[];
	readonly tail: number;
};

export type Board = {
	readonly slug: string;
	readonly wip: number;
	readonly rows: readonly BoardRow[];
	readonly drain: readonly BoardRow[];
	readonly active: readonly BoardRow[];
	readonly frontier: readonly BoardRow[];
	readonly blocked: readonly BoardRow[];
	readonly launch: readonly BoardRow[];
	readonly briefNext: readonly string[];
	readonly openPrs: readonly number[];
};

type Located = {
	readonly session: Session;
	readonly plan: Plan;
	readonly path: string;
};

function sessionsOf(set: PlanSet): Located[] {
	if (tierOf(set.root) !== "programme")
		return set.root.sessions.map((session) => ({
			session,
			plan: set.root,
			path: set.path,
		}));
	return [...set.briefs.values()].flatMap((brief) =>
		brief.plan.sessions.map((session) => ({
			session,
			plan: brief.plan,
			path: brief.path,
		})),
	);
}

function statusOf(
	located: Located,
	snapshot: Snapshot,
	slug: string,
): {
	status: BoardStatus;
	key: string | undefined;
	pr: number | undefined;
} {
	const handle = located.session.handle ?? "";
	const planKey =
		stripPeriod(located.session.fields.get("Ticket")?.value ?? "") || undefined;
	const object = objectFor(snapshot, `${slug}/${handle}`, planKey);
	const pr = object?.pr;
	const openPr = pr && (pr.state === "open" || pr.state === "draft");
	if (
		stateOf(located.session) === "done" ||
		object?.state === "done" ||
		object?.state === "canceled" ||
		pr?.state === "merged"
	)
		return { status: "done", key: object?.key ?? planKey, pr: pr?.number };
	if (object?.state === "in-review" || openPr)
		return { status: "in-review", key: object?.key ?? planKey, pr: pr?.number };
	if (object?.state === "in-progress")
		return { status: "in-progress", key: object.key, pr: pr?.number };
	return { status: "todo", key: object?.key ?? planKey, pr: pr?.number };
}

function questionBlocks(set: PlanSet): Map<string, number[]> {
	const blocks = new Map<string, number[]>();
	const plans = [
		set.root,
		...[...set.briefs.values()].map((brief) => brief.plan),
	];
	for (const plan of plans)
		for (const question of plan.questions)
			for (const handle of question.blocks)
				blocks.set(handle, [...(blocks.get(handle) ?? []), question.number]);
	return blocks;
}

function tails(rows: readonly Omit<BoardRow, "tail">[]): Map<string, number> {
	const dependents = new Map<string, string[]>();
	for (const row of rows)
		for (const dep of row.dependsOn)
			dependents.set(dep, [...(dependents.get(dep) ?? []), row.handle]);
	const memo = new Map<string, number>();
	const depth = (handle: string, seen: ReadonlySet<string>): number => {
		const known = memo.get(handle);
		if (known !== undefined) return known;
		if (seen.has(handle)) return 0;
		const next = new Set([...seen, handle]);
		const value =
			1 +
			Math.max(
				0,
				...(dependents.get(handle) ?? []).map((child) => depth(child, next)),
			);
		memo.set(handle, value);
		return value;
	};
	return new Map(rows.map((row) => [row.handle, depth(row.handle, new Set())]));
}

export function buildBoard(
	set: PlanSet,
	snapshot: Snapshot,
	wip: number,
): Board {
	const questions = questionBlocks(set);
	const partial = sessionsOf(set).map((located) => {
		const handle = located.session.handle ?? located.session.title;
		const derived = statusOf(located, snapshot, set.slug);
		return {
			handle,
			title: stripPeriod(located.session.title),
			lane: laneOf(located.session),
			path: located.path,
			...derived,
			dependsOn: handleList(
				fieldText(located.session.fields.get("Depends on")),
			),
			detailed: located.session.steps.length > 0,
			questions: questions.get(handle) ?? [],
		};
	});
	const depth = tails(partial);
	const rows: BoardRow[] = partial.map((row) => ({
		...row,
		tail: depth.get(row.handle) ?? 1,
	}));
	const status = new Map(rows.map((row) => [row.handle, row.status]));
	const briefed = new Set(set.briefs.keys());
	const blockDone = (handle: string): boolean => {
		const block = set.root.milestones
			.flatMap((m) => m.blocks)
			.find((b) => b.handle === handle);
		if (!block) return true;
		if (block.brief === "done") return true;
		const brief = set.briefs.get(handle);
		return brief
			? brief.plan.sessions.every((s) => status.get(s.handle ?? "") === "done")
			: false;
	};
	const done = (handle: string): boolean =>
		status.get(handle) === "done" ||
		(!status.has(handle) && blockDone(handle.split("/")[0] ?? ""));
	const ready = (row: BoardRow): boolean =>
		row.status === "todo" &&
		row.detailed &&
		row.questions.length === 0 &&
		row.dependsOn.every(done);
	const order = new Map(rows.map((row, i) => [row.handle, i]));
	const frontier = rows
		.filter(ready)
		.sort(
			(a, b) =>
				b.tail - a.tail ||
				(order.get(a.handle) ?? 0) - (order.get(b.handle) ?? 0),
		);
	const drain = rows.filter((row) => row.status === "in-review");
	const active = rows.filter((row) => row.status === "in-progress");
	const mappedPrs = new Set(rows.flatMap((row) => row.pr ?? []));
	const openPrs = snapshot.prs
		.filter(
			(pr) =>
				(pr.state === "open" || pr.state === "draft") &&
				!mappedPrs.has(pr.number),
		)
		.map((pr) => pr.number);
	const slots =
		drain.length + openPrs.length > 0 ? 0 : Math.max(0, wip - active.length);
	const briefNext = set.root.milestones
		.filter(
			(milestone) =>
				stateOf(milestone) === "now" || stateOf(milestone) === "next",
		)
		.flatMap((milestone) => milestone.blocks)
		.filter(
			(block) =>
				!briefed.has(block.handle) &&
				block.brief !== "done" &&
				block.dependsOn.every(blockDone),
		)
		.map((block) => `${block.handle} ${stripPeriod(block.outcome)}`);
	return {
		slug: set.slug,
		wip,
		rows,
		drain,
		active,
		frontier,
		blocked: rows.filter((row) => row.status === "todo" && !ready(row)),
		launch: frontier.slice(0, slots),
		briefNext,
		openPrs,
	};
}

function rowLine(row: BoardRow): string {
	const parts = [
		`lane ${row.lane}`,
		row.key ? row.key : "",
		row.pr ? `PR #${row.pr}` : "",
		row.tail > 1 ? `tail ${row.tail}` : "",
	].filter(Boolean);
	return `- ${row.handle} ${row.title} (${parts.join(", ")})`;
}

export function boardText(board: Board): string {
	const lines = [
		`Board for ${board.slug}. Derived from the plan, the tracker and git. Never commit it.`,
		`WIP cap ${board.wip}. Active ${board.active.length}. In review ${board.drain.length}.`,
	];
	if (board.drain.length + board.openPrs.length > 0)
		lines.push(
			"Drain first. Merge or close these PRs before a new launch.",
			...board.drain.map(rowLine),
			...board.openPrs.map((pr) => `- PR #${pr} (no plan unit)`),
		);
	if (board.active.length > 0)
		lines.push("Active.", ...board.active.map(rowLine));
	lines.push(
		board.frontier.length > 0
			? "Startable, longest tail first."
			: "Startable. None.",
		...board.frontier.map(rowLine),
	);
	if (board.launch.length > 0)
		lines.push(
			`Launch now, ${board.launch.length} of ${board.frontier.length}.`,
			...board.launch.map(
				(row) => `- astack session start ${row.path} ${row.handle}`,
			),
		);
	if (board.briefNext.length > 0)
		lines.push(
			"Write the brief next. Its dependencies are done or briefed.",
			...board.briefNext.map((block) => `- ${block}`),
		);
	const blocked = board.blocked.map((row) => {
		const why = [
			...(row.detailed ? [] : ["no steps yet"]),
			...row.dependsOn
				.filter(
					(dep) =>
						board.rows.find((other) => other.handle === dep)?.status !== "done",
				)
				.map((dep) => `waits on ${dep}`),
			...row.questions.map((number) => `question ${number}`),
		];
		return `- ${row.handle} ${row.title} (${why.join(", ")})`;
	});
	if (blocked.length > 0) lines.push("Blocked.", ...blocked);
	return `${lines.join("\n")}\n`;
}
