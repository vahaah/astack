import { afterAll, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	type BlockLine,
	type DomainBlock,
	parseDomainBlock,
} from "../../src/astack/domain/notation.ts";
import type { Reading } from "../../src/astack/domain/witness.ts";
import { witnessSource } from "../../src/astack/domain/witness.ts";
import {
	stepLinks,
	typeCheck,
	WITNESS_CACHE,
} from "../../src/astack/domain/witness-run.ts";
import { heavyTestTimeout } from "../heavy-test.ts";
import { scratchDir } from "./change-proof-fixture.ts";

const ASTACK = resolve(import.meta.dir, "../..");
const scratch = scratchDir("astack-domain-witness-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const GRANT = `import type { Result } from "./result.ts";

export type GrantInput = { readonly actor: string };
export type GrantProblem = { readonly reason: string };
export type MergeGrant = { readonly actor: string; readonly at: number };
export type Verdict = "merge" | "wait";
export type GrantState = { readonly grants: readonly MergeGrant[] };
export type GrantCmd = { readonly ask: GrantInput };
export type GrantEvent = { readonly granted: MergeGrant };

export function mergeGrantIn(input: GrantInput): Result<MergeGrant, GrantProblem> {
	return input.actor === ""
		? { ok: false, error: { reason: "no actor" } }
		: { ok: true, value: { actor: input.actor, at: 1 } };
}

export function judge(grant: MergeGrant): Verdict {
	return grant.at > 0 ? "merge" : "wait";
}

export function decide(state: GrantState, cmd: GrantCmd): readonly GrantEvent[] {
	return state.grants.length > 0 ? [] : [{ granted: { actor: cmd.ask.actor, at: 1 } }];
}

export function fold(state: GrantState, event: GrantEvent): GrantState {
	return { grants: [...state.grants, event.granted] };
}

export function listGrants(input: GrantInput): readonly MergeGrant[] {
	return [{ actor: input.actor, at: 1 }];
}

export function countGrants(grants: MergeGrant[]): number {
	return grants.length;
}

export function pick<T>(items: readonly T[]): T | undefined {
	return items[0];
}

export function audit(grant: MergeGrant): Verdict {
	return judge(grant);
}
`;

const GRANT_EFFECT = `import type { Effect } from "effect";
import type { Git } from "./ports.ts";

export type GrantInput = { readonly actor: string };
export type GrantProblem = { readonly reason: string };
export type MergeGrant = { readonly actor: string; readonly at: number };

export declare function mergeGrantIn(input: GrantInput): Effect.Effect<MergeGrant, GrantProblem, Git>;
`;

const TSCONFIG = {
	compilerOptions: {
		target: "esnext",
		module: "preserve",
		moduleResolution: "bundler",
		lib: ["esnext"],
		types: [],
		strict: true,
		noEmit: true,
		allowImportingTsExtensions: true,
		skipLibCheck: true,
	},
	include: ["src/**/*.ts"],
};

let count = 0;

function witnessRepo(files: Readonly<Record<string, string>>): string {
	const root = join(scratch, `repo-${count++}`);
	const all: Record<string, string> = {
		"tsconfig.json": JSON.stringify(TSCONFIG),
		"src/result.ts": readFileSync(join(ASTACK, "src/astack/result.ts"), "utf8"),
		"src/grant.ts": GRANT,
		"src/grant-effect.ts": GRANT_EFFECT,
		"src/ports.ts": 'export declare class Git {\n\treadonly tag: "Git";\n}\n',
		...files,
	};
	for (const [path, text] of Object.entries(all)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
	symlinkSync(
		join(ASTACK, "node_modules/typescript"),
		join(root, "node_modules/typescript"),
	);
	symlinkSync("../typescript/bin/tsc", join(root, "node_modules/.bin/tsc"));
	cpSync(
		join(ASTACK, "tests/fixtures/domain/effect"),
		join(root, "node_modules/effect"),
		{
			recursive: true,
		},
	);
	return root;
}

function block(text: string): DomainBlock {
	const lines: BlockLine[] = text
		.split("\n")
		.map((line, index) => ({ n: index + 1, text: line }));
	const parsed = parseDomainBlock(lines);
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
	return parsed.value;
}

const RESULT_BLOCK = `context Proof
agg  Grant @ src/grant.ts: GrantState, GrantCmd -> GrantEvent
step mergeGrantIn : GrantInput -> Eff<never, GrantProblem, MergeGrant>
step judge : MergeGrant -> Verdict
flow grant = mergeGrantIn >=> judge
step listGrants : GrantInput -> MergeGrant[]
step countGrants : MergeGrant[] -> number
flow count = listGrants >=> countGrants`;

const RESULT_CELLS = [
	"src/grant.ts#mergeGrantIn",
	"src/grant.ts#judge",
	"src/grant.ts#listGrants",
	"src/grant.ts#countGrants",
];

const EFFECT_BLOCK = `context Proof
step mergeGrantIn : GrantInput -> Eff<Git, GrantProblem, MergeGrant>`;

async function verdict(
	root: string,
	text: string,
	cells: readonly string[],
	reading: Reading,
) {
	const parsed = block(text);
	const ports = new Map([["Git", "src/ports.ts"]]);
	return typeCheck(
		witnessSource(parsed, stepLinks(root, parsed, cells, ports), reading),
	);
}

function lines(run: Awaited<ReturnType<typeof verdict>>) {
	if (!run.ok) return run.error.message;
	return run.value.kind === "pass"
		? "pass"
		: run.value.findings.map((finding) => finding.line);
}

const SAFE_COUNT = RESULT_BLOCK.replace(
	"\nflow count = listGrants >=> countGrants",
	"",
);

const TUPLES = `
export function pair(grant: MergeGrant): [MergeGrant, Verdict] {
	return [grant, judge(grant)];
}

export function split(grant: MergeGrant): [Verdict, MergeGrant] {
	return [judge(grant), grant];
}

export function many(grant: MergeGrant): MergeGrant[] {
	return [grant, grant];
}
`;

const TUPLE_BLOCK = `context Proof
step pair : MergeGrant -> (MergeGrant, Verdict)
step split : MergeGrant -> (MergeGrant, Verdict)
step many : MergeGrant -> (MergeGrant, MergeGrant)`;

describe("the tsc witness", () => {
	test(
		"[control:witness-wrong-type] a linked mergeGrantIn that returns MergeGrant[] fails at its block line in each reading, a tuple in the other order and an array for a tuple fail at their lines, and the corrected fixture passes",
		async () => {
			const wrong = GRANT.replace(
				"Result<MergeGrant, GrantProblem> {",
				"Result<MergeGrant[], GrantProblem> {",
			).replace(
				"value: { actor: input.actor, at: 1 } }",
				"value: [{ actor: input.actor, at: 1 }] }",
			);
			const wrongEffect = GRANT_EFFECT.replace(
				"Effect.Effect<MergeGrant, GrantProblem, Git>",
				"Effect.Effect<MergeGrant[], GrantProblem, Git>",
			);
			const results = {
				result: lines(
					await verdict(witnessRepo({}), SAFE_COUNT, RESULT_CELLS, "result"),
				),
				resultWrong: lines(
					await verdict(
						witnessRepo({ "src/grant.ts": wrong }),
						SAFE_COUNT,
						RESULT_CELLS,
						"result",
					),
				),
				effect: lines(
					await verdict(
						witnessRepo({}),
						EFFECT_BLOCK,
						["src/grant-effect.ts#mergeGrantIn"],
						"effect",
					),
				),
				effectWrong: lines(
					await verdict(
						witnessRepo({ "src/grant-effect.ts": wrongEffect }),
						EFFECT_BLOCK,
						["src/grant-effect.ts#mergeGrantIn"],
						"effect",
					),
				),
				tupleOrderAndArray: lines(
					await verdict(
						witnessRepo({ "src/grant.ts": GRANT + TUPLES }),
						TUPLE_BLOCK,
						["src/grant.ts#pair", "src/grant.ts#split", "src/grant.ts#many"],
						"result",
					),
				),
			};
			expect(results).toEqual({
				result: "pass",
				resultWrong: [3, 5],
				effect: "pass",
				effectWrong: [2],
				tupleOrderAndArray: [3, 4],
			});
		},
		heavyTestTimeout,
	);

	test(
		"[control:witness-wrong-forms] a wrong decide, a misfit flow pair, an unresolved name and a generic link fail at their lines",
		async () => {
			const root = witnessRepo({
				"src/grant.ts": GRANT.replace(
					"decide(state: GrantState, cmd: GrantCmd)",
					"decide(state: GrantState, cmd: GrantInput)",
				).replace("cmd.ask.actor", "cmd.actor"),
			});
			const text = `${RESULT_BLOCK}\nstep pick : MergeGrant[] -> MergeGrant\nstep audit : Missing -> Verdict`;
			const run = await verdict(
				root,
				text,
				[...RESULT_CELLS, "src/grant.ts#pick", "src/grant.ts#audit"],
				"result",
			);
			expect(
				run.ok && run.value.kind === "fail"
					? run.value.findings.map((finding) => [
							finding.line,
							finding.message.split(":")[0],
						])
					: run,
			).toEqual([
				[2, "agg Grant decide"],
				[8, "flow count listGrants >=> countGrants (MergeGrant[])"],
				[9, "step pick"],
				[10, "step audit parameter 1"],
			]);
		},
		heavyTestTimeout,
	);

	test(
		"[control:witness-leaves-no-file] a run leaves no file in its cache folder, and two runs of one source give one verdict",
		async () => {
			const root = witnessRepo({});
			const parsed = block(RESULT_BLOCK);
			const source = witnessSource(
				parsed,
				stepLinks(root, parsed, RESULT_CELLS, new Map()),
				"result",
			);
			const first = await typeCheck(source);
			const second = await typeCheck(source);
			const left = readdirSync(join(root, WITNESS_CACHE), {
				recursive: true,
				withFileTypes: true,
			}).filter((entry) => !entry.isDirectory());
			expect({ same: second, left: left.length }).toEqual({
				same: first,
				left: 0,
			});
			expect(lines(first)).toEqual([8]);
		},
		heavyTestTimeout,
	);

	test.each([
		{
			name: "noUnusedLocals and noUnusedParameters keep a correct block with no flow passing",
			options: { noUnusedLocals: true, noUnusedParameters: true },
			text: "context Proof\nstep judge : MergeGrant -> Verdict",
			expected: "pass",
		},
		{
			name: "noCheck keeps a wrong type failing at its line",
			options: { noCheck: true },
			text: "context Proof\nstep judge : MergeGrant -> MergeGrant",
			expected: [2],
		},
	])(
		"[control:witness-checker-options] a repo tsconfig with $name",
		async ({ options, text, expected }) => {
			const root = witnessRepo({
				"tsconfig.json": JSON.stringify({
					...TSCONFIG,
					compilerOptions: { ...TSCONFIG.compilerOptions, ...options },
				}),
			});
			expect(
				lines(await verdict(root, text, ["src/grant.ts#judge"], "result")),
			).toEqual(expected);
		},
		heavyTestTimeout,
	);

	test("a module under another tsconfig and a missing tsc stop the witness", async () => {
		const root = witnessRepo({
			"src/other/tsconfig.json": JSON.stringify(TSCONFIG),
			"src/other/grant.ts": GRANT,
		});
		const text = `context Proof
step mergeGrantIn : GrantInput -> Eff<never, GrantProblem, MergeGrant>
step judge : MergeGrant -> Verdict`;
		expect(
			lines(
				await verdict(
					root,
					text,
					["src/grant.ts#mergeGrantIn", "src/other/grant.ts#judge"],
					"result",
				),
			),
		).toBe(
			"src/other/grant.ts is under another tsconfig than tsconfig.json, so one witness cannot check both",
		);
		rmSync(join(root, "node_modules/.bin/tsc"));
		expect(lines(await verdict(root, text, RESULT_CELLS, "result"))).toBe(
			"node_modules/.bin/tsc is missing, so the witness cannot run tsc",
		);
	});
});
