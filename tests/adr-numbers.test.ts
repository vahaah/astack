import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adrFolder, adrNumber, treeProblems } from "../src/astack/adr.ts";

const ROOT = resolve(import.meta.dir, "..");
const DIR = "docs/adr";

test("[control:adr-tree] each ADR in docs/adr takes a number that no other ADR holds, and each index row and relation holds", () => {
	const folder = adrFolder(
		DIR,
		readdirSync(resolve(ROOT, DIR))
			.sort()
			.map((name) => ({
				path: `${DIR}/${name}`,
				text: readFileSync(resolve(ROOT, DIR, name), "utf8"),
			})),
	);
	expect(folder.files.map((file) => adrNumber(file.path))).toContain("0001");
	expect(folder.index?.path).toBe(`${DIR}/README.md`);
	expect(treeProblems(folder)).toEqual([]);
});
