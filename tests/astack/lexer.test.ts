import { describe, expect, test } from "bun:test";
import { unitsOf } from "../../src/astack/comments/added.ts";
import {
	type LanguageId,
	languageOf,
	lex,
} from "../../src/astack/comments/lexer.ts";

function commentTexts(source: string, language: LanguageId): string[] {
	const result = lex(source, language);
	expect(result.complete).toBe(true);
	return result.comments.map((comment) =>
		source.slice(comment.start, comment.end),
	);
}

function unitLines(source: string, language: LanguageId): string[][] {
	return (unitsOf(source, language) ?? []).map((unit) =>
		unit.lines.map((line) => `${line.line}:${line.text}`),
	);
}

describe("languageOf", () => {
	test.each([
		["a.ts", "ts"],
		["types.d.ts", "ts"],
		["a.tsx", "tsx"],
		["a.mjs", "jsx"],
		["a.cjs", "jsx"],
		["q.sql", "sql"],
		["A.swift", "swift"],
		["a.kt", "kotlin"],
		["main.go", "go"],
		["lib.rs", "rust"],
		["a.css", "css"],
		["a.scss", "scss"],
		["a.py", "python"],
		["run.sh", "shell"],
	] as const)("%s is %s", (path, language) => {
		const expected: LanguageId = language;
		expect(languageOf(path)).toBe(expected);
	});

	test.each(["README.md", "Makefile", "data.json", ".env", "dir.ts/file"])(
		"%s has no comment syntax",
		(path) => {
			expect(languageOf(path)).toBeUndefined();
		},
	);
});

describe("TypeScript and JavaScript", () => {
	test("finds line, block and doc comments with line numbers", () => {
		const source =
			'const a = 1; // trailing\n/* block */\n/** doc\n * more\n */\nexport const b = "x";\n';
		expect(unitLines(source, "ts")).toEqual([
			["1:trailing"],
			["2:block"],
			["3:doc", "4:more", "5:"],
		]);
	});

	test("ignores comment markers inside strings, templates and regex literals", () => {
		const source = [
			'const url = "https://example.com/a//b";',
			"const single = '/* not */';",
			`const tpl = \`a // b \${'/* c */' + \`// nested \${x}\`} d\`;`,
			"const re = /\\/\\/+/g;",
			"const cls = /[/]/;",
			"const ratio = total / count; // real",
		].join("\n");
		expect(commentTexts(source, "ts")).toEqual(["// real"]);
	});

	test("treats a directive prologue and a shebang as code", () => {
		const source =
			"#!/usr/bin/env bun\n\"use client\";\n'use strict';\nexport {};\n";
		expect(commentTexts(source, "jsx")).toEqual([]);
	});

	test("reads triple-slash references as comments for the classifier to keep", () => {
		expect(
			commentTexts('/// <reference types="vite/client" />\n', "ts"),
		).toEqual(['/// <reference types="vite/client" />']);
	});

	test("skips JSX text, including apostrophes and slashes, and finds JSX comments", () => {
		const source = [
			"export function Card() {",
			"  return (",
			'    <div className="card" data-url="http://x.dev/y">',
			"      Don't // stop at this text",
			"      {/* the real comment */}",
			"      <span title='it''s'>{value /* inline */}</span>",
			"    </div>",
			"  );",
			"}",
			"// after jsx",
		].join("\n");
		expect(commentTexts(source, "tsx")).toEqual([
			"/* the real comment */",
			"/* inline */",
			"// after jsx",
		]);
	});

	test("does not read TypeScript generics as JSX in tsx files", () => {
		const source =
			"const id = <T,>(x: T) => x;\ntype F = { f: <T>(x: T) => T };\nconst n = a < b; // cmp\n";
		expect(commentTexts(source, "tsx")).toEqual(["// cmp"]);
	});

	test("does not start JSX in plain .ts files", () => {
		const source = "const cast = <Foo>value; // cast\n";
		expect(commentTexts(source, "ts")).toEqual(["// cast"]);
	});

	test("reports an unterminated template literal as incomplete", () => {
		expect(lex("const a = `open\n// not a comment\n", "ts").complete).toBe(
			false,
		);
	});

	test("groups consecutive line comments into one unit and keeps directives apart", () => {
		const source = [
			"// first line",
			"// second line",
			"// biome-ignore lint/style/noNonNullAssertion: filled above",
			"const a = b!;",
		].join("\n");
		expect(unitLines(source, "ts")).toEqual([
			["1:first line", "2:second line"],
			["3:biome-ignore lint/style/noNonNullAssertion: filled above"],
		]);
	});
});

describe("SQL", () => {
	test("finds -- and /* */ comments, including nested blocks", () => {
		const source = "-- top\nselect 1; /* a /* nested */ b */\n";
		expect(commentTexts(source, "sql")).toEqual([
			"-- top",
			"/* a /* nested */ b */",
		]);
	});

	test("treats comment on DDL and quoted text as data", () => {
		const source = [
			"comment on column jobs.status is '-- not a comment /* nor this */';",
			"comment on table jobs is $$ -- still data $$;",
			"select 'it''s -- data', E'\\' -- data', \"col--name\" from t;",
		].join("\n");
		expect(commentTexts(source, "sql")).toEqual([]);
	});

	test("finds comments inside function bodies", () => {
		const source =
			"create function f() returns int as $$\nbegin\n  -- inside body\n  return 1;\nend;\n$$ language plpgsql;\n";
		expect(commentTexts(source, "sql")).toEqual(["-- inside body"]);
	});
});

describe("C-like languages", () => {
	test("Swift handles nested blocks, interpolation and raw strings", () => {
		const source = [
			"/* outer /* inner */ still outer */",
			'let s = "value \\(f("// no")) end" // yes',
			'let r = #"raw // no"#',
			'let m = """',
			"// no",
			'"""',
		].join("\n");
		expect(commentTexts(source, "swift")).toEqual([
			"/* outer /* inner */ still outer */",
			"// yes",
		]);
	});

	test("Go handles raw strings and runes", () => {
		const source = "s := `raw // no`\nc := '/'\n// yes\n";
		expect(commentTexts(source, "go")).toEqual(["// yes"]);
	});

	test("Rust handles raw strings and lifetimes", () => {
		const source =
			"fn f<'a>(x: &'a str) -> &'a str { x } // yes\nlet r = r#\"raw // no\"#;\n";
		expect(commentTexts(source, "rust")).toEqual(["// yes"]);
	});

	test("Kotlin handles templates", () => {
		const source = `val s = "a \${map["k"]} // no" // yes\n`;
		expect(commentTexts(source, "kotlin")).toEqual(["// yes"]);
	});

	test("CSS has only block comments and SCSS ignores url() slashes", () => {
		expect(
			commentTexts(
				"a { background: url(http://x.dev/a.png); } /* yes */\n",
				"css",
			),
		).toEqual(["/* yes */"]);
		expect(
			commentTexts(
				"a { background: url(http://x.dev/a.png); } // yes\n",
				"scss",
			),
		).toEqual(["// yes"]);
	});
});

describe("Python and shell", () => {
	test("Python skips the shebang and strings", () => {
		const source =
			'#!/usr/bin/env python3\nx = "# no"\ny = """\n# no\n"""\n# yes\n';
		expect(commentTexts(source, "python")).toEqual(["# yes"]);
	});

	test("shell reads # only at a word start and skips heredocs", () => {
		const source = [
			"#!/bin/sh",
			`echo "\${#items[@]}" $# a#b # yes`,
			"cat <<'EOF'",
			"# not a comment",
			"EOF",
			"# also yes",
		].join("\n");
		expect(commentTexts(source, "shell")).toEqual(["# yes", "# also yes"]);
	});
});

describe("TSX regressions from the repo audit", () => {
	test("an element with type arguments closes at its own />", () => {
		const source = [
			"export const Toggle = () => (",
			"  <SegmentedTabs<ProjectsView>",
			'    value="browse"',
			"  />",
			");",
			"// after",
		].join("\n");
		expect(commentTexts(source, "tsx")).toEqual(["// after"]);
	});

	test("line comments between attributes are comments, apostrophes and all", () => {
		const source = [
			"const a = (",
			"  <Component",
			"    // The caller's own style wins.",
			"    style={style}",
			"  />",
			");",
		].join("\n");
		expect(commentTexts(source, "tsx")).toEqual([
			"// The caller's own style wins.",
		]);
	});
});
