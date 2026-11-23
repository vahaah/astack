import {
	CHECKBOX,
	checkPlan,
	denyBytes,
	isRegisterHeader,
	STATUS_LINE,
	tierOf,
} from "../../plan/check.ts";
import { envForFile } from "../../plan/files.ts";
import { hasPlanFrontmatter, parsePlan } from "../../plan/parse.ts";
import type { Plan, PlanFinding } from "../../plan/types.ts";
import {
	ALLOW,
	type Context,
	defineHandler,
	deny,
	note,
	projectDirOf,
	type Verdict,
} from "../events.ts";

const PLAN_CONTEXT_LINES = 10;

function addedRegister(plan: Plan, previous: ReadonlySet<string>): boolean {
	return plan.lines.some((line, i) => {
		const before = plan.lines[i - 1];
		const header =
			!line.code &&
			line.text.trim().startsWith("|") &&
			!before?.text.trim().startsWith("|");
		return (
			header && !previous.has(line.text.trim()) && isRegisterHeader(line.text)
		);
	});
}

export function denyReasons(
	plan: Plan,
	previous: ReadonlySet<string>,
	after: string,
): string[] {
	const added = plan.lines.filter(
		(line) => !line.code && !previous.has(line.text.trim()),
	);
	const reasons: string[] = [];
	const bytes = Buffer.byteLength(after, "utf8");
	const cap = denyBytes(tierOf(plan));
	if (bytes > cap)
		reasons.push(
			`the plan would be ${bytes} bytes, over the ${cap}-byte limit. Graduate decisions to ADRs, collapse done sessions, or move blocks into briefs.`,
		);
	if (added.some((line) => CHECKBOX.test(line.text)))
		reasons.push(
			"it adds a checkbox. Progress lives in the tracker, and Exit uses plain bullets.",
		);
	if (added.some((line) => STATUS_LINE.test(line.text)))
		reasons.push(
			"it adds a Status: line. Status lives in the tracker, and each session has one State line.",
		);
	if (addedRegister(plan, previous))
		reasons.push(
			"it adds a register table. Fix in-scope findings in the PR and list them in its body. Out-of-scope findings go to the drafts file through astack plan draft.",
		);
	return reasons;
}

function findingKey(finding: PlanFinding): string {
	const message =
		finding.group === "ledger"
			? finding.message.replace(/^\d+/, "N")
			: finding.message;
	return `${finding.group}\n${message}`;
}

function addedFindings(
	after: readonly PlanFinding[],
	before: readonly PlanFinding[],
	isOldLine: (line: number) => boolean,
): PlanFinding[] {
	const left = new Map<string, number>();
	for (const finding of before) {
		const key = findingKey(finding);
		left.set(key, (left.get(key) ?? 0) + 1);
	}
	const oldLinesFirst = [...after].sort(
		(a, b) => Number(!isOldLine(a.line)) - Number(!isOldLine(b.line)),
	);
	const matched = new Set<PlanFinding>();
	for (const finding of oldLinesFirst) {
		const key = findingKey(finding);
		const count = left.get(key) ?? 0;
		if (count === 0) continue;
		left.set(key, count - 1);
		matched.add(finding);
	}
	return after.filter((finding) => !matched.has(finding));
}

function planVerdict(
	path: string,
	before: string | undefined,
	after: string,
	context: Context,
): Verdict {
	const projectDir = projectDirOf(context);
	const { files } = context.ports;
	const relPath = files.relativePath(projectDir, path);
	if (!/\.md$/i.test(relPath) || !hasPlanFrontmatter(after)) return ALLOW;
	const plan = parsePlan(relPath, after);
	const previous = new Set(
		(before ?? "").split(/\r?\n/).map((line) => line.trim()),
	);
	const reasons = denyReasons(plan, previous, after);
	if (reasons.length > 0)
		return deny(
			`astack blocked this plan edit. ${reasons.join(" Also, ")} The astack:plan skill has the rules in references/template.md.`,
		);
	const env = envForFile(context.ports, path, {
		today: context.today,
		trail: false,
		fallbackRoot: projectDir,
	});
	const steHookSkips = files.isScratch(projectDir, path);
	const check = (text: string | undefined): PlanFinding[] =>
		text !== undefined && hasPlanFrontmatter(text)
			? checkPlan(parsePlan(path, text), env).filter(
					(finding) => steHookSkips || finding.group !== "ste",
				)
			: [];
	const findings = check(after);
	const afterLines = after.split(/\r?\n/);
	const added = addedFindings(findings, check(before), (line) =>
		previous.has(afterLines[line - 1]?.trim() ?? ""),
	);
	if (added.length === 0) return ALLOW;
	const shown = added
		.slice(0, PLAN_CONTEXT_LINES)
		.map(
			(finding) =>
				`${finding.line}: ${finding.severity === "error" ? "" : `${finding.severity}: `}${finding.message}`,
		);
	const more =
		added.length > PLAN_CONTEXT_LINES
			? [`and ${added.length - PLAN_CONTEXT_LINES} more.`]
			: [];
	const earlier = findings.length - added.length;
	const remain =
		earlier === 0
			? ""
			: `${earlier} earlier finding${earlier === 1 ? " remains" : "s remain"}. `;
	return note(
		[
			`astack check-plan finds ${added.length} new problem${added.length === 1 ? "" : "s"} in ${relPath} after this edit.`,
			...shown,
			...more,
			`${remain}Run astack check-plan ${relPath} before the plan goes active.`,
		].join("\n"),
	);
}

export const handler = defineHandler({
	id: "plan-file",
	on: ["write", "edit"],
	run: (event, context) =>
		planVerdict(event.path, event.before, event.after, context),
});
