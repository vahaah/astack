export type AppliedMigration = {
	readonly version: string;
	readonly name: string | null;
	readonly statements: readonly string[] | null;
};

export type MigrationFile = {
	readonly version: string;
	readonly file: string;
	readonly body: string;
};

export type MigrationDrift =
	| {
			readonly kind: "changed";
			readonly version: string;
			readonly file: string;
	  }
	| {
			readonly kind: "unrecorded";
			readonly version: string;
			readonly file: string;
	  }
	| {
			readonly kind: "foreign";
			readonly version: string;
			readonly name: string | null;
	  }
	| {
			readonly kind: "pending";
			readonly version: string;
			readonly file: string;
	  };

const MIGRATION_NAME = /^(\d+)_.*\.sql$/;

const IDENTIFIER_CHAR = /[\p{L}\p{N}_$]/u;

const DOLLAR_TAG = /^\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/u;

export function migrationFile(
	file: string,
	body: string,
): MigrationFile | undefined {
	const version = MIGRATION_NAME.exec(file)?.[1];
	return version === undefined ? undefined : { version, file, body };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatements(value: unknown): value is readonly string[] | null {
	return (
		value === null ||
		(Array.isArray(value) && value.every((item) => typeof item === "string"))
	);
}

function appliedRow(value: unknown): AppliedMigration | undefined {
	if (!isRecord(value)) return undefined;
	const { version, name, statements } = value;
	if (typeof version !== "string") return undefined;
	if (name !== null && typeof name !== "string") return undefined;
	if (!isStatements(statements)) return undefined;
	return { version, name, statements };
}

export function parseApplied(value: unknown): AppliedMigration[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const rows: AppliedMigration[] = [];
	for (const item of value) {
		const row = appliedRow(item);
		if (row === undefined) return undefined;
		rows.push(row);
	}
	return rows;
}

function blockCommentEnd(sql: string, from: number): number {
	let depth = 0;
	let at = from;
	while (at < sql.length) {
		if (sql.startsWith("/*", at)) {
			depth += 1;
			at += 2;
		} else if (sql.startsWith("*/", at)) {
			depth -= 1;
			at += 2;
			if (depth === 0) return at;
		} else at += 1;
	}
	return sql.length;
}

function quotedEnd(
	sql: string,
	from: number,
	quote: string,
	backslash: boolean,
): number {
	let at = from + 1;
	while (at < sql.length) {
		const char = sql[at];
		if (backslash && char === "\\") at += 2;
		else if (char === quote && sql[at + 1] === quote) at += 2;
		else if (char === quote) return at + 1;
		else at += 1;
	}
	return sql.length;
}

function follows(sql: string, at: number): boolean {
	const before = sql[at - 1];
	return before !== undefined && IDENTIFIER_CHAR.test(before);
}

function isEscapeString(sql: string, at: number): boolean {
	const prefix = sql[at - 1];
	return (prefix === "E" || prefix === "e") && !follows(sql, at - 1);
}

export function sqlFingerprint(sql: string): string {
	let out = "";
	let at = 0;
	while (at < sql.length) {
		const char = sql[at] ?? "";
		if (sql.startsWith("--", at)) {
			const end = sql.indexOf("\n", at);
			at = end < 0 ? sql.length : end;
		} else if (sql.startsWith("/*", at)) {
			at = blockCommentEnd(sql, at);
		} else if (char === "'" || char === '"') {
			const end = quotedEnd(
				sql,
				at,
				char,
				char === "'" && isEscapeString(sql, at),
			);
			out += sql.slice(at, end);
			at = end;
		} else if (char === "$" && !follows(sql, at)) {
			const tag = DOLLAR_TAG.exec(sql.slice(at))?.[0];
			if (tag === undefined) {
				out += char;
				at += 1;
			} else {
				const close = sql.indexOf(tag, at + tag.length);
				const end = close < 0 ? sql.length : close;
				out += `${tag}${sqlFingerprint(sql.slice(at + tag.length, end))}${close < 0 ? "" : tag}`;
				at = close < 0 ? sql.length : close + tag.length;
			}
		} else if (char === ";" || /\s/.test(char)) {
			at += 1;
		} else {
			out += char;
			at += 1;
		}
	}
	return out;
}

export function compareMigrations(
	applied: readonly AppliedMigration[],
	files: readonly MigrationFile[],
): MigrationDrift[] {
	const byVersion = new Map(files.map((file) => [file.version, file]));
	const appliedVersions = new Set(applied.map((row) => row.version));
	const drift = applied.flatMap((row): MigrationDrift[] => {
		const file = byVersion.get(row.version);
		if (file === undefined)
			return [{ kind: "foreign", version: row.version, name: row.name }];
		if (row.statements === null)
			return [{ kind: "unrecorded", version: row.version, file: file.file }];
		return sqlFingerprint(row.statements.join("\n")) ===
			sqlFingerprint(file.body)
			? []
			: [{ kind: "changed", version: row.version, file: file.file }];
	});
	const pending = files
		.filter((file) => !appliedVersions.has(file.version))
		.map(
			(file): MigrationDrift => ({
				kind: "pending",
				version: file.version,
				file: file.file,
			}),
		);
	return [...drift, ...pending];
}
