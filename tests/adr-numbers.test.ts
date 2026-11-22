import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

test("each ADR in docs/adr takes a number that no other ADR holds", () => {
	const numbers = readdirSync(resolve(import.meta.dir, "../docs/adr"))
		.filter((name) => /^\d{4}-.+\.md$/.test(name))
		.map((name) => name.slice(0, 4))
		.sort();
	expect(numbers).toContain("0001");
	expect(numbers).toEqual([...new Set(numbers)]);
});
