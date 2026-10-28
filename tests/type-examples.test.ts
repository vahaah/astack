import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DOCUMENT = join(
	ROOT,
	"marketplace/plugins/astack/skills/types/references/typescript-practices.md",
);
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-type-example-"));
	dirs.push(dir);
	return dir;
}

function selectionExample(): string {
	const text = readFileSync(DOCUMENT, "utf8");
	const alias = /^type NonEmpty<T> =[^\n]+;/m.exec(text)?.[0];
	const selection =
		/^function pickWinner\(entries: NonEmpty<string>\): string \{[\s\S]*?^\}/m.exec(
			text,
		)?.[0];
	if (alias === undefined || selection === undefined)
		throw new Error("The documented nonempty selection example is missing.");
	return `${alias}\n${selection}\n`;
}

test("the documented nonempty selection compiles with strict indexed access", () => {
	const dir = scratch();
	writeFileSync(join(dir, "example.ts"), selectionExample());
	writeFileSync(
		join(dir, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				noUncheckedIndexedAccess: true,
				noEmit: true,
				types: [],
				target: "ES2022",
			},
			files: ["example.ts"],
		}),
	);
	const result = spawnSync(
		join(ROOT, "node_modules/.bin/tsc"),
		["-p", join(dir, "tsconfig.json")],
		{ encoding: "utf8" },
	);
	expect({
		code: result.status,
		output: result.stdout + result.stderr,
	}).toEqual({
		code: 0,
		output: "",
	});
});

test("the documented selection reaches each position and consumes randomness once", () => {
	const dir = scratch();
	const script = join(dir, "selection.ts");
	writeFileSync(
		script,
		`${selectionExample()}
const entries: NonEmpty<string> = ["first", "middle", "last"];
const scenarios: Array<{ entries: NonEmpty<string>; random: number }> = [
  { entries, random: 0 },
  { entries, random: 0.5 },
  { entries, random: 0.999 },
  { entries: ["only"], random: 0.75 },
];
const results = scenarios.map((scenario) => {
  let calls = 0;
  Math.random = () => {
    calls += 1;
    return scenario.random;
  };
  return { value: pickWinner(scenario.entries), calls };
});
console.log(JSON.stringify(results));
`,
	);
	const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
	expect({ code: result.status, stderr: result.stderr }).toEqual({
		code: 0,
		stderr: "",
	});
	const actual: unknown = JSON.parse(result.stdout);
	expect(actual).toEqual([
		{ value: "first", calls: 1 },
		{ value: "middle", calls: 1 },
		{ value: "last", calls: 1 },
		{ value: "only", calls: 1 },
	]);
});
