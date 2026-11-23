import { describe, expect, test } from "bun:test";
import {
	absFindings,
	changeFindings,
} from "../../src/astack/domain/effect-change.ts";
import type { EffectFinding } from "../../src/astack/domain/effects.ts";
import {
	type ModuleFacts,
	moduleFacts,
} from "../../src/astack/domain/imports.ts";
import {
	parseCard,
	parseDomainBlock,
} from "../../src/astack/domain/notation.ts";
import type { ContextsCard } from "../../src/astack/domain/rules.ts";

function facts(modules: Readonly<Record<string, string>>): ModuleFacts[] {
	return Object.entries(modules).map(([path, text]) => {
		const read = moduleFacts(path, text);
		if (!read.ok) throw new Error(read.error.message);
		return read.value;
	});
}

const parsedCard = parseCard([
	{
		path: "CONTEXT.md",
		text: "## Contexts\n\n```domain\ncontext App : src/**\ncap  Store [fs-read] @ src/store.ts: load(read)\n```\n",
	},
]);
if (!parsedCard.ok || parsedCard.value.kind === "none")
	throw new Error("the card does not parse");
const CARD: ContextsCard = parsedCard.value;

function block(text: string) {
	const parsed = parseDomainBlock(
		text.split("\n").map((line, index) => ({ n: index + 1, text: line })),
	);
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
	return parsed.value;
}

function lines(found: readonly EffectFinding[]): string[] {
	return found.map(
		(one) =>
			`${one.kind}: ${one.path}:${one.line}: ${one.rule}: ${one.message}`,
	);
}

const BASE = facts({
	"src/run.ts": 'import { join } from "node:path";\nexport const a = join;\n',
	"src/store.ts": "export function load(): string { return ''; }\n",
	"src/gone.ts": 'import { spawn } from "node:child_process";\n',
});

const HEAD = facts({
	"src/run.ts":
		'import { join } from "node:path";\nimport { spawnSync } from "node:child_process";\nexport const a = [join, spawnSync];\n',
	"src/store.ts":
		'import { readFileSync } from "node:fs";\nexport function load(): string { return readFileSync("x", "utf8"); }\n',
	"src/new.ts": "export const at = Date.now();\n",
	"src/same.ts": "export const b = 1;\n",
});

describe("changeFindings", () => {
	test("[control:effects-change-named] a module that gains spawn with no step link or cap port gets one advice line with both class sets", () => {
		expect(
			lines(
				changeFindings(BASE, HEAD, {
					card: CARD,
					block: block("context App\nstep stamp : void -> number"),
					cells: [{ line: 4, cell: "src/new.ts#stamp" }],
				}),
			),
		).toEqual([
			"advice: src/run.ts:2: change: the own classes change from none at the base to spawn, and no step link or cap port of the plan block names this module",
		]);
	});

	test("with no block, each module whose own classes change gets advice", () => {
		expect(
			changeFindings(BASE, HEAD, {
				card: CARD,
				block: undefined,
				cells: [],
			}).map((one) => `${one.path}:${one.line}`),
		).toEqual(["src/run.ts:2", "src/store.ts:1", "src/new.ts:1"]);
	});
});

describe("absFindings", () => {
	const modules = facts({
		"src/rule.ts": "export const rule = 1;\n",
		"src/a.ts": 'import { rule } from "./rule.ts";\nexport const a = rule;\n',
		"src/b.ts": 'import { rule } from "./rule.js";\nexport const b = rule;\n',
		"src/c.ts": 'import type { rule } from "./rule.ts";\nexport const c = 1;\n',
	});
	const abs = (callers: string, deletion: string) =>
		lines(
			absFindings(
				modules,
				block(
					`context App\nabs  src/rule.ts: hides the rule, callers ${callers}, deletion ${deletion}, alt inline it`,
				),
				"docs/plans/p.md",
			),
		);

	test("[control:effects-abs-callers] a wrong caller list and a wrong spread count give advice at the abs line", () => {
		expect({
			right: abs("src/a.ts src/b.ts", "spreads 2"),
			wrong: abs("src/a.ts src/c.ts", "spreads 3"),
		}).toEqual({
			right: [],
			wrong: [
				"advice: docs/plans/p.md:2: abs: abs src/rule.ts names the caller src/c.ts, which does not import it by value",
				"advice: docs/plans/p.md:2: abs: abs src/rule.ts spreads 3, but 2 modules import it",
			],
		});
	});

	test("a caller list shorter than the importers gives the count advice", () => {
		expect(abs("src/a.ts", "inline")).toEqual([
			"advice: docs/plans/p.md:2: abs: abs src/rule.ts lists 1 callers, but 2 modules under the code roots import it: src/a.ts, src/b.ts",
		]);
	});
});
