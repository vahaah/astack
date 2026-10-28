import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateJson } from "../../scripts/dist/json-schema.ts";

const SCHEMAS = resolve(
	import.meta.dir,
	"../../upstream/cursor-plugin-schemas/schemas",
);
const plugin: unknown = JSON.parse(
	readFileSync(join(SCHEMAS, "plugin.schema.json"), "utf8"),
);
const marketplace: unknown = JSON.parse(
	readFileSync(join(SCHEMAS, "marketplace.schema.json"), "utf8"),
);

describe("the JSON schema subset", () => {
	test("accepts a valid Cursor plugin manifest", () => {
		expect(
			validateJson(plugin, {
				name: "astack",
				version: "0.1.0",
				author: { name: "A" },
				homepage: "https://example.com/astack",
				skills: "./skills/",
				hooks: "./hooks/hooks.json",
				minClientVersions: { cursor: "3.13.0", grokbot: "never" },
			}),
		).toEqual([]);
	});

	test("refuses an unknown key, a bad name, a bad URL and a bad version gate", () => {
		const errors = validateJson(plugin, {
			name: "Bad Name",
			extra: true,
			homepage: "not a url",
			minClientVersions: { cursor: "soon" },
		});
		expect(errors).toContain(": unknown property extra");
		expect(
			errors.some((error) => error.startsWith("/name: does not match")),
		).toBe(true);
		expect(errors).toContain("/homepage: not a valid uri");
		expect(
			errors.some((error) => error.startsWith("/minClientVersions/cursor")),
		).toBe(true);
	});

	test("checks required keys and the items of a marketplace", () => {
		expect(validateJson(marketplace, { plugins: [] })).toContain(
			": missing name",
		);
		expect(
			validateJson(marketplace, {
				name: "m",
				plugins: [{ name: "astack" }],
			}),
		).toContain("/plugins/0: missing source");
	});
});
