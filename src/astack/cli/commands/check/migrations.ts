import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	type AppliedMigration,
	compareMigrations,
	type MigrationDrift,
	type MigrationFile,
	migrationFile,
	parseApplied,
} from "../../../migrations.ts";
import { err, ok, type Result } from "../../../result.ts";
import { positional, valueAfter } from "../../args.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check migrations";
const TABLE = "supabase_migrations.schema_migrations";
const PRESENT = `select to_regclass('${TABLE}') is not null`;
const PSQL_MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;
const ROWS = `select coalesce(json_agg(json_build_object('version', version, 'name', name, 'statements', statements) order by version), '[]'::json) from ${TABLE}`;

function psql(io: Io, url: string, sql: string): Result<string, string> {
	const result = spawnSync(
		"psql",
		[url, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", sql],
		{
			cwd: io.cwd,
			env: io.env,
			encoding: "utf8",
			maxBuffer: PSQL_MAX_OUTPUT_BYTES,
		},
	);
	if (result.error !== undefined) return err(result.error.message);
	if (result.status !== 0) return err(result.stderr.trim());
	return ok(result.stdout.trim());
}

function readApplied(
	io: Io,
	url: string,
): Result<readonly AppliedMigration[], string> {
	const present = psql(io, url, PRESENT);
	if (!present.ok) return err(`psql cannot read ${TABLE}: ${present.error}`);
	if (present.value === "f") return ok([]);
	const rows = psql(io, url, ROWS);
	if (!rows.ok) return err(`psql cannot read ${TABLE}: ${rows.error}`);
	let parsed: unknown;
	try {
		parsed = JSON.parse(rows.value);
	} catch {
		parsed = undefined;
	}
	const applied = parseApplied(parsed);
	return applied === undefined
		? err(`the rows of ${TABLE} have an unknown shape`)
		: ok(applied);
}

function readFiles(dir: string): Result<readonly MigrationFile[], string> {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return err(`cannot read the folder ${dir}`);
	}
	return ok(
		names
			.flatMap((name) => {
				const file = migrationFile(name, readFileSync(join(dir, name), "utf8"));
				return file === undefined ? [] : [file];
			})
			.sort((a, b) => a.version.localeCompare(b.version)),
	);
}

function driftLine(drift: MigrationDrift): string {
	switch (drift.kind) {
		case "changed":
			return `${drift.file} changed after the stack applied it. The statements that the stack recorded for version ${drift.version} are different.`;
		case "unrecorded":
			return `The stack recorded no statements for version ${drift.version}, so astack cannot compare it with ${drift.file}.`;
		case "foreign":
			return `The stack applied version ${drift.version}${drift.name === null ? "" : ` (${drift.name})`}, and this branch has no file for it.`;
		case "pending":
			return `${drift.file} is not applied.`;
	}
}

function pendingNote(pending: readonly MigrationDrift[]): string {
	if (pending.length === 0) return "";
	const files = pending.flatMap((drift) =>
		drift.kind === "pending" ? [drift.file] : [],
	);
	const count = files.length === 1 ? "1 file is" : `${files.length} files are`;
	return ` ${count} not applied yet: ${files.join(", ")}.`;
}

function run(args: readonly string[], io: Io): number {
	const [folder] = positional(args, ["--db", "--reset"]);
	const url = valueAfter(args, "--db");
	const reset = valueAfter(args, "--reset");
	if (
		folder === undefined ||
		typeof url !== "string" ||
		typeof reset !== "string"
	)
		return usageError(
			io,
			`${NAME}: give the migration folder, --db <url> and --reset <command>`,
		);
	const files = readFiles(resolve(io.cwd, folder));
	if (!files.ok) return usageError(io, `${NAME}: ${files.error}`);
	const applied = readApplied(io, url);
	if (!applied.ok) return usageError(io, `${NAME}: ${applied.error}`);
	const drift = compareMigrations(applied.value, files.value);
	const allowPending = args.includes("--allow-pending");
	const pending = drift.filter((item) => item.kind === "pending");
	const blocking = allowPending
		? drift.filter((item) => item.kind !== "pending")
		: drift;
	if (blocking.length === 0) {
		const matched = applied.value.length;
		io.out(
			`${matched} applied ${matched === 1 ? "migration matches" : "migrations match"} the files in ${folder}.${pendingNote(pending)}\n`,
		);
		return 0;
	}
	for (const item of blocking) io.out(`${driftLine(item)}\n`);
	io.out(
		[
			"The local stack does not match the migrations of this branch, so a gate on it can test the wrong schema.",
			"astack never resets a database. To make the stack again from the files of this branch, run this command yourself. It deletes the data in the local stack:",
			`  ${reset}`,
			"",
		].join("\n"),
	);
	return 1;
}

export const command: Command = {
	name: "migrations",
	summary:
		"Compares the migrations that a local Supabase stack applied with the migration files of the branch. It reads supabase_migrations.schema_migrations through psql, and ignores comments and whitespace. Exits 1 when a body changed, when the stack recorded no statements, when the stack applied a version that the branch has no file for, or when a file is not applied and --allow-pending is absent. It prints the reset command for the owner, and never resets.",
	usage:
		"check migrations <folder> --db <url> --reset <command> [--allow-pending]",
	run,
};
