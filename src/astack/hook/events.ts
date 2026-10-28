import type { Region } from "../comments/added.ts";
import type { HookGroup, HookPolicy } from "../hook-profile.ts";

export const TOOLS = ["claude-code", "codex", "cursor", "grok-build"] as const;
export type Tool = (typeof TOOLS)[number];

export const HOOK_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"PreToolUse",
	"Stop",
] as const;
export type HookEventName = (typeof HOOK_EVENTS)[number];

export type HookEvent =
	| {
			readonly kind: "write";
			readonly path: string;
			readonly before: string | undefined;
			readonly after: string;
	  }
	| {
			readonly kind: "edit";
			readonly path: string;
			readonly before: string;
			readonly after: string;
			readonly regions: readonly Region[];
			readonly oldText: string;
			readonly newText: string;
	  }
	| { readonly kind: "shell"; readonly command: string; readonly cwd: string }
	| {
			readonly kind: "mcp";
			readonly server: string;
			readonly tool: string;
			readonly input: unknown;
	  }
	| {
			readonly kind: "prompt";
			readonly text: string;
			readonly human: boolean;
			readonly session: string;
	  }
	| {
			readonly kind: "reply";
			readonly text: string | undefined;
			readonly session: string;
			readonly interactive: boolean;
			readonly subagent: boolean;
			readonly fresh: boolean;
			readonly chain: string | undefined;
			readonly crons: readonly string[];
	  }
	| {
			readonly kind: "session-start";
			readonly cwd: string;
			readonly attended: boolean;
	  };

export type EventKind = HookEvent["kind"];
export type EventOf<K extends EventKind> = Extract<
	HookEvent,
	{ readonly kind: K }
>;

export type Verdict =
	| { readonly kind: "allow" }
	| { readonly kind: "note"; readonly text: string }
	| { readonly kind: "deny"; readonly reason: string }
	| { readonly kind: "continue"; readonly prompt: string };

export type Env = Readonly<Record<string, string | undefined>>;

export type Context = {
	readonly tool: Tool;
	readonly event: HookEventName;
	readonly cwd: string;
	readonly projectDir: string | undefined;
	readonly env: Env;
	readonly today: string;
	readonly session?: string;
	readonly refresh?: boolean;
	readonly hooks?: HookPolicy;
};

export type Handler = {
	readonly id: string;
	readonly quality?: HookGroup;
	readonly on: readonly EventKind[];
	readonly run: (event: HookEvent, context: Context) => Verdict;
};

export const ALLOW: Verdict = { kind: "allow" };

export function note(text: string): Verdict {
	return { kind: "note", text };
}

export function deny(reason: string): Verdict {
	return { kind: "deny", reason };
}

export function continueWith(prompt: string): Verdict {
	return { kind: "continue", prompt };
}

const RANK = {
	allow: 0,
	note: 1,
	continue: 2,
	deny: 3,
} as const satisfies Record<Verdict["kind"], number>;

const SEPARATOR = "\n\n";

export function message(verdict: Verdict): string {
	switch (verdict.kind) {
		case "allow":
			return "";
		case "note":
			return verdict.text;
		case "deny":
			return verdict.reason;
		case "continue":
			return verdict.prompt;
	}
}

export function combine(a: Verdict, b: Verdict): Verdict {
	if (RANK[a.kind] !== RANK[b.kind]) return RANK[a.kind] > RANK[b.kind] ? a : b;
	const joined = `${message(a)}${SEPARATOR}${message(b)}`;
	switch (a.kind) {
		case "allow":
			return a;
		case "note":
			return note(joined);
		case "deny":
			return deny(joined);
		case "continue":
			return continueWith(joined);
	}
}

export function combineAll(verdicts: readonly Verdict[]): Verdict {
	return verdicts.reduce(combine, ALLOW);
}

export function isKind<K extends EventKind>(
	event: HookEvent,
	kinds: readonly K[],
): event is EventOf<K> {
	return kinds.some((kind) => kind === event.kind);
}

export function defineHandler<K extends EventKind>(spec: {
	readonly id: string;
	readonly quality?: HookGroup;
	readonly on: readonly K[];
	readonly run: (event: EventOf<K>, context: Context) => Verdict;
}): Handler {
	return {
		id: spec.id,
		...(spec.quality === undefined ? {} : { quality: spec.quality }),
		on: spec.on,
		run: (event, context) =>
			isKind(event, spec.on) ? spec.run(event, context) : ALLOW,
	};
}

export function projectDirOf(context: Context): string {
	return context.projectDir ?? context.cwd;
}

export function parseTool(value: string | undefined): Tool | undefined {
	return TOOLS.find((tool) => tool === value);
}

export function parseEventName(
	value: string | undefined,
): HookEventName | undefined {
	return HOOK_EVENTS.find((event) => event === value);
}
