import { REGISTRY_PATH, type Rung } from "../change-proof/rung.ts";
import {
	type BlockLine,
	capRefText,
	type DomainBlock,
	parseDomainBlock,
} from "../domain/notation.ts";
import {
	type DerivedRung,
	type DomainFacts,
	type DomainFinding,
	derivedRung,
	domainFindings,
	type FilesCell,
} from "../domain/rules.ts";
import { anyGlob } from "../glob.ts";
import { sectionByTitle } from "./parse.ts";
import type { CheckEnv, Line, Plan } from "./types.ts";

export const DOMAIN_SECTION = "Domain and effects";

export type DomainSummary = {
	readonly context: string;
	readonly flows: readonly {
		readonly name: string;
		readonly row: readonly string[];
		readonly errs: readonly string[];
	}[];
	readonly rung: Rung | undefined;
	readonly derived: DerivedRung;
};

export type PlanDomain = {
	readonly findings: readonly DomainFinding[];
	readonly block: DomainBlock | undefined;
	readonly facts: DomainFacts | undefined;
};

const NONE: PlanDomain = { findings: [], block: undefined, facts: undefined };

type Fence = { readonly line: number; readonly lines: readonly BlockLine[] };

const OPEN = /^ {0,3}(`{3,}|~{3,})\s*(\S*)\s*$/;

export function domainFences(lines: readonly Line[]): Fence[] {
	const fences: Fence[] = [];
	let open:
		| { line: number; marker: string; domain: boolean; lines: BlockLine[] }
		| undefined;
	for (const { n, text } of lines) {
		if (open === undefined) {
			const fence = OPEN.exec(text);
			if (fence !== null)
				open = {
					line: n,
					marker: fence[1] ?? "```",
					domain: fence[2] === "domain",
					lines: [],
				};
		} else if (text.trim() === open.marker) {
			if (open.domain) fences.push({ line: open.line, lines: open.lines });
			open = undefined;
		} else open.lines.push({ n, text });
	}
	return fences;
}

export function filesCells(plan: Plan): readonly FilesCell[] {
	return plan.sessions.flatMap((session) =>
		session.steps.flatMap((step) =>
			step.files.map((cell) => ({ line: step.line, cell })),
		),
	);
}

export function planDomain(plan: Plan, env: CheckEnv): PlanDomain {
	const { domain } = env;
	if (domain === undefined) return NONE;
	const section = sectionByTitle(plan, DOMAIN_SECTION);
	const at = section?.line ?? 1;
	if (!domain.card.ok)
		return {
			...NONE,
			findings: domain.card.error.map((problem) => ({
				line: at,
				message: problem.message,
			})),
		};
	const card = domain.card.value;
	if (card.kind === "none") return NONE;
	const cells = filesCells(plan);
	const fences = section === undefined ? [] : domainFences(section.body);
	const [fence, ...extra] = fences;
	if (fence === undefined) {
		if (section !== undefined)
			return {
				...NONE,
				findings: [
					{
						line: section.line,
						message: `## ${DOMAIN_SECTION} holds no domain fence`,
					},
				],
			};
		const code = cells.find(({ cell }) =>
			anyGlob(domain.codeRoots, cell.split("#")[0] ?? cell),
		);
		return code === undefined
			? NONE
			: {
					...NONE,
					findings: [
						{
							line: code.line,
							message: `the Files cell ${code.cell} is under a code root, so the plan needs one ## ${DOMAIN_SECTION} H2 with one domain fence; astack check-plan --template=domain prints its grammar`,
						},
					],
				};
	}
	const findings: DomainFinding[] = extra.map((other) => ({
		line: other.line,
		message: `## ${DOMAIN_SECTION} holds one domain fence, and this is a second`,
	}));
	const parsed = parseDomainBlock(fence.lines);
	if (!parsed.ok) return { ...NONE, findings: [...findings, ...parsed.error] };
	if (!domain.registry.ok)
		findings.push({
			line: fence.line,
			message: `${REGISTRY_PATH}: ${domain.registry.error}`,
		});
	const facts: DomainFacts = {
		card,
		cells,
		registry: domain.registry.ok ? domain.registry.value : undefined,
	};
	return {
		findings: [...findings, ...domainFindings(parsed.value, facts)],
		block: parsed.value,
		facts,
	};
}

export function domainSummary(found: PlanDomain): DomainSummary | undefined {
	const { block, facts } = found;
	if (block === undefined || facts === undefined) return undefined;
	return {
		context: block.context.name,
		flows: block.flows.map((flow) => ({
			name: flow.name,
			row: flow.row.map(capRefText),
			errs: flow.errs,
		})),
		rung: block.rung?.rung,
		derived: derivedRung(block, facts),
	};
}
