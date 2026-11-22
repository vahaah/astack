import { ALLOW, type Context, deny, note } from "../hook/events.ts";
import {
	combineJudged,
	type Judged,
	type Observation,
	type Shown,
	steSessionDir,
} from "./events.ts";
import { adviceMessage, denyMessage } from "./format.ts";
import { EXACT_RULES, RULE_TIER } from "./rules.ts";
import { demoted, recordDenies } from "./state.ts";
import type { Finding, FindingRule, Surface } from "./types.ts";

const QUIET_RULES: ReadonlySet<FindingRule> = new Set<FindingRule>([
	"noun-cluster",
	"ing-form",
	"hedge",
	"symbol",
]);

export type Outcome = Judged & {
	readonly denied: readonly string[];
};

function rank(finding: Finding): number {
	return RULE_TIER[finding.rule] === "deny" ? 0 : 1;
}

function demotable(finding: Finding): boolean {
	return !EXACT_RULES.has(finding.rule);
}

function shownOf(finding: Finding, blocks: boolean): Shown {
	if (blocks) return "deny";
	if (QUIET_RULES.has(finding.rule)) return "quiet";
	return finding.severity === "deny" ? "demoted" : "advise";
}

export function outcomeOf(
	subject: string,
	surface: Surface,
	findings: readonly Finding[],
	skip: ReadonlySet<string>,
): Outcome {
	const blocks = (finding: Finding): boolean =>
		finding.severity === "deny" &&
		!(demotable(finding) && skip.has(finding.fingerprint));
	const observed = findings.map(
		(finding): Observation => ({
			check: "ste",
			surface,
			rule: finding.rule,
			fingerprint: finding.fingerprint,
			shown: shownOf(finding, blocks(finding)),
		}),
	);
	const blocking = findings.filter(blocks);
	if (blocking.length > 0)
		return {
			verdict: deny(denyMessage(subject, blocking)),
			observed,
			denied: blocking.filter(demotable).map((finding) => finding.fingerprint),
		};
	const advice = findings
		.filter((finding) => !QUIET_RULES.has(finding.rule))
		.map((finding): Finding => ({ ...finding, severity: "advise" }))
		.sort((a, b) => rank(a) - rank(b) || a.line - b.line);
	return {
		verdict: advice.length > 0 ? note(adviceMessage(subject, advice)) : ALLOW,
		observed,
		denied: [],
	};
}

export function withLedger(
	context: Context,
	build: (skip: ReadonlySet<string>) => readonly Outcome[],
): Judged {
	const dir = steSessionDir(context);
	const outcomes = build(dir ? demoted(dir) : new Set<string>());
	if (dir && context.refresh !== true)
		recordDenies(
			dir,
			outcomes.flatMap((outcome) => outcome.denied),
		);
	return combineJudged(outcomes);
}
