import {
	CODEX_HOOK_EVENTS,
	CODEX_HOOK_HASHES,
} from "../../../src/astack/codex-trust.ts";
import { codexTrustKey } from "../../../src/astack/doctor.ts";
import { pluginIds } from "../../../src/astack/marketplace.ts";
import { ASTACK_RULES } from "../../../src/astack/rules.ts";
import { type Build, HOOKS_PATH, PUBLIC_REPO } from "../build.ts";
import { toCodex } from "../codemods.ts";
import { type Rule, scopeLine } from "../flat.ts";
import { type FileTree, textFile } from "../tree.ts";
import { CLAUDE_ROOT } from "./claude-code.ts";

export const CODEX_ROOT = "codex";
export const FRAGMENT_RULES = ASTACK_RULES.filter((rule) => rule.fragment).map(
	({ name }) => name,
);
export const FRAGMENT_LIMIT = 10 * 1024;
export const CODEX_AGENTS_LIMIT = 32 * 1024;

export function fragmentRules(rules: readonly Rule[]): readonly Rule[] {
	return rules.filter((rule) =>
		FRAGMENT_RULES.some((name) => name === rule.name),
	);
}

export function fragment(
	rules: readonly Rule[],
	rewrite: (text: string) => string,
	version: string,
): string {
	const sections = fragmentRules(rules).map((rule) =>
		[scopeLine(rule), rewrite(rule.body).trimEnd()]
			.filter((part): part is string => part !== undefined)
			.join("\n\n"),
	);
	return [
		`<!-- astack ${version} -->`,
		...sections.map((section) => `${section}\n`),
		`<!-- /astack ${version} -->`,
		"",
	].join("\n");
}

const CODEX_CLI = [
	"## The astack CLI",
	"",
	"The skills run the `astack` CLI. When `astack` is not on PATH, run `node <plugin root>/bin/astack.js` in its place. The plugin root is the folder above the `skills` folder of the skill.",
	"",
].join("\n");

export function codexFragment(build: Build): string {
	return fragment(build.rules, (text) => toCodex(text), build.version).replace(
		`<!-- astack ${build.version} -->\n`,
		`<!-- astack ${build.version} -->\n${CODEX_CLI}\n`,
	);
}

export function trustPins(): string {
	return `${JSON.stringify(
		Object.fromEntries(
			CODEX_HOOK_EVENTS.map((event) => [
				codexTrustKey("astack@astack", event),
				CODEX_HOOK_HASHES[event],
			]),
		),
		null,
		"\t",
	)}\n`;
}

function readme(build: Build, fragmentBytes: number): string {
	return [
		"# astack for Codex",
		"",
		`Codex reads the Claude Code build in \`${CLAUDE_ROOT}/\` through its marketplace support. This folder holds what a Codex plugin cannot ship.`,
		"",
		"## Install",
		"",
		`1. Add the marketplace. Use the path of the repository root, or \`${PUBLIC_REPO}\` after publish. Then add each plugin:`,
		"",
		"   ```sh",
		"   codex plugin marketplace add <repository root>",
		...pluginIds(build.marketplace).map((id) => `   codex plugin add ${id}`),
		"   ```",
		"",
		"2. Start Codex and open `/hooks`. Trust the four astack hooks. Codex runs a plugin hook only after you trust it.",
		"3. Put the astack CLI on PATH, because Codex does not add the `bin/` folder of a plugin to PATH. The skills run `astack`:",
		"",
		"   ```sh",
		`   ln -s <repository root>/${CLAUDE_ROOT}/astack/bin/astack ~/.local/bin/astack`,
		"   ```",
		"",
		"4. Add `AGENTS.fragment.md` to `~/.codex/AGENTS.md`, because a plugin cannot ship that file. `astack print codex-agents` prints the file with the astack block in it. It replaces an old block between the `<!-- astack -->` markers, so an upgrade adds no second copy:",
		"",
		"   ```sh",
		"   astack print codex-agents ~/.codex/AGENTS.md > ~/.codex/AGENTS.md.new && mv ~/.codex/AGENTS.md.new ~/.codex/AGENTS.md",
		"   ```",
		"",
		"5. Run `astack doctor`. It reports astack hooks that Codex does not trust, and trusted hooks whose hash is not the hash of this release.",
		"",
		"## Limits",
		"",
		`- Codex trusts each hook by its own hash. \`hooks.trust.json\` holds the hash that Codex shows for each astack hook of this release, and \`astack doctor\` compares the \`trusted_hash\` values in \`~/.codex/config.toml\` with it. \`hooks.json.sha256\` holds the hash of the file \`${CLAUDE_ROOT}/astack/${HOOKS_PATH}\`. When a release changes either one, trust the hooks again.`,
		"- Codex calls a skill with `$`, as in `$astack:plan`.",
		`- Codex reads at most ${CODEX_AGENTS_LIMIT / 1024} KiB of AGENTS.md text in a session. The fragment has ${fragmentBytes} bytes, and the limit for it is ${FRAGMENT_LIMIT / 1024} KiB.`,
		"- The Codex sandbox has no network access by default, so the tracker steps ask for approval.",
		"- Codex sends a file edit as `apply_patch`. The astack CLI reads the patch and runs the edit checks on each file that it adds or changes. No live Codex session tested this path yet.",
		"",
		`Version: ${build.version}.`,
		"",
	].join("\n");
}

export function codexTarget(build: Build): FileTree {
	const text = codexFragment(build);
	const bytes = new TextEncoder().encode(text).length;
	return new Map([
		[`${CODEX_ROOT}/AGENTS.fragment.md`, textFile(text)],
		[
			`${CODEX_ROOT}/hooks.json.sha256`,
			textFile(`${build.hooksSha256}  ${CLAUDE_ROOT}/astack/${HOOKS_PATH}\n`),
		],
		[`${CODEX_ROOT}/hooks.trust.json`, textFile(trustPins())],
		[`${CODEX_ROOT}/README.md`, textFile(readme(build, bytes))],
	]);
}
