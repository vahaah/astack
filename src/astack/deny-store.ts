import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseHashList } from "./deny-list.ts";
import { err, ok, type Result } from "./result.ts";
import { stateDir } from "./state.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type DenyStore =
	| { readonly kind: "none" }
	| { readonly kind: "file"; readonly path: string };

export type DenyList =
	| { readonly kind: "none" }
	| { readonly kind: "list"; readonly hashes: ReadonlySet<string> };

export type DenyListStop = { readonly path: string; readonly message: string };

const NO_LIST: DenyList = { kind: "none" };

export function denyStore(env: Env): DenyStore {
	const dir = stateDir(env);
	return dir
		? { kind: "file", path: join(dir, "deny", "names.sha256") }
		: { kind: "none" };
}

function listStop(path: string, error: unknown): DenyListStop {
	return {
		path,
		message: error instanceof Error ? error.message : String(error),
	};
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function readDenyList(store: DenyStore): Result<DenyList, DenyListStop> {
	if (store.kind === "none") return ok(NO_LIST);
	const { path } = store;
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		return isMissing(error) ? ok(NO_LIST) : err(listStop(path, error));
	}
	const parsed = parseHashList(text);
	return parsed.errors.length > 0
		? err({ path, message: parsed.errors.join(", ") })
		: ok({ kind: "list", hashes: parsed.hashes });
}

export function writeDenyList(
	hashes: ReadonlySet<string>,
	store: DenyStore,
): Result<void, DenyListStop> {
	if (store.kind === "none") return ok(undefined);
	const { path } = store;
	try {
		mkdirSync(dirname(path), { recursive: true });
		const temporary = `${path}.${process.pid}.tmp`;
		writeFileSync(temporary, [...hashes].map((hash) => `${hash}\n`).join(""));
		renameSync(temporary, path);
		return ok(undefined);
	} catch (error) {
		return err(listStop(path, error));
	}
}
