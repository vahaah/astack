import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CHECKS } from "../../src/astack/cli/commands/check/index.ts";
import { ALIASES, COMMANDS } from "../../src/astack/cli/commands/index.ts";
import type { Io } from "../../src/astack/cli/io.ts";
import { main, usage } from "../../src/astack/cli/main.ts";
import { HOOK_EVENTS } from "../../src/astack/hook/events.ts";

const ROOT = resolve(import.meta.dir, "../..");
const HOOKS = join(ROOT, "marketplace/plugins/astack/hooks/hooks.json");

function capture(cwd = ROOT): { io: Io; out: () => string; err: () => string } {
	let out = "";
	let err = "";
	return {
		io: {
			out: (text) => {
				out += text;
			},
			err: (text) => {
				err += text;
			},
			cwd,
			env: {},
			today: "2026-10-16",
			now: new Date("2026-10-16T09:30:00Z"),
			scriptPath: undefined,
		},
		out: () => out,
		err: () => err,
	};
}

describe("the command registry", () => {
	test("names are unique across commands and aliases", () => {
		const names = [...COMMANDS, ...ALIASES].map((command) => command.name);
		expect(new Set(names).size).toBe(names.length);
		expect(names).toEqual([
			"hook",
			"check",
			"plan",
			"plan-ticket",
			"session",
			"stack",
			"board",
			"skill-path",
			"managed",
			"doctor",
			"print",
			"init",
			"orch",
			"watch-pr",
			"check-comments",
			"check-types",
			"check-ticket",
			"check-pr",
			"check-plan",
			"check-ste",
			"check-migrations",
			"check-stack-config",
			"check-ci-pins",
		]);
	});

	test("each alias runs its check", () => {
		for (const check of CHECKS) {
			const alias = ALIASES.find(
				(command) => command.name === `check-${check.name}`,
			);
			expect(alias?.run).toBe(check.run);
		}
	});

	test("help lists every command and check", () => {
		const run = capture();
		expect(main(["help"], run.io)).toBe(0);
		expect(run.out()).toBe(`${usage()}\n`);
		for (const command of COMMANDS)
			for (const line of command.usage.split("\n"))
				expect(run.out()).toContain(`  astack ${line}\n`);
		for (const check of CHECKS)
			expect(run.out()).toContain(`check ${check.name}: ${check.summary}`);
	});

	test("check <name> and check-<name> give the same result", () => {
		const viaCheck = capture();
		const viaAlias = capture();
		const args = ["--template=programme"];
		expect(main(["check", "plan", ...args], viaCheck.io)).toBe(0);
		expect(main(["check-plan", ...args], viaAlias.io)).toBe(0);
		expect(viaCheck.out()).toBe(viaAlias.out());
		expect(viaCheck.out()).toContain("tier: programme");
	});

	test.each([
		[
			["orch", "--help"],
			0,
			"usage: astack orch [--store <dir>] [--json] [--force] <command>\n",
			"",
		],
		[["watch-pr", "--help"], 0, "Usage: astack watch-pr [options]\n", ""],
		[
			["watch-pr", "--interval", "0"],
			64,
			"",
			"error: option '--interval <seconds>' argument '0' is invalid. must be greater than zero\n",
		],
	])(
		"astack %p exits %p and writes through the io of the CLI",
		async (args, code, out, err) => {
			const run = capture();
			expect(await main(args, run.io)).toBe(code);
			expect(run.out()).toStartWith(out);
			expect(run.err()).toBe(err);
		},
	);

	test("an unknown command or check exits 2", () => {
		const unknown = capture();
		expect(main(["frobnicate"], unknown.io)).toBe(2);
		expect(unknown.err()).toStartWith("astack: unknown command frobnicate\n");
		const badCheck = capture();
		expect(main(["check", "spelling"], badCheck.io)).toBe(2);
		expect(badCheck.err()).toBe(
			"astack check: give one of comments, types, ticket, pr, plan, ste, migrations, stack-config, ci-pins\n",
		);
	});

	test("hook with an unknown tool or event exits 0 and prints nothing", () => {
		for (const args of [
			["hook"],
			["hook", "vim", "Stop"],
			["hook", "claude-code", "SubagentStop"],
		]) {
			const run = capture();
			expect(main(args, run.io)).toBe(0);
			expect(run.out()).toBe("");
			expect(run.err()).toBe("");
		}
	});
});

type HookEntry = {
	matcher?: string;
	hooks: { type: string; command: string; timeout: number }[];
};

describe("hooks.json", () => {
	const hooks: Record<string, HookEntry[]> = JSON.parse(
		readFileSync(HOOKS, "utf8"),
	).hooks;

	test("has one dispatcher entry for each event the CLI decodes, and no SubagentStop", () => {
		expect(Object.keys(hooks).sort()).toEqual([...HOOK_EVENTS].sort());
		for (const event of HOOK_EVENTS) {
			const entries = hooks[event] ?? [];
			expect(entries).toHaveLength(1);
			expect(entries[0]?.hooks).toEqual([
				{
					type: "command",
					command: `sh -c '"\${CLAUDE_PLUGIN_ROOT:-$GROK_PLUGIN_ROOT}/bin/astack" hook claude-code ${event}'`,
					timeout: 10,
				},
			]);
		}
	});

	test("PreToolUse matches the fixed tool set and every MCP tool", () => {
		expect(hooks.PreToolUse?.[0]?.matcher).toBe(
			"Edit|Write|MultiEdit|NotebookEdit|Bash|apply_patch|mcp__.*",
		);
		for (const event of HOOK_EVENTS.filter((name) => name !== "PreToolUse"))
			expect(hooks[event]?.[0]?.matcher).toBeUndefined();
	});
});
