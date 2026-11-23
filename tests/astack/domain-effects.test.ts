import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
	classesThroughImports,
	type EffectFinding,
	effectFindings,
} from "../../src/astack/domain/effects.ts";
import {
	type ModuleFacts,
	moduleFacts,
} from "../../src/astack/domain/imports.ts";
import {
	type BlockLine,
	parseCard,
	parseDomainBlock,
} from "../../src/astack/domain/notation.ts";
import type { ContextsCard } from "../../src/astack/domain/rules.ts";

const FIXTURE = join(import.meta.dir, "../fixtures/domain/effects");

function files(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? files(join(dir, entry.name))
			: [relative(FIXTURE, join(dir, entry.name))],
	);
}

const FACTS: readonly ModuleFacts[] = files(FIXTURE)
	.sort()
	.map((path) => {
		const read = moduleFacts(path, readFileSync(join(FIXTURE, path), "utf8"));
		if (!read.ok) throw new Error(read.error.message);
		return read.value;
	});

function lines(text: string): BlockLine[] {
	return text.split("\n").map((line, index) => ({ n: index + 1, text: line }));
}

function card(text: string): ContextsCard {
	const parsed = parseCard([
		{
			path: "CONTEXT.md",
			text: `## Contexts\n\n\`\`\`domain\n${text}\n\`\`\`\n`,
		},
	]);
	if (!parsed.ok || parsed.value.kind === "none")
		throw new Error(JSON.stringify(parsed));
	return parsed.value;
}

const CARD = card(`context Kernel shared : src/astack/state.ts
context App : src/app/**
context Guards : src/astack/pr/**
cap  Files [fs-read] @ src/app/port.ts: load(read), save(write)
pure src/astack/pr/grant.ts
pure src/app/hatches.ts`);

function block(text: string) {
	const parsed = parseDomainBlock(lines(text));
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
	return parsed.value;
}

function advice(found: readonly EffectFinding[]): string[] {
	return found
		.filter((one) => one.kind === "advice")
		.map((one) => `${one.path}:${one.line}: ${one.rule}: ${one.message}`);
}

describe("effectFindings", () => {
	test("[control:effects-card-rules] the card and block rules flag grant.ts as on main, a throw and a cast in a pure module, an extra cap class, a missing op and a misfit step", () => {
		const found = effectFindings(FACTS, {
			card: CARD,
			block: block(`context App
step parse : string -> number
step ping : number -> Eff<Files.load, never, number>`),
			cells: [
				{ line: 9, cell: "src/app/parse.ts#parse" },
				{ line: 9, cell: "src/app/ping.ts#ping" },
			],
		});
		expect(advice(found)).toEqual([
			"src/app/hatches.ts:7: pure: a pure module throws; return the failure as a Result",
			"src/app/hatches.ts:8: pure: a pure module casts a type; parse or narrow the value",
			"src/app/parse.ts:1: step: step parse allows none by its row, but its module has fs-read, spawn (fs-read by src/app/port.ts, spawn by src/app/port.ts)",
			"src/app/ping.ts:4: step: step ping allows fs-read by its row, but its module has clock (clock by Date.now)",
			"src/app/port.ts:1: cap: the port exports no save, which Files.save names",
			"src/app/port.ts:2: cap: cap Files allows fs-read, but its port also has spawn (spawn by node:child_process)",
			"src/astack/pr/grant.ts:1: pure: a pure line of CONTEXT.md names this module, but it has fs-read, fs-write (fs-read by node:fs, fs-write by node:fs mkdirSync)",
		]);
	});

	test("an import cycle ends, and each member gets the union of the classes", () => {
		const classes = classesThroughImports(FACTS);
		expect([
			[...(classes.get("src/app/ping.ts")?.keys() ?? [])],
			[...(classes.get("src/app/pong.ts")?.keys() ?? [])],
		]).toEqual([["clock"], ["clock"]]);
	});

	test("[control:effects-totality] a module outside each context glob, a cross-context import with no map line and an unresolved import give reports, and Kernel is free to import", () => {
		const reports = (text: string, maps: string) =>
			effectFindings(FACTS, {
				card: card(text),
				block: block(`context App\n${maps}`),
				cells: [],
			})
				.filter((one) => one.kind === "report")
				.map((one) => `${one.path}:${one.line}: ${one.rule}`);
		const split = `context Kernel shared : src/astack/state.ts
context App : src/app/alias.ts, src/app/port.ts, src/app/parse.ts, src/app/hatches.ts, src/app/pong.ts
context Clock : src/app/ping.ts
context Guards : src/astack/pr/**`;
		expect({
			mapped: reports(
				split,
				"map  App => Guards: a plan maps to a grant, eq x   check: prop m",
			),
			unmapped: reports(split, "rung R0"),
			unowned: reports(
				"context Kernel shared : src/astack/state.ts\ncontext App : src/app/**",
				"rung R0",
			),
		}).toEqual({
			mapped: [
				"src/app/alias.ts:1: import",
				"src/app/alias.ts:3: import",
				"src/app/ping.ts:1: context",
				"src/app/pong.ts:1: context",
			],
			unmapped: [
				"src/app/alias.ts:1: import",
				"src/app/alias.ts:2: context",
				"src/app/alias.ts:3: import",
				"src/app/ping.ts:1: context",
				"src/app/pong.ts:1: context",
			],
			unowned: [
				"src/app/alias.ts:1: import",
				"src/app/alias.ts:3: import",
				"src/astack/pr/grant.ts:1: unowned",
			],
		});
	});
});
