import { describe, expect, test } from "bun:test";
import {
	classesOf,
	type ModuleFacts,
	moduleFacts,
} from "../../src/astack/domain/imports.ts";

function facts(text: string, path = "src/m.ts"): ModuleFacts {
	const read = moduleFacts(path, text);
	if (!read.ok) throw new Error(read.error.message);
	return read.value;
}

describe("moduleFacts", () => {
	test.each([
		[
			"a read name of node:fs",
			'import { statSync } from "node:fs";',
			["fs-read"],
		],
		[
			"a read name of fs/promises",
			'import { readFile } from "fs/promises";',
			["fs-read"],
		],
		[
			"a namespace import of node:fs",
			'import * as fs from "node:fs";',
			["fs-read", "fs-write"],
		],
		[
			"the unknown name watch",
			'import { watch } from "node:fs";',
			["fs-read", "fs-write"],
		],
		["a default import of fs", 'import fs from "fs";', ["fs-read", "fs-write"]],
		[
			"a re-export of a write name",
			'export { rmSync } from "node:fs";',
			["fs-read", "fs-write"],
		],
		[
			"node:child_process",
			'import { spawnSync } from "node:child_process";',
			["spawn"],
		],
		["Bun.spawn", 'Bun.spawn(["ls"]);', ["spawn"]],
		[
			"a literal dynamic import",
			'await import("node:child_process");',
			["spawn"],
		],
		["node:net", 'import { connect } from "node:net";', ["network"]],
		["node:http", 'import { get } from "node:http";', ["network"]],
		["node:https", 'import { request } from "node:https";', ["network"]],
		["a bare fetch call", "await fetch(url);", ["network"]],
		["node:os", 'import { homedir } from "node:os";', ["env"]],
		["process.env", "const home = process.env.HOME;", ["env"]],
		[
			"an object key named import beside process.env",
			"const options = { import: mode, home() { return process.env.HOME; } };",
			["env"],
		],
		["process.cwd", "const dir = process.cwd();", ["env"]],
		["Date.now", "const at = Date.now();", ["clock"]],
		["a bare new Date()", "const at = new Date();", ["clock"]],
		["performance.now", "const at = performance.now();", ["clock"]],
		["Math.random", "const n = Math.random();", ["random"]],
		["crypto.randomUUID", "const id = crypto.randomUUID();", ["random"]],
		["import type", 'import type { Stats } from "node:fs";', []],
		["a named type import", 'import { type Stats } from "node:fs";', []],
		["export type from", 'export type { Stats } from "node:fs";', []],
		["a string", 'const text = "process.env and fetch(x) and Date.now()";', []],
		["a comment", "// const at = Date.now(); fetch(x)", []],
		[
			"a member fetch and a dated new Date",
			"client.fetch(x); new Date(0);",
			[],
		],
		[
			"a JSON import",
			'import data from "./data.json" with { type: "json" };',
			[],
		],
	])(
		"[control:effects-module-facts] %s gives its class",
		(_name, text, classes) => {
			const found: readonly string[] = classesOf(facts(text).uses);
			expect(found).toEqual(classes);
		},
	);

	test("it lists the value imports, the unknown imports and the exports at their lines", () => {
		const read = facts(
			[
				'import type { Plan } from "./plan.ts";',
				'import { ok, type Result } from "../result.ts";',
				'export * from "./all.ts";',
				"const mod = await import(name);",
				'const old = require("node:fs");',
				"export function run(): void {}",
				"export const LIMIT = 1;",
				'type Local = { a: typeof import("./t.ts") };',
				"class Loader { import(path: string): void {} }",
				"export { run as start, LIMIT };",
				'export { check as verify } from "./check.ts";',
			].join("\n"),
		);
		expect({
			imports: read.imports,
			unknown: read.unknown,
			exports: read.exports,
			classes: classesOf(read.uses),
		}).toEqual({
			imports: [
				{ line: 2, specifier: "../result.ts" },
				{ line: 3, specifier: "./all.ts" },
				{ line: 11, specifier: "./check.ts" },
			],
			unknown: [
				{ line: 4, form: "import()" },
				{ line: 5, form: "require" },
			],
			exports: ["run", "LIMIT", "start", "verify"],
			classes: [],
		});
	});

	test("a prototype key of the class tables, such as constructor.name, gives no use", () => {
		expect(
			facts(
				'const kind = constructor.name;\ntoString.call(x);\nimport { m } from "constructor";',
			).uses,
		).toEqual([]);
	});

	test("a throw statement and an unsafe cast count, and as const, satisfies and a throw in a string do not", () => {
		const read = facts(
			[
				"const plan = value as Plan;",
				"const keys = ['a'] as const;",
				"const typed = { a: 1 } satisfies Shape;",
				'const word = "throw";',
				'throw new Error("no");',
			].join("\n"),
		);
		expect({ throws: read.throws, casts: read.casts }).toEqual({
			throws: [5],
			casts: [1],
		});
	});

	test("a module that the scanner cannot read gives a scan stop", () => {
		expect(moduleFacts("src/bad.ts", 'const a = "open;\n')).toEqual({
			ok: false,
			error: {
				path: "src/bad.ts",
				message: "the types scanner cannot read the module",
			},
		});
	});
});
