import {
	type LawClaim,
	lawRung,
	type ModelRegistry,
	modelFiles,
	type PathRung,
	pathRung,
	REGISTRY_PATH,
	RUNGS,
	type Rung,
} from "../change-proof/rung.ts";
import {
	type CapLine,
	type CapRef,
	type Card,
	capRefText,
	type DomainBlock,
	type LawLine,
} from "./notation.ts";

export type ContextsCard = Extract<Card, { readonly kind: "card" }>;

export type FilesCell = { readonly line: number; readonly cell: string };

export type DomainFacts = {
	readonly card: ContextsCard;
	readonly cells: readonly FilesCell[];
	readonly registry: ModelRegistry | undefined;
};

export type DomainFinding = { readonly line: number; readonly message: string };

export type DerivedRung = { readonly rung: Rung; readonly by: string };

const VAGUE_ERRORS = new Set([
	"Error",
	"unknown",
	"any",
	"Exception",
	"Defect",
	"Bug",
	"Panic",
]);

function higher(rung: Rung, than: Rung): boolean {
	return RUNGS.indexOf(rung) > RUNGS.indexOf(than);
}

export function allCaps(
	block: DomainBlock,
	card: ContextsCard,
): readonly CapLine[] {
	return [...card.caps, ...block.caps];
}

function isReadOnly(cap: CapLine): boolean {
	return cap.ops.every((op) => op.mode === "read");
}

function writes(ref: CapRef, cap: CapLine): boolean {
	return ref.op === undefined
		? !isReadOnly(cap)
		: cap.ops.some((op) => op.name === ref.op && op.mode === "write");
}

export function lawClaims(
	block: DomainBlock,
	card: ContextsCard,
): readonly LawClaim[] {
	const caps = allCaps(block, card);
	return block.laws.flatMap((law): LawClaim[] => {
		const { check } = law;
		if (check === undefined) return [];
		switch (check.kind) {
			case "tsc":
				return [{ id: law.id, check: "tsc" }];
			case "prop": {
				const cap = caps.find((one) => one.name === law.tag);
				return [
					{
						id: law.id,
						check: "prop",
						readOnly: cap !== undefined && isReadOnly(cap),
					},
				];
			}
			case "tla":
				return [{ id: law.id, check: "tla", model: check.model }];
			default: {
				const unreachable: never = check;
				return unreachable;
			}
		}
	});
}

function cellRung(registry: ModelRegistry, cell: string): PathRung {
	const path = cell.split("#")[0] ?? cell;
	if (
		path.endsWith("/") &&
		registry.models.some((entry) =>
			[...modelFiles(entry.model), ...entry.covers, ...entry.text].some(
				(glob) => glob.startsWith(path),
			),
		)
	)
		return { kind: "rung", rung: "R4", models: [] };
	return pathRung(registry, path);
}

export function derivedRung(
	block: DomainBlock,
	facts: DomainFacts,
): DerivedRung {
	let found: DerivedRung = { rung: "R0", by: "no law and no Files cell" };
	for (const claim of lawClaims(block, facts.card)) {
		const rung = lawRung(claim);
		if (higher(rung, found.rung)) found = { rung, by: `law ${claim.id}` };
	}
	const { registry } = facts;
	if (registry !== undefined)
		for (const { cell } of facts.cells) {
			const path = cellRung(registry, cell);
			if (path.kind === "rung" && higher(path.rung, found.rung))
				found = { rung: path.rung, by: `Files ${cell}` };
		}
	return found;
}

function capFindings(block: DomainBlock, card: ContextsCard): DomainFinding[] {
	const caps = allCaps(block, card);
	const findings: DomainFinding[] = [];
	for (const cap of block.caps)
		if (card.caps.some((own) => own.name === cap.name))
			findings.push({
				line: cap.line,
				message: `cap ${cap.name} is a card cap of ${card.path}; name it in the step rows only`,
			});
	for (const cap of caps)
		if (isReadOnly(cap) && cap.classes.includes("fs-write"))
			findings.push({
				line: block.caps.includes(cap) ? cap.line : block.context.line,
				message: `cap ${cap.name} has only read ops, but its classes hold fs-write`,
			});
	for (const step of block.steps) {
		if (step.output.kind !== "eff") continue;
		for (const ref of step.output.row) {
			const cap = caps.find((one) => one.name === ref.cap);
			if (
				cap === undefined ||
				(ref.op !== undefined && !cap.ops.some((op) => op.name === ref.op))
			)
				findings.push({
					line: step.line,
					message: `step ${step.name} names ${capRefText(ref)}, which is no op of a card cap or a plan cap`,
				});
		}
		for (const name of step.output.errs)
			if (VAGUE_ERRORS.has(name))
				findings.push({
					line: step.line,
					message: `step ${step.name} names the error ${name}; name the failure that a caller handles`,
				});
	}
	return findings;
}

function lawFindings(
	block: DomainBlock,
	card: ContextsCard,
	registry: ModelRegistry | undefined,
): DomainFinding[] {
	const caps = allCaps(block, card);
	const findings: DomainFinding[] = [];
	const tagged = (tag: string): boolean =>
		block.laws.some((law) => law.tag === tag);
	for (const inv of block.invs)
		if (!tagged(inv.id))
			findings.push({ line: inv.line, message: `inv ${inv.id} has no law` });
	const used = new Map<string, number>();
	for (const step of block.steps)
		if (step.output.kind === "eff")
			for (const ref of step.output.row) {
				const cap = caps.find((one) => one.name === ref.cap);
				if (cap !== undefined && writes(ref, cap) && !used.has(cap.name))
					used.set(cap.name, block.caps.includes(cap) ? cap.line : step.line);
			}
	for (const [name, line] of used)
		if (!tagged(name))
			findings.push({ line, message: `the write cap ${name} has no law` });
	for (const law of block.laws)
		findings.push(...oneLaw(law, block, caps, registry));
	for (const map of block.maps)
		if (map.equation === undefined || map.check?.kind !== "prop")
			findings.push({
				line: map.line,
				message: `map ${map.from} => ${map.to} needs an eq path equation and a prop check`,
			});
	return findings;
}

function oneLaw(
	law: LawLine,
	block: DomainBlock,
	caps: readonly CapLine[],
	registry: ModelRegistry | undefined,
): DomainFinding[] {
	const findings: DomainFinding[] = [];
	if (
		!block.invs.some((inv) => inv.id === law.tag) &&
		!caps.some((cap) => cap.name === law.tag)
	)
		findings.push({
			line: law.line,
			message: `law ${law.id} tags ${law.tag}, which is no inv and no cap`,
		});
	const { check } = law;
	if (check === undefined)
		findings.push({
			line: law.line,
			message: `law ${law.id} has no check; end it with check: tsc, prop <control-id> or tla <Model>.<Invariant>`,
		});
	else if (check.kind === "tla" && registry !== undefined) {
		const model = registry.models.find((entry) => entry.name === check.model);
		if (
			model === undefined ||
			!model.model.invariants.includes(check.invariant)
		)
			findings.push({
				line: law.line,
				message: `law ${law.id} checks tla ${check.model}.${check.invariant}, which ${REGISTRY_PATH} does not hold`,
			});
	}
	return findings;
}

function linkFindings(block: DomainBlock, facts: DomainFacts): DomainFinding[] {
	const findings: DomainFinding[] = [];
	for (const step of block.steps) {
		const modules = new Set(
			facts.cells.flatMap(({ cell }) => {
				const [module = "", name] = cell.split("#");
				return name === step.name ? [module] : [];
			}),
		);
		if (modules.size !== 1)
			findings.push({
				line: step.line,
				message:
					modules.size === 0
						? `step ${step.name} needs one Files cell <module>#${step.name}`
						: `step ${step.name} has ${modules.size} Files cells in other modules; link one`,
			});
	}
	const { registry } = facts;
	if (registry !== undefined)
		for (const { line, cell } of facts.cells) {
			const found = cellRung(registry, cell);
			if (found.kind === "stop")
				findings.push({
					line,
					message: `the Files cell ${cell} is under the fail-closed glob ${found.glob} of ${REGISTRY_PATH}, but no model glob and no unmodelled entry names it`,
				});
		}
	return findings;
}

export function recordFindings(
	block: DomainBlock,
	card: ContextsCard,
	registry: ModelRegistry | undefined,
): readonly DomainFinding[] {
	const findings: DomainFinding[] = [];
	if (!card.contexts.some((context) => context.name === block.context.name))
		findings.push({
			line: block.context.line,
			message: `context ${block.context.name} is no context of the card in ${card.path}; use ${card.contexts.map((context) => context.name).join(", ")}`,
		});
	findings.push(
		...capFindings(block, card),
		...lawFindings(block, card, registry),
	);
	return findings.sort((a, b) => a.line - b.line);
}

export function domainFindings(
	block: DomainBlock,
	facts: DomainFacts,
): readonly DomainFinding[] {
	const findings: DomainFinding[] = [
		...recordFindings(block, facts.card, facts.registry),
		...linkFindings(block, facts),
	];
	const derived = derivedRung(block, facts);
	if (block.rung === undefined)
		findings.push({
			line: block.context.line,
			message: `the block needs a rung line; the derived rung is ${derived.rung} by ${derived.by}`,
		});
	else if (higher(derived.rung, block.rung.rung))
		findings.push({
			line: block.rung.line,
			message: `rung ${block.rung.rung} is below the derived rung ${derived.rung} by ${derived.by}`,
		});
	return findings.sort((a, b) => a.line - b.line);
}
