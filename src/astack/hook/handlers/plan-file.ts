import { canonicalRelative } from "../../paths.ts";
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
import type { Plan } from "../../plan/types.ts";
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
	before: string | undefined,
	after: string,
): string[] {
	const previous = new Set(
		(before ?? "").split(/\r?\n/).map((line) => line.trim()),
	);
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

function planVerdict(
	path: string,
	before: string | undefined,
	after: string,
	context: Context,
): Verdict {
	const relPath = canonicalRelative(projectDirOf(context), path);
	if (!/\.md$/i.test(relPath) || !hasPlanFrontmatter(after)) return ALLOW;
	const plan = parsePlan(relPath, after);
	const reasons = denyReasons(plan, before, after);
	if (reasons.length > 0)
		return deny(
			`astack blocked this plan edit. ${reasons.join(" Also, ")} The astack:plan skill has the rules in references/template.md.`,
		);
	const findings = checkPlan(
		parsePlan(path, after),
		envForFile(path, { today: context.today, trail: false }),
	).filter((finding) => finding.group !== "ste");
	if (findings.length === 0) return ALLOW;
	const shown = findings
		.slice(0, PLAN_CONTEXT_LINES)
		.map(
			(finding) =>
				`${finding.line}: ${finding.severity === "error" ? "" : `${finding.severity}: `}${finding.message}`,
		);
	const more =
		findings.length > PLAN_CONTEXT_LINES
			? [`and ${findings.length - PLAN_CONTEXT_LINES} more.`]
			: [];
	return note(
		[
			`astack check-plan finds ${findings.length} problem${findings.length === 1 ? "" : "s"} in ${relPath} after this edit.`,
			...shown,
			...more,
			`Run astack check-plan ${relPath} before the plan goes active.`,
		].join("\n"),
	);
}

export const handler = defineHandler({
	id: "plan-file",
	on: ["write", "edit"],
	run: (event, context) =>
		planVerdict(event.path, event.before, event.after, context),
});
