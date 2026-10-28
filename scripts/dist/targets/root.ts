import { pluginIds } from "../../../src/astack/marketplace.ts";
import { ASTACK_RULES, ruleLinkName } from "../../../src/astack/rules.ts";
import { type Build, PUBLIC_REPO } from "../build.ts";
import { type FileTree, textFile } from "../tree.ts";
import { AGENTSKILLS_ROOT } from "./agentskills.ts";
import { CLAUDE_ROOT } from "./claude-code.ts";
import { CODEX_ROOT } from "./codex.ts";
import { CURSOR_ROOT } from "./cursor.ts";
import { GROK_ROOT } from "./grok-bot.ts";

export const CLI_PATH = "cli/astack.js";
export const SHEBANG = "#!/usr/bin/env node\n";

export function packageJson(build: Build): string {
	return `${JSON.stringify(
		{
			name: "astack",
			version: build.version,
			description:
				"The astack CLI: hook dispatcher and checks for plans, comments, tickets and PR bodies.",
			license: "MIT",
			author: build.author,
			type: "module",
			bin: { astack: CLI_PATH },
			files: ["cli/", "LICENSE", "NOTICE", "README.md"],
			engines: { node: ">=22" },
			repository: {
				type: "git",
				url: `git+https://github.com/${PUBLIC_REPO}.git`,
			},
		},
		null,
		"\t",
	)}\n`;
}

function notice(build: Build): string {
	return [
		`astack ${build.version}`,
		`Copyright (c) 2026 ${build.author}. MIT License, in LICENSE.`,
		"",
		"This folder holds the built plugins of the marketplace manifest:",
		"",
		`- astack, by ${build.author}, MIT. Its notice follows.`,
		...build.marketplace.plugins
			.filter(({ name }) => name !== "astack")
			.map(
				({ name }) =>
					`- ${name}. ${CLAUDE_ROOT}/${name}/NOTICE and ${CLAUDE_ROOT}/${name}/LICENSE hold its credits and licence.`,
			),
		"",
		build.notices.astack.trimEnd(),
		"",
	].join("\n");
}

function series(items: readonly string[]): string {
	const last = items.at(-1) ?? "";
	return items.length < 2
		? last
		: `${items.slice(0, -1).join(", ")} and ${last}`;
}

function readme(build: Build): string {
	const ids = pluginIds(build.marketplace);
	return [
		"# astack",
		"",
		`astack holds skills, rules and hooks for plans, code, comments, tickets and documentation. It builds on pstack by Lauren Tan and on the skills of Matt Pocock. NOTICE gives the credits.`,
		"",
		"This folder holds generated files. The source repository keeps them under `dist/`. Each tool reads its own folder.",
		"",
		"| Tool | Folder | Install |",
		"|---|---|---|",
		`| Claude Code | \`${CLAUDE_ROOT}/\` | Add this repository as the marketplace \`astack\`. Then install ${series(ids.map((id) => `\`${id}\``))}. |`,
		`| Codex | \`${CLAUDE_ROOT}/\` and \`${CODEX_ROOT}/\` | \`${CODEX_ROOT}/README.md\` |`,
		`| Cursor | \`${CURSOR_ROOT}/\` | \`${CURSOR_ROOT}/README.md\` |`,
		`| Grok Bot | \`${GROK_ROOT}/\` | \`${GROK_ROOT}/README.md\` |`,
		`| Other Agent Skills clients | \`${AGENTSKILLS_ROOT}/\` | \`${AGENTSKILLS_ROOT}/README.md\` |`,
		"",
		"For Claude Code:",
		"",
		"```sh",
		`claude plugin marketplace add ${PUBLIC_REPO}`,
		...ids.map((id) => `claude plugin install ${id}`),
		"```",
		"",
		"Then link the shared rules from a clone of this repository. Claude Code and Grok Build read `~/.claude/rules`. Without the rule card, most chat replies fail the STE check, and each one then costs a rewrite:",
		"",
		"```sh",
		"mkdir -p ~/.claude/rules",
		...ASTACK_RULES.map(
			({ name }) =>
				`ln -s <repository root>/rules/${name}.md ~/.claude/rules/${ruleLinkName(name)}`,
		),
		"```",
		"",
		"## The CLI",
		"",
		`The hooks and many skills run the \`astack\` CLI. It needs Node 22 or later, or Bun. The Claude Code and Cursor plugins hold a copy in \`bin/\`. For CI, git hooks and other tools, run the package of this repository at a release tag:`,
		"",
		"```sh",
		`bunx github:${PUBLIC_REPO}#v${build.version} --help`,
		"```",
		"",
		"Run `astack doctor` after an install. It reports the runtime, the installed copies, duplicate skills, untrusted Codex hooks and output-style plugins that conflict with astack.",
		"",
		`Version: ${build.version}.`,
		"",
	].join("\n");
}

export function rootTarget(build: Build): FileTree {
	return new Map([
		["package.json", textFile(packageJson(build))],
		["LICENSE", textFile(build.licenses.astack)],
		["NOTICE", textFile(notice(build))],
		["README.md", textFile(readme(build))],
		[CLI_PATH, textFile(`${SHEBANG}${build.source.bundle}`, true)],
	]);
}
