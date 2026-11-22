import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChangeProof } from "../../src/astack/change-proof/contract.ts";

const REFERENCES = join(
	import.meta.dir,
	"../../marketplace/plugins/astack/skills/pr-review-hardening/references",
);
const CONTRACT = readFileSync(join(REFERENCES, "proof-contract.md"), "utf8");
const EXAMPLE_TEXT = readFileSync(
	join(REFERENCES, "proof-example.json"),
	"utf8",
);

function slug(heading: string): string {
	return heading
		.toLowerCase()
		.replaceAll(/[^a-z0-9 -]/g, "")
		.replaceAll(" ", "-");
}

const SECTIONS = new Map(
	CONTRACT.split(/^## /m)
		.slice(1)
		.map((section) => [slug(section.split("\n")[0] ?? ""), section]),
);

function codeTokens(text: string): ReadonlySet<string> {
	return new Set(
		[...text.matchAll(/`([^`]+)`/g)].flatMap((span) =>
			(span[1] ?? "").split(/[^A-Za-z0-9_]+/).filter(Boolean),
		),
	);
}

function nestedKeys(value: unknown): readonly string[] {
	if (Array.isArray(value)) return value.flatMap(nestedKeys);
	if (typeof value !== "object" || value === null) return [];
	return Object.entries(value).flatMap(([key, child]) => [
		key,
		...nestedKeys(child),
	]);
}

const ROWS = (SECTIONS.get("required-records") ?? "")
	.split("\n")
	.filter((line) => line.startsWith("| `"))
	.map((line) => {
		const [, records = "", keys = ""] = line.split("|");
		return { records: codeTokens(records), text: `${records}|${keys}` };
	});

function documented(record: string): ReadonlySet<string> {
	const row = ROWS.find((candidate) => candidate.records.has(record));
	if (row === undefined) return new Set();
	const linked = [...row.text.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map(
		(link) => SECTIONS.get(link[1] ?? "") ?? "",
	);
	return codeTokens([row.text, ...linked].join("\n"));
}

describe("the proof contract reference", () => {
	test("[control:proof-example-parses] the example manifest parses", () => {
		const parsed = parseChangeProof(EXAMPLE_TEXT);
		expect(parsed.ok && parsed.value.change).toBe("gate-admission");
	});

	test("[control:proof-example-parses] each key of the example is in the row of its record or in the section that the row links", () => {
		const example: Record<string, unknown> = JSON.parse(EXAMPLE_TEXT);
		const missing = Object.entries(example).flatMap(([record, value]) => {
			const known = documented(record);
			return [record, ...nestedKeys(value)]
				.filter((key) => !known.has(key))
				.map((key) => `${record}: ${key}`);
		});
		expect([...new Set(missing)]).toEqual([]);
	});
});
