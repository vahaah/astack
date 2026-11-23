import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { type AdrFolder, amendProblems } from "../../src/astack/adr.ts";

const RUNS = { numRuns: 200 };
const PATH = "docs/adr/0005-every-change-carries-proof.md";
const DATE = "2026-11-03";
const TITLES = [
	"Formal claim",
	"Category composition",
	"Implementation correspondence",
	"Verification",
] as const;

type Decision = {
	readonly plain: readonly string[];
	readonly fence: readonly string[];
	readonly notes: readonly string[];
	readonly spans: readonly {
		readonly title: string;
		readonly lines: readonly string[];
	}[];
};

type Edit =
	| { readonly kind: "plain-change"; readonly at: number }
	| { readonly kind: "plain-add"; readonly at: number }
	| { readonly kind: "plain-remove"; readonly at: number }
	| { readonly kind: "fence-change"; readonly at: number }
	| { readonly kind: "fence-add"; readonly at: number }
	| { readonly kind: "heading-add"; readonly at: number }
	| { readonly kind: "span-change"; readonly at: number }
	| { readonly kind: "span-drop"; readonly at: number }
	| { readonly kind: "dated"; readonly at: number; readonly days: number };

const PASSING = new Set<Edit["kind"]>(["span-change", "span-drop", "dated"]);

function render(decisions: readonly Decision[]): string {
	const lines = [
		"# 0005. Every change carries proof",
		"",
		"Status: Accepted",
		`Date: ${DATE}`,
		"Supersedes: none",
		"",
		"## Decisions",
		"",
	];
	decisions.forEach((decision, index) => {
		lines.push(`### D${index + 1}. Decision ${index + 1}`, "");
		for (const line of decision.plain) lines.push(line);
		lines.push("");
		if (decision.fence.length > 0)
			lines.push("```text", ...decision.fence, "```", "");
		for (const note of decision.notes) lines.push(note, "");
		for (const span of decision.spans)
			lines.push(`#### ${span.title}`, "", ...span.lines, "");
	});
	lines.push("## Consequences", "", "- The gate runs.", "");
	return lines.join("\n");
}

function day(days: number): string {
	const at = new Date(`${DATE}T00:00:00Z`);
	at.setUTCDate(at.getUTCDate() + days);
	return at.toISOString().slice(0, 10);
}

function apply(
	decisions: readonly Decision[],
	edit: Edit,
	fresh: string,
): readonly Decision[] {
	const index = edit.at % decisions.length;
	const decision = decisions[index];
	if (decision === undefined) return decisions;
	const replace = (
		lines: readonly string[],
		at: number,
		by: readonly string[],
	) => [...lines.slice(0, at), ...by, ...lines.slice(at + 1)];
	const changed = ((): Decision => {
		const at = (length: number) => edit.at % Math.max(length, 1);
		switch (edit.kind) {
			case "plain-change":
				return {
					...decision,
					plain: replace(decision.plain, at(decision.plain.length), [fresh]),
				};
			case "plain-add":
				return { ...decision, plain: [...decision.plain, fresh] };
			case "plain-remove":
				return {
					...decision,
					plain: replace(decision.plain, at(decision.plain.length), []),
				};
			case "fence-change":
				return {
					...decision,
					fence: replace(decision.fence, at(decision.fence.length), [
						`${fresh} >=> next`,
					]),
				};
			case "fence-add":
				return { ...decision, fence: [...decision.fence, `${fresh} >=> next`] };
			case "heading-add": {
				const title =
					TITLES.find((one) =>
						decision.spans.every((span) => span.title !== one),
					) ?? "Verification";
				return {
					...decision,
					spans: [...decision.spans, { title, lines: [fresh] }],
				};
			}
			case "span-change":
				return {
					...decision,
					spans: decision.spans.map((span) => ({
						...span,
						lines: [...span.lines.slice(1), fresh],
					})),
				};
			case "span-drop":
				return { ...decision, spans: [] };
			case "dated":
				return {
					...decision,
					notes: [
						...decision.notes,
						`> Note ${day(edit.days)}: ${fresh}\n> It names the new rule.`,
					],
				};
			default: {
				const unreachable: never = edit;
				return unreachable;
			}
		}
	})();
	return decisions.map((one, at) => (at === index ? changed : one));
}

function effective(decisions: readonly Decision[], edit: Edit): boolean {
	const decision = decisions[edit.at % decisions.length];
	if (decision === undefined) return false;
	switch (edit.kind) {
		case "plain-change":
		case "plain-remove":
			return decision.plain.length > 0;
		case "fence-change":
			return decision.fence.length > 0;
		case "heading-add":
			return decision.spans.length < TITLES.length;
		case "span-change":
		case "span-drop":
			return decision.spans.length > 0;
		default:
			return true;
	}
}

const decision = (n: number): fc.Arbitrary<Decision> =>
	fc
		.record({
			plain: fc.integer({ min: 1, max: 3 }),
			fence: fc.integer({ min: 0, max: 2 }),
			span: fc.option(fc.constantFrom(...TITLES), { nil: undefined }),
		})
		.map(({ plain, fence, span }) => ({
			plain: Array.from(
				{ length: plain },
				(_, i) => `Base line ${n}-${i} holds a rule.`,
			),
			fence: Array.from({ length: fence }, (_, i) => `step${n}x${i} >=> next`),
			notes: [],
			spans:
				span === undefined
					? []
					: [{ title: span, lines: [`Proof line ${n} names a control.`] }],
		}));

const edit: fc.Arbitrary<Edit> = fc.oneof(
	...(
		[
			"plain-change",
			"plain-add",
			"plain-remove",
			"fence-change",
			"fence-add",
			"heading-add",
			"span-change",
			"span-drop",
		] as const
	).map((kind) => fc.nat({ max: 20 }).map((at): Edit => ({ kind, at }))),
	fc
		.record({ at: fc.nat({ max: 20 }), days: fc.nat({ max: 500 }) })
		.map(({ at, days }): Edit => ({ kind: "dated", at, days })),
);

const folder = (text: string): AdrFolder => ({
	files: [{ path: PATH, text }],
});

describe("an Accepted ADR changes only by a dated block or a base span edit", () => {
	test("[control:adr-amend-only] each edit outside a dated block or a base span fails, and the others pass", () => {
		fc.assert(
			fc.property(
				fc
					.integer({ min: 1, max: 4 })
					.chain((count) =>
						fc.tuple(
							...Array.from({ length: count }, (_, n) => decision(n + 1)),
						),
					),
				fc.array(edit, { minLength: 1, maxLength: 4 }),
				(decisions, edits) => {
					let head: readonly Decision[] = decisions;
					let fails = false;
					const edited = new Set<number>();
					edits.forEach((one, index) => {
						const at = one.at % decisions.length;
						if (edited.has(at) || !effective(head, one)) return;
						edited.add(at);
						fails ||= !PASSING.has(one.kind);
						head = apply(head, one, `Fresh line ${index} changes the rule.`);
					});
					expect(
						amendProblems(folder(render(decisions)), folder(render(head)))
							.length > 0,
					).toBe(fails);
				},
			),
			RUNS,
		);
	});
});
