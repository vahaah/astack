import { PLUGIN_IDS } from "../../src/astack/marketplace.ts";
import { ASTACK_RULES, ruleLinkName } from "../../src/astack/rules.ts";
import type { MachinePaths } from "./global.ts";

export type MigrationPaths = MachinePaths & {
	readonly oldRoot: string;
	readonly newRoot: string;
	readonly saved: string;
};

export function migrationPaths(machine: MachinePaths): MigrationPaths {
	return {
		...machine,
		oldRoot: "~/Projects/agent-stack",
		newRoot: "~/Projects/astack",
		saved: "~/.local/state/astack/migration",
	};
}

export const OLD_MARKETPLACE = "agent-stack";
export const OLD_PLUGINS = [
	"craft@agent-stack",
	"flow@agent-stack",
	"pstack@agent-stack",
] as const;
export const OLD_LINKS = [
	"agent-stack-coding.md",
	"agent-stack-comments.md",
] as const;
export const NEW_PLUGINS = PLUGIN_IDS;
const newPluginList = NEW_PLUGINS.map((id) => `\`${id}\``).join(", ");
export const NEW_LINKS = ASTACK_RULES.map(
	({ name }) => [`${name}.md`, ruleLinkName(name)] as const,
);
export const OUTPUT_STYLES = [
	"explanatory-output-style@claude-plugins-official",
	"learning-output-style@claude-plugins-official",
] as const;
export const OLD_ALLOW_RULES = [
	"Read(~/Projects/agent-stack/marketplace/**)",
	"Bash(craft:*)",
] as const;
export const NEW_ALLOW_RULES = [
	"Read(~/Projects/astack/dist/**)",
	"Bash(astack:*)",
] as const;
export const LEAKED_PROJECTS = "-private-tmp-claude-*-scratchpad-*";

export const STEP_IDS = [
	"check",
	"close",
	"save",
	"uninstall",
	"rename",
	"install",
	"links",
	"dotfiles",
	"overlay",
	"settings",
	"verify",
	"probe",
	"cleanup",
	"tools",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export type Block =
	| { readonly kind: "text"; readonly text: string }
	| {
			readonly kind: "code";
			readonly lang: "sh" | "json";
			readonly lines: readonly string[];
	  };

export type MigrationStep = {
	readonly id: StepId;
	readonly title: string;
	readonly why: string;
	readonly run: readonly Block[];
	readonly proof: string;
	readonly check: readonly string[];
};

export type SettingsState = {
	readonly oldRules: number;
	readonly outputStylesOn: number;
};

export type MigrationState = {
	readonly oldMarketplace: boolean;
	readonly oldPlugins: readonly string[];
	readonly astackMarketplace: string | undefined;
	readonly astackPlugins: readonly string[];
	readonly oldRoot: boolean;
	readonly newRoot: boolean;
	readonly rootIsOld: boolean;
	readonly savedCache: boolean;
	readonly oldCache: boolean;
	readonly oldLinks: readonly string[];
	readonly newLinks: number;
	readonly tracked: SettingsState | undefined;
	readonly live: SettingsState | undefined;
	readonly strayConfig: boolean;
	readonly leakedProjects: number;
	readonly codex: SettingsState | undefined;
	readonly codexAstack: boolean;
	readonly cursorAstack: boolean;
};

export type StepStatus = "done" | "todo" | "manual";

const unsetConfig = "env -u CLAUDE_CONFIG_DIR claude";

function sh(...lines: string[]): Block {
	return { kind: "code", lang: "sh", lines };
}

function text(value: string): Block {
	return { kind: "text", text: value };
}

function jqSettingsFilter(): string {
	const [oldRead, oldBash] = OLD_ALLOW_RULES;
	const [newRead, newBash] = NEW_ALLOW_RULES;
	return [
		"jq --indent 2 '",
		"  .permissions.allow |= map(",
		`    if . == "${oldRead}" then "${newRead}"`,
		`    elif . == "${oldBash}" then "${newBash}"`,
		"    else . end)",
		...OUTPUT_STYLES.map((id) => `  | .enabledPlugins["${id}"] = false`),
		...NEW_PLUGINS.map((id) => `  | .enabledPlugins["${id}"] = true`),
		"' settings.json > settings.json.new",
	].join("\n");
}

function codexStyleOff(id: string): string {
	const header = `\\[plugins\\."${id.replace(/\./g, "\\.")}"\\]`;
	return `-e '/^${header}$/,/^enabled = /s/^enabled = true$/enabled = false/'`;
}

export function migrationSteps(
	paths: MigrationPaths,
): readonly MigrationStep[] {
	const { oldRoot, newRoot, config, dotfiles, saved } = paths;
	const plugins = `${config}/plugins`;
	const astackBin = `${newRoot}/dist/claude-code/astack/bin/astack`;
	return [
		{
			id: "check",
			title: "Check the tree",
			why: "The repo has no commits, so the switch moves the only copy of the source. Start only from a green check.",
			run: [
				sh(
					`cd ${oldRoot}`,
					"bun install",
					"bun run check",
					"bun run apply --global --dry-run",
				),
			],
			proof:
				"`bun run check` exits 0. The dry run shows each step of this file as todo or manual.",
			check: [],
		},
		{
			id: "close",
			title: "Close the other sessions",
			why: "A running session keeps the old hooks from the plugin cache until it starts again. Run the next steps in a plain terminal, or in one session that does not run in the repo.",
			run: [sh("cd ~")],
			proof:
				"No other Claude Code session is open in a profile. The coordinator makes sure of this by hand.",
			check: [],
		},
		{
			id: "save",
			title: "Save the old plugins",
			why: "The plugin cache holds the only copy of the old craft plugin. A rollback needs it.",
			run: [
				sh(
					`mkdir -p ${saved}`,
					`cp -R ${plugins}/cache/${OLD_MARKETPLACE} ${saved}/${OLD_MARKETPLACE}-cache`,
					`cp ${plugins}/known_marketplaces.json ${plugins}/installed_plugins.json ${saved}/`,
				),
			],
			proof: "The list shows `craft`, `flow` and `pstack`.",
			check: [`ls ${saved}/${OLD_MARKETPLACE}-cache`],
		},
		{
			id: "uninstall",
			title: "Remove the old plugins and marketplace",
			why: `The profiles that link their \`plugins\` folder to \`${plugins}\` share it, so one run changes all of them. Unset \`CLAUDE_CONFIG_DIR\` for the default profile. With \`CLAUDE_CONFIG_DIR=${config}\`, Claude Code makes a second config file \`${config}/.claude.json\`.`,
			run: [
				sh(
					...OLD_PLUGINS.map(
						(id) => `${unsetConfig} plugin uninstall ${id} --scope user`,
					),
					`${unsetConfig} plugin marketplace remove ${OLD_MARKETPLACE}`,
				),
			],
			proof: "The two commands print nothing.",
			check: [
				`jq -r '.plugins | keys[] | select(endswith("@${OLD_MARKETPLACE}"))' ${plugins}/installed_plugins.json`,
				`jq -r 'keys[] | select(. == "${OLD_MARKETPLACE}")' ${plugins}/known_marketplaces.json`,
			],
		},
		{
			id: "rename",
			title: "Rename the directory",
			why: "The old rule links point at the old path. They break here, and the step that links the rules replaces them.",
			run: [sh(`mv ${oldRoot} ${newRoot}`)],
			proof: "The command prints `renamed`.",
			check: [
				`test -f ${newRoot}/dist/.claude-plugin/marketplace.json && test ! -e ${oldRoot} && echo renamed`,
			],
		},
		{
			id: "install",
			title: "Add the astack marketplace and plugins",
			why: `\`dist/\` is the publish root, so the install reads the files that the public repo gets later. \`bun run apply --global\` in \`${newRoot}\` runs the same commands and makes the ${NEW_LINKS.length} links of the next step.`,
			run: [
				sh(
					`${unsetConfig} plugin marketplace add ${newRoot}/dist --scope user`,
					...NEW_PLUGINS.map(
						(id) => `${unsetConfig} plugin install ${id} --scope user`,
					),
				),
			],
			proof: `The command prints ${newPluginList}.`,
			check: [
				`jq -r '.plugins | keys[] | select(endswith("@astack"))' ${plugins}/installed_plugins.json`,
			],
		},
		{
			id: "links",
			title: "Link the rules",
			why: `These links also serve each profile that links its \`rules\` folder to \`${config}/rules\`.`,
			run: [
				sh(
					`rm -f ${OLD_LINKS.map((name) => `${config}/rules/${name}`).join(" ")}`,
					...NEW_LINKS.map(
						([source, link]) =>
							`ln -s ${newRoot}/rules/${source} ${config}/rules/${link}`,
					),
				),
			],
			proof: `The list shows ${NEW_LINKS.length} links into \`${newRoot}/rules\` and no \`${OLD_MARKETPLACE}\` file.`,
			check: [`ls -l ${config}/rules`],
		},
		{
			id: "dotfiles",
			title: "Change the tracked settings",
			why: `\`${dotfiles}/settings.json\` is the source of the live \`${config}/settings.json\`. The command replaces the two old allow rules and turns off the explanatory and learning output styles, because they conflict with STE replies. It keeps the plugin cache reads and the pstack store rule.`,
			run: [
				sh(
					`cd ${dotfiles}`,
					jqSettingsFilter(),
					"mv settings.json.new settings.json",
					`git -C ${dotfiles} diff -- settings.json`,
				),
			],
			proof:
				"The diff changes only the allow rules and plugin entries. The `grep` command prints 0.",
			check: [`grep -c '${OLD_MARKETPLACE}\\|craft' ${dotfiles}/settings.json`],
		},
		{
			id: "overlay",
			title: "Change the private overlay",
			why: `Only the owner does this step, because agents must not read \`${config}/settings.private.json\`. That file holds the entries with absolute paths.`,
			run: [
				sh(`grep -c '${OLD_MARKETPLACE}' ${config}/settings.private.json`),
				text(
					`When the count is not 0, open the file in an editor. Delete each key that ends in \`@${OLD_MARKETPLACE}\`. Replace the \`${OLD_MARKETPLACE}\` entry under \`extraKnownMarketplaces\` with this entry, and write your home folder in the path:`,
				),
				{
					kind: "code",
					lang: "json",
					lines: [
						'"astack": { "source": { "source": "directory", "path": "/Users/<you>/Projects/astack/dist" } }',
					],
				},
			],
			proof: "The `grep` command prints 0.",
			check: [`grep -c '${OLD_MARKETPLACE}' ${config}/settings.private.json`],
		},
		{
			id: "settings",
			title: "Apply the settings",
			why: `\`settings.py check\` prints the diff. It reads the private overlay, so do not paste its output. \`settings.py apply\` writes \`${config}/settings.json\`.`,
			run: [
				sh(`${dotfiles}/settings.py check`, `${dotfiles}/settings.py apply`),
			],
			proof:
				"The first command prints `false` for each output style and `true` for each current plugin. The second command prints nothing.",
			check: [
				`jq '${[...OUTPUT_STYLES, ...NEW_PLUGINS].map((id) => `.enabledPlugins["${id}"]`).join(", ")}' ${config}/settings.json`,
				`jq -r '.permissions.allow[] | select(test("${OLD_MARKETPLACE}|craft"))' ${config}/settings.json`,
			],
		},
		{
			id: "verify",
			title: "Verify each profile",
			why: "Each profile must show each astack plugin one time. `astack doctor` reads every profile, Codex and Cursor.",
			run: [
				sh(
					`${unsetConfig} plugin list`,
					...paths.profiles.map(
						(profile) => `CLAUDE_CONFIG_DIR=${profile} claude plugin list`,
					),
					`${astackBin} doctor`,
				),
			],
			proof: `Each list shows ${newPluginList} one time, and each one is on. No list shows a plugin from \`${OLD_MARKETPLACE}\`, and the two output-style plugins are off. \`astack doctor\` shows no FAIL line for a profile that shares \`${plugins}\`. It can still show FAIL lines for a profile with its own config, Codex, Cursor and \`~/.agents/skills\`. The last step sets up Codex and Cursor. \`bun run apply --global --dry-run\` prints the commands that remove the duplicate skills.`,
			check: [],
		},
		{
			id: "probe",
			title: "Run a headless deny test",
			why: "The test sends one Write payload to the installed hook. It needs no model call.",
			run: [
				sh(
					'probe="$(mktemp -d)"',
					`hook="$(jq -r '.plugins["astack@astack"][0].installPath' ${plugins}/installed_plugins.json)/bin/astack"`,
					`printf '{"session_id":"migration-probe","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"%s/a.ts","content":"export const x: any = 1;\\\\n"}}' "$probe" "$probe" | "$hook" hook claude-code PreToolUse; echo "exit $?"`,
				),
			],
			proof:
				"The output starts with `astack blocked this write` and ends with `exit 2`.",
			check: [],
		},
		{
			id: "cleanup",
			title: "Clean up",
			why: `The uninstall keeps the old cache. Earlier test runs left empty data folders and project folders in the real config. A run with \`CLAUDE_CONFIG_DIR=${config}\` left the second config file. Update each memory note that the last command shows.`,
			run: [
				sh(
					`rm -rf ${plugins}/cache/${OLD_MARKETPLACE}`,
					`find ${plugins}/data -maxdepth 1 -type d -empty \\( -name '*-${OLD_MARKETPLACE}' -o -name craft-inline -o -name probe-inline -o -name probeplan-inline \\) -print -delete`,
					`find ${config}/projects -maxdepth 1 -type d -name '${LEAKED_PROJECTS}' -print -exec rm -rf {} +`,
					`rm -f ${config}/.claude.json`,
					`grep -rl '${OLD_MARKETPLACE}' ~/.claude*/projects/*/memory/`,
				),
			],
			proof:
				"The last command shows only the notes that you updated, or nothing.",
			check: [],
		},
		{
			id: "tools",
			title: "Set up Codex and Cursor",
			why: "Codex reads the same marketplace, and it runs a plugin hook only after you trust it. Cursor ignores symbolic links, so the command copies the plugin. Run the `cat` command one time only.",
			run: [
				sh(
					`codex plugin marketplace add ${newRoot}/dist`,
					...NEW_PLUGINS.map((id) => `codex plugin add ${id}`),
					`cat ${newRoot}/dist/codex/AGENTS.fragment.md >> ~/.codex/AGENTS.md`,
					`sed -i '' ${OUTPUT_STYLES.map(codexStyleOff).join(" ")} ~/.codex/config.toml`,
					"mkdir -p ~/.cursor/plugins/local",
					"rm -rf ~/.cursor/plugins/local/astack",
					`cp -R ${newRoot}/dist/cursor/astack ~/.cursor/plugins/local/astack`,
				),
				text(
					"Then start Codex, open `/hooks` and trust the four astack hooks. Reload Cursor, and turn off the two output-style plugins that Cursor imported.",
				),
			],
			proof: "`astack doctor` shows no FAIL line for Codex and Cursor.",
			check: [`${astackBin} doctor`],
		},
	];
}

export function rollback(paths: MigrationPaths): readonly Block[] {
	const cache = `${paths.saved}/${OLD_MARKETPLACE}-cache`;
	return [
		text(
			"The repo has no commits, so a rollback cannot bring back the old source. The saved cache holds the old plugins. These commands remove astack and start a session with the old plugins:",
		),
		sh(
			...NEW_PLUGINS.map(
				(id) => `${unsetConfig} plugin uninstall ${id} --scope user`,
			),
			`${unsetConfig} plugin marketplace remove astack`,
			`claude --plugin-dir ${cache}/craft/* --plugin-dir ${cache}/pstack/* --plugin-dir ${cache}/flow/*`,
		),
	];
}

function exhausted(id: never): never {
	throw new Error(`unknown migration step ${String(id)}`);
}

function settingsDone(settings: SettingsState | undefined): StepStatus {
	if (settings === undefined) return "manual";
	return settings.oldRules === 0 && settings.outputStylesOn === 0
		? "done"
		: "todo";
}

function when(done: boolean): StepStatus {
	return done ? "done" : "todo";
}

export function stepStatus(id: StepId, state: MigrationState): StepStatus {
	switch (id) {
		case "check":
		case "close":
		case "overlay":
		case "verify":
		case "probe":
			return "manual";
		case "save":
			return when(
				state.savedCache || (!state.oldCache && state.oldPlugins.length === 0),
			);
		case "uninstall":
			return when(!state.oldMarketplace && state.oldPlugins.length === 0);
		case "rename":
			return when(state.newRoot && !state.oldRoot);
		case "install":
			return when(
				state.astackPlugins.length === NEW_PLUGINS.length &&
					(state.astackMarketplace ?? "").endsWith("/astack/dist"),
			);
		case "links":
			return when(
				state.oldLinks.length === 0 && state.newLinks === NEW_LINKS.length,
			);
		case "dotfiles":
			return settingsDone(state.tracked);
		case "settings":
			return settingsDone(state.live);
		case "cleanup":
			return when(
				!state.oldCache && !state.strayConfig && state.leakedProjects === 0,
			);
		case "tools":
			return when(
				state.codexAstack &&
					state.cursorAstack &&
					settingsDone(state.codex) === "done",
			);
		default:
			return exhausted(id);
	}
}

export function migrationPending(state: MigrationState): boolean {
	return state.oldMarketplace || state.oldPlugins.length > 0 || state.rootIsOld;
}

export function migrationRefusal(state: MigrationState): string | undefined {
	return migrationPending(state)
		? "Refused: the agent-stack install is still active. Do the migration steps above first. docs/migration.md holds the same steps."
		: undefined;
}

export function settingsState(settings: unknown): SettingsState | undefined {
	if (typeof settings !== "object" || settings === null) return undefined;
	const permissions = Reflect.get(settings, "permissions");
	const allow =
		typeof permissions === "object" && permissions !== null
			? Reflect.get(permissions, "allow")
			: undefined;
	const enabled = Reflect.get(settings, "enabledPlugins");
	const rules = Array.isArray(allow) ? allow : [];
	return {
		oldRules: rules.filter(
			(rule) =>
				typeof rule === "string" && OLD_ALLOW_RULES.some((old) => old === rule),
		).length,
		outputStylesOn: OUTPUT_STYLES.filter(
			(id) =>
				typeof enabled === "object" &&
				enabled !== null &&
				Reflect.get(enabled, id) === true,
		).length,
	};
}

export function codexState(config: string): {
	readonly settings: SettingsState;
	readonly astack: boolean;
} {
	const on = (id: string) =>
		new RegExp(
			`^\\[plugins\\."${id.replace(/[.]/g, "\\.")}"\\]\\s*\\nenabled = true`,
			"m",
		).test(config);
	return {
		settings: {
			oldRules: 0,
			outputStylesOn: OUTPUT_STYLES.filter(on).length,
		},
		astack: on("astack@astack"),
	};
}

function blockLines(block: Block): readonly string[] {
	switch (block.kind) {
		case "text":
			return [block.text];
		case "code":
			return [`\`\`\`${block.lang}`, ...block.lines, "```"];
	}
}

export function renderMigrationDoc(paths: MigrationPaths): string {
	const steps = migrationSteps(paths);
	const sections = steps.flatMap((step, index) => [
		`## ${index + 1}. ${step.title}`,
		"",
		step.why,
		"",
		...step.run.flatMap((block) => [...blockLines(block), ""]),
		`Proof. ${step.proof}`,
		"",
		...(step.check.length > 0 ? [...blockLines(sh(...step.check)), ""] : []),
	]);
	return [
		"# Migration from agent-stack",
		"",
		"`bun run build` writes this file from `scripts/lib/migration.ts`. `bun run apply --global --dry-run` prints the same steps with the state of each step.",
		"",
		`The switch moves the installed agent-stack to astack. Before the switch, the marketplace \`${OLD_MARKETPLACE}\` serves \`pstack\`, \`craft\` and \`flow\` from \`${paths.oldRoot}/marketplace\`. The rule links are \`${OLD_LINKS.join("` and `")}\` in \`${paths.config}/rules\`. After the switch, the marketplace \`astack\` serves ${newPluginList} from \`${paths.newRoot}/dist\`.`,
		"",
		`A profile in \`machine.json\` of the companion can link its \`plugins\` and \`rules\` folders and its \`settings.json\` to \`${paths.config}\`. Then one change in \`${paths.config}\` serves each of these profiles. This switch does not change a profile that has its own config.`,
		"",
		"Do the steps in order. Start the next step only when the proof of the step passes. Each step takes less than a minute.",
		"",
		...sections,
		"## Roll back",
		"",
		...rollback(paths).flatMap((block) => [...blockLines(block), ""]),
	]
		.join("\n")
		.replace(/\n+$/, "\n");
}

export function describeMigration(
	paths: MigrationPaths,
	state: MigrationState,
): string[] {
	return migrationSteps(paths).flatMap((step, index) => [
		`${index + 1}. [${stepStatus(step.id, state)}] ${step.title}`,
		...step.run.flatMap((block) =>
			block.kind === "text"
				? [`    ${block.text}`]
				: block.lang === "sh"
					? block.lines.flatMap(commandLines)
					: block.lines.map((line) => `      ${line}`),
		),
		`    Proof: ${step.proof}`,
		...step.check.flatMap(commandLines),
	]);
}

function commandLines(command: string): string[] {
	const [first = "", ...rest] = command.split("\n");
	return [`    $ ${first}`, ...rest.map((line) => `      ${line}`)];
}
