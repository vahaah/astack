import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { err, ok, type Result } from "../result.ts";
import { sessionFileName, stateDir } from "../state.ts";
import { type MergeGrant, NO_GRANT } from "./grant.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type GrantStore =
	| { readonly kind: "none" }
	| { readonly kind: "file"; readonly path: string };

export type GrantSaveStop = { readonly path: string; readonly message: string };

export function grantStore(env: Env, session: string | undefined): GrantStore {
	const dir = stateDir(env);
	const name = session === undefined ? undefined : sessionFileName(session);
	return dir && name
		? { kind: "file", path: join(dir, "merge-grants", `${name}.json`) }
		: { kind: "none" };
}

export function saveGrant(
	grant: MergeGrant,
	store: GrantStore,
): Result<void, GrantSaveStop> {
	if (store.kind === "none") return ok(undefined);
	const { path } = store;
	try {
		if (grant.kind === "none") {
			rmSync(path, { force: true });
			return ok(undefined);
		}
		mkdirSync(dirname(path), { recursive: true });
		const temporary = `${path}.${process.pid}.tmp`;
		writeFileSync(temporary, JSON.stringify(grant));
		renameSync(temporary, path);
		return ok(undefined);
	} catch (error) {
		return err({
			path,
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

function parseGrant(value: unknown): MergeGrant {
	if (typeof value !== "object" || value === null) return NO_GRANT;
	if ("kind" in value && value.kind === "any") return { kind: "any" };
	if (
		"kind" in value &&
		value.kind === "prs" &&
		"numbers" in value &&
		Array.isArray(value.numbers)
	) {
		const numbers = value.numbers.filter(
			(entry): entry is number => typeof entry === "number",
		);
		return numbers.length > 0 ? { kind: "prs", numbers } : NO_GRANT;
	}
	return NO_GRANT;
}

export function loadGrant(store: GrantStore): Result<MergeGrant, never> {
	if (store.kind === "none") return ok(NO_GRANT);
	try {
		return ok(parseGrant(JSON.parse(readFileSync(store.path, "utf8"))));
	} catch {
		return ok(NO_GRANT);
	}
}
