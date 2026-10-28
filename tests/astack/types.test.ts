import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { globToRegExp } from "../../src/astack/glob.ts";
import {
	checkTypes,
	denies,
	type FileReport,
	isTypeSource,
} from "../../src/astack/types/check.ts";
import {
	typeAdviceMessage,
	typeDenyMessage,
} from "../../src/astack/types/messages.ts";
import {
	EMPTY_POLICY,
	parseTypePolicy,
	type TypePolicy,
} from "../../src/astack/types/policy.ts";
import { findHatches } from "../../src/astack/types/syntax.ts";

const FIXTURES = resolve(import.meta.dir, "../fixtures/types");

function fixture(name: string): string {
	return readFileSync(join(FIXTURES, name), "utf8");
}

function kinds(source: string, jsx = false): string[] {
	return (findHatches(source, { jsx, angleCasts: !jsx }) ?? []).map((hatch) =>
		hatch.detail ? `${hatch.kind}:${hatch.detail}` : hatch.kind,
	);
}

function report(
	before: string | undefined,
	after: string,
	relPath = "src/invite.ts",
	policy: TypePolicy = EMPTY_POLICY,
): FileReport {
	const result = checkTypes({ relPath, before, after }, policy);
	if (!result) throw new Error("the fixture did not tokenize");
	return result;
}

function rises(result: FileReport): string[] {
	return result.rises.map(
		(rise) => `${rise.kind} ${rise.before}->${rise.after} ${rise.severity}`,
	);
}

describe("findHatches", () => {
	test("finds explicit any only in type positions", () => {
		expect(
			kinds(
				"function f(a: any, b: Array<any>): Promise<any> { return g<any>(a); }",
			),
		).toEqual(["any", "any", "any", "any"]);
		expect(
			kinds("const any = 1; const o = { any }; z.any(); if (!any) {} any = 2;"),
		).toEqual([]);
	});

	test("finds casts and leaves as const, satisfies and a bare as unknown", () => {
		expect(kinds("const a = x as Foo; const b = <Bar>y;")).toEqual([
			"cast:plain",
			"cast:angle",
		]);
		expect(
			kinds(
				"const a = [1] as const; const b = x satisfies T; const c = x as unknown; const d = <const>['a'];",
			),
		).toEqual([]);
	});

	test("counts both halves of a double cast and names the cast shape", () => {
		expect(kinds("const n = s as unknown as number;")).toEqual([
			"cast:double",
			"cast:double",
		]);
		expect(
			kinds(
				"const a = JSON.parse(t) as A; const b = (await r.json()) as B; const c = v as any;",
			),
		).toEqual(["cast:json-parse", "cast:response-json", "cast:as-any", "any"]);
	});

	test("an angle bracket in a .tsx file is a generic or JSX, never a cast", () => {
		expect(
			kinds("const f = <T,>(x: T): T => x; const el = <div>{x}</div>;", true),
		).toEqual([]);
		expect(
			kinds("const f = <T,>(x: T): T => x; const g = <T>(x: T) => x;"),
		).toEqual([]);
	});

	test("ignores aliases in import and export lists and mapped key remaps", () => {
		expect(kinds(fixture("aliases.ts"))).toEqual([]);
	});

	test("an object key named like a keyword does not hide the code after it", () => {
		expect(
			kinds(
				"const o = {\n\timport: x as Y,\n\ttype: z!,\n};\nobj.enum = w as V;",
			),
		).toEqual(["cast:plain", "non-null", "cast:plain"]);
	});

	test("finds postfix and definite-assignment non-null assertions only", () => {
		expect(
			kinds(
				"const id = rows[0]!.id; let c!: Client; class A { p!: string }; const v = f()!;",
			),
		).toEqual(["non-null", "non-null", "non-null", "non-null"]);
		expect(kinds("const ok = !x && a != b && a !== c;\nfoo()\n!bar;")).toEqual(
			[],
		);
	});

	test("reads compiler directives from comments, in JSX braces too", () => {
		expect(
			kinds(
				"// @ts-ignore\nconst a = 1;\n/* @ts-expect-error */\n// @ts-nocheck\n// a note on @ts-ignore",
			),
		).toEqual(["ts-ignore", "ts-expect-error", "ts-nocheck"]);
		expect(
			kinds("const el = <p>{/* @ts-expect-error */}{x}</p>;", true),
		).toEqual(["ts-expect-error"]);
	});

	test("never counts text in strings, templates, regexes, comments or JSX", () => {
		expect(kinds(fixture("masked.tsx"), true)).toEqual([]);
		expect(kinds(fixture("template.ts"))).toEqual(["cast:plain"]);
	});

	test("finds Function, Object and {} only as types, and allows string & {}", () => {
		expect(
			kinds(
				"type A = Function; let o: Object; type E = {}; type S = string & {}; const v = {}; Object.keys(v); interface I extends J {}",
			),
		).toEqual(["banned-type:Function", "banned-type:Object", "banned-type:{}"]);
	});

	test("finds enum declarations and class bases, not z.enum calls", () => {
		expect(kinds(fixture("advice.ts"))).toEqual([
			"enum:Role",
			"extends:BaseImporter",
			"banned-type:Function",
		]);
		expect(
			kinds(
				"const e = z.enum(['a']); class G extends Data.TaggedError('G')<{ a: string }> {}",
			),
		).toEqual(["extends:Data.TaggedError"]);
	});

	test("returns undefined when the file does not tokenize", () => {
		expect(
			findHatches(fixture("broken.ts"), { jsx: false, angleCasts: true }),
		).toBe(undefined);
	});
});

describe("checkTypes compares counts, so old lines are not blamed", () => {
	const base = fixture("base.ts");

	test("a touched old cast line passes", () => {
		expect(rises(report(base, fixture("touched.ts")))).toEqual([]);
	});

	test("a formatter reflow of old lines passes", () => {
		expect(rises(report(base, fixture("reflowed.ts")))).toEqual([]);
	});

	test("a moved cast passes", () => {
		expect(rises(report(base, fixture("moved.ts")))).toEqual([]);
	});

	test("a new cast in a file with old casts is denied and named", () => {
		const result = report(base, fixture("new-cast.ts"));
		expect(rises(result)).toEqual(["cast 3->4 deny"]);
		expect(result.rises[0]?.found).toEqual([
			{
				line: 21,
				quote: "return (await response.json()) as { total: number };",
				detail: "response-json",
			},
		]);
		expect(denies(result)).toBe(true);
	});

	test("each new any, non-null assertion and suppression is denied", () => {
		const result = report(base, fixture("new-hatches.ts"));
		expect(rises(result)).toEqual([
			"any 1->2 deny",
			"non-null 1->2 deny",
			"ts-ignore 0->1 deny",
		]);
		expect(
			result.rises.map((rise) => rise.found.map((found) => found.line)),
		).toEqual([[20], [22], [21]]);
	});

	test("a new file counts from zero", () => {
		expect(rises(report(undefined, base))).toEqual([
			"any 0->1 deny",
			"cast 0->3 deny",
			"non-null 0->1 deny",
		]);
	});

	test("removing a cast and adding another keeps the count, so it passes", () => {
		const after = base.replace(
			"return input as unknown as number;",
			"return Number(input);",
		);
		expect(
			rises(report(base, `${after}\nexport const n = v as unknown as N;\n`)),
		).toEqual([]);
	});

	test("enum, class inheritance and banned types are advice", () => {
		const result = report(undefined, fixture("advice.ts"));
		expect(rises(result)).toEqual([
			"banned-type 0->1 advise",
			"enum 0->1 advise",
			"extends 0->1 advise",
		]);
		expect(denies(result)).toBe(false);
	});

	test("allowed forms and allowlisted bases give nothing", () => {
		expect(rises(report(undefined, fixture("allowed.ts")))).toEqual([]);
		expect(
			rises(
				report(
					undefined,
					"class Live extends Effect.Service<Live>()('Live', {}) {}\nclass Tag extends Context.Tag('T')<Tag, number>() {}\nclass View extends React.Component<P> {}",
				),
			),
		).toEqual([]);
	});

	test("@ts-expect-error is legal only in a *.test-d.ts file", () => {
		const text = fixture("invite.test-d.ts");
		expect(rises(report(undefined, text, "src/invite.test-d.ts"))).toEqual([]);
		expect(rises(report(undefined, text, "src/invite.test.ts"))).toEqual([
			"ts-expect-error 0->1 deny",
		]);
	});

	test("a file that does not tokenize fails open", () => {
		expect(
			checkTypes(
				{ relPath: "src/a.ts", before: base, after: fixture("broken.ts") },
				EMPTY_POLICY,
			),
		).toBe(undefined);
	});
});

describe("generated files and the repo profile", () => {
	const typed = (relPath: string, after: string, policy = EMPTY_POLICY) =>
		isTypeSource({ relPath, before: undefined, after }, policy);

	test("only TypeScript sources are checked, and declaration files are skipped", () => {
		for (const path of ["src/a.ts", "src/a.tsx", "src/a.mts", "src/a.cts"])
			expect(typed(path, "")).toBe(true);
		for (const path of [
			"src/a.js",
			"src/a.d.ts",
			"src/a.d.mts",
			"src/api.gen.ts",
			"src/db.generated.ts",
			"src/generated/client.ts",
			"node_modules/x/index.ts",
			"tests/fixtures/a.ts",
		])
			expect(typed(path, "")).toBe(false);
	});

	test("a generated header or Supabase type output skips the file", () => {
		expect(typed("src/a.ts", fixture("generated.ts"))).toBe(false);
		expect(typed("src/types/db.ts", fixture("supabase.ts"))).toBe(false);
		expect(typed("src/a.ts", "// AUTO-GENERATED by codegen\nexport {};")).toBe(
			false,
		);
	});

	test("profile skip globs skip files", () => {
		const policy = parseTypePolicy({
			skip: ["legacy/**", "*.stories.tsx"],
		});
		expect(typed("legacy/old/a.ts", "", policy)).toBe(false);
		expect(typed("src/ui/button.stories.tsx", "", policy)).toBe(false);
		expect(typed("src/a.ts", "", policy)).toBe(true);
	});

	test("an allow entry with a reason exempts its kinds in its paths", () => {
		const policy = parseTypePolicy({
			allow: [
				{
					paths: ["packages/kernel/src/brand.ts"],
					kinds: ["cast"],
					reason: "brand constructors",
				},
				{ paths: ["src/**"], kinds: ["any"] },
			],
		});
		const text = "export const id = (raw: string) => raw as UserId;";
		expect(
			rises(report(undefined, text, "packages/kernel/src/brand.ts", policy)),
		).toEqual([]);
		expect(rises(report(undefined, text, "src/brand.ts", policy))).toEqual([
			"cast 0->1 deny",
		]);
		expect(rises(report(undefined, "let a: any;", "src/a.ts", policy))).toEqual(
			["any 0->1 deny"],
		);
	});

	test("extendsAllow adds base classes to the allowlist", () => {
		const policy = parseTypePolicy({ extendsAllow: ["^Base[A-Z]\\w*$", "("] });
		expect(policy.extendsAllow).toHaveLength(1);
		expect(
			rises(
				report(undefined, "class A extends BaseModel {}", "src/a.ts", policy),
			),
		).toEqual([]);
	});

	test("globs match like a .gitignore pattern without a slash", () => {
		expect(globToRegExp("*.ts").test("deep/dir/a.ts")).toBe(true);
		expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
		expect(globToRegExp("src/*.ts").test("src/x/a.ts")).toBe(false);
		expect(globToRegExp("src/**/a.ts").test("src/a.ts")).toBe(true);
		expect(globToRegExp("src/**/a.ts").test("src/x/y/a.ts")).toBe(true);
		expect(globToRegExp("./db?.ts").test("db1.ts")).toBe(true);
	});
});

describe("messages", () => {
	const base = fixture("base.ts");

	test("the deny message points at the new lines and gives the fix pattern", () => {
		const message = typeDenyMessage("this edit", [
			report(base, fixture("new-hatches.ts")),
			report(base, fixture("new-cast.ts"), "src/quote.ts"),
		]);
		expect(message).toStartWith(
			"astack blocked this edit. It adds code that hides type errors from the compiler.\n- src/invite.ts: `any` type, 2 now and 1 before.\n  - line 20: export function lastRow(rows: readonly { id: string }[], fallback: any) {",
		);
		for (const phrase of [
			"Use `unknown` for data that you did not parse.",
			"the schema that owns the shape",
			"a type guard, such as `isRecord(value)`",
			"`const unhandled: never = value`",
			"In Effect code, use `Option`.",
			"`response.json()` returns data that nobody checked",
			"An old line that you move or touch does not count.",
			"`types.allow`",
		])
			expect(message).toContain(phrase);
	});

	test("advice lists the rises and the replacement forms", () => {
		const message = typeAdviceMessage([
			report(undefined, fixture("advice.ts")),
		]);
		expect(message).toStartWith(
			"astack: this change adds type code to review.\n",
		);
		expect(message).toContain("- src/invite.ts: `enum`, 1 now and 0 before.");
		expect(message).toContain("Use a union of string literals");
	});
});
