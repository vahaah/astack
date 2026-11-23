import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { err, ok, type Result } from "./result.ts";
import { parseRecord, type ReviewRecord } from "./review-record.ts";

export type RecordProblem =
	| { readonly kind: "missing"; readonly path: string }
	| {
			readonly kind: "unreadable";
			readonly path: string;
			readonly message: string;
	  };

export type StoreProblem = { readonly path: string; readonly message: string };

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function parsedJson(text: string): Result<unknown, string> {
	try {
		return ok(JSON.parse(text));
	} catch {
		return err("not JSON");
	}
}

export function loadRecord(path: string): Result<ReviewRecord, RecordProblem> {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		return err(
			isMissing(error)
				? { kind: "missing", path }
				: { kind: "unreadable", path, message: messageOf(error) },
		);
	}
	const json = parsedJson(text);
	const record = json.ok ? parseRecord(json.value) : json;
	return record.ok
		? record
		: err({ kind: "unreadable", path, message: record.error });
}

export function saveRecord(
	record: ReviewRecord,
	path: string,
): Result<void, StoreProblem> {
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(temporary, `${JSON.stringify(record, null, "\t")}\n`);
		renameSync(temporary, path);
		return ok(undefined);
	} catch (error) {
		return err({ path, message: messageOf(error) });
	}
}
