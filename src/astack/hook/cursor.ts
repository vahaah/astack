import { createHash } from "node:crypto";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { hookPolicy } from "../hook-profile.ts";
import { canonical } from "../paths.ts";
import { profileSection } from "../profile.ts";
import { sessionFileName, stateDir } from "../state.ts";
import {
	type CursorEvent,
	canonicalEvent,
	cursorSession,
	decodeCursor,
} from "./decode/cursor.ts";
import type { Decoded } from "./decode/types.ts";
import {
	type HookDeps,
	judge,
	judgeEach,
	processHookDeps,
} from "./dispatch.ts";
import type { HookOutput } from "./encode/base.ts";
import { encodeCursor } from "./encode/cursor.ts";
import {
	ALLOW,
	type Context,
	combineAll,
	continueWith,
	type Env,
	type Handler,
	message,
	type Verdict,
} from "./events.ts";

export type DeferredProblem = {
	readonly session: string;
	readonly workspace: string;
	readonly handler: string;
	readonly path: string;
	readonly before: string | null;
	readonly currentHash: string;
	readonly reason: string;
};

export type CursorStore = {
	readonly saveReply: (session: string, text: string) => void;
	readonly takeReply: (session: string) => string | undefined;
	readonly saveProblem: (problem: DeferredProblem) => void;
	readonly problems: (
		session: string,
		workspace: string,
	) => readonly DeferredProblem[];
	readonly removeProblem: (problem: DeferredProblem) => void;
	readonly takeLegacy: (session: string) => readonly string[];
	readonly addNote: (session: string, text: string) => void;
	readonly takeNotes: (session: string) => readonly string[];
};

export type CursorHookDeps = HookDeps & { readonly store: CursorStore };

const NO_STORE: CursorStore = {
	saveReply: () => {},
	takeReply: () => undefined,
	saveProblem: () => {},
	problems: () => [],
	removeProblem: () => {},
	takeLegacy: () => [],
	addNote: () => {},
	takeNotes: () => [],
};

const NOTE_LIMIT = 5;

function take(path: string): string | undefined {
	try {
		const text = readFileSync(path, "utf8");
		rmSync(path, { force: true });
		return text;
	} catch {
		return undefined;
	}
}

function hash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function problemKey(problem: DeferredProblem): string {
	return hash(
		JSON.stringify([problem.workspace, problem.handler, problem.path]),
	);
}

function deferredProblem(value: unknown): DeferredProblem | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return undefined;
	const session: unknown = Reflect.get(value, "session");
	const workspace: unknown = Reflect.get(value, "workspace");
	const handler: unknown = Reflect.get(value, "handler");
	const path: unknown = Reflect.get(value, "path");
	const before: unknown = Reflect.get(value, "before");
	const currentHash: unknown = Reflect.get(value, "currentHash");
	const reason: unknown = Reflect.get(value, "reason");
	return typeof session === "string" &&
		sessionFileName(session) !== undefined &&
		typeof workspace === "string" &&
		isAbsolute(workspace) &&
		typeof handler === "string" &&
		handler !== "" &&
		typeof path === "string" &&
		isAbsolute(path) &&
		(typeof before === "string" || before === null) &&
		typeof currentHash === "string" &&
		/^[a-f0-9]{64}$/.test(currentHash) &&
		typeof reason === "string" &&
		reason !== ""
		? { session, workspace, handler, path, before, currentHash, reason }
		: undefined;
}

export function fileStore(root: string): CursorStore {
	const dir = (session: string) => join(root, "cursor", session);
	const write = (session: string, name: string, text: string) => {
		const path = join(dir(session), name);
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		const temporary = `${path}.${process.pid}.tmp`;
		try {
			writeFileSync(temporary, text, { mode: 0o600 });
			renameSync(temporary, path);
		} finally {
			rmSync(temporary, { force: true });
		}
	};
	const list = (session: string, name: string): string[] => {
		try {
			const parsed: unknown = JSON.parse(
				readFileSync(join(dir(session), name), "utf8"),
			);
			return Array.isArray(parsed)
				? parsed.filter((item): item is string => typeof item === "string")
				: [];
		} catch {
			return [];
		}
	};
	const takeList = (session: string, name: string) => {
		const found = list(session, name);
		rmSync(join(dir(session), name), { force: true });
		return found;
	};
	const readProblem = (
		session: string,
		name: string,
	): DeferredProblem | undefined => {
		try {
			const parsed: unknown = JSON.parse(
				readFileSync(join(dir(session), "problems", name), "utf8"),
			);
			const problem = deferredProblem(parsed);
			return problem?.session === session &&
				`${problemKey(problem)}.json` === name
				? problem
				: undefined;
		} catch {
			return undefined;
		}
	};
	return {
		saveReply: (session, text) => write(session, "reply.txt", text),
		takeReply: (session) => take(join(dir(session), "reply.txt")),
		saveProblem: (problem) => {
			const name = `${problemKey(problem)}.json`;
			const previous = readProblem(problem.session, name);
			write(
				problem.session,
				join("problems", name),
				JSON.stringify({
					...problem,
					before: previous === undefined ? problem.before : previous.before,
				}),
			);
		},
		problems: (session, workspace) => {
			let names: string[];
			try {
				names = readdirSync(join(dir(session), "problems"));
			} catch {
				return [];
			}
			return names.sort().flatMap((name) => {
				const problem = readProblem(session, name);
				return problem?.workspace === workspace ? [problem] : [];
			});
		},
		removeProblem: (problem) =>
			rmSync(
				join(dir(problem.session), "problems", `${problemKey(problem)}.json`),
				{ force: true },
			),
		takeLegacy: (session) => takeList(session, "problems.json"),
		addNote: (session, text) =>
			write(
				session,
				"notes.json",
				JSON.stringify(
					[...list(session, "notes.json"), text].slice(-NOTE_LIMIT),
				),
			),
		takeNotes: (session) => takeList(session, "notes.json"),
	};
}

export function processCursorDeps(env: Env): CursorHookDeps {
	const root = stateDir(env);
	return {
		...processHookDeps(),
		store: root === undefined ? NO_STORE : fileStore(root),
	};
}

export const EDIT_FOLLOWUP =
	"astack found problems in files that you edited. Fix each one, then finish the reply.";

export function problemsVerdict(problems: readonly string[]): Verdict {
	return problems.length === 0
		? ALLOW
		: continueWith([EDIT_FOLLOWUP, ...new Set(problems)].join("\n\n"));
}

function legacyVerdict(problems: readonly string[]): Verdict {
	return problems.length === 0
		? ALLOW
		: continueWith(
				[
					"astack has unverified reports from an older cache. Their file, workspace and handler are unknown. Check each report against the current files:",
					...new Set(problems),
				].join("\n\n"),
			);
}

export const NOTES_HEADING = "astack advice from this turn:";

export function followUp(
	edits: Verdict,
	reply: Verdict,
	notes: readonly string[] = [],
): Verdict {
	const parts = [edits, reply]
		.filter((verdict) => verdict.kind === "continue" || verdict.kind === "deny")
		.map(message);
	if (parts.length === 0) return reply;
	const advice =
		notes.length === 0 ? [] : [[NOTES_HEADING, ...new Set(notes)].join("\n\n")];
	return continueWith([...parts, ...advice].join("\n\n"));
}

function replyText(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null || !("text" in raw))
		return undefined;
	return typeof raw.text === "string" ? raw.text : undefined;
}

function stopStatus(raw: unknown): string | undefined {
	if (typeof raw !== "object" || raw === null || !("status" in raw))
		return undefined;
	return typeof raw.status === "string" ? raw.status : undefined;
}

function contextFor(
	event: CursorEvent,
	decoded: Decoded,
	env: Env,
	deps: CursorHookDeps,
	session: string | undefined,
): Context {
	const workspace = canonical(resolve(decoded.projectDir ?? decoded.cwd));
	return {
		tool: "cursor",
		event: canonicalEvent(event),
		cwd: decoded.cwd,
		projectDir: workspace,
		hooks: hookPolicy(profileSection(workspace, "hooks")),
		env,
		today: deps.today,
		...(session === undefined ? {} : { session }),
	};
}

function verdictFor(
	event: CursorEvent,
	raw: unknown,
	env: Env,
	deps: CursorHookDeps,
	reply: string | undefined,
): Verdict {
	const decoded = decodeCursor(event, raw, {
		env,
		cwd: deps.cwd,
		readText: deps.readText,
		reply,
	});
	if (!decoded || decoded.events.length === 0) return ALLOW;
	return judge(
		deps.handlers,
		decoded.events,
		contextFor(event, decoded, env, deps, sessionFileName(cursorSession(raw))),
	);
}

function canonicalFile(path: string): string {
	const absolute = resolve(path);
	return canonical(join(canonical(dirname(absolute)), basename(absolute)));
}

function canResolveProblem(handler: Handler, context: Context): boolean {
	return handler.quality !== "comments" || context.hooks?.ste !== false;
}

function typeHandoff(
	problem: DeferredProblem,
	after: string,
	context: Context,
	deps: CursorHookDeps,
	pending: readonly DeferredProblem[],
): Verdict | undefined {
	const handler = deps.handlers.find((candidate) => candidate.id === "types");
	if (handler === undefined) return undefined;
	const existing = pending.find(
		(candidate) =>
			candidate.handler === "types" && candidate.path === problem.path,
	);
	const target = existing ?? { ...problem, handler: "types" };
	const verdict = judgeEach(
		[handler],
		[
			{
				kind: "write",
				path: target.path,
				before: target.before ?? undefined,
				after,
			},
		],
		{ ...context, refresh: true },
	)[0]?.verdict;
	if (verdict?.kind === "deny")
		deps.store.saveProblem({
			...target,
			currentHash: hash(after),
			reason: verdict.reason,
		});
	return verdict;
}

function afterFileEdit(
	raw: unknown,
	env: Env,
	deps: CursorHookDeps,
	session: string | undefined,
): void {
	const decoded = decodeCursor("afterFileEdit", raw, {
		env,
		cwd: deps.cwd,
		readText: deps.readText,
		reply: undefined,
	});
	if (!decoded) return;
	const context = contextFor("afterFileEdit", decoded, env, deps, session);
	const workspace = context.projectDir ?? context.cwd;
	const pending =
		session === undefined ? [] : deps.store.problems(session, workspace);
	for (const event of decoded.events) {
		if (event.kind !== "write") continue;
		const path = canonicalFile(event.path);
		for (const handler of deps.handlers) {
			const previous = pending.find(
				(problem) => problem.handler === handler.id && problem.path === path,
			);
			const current = {
				...event,
				path,
				before:
					previous === undefined
						? event.before
						: (previous.before ?? undefined),
			};
			const verdict = judgeEach(
				[handler],
				[current],
				previous === undefined ? context : { ...context, refresh: true },
			)[0]?.verdict;
			if (verdict === undefined || session === undefined) continue;
			if (verdict.kind === "deny") {
				deps.store.saveProblem({
					session,
					workspace,
					handler: handler.id,
					path,
					before:
						previous === undefined ? (event.before ?? null) : previous.before,
					currentHash: hash(event.after),
					reason: verdict.reason,
				});
			} else if (previous !== undefined) {
				const handedOff =
					handler.id !== "comments" ||
					context.hooks?.types === false ||
					typeHandoff(previous, event.after, context, deps, pending) !==
						undefined;
				if (handedOff && canResolveProblem(handler, context))
					deps.store.removeProblem(previous);
			}
		}
	}
}

type CurrentFile =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "missing" }
	| { readonly kind: "unreadable" };

function currentFile(path: string): CurrentFile {
	try {
		return { kind: "text", text: readFileSync(path, "utf8") };
	} catch (error) {
		return error instanceof Error && "code" in error && error.code === "ENOENT"
			? { kind: "missing" }
			: { kind: "unreadable" };
	}
}

type RefreshedProblem = {
	readonly kind: "denied" | "limited";
	readonly reason: string;
};

function refreshProblems(
	context: Context,
	deps: CursorHookDeps,
): readonly RefreshedProblem[] {
	const session = context.session;
	if (session === undefined) return [];
	const refresh: Context = { ...context, event: "PreToolUse", refresh: true };
	const workspace = context.projectDir ?? context.cwd;
	const pending = deps.store.problems(session, workspace);
	return pending.flatMap((problem): RefreshedProblem[] => {
		const handler = deps.handlers.find(
			(candidate) => candidate.id === problem.handler,
		);
		if (
			handler?.quality !== undefined &&
			context.hooks?.[handler.quality] === false
		)
			return [];
		const current = currentFile(problem.path);
		if (current.kind === "missing") {
			deps.store.removeProblem(problem);
			return [];
		}
		if (current.kind === "unreadable")
			return [
				{
					kind: "limited",
					reason: `astack could not verify ${problem.path} because its current file is unreadable. Read the file and run its checks.`,
				},
			];
		if (handler === undefined || !handler.on.includes("write"))
			return [
				{
					kind: "limited",
					reason: `astack could not verify ${problem.path} because its ${problem.handler} handler is unavailable. Run that check before you finish.`,
				},
			];
		const judgment = judgeEach(
			[handler],
			[
				{
					kind: "write",
					path: problem.path,
					before: problem.before ?? undefined,
					after: current.text,
				},
			],
			refresh,
		)[0];
		if (judgment === undefined) return [];
		const verdict = judgment.verdict;
		if (verdict === undefined)
			return [
				{
					kind: "limited",
					reason: `astack could not verify ${problem.path} because its ${problem.handler} handler failed. Run that check before you finish.`,
				},
			];
		if (verdict.kind !== "deny") {
			let handedOff: Verdict = ALLOW;
			if (handler.id === "comments" && context.hooks?.types !== false) {
				const result = typeHandoff(
					problem,
					current.text,
					context,
					deps,
					pending,
				);
				if (result === undefined)
					return [
						{
							kind: "limited",
							reason: `astack could not verify ${problem.path} because its type handoff check is unavailable. Run that check before you finish.`,
						},
					];
				handedOff = result;
			}
			if (canResolveProblem(handler, context))
				deps.store.removeProblem(problem);
			return handedOff.kind === "deny"
				? [{ kind: "denied", reason: handedOff.reason }]
				: [];
		}
		const currentHash = hash(current.text);
		if (
			currentHash !== problem.currentHash ||
			verdict.reason !== problem.reason
		)
			deps.store.saveProblem({
				...problem,
				currentHash,
				reason: verdict.reason,
			});
		return [{ kind: "denied", reason: verdict.reason }];
	});
}

function outcome(
	event: CursorEvent,
	raw: unknown,
	env: Env,
	deps: CursorHookDeps,
): Verdict {
	const session = sessionFileName(cursorSession(raw));
	switch (event) {
		case "afterAgentResponse": {
			const text = replyText(raw);
			if (session !== undefined && text !== undefined)
				deps.store.saveReply(session, text);
			return ALLOW;
		}
		case "afterFileEdit":
			afterFileEdit(raw, env, deps, session);
			return ALLOW;
		case "stop": {
			if (stopStatus(raw) !== "completed") return ALLOW;
			const reply =
				session === undefined ? undefined : deps.store.takeReply(session);
			const decoded = decodeCursor(event, raw, {
				env,
				cwd: deps.cwd,
				readText: deps.readText,
				reply,
			});
			const context =
				decoded === undefined
					? undefined
					: contextFor(event, decoded, env, deps, session);
			const problems =
				context === undefined ? [] : refreshProblems(context, deps);
			const legacy =
				session === undefined ? [] : deps.store.takeLegacy(session);
			const notes = session === undefined ? [] : deps.store.takeNotes(session);
			const edits = combineAll([
				problemsVerdict(
					problems
						.filter((problem) => problem.kind === "denied")
						.map((problem) => problem.reason),
				),
				...problems
					.filter((problem) => problem.kind === "limited")
					.map((problem) => continueWith(problem.reason)),
				legacyVerdict(legacy),
			]);
			const replyVerdict =
				decoded === undefined || context === undefined
					? ALLOW
					: judge(deps.handlers, decoded.events, context);
			return followUp(edits, replyVerdict, notes);
		}
		case "preToolUse":
		case "beforeShellExecution":
		case "beforeMCPExecution": {
			const verdict = verdictFor(event, raw, env, deps, undefined);
			if (session !== undefined && verdict.kind === "note")
				deps.store.addNote(session, verdict.text);
			return verdict;
		}
		case "sessionStart":
		case "beforeSubmitPrompt":
			return verdictFor(event, raw, env, deps, undefined);
	}
}

export function runCursorHook(
	event: CursorEvent,
	stdin: string,
	env: Env,
	deps: CursorHookDeps = processCursorDeps(env),
): HookOutput {
	let verdict = ALLOW;
	let raw: unknown;
	try {
		raw = JSON.parse(stdin);
		verdict = outcome(event, raw, env, deps);
	} catch {
		verdict = ALLOW;
	}
	return encodeCursor(event, verdict, !backgroundAgent(raw));
}

function backgroundAgent(raw: unknown): boolean {
	return (
		typeof raw === "object" &&
		raw !== null &&
		"is_background_agent" in raw &&
		raw.is_background_agent === true
	);
}
