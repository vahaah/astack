import {
	ALLOW,
	type Context,
	combineAll,
	deny,
	note,
	type Verdict,
} from "../hook/events.ts";
import { stateDir } from "../state.ts";
import { adviceMessage, denyMessage } from "./format.ts";
import { EXACT_RULES, RULE_TIER } from "./rules.ts";
import { demoted, recordDenies, sessionDir } from "./state.ts";
import type { Finding, FindingRule } from "./types.ts";

const QUIET_RULES: ReadonlySet<FindingRule> = new Set<FindingRule>([
	"noun-cluster",
	"ing-form",
	"hedge",
	"symbol",
]);

export type Outcome = {
	readonly verdict: Verdict;
	readonly denied: readonly string[];
};

function rank(finding: Finding): number {
	return RULE_TIER[finding.rule] === "deny" ? 0 : 1;
}

function demotable(finding: Finding): boolean {
	return !EXACT_RULES.has(finding.rule);
}

export function outcomeOf(
	subject: string,
	findings: readonly Finding[],
	skip: ReadonlySet<string>,
): Outcome {
	const blocking = findings.filter(
		(finding) =>
			finding.severity === "deny" &&
			!(demotable(finding) && skip.has(finding.fingerprint)),
	);
	if (blocking.length > 0)
		return {
			verdict: deny(denyMessage(subject, blocking)),
			denied: blocking.filter(demotable).map((finding) => finding.fingerprint),
		};
	const advice = findings
		.filter((finding) => !QUIET_RULES.has(finding.rule))
		.map((finding): Finding => ({ ...finding, severity: "advise" }))
		.sort((a, b) => rank(a) - rank(b) || a.line - b.line);
	return {
		verdict: advice.length > 0 ? note(adviceMessage(subject, advice)) : ALLOW,
		denied: [],
	};
}

function ledgerDir(context: Context): string | undefined {
	const root = stateDir(context.env);
	return root && context.session
		? sessionDir(root, context.session)
		: undefined;
}

export function withLedger(
	context: Context,
	build: (skip: ReadonlySet<string>) => readonly Outcome[],
): Verdict {
	const dir = ledgerDir(context);
	const outcomes = build(dir ? demoted(dir) : new Set<string>());
	if (dir && context.refresh !== true)
		recordDenies(
			dir,
			outcomes.flatMap((outcome) => outcome.denied),
		);
	return combineAll(outcomes.map((outcome) => outcome.verdict));
}
