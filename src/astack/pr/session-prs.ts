import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { err, ok, type Result } from "../result.ts";
import { sessionFileName, stateDir } from "../state.ts";
import { NO_SESSION_PRS, type SessionOpen, type SessionPrs } from "./split.ts";

type Env = Readonly<Record<string, string | undefined>>;

export type SessionStore =
	| { readonly kind: "none" }
	| { readonly kind: "file"; readonly path: string };

export type SessionSaveStop = {
	readonly path: string;
	readonly message: string;
};

export function sessionStore(
	env: Env,
	session: string | undefined,
): SessionStore {
	const dir = stateDir(env);
	const name = session === undefined ? undefined : sessionFileName(session);
	return dir && name
		? { kind: "file", path: join(dir, "pr-sessions", `${name}.json`) }
		: { kind: "none" };
}

export function saveSessionPrs(
	prs: SessionPrs,
	store: SessionStore,
): Result<void, SessionSaveStop> {
	if (store.kind === "none") return ok(undefined);
	const { path } = store;
	try {
		mkdirSync(dirname(path), { recursive: true });
		const temporary = `${path}.${process.pid}.tmp`;
		writeFileSync(temporary, JSON.stringify(prs));
		renameSync(temporary, path);
		return ok(undefined);
	} catch (error) {
		return err({
			path,
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOpen(value: unknown): SessionOpen[] {
	if (!isFields(value)) return [];
	const { root, repo, base, head } = value;
	return typeof root === "string" &&
		typeof repo === "string" &&
		typeof base === "string" &&
		typeof head === "string"
		? [{ root, repo, base, head }]
		: [];
}

function parseSessionPrs(value: unknown): SessionPrs {
	if (!isFields(value)) return NO_SESSION_PRS;
	return {
		split: value.split === true,
		opens: Array.isArray(value.opens) ? value.opens.flatMap(parseOpen) : [],
	};
}

export function loadSessionPrs(store: SessionStore): SessionPrs {
	if (store.kind === "none") return NO_SESSION_PRS;
	try {
		return parseSessionPrs(JSON.parse(readFileSync(store.path, "utf8")));
	} catch {
		return NO_SESSION_PRS;
	}
}
