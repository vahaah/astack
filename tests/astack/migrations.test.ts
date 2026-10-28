import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	compareMigrations,
	migrationFile,
	parseApplied,
	sqlFingerprint,
} from "../../src/astack/migrations.ts";

describe("sqlFingerprint", () => {
	test("drops comments, whitespace and statement ends, and keeps strings and quoted names as written", () => {
		expect(
			sqlFingerprint(
				"create table a (id int); -- note\n/* block /* nested */ */\nselect 'x -- y', \"a--b\";\n",
			),
		).toBe("createtablea(idint)select'x -- y',\"a--b\"");
	});

	test("drops a comment inside a dollar-quoted body, so a comment added later is no change", () => {
		const applied =
			"do $$\nbegin\n  perform 1;\nend\n$$;\ncreate function f() returns int language sql as $fn$ select 1 $fn$";
		const edited =
			"do $$\nbegin\n  -- why this block runs\n  perform 1; /* see the ADR */\nend\n$$;\n\ncreate function f() returns int language sql as $fn$\n  select 1 -- one\n$fn$;\n";
		expect(sqlFingerprint(edited)).toBe(sqlFingerprint(applied));
		expect(sqlFingerprint(applied)).toBe(
			"do$$beginperform1end$$createfunctionf()returnsintlanguagesqlas$fn$select1$fn$",
		);
	});

	test("a dollar sign in a string, an escape string or a positional parameter opens no dollar quote", () => {
		expect(sqlFingerprint("select '$$ -- kept'; -- dropped")).toBe(
			"select'$$ -- kept'",
		);
		expect(sqlFingerprint("select E'it\\'s -- kept' -- dropped")).toBe(
			"selectE'it\\'s -- kept'",
		);
		expect(sqlFingerprint("select $1 -- dropped\n, a$b$ from t")).toBe(
			"select$1,a$b$fromt",
		);
	});

	test("a change of a statement is a change of the fingerprint", () => {
		expect(sqlFingerprint("alter table a add column b int;")).not.toBe(
			sqlFingerprint("alter table a add column b bigint;"),
		);
		expect(sqlFingerprint("select 'a b'")).not.toBe(
			sqlFingerprint("select 'ab'"),
		);
	});
});

describe("migrationFile", () => {
	test("reads the version from a file name in the form of the Supabase CLI", () => {
		expect(
			migrationFile("20260526151647_add_settings.sql", "select 1;"),
		).toEqual({
			version: "20260526151647",
			file: "20260526151647_add_settings.sql",
			body: "select 1;",
		});
		expect(migrationFile("README.md", "")).toBeUndefined();
		expect(migrationFile("seed.sql", "")).toBeUndefined();
	});
});

describe("parseApplied", () => {
	test("reads the rows that psql prints as JSON", () => {
		expect(
			parseApplied([
				{ version: "1", name: "a", statements: ["select 1"] },
				{ version: "2", name: null, statements: null },
			]),
		).toEqual([
			{ version: "1", name: "a", statements: ["select 1"] },
			{ version: "2", name: null, statements: null },
		]);
	});

	test("refuses a row of another shape", () => {
		expect(parseApplied([{ version: 1, statements: [] }])).toBeUndefined();
		expect(parseApplied([{ version: "1", statements: [1] }])).toBeUndefined();
		expect(parseApplied({ version: "1" })).toBeUndefined();
	});
});

describe("compareMigrations", () => {
	const file = (version: string, body: string) => ({
		version,
		file: `${version}_m.sql`,
		body,
	});

	test("a stack that applied the files of the branch has no drift, and a file it did not apply is pending", () => {
		expect(
			compareMigrations(
				[
					{ version: "1", name: "m", statements: ["create table a (id int)"] },
					{ version: "2", name: "m", statements: [] },
				],
				[
					file("1", "-- the first table\ncreate table a (\n  id int\n);\n"),
					file("2", "-- nothing to do\n"),
					file("3", "select 1;"),
				],
			),
		).toEqual([{ kind: "pending", version: "3", file: "3_m.sql" }]);
	});

	test("a changed body, a row with no statements and a version with no file are drift", () => {
		expect(
			compareMigrations(
				[
					{ version: "1", name: "m", statements: ["create table a (id int)"] },
					{ version: "2", name: "m", statements: null },
					{ version: "4", name: "other_branch", statements: ["select 4"] },
				],
				[file("1", "create table a (id bigint);"), file("2", "select 2;")],
			),
		).toEqual([
			{ kind: "changed", version: "1", file: "1_m.sql" },
			{ kind: "unrecorded", version: "2", file: "2_m.sql" },
			{ kind: "foreign", version: "4", name: "other_branch" },
		]);
	});
});

describe("astack check migrations", () => {
	const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");
	const root = mkdtempSync(join(tmpdir(), "astack-migrations-"));
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	const bin = join(root, "bin");
	const dir = join(root, "supabase/migrations");
	mkdirSync(bin, { recursive: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(bin, "psql"),
		[
			"#!/bin/sh",
			'echo "$@" > "$ASTACK_TEST_ARGS"',
			'case "$*" in',
			'  *to_regclass*) cat "$ASTACK_TEST_TABLE" ;;',
			'  *) cat "$ASTACK_TEST_ROWS" ;;',
			"esac",
			"",
		].join("\n"),
	);
	chmodSync(join(bin, "psql"), 0o755);
	writeFileSync(
		join(dir, "1_first.sql"),
		"-- added later\ncreate table a (id int);\n",
	);
	writeFileSync(join(dir, "2_second.sql"), "create table b (id int);\n");
	writeFileSync(join(dir, "3_third.sql"), "create table c (id int);\n");

	const reset = "cd supabase && supabase db reset";
	const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

	function run(
		rows: unknown,
		args: readonly string[],
		table = "t",
	): { code: number | null; out: string; err: string; psqlArgs: string } {
		writeFileSync(join(root, "rows.json"), `${JSON.stringify(rows)}\n`);
		writeFileSync(join(root, "table.txt"), `${table}\n`);
		const result = spawnSync(
			process.execPath,
			[CLI, "check", "migrations", ...args],
			{
				cwd: root,
				encoding: "utf8",
				env: {
					...process.env,
					PATH: `${bin}:${process.env.PATH ?? ""}`,
					ASTACK_TEST_ROWS: join(root, "rows.json"),
					ASTACK_TEST_TABLE: join(root, "table.txt"),
					ASTACK_TEST_ARGS: join(root, "args.txt"),
				},
			},
		);
		return {
			code: result.status,
			out: result.stdout,
			err: result.stderr,
			psqlArgs: readFileSync(join(root, "args.txt"), "utf8"),
		};
	}

	const applied = [
		{ version: "1", name: "first", statements: ["create table a (id int)"] },
		{ version: "2", name: "second", statements: ["create table b (id int)"] },
	];

	test("before migration up, a stack that matches the branch passes and names the pending files", () => {
		const result = run(applied, [
			"supabase/migrations",
			"--db",
			url,
			"--reset",
			reset,
			"--allow-pending",
		]);
		expect(result.code).toBe(0);
		expect(result.out).toBe(
			"2 applied migrations match the files in supabase/migrations. 1 file is not applied yet: 3_third.sql.\n",
		);
		expect(result.psqlArgs).toStartWith(`${url} -XAtq -v ON_ERROR_STOP=1 -c `);
	});

	test("after migration up, a file that is still not applied fails", () => {
		const result = run(applied, [
			"supabase/migrations",
			"--db",
			url,
			"--reset",
			reset,
		]);
		expect(result.code).toBe(1);
		expect(result.out).toBe(
			[
				"3_third.sql is not applied.",
				"The local stack does not match the migrations of this branch, so a gate on it can test the wrong schema.",
				"astack never resets a database. To make the stack again from the files of this branch, run this command yourself. It deletes the data in the local stack:",
				`  ${reset}`,
				"",
			].join("\n"),
		);
	});

	test("a changed body, a row with no statements and a migration of another branch stop the gate with the reset command", () => {
		const result = run(
			[
				{
					version: "1",
					name: "first",
					statements: ["create table a (id bigint)"],
				},
				{ version: "2", name: "second", statements: null },
				{ version: "9", name: "other_branch", statements: ["select 9"] },
			],
			["supabase/migrations", "--db", url, "--reset", reset, "--allow-pending"],
		);
		expect(result.code).toBe(1);
		expect(result.out).toBe(
			[
				"1_first.sql changed after the stack applied it. The statements that the stack recorded for version 1 are different.",
				"The stack recorded no statements for version 2, so astack cannot compare it with 2_second.sql.",
				"The stack applied version 9 (other_branch), and this branch has no file for it.",
				"The local stack does not match the migrations of this branch, so a gate on it can test the wrong schema.",
				"astack never resets a database. To make the stack again from the files of this branch, run this command yourself. It deletes the data in the local stack:",
				`  ${reset}`,
				"",
			].join("\n"),
		);
	});

	test("a stack whose rows are larger than the default spawn buffer is read in full", () => {
		const big = join(root, "big/migrations");
		mkdirSync(big, { recursive: true });
		const body = `insert into t values ('${"x".repeat(4 * 1024 * 1024)}')`;
		writeFileSync(join(big, "1_big.sql"), `${body};\n`);
		const result = run(
			[{ version: "1", name: "big", statements: [body] }],
			["big/migrations", "--db", url, "--reset", reset],
		);
		expect(result.err).toBe("");
		expect(result.out).toBe(
			"1 applied migration matches the files in big/migrations.\n",
		);
		expect(result.code).toBe(0);
	});

	test("a stack with no migration table has applied nothing", () => {
		const result = run(
			[],
			["supabase/migrations", "--db", url, "--reset", reset, "--allow-pending"],
			"f",
		);
		expect(result.code).toBe(0);
		expect(result.out).toBe(
			"0 applied migrations match the files in supabase/migrations. 3 files are not applied yet: 1_first.sql, 2_second.sql, 3_third.sql.\n",
		);
	});

	test("the folder, the database and the reset command are required", () => {
		const result = run(applied, ["supabase/migrations", "--db", url]);
		expect(result.code).toBe(2);
		expect(result.err).toBe(
			"astack check migrations: give the migration folder, --db <url> and --reset <command>\n",
		);
	});

	test("rows that psql cannot give stop the check with the error", () => {
		const result = run("not rows", [
			"supabase/migrations",
			"--db",
			url,
			"--reset",
			reset,
		]);
		expect(result.code).toBe(2);
		expect(result.err).toBe(
			"astack check migrations: the rows of supabase_migrations.schema_migrations have an unknown shape\n",
		);
	});
});
