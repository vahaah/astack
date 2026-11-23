import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
	type BlockLine,
	parseCard,
	parseDomainBlock,
} from "../../src/astack/domain/notation.ts";

function lines(text: string, from = 10): BlockLine[] {
	return text
		.split("\n")
		.map((line, index) => ({ n: from + index, text: line }));
}

const BLOCK = `context Proof
agg  DomainBlock @ src/astack/domain/notation.ts: DomainBlock
agg  Order @ src/order.ts: OrderState, PlaceOrder -> OrderPlaced
inv  DB1 DomainBlock: each flow joins steps whose types match
cap  Clock [clock, random] @ src/ports/clock.ts: now(read), seed(write)
step parseDomainBlock : BlockLine[] -> Eff<never, BlockProblems, DomainBlock>
step witnessSource : (DomainBlock, StepLinks, Reading) -> WitnessSource
step typeCheck : WitnessSource -> Eff<TypeCheck.typeCheck | Clock, WitnessStop | NoTsc, WitnessVerdict>
step report : WitnessVerdict -> void
flow witness = witnessSource >=> typeCheck >=> report
law  L1 DB1 a misfit flow gets one finding   check: prop domain-flow-names
law  L2 Clock a seed gives one order   check: tla ProofLadder.TlaLawSelects
law  L3 DB1 no check here
map  Proof => Plan: a block line maps to a plan line, eq line(map(b)) = line(b)   check: prop map-lines
rung R3`;

describe("parseDomainBlock", () => {
	test("[control:domain-keywords] each keyword parses with its line, and each flow gives its R and E", () => {
		const parsed = parseDomainBlock(lines(BLOCK));
		if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
		const block = parsed.value;
		expect(block.context).toEqual({ line: 10, name: "Proof" });
		expect(block.aggs[1]).toEqual({
			line: 12,
			name: "Order",
			module: "src/order.ts",
			state: "OrderState",
			command: { cmd: "PlaceOrder", event: "OrderPlaced" },
		});
		expect(block.invs).toEqual([
			{
				line: 13,
				id: "DB1",
				agg: "DomainBlock",
				text: "each flow joins steps whose types match",
			},
		]);
		expect(block.caps).toEqual([
			{
				line: 14,
				name: "Clock",
				classes: ["clock", "random"],
				port: "src/ports/clock.ts",
				ops: [
					{ name: "now", mode: "read" },
					{ name: "seed", mode: "write" },
				],
			},
		]);
		expect(block.steps[1]).toEqual({
			line: 16,
			name: "witnessSource",
			input: {
				kind: "tuple",
				items: [
					{ kind: "name", name: "DomainBlock" },
					{ kind: "name", name: "StepLinks" },
					{ kind: "name", name: "Reading" },
				],
			},
			output: { kind: "pure", type: { kind: "name", name: "WitnessSource" } },
		});
		expect(block.steps[0]?.input).toEqual({ kind: "array", item: "BlockLine" });
		expect(block.flows).toEqual([
			{
				line: 19,
				name: "witness",
				steps: ["witnessSource", "typeCheck", "report"],
				row: [
					{ cap: "TypeCheck", op: "typeCheck" },
					{ cap: "Clock", op: undefined },
				],
				errs: ["WitnessStop", "NoTsc"],
			},
		]);
		expect(block.laws.map((law) => [law.line, law.tag, law.check])).toEqual([
			[20, "DB1", { kind: "prop", control: "domain-flow-names" }],
			[
				21,
				"Clock",
				{ kind: "tla", model: "ProofLadder", invariant: "TlaLawSelects" },
			],
			[22, "DB1", undefined],
		]);
		expect(block.maps[0]?.equation).toBe("line(map(b)) = line(b)");
		expect(block.rung).toEqual({ line: 24, rung: "R3" });
	});

	test.each([
		[
			"an unknown keyword",
			"context Proof\nstep a : A -> B\nwhen a then b",
			[
				{
					line: 12,
					message:
						'"when" is no keyword of a plan domain block; use context, agg, inv, cap, step, flow, law, map, abs, rung',
				},
			],
		],
		[
			"a law with a check that is not tsc, prop or tla",
			"context Proof\nlaw L1 DB1 a law   check: eyeball",
			[
				{
					line: 11,
					message:
						"a law line reads law <Id> <InvId>|<Cap> <property>   check: tsc | prop <control-id> | tla <Model>.<Invariant>",
				},
			],
		],
		[
			"a block with no context line",
			"step a : A -> B",
			[{ line: 10, message: "the domain block needs one context line" }],
		],
		[
			"a card-only pure line",
			"context Proof\npure src/astack/result.ts",
			[
				{
					line: 11,
					message:
						'"pure" is no keyword of a plan domain block; use context, agg, inv, cap, step, flow, law, map, abs, rung',
				},
			],
		],
	])(
		"[control:domain-keyword-errors] %s gives one error at its line",
		(_name, text, problems) => {
			expect(parseDomainBlock(lines(text))).toEqual({
				ok: false,
				error: problems,
			});
		},
	);

	test("a block over 15 lines gives one error at line 16", () => {
		const steps = Array.from(
			{ length: 15 },
			(_, index) => `step s${index} : A -> B`,
		);
		expect(
			parseDomainBlock(lines(["context Proof", ...steps].join("\n"), 1)),
		).toEqual({
			ok: false,
			error: [
				{ line: 16, message: "the domain block has 16 lines; keep it to 15" },
			],
		});
	});
});

const typeName = fc.constantFrom("Text", "Gate", "Admitted", "Verdict", "Plan");
const errName = fc.constantFrom("Stop", "Reject", "Missing");
const capName = fc.constantFrom("Fs", "Git", "Clock");

const stepSpec = fc.record({
	output: typeName,
	effect: fc.option(fc.record({ cap: capName, err: errName }), {
		nil: undefined,
	}),
});

describe("flow names", () => {
	test("[control:domain-flow-names] a flow gets one finding at its line when one adjacent pair differs by name, and none when each pair matches", () => {
		fc.assert(
			fc.property(
				typeName,
				fc.array(stepSpec, { minLength: 2, maxLength: 5 }),
				fc.option(fc.nat(), { nil: undefined }),
				(input, specs, breakAt) => {
					const broken =
						breakAt === undefined
							? undefined
							: 1 + (breakAt % (specs.length - 1));
					const text = specs.map((spec, index) => {
						const previous =
							index === 0 ? input : (specs[index - 1]?.output ?? input);
						const from = index === broken ? `Not${previous}` : previous;
						const out =
							spec.effect === undefined
								? spec.output
								: `Eff<${spec.effect.cap}, ${spec.effect.err}, ${spec.output}>`;
						return `step s${index} : ${from} -> ${out}`;
					});
					const flow = `flow f = ${specs.map((_, index) => `s${index}`).join(" >=> ")}`;
					const parsed = parseDomainBlock(
						lines(["context Proof", ...text, flow].join("\n"), 1),
					);
					const flowLine = specs.length + 2;
					if (broken !== undefined) {
						expect(
							parsed.ok ? [] : parsed.error.map((problem) => problem.line),
						).toEqual([flowLine]);
						return;
					}
					const effects = specs.flatMap((spec) =>
						spec.effect === undefined ? [] : [spec.effect],
					);
					expect(
						parsed.ok
							? parsed.value.flows.map((one) => [
									one.line,
									one.row.map((ref) => ref.cap),
									one.errs,
								])
							: parsed.error,
					).toEqual([
						[
							flowLine,
							[...new Set(effects.map((effect) => effect.cap))],
							[...new Set(effects.map((effect) => effect.err))],
						],
					]);
				},
			),
			{ numRuns: 200 },
		);
	});
});

const CARD = `# Glossary

## Language

\`\`\`domain
context Ignored : src/**
\`\`\`

## Contexts

\`\`\`domain
context Kernel shared : src/astack/result.ts, src/astack/glob.ts
context Proof : src/astack/change-proof/**
cap  TypeCheck [fs-read, fs-write, spawn] @ src/astack/domain/witness-run.ts: typeCheck(write)
pure src/astack/domain/notation.ts
\`\`\`
`;

describe("parseCard", () => {
	test("[control:domain-card-parse] the card is the domain fence under ## Contexts, and a second card is an error", () => {
		const card = parseCard([{ path: "CONTEXT.md", text: CARD }]);
		expect(card).toEqual({
			ok: true,
			value: {
				kind: "card",
				path: "CONTEXT.md",
				line: 11,
				contexts: [
					{
						line: 12,
						name: "Kernel",
						shared: true,
						globs: ["src/astack/result.ts", "src/astack/glob.ts"],
					},
					{
						line: 13,
						name: "Proof",
						shared: false,
						globs: ["src/astack/change-proof/**"],
					},
				],
				caps: [
					{
						line: 14,
						name: "TypeCheck",
						classes: ["fs-read", "fs-write", "spawn"],
						port: "src/astack/domain/witness-run.ts",
						ops: [{ name: "typeCheck", mode: "write" }],
					},
				],
				pures: [{ line: 15, glob: "src/astack/domain/notation.ts" }],
			},
		});
		expect(
			parseCard([
				{ path: "CONTEXT-MAP.md", text: CARD },
				{ path: "CONTEXT.md", text: CARD },
			]),
		).toEqual({
			ok: false,
			error: [
				{
					line: 11,
					message:
						"CONTEXT.md:11 holds a second contexts card; CONTEXT-MAP.md:11 holds the first",
				},
			],
		});
		expect(parseCard([{ path: "CONTEXT.md", text: "# Glossary\n" }])).toEqual({
			ok: true,
			value: { kind: "none" },
		});
	});

	test("a card context with no globs gives an error with the card path", () => {
		expect(
			parseCard([
				{
					path: "CONTEXT.md",
					text: "## Contexts\n\n```domain\ncontext Proof\n```\n",
				},
			]),
		).toEqual({
			ok: false,
			error: [
				{
					line: 4,
					message:
						"CONTEXT.md:4: a card context line names its globs: context <Ctx> [shared] : <glob>, ...",
				},
			],
		});
	});
});
