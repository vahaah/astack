import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mcpParts } from "../../src/astack/hook/decode/claude-code.ts";
import { decode } from "../../src/astack/hook/decode/index.ts";
import {
	type HookDeps,
	judge,
	runHook,
} from "../../src/astack/hook/dispatch.ts";
import { SILENT } from "../../src/astack/hook/encode/base.ts";
import {
	ALLOW,
	type Context,
	defineHandler,
	deny,
	type Env,
	type EventKind,
	type Handler,
	HOOK_EVENTS,
	type HookEvent,
	note,
	parseEventName,
	parseTool,
	TOOLS,
} from "../../src/astack/hook/events.ts";
import { HANDLERS } from "../../src/astack/hook/handlers/index.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import { processPorts } from "../../src/astack/ports.ts";
import { fakePorts } from "./fake-ports.ts";

const FIXTURES = resolve(import.meta.dir, "../fixtures/hook-input");
let project = "";

beforeAll(() => {
	project = mkdtempSync(join(tmpdir(), "astack-dispatch-"));
	writeFileSync(join(project, "a.ts"), "export const a = 1;\n");
});

afterAll(() => rmSync(project, { recursive: true, force: true }));

function deps(handlers: readonly Handler[]): HookDeps {
	return {
		cwd: project,
		today: "2026-10-16",
		ports: processPorts,
		handlers,
	};
}

function recorder(kinds: readonly EventKind[]): {
	handler: Handler;
	seen: HookEvent[];
} {
	const seen: HookEvent[] = [];
	const handler = defineHandler({
		id: "recorder",
		on: kinds,
		run: (event) => {
			seen.push(event);
			return ALLOW;
		},
	});
	return { handler, seen };
}

function payload(fields: Record<string, unknown>): string {
	return JSON.stringify({ cwd: project, session_id: "s1", ...fields });
}

describe("the handler registry", () => {
	test("[control:hook-registry] lists each handler once, and each handler names its events", () => {
		const ids = HANDLERS.map((handler) => handler.id);
		expect(ids).toEqual([
			"comments",
			"types",
			"ste-artifact",
			"plan-file",
			"ticket",
			"pr-body",
			"merge-guard",
			"duplicate-pr",
			"outbound",
			"destructive",
			"ste-reply",
			"turn",
			"plan-pointer",
		]);
		for (const handler of HANDLERS)
			expect(handler.on.length).toBeGreaterThan(0);
	});

	test("a handler gets only the event kinds it names", () => {
		const { handler, seen } = recorder(["shell"]);
		const context: Context = {
			tool: "claude-code",
			event: "PreToolUse",
			cwd: project,
			projectDir: undefined,
			env: {},
			today: "2026-10-16",
			ports: fakePorts(),
		};
		expect(
			handler.run({ kind: "mcp", server: "s", tool: "t", input: {} }, context),
		).toEqual(ALLOW);
		expect(seen).toEqual([]);
	});

	test("the session id of the payload reaches the context", () => {
		const sessions: (string | undefined)[] = [];
		const spy = defineHandler({
			id: "spy",
			on: ["shell"],
			run: (_event, context) => {
				sessions.push(context.session);
				return ALLOW;
			},
		});
		runHook(
			"claude-code",
			"PreToolUse",
			payload({ tool_name: "Bash", tool_input: { command: "ls" } }),
			{},
			deps([spy]),
		);
		expect(sessions).toEqual(["s1"]);
	});

	test("[control:hook-fail-open] a handler that throws fails open and keeps the other verdicts", () => {
		const throwing = defineHandler({
			id: "throws",
			on: ["shell"],
			run: () => {
				throw new Error("boom");
			},
		});
		const denying = defineHandler({
			id: "denies",
			on: ["shell"],
			run: () => deny("no"),
		});
		const output = runHook(
			"claude-code",
			"PreToolUse",
			payload({ tool_name: "Bash", tool_input: { command: "ls" } }),
			{},
			deps([throwing, denying]),
		);
		expect(output).toEqual({ stdout: "", stderr: "no\n", exit: 2 });
	});

	test.each([
		["gh pr merge 12", true],
		['gh pr mer"ge" 12', true],
		["gh pr view 12", false],
	])(
		"[control:sg-guard-error] a merge guard that throws on %p denies it and names the error: %p",
		(command, denied) => {
			const failing = mergeGuard(() => {
				throw new Error("gh exploded");
			});
			expect(
				runHook(
					"claude-code",
					"PreToolUse",
					payload({ tool_name: "Bash", tool_input: { command } }),
					{},
					deps([failing]),
				),
			).toEqual(
				denied
					? {
							stdout: "",
							stderr:
								'astack blocked gh pr merge:\n- The merge guard failed with "gh exploded", so astack cannot examine this merge. Ask the owner, or let the owner merge.\n',
							exit: 2,
						}
					: SILENT,
			);
		},
	);

	const denyAll = defineHandler({
		id: "deny-all",
		on: ["shell"],
		run: () => deny("astack blocked this commit message."),
	});
	const shellContext: Context = {
		tool: "claude-code",
		event: "PreToolUse",
		cwd: project,
		projectDir: undefined,
		env: {},
		today: "2026-10-16",
		ports: fakePorts(),
	};

	test.each([
		[
			"git add -A && git commit -m x",
			"Nothing in this command ran. It had 2 steps. git, git.\nastack blocked this commit message.",
		],
		[
			"cd sub && FOO=1 git commit -m x",
			"Nothing in this command ran. It had 2 steps. cd, git.\nastack blocked this commit message.",
		],
		["git commit -m x", "astack blocked this commit message."],
		[
			"git commit -m \"$(cat <<'EOF'\nx\nEOF\n)\"",
			"astack blocked this commit message.",
		],
	])(
		"[control:chain-deny-line] a deny of %p names each top-level step that did not run",
		(command, reason) => {
			expect(
				judge(
					[denyAll],
					[{ kind: "shell", command, cwd: project }],
					shellContext,
				),
			).toEqual(deny(reason));
		},
	);

	test("a chained note keeps its text, and a chained gh pr merge gets the line and the merge reason", () => {
		const hint = defineHandler({
			id: "hint",
			on: ["shell"],
			run: () => note("one"),
		});
		expect(
			judge(
				[hint],
				[
					{
						kind: "shell",
						command: "git add -A && git commit -m x",
						cwd: project,
					},
				],
				shellContext,
			),
		).toEqual(note("one"));
		const merge = mergeGuard(() => {
			throw new Error("the guard reads no PR for a chained merge");
		});
		const verdict = judge(
			[merge],
			[
				{
					kind: "shell",
					command: "gh pr checks 12 && gh pr merge 12",
					cwd: project,
				},
			],
			shellContext,
		);
		const reason = verdict.kind === "deny" ? verdict.reason : "";
		expect(reason.split("\n").slice(0, 2)).toEqual([
			"Nothing in this command ran. It had 2 steps. gh, gh.",
			"astack blocked gh pr merge:",
		]);
		expect(reason).toContain(
			"- Run gh pr merge as its own Bash call. Do not chain it with other commands, and never with the checks before it.",
		);
	});

	test("verdicts of several handlers combine in registry order", () => {
		const first = defineHandler({
			id: "first",
			on: ["shell"],
			run: () => note("one"),
		});
		const second = defineHandler({
			id: "second",
			on: ["shell"],
			run: () => note("two"),
		});
		const context: Context = {
			tool: "claude-code",
			event: "PreToolUse",
			cwd: project,
			projectDir: undefined,
			env: {},
			today: "2026-10-16",
			ports: fakePorts(),
		};
		expect(
			judge(
				[first, second],
				[{ kind: "shell", command: "ls", cwd: project }],
				context,
			),
		).toEqual(note("one\n\ntwo"));
	});
});

describe("events with no handler and other tools", () => {
	test("Stop and UserPromptSubmit are silent and fast", () => {
		for (const [event, fields] of [
			["Stop", { last_assistant_message: "Done, it's fine." }],
			["UserPromptSubmit", { prompt: "go" }],
		] as const) {
			const started = performance.now();
			const output = runHook(
				"claude-code",
				event,
				payload(fields),
				{},
				deps(HANDLERS),
			);
			expect(output).toEqual(SILENT);
			expect(performance.now() - started).toBeLessThan(100);
		}
	});

	test("Stop and UserPromptSubmit decode to reply and prompt events", () => {
		const { handler, seen } = recorder(["reply", "prompt"]);
		runHook(
			"claude-code",
			"Stop",
			payload({ last_assistant_message: "Done." }),
			{ CLAUDE_CODE_ENTRYPOINT: "sdk-cli" },
			deps([handler]),
		);
		runHook(
			"claude-code",
			"UserPromptSubmit",
			payload({ prompt: "go" }),
			{},
			deps([handler]),
		);
		expect(seen).toEqual([
			{
				kind: "reply",
				text: "Done.",
				session: "s1",
				interactive: false,
				subagent: false,
				fresh: false,
				chain: undefined,
				crons: [],
			},
			{ kind: "prompt", text: "go", human: true, session: "s1" },
		]);
	});

	test("a Stop is fresh only when the payload says that no Stop hook blocked before it", () => {
		const fresh = (fields: Record<string, unknown>): unknown[] => {
			const { handler, seen } = recorder(["reply"]);
			runHook(
				"claude-code",
				"Stop",
				payload({ last_assistant_message: "Done.", ...fields }),
				{},
				deps([handler]),
			);
			return seen.map((event) => event.kind === "reply" && event.fresh);
		};
		expect(fresh({ stop_hook_active: false })).toEqual([true]);
		expect(fresh({ stop_hook_active: true })).toEqual([false]);
		expect(fresh({})).toEqual([false]);
	});

	test("a Stop reads its chain id from prompt_id on Claude Code and turn_id on Codex", () => {
		const chain = (fields: Record<string, unknown>): unknown[] => {
			const { handler, seen } = recorder(["reply"]);
			runHook(
				"claude-code",
				"Stop",
				payload({ last_assistant_message: "Done.", ...fields }),
				{},
				deps([handler]),
			);
			return seen.map((event) => event.kind === "reply" && event.chain);
		};
		expect(chain({ prompt_id: "p1" })).toEqual(["p1"]);
		expect(chain({ turn_id: "t1" })).toEqual(["t1"]);
		expect(chain({ prompt_id: "p1", turn_id: "t1" })).toEqual(["p1"]);
		expect(chain({ prompt_id: 4 })).toEqual([undefined]);
		expect(chain({})).toEqual([undefined]);
	});

	test("cursor has no decoder in runHook, so it allows every payload", () => {
		const { handler, seen } = recorder(["shell"]);
		const output = runHook(
			"cursor",
			"PreToolUse",
			payload({ tool_name: "Bash", tool_input: { command: "ls" } }),
			{},
			deps([handler]),
		);
		expect(output).toEqual(SILENT);
		expect(seen).toEqual([]);
	});

	test("MultiEdit, NotebookEdit, apply_patch and other MCP tools are silent", () => {
		for (const tool_name of [
			"MultiEdit",
			"NotebookEdit",
			"apply_patch",
			"mcp__claude_ai_Gmail__send_message",
		])
			expect(
				runHook(
					"claude-code",
					"PreToolUse",
					payload({ tool_name, tool_input: {} }),
					{},
					deps(HANDLERS),
				),
			).toEqual(SILENT);
	});
});

describe("the Claude Code decoder", () => {
	test("a captured Edit payload decodes to one edit event with the edited region", () => {
		const raw = JSON.parse(
			readFileSync(join(FIXTURES, "hook-input-Edit-1.json"), "utf8"),
		);
		const file = join(project, "a.ts");
		raw.tool_input = {
			...raw.tool_input,
			file_path: file,
			old_string: "a = 1",
			new_string: "a = 2",
		};
		const decoded = decode("claude-code", "PreToolUse", raw, {
			env: {},
			cwd: project,
			readText: processPorts().files.readText,
		});
		expect(decoded?.events).toEqual([
			{
				kind: "edit",
				path: file,
				before: "export const a = 1;\n",
				after: "export const a = 2;\n",
				regions: [{ start: 13, end: 18 }],
				oldText: "a = 1",
				newText: "a = 2",
			},
		]);
	});

	test("an Edit that creates a file decodes to a write event", () => {
		const decoded = decode(
			"claude-code",
			"PreToolUse",
			{
				cwd: project,
				tool_name: "Edit",
				tool_input: {
					file_path: "new.ts",
					old_string: "",
					new_string: "x",
				},
			},
			{
				env: { CLAUDE_PROJECT_DIR: project },
				cwd: "/",
				readText: () => undefined,
			},
		);
		expect(decoded).toEqual({
			cwd: project,
			projectDir: project,
			events: [
				{
					kind: "write",
					path: join(project, "new.ts"),
					before: undefined,
					after: "x",
				},
			],
		});
	});

	test("a payload that is not an object does not decode", () => {
		expect(
			decode("claude-code", "PreToolUse", [], {
				env: {},
				cwd: project,
				readText: () => undefined,
			}),
		).toBeUndefined();
	});

	test("an MCP tool name splits into server and tool", () => {
		expect(mcpParts("mcp__claude_ai_Linear__save_issue")).toEqual({
			server: "claude_ai_Linear",
			tool: "save_issue",
		});
		expect(mcpParts("mcp__plugin_linear_linear__create_issue")).toEqual({
			server: "plugin_linear_linear",
			tool: "create_issue",
		});
	});
});

describe("the captured prompt channels", () => {
	function captured(channel: string): unknown {
		return JSON.parse(
			readFileSync(
				join(FIXTURES, `hook-input-UserPromptSubmit-${channel}.json`),
				"utf8",
			),
		);
	}

	function decodedPrompt(
		raw: unknown,
		env: Env = { CLAUDE_CODE_ENTRYPOINT: "cli" },
	): HookEvent | undefined {
		return decode("claude-code", "UserPromptSubmit", raw, {
			env,
			cwd: project,
			readText: () => undefined,
		})?.events[0];
	}

	test.each([
		["workflow-brief", "[Workflow harness — computed task] "],
		["cocode-relay", '[CoCode: the agent in CoCode thread "'],
		["agent-message", '<agent-message from="'],
		["print", "Merge #12 when green."],
	])(
		"[premise] the %s channel sends no source field, so only its opening text marks it",
		(channel, opening) => {
			const raw = captured(channel);
			const event = decodedPrompt(raw);
			expect({
				source: typeof raw === "object" && raw !== null && "source" in raw,
				opening: event?.kind === "prompt" && event.text.startsWith(opening),
			}).toEqual({ source: false, opening: true });
		},
	);

	test.each([
		["workflow-brief", false],
		["cocode-relay", false],
		["agent-message", false],
		["print", true],
	])(
		"[control:sg-framed-channel] in an attended session the %s prompt is a person's prompt: %p",
		(channel, human) => {
			expect(decodedPrompt(captured(channel))).toMatchObject({
				kind: "prompt",
				human,
			});
		},
	);

	test.each([
		{ CLAUDE_CODE_ENTRYPOINT: "sdk-cli" },
		{ CLAUDE_CODE_ENTRYPOINT: "cli", CLAUDE_CODE_SESSION_ATTENDED: "0" },
	])(
		"[control:sg-unattended-channel] with env %p the print prompt is not a person's prompt",
		(env) => {
			expect(decodedPrompt(captured("print"), env)).toMatchObject({
				kind: "prompt",
				human: false,
			});
		},
	);
});

describe("the attended note", () => {
	const NOTE =
		"astack: a person typed this prompt, so this turn is attended. CLAUDE_CODE_SESSION_ATTENDED=0 makes the other turns of the session unattended. At S0 of /astack:plan, treat this turn as attended, also when astack plan attended prints unattended.";

	function promptNote(fields: Record<string, unknown>, env: Env): string {
		const quiet = mkdtempSync(join(tmpdir(), "astack-attended-"));
		try {
			mkdirSync(join(quiet, ".astack"));
			writeFileSync(
				join(quiet, ".astack/profile.json"),
				JSON.stringify({ hooks: { ste: false } }),
			);
			const output = runHook(
				"claude-code",
				"UserPromptSubmit",
				JSON.stringify({
					cwd: quiet,
					session_id: "s1",
					prompt: "go",
					...fields,
				}),
				env,
				{ ...deps(HANDLERS), cwd: quiet },
			);
			return output.stdout === ""
				? ""
				: JSON.parse(output.stdout).hookSpecificOutput.additionalContext;
		} finally {
			rmSync(quiet, { recursive: true, force: true });
		}
	}

	test.each([
		[
			"[control:sg-attended-note] a person's prompt in an unattended session gets the note, with hooks.ste off and no state folder",
			{ source: "user" },
			{ CLAUDE_CODE_SESSION_ATTENDED: "0" },
			NOTE,
		],
		[
			"a prompt with no source in an unattended session gets none",
			{},
			{ CLAUDE_CODE_SESSION_ATTENDED: "0" },
			"",
		],
		[
			"a person's prompt in an attended session gets none",
			{ source: "user" },
			{ CLAUDE_CODE_ENTRYPOINT: "cli" },
			"",
		],
	])("%s", (_, fields, env, text) => {
		expect(promptNote(fields, env)).toBe(text);
	});
});

describe("tool and event names", () => {
	test("parse only the known names", () => {
		for (const tool of TOOLS) expect(parseTool(tool)).toBe(tool);
		for (const event of HOOK_EVENTS) expect(parseEventName(event)).toBe(event);
		expect(parseTool("vim")).toBeUndefined();
		expect(parseEventName("SubagentStop")).toBeUndefined();
		expect(parseEventName(undefined)).toBeUndefined();
	});
});
