import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isTrailer } from "../src/astack/commit-style.ts";
import { PLUGIN_IDS } from "../src/astack/marketplace.ts";
import { err, ok, type Result } from "../src/astack/result.ts";
import {
	COMPANION_ENV,
	type CompanionPaths,
	companionPaths,
	openCompanion,
	writable,
} from "./lib/companion.ts";
import {
	findDuplicateSkills,
	flowSupersedes,
	type UserSkillEntry,
} from "./lib/duplicate-skills.ts";
import { cleanEnv, run } from "./lib/exec.ts";
import {
	canonicalConfigDir,
	claudeCommand,
	type GlobalStep,
	installedIn,
	type LinkProbe,
	MARKETPLACE_DIR,
	planGlobal,
	pluginBuildRefusals,
	readMachinePaths,
	tildePath,
} from "./lib/global.ts";
import {
	codexState,
	describeMigration,
	LEAKED_PROJECTS,
	type MigrationPaths,
	type MigrationState,
	migrationPaths,
	migrationPending,
	migrationRefusal,
	NEW_LINKS,
	NEW_PLUGINS,
	OLD_LINKS,
	OLD_MARKETPLACE,
	settingsState,
} from "./lib/migration.ts";
import {
	dryRunProject,
	scratchDefault,
	worktreeProject,
} from "./lib/project-apply.ts";
import {
	expandHome,
	loadAllProjects,
	loadProject,
	ProjectConfigError,
	repoRoot,
} from "./lib/projects.ts";
import { readRuleSources } from "./lib/render.ts";
import { readTargetDeny } from "./lib/target-lint.ts";
import { worktreesDefault } from "./lib/worktree.ts";
import {
	FLOW_ORIGIN,
	isFlowItem,
	marketplacePlugins,
	originItems,
} from "./validate.ts";

type Args =
	| { mode: "global"; dryRun: boolean }
	| {
			mode: "project";
			name: string;
			dryRun: true;
			keep: boolean;
			marketplaceRepo?: string;
			scratch: string;
			companion?: string;
	  }
	| {
			mode: "worktree";
			name: string;
			keep: boolean;
			marketplaceRepo?: string;
			branch?: string;
			base?: string;
			worktrees: string;
			trailers: string[];
			update?: true;
			overlay?: string;
			companion?: string;
	  };

const usage = [
	"Usage:",
	"  bun scripts/apply.ts --global [--dry-run]",
	"  bun scripts/apply.ts --project <name> --dry-run [--companion <dir>] [--keep] [--marketplace-repo <owner/repo>] [--scratch <dir>]",
	"  bun scripts/apply.ts --project <name> --worktree [--companion <dir>] [--branch <name>] [--base <ref>] [--overlay <branch>] [--worktrees <dir>] [--trailer <line>]... [--keep] [--marketplace-repo <owner/repo>]",
	"  bun scripts/apply.ts --project <name> --worktree --update [--companion <dir>] [--overlay <branch>] [--branch <name>] [--worktrees <dir>] [--trailer <line>]... [--keep] [--marketplace-repo <owner/repo>]",
	"",
	`The project configs come from <dir>/projects of the companion. The companion is --companion <dir>, then ${COMPANION_ENV}, then examples/companion.`,
	"--worktree refuses the example companion.",
	"An overlay is a key of branches in projects/<name>.json, with the profile projects/<name>/branches/<branch>/pr-review-hardening.profile.md.",
	"It replaces gates, ciOnlyGates, ciParity and the hardening profile. The rest of the config stays.",
	"A --base that names the branch of an overlay, such as origin/v2 or v2, takes that overlay.",
	"--overlay names the overlay when the base does not name it. An update keeps the base of its branch, so give --overlay to an update.",
	"An update refuses a branch with a commit of origin/<branch> that the default branch of origin does not hold, unless --overlay names <branch>.",
].join("\n");

type Flags = {
	global: boolean;
	name?: string;
	dryRun: boolean;
	worktree: boolean;
	update: boolean;
	keep: boolean;
	marketplaceRepo?: string;
	scratch?: string;
	branch?: string;
	base?: string;
	overlay?: string;
	worktrees?: string;
	trailers: string[];
	companion?: string;
};

const valueFlags = [
	"--project",
	"--marketplace-repo",
	"--scratch",
	"--branch",
	"--base",
	"--overlay",
	"--worktrees",
	"--trailer",
	"--companion",
] as const;

type ValueFlag = (typeof valueFlags)[number];

function isValueFlag(arg: string): arg is ValueFlag {
	return valueFlags.some((flag) => flag === arg);
}

function withValue(flags: Flags, flag: ValueFlag, value: string): Flags {
	switch (flag) {
		case "--project":
			return { ...flags, name: value };
		case "--marketplace-repo":
			return { ...flags, marketplaceRepo: value };
		case "--scratch":
			return { ...flags, scratch: resolve(expandHome(value)) };
		case "--branch":
			return { ...flags, branch: value };
		case "--base":
			return { ...flags, base: value };
		case "--overlay":
			return { ...flags, overlay: value };
		case "--worktrees":
			return { ...flags, worktrees: resolve(expandHome(value)) };
		case "--trailer":
			return { ...flags, trailers: [...flags.trailers, value] };
		case "--companion":
			return { ...flags, companion: value };
	}
}

function readFlags(argv: readonly string[]): Flags | string {
	let flags: Flags = {
		global: false,
		dryRun: false,
		worktree: false,
		update: false,
		keep: false,
		trailers: [],
	};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index] ?? "";
		if (arg === "--global") flags = { ...flags, global: true };
		else if (arg === "--dry-run") flags = { ...flags, dryRun: true };
		else if (arg === "--worktree") flags = { ...flags, worktree: true };
		else if (arg === "--update") flags = { ...flags, update: true };
		else if (arg === "--keep") flags = { ...flags, keep: true };
		else if (isValueFlag(arg)) {
			index++;
			const value = argv[index];
			if (value === undefined || value.startsWith("--"))
				return `${arg} needs a value`;
			flags = withValue(flags, arg, value);
		} else return `Unknown argument: ${arg}`;
	}
	return flags;
}

function worktreeOnly(flags: Flags): string[] {
	return [
		...(flags.branch === undefined ? [] : ["--branch"]),
		...(flags.base === undefined ? [] : ["--base"]),
		...(flags.overlay === undefined ? [] : ["--overlay"]),
		...(flags.worktrees === undefined ? [] : ["--worktrees"]),
		...(flags.trailers.length === 0 ? [] : ["--trailer"]),
		...(flags.update ? ["--update"] : []),
	];
}

export function parseArgs(argv: readonly string[]): Args | string {
	const flags = readFlags(argv);
	if (typeof flags === "string") return flags;
	if (flags.global === (flags.name !== undefined)) {
		return "Pass exactly one of --global or --project <name>";
	}
	if (flags.global) {
		if (
			flags.keep ||
			flags.worktree ||
			flags.marketplaceRepo !== undefined ||
			flags.scratch !== undefined ||
			flags.companion !== undefined ||
			worktreeOnly(flags).length > 0
		) {
			return "--global takes only --dry-run";
		}
		return { mode: "global", dryRun: flags.dryRun };
	}
	const name = flags.name ?? "";
	if (flags.dryRun === flags.worktree) {
		return "Pass exactly one of --dry-run or --worktree with --project <name>";
	}
	const marketplaceRepo =
		flags.marketplaceRepo === undefined
			? {}
			: { marketplaceRepo: flags.marketplaceRepo };
	const companion =
		flags.companion === undefined ? {} : { companion: flags.companion };
	if (flags.dryRun) {
		const extra = worktreeOnly(flags);
		if (extra.length === 1 && flags.update)
			return "--update applies to --worktree only";
		if (extra.length > 0) return `${extra.join(", ")} apply to --worktree only`;
		return {
			mode: "project",
			name,
			dryRun: true,
			keep: flags.keep,
			scratch: flags.scratch ?? scratchDefault,
			...marketplaceRepo,
			...companion,
		};
	}
	if (flags.scratch !== undefined) return "--scratch applies to --dry-run only";
	if (flags.update && flags.base !== undefined)
		return "--base does not apply to --update, because the branch keeps its base";
	const badTrailer = flags.trailers.find((line) => !isTrailer(line));
	if (badTrailer !== undefined) {
		return `--trailer takes one "Key: value" line, not "${badTrailer}"`;
	}
	return {
		mode: "worktree",
		name,
		keep: flags.keep,
		worktrees: flags.worktrees ?? resolve(expandHome(worktreesDefault)),
		trailers: flags.trailers,
		...marketplaceRepo,
		...companion,
		...(flags.branch === undefined ? {} : { branch: flags.branch }),
		...(flags.base === undefined ? {} : { base: flags.base }),
		...(flags.update ? { update: true as const } : {}),
		...(flags.overlay === undefined ? {} : { overlay: flags.overlay }),
	};
}

async function readJson(path: string): Promise<unknown> {
	const file = Bun.file(path);
	if (!(await file.exists())) return undefined;
	try {
		return await file.json();
	} catch {
		return undefined;
	}
}

const linkProbe: LinkProbe = (path) => {
	try {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink())
			return { kind: "symlink", target: readlinkSync(path) };
		return { kind: stat.isDirectory() ? "directory" : "file" };
	} catch {
		return { kind: "missing" };
	}
};

async function builtPluginRefusals(): Promise<string[]> {
	return pluginBuildRefusals(
		await readJson(
			join(repoRoot, MARKETPLACE_DIR, ".claude-plugin/marketplace.json"),
		),
		(plugin) =>
			existsSync(
				join(
					repoRoot,
					MARKETPLACE_DIR,
					"claude-code",
					plugin,
					".claude-plugin/plugin.json",
				),
			),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function listNames(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

async function migrationState(
	paths: MigrationPaths,
	home: string,
	configDir: string,
): Promise<MigrationState> {
	const expand = (path: string) => expandHome(path, home);
	const plugins = join(configDir, "plugins");
	const known = await readJson(join(plugins, "known_marketplaces.json"));
	const installed = await readJson(join(plugins, "installed_plugins.json"));
	const installedIds = Object.keys(
		isRecord(installed) && isRecord(installed.plugins) ? installed.plugins : {},
	);
	const astack = isRecord(known) ? known.astack : undefined;
	const astackSource = isRecord(astack) ? astack.source : undefined;
	const newRules = join(expand(paths.newRoot), "rules");
	const rules = join(configDir, "rules");
	const codexConfig = readText(join(home, ".codex", "config.toml"));
	const codex = codexConfig === undefined ? undefined : codexState(codexConfig);
	return {
		oldMarketplace: isRecord(known) && OLD_MARKETPLACE in known,
		oldPlugins: installedIds.filter((id) => id.endsWith(`@${OLD_MARKETPLACE}`)),
		astackMarketplace:
			isRecord(astackSource) && typeof astackSource.path === "string"
				? astackSource.path
				: undefined,
		astackPlugins: NEW_PLUGINS.filter((id) => userInstalled(installed, id)),
		oldRoot: existsSync(expand(paths.oldRoot)),
		newRoot: existsSync(expand(paths.newRoot)),
		rootIsOld: repoRoot === expand(paths.oldRoot),
		savedCache: existsSync(
			join(expand(paths.saved), `${OLD_MARKETPLACE}-cache`),
		),
		oldCache: existsSync(join(plugins, "cache", OLD_MARKETPLACE)),
		oldLinks: OLD_LINKS.filter(
			(name) => linkProbe(join(rules, name)).kind !== "missing",
		),
		newLinks: NEW_LINKS.filter(([source, link]) => {
			const probed = linkProbe(join(rules, link));
			return (
				probed.kind === "symlink" &&
				resolve(rules, probed.target ?? "") === join(newRules, source)
			);
		}).length,
		tracked: settingsState(
			await readJson(join(expand(paths.dotfiles), "settings.json")),
		),
		live: settingsState(await readJson(join(configDir, "settings.json"))),
		strayConfig:
			configDir === join(home, ".claude") &&
			existsSync(join(configDir, ".claude.json")),
		leakedProjects: listNames(join(configDir, "projects")).filter((name) =>
			new Bun.Glob(LEAKED_PROJECTS).match(name),
		).length,
		codex: codex?.settings,
		codexAstack: codex?.astack ?? false,
		cursorAstack: existsSync(
			join(home, ".cursor/plugins/local/astack/.cursor-plugin/plugin.json"),
		),
	};
}

function userInstalled(installed: unknown, id: string): boolean {
	return installedIn(installed).present.includes(id);
}

function realDir(path: string): string | undefined {
	try {
		const real = realpathSync(path);
		return lstatSync(real).isDirectory() ? real : undefined;
	} catch {
		return undefined;
	}
}

function userSkillEntries(dirs: readonly string[]): UserSkillEntry[] {
	const unique = [...new Set(dirs.flatMap((dir) => realDir(dir) ?? []))].sort();
	return unique.flatMap((dir) =>
		Object.keys(flowSupersedes).flatMap((name): UserSkillEntry[] => {
			const path = join(dir, name);
			const probed = linkProbe(path);
			if (probed.kind === "missing") return [];
			if (probed.kind === "symlink") {
				return [
					{
						name,
						path,
						kind: "symlink",
						target: resolve(dirname(path), probed.target ?? ""),
					},
				];
			}
			return [{ name, path, kind: probed.kind }];
		}),
	);
}

export function builtFlowSkills(
	marketplace: string,
): Result<readonly string[], string> {
	const plugins = marketplacePlugins(marketplace);
	if (!plugins.ok) return plugins;
	const { items, errors } = originItems(plugins.value);
	if (errors.length > 0) return err(errors.join("\n"));
	const names = items
		.filter((item) => item.kind === "skill" && isFlowItem(item))
		.map((item) => item.name);
	return names.length > 0
		? ok(names)
		: err(`no skill in ${marketplace} has the origin ${FLOW_ORIGIN}`);
}

function describeStep(step: GlobalStep, home: string): string[] {
	if (step.kind === "command") {
		const env = Object.entries(step.env)
			.map(([key, value]) => `${key}=${tildePath(value, home)} `)
			.join("");
		return [
			`[${step.action}] ${step.title}`,
			`    $ ${env}${step.argv.join(" ")}`,
			`    ${step.reason}`,
		];
	}
	if (step.kind === "symlink") {
		return [
			`[${step.action}] ${step.title}`,
			`    $ ln -s${step.action === "replace" ? "f" : ""} ${step.source} ${step.target}`,
			`    ${step.reason}`,
		];
	}
	if (step.kind === "report") {
		return [
			`[report] ${step.title}`,
			...step.lines.map((line) => (line === "" ? "" : `    ${line}`)),
		];
	}
	return [
		`[print] ${step.title}`,
		"    Add this to your user settings:",
		...JSON.stringify(step.json, null, 2)
			.split("\n")
			.map((line) => `    ${line}`),
		...step.instructions.map((line) => `    - ${line}`),
	];
}

async function verifyProfiles(
	dryRun: boolean,
	profileDirs: readonly string[],
): Promise<string[]> {
	const lines: string[] = [];
	const home = homedir();
	for (const dir of profileDirs) {
		const path = expandHome(dir);
		const list = claudeCommand({ home, configDir: path }, ["plugin", "list"]);
		const command = [
			...Object.entries(list.env).map(([key]) => `${key}=${dir}`),
			...list.argv,
		].join(" ");
		if (!existsSync(path)) {
			lines.push(`- ${dir}: missing`);
			continue;
		}
		const plugins = linkProbe(join(path, "plugins"));
		const shared =
			plugins.kind === "symlink"
				? `plugins -> ${plugins.target}`
				: `plugins is a ${plugins.kind}`;
		if (dryRun) {
			const installed = installedIn(
				await readJson(join(path, "plugins/installed_plugins.json")),
			);
			lines.push(
				`- ${dir} (${shared}): installed ${installed.present.join(", ") || "none"}; missing ${installed.missing.join(", ") || "none"}. The real run checks with: ${command}`,
			);
			continue;
		}
		const result = await run(list.argv, {
			cwd: repoRoot,
			timeoutSeconds: 120,
			env: cleanEnv(list.env),
		});
		const missing = PLUGIN_IDS.filter((id) => !result.stdout.includes(id));
		lines.push(
			`- ${dir} (${shared}): ${command} exited ${result.exitCode}; missing ${missing.join(", ") || "none"}`,
		);
	}
	return lines;
}

async function execute(steps: readonly GlobalStep[]): Promise<boolean> {
	for (const step of steps) {
		if (step.kind === "command" && step.action === "run") {
			console.log(`$ ${step.argv.join(" ")}`);
			const child = Bun.spawn(step.argv, {
				cwd: repoRoot,
				env: { ...process.env, ...step.env },
				stdio: ["inherit", "inherit", "inherit"],
			});
			if ((await child.exited) !== 0) {
				console.error(`Failed: ${step.title}`);
				return false;
			}
		}
		if (
			step.kind === "symlink" &&
			(step.action === "create" || step.action === "replace")
		) {
			mkdirSync(dirname(step.target), { recursive: true });
			if (step.action === "replace") unlinkSync(step.target);
			symlinkSync(step.source, step.target);
			console.log(`Linked ${step.target} -> ${step.source}`);
		}
	}
	return true;
}

export function companionRuleFiles(rulesDir: string): string[] {
	if (!existsSync(rulesDir)) return [];
	return readdirSync(rulesDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(rulesDir, entry.name))
		.sort();
}

async function applyGlobal(
	dryRun: boolean,
	companion: CompanionPaths,
): Promise<number> {
	const machine = await readMachinePaths(companion.machine);
	if (!machine.ok) {
		console.error(machine.error);
		return 2;
	}
	const paths = migrationPaths(machine.value);
	const profileDirs = [paths.config, ...paths.profiles];
	const home = homedir();
	const profileDir = resolve(
		expandHome(process.env.CLAUDE_CONFIG_DIR ?? "~/.claude"),
	);
	const configDir = canonicalConfigDir(profileDir);
	const projects = await loadAllProjects(companion.projects);
	const dotfiles = expandHome(paths.dotfiles);
	const dotfilesSettings = join(dotfiles, "settings.py");
	const skillsTxtPath = join(dotfiles, "skills.txt");
	const skillsTxtFile = Bun.file(skillsTxtPath);
	const skillsTxt = (await skillsTxtFile.exists())
		? await skillsTxtFile.text()
		: undefined;
	const flowSkills = builtFlowSkills(join(repoRoot, "marketplace"));
	if (!flowSkills.ok) {
		console.error(flowSkills.error);
		return 1;
	}
	const duplicateSkills = findDuplicateSkills({
		entries: userSkillEntries([
			join(home, ".claude/skills"),
			join(configDir, "skills"),
			...profileDirs.map((dir) => join(expandHome(dir), "skills")),
		]),
		lock: await readJson(join(home, ".agents/.skill-lock.json")),
		...(skillsTxt === undefined ? {} : { skillsTxt }),
		flowSkills: flowSkills.value,
	});
	const migration = await migrationState(paths, home, configDir);
	const pending = migrationPending(migration);
	const planRoot = migration.rootIsOld
		? expandHome(paths.newRoot, home)
		: repoRoot;
	const steps = planGlobal({
		root: planRoot,
		home,
		configDir,
		knownMarketplaces: await readJson(
			join(configDir, "plugins/known_marketplaces.json"),
		),
		installedPlugins: await readJson(
			join(configDir, "plugins/installed_plugins.json"),
		),
		probe: linkProbe,
		ruleNames: readRuleSources().map((source) => source.name),
		repoRulesDirs: projects
			.filter((project) => project.mode === "write" && project.artifacts.rules)
			.map((project) => project.rulesDir),
		duplicateSkills,
		flowBuilt: true,
		profileDirs: profileDirs.map((dir) => expandHome(dir)),
		companionRules: companionRuleFiles(companion.rules),
		...(skillsTxt === undefined ? {} : { skillsTxtPath }),
		...(existsSync(dotfilesSettings) ? { dotfilesSettings } : {}),
	});
	const buildRefusals = await builtPluginRefusals();
	console.log(`# apply --global${dryRun ? " --dry-run" : ""}`);
	console.log();
	console.log(`astack: ${repoRoot}`);
	console.log(
		`Claude config dir: ${tildePath(configDir, home)}${configDir === profileDir ? "" : ` (the plugins dir of ${tildePath(profileDir, home)} links here, so installs record this path)`}`,
	);
	console.log();
	console.log("## Migration from agent-stack");
	console.log();
	console.log(
		pending
			? "The agent-stack install is still active. Do these steps in order. docs/migration.md holds the same steps."
			: "No agent-stack install is active. docs/migration.md holds these steps.",
	);
	console.log();
	for (const line of describeMigration(paths, migration)) console.log(line);
	console.log();
	console.log("## Plan");
	console.log();
	if (migration.rootIsOld)
		console.log(
			`This plan is for ${paths.newRoot}, the path after the rename of the migration.`,
		);
	if (migration.rootIsOld) console.log();
	steps.forEach((step, index) => {
		const [first, ...rest] = describeStep(step, home);
		console.log(`${index + 1}. ${first}`);
		for (const line of rest) console.log(line);
	});
	console.log();
	if (buildRefusals.length > 0) {
		console.log("## Not ready");
		console.log();
		for (const refusal of buildRefusals) console.log(`- ${refusal}`);
		console.log();
	}
	const refused =
		buildRefusals.length > 0 ||
		steps.some(
			(step) =>
				(step.kind === "command" || step.kind === "symlink") &&
				step.action === "refuse",
		);
	if (dryRun) {
		console.log("## Verify (read-only in a dry run)");
		console.log();
		for (const line of await verifyProfiles(true, profileDirs))
			console.log(line);
		console.log();
		console.log(
			refused
				? "Dry run: some steps are refused or not ready. Nothing was changed."
				: "Dry run: nothing was changed.",
		);
		return refused ? 1 : 0;
	}
	const migrationRefused = migrationRefusal(migration);
	if (migrationRefused !== undefined) {
		console.error(migrationRefused);
		return 1;
	}
	if (refused) {
		console.error(
			"Refused: fix the refused or not-ready steps above, then rerun.",
		);
		return 1;
	}
	if (!(await execute(steps))) return 1;
	console.log();
	console.log("## Verify");
	console.log();
	for (const line of await verifyProfiles(false, profileDirs))
		console.log(line);
	return 0;
}

async function main(argv: readonly string[]): Promise<number> {
	const args = parseArgs(argv);
	if (typeof args === "string") {
		console.error(`${args}\n${usage}`);
		return 2;
	}
	const opened = openCompanion(
		args.mode === "global" ? undefined : args.companion,
		process.env,
	);
	if (!opened.ok) {
		console.error(opened.error);
		return 2;
	}
	const paths = companionPaths(opened.value);
	if (args.mode === "global") {
		const target = args.dryRun ? opened : writable(opened.value);
		if (!target.ok) {
			console.error(target.error);
			return 1;
		}
		return applyGlobal(args.dryRun, paths);
	}
	const companion = args.mode === "worktree" ? writable(opened.value) : opened;
	if (!companion.ok) {
		console.error(companion.error);
		return 1;
	}
	const deny = await readTargetDeny(
		companion.value,
		await loadAllProjects(paths.projects),
	);
	if (!deny.ok) {
		console.error(deny.error);
		return 1;
	}
	const project = await loadProject(args.name, paths.projects);
	const run = {
		profileDir: join(paths.projects, project.name),
		deny: deny.value,
		keep: args.keep,
		log: (line = "") => console.log(line),
		...(args.marketplaceRepo === undefined
			? {}
			: { marketplaceRepo: args.marketplaceRepo }),
	};
	if (args.mode === "worktree") {
		return worktreeProject(project, {
			...run,
			astackRoot: repoRoot,
			companionRoot: companion.value.root,
			worktrees: args.worktrees,
			trailers: args.trailers,
			today: new Date().toISOString().slice(0, 10),
			...(args.branch === undefined ? {} : { branch: args.branch }),
			...(args.base === undefined ? {} : { base: args.base }),
			...(args.update === undefined ? {} : { update: args.update }),
			...(args.overlay === undefined ? {} : { overlay: args.overlay }),
		});
	}
	return dryRunProject(project, { ...run, scratch: args.scratch });
}

if (import.meta.main) {
	try {
		process.exitCode = await main(Bun.argv.slice(2));
	} catch (error) {
		if (!(error instanceof ProjectConfigError)) throw error;
		console.error(error.message);
		process.exitCode = 2;
	}
}
