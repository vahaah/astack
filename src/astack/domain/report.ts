import { err, ok, type Result } from "../result.ts";
import { absFindings, changeFindings } from "./effect-change.ts";
import {
	compareFindings,
	type EffectFinding,
	type EffectInputs,
	effectFindings,
} from "./effects.ts";
import { type ModuleFacts, moduleFacts } from "./imports.ts";
import type { DomainBlock } from "./notation.ts";
import type { ContextsCard, FilesCell } from "./rules.ts";
import { moduleSources, type SourceAt, type SourceStop } from "./sources.ts";

export type EffectPlan = {
	readonly path: string;
	readonly block: DomainBlock;
	readonly cells: readonly FilesCell[];
};

export type EffectQuery = {
	readonly root: string;
	readonly codeRoots: readonly string[];
	readonly card: ContextsCard;
	readonly plan: EffectPlan | undefined;
	readonly base: string | undefined;
	readonly totality: boolean;
};

export type EffectReport = {
	readonly modules: number;
	readonly findings: readonly EffectFinding[];
};

const TOTALITY = new Set(["unowned", "context"]);

type Read = {
	readonly facts: readonly ModuleFacts[];
	readonly reports: readonly EffectFinding[];
};

function readAt(query: EffectQuery, at: SourceAt): Result<Read, SourceStop> {
	const sources = moduleSources({
		root: query.root,
		codeRoots: query.codeRoots,
		at,
	});
	if (!sources.ok) return sources;
	const facts: ModuleFacts[] = [];
	const reports: EffectFinding[] = [];
	for (const source of sources.value) {
		if (source.kind === "report") {
			reports.push({ ...source, kind: "report", line: 1, rule: "source" });
			continue;
		}
		const read = moduleFacts(source.path, source.text);
		if (read.ok) facts.push(read.value);
		else
			reports.push({
				kind: "report",
				path: source.path,
				line: 1,
				rule: "source",
				message: read.error.message,
			});
	}
	return ok({ facts, reports });
}

export function effectReport(
	query: EffectQuery,
): Result<EffectReport, SourceStop> {
	const head = readAt(query, { kind: "tree" });
	if (!head.ok) return head;
	const { facts } = head.value;
	const inputs: EffectInputs = {
		card: query.card,
		block: query.plan?.block,
		cells: query.plan?.cells ?? [],
	};
	const base =
		query.base === undefined
			? ok(undefined)
			: readAt(query, { kind: "commit", commit: query.base });
	if (!base.ok) return err(base.error);
	const findings = [
		...head.value.reports,
		...effectFindings(facts, inputs).filter(
			(finding) => query.totality || !TOTALITY.has(finding.rule),
		),
		...(base.value === undefined
			? []
			: changeFindings(base.value.facts, facts, inputs)),
		...(query.plan === undefined
			? []
			: absFindings(facts, query.plan.block, query.plan.path)),
	];
	return ok({
		modules: facts.length,
		findings: findings.sort(compareFindings),
	});
}

export function findingLine(finding: EffectFinding): string {
	return `${finding.kind}: ${finding.path}:${finding.line}: ${finding.rule}: ${finding.message}`;
}

export function countLine(report: EffectReport): string {
	const advice = report.findings.filter((one) => one.kind === "advice").length;
	return `effects: ${advice} advice and ${report.findings.length - advice} reports in ${report.modules} modules`;
}
