import type { Effect } from "../change-proof/contract.ts";
import {
	classText,
	type EffectFinding,
	type EffectInputs,
	resolveImport,
} from "./effects.ts";
import { classesOf, type ModuleFacts } from "./imports.ts";
import type { DomainBlock } from "./notation.ts";

function sameClasses(a: readonly Effect[], b: readonly Effect[]): boolean {
	return a.length === b.length && a.every((effect, at) => b[at] === effect);
}

function named(path: string, inputs: EffectInputs): boolean {
	const { block, card, cells } = inputs;
	if (block === undefined) return false;
	const steps = new Set(block.steps.map((step) => step.name));
	const linked = cells.some(({ cell }) => {
		const [module, name] = cell.split("#");
		return module === path && name !== undefined && steps.has(name);
	});
	return (
		linked || [...card.caps, ...block.caps].some((cap) => cap.port === path)
	);
}

export function changeFindings(
	base: readonly ModuleFacts[],
	head: readonly ModuleFacts[],
	inputs: EffectInputs,
): readonly EffectFinding[] {
	const before = new Map(
		base.map((module) => [module.path, classesOf(module.uses)]),
	);
	return head.flatMap((module): EffectFinding[] => {
		const now = classesOf(module.uses);
		const was = before.get(module.path) ?? [];
		if (sameClasses(was, now) || named(module.path, inputs)) return [];
		const first = module.uses.find((use) => !was.includes(use.effect));
		return [
			{
				kind: "advice",
				path: module.path,
				line: first?.line ?? 1,
				rule: "change",
				message: `the own classes change from ${classText(was)} at the base to ${classText(now)}, and no step link or cap port of the plan block names this module`,
			},
		];
	});
}

export function absFindings(
	facts: readonly ModuleFacts[],
	block: DomainBlock | undefined,
	plan: string,
): readonly EffectFinding[] {
	if (block === undefined) return [];
	const modules = new Set(facts.map((module) => module.path));
	return block.abs.flatMap((abs): EffectFinding[] => {
		const importers = facts
			.filter((module) =>
				module.imports.some((value) => {
					const found = resolveImport(module.path, value.specifier, modules);
					return found.kind === "module" && found.path === abs.module;
				}),
			)
			.map((module) => module.path);
		const advice = (message: string): EffectFinding => ({
			kind: "advice",
			path: plan,
			line: abs.line,
			rule: "abs",
			message,
		});
		const strangers = abs.callers.filter(
			(caller) => !importers.includes(caller),
		);
		const count = importers.length;
		return [
			...strangers.map((caller) =>
				advice(
					`abs ${abs.module} names the caller ${caller}, which does not import it by value`,
				),
			),
			...(abs.callers.length === count
				? []
				: [
						advice(
							`abs ${abs.module} lists ${abs.callers.length} callers, but ${count} modules under the code roots import it: ${importers.join(", ") || "none"}`,
						),
					]),
			...(abs.deletion.kind === "spreads" && abs.deletion.count !== count
				? [
						advice(
							`abs ${abs.module} spreads ${abs.deletion.count}, but ${count} modules import it`,
						),
					]
				: []),
		];
	});
}
