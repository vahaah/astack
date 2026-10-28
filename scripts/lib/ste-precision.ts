import { checkText, DEFAULT_GLOSSARY } from "../../src/astack/ste/check.ts";
import { EXACT_RULES, RULE_TIER } from "../../src/astack/ste/rules.ts";
import {
	RULE_IDS,
	type RuleId,
	type Severity,
} from "../../src/astack/ste/types.ts";

export const PROMOTION_FIRES = 30;
export const PROMOTION_PRECISION = 0.95;

export type LabelledCase = {
	readonly rule: RuleId;
	readonly fires: boolean;
	readonly text: string;
	readonly line: number;
};

export type RuleStats = {
	readonly rule: RuleId;
	readonly tier: Severity;
	readonly truePositives: number;
	readonly falsePositives: number;
	readonly falseNegatives: number;
	readonly negatives: number;
	readonly precision: number | undefined;
	readonly recall: number | undefined;
	readonly misses: readonly LabelledCase[];
};

function ruleOf(value: string): RuleId | undefined {
	return RULE_IDS.find((rule) => rule === value);
}

export function parseCorpus(source: string): {
	readonly cases: readonly LabelledCase[];
	readonly errors: readonly string[];
} {
	const cases: LabelledCase[] = [];
	const errors: string[] = [];
	let rule: RuleId | undefined;
	source.split("\n").forEach((raw, index) => {
		const line = index + 1;
		const section = /^# rule: (\S+)\s*$/.exec(raw);
		if (section) {
			rule = ruleOf(section[1] ?? "");
			if (!rule) errors.push(`line ${line}: unknown rule ${section[1]}`);
			return;
		}
		if (raw.startsWith("#") || raw.trim() === "") return;
		const sign = raw.slice(0, 2);
		if (sign !== "+ " && sign !== "- ") {
			errors.push(`line ${line}: a case starts with "+ " or "- "`);
			return;
		}
		if (!rule) {
			errors.push(`line ${line}: a case comes before its rule`);
			return;
		}
		cases.push({
			rule,
			fires: sign === "+ ",
			text: raw.slice(2).replaceAll("\\n", "\n"),
			line,
		});
	});
	return { cases, errors };
}

function fired(entry: LabelledCase): boolean {
	return checkText(entry.text, {
		surface: "doc",
		enforcement: "deny",
		glossary: DEFAULT_GLOSSARY,
	}).findings.some((finding) => finding.rule === entry.rule);
}

export function evaluate(cases: readonly LabelledCase[]): readonly RuleStats[] {
	return RULE_IDS.map((rule) => {
		const mine = cases.filter((entry) => entry.rule === rule);
		const results = mine.map((entry) => ({ entry, fired: fired(entry) }));
		const truePositives = results.filter(
			(r) => r.entry.fires && r.fired,
		).length;
		const falsePositives = results.filter(
			(r) => !r.entry.fires && r.fired,
		).length;
		const falseNegatives = results.filter(
			(r) => r.entry.fires && !r.fired,
		).length;
		const fires = truePositives + falsePositives;
		const positives = truePositives + falseNegatives;
		return {
			rule,
			tier: RULE_TIER[rule],
			truePositives,
			falsePositives,
			falseNegatives,
			negatives: mine.filter((entry) => !entry.fires).length,
			precision: fires === 0 ? undefined : truePositives / fires,
			recall: positives === 0 ? undefined : truePositives / positives,
			misses: results
				.filter((r) => r.entry.fires !== r.fired)
				.map((r) => r.entry),
		};
	});
}

export function gateFailures(stats: readonly RuleStats[]): readonly string[] {
	return stats.flatMap((stat) => {
		if (stat.tier !== "deny") return [];
		const fires = stat.truePositives + stat.falsePositives;
		const failures: string[] = [];
		if (fires < PROMOTION_FIRES)
			failures.push(
				`${stat.rule}: ${fires} labelled fires, a deny rule needs ${PROMOTION_FIRES}`,
			);
		if ((stat.precision ?? 0) < PROMOTION_PRECISION)
			failures.push(
				`${stat.rule}: precision ${percent(stat.precision)}, a deny rule needs ${percent(PROMOTION_PRECISION)}`,
			);
		if (EXACT_RULES.has(stat.rule) && stat.falseNegatives > 0)
			failures.push(
				`${stat.rule}: ${stat.falseNegatives} labelled cases did not fire, and an exact rule has no misses`,
			);
		return failures;
	});
}

function percent(value: number | undefined): string {
	return value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function precisionTable(stats: readonly RuleStats[]): string {
	const rows = stats.map(
		(stat) =>
			`${stat.rule.padEnd(17)} ${stat.tier.padEnd(6)} fires ${String(stat.truePositives + stat.falsePositives).padStart(3)}  false ${String(stat.falsePositives).padStart(2)}  missed ${String(stat.falseNegatives).padStart(2)}  precision ${percent(stat.precision).padStart(6)}  recall ${percent(stat.recall).padStart(6)}`,
	);
	return ["rule              tier", ...rows].join("\n");
}
