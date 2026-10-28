import { createHash } from "node:crypto";

export type WatchedFile = {
	readonly path: string;
	readonly content: Uint8Array | undefined;
};

export type StackRecord = {
	readonly project: string;
	readonly checkout: string;
	readonly files: string;
	readonly containers: readonly string[];
};

export type StoredRecord =
	| { readonly kind: "missing" }
	| { readonly kind: "unreadable"; readonly path: string }
	| { readonly kind: "found"; readonly record: StackRecord };

export type StackConfigVerdict =
	| { readonly kind: "no-container" }
	| { readonly kind: "no-record" }
	| { readonly kind: "unreadable"; readonly path: string }
	| { readonly kind: "restarted" }
	| { readonly kind: "other-files"; readonly record: StackRecord }
	| { readonly kind: "same-files" };

export type StartVerdict =
	| { readonly kind: "no-container" }
	| { readonly kind: "kept" }
	| { readonly kind: "fresh"; readonly containers: readonly string[] };

const PROJECT_ID = /^\s*project_id\s*=\s*"([^"]+)"/m;

const RECORD_VERSION = 1;

const SHELL_SAFE = /^[\w./,:=@%+-]+$/;

export function projectIdOf(configToml: string): string | undefined {
	return PROJECT_ID.exec(configToml)?.[1];
}

export function filesDigest(files: readonly WatchedFile[]): string {
	const digest = createHash("sha256");
	const byPath = [...files].sort((left, right) =>
		left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
	);
	for (const file of byPath) {
		const content =
			file.content === undefined
				? "missing"
				: createHash("sha256").update(file.content).digest("hex");
		digest.update(`${file.path}\0${content}\0`);
	}
	return digest.digest("hex");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrings(value: unknown): value is readonly string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

export function parseStackRecord(text: string): StackRecord | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!isRecord(value) || value.version !== RECORD_VERSION) return undefined;
	const { project, checkout, files, containers } = value;
	if (
		typeof project !== "string" ||
		typeof checkout !== "string" ||
		typeof files !== "string" ||
		!isStrings(containers)
	)
		return undefined;
	return { project, checkout, files, containers };
}

export function stackRecordText(record: StackRecord): string {
	return `${JSON.stringify({ version: RECORD_VERSION, ...record }, null, "\t")}\n`;
}

export function stackConfigVerdict(
	running: readonly string[],
	stored: StoredRecord,
	files: string,
): StackConfigVerdict {
	if (running.length === 0) return { kind: "no-container" };
	switch (stored.kind) {
		case "missing":
			return { kind: "no-record" };
		case "unreadable":
			return { kind: "unreadable", path: stored.path };
		case "found": {
			const { record } = stored;
			if (!record.containers.some((id) => running.includes(id)))
				return { kind: "restarted" };
			return record.files === files
				? { kind: "same-files" }
				: { kind: "other-files", record };
		}
		default: {
			const unhandled: never = stored;
			return unhandled;
		}
	}
}

export function startVerdict(
	before: readonly string[],
	after: readonly string[],
): StartVerdict {
	if (after.length === 0) return { kind: "no-container" };
	if (after.some((id) => before.includes(id))) return { kind: "kept" };
	return { kind: "fresh", containers: after };
}

export function shellWord(text: string): string {
	return SHELL_SAFE.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`;
}
