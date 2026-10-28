import { createHash } from "node:crypto";
import {
	closeSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sessionFileName } from "../state.ts";

export type Claim = "claimed" | "taken" | "unavailable";

export type Rewrite = {
	readonly asked: string;
	readonly answer?: string | undefined;
};

const REWRITE_FILE = "rewrite.json";
const KEY_CHARS = 32;

const LEDGER_LIMIT = 2;
const SESSION_DAYS = 14;
const DAY_MS = 86_400_000;

export function sessionDir(root: string, session: string): string | undefined {
	const name = sessionFileName(session);
	return name === undefined ? undefined : join(root, "ste", name);
}

function readNumber(path: string): number | undefined {
	try {
		const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
		return Number.isInteger(value) && value >= 0 ? value : undefined;
	} catch {
		return undefined;
	}
}

function writeAtomic(path: string, text: string): boolean {
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		writeFileSync(temporary, text);
		renameSync(temporary, path);
		return true;
	} catch {
		rmSync(temporary, { force: true });
		return false;
	}
}

function ensureDir(dir: string): boolean {
	try {
		mkdirSync(dir, { recursive: true });
		return true;
	} catch {
		return false;
	}
}

export function currentTurn(dir: string): number {
	return readNumber(join(dir, "turn")) ?? 0;
}

function remove(path: string): void {
	try {
		rmSync(path, { force: true });
	} catch {}
}

export function clearRewrite(dir: string): void {
	remove(join(dir, REWRITE_FILE));
}

function clearReplyState(dir: string): void {
	try {
		for (const name of readdirSync(dir))
			if (name.endsWith(".claim")) remove(join(dir, name));
	} catch {}
	clearRewrite(dir);
}

export function pruneSessions(root: string, now: number): void {
	const parent = join(root, "ste");
	try {
		for (const name of readdirSync(parent)) {
			const path = join(parent, name);
			if (now - statSync(path).mtimeMs > SESSION_DAYS * DAY_MS)
				rmSync(path, { recursive: true, force: true });
		}
	} catch {}
}

export function advanceTurn(dir: string): number | undefined {
	if (!ensureDir(dir)) return undefined;
	const next = currentTurn(dir) + 1;
	if (!writeAtomic(join(dir, "turn"), `${next}\n`)) return undefined;
	clearReplyState(dir);
	return next;
}

export function replyKey(
	text: string | undefined,
	chain?: string | undefined,
): string {
	const hash = createHash("sha256");
	if (chain !== undefined && chain !== "") hash.update(`${chain}\u0000`);
	return hash
		.update(text ?? "")
		.digest("hex")
		.slice(0, KEY_CHARS);
}

export function claimReply(dir: string, key: string): Claim {
	if (!ensureDir(dir)) return "unavailable";
	try {
		closeSync(openSync(join(dir, `${key}.claim`), "wx"));
		return "claimed";
	} catch (error) {
		return error instanceof Error && "code" in error && error.code === "EEXIST"
			? "taken"
			: "unavailable";
	}
}

export function readRewrite(dir: string): Rewrite | undefined {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(join(dir, REWRITE_FILE), "utf8"),
		);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		const asked: unknown = Reflect.get(parsed, "asked");
		const answer: unknown = Reflect.get(parsed, "answer");
		if (typeof asked !== "string") return undefined;
		return typeof answer === "string" ? { asked, answer } : { asked };
	} catch {
		return undefined;
	}
}

export function saveRewrite(dir: string, rewrite: Rewrite): boolean {
	return (
		ensureDir(dir) &&
		writeAtomic(join(dir, REWRITE_FILE), `${JSON.stringify(rewrite)}\n`)
	);
}

export function answersRewrite(
	rewrite: Rewrite | undefined,
	key: string,
	fresh: boolean,
): rewrite is Rewrite {
	return (
		!fresh &&
		rewrite !== undefined &&
		rewrite.asked !== key &&
		(rewrite.answer === undefined || rewrite.answer === key)
	);
}

export function recordPending(dir: string, count: number): void {
	if (ensureDir(dir)) writeAtomic(join(dir, "pending"), `${count}\n`);
}

export function clearPending(dir: string): void {
	remove(join(dir, "pending"));
}

export function takePending(dir: string): number | undefined {
	const count = readNumber(join(dir, "pending"));
	clearPending(dir);
	return count;
}

function readLedger(dir: string): Readonly<Record<string, number>> {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(join(dir, "ledger.json"), "utf8"),
		);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
			return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, number] => typeof entry[1] === "number",
			),
		);
	} catch {
		return {};
	}
}

export function demoted(dir: string): ReadonlySet<string> {
	return new Set(
		Object.entries(readLedger(dir))
			.filter(([, count]) => count >= LEDGER_LIMIT)
			.map(([key]) => key),
	);
}

export const CRONS_FILE = "crons.json";

export function parseCrons(text: string | undefined): readonly string[] {
	if (text === undefined) return [];
	try {
		const parsed: unknown = JSON.parse(text);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

export function saveCrons(dir: string, prompts: readonly string[]): void {
	const path = join(dir, CRONS_FILE);
	let saved: string | undefined;
	try {
		saved = readFileSync(path, "utf8");
	} catch {
		saved = undefined;
	}
	const next = `${JSON.stringify([...new Set(prompts)])}\n`;
	if (saved === next || (saved === undefined && prompts.length === 0)) return;
	if (ensureDir(dir)) writeAtomic(path, next);
}

export function recordDenies(
	dir: string,
	fingerprints: readonly string[],
): void {
	if (fingerprints.length === 0 || !ensureDir(dir)) return;
	const ledger = { ...readLedger(dir) };
	for (const key of new Set(fingerprints)) ledger[key] = (ledger[key] ?? 0) + 1;
	writeAtomic(join(dir, "ledger.json"), `${JSON.stringify(ledger)}\n`);
}
