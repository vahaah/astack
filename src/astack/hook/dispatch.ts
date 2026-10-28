import { hookPolicy } from "../hook-profile.ts";
import { readOptional } from "../paths.ts";
import { todayIso } from "../plan/files.ts";
import { profileSection } from "../profile.ts";
import { decode } from "./decode/index.ts";
import type { HookOutput } from "./encode/base.ts";
import { encode } from "./encode/index.ts";
import {
	ALLOW,
	type Context,
	combineAll,
	type Env,
	type Handler,
	type HookEvent,
	type HookEventName,
	projectDirOf,
	type Tool,
	type Verdict,
} from "./events.ts";
import { HANDLERS } from "./handlers/index.ts";

export type HookDeps = {
	readonly cwd: string;
	readonly today: string;
	readonly readText: (path: string) => string | undefined;
	readonly handlers: readonly Handler[];
};

export function processHookDeps(): HookDeps {
	return {
		cwd: process.cwd(),
		today: todayIso(),
		readText: readOptional,
		handlers: HANDLERS,
	};
}

export type Judgment = {
	readonly handler: string;
	readonly event: HookEvent;
	readonly verdict: Verdict | undefined;
};

export function judgeEach(
	handlers: readonly Handler[],
	events: readonly HookEvent[],
	context: Context,
): readonly Judgment[] {
	const hooks =
		context.hooks ?? hookPolicy(profileSection(projectDirOf(context), "hooks"));
	const checked = { ...context, hooks };
	return events.flatMap((event) =>
		handlers
			.filter(
				(handler) =>
					handler.on.includes(event.kind) &&
					(handler.quality === undefined || hooks[handler.quality]),
			)
			.map((handler) => {
				let verdict: Verdict | undefined;
				try {
					verdict = handler.run(event, checked);
				} catch {
					verdict = undefined;
				}
				return { handler: handler.id, event, verdict };
			}),
	);
}

export function judge(
	handlers: readonly Handler[],
	events: readonly HookEvent[],
	context: Context,
): Verdict {
	return combineAll(
		judgeEach(handlers, events, context).map(({ verdict }) => verdict ?? ALLOW),
	);
}

function verdictFor(
	tool: Tool,
	event: HookEventName,
	stdin: string,
	env: Env,
	deps: HookDeps,
): Verdict {
	const decoded = decode(tool, event, JSON.parse(stdin), {
		env,
		cwd: deps.cwd,
		readText: deps.readText,
	});
	if (!decoded || decoded.events.length === 0) return ALLOW;
	return judge(deps.handlers, decoded.events, {
		tool,
		event,
		cwd: decoded.cwd,
		projectDir: decoded.projectDir,
		env,
		today: deps.today,
		hooks: hookPolicy(
			profileSection(decoded.projectDir ?? decoded.cwd, "hooks"),
		),
		...(decoded.session ? { session: decoded.session } : {}),
	});
}

export function runHook(
	tool: Tool,
	event: HookEventName,
	stdin: string,
	env: Env,
	deps: HookDeps = processHookDeps(),
): HookOutput {
	let verdict = ALLOW;
	try {
		verdict = verdictFor(tool, event, stdin, env, deps);
	} catch {
		verdict = ALLOW;
	}
	return encode(tool, event, verdict);
}
