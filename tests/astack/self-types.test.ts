import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Glob } from "bun";
import { checkTypes } from "../../src/astack/types/check.ts";
import { typePolicy } from "../../src/astack/types/policy.ts";

const ROOT = resolve(import.meta.dir, "../..");

describe("astack's own code", () => {
	test("holds no any, unsafe cast, non-null assertion or compiler suppression", () => {
		const policy = typePolicy(ROOT);
		const found: string[] = [];
		for (const pattern of ["src/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts"])
			for (const relPath of new Glob(pattern).scanSync(ROOT)) {
				if (relPath.includes("/fixtures/")) continue;
				const after = readFileSync(resolve(ROOT, relPath), "utf8");
				const report = checkTypes(
					{ relPath, before: undefined, after },
					policy,
				);
				for (const rise of report?.rises ?? [])
					if (rise.severity === "deny")
						for (const occurrence of rise.found)
							found.push(`${relPath}:${occurrence.line} ${rise.kind}`);
			}
		expect(found).toEqual([]);
	});
});
