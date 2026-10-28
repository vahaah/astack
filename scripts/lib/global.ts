import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { MARKETPLACE_NAME, PLUGIN_IDS } from "../../src/astack/marketplace.ts";
import { err, ok, type Result } from "../../src/astack/result.ts";
import { ASTACK_RULES, ruleLinkName } from "../../src/astack/rules.ts";
import {
	type DuplicateSkill,
	duplicateReportLines,
} from "./duplicate-skills.ts";
import { pluginReadRule, sharedAllowRules } from "./settings.ts";

export type LinkProbe = (path: string) => {
	kind: "missing" | "symlink" | "file" | "directory";
	target?: string;
};

export type GlobalInputs = {
	root: string;
	home: string;
	configDir: string;
	knownMarketplaces: unknown;
	installedPlugins: unknown;
	probe: LinkProbe;
	ruleNames: readonly string[];
	repoRulesDirs: readonly string[];
	duplicateSkills: readonly DuplicateSkill[];
	flowBuilt: boolean;
	profileDirs?: readonly string[];
	companionRules?: readonly string[];
	skillsTxtPath?: string;
	dotfilesSettings?: string;
};

export type CommandStep = {
	kind: "command";
	title: string;
	argv: string[];
	env: Record<string, string>;
	action: "run" | "skip" | "refuse";
	reason: string;
};

export type SymlinkStep = {
	kind: "symlink";
	title: string;
	source: string;
	target: string;
	action: "create" | "replace" | "skip" | "refuse";
	reason: string;
};

export type SettingsStep = {
	kind: "settings";
	title: string;
	json: Record<string, unknown>;
	instructions: string[];
};

export type ReportStep = {
	kind: "report";
	title: string;
	lines: string[];
};

export type GlobalStep = CommandStep | SymlinkStep | SettingsStep | ReportStep;

export const linkedRules = ASTACK_RULES.map(({ name }) => name);

export const repoCopiedRules: readonly string[] = ASTACK_RULES.filter(
	(rule) => rule.repo,
).map(({ name }) => name);

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalConfigDir(configDir: string): string {
	const plugins = join(configDir, "plugins");
	try {
		if (!lstatSync(plugins).isSymbolicLink()) return configDir;
		return dirname(realpathSync(plugins));
	} catch {
		return configDir;
	}
}

export function tildePath(path: string, home: string): string {
	const rel = relative(home, path);
	if (rel === "" || rel.startsWith("..") || rel.startsWith("/")) return path;
	return `~/${rel}`;
}

export type MachinePaths = {
	readonly config: string;
	readonly dotfiles: string;
	readonly profiles: readonly string[];
};

function isStrings(value: unknown): value is readonly string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

export async function readMachinePaths(
	path: string,
): Promise<Result<MachinePaths, string>> {
	const file = Bun.file(path);
	if (!(await file.exists()))
		return err(
			`${path} does not exist. Write the config dir, the dotfiles dir and the profile dirs of the machine in it.`,
		);
	const value: unknown = await file.json();
	if (!isRecord(value)) return err(`${path} is not a JSON object`);
	const { config, dotfiles, profiles } = value;
	if (typeof config !== "string")
		return err(`${path}: config must be the path of the Claude config dir`);
	if (typeof dotfiles !== "string")
		return err(`${path}: dotfiles must be the path of the dotfiles dir`);
	if (!isStrings(profiles))
		return err(`${path}: profiles must be a list of profile dirs`);
	return ok({ config, dotfiles, profiles });
}

export const MARKETPLACE_DIR = "dist";

export function claudeCommand(
	inputs: Pick<GlobalInputs, "home" | "configDir">,
	args: readonly string[],
): { argv: string[]; env: Record<string, string> } {
	if (inputs.configDir === join(inputs.home, ".claude"))
		return {
			argv: ["env", "-u", "CLAUDE_CONFIG_DIR", "claude", ...args],
			env: {},
		};
	return {
		argv: ["claude", ...args],
		env: { CLAUDE_CONFIG_DIR: inputs.configDir },
	};
}

function marketplaceStep(inputs: GlobalInputs): CommandStep {
	const marketplaceDir = join(inputs.root, MARKETPLACE_DIR);
	const { argv, env } = claudeCommand(inputs, [
		"plugin",
		"marketplace",
		"add",
		marketplaceDir,
		"--scope",
		"user",
	]);
	const title = `Add the ${MARKETPLACE_NAME} marketplace at user scope`;
	const entry = isRecord(inputs.knownMarketplaces)
		? inputs.knownMarketplaces[MARKETPLACE_NAME]
		: undefined;
	if (entry === undefined) {
		return {
			kind: "command",
			title,
			argv,
			env,
			action: "run",
			reason: "not known yet",
		};
	}
	const source = isRecord(entry) ? entry.source : undefined;
	if (
		isRecord(source) &&
		source.source === "directory" &&
		source.path === marketplaceDir
	) {
		return {
			kind: "command",
			title,
			argv,
			env,
			action: "skip",
			reason: `already known with the same path ${marketplaceDir}`,
		};
	}
	return {
		kind: "command",
		title,
		argv,
		env,
		action: "refuse",
		reason: `already known with another source ${JSON.stringify(source)}. Remove it with \`claude plugin marketplace remove ${MARKETPLACE_NAME}\` if that source is wrong.`,
	};
}

function userInstallOf(installed: unknown, id: string): boolean {
	const plugins = isRecord(installed) ? installed.plugins : undefined;
	const installs = isRecord(plugins) ? plugins[id] : undefined;
	return (
		Array.isArray(installs) &&
		installs.some((install) => isRecord(install) && install.scope === "user")
	);
}

function installSteps(
	inputs: GlobalInputs,
	marketplace: CommandStep,
): CommandStep[] {
	return PLUGIN_IDS.map((id) => {
		const { argv, env } = claudeCommand(inputs, [
			"plugin",
			"install",
			id,
			"--scope",
			"user",
		]);
		const title = `Install ${id} at user scope`;
		if (marketplace.action === "refuse") {
			return {
				kind: "command",
				title,
				argv,
				env,
				action: "refuse",
				reason: "the marketplace step is refused",
			};
		}
		if (userInstallOf(inputs.installedPlugins, id)) {
			return {
				kind: "command",
				title,
				argv,
				env,
				action: "skip",
				reason: "already installed at user scope",
			};
		}
		return {
			kind: "command",
			title,
			argv,
			env,
			action: "run",
			reason: "not installed",
		};
	});
}

function linkStep(
	probe: LinkProbe,
	link: Pick<SymlinkStep, "title" | "source" | "target">,
): SymlinkStep {
	const current = probe(link.target);
	if (current.kind === "missing")
		return {
			kind: "symlink",
			...link,
			action: "create",
			reason: "no file there",
		};
	if (current.kind !== "symlink")
		return {
			kind: "symlink",
			...link,
			action: "refuse",
			reason: `${link.target} is a ${current.kind}, not a symlink; apply never overwrites it`,
		};
	if (current.target === link.source)
		return {
			kind: "symlink",
			...link,
			action: "skip",
			reason: "already linked",
		};
	return {
		kind: "symlink",
		...link,
		action: "replace",
		reason: `the symlink points at ${current.target}`,
	};
}

function symlinkSteps(inputs: GlobalInputs): SymlinkStep[] {
	const rulesDir = join(inputs.configDir, "rules");
	const astackRules = linkedRules.map((name): SymlinkStep => {
		const source = join(inputs.root, "rules", `${name}.md`);
		const target = join(rulesDir, ruleLinkName(name));
		const title = `Link rules/${name}.md as ${tildePath(target, inputs.home)}`;
		if (!inputs.ruleNames.includes(`${name}.md`)) {
			return {
				kind: "symlink",
				title,
				source,
				target,
				action: "refuse",
				reason: `rules/${name}.md does not exist; run \`bun run build\` first`,
			};
		}
		return linkStep(inputs.probe, { title, source, target });
	});
	const companionRules = (inputs.companionRules ?? []).map((source) => {
		const target = join(rulesDir, `companion-${basename(source)}`);
		return linkStep(inputs.probe, {
			title: `Link ${tildePath(source, inputs.home)} as ${tildePath(target, inputs.home)}`,
			source,
			target,
		});
	});
	return [...astackRules, ...companionRules];
}

function settingsStep(inputs: GlobalInputs): SettingsStep {
	const marketplaceRead = `Read(${tildePath(join(inputs.root, MARKETPLACE_DIR), inputs.home)}/**)`;
	const profileReads = (inputs.profileDirs ?? [])
		.map((dir) => tildePath(dir, inputs.home))
		.filter((dir) => dir !== "~/.claude")
		.map(pluginReadRule);
	const json: Json = {
		permissions: {
			allow: [
				...new Set([
					marketplaceRead,
					pluginReadRule("~/.claude"),
					...profileReads,
					...sharedAllowRules,
				]),
			],
		},
		enabledPlugins: Object.fromEntries(PLUGIN_IDS.map((id) => [id, true])),
	};
	const excludes = [...new Set(inputs.repoRulesDirs)].flatMap((dir) =>
		repoCopiedRules.map((name) => `**/${dir}/${name}.md`),
	);
	if (excludes.length > 0) json.claudeMdExcludes = excludes;
	const live = tildePath(
		join(inputs.home, ".claude", "settings.json"),
		inputs.home,
	);
	const instructions =
		inputs.dotfilesSettings === undefined
			? [
					`Merge the JSON above into ${live} by hand: add each array item that is missing.`,
				]
			: [
					`${live} is generated by ${tildePath(inputs.dotfilesSettings, inputs.home)}. Do not edit the live file.`,
					`Add the JSON above to ${tildePath(join(inputs.dotfilesSettings, "..", "settings.json"), inputs.home)}, enabledPlugins included, so a fresh machine installs the plugins from it. It holds no absolute path, so it can be tracked.`,
					`Run \`${tildePath(inputs.dotfilesSettings, inputs.home)} check\`, read the diff, then run \`${tildePath(inputs.dotfilesSettings, inputs.home)} apply\`.`,
					`The marketplace and install steps make Claude Code write extraKnownMarketplaces.${MARKETPLACE_NAME} and enabledPlugins into the live file. enabledPlugins belongs in the tracked settings.json above. Only extraKnownMarketplaces.${MARKETPLACE_NAME}, which holds the absolute path of ${MARKETPLACE_DIR}/, goes into ~/.claude/settings.private.json before the next \`settings.py capture\`, which warns on /Users/ paths.`,
				];
	if (excludes.length > 0) {
		instructions.push(
			"claudeMdExcludes stops a repo's copies of the linked rules from loading twice. It names each copied file, so the repo's own rules, such as its agent-skills.md, still load. It matters only once a repo carries the copies.",
		);
	}
	return {
		kind: "settings",
		title:
			"Allow reading plugin files by path, running astack and writing the pstack store",
		json,
		instructions,
	};
}

function duplicatesStep(inputs: GlobalInputs): ReportStep {
	return {
		kind: "report",
		title: "Flat user skills that the astack plugin supersedes",
		lines: duplicateReportLines({
			skills: inputs.duplicateSkills,
			shown: (path) => tildePath(path, inputs.home),
			flowBuilt: inputs.flowBuilt,
			...(inputs.skillsTxtPath === undefined
				? {}
				: { skillsTxtPath: tildePath(inputs.skillsTxtPath, inputs.home) }),
		}),
	};
}

export function planGlobal(inputs: GlobalInputs): GlobalStep[] {
	const marketplace = marketplaceStep(inputs);
	return [
		marketplace,
		...installSteps(inputs, marketplace),
		...symlinkSteps(inputs),
		settingsStep(inputs),
		duplicatesStep(inputs),
	];
}

export function pluginBuildRefusals(
	manifest: unknown,
	hasPluginJson: (plugin: string) => boolean,
): string[] {
	if (manifest === undefined) {
		return [`${MARKETPLACE_DIR}/.claude-plugin/marketplace.json is missing`];
	}
	const listed = new Set(
		(isRecord(manifest) && Array.isArray(manifest.plugins)
			? manifest.plugins
			: []
		).flatMap((plugin: unknown) =>
			isRecord(plugin) && typeof plugin.name === "string" ? [plugin.name] : [],
		),
	);
	return PLUGIN_IDS.flatMap((id) => {
		const plugin = id.split("@")[0] ?? id;
		return [
			...(listed.has(plugin)
				? []
				: [
						`${MARKETPLACE_DIR}/.claude-plugin/marketplace.json does not list ${plugin}`,
					]),
			...(hasPluginJson(plugin)
				? []
				: [
						`${MARKETPLACE_DIR}/claude-code/${plugin}/.claude-plugin/plugin.json is missing. Run \`bun run dist\` first`,
					]),
		];
	});
}

export function installedIn(installed: unknown): {
	present: string[];
	missing: string[];
} {
	const present = PLUGIN_IDS.filter((id) => userInstallOf(installed, id));
	return {
		present,
		missing: PLUGIN_IDS.filter((id) => !present.includes(id)),
	};
}
