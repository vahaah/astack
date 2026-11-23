import { hookPolicy } from "../hook-profile.ts";
import { todayIso } from "../plan/files.ts";
import { type Ports, processPorts } from "../ports.ts";
import { sectionOf } from "../profile.ts";
import { chainSteps } from "../shell.ts";
import { decode } from "./decode/index.ts";
import type { HookOutput } from "./encode/base.ts";
import { encode } from "./encode/index.ts";
import {
	ALLOW,
	type Context,
	combineAll,
	deny,
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
	readonly ports: () => Ports;
	readonly handlers: readonly Handler[];
};

export function processHookDeps(): HookDeps {
	return {
		cwd: process.cwd(),
		today: todayIso(),
		ports: processPorts,
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
		context.hooks ??
		hookPolicy(
			sectionOf(
				context.ports.profile.readProfile(projectDirOf(context)),
				"hooks",
			),
		);
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
				} catch (error) {
					verdict = handler.failed?.(event, error);
				}
				return { handler: handler.id, event, verdict };
			}),
	);
}

function chainLine(events: readonly HookEvent[]): string | undefined {
	const steps = events.flatMap((event) =>
		event.kind === "shell" ? chainSteps(event.command) : [],
	);
	return steps.length < 2
		? undefined
		: `Nothing in this command ran. It had ${steps.length} steps. ${steps.join(", ")}.`;
}

export function judge(
	handlers: readonly Handler[],
	events: readonly HookEvent[],
	context: Context,
): Verdict {
	const verdict = combineAll(
		judgeEach(handlers, events, context).map(({ verdict }) => verdict ?? ALLOW),
	);
	const line = verdict.kind === "deny" ? chainLine(events) : undefined;
	return line === undefined || verdict.kind !== "deny"
		? verdict
		: deny(`${line}\n${verdict.reason}`);
}

function verdictFor(
	tool: Tool,
	event: HookEventName,
	stdin: string,
	env: Env,
	deps: HookDeps,
	ports: Ports,
): Verdict {
	const decoded = decode(tool, event, JSON.parse(stdin), {
		env,
		cwd: deps.cwd,
		readText: ports.files.readText,
	});
	if (!decoded || decoded.events.length === 0) return ALLOW;
	return judge(deps.handlers, decoded.events, {
		tool,
		event,
		cwd: decoded.cwd,
		projectDir: decoded.projectDir,
		env,
		today: deps.today,
		ports,
		hooks: hookPolicy(
			sectionOf(
				ports.profile.readProfile(decoded.projectDir ?? decoded.cwd),
				"hooks",
			),
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
		verdict = verdictFor(tool, event, stdin, env, deps, deps.ports());
	} catch {
		verdict = ALLOW;
	}
	return encode(tool, event, verdict);
}
