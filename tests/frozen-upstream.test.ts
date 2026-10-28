import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, REPO_ROOT } from "../scripts/lib/files.ts";

type SnapshotRead = { readonly path: string; readonly line: number };

const DIST_INPUT = "cursor-plugin-schemas";
const QUOTE = "[\"'`]";
const LITERAL_READ = new RegExp(
	String.raw`(?<![\w.-])upstream/(?!${DIST_INPUT}(?![\w.-]))[\w.$-]`,
	"g",
);
const ARGUMENTS_TWO_CALLS_DEEP = String.raw`(?:[^()]|\((?:[^()]|\([^()]*\))*\))*?`;
const JOIN_READ = new RegExp(
	String.raw`\b(?:join|resolve)\(${ARGUMENTS_TWO_CALLS_DEEP}(${QUOTE})upstream\1(?!\s*,\s*${QUOTE}${DIST_INPUT}${QUOTE})`,
	"g",
);
const SCRIPT_PATH = /\.(?:[cm]?[jt]sx?|sh|py)$|(?:^|\/)package\.json$/;
const NEVER_SCANNED = [".git", "node_modules", "upstream"];

function snapshotReadLines(text: string): number[] {
	return [...text.matchAll(LITERAL_READ), ...text.matchAll(JOIN_READ)]
		.map(
			(match) =>
				text.slice(0, match.index + match[0].length).split("\n").length,
		)
		.sort((left, right) => left - right);
}

function snapshotReadsOutside(skipped: readonly string[]): SnapshotRead[] {
	return readdirSync(REPO_ROOT, { withFileTypes: true })
		.filter((entry) => !skipped.includes(entry.name))
		.flatMap((entry) =>
			entry.isDirectory() ? listFiles(REPO_ROOT, entry.name) : [entry.name],
		)
		.flatMap((path) => {
			const text = readFileSync(join(REPO_ROOT, path), "utf8");
			if (!SCRIPT_PATH.test(path) && !text.startsWith("#!")) return [];
			return snapshotReadLines(text).map((line) => ({ path, line }));
		});
}

describe("ADR 0001 D3: only tests read the frozen upstream snapshots", () => {
	test.each([
		[
			"a literal path into a snapshot",
			'const text = readFileSync(join(root, "upstream/pstack/LICENSE"), "utf8");',
			[1],
		],
		[
			"a template path with a snapshot variable",
			`const file = Bun.file(\`\${root}/upstream/\${name}/LICENSE\`);`,
			[1],
		],
		[
			"a join with the upstream folder across lines and nested calls",
			'const dir = join(\n\tdirname(fileURLToPath(import.meta.url)),\n\t"..",\n\t"upstream",\n\tname,\n);',
			[4],
		],
		[
			"a resolve with the upstream folder and a snapshot name",
			'const dir = resolve(root, "upstream", "mattpocock-skills");',
			[1],
		],
		[
			"the dist input by a literal path",
			'const schemas = join(root, "upstream/cursor-plugin-schemas/schemas");',
			[],
		],
		[
			"the dist input by a join",
			'const schemas = join(root, "upstream", "cursor-plugin-schemas", "schemas");',
			[],
		],
	])("%s", (_, source, lines) => {
		expect(snapshotReadLines(source)).toEqual(lines);
	});

	test("no script outside tests/ reads a snapshot", () => {
		expect(snapshotReadsOutside([...NEVER_SCANNED, "tests"])).toEqual([]);
	});

	test("the same scan with tests/ finds the reads of the registry test", () => {
		const paths = snapshotReadsOutside(NEVER_SCANNED).map(({ path }) => path);
		expect(paths).toContain("tests/upstreams.test.ts");
	});
});
