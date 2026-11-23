import { join, resolve } from "node:path";
import type { FilePorts, Ports } from "../ports.ts";
import {
	isStale,
	liveDecisionRows,
	nowMilestone,
	nowSessions,
	planSlug,
	tierOf,
} from "./check.ts";
import { listPlanFiles, planProfileFor } from "./files.ts";
import { frontmatterValue, parsePlan } from "./parse.ts";
import type { Plan } from "./types.ts";

export function readPlan(files: FilePorts, path: string): Plan | undefined {
	const text = files.readText(path);
	return text === undefined ? undefined : parsePlan(path, text);
}

export function daysOld(plan: Plan, today: string): number | undefined {
	const reviewed = Date.parse(
		`${frontmatterValue(plan, "reviewed") ?? ""}T00:00:00Z`,
	);
	const at = Date.parse(`${today}T00:00:00Z`);
	return Number.isNaN(reviewed)
		? undefined
		: Math.round((at - reviewed) / 86_400_000);
}

const BRIEF_STATUSES = ["active", "draft", "paused"];

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function nowLabel(plan: Plan): string {
	if (tierOf(plan) === "programme") {
		const milestone = nowMilestone(plan);
		return milestone
			? `${milestone.handle ?? ""} ${milestone.title}`.trim()
			: "no now milestone";
	}
	const sessions = nowSessions(plan);
	return sessions.length > 0
		? sessions
				.map((session) => `${session.handle ?? ""} ${session.title}`.trim())
				.join("; ")
		: "no now session";
}

export function briefLines(
	ports: FilePorts,
	files: readonly string[],
	today: string,
	cwd: string,
): string[] {
	return files.flatMap((file) => {
		const plan = readPlan(ports, resolve(cwd, file));
		const status = plan ? frontmatterValue(plan, "status") : undefined;
		if (!plan || !status || !BRIEF_STATUSES.includes(status)) return [];
		const now = nowLabel(plan);
		const delegate =
			frontmatterValue(plan, "delegate") === "on" ? ", delegate on" : "";
		if (status === "active") {
			const stale = isStale(plan, today)
				? ` (stale, reviewed ${daysOld(plan, today)} days ago)`
				: "";
			return [`${planSlug(file)}: ${now}${delegate}${stale}`];
		}
		const defaults = liveDecisionRows(plan).filter(
			(row) => row.settled === "default",
		).length;
		return [
			`${planSlug(file)} (${status}): ${now}; ${plural(defaults, "default")}, ${plural(plan.questions.length, "unresolved question")}${delegate}`,
		];
	});
}

export function sessionStartContext(
	ports: Ports,
	cwd: string,
	projectDir: string | undefined,
	today: string,
	unattendedReason: string | undefined,
): string | undefined {
	const root = projectDir || ports.git.gitRoot(cwd) || cwd;
	const dir = join(root, planProfileFor(ports, root).dir);
	const lines = briefLines(
		ports.files,
		listPlanFiles(ports.files, dir),
		today,
		root,
	).slice(0, 20);
	const parts =
		unattendedReason === undefined
			? []
			: [
					`Unattended session, because ${unattendedReason}. Nobody answers questions here, so /astack:plan follows references/unattended.md and never asks a round.`,
				];
	if (lines.length > 0)
		parts.push(
			"Plans in this repo (astack check-plan --brief):",
			...lines.map((line) => `- ${line}`),
			"Resume one with /astack:plan <slug>, or print its resume prompt with astack session resume <plan path>. The plan, the trail and the tracker hold the state. A plan with delegate on keeps its delegation grant.",
		);
	return parts.length > 0 ? parts.join("\n").slice(0, 9000) : undefined;
}
