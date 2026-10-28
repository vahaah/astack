import {
	CURSOR_EVENTS,
	type CursorEvent,
} from "../../../src/astack/hook/decode/cursor.ts";
import { type Build, PUBLIC_REPO, thirdPartyFiles } from "../build.ts";
import { emits } from "../capability.ts";
import {
	cursorRule,
	type FlatBuild,
	flatAgent,
	flatAgents,
	flatSkill,
	flatSkills,
} from "../flat.ts";
import { type FileTree, mount, textFile, union } from "../tree.ts";

export const CURSOR_ROOT = "cursor/astack";

type HookOptions = { readonly matcher?: string; readonly loop_limit?: number };

const HOOK_OPTIONS: Readonly<Record<CursorEvent, HookOptions>> = {
	sessionStart: {},
	beforeSubmitPrompt: {},
	preToolUse: { matcher: "Write" },
	afterFileEdit: {},
	beforeShellExecution: {},
	beforeMCPExecution: {},
	afterAgentResponse: {},
	stop: { loop_limit: 1 },
};

export function cursorHookCommand(event: CursorEvent): string {
	return `sh "\${CURSOR_PLUGIN_ROOT}/bin/astack" hook cursor ${event}`;
}

export function cursorHooks(): string {
	const hooks = Object.fromEntries(
		CURSOR_EVENTS.map((event) => [
			event,
			[
				{
					command: cursorHookCommand(event),
					timeout: 10,
					...HOOK_OPTIONS[event],
				},
			],
		]),
	);
	return `${JSON.stringify({ version: 1, hooks }, null, "\t")}\n`;
}

function manifest(build: Build): string {
	return `${JSON.stringify(
		{
			name: "astack",
			displayName: "astack",
			version: build.version,
			description:
				"Plan, code, comment, ticket and documentation standards with enforcement hooks, plus the astack skills.",
			author: { name: build.author },
			homepage: `https://github.com/${PUBLIC_REPO}`,
			repository: `https://github.com/${PUBLIC_REPO}`,
			license: "MIT",
			keywords: ["astack", "flow", "planning", "standards", "hooks"],
			category: "developer-tools",
			skills: "./skills/",
			agents: "./agents/",
			rules: "./rules/",
			hooks: "./hooks/hooks.json",
		},
		null,
		"\t",
	)}\n`;
}

export function cursorMarketplace(build: Build): string {
	return `${JSON.stringify(
		{
			name: "astack",
			owner: { name: build.author },
			metadata: {
				description:
					"astack for Cursor: the astack skills, the astack rules and the astack hooks.",
			},
			plugins: [
				{
					name: "astack",
					source: CURSOR_ROOT,
					description:
						"Plan, code, comment, ticket and documentation standards with enforcement hooks, plus the astack skills.",
				},
			],
		},
		null,
		"\t",
	)}\n`;
}

function readme(count: number): string {
	return [
		"# astack for Cursor",
		"",
		`This plugin holds ${count} skills, the astack rules and the astack hooks. One astack plugin supplies each item.`,
		"",
		"## Install",
		"",
		`For a public install, import \`https://github.com/${PUBLIC_REPO}\` with \`From GitHub Repository\` in Cursor Customize. Then install \`astack\`.`,
		"",
		"For a local install, copy the plugin into `~/.cursor/plugins/local/`. Cursor ignores symbolic links in that folder.",
		"Use the source root or the built output root for these commands. Move an existing local astack plugin to a backup first.",
		"",
		"```sh",
		"ASTACK_BUILD=.",
		"if test -d dist/cursor/astack; then ASTACK_BUILD=dist; fi",
		"mkdir -p ~/.cursor/plugins/local",
		`cp -R "$ASTACK_BUILD/${CURSOR_ROOT}" ~/.cursor/plugins/local/astack`,
		"```",
		"",
		"Then reload Cursor. The skills run the `astack` CLI, so put the `bin` folder of the plugin on your `PATH`:",
		"",
		"```sh",
		'export PATH="$HOME/.cursor/plugins/local/astack/bin:$PATH"',
		"```",
		"",
		"The CLI needs Node 22 or later, or Bun.",
		"",
		"## Cloud agents",
		"",
		"Use project skills under `.cursor/skills/` for cloud agents and automations. Keep the CLI and reference files with the project.",
		"Read `docs/runbooks/install-cursor-cloud.md` in the source repository for the bundle route and its verification steps.",
		"Personal skill sync covers `~/.cursor/skills/`. It does not sync local plugin folders or `~/.agents/skills/`.",
		"Automation runs do not load personal synced skills. Start a new cloud agent after an update.",
		"",
		"Source: https://cursor.com/docs/skills",
		"",
		"## Names",
		"",
		"Cursor gives each skill a flat name. Each skill starts with `astack-`, as in `/astack-plan` and `/astack-grilling`.",
		"",
		"## Hooks",
		"",
		"Each hook runs `bin/astack hook cursor <event>`. The CLI sends the event to the same handlers that the other tools use.",
		"",
		"| Event | What astack does |",
		"|---|---|",
		"| `preToolUse` on `Write` | Checks the file before the write, and denies a proven problem. |",
		"| `afterFileEdit` | Checks the edit after the write, and keeps each problem for the `stop` hook. |",
		"| `beforeShellExecution` | Checks commits, PR bodies and issue bodies. |",
		"| `beforeMCPExecution` | Checks the issue writes of a Linear MCP server. |",
		"| `beforeSubmitPrompt` | Counts the prompts of the user for the reply check. |",
		"| `afterAgentResponse` | Keeps the last reply for the `stop` hook. |",
		"| `stop` | Sends one follow-up message with the problems that the edit and reply checks found. |",
		"| `sessionStart` | Adds the plan pointer. |",
		"",
		"The hooks fail open. When the CLI finds no Node or Bun, or cannot read a payload, the action continues.",
		"",
		"Two parts are not tested on Cursor yet. Cursor does not document the input of `preToolUse` for `Write`. When the CLI cannot read it, the `afterFileEdit` hook and the follow-up message are the only checks of an edit. The `additional_context` output of `sessionStart` is also not tested.",
		"",
		"## Licence",
		"",
		"astack is MIT. Some skills include text from pstack and mattpocock/skills. `NOTICE` and the skill licence files hold their credits.",
		"",
	].join("\n");
}

export function cursorTarget(build: Build, flat: FlatBuild): FileTree {
	const skills = flatSkills(build, "cursor");
	const agents = flatAgents(build, "cursor");
	const rules = emits("rule-card", "cursor") ? build.rules : [];
	const astack = build.source.plugins.astack;
	const copy = (path: string): FileTree => {
		const entry = astack.get(path);
		return entry === undefined ? new Map() : new Map([[path, entry]]);
	};
	const plugin = union([
		new Map([
			[".cursor-plugin/plugin.json", textFile(manifest(build))],
			["hooks/hooks.json", textFile(cursorHooks())],
			["README.md", textFile(readme(skills.length))],
			["LICENSE", textFile(build.licenses.astack)],
			["NOTICE", textFile(build.notices.astack)],
		]),
		thirdPartyFiles(build, [...skills, ...agents]),
		copy("bin/astack"),
		copy("bin/astack.js"),
		copy("bin/package.json"),
		...skills.map((skill) => flatSkill(skill, flat)),
		...agents.map((agent) => flatAgent(agent, flat)),
		...rules.map((rule) => cursorRule(rule, flat)),
	]);
	return union([
		new Map([
			[".cursor-plugin/marketplace.json", textFile(cursorMarketplace(build))],
		]),
		mount(CURSOR_ROOT, plugin),
	]);
}
