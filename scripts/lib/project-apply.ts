import {
	constants,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { cp } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import {
	ASTACK_WORDS,
	commitParagraphs,
	commitSubject,
	detectCommitStyle,
	NEUTRAL_WORDS,
	subjectWithRemoval,
	updateSubject,
} from "../../src/astack/commit-style.ts";
import { SETUP_BRANCH } from "../../src/astack/init.ts";
import { managedList, RETIRED_PATHS } from "../../src/astack/managed.ts";
import {
	type ProfileGate,
	parseProfile,
	profileGates,
} from "../../src/astack/pr-review-profile.ts";
import { readProfileJson } from "../../src/astack/profile.ts";
import { findPrTemplate } from "../../src/astack/repo-facts.ts";
import { loadSettings } from "../../src/astack/ste/profile.ts";
import {
	checkCiParity,
	formatParity,
	parityFailures,
	readWorkflows,
} from "./ci-parity.ts";
import {
	envApps,
	envFileGaps,
	exampleTarget,
	namedEnvPaths,
} from "./env-files.ts";
import { cleanEnv, git, messageOf, run } from "./exec.ts";
import {
	domainPaths,
	domainProblems,
	labelSetup,
	renderAgentSkillsBlock,
} from "./flow-config.ts";
import {
	compareGateRuns,
	type GateRun,
	type GateVerdict,
	runGate,
} from "./gates.ts";
import {
	CITATION_GREP,
	conflictHookVerdict,
	type HookVerdict,
	unkeptCitations,
} from "./keep-forms.ts";
import { lineCitationGrep, managedLineCitations } from "./line-citations.ts";
import { formatFinding, scanSubstrings } from "./neutrality.ts";
import { rewriteGaps, untrackedRewrites, writerPackage } from "./next-env.ts";
import { platformToolGaps } from "./platform-tools.ts";
import {
	type CommentConflict,
	type CommentDecision,
	expandHome,
	overlaid,
	type ProjectConfig,
	projectPath,
	reviewProfileLabel,
} from "./projects.ts";
import { planRemovals, type Removal, strayCopies } from "./removals.ts";
import {
	type Artifact,
	type ArtifactKind,
	type Rendered,
	readRuleSources,
	renderRepoArtifacts,
	renderWouldBeArtifacts,
} from "./render.ts";
import {
	formatSettings,
	isGithubRepo,
	mergeMarketplaceWiring,
	parseSettings,
	pendingWiring,
} from "./settings.ts";
import { lintTarget, type TargetDeny } from "./target-lint.ts";
import {
	packageScripts,
	scriptFixerGaps,
	taskCacheGaps,
	uncachedTasks,
} from "./task-cache.ts";
import {
	branchRefusal,
	branchWarning,
	commitParts,
	documentedShapes,
	expandBranchTemplate,
	findBranchChecks,
	gatesNeedDeps,
	isInside,
	type MainState,
	mainStateChanges,
	nextSteps,
	remoteBranchName,
	statusHash,
	steRefusals,
	type TextFile,
	worktreePath,
} from "./worktree.ts";
import { fsProbe, writeRefusal } from "./write-paths.ts";

type Log = (line?: string) => void;

type RunFlag = "--dry-run" | "--worktree" | "--worktree --update";

export type ProjectRunOptions = {
	scratch: string;
	keep: boolean;
	marketplaceRepo?: string;
	profileDir: string;
	deny: TargetDeny;
	log: Log;
};

export type WorktreeOptions = {
	astackRoot: string;
	companionRoot: string;
	worktrees: string;
	branch?: string;
	base?: string;
	update?: true;
	overlay?: string;
	trailers: readonly string[];
	keep: boolean;
	marketplaceRepo?: string;
	profileDir: string;
	deny: TargetDeny;
	today: string;
	log: Log;
};

type LiveState = {
	head: string;
	branch: string;
	changedPaths: number;
	agentsSkills: string;
	claudeMd: string;
};

async function realRepoGit(repo: string, args: readonly string[]) {
	return run(["git", "--no-optional-locks", "-C", repo, ...args], {
		cwd: repo,
		timeoutSeconds: 120,
		env: cleanEnv({ GIT_OPTIONAL_LOCKS: "0" }),
	});
}

function copyGit(copy: string, args: readonly string[]) {
	return git(copy, ["-c", "core.fsmonitor=false", ...args]);
}

function kindOf(path: string): string {
	try {
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) return "symlink";
		if (stat.isDirectory()) return "directory";
		if (stat.isFile()) return "file";
		return "other";
	} catch {
		return "missing";
	}
}

async function readLiveState(repo: string): Promise<LiveState> {
	const head = await realRepoGit(repo, ["rev-parse", "HEAD"]);
	if (head.exitCode !== 0) {
		throw new Error(`${repo} is not a git checkout: ${head.stderr.trim()}`);
	}
	const branch = await realRepoGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const status = await realRepoGit(repo, ["status", "--porcelain=v1"]);
	return {
		head: head.stdout.trim(),
		branch: branch.stdout.trim(),
		changedPaths: status.stdout.split("\n").filter((line) => line !== "")
			.length,
		agentsSkills: kindOf(join(repo, ".agents/skills")),
		claudeMd: kindOf(join(repo, "CLAUDE.md")),
	};
}

export type ConflictCheck = CommentConflict & {
	found: "at-line" | "moved" | "missing";
	foundLine?: number;
};

export function locateConflict(
	conflict: CommentConflict,
	text: string | undefined,
): ConflictCheck {
	if (text === undefined) return { ...conflict, found: "missing" };
	const lines = text.split("\n");
	if (lines[conflict.line - 1]?.includes(conflict.match)) {
		return { ...conflict, found: "at-line", foundLine: conflict.line };
	}
	const index = lines.findIndex((line) => line.includes(conflict.match));
	return index === -1
		? { ...conflict, found: "missing" }
		: { ...conflict, found: "moved", foundLine: index + 1 };
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

const HOOK_VERDICT_TEXT: Record<HookVerdict, string> = {
	deny: "deny. The astack hook blocks the mandated form at the first edit.",
	advisory:
		"advisory. The astack hook adds a note, and Sicko judges it at PR time.",
	allowed: "allowed. A keep pattern or keep clause covers it.",
};

function printConflicts(project: ProjectConfig, repo: string, log: Log): void {
	log("## Comment-rule conflicts with Comment Sicko");
	log();
	if (project.commentConflicts.length === 0) {
		log("None recorded.");
		log();
		return;
	}
	log(
		"Each repo rule below mandates a comment that no Sicko keep clause covers. Decide per row: change the repo rule, or add a keep pattern to projects/<name>.json.",
	);
	log();
	for (const conflict of project.commentConflicts) {
		const check = locateConflict(conflict, readText(join(repo, conflict.file)));
		const where =
			check.found === "at-line"
				? `${conflict.file}:${conflict.line}`
				: check.found === "moved"
					? `${conflict.file}:${check.foundLine} (recorded at line ${conflict.line})`
					: `${conflict.file}:${conflict.line} (STALE: "${conflict.match}" not found)`;
		log(`- ${conflict.form} at ${where}`);
		log(`  Requires: ${conflict.requires}`);
		log(`  Conflict: ${conflict.conflict}`);
		const verdict = conflictHookVerdict(conflict, project.keepPatterns);
		if (verdict)
			log(`  Hook on \`${conflict.sample}\`: ${HOOK_VERDICT_TEXT[verdict]}`);
	}
	log();
}

export type DecisionCheck = {
	readonly decision: CommentDecision;
	readonly problem: string | undefined;
};

export function checkDecision(
	decision: CommentDecision,
	keepPatterns: readonly string[],
	readFile: (path: string) => string | undefined,
): DecisionCheck {
	if (decision.decision === "keep") {
		const verdict = conflictHookVerdict(decision, keepPatterns);
		return {
			decision,
			problem:
				verdict === "allowed"
					? undefined
					: `the hook still gives ${verdict ?? "no verdict"} for \`${decision.sample ?? ""}\`, so a keep pattern is missing`,
		};
	}
	if (decision.file === undefined || decision.match === undefined)
		return { decision, problem: undefined };
	const found = locateConflict(
		{
			form: decision.form,
			file: decision.file,
			line: decision.line ?? 1,
			match: decision.match,
			requires: "",
			conflict: "",
		},
		readFile(decision.file),
	);
	return {
		decision,
		problem:
			found.found === "missing"
				? undefined
				: `${decision.file}:${found.foundLine ?? decision.line} still requires "${decision.match}"`,
	};
}

function printDecisions(
	project: ProjectConfig,
	readFile: (path: string) => string | undefined,
	log: Log,
): string[] {
	log("## Decided comment forms");
	log();
	const decisions = project.commentDecisions ?? [];
	if (decisions.length === 0) log("None recorded.");
	const problems: string[] = [];
	for (const decision of decisions) {
		const check = checkDecision(decision, project.keepPatterns, readFile);
		const where =
			decision.file === undefined ? "" : ` (${decision.file}:${decision.line})`;
		log(
			`- ${decision.decision}: ${decision.form}${where}. ${check.problem === undefined ? "OK" : `PROBLEM: ${check.problem}`}.`,
		);
		log(`  ${decision.reason}`);
		if (check.problem !== undefined)
			problems.push(`${decision.form}: ${check.problem}`);
	}
	log();
	return problems;
}

async function existingLabels(
	project: ProjectConfig,
	repo: string,
): Promise<string[] | undefined> {
	if (project.tracker.kind !== "github") return undefined;
	const result = await run(
		[
			"gh",
			"label",
			"list",
			"--limit",
			"1000",
			"--json",
			"name",
			"--jq",
			".[].name",
		],
		{
			cwd: repo,
			timeoutSeconds: 60,
			env: cleanEnv({ GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" }),
		},
	);
	if (result.exitCode !== 0) return undefined;
	return result.stdout.split("\n").filter(Boolean);
}

function instructionFileFor(root: string): string {
	return (
		["AGENTS.md", "CLAUDE.md"].find(
			(file) => kindOf(join(root, file)) === "file",
		) ?? "AGENTS.md"
	);
}

async function printFlowConfig(
	project: ProjectConfig,
	root: string,
	repo: string,
	log: Log,
): Promise<string[]> {
	log("## Flow config");
	log();
	const problems = domainProblems(project.domain, (path) =>
		kindOf(join(root, path)),
	);
	if (problems.length === 0) {
		log(
			`Domain docs found: ${domainPaths(project.domain)
				.map(({ path }) => path)
				.join(", ")}.`,
		);
	}
	for (const problem of problems) log(`Problem: ${problem}`);
	const tracker = project.tracker;
	if (tracker.kind === "none") {
		const ignored = await realRepoGit(root, [
			"check-ignore",
			"--no-index",
			"-q",
			"--",
			`${tracker.dir}/ticket.md`,
		]);
		log(
			ignored.exitCode === 0
				? `Warning: ${tracker.dir}/ is gitignored, so local tickets stay out of commits and out of worktrees.`
				: `${tracker.dir}/ is not gitignored, so local tickets are committed with their branch.`,
		);
	}
	log();
	log("Labels the astack skills use:");
	for (const line of labelSetup(tracker, await existingLabels(project, repo))) {
		log(line);
	}
	log();
	const target = instructionFileFor(root);
	const hasBlock =
		readText(join(root, target))?.includes("## Agent skills") ?? false;
	log(
		`Proposed edit apply does not make: harnesses that do not read .claude/rules find the same pointers only in ${target}. ${hasBlock ? "Replace the contents of its existing Agent skills section with this block:" : "Add this block to it:"}`,
	);
	log();
	log(renderAgentSkillsBlock(project).trimEnd());
	log();
	return problems;
}

function printCiOnly(
	project: ProjectConfig,
	where: "copy" | "worktree" | "report",
	log: Log,
): void {
	log(
		where === "worktree"
			? "## CI-only gates this run did not run"
			: "## CI-only gates this dry run did not run",
	);
	log();
	if (project.ciOnlyGates.length === 0) {
		log("None recorded.");
	}
	for (const gate of project.ciOnlyGates) {
		log(`- ${gate.name} (${gate.source}): ${gate.reason}`);
	}
	log();
}

function printCiParity(
	project: ProjectConfig,
	tree: string,
	artifacts: readonly Artifact[],
	log: Log,
): string[] {
	log("## CI parity of the hardening profile");
	log();
	const profile = artifacts.find(
		(artifact) => artifact.kind === "review-profile",
	);
	if (profile === undefined) {
		log("No hardening profile, so there are no gates to compare with CI.");
		log();
		return [];
	}
	const read = readWorkflows(readTextFiles(tree, workflowPaths(tree)), (path) =>
		readText(join(tree, path)),
	);
	const report = checkCiParity({
		workflows: read.workflows,
		readProblems: read.problems,
		gates: profileGates(parseProfile(profile.content).data),
		config: project.ciParity ?? { setup: [], map: [], exclude: [] },
	});
	for (const line of formatParity(report)) log(line);
	log();
	return parityFailures(report);
}

function reviewGates(
	artifacts: readonly Artifact[],
): ProfileGate[] | undefined {
	const profile = artifacts.find(
		(artifact) => artifact.kind === "review-profile",
	);
	return profile === undefined
		? undefined
		: profileGates(parseProfile(profile.content).data);
}

async function trackedPaths(
	tree: string,
	pathspecs: readonly string[],
): Promise<string[]> {
	const listed = await realRepoGit(tree, [
		"ls-files",
		"-z",
		"--",
		...pathspecs,
	]);
	return listed.stdout.split("\0").filter(Boolean);
}

async function printEnvFiles(
	tree: string,
	artifacts: readonly Artifact[],
	log: Log,
): Promise<string[]> {
	const gates = reviewGates(artifacts);
	if (gates === undefined) return [];
	const apps = envApps(
		await trackedPaths(tree, [":(glob)**/.env*"]),
		(dir) =>
			packageScripts(dir, readText(join(tree, dir, "package.json")))?.name,
	);
	const candidates = [
		...new Set([
			...apps.flatMap((app) =>
				app.examples.flatMap((path) => exampleTarget(path) ?? []),
			),
			...gates.flatMap((gate) => gate.checks.flatMap(namedEnvPaths)),
		]),
	];
	const ignored =
		candidates.length === 0
			? ""
			: (
					await realRepoGit(tree, [
						"check-ignore",
						"--no-index",
						"--",
						...candidates,
					])
				).stdout;
	const packages = (await trackedPaths(tree, [":(glob)**/package.json"]))
		.filter((path) => !path.includes("node_modules/"))
		.flatMap((path) => {
			const entry = packageScripts(dirname(path), readText(join(tree, path)));
			return entry === undefined ? [] : [entry];
		});
	const problems = envFileGaps(
		apps,
		gates,
		new Set(ignored.split("\n").filter(Boolean)),
		{ packages, read: (path) => readText(join(tree, path)) },
	);
	log("## Env files that a gate reads");
	log();
	for (const app of apps)
		log(`- ${app.dir} holds ${app.examples.join(", ")}, which git tracks.`);
	for (const problem of problems) log(`- PROBLEM ${problem}`);
	if (apps.length === 0) log("None.");
	log();
	return problems;
}

async function printTaskCache(
	tree: string,
	artifacts: readonly Artifact[],
	log: Log,
): Promise<string[]> {
	const gates = reviewGates(artifacts);
	if (gates === undefined) return [];
	const packages = (await trackedPaths(tree, [":(glob)**/package.json"]))
		.filter((path) => !path.includes("node_modules/"))
		.flatMap((path) => {
			const entry = packageScripts(dirname(path), readText(join(tree, path)));
			return entry === undefined ? [] : [entry];
		});
	const problems = taskCacheGaps(
		{
			packages,
			uncached: uncachedTasks(
				readText(join(tree, "turbo.json")) ??
					readText(join(tree, "turbo.jsonc")),
			),
		},
		gates,
	);
	log("## Task caches that a gate can replay");
	log();
	for (const problem of problems) log(`- PROBLEM ${problem}`);
	if (problems.length === 0) log("None.");
	log();
	return problems;
}

async function printPlatformTools(
	tree: string,
	artifacts: readonly Artifact[],
	log: Log,
): Promise<string[]> {
	const gates = reviewGates(artifacts);
	if (gates === undefined) return [];
	const packages = (await trackedPaths(tree, [":(glob)**/package.json"]))
		.filter((path) => !path.includes("node_modules/"))
		.flatMap((path) => {
			const entry = packageScripts(dirname(path), readText(join(tree, path)));
			return entry === undefined ? [] : [entry];
		});
	const problems = platformToolGaps(
		{ packages, read: (path) => readText(join(tree, path)) },
		gates,
	);
	log("## Tools that only one platform ships");
	log();
	for (const problem of problems) log(`- PROBLEM ${problem}`);
	if (problems.length === 0) log("None.");
	log();
	return problems;
}

async function printCitations(
	project: ProjectConfig,
	tree: string,
	log: Log,
): Promise<string[]> {
	const grep = await realRepoGit(tree, [
		"grep",
		"-l",
		"-z",
		"-I",
		"-E",
		CITATION_GREP,
	]);
	const files = grep.stdout
		.split("\0")
		.filter(Boolean)
		.flatMap((path) => {
			const text = readText(join(tree, path));
			return text === undefined ? [] : [{ path, text }];
		});
	const problems = unkeptCitations(files, project.keepPatterns);
	log("## Decision citations in the repo");
	log();
	log(
		`Checked the comments that cite a decision in ${files.length} tracked file(s) with the keep patterns of the repo.`,
	);
	for (const problem of problems) log(`- PROBLEM ${problem}`);
	log();
	return problems;
}

async function printLineCitations(
	tree: string,
	artifacts: readonly Artifact[],
	log: Log,
): Promise<string[]> {
	const managed = artifacts.map((artifact) => artifact.path);
	const grep = await realRepoGit(tree, [
		"grep",
		"-l",
		"-z",
		"-I",
		"-E",
		lineCitationGrep(managed),
		"--",
		"*.md",
	]);
	const files = grep.stdout
		.split("\0")
		.filter(Boolean)
		.flatMap((path) => {
			const text = readText(join(tree, path));
			return text === undefined ? [] : [{ path, text }];
		});
	const problems = managedLineCitations(files, managed);
	log("## Line citations of the files that apply writes");
	log();
	for (const problem of problems) log(`- PROBLEM ${problem}`);
	if (problems.length === 0) log("None.");
	log();
	return problems;
}

async function printRewrites(
	tree: string,
	artifacts: readonly Artifact[],
	log: Log,
): Promise<string[]> {
	const gates = reviewGates(artifacts);
	if (gates === undefined) return [];
	const tracked = new Set(await trackedPaths(tree, []));
	const packages = [...tracked]
		.filter((path) => basename(path) === "package.json")
		.flatMap((path) => {
			const found = writerPackage(path, readText(join(tree, path)));
			return found === undefined ? [] : [found];
		});
	const scripts = [...tracked]
		.filter(
			(path) =>
				basename(path) === "package.json" && !path.includes("node_modules/"),
		)
		.flatMap((path) => {
			const entry = packageScripts(dirname(path), readText(join(tree, path)));
			return entry === undefined ? [] : [entry];
		});
	const problems = [
		...rewriteGaps(packages, gates, tracked),
		...untrackedRewrites(gates, tracked),
		...scriptFixerGaps(scripts, gates),
	];
	log("## Tracked files that a gate writes");
	log();
	for (const gate of gates)
		for (const path of gate.rewrites)
			log(
				`- ${gate.name} rewrites ${path}, and the run restores it after the gate.`,
			);
	for (const problem of problems) log(`- PROBLEM ${problem}`);
	if (
		problems.length === 0 &&
		gates.every((gate) => gate.rewrites.length === 0)
	)
		log("None.");
	log();
	return problems;
}

function printLive(
	project: ProjectConfig,
	repo: string,
	live: LiveState,
	log: Log,
	flag: RunFlag,
): void {
	log(`# apply --project ${project.name} ${flag}`);
	log();
	log(`Repo: ${repo}`);
	log(`Mode: ${project.mode}`);
	log(`HEAD: ${live.head} on ${live.branch}`);
	log(`Changed or untracked paths in the working tree: ${live.changedPaths}`);
	log(`.agents/skills: ${live.agentsSkills}`);
	log(`CLAUDE.md: ${live.claudeMd}`);
	log();
}

async function reportOnly(
	project: ProjectConfig,
	repo: string,
	live: LiveState,
	log: Log,
	flag: RunFlag,
	profileDir: string,
	deny: TargetDeny,
): Promise<number> {
	printLive(project, repo, live, log, flag);
	log(
		"This project is report-only. Nothing is rendered into a copy or written.",
	);
	log();
	const agentsUntracked = await realRepoGit(repo, [
		"ls-files",
		"--others",
		"--exclude-standard",
		"--",
		".agents",
	]);
	const agentsTracked = await realRepoGit(repo, ["ls-files", "--", ".agents"]);
	log("## Live findings");
	log();
	const untracked = agentsUntracked.stdout.split("\n").filter(Boolean);
	const tracked = agentsTracked.stdout.split("\n").filter(Boolean);
	if (untracked.length > 0) {
		log(
			`- .agents holds ${untracked.length} untracked file(s) that git does not ignore. A \`git add -A\` would commit them.`,
		);
	}
	if (tracked.length > 0) {
		log(`- .agents holds ${tracked.length} tracked file(s).`);
	}
	if (live.claudeMd === "symlink") {
		log(
			"- CLAUDE.md is a symlink. Any instruction-file change lands in its target.",
		);
	}
	if (
		untracked.length === 0 &&
		tracked.length === 0 &&
		live.claudeMd !== "symlink"
	) {
		log("- None.");
	}
	log();
	log("## What an amending ADR has to settle before apply may write here");
	log();
	for (const need of project.adrNeeded) {
		log(`- ${need.rule} (${need.source}): ${need.need}`);
	}
	log();
	const { artifacts: wouldBe, problems } = renderWouldBeArtifacts(
		project,
		readRuleSources(),
		profileDir,
	);
	const lint = await lintTarget(project, wouldBe, deny);
	log("## The repo's own checks against the content apply would write");
	log();
	log(
		`Linted ${wouldBe.length} would-be file(s): ${wouldBe.map((artifact) => artifact.path).join(", ")}.`,
	);
	for (const problem of problems) log(`Warning: ${problem}`);
	for (const warning of lint.warnings) log(`Warning: ${warning}`);
	if (lint.findings.length === 0) {
		log("No findings.");
	} else {
		for (const finding of lint.findings) log(`- ${formatFinding(finding)}`);
	}
	log();
	await printFlowConfig(project, repo, repo, log);
	const retired = RETIRED_PATHS.filter(
		({ path }) => kindOf(join(repo, path)) === "file",
	);
	log("## Files apply would delete");
	log();
	if (retired.length === 0) log("None.");
	for (const { path, reason } of retired) log(`- ${path}: ${reason}`);
	log();
	printConflicts(project, repo, log);
	printDecisions(
		project,
		(path) =>
			wouldBe.find((artifact) => artifact.path === path)?.content ??
			readText(join(repo, path)),
		log,
	);
	log("## Gates to run once writes are allowed");
	log();
	for (const gate of project.gates) {
		log(
			`- ${gate.name}: \`${gate.run.join(" ")}${gate.files === "written-json" ? " <written JSON files>" : ""}\``,
		);
	}
	log();
	printCiOnly(project, "report", log);
	const parity = printCiParity(project, repo, wouldBe, log);
	const rewrites = await printRewrites(repo, wouldBe, log);
	const envFiles = await printEnvFiles(repo, wouldBe, log);
	const taskCache = await printTaskCache(repo, wouldBe, log);
	const platformTools = await printPlatformTools(repo, wouldBe, log);
	const citations = await printCitations(project, repo, log);
	const lineCitations = await printLineCitations(repo, wouldBe, log);
	const failures = [
		...(parity.length > 0 ? [`${parity.length} CI parity failure(s)`] : []),
		...(rewrites.length > 0 ? [`${rewrites.length} rewrites problem(s)`] : []),
		...treeCheckProblems(
			envFiles,
			taskCache,
			platformTools,
			citations,
			lineCitations,
		),
	];
	printResult(
		failures,
		"PASS: the hardening profile has a gate for each blocking CI job.",
		log,
	);
	return failures.length === 0 ? 0 : 1;
}

function treeCheckProblems(
	envFiles: readonly string[],
	taskCache: readonly string[],
	platformTools: readonly string[],
	citations: readonly string[],
	lineCitations: readonly string[],
): string[] {
	return [
		...(envFiles.length > 0 ? [`${envFiles.length} env file problem(s)`] : []),
		...(taskCache.length > 0
			? [`${taskCache.length} task cache problem(s)`]
			: []),
		...(platformTools.length > 0
			? [`${platformTools.length} platform tool problem(s)`]
			: []),
		...(citations.length > 0
			? [
					`${citations.length} decision citation(s) that the comment hook does not keep`,
				]
			: []),
		...(lineCitations.length > 0
			? [`${lineCitations.length} line citation(s) of a file that apply writes`]
			: []),
	];
}

function timestamp(): string {
	return new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d+Z$/, "Z");
}

function assertOwnedCopy(scratch: string, copy: string, name: string): void {
	const rel = relative(scratch, copy);
	if (
		rel.startsWith("..") ||
		rel.includes("/") ||
		!basename(copy).startsWith(`apply-${name}-`)
	) {
		throw new Error(`refusing to touch ${copy}: not a copy this run made`);
	}
}

async function lsRemote(repo: string): Promise<string | undefined> {
	const result = await run(
		[
			"git",
			"ls-remote",
			"--exit-code",
			`https://github.com/${repo}.git`,
			"HEAD",
		],
		{
			cwd: process.cwd(),
			timeoutSeconds: 60,
			env: cleanEnv({ GIT_TERMINAL_PROMPT: "0" }),
		},
	);
	if (result.exitCode === 0) return undefined;
	return result.timedOut
		? "git ls-remote timed out"
		: `git ls-remote failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`;
}

type SettingsOutcome =
	| { status: "pending"; reason: string }
	| { status: "refused"; reason: string }
	| { status: "unchanged"; notes: string[] }
	| { status: "write"; artifact: Artifact; notes: string[] };

async function planSettings(
	copy: string,
	marketplaceRepo: string | undefined,
): Promise<SettingsOutcome> {
	if (marketplaceRepo === undefined) {
		return {
			status: "pending",
			reason:
				"no --marketplace-repo given; the marketplace is not published yet",
		};
	}
	if (!isGithubRepo(marketplaceRepo)) {
		return {
			status: "refused",
			reason: `"${marketplaceRepo}" is not a GitHub owner/repo; directory and URL sources are never written`,
		};
	}
	const remoteError = await lsRemote(marketplaceRepo);
	if (remoteError !== undefined) {
		return { status: "refused", reason: `${marketplaceRepo}: ${remoteError}` };
	}
	const parsed = parseSettings(readText(join(copy, ".claude/settings.json")));
	if (!parsed.ok) return { status: "refused", reason: parsed.reason };
	const merged = mergeMarketplaceWiring(parsed.value, marketplaceRepo);
	if (!merged.ok) return { status: "refused", reason: merged.reason };
	if (!merged.changed) return { status: "unchanged", notes: merged.notes };
	return {
		status: "write",
		artifact: {
			path: ".claude/settings.json",
			kind: "settings",
			content: formatSettings(merged.settings),
		},
		notes: merged.notes,
	};
}

function bunPin(copy: string): string | undefined {
	const text = readText(join(copy, "package.json"));
	if (text === undefined) return undefined;
	try {
		const manifest: unknown = JSON.parse(text);
		if (
			typeof manifest === "object" &&
			manifest !== null &&
			"packageManager" in manifest &&
			typeof manifest.packageManager === "string" &&
			manifest.packageManager.startsWith("bun@")
		) {
			return manifest.packageManager.slice("bun@".length);
		}
	} catch {
		return undefined;
	}
	return undefined;
}

function printVerdicts(
	verdicts: GateVerdict[],
	where: "copy" | "worktree",
	log: Log,
): void {
	log(`## Gates: baseline against candidate in the ${where}`);
	log();
	if (verdicts.length === 0) log("No gates configured.");
	for (const verdict of verdicts) {
		log(`- ${verdict.name}: ${verdict.verdict} (${verdict.detail})`);
		for (const line of verdict.newLines) log(`    ${line}`);
	}
	log();
}

function warnMissingRules(
	project: ProjectConfig,
	rendered: Rendered,
	log: Log,
): void {
	if (
		project.artifacts.rules &&
		!rendered.artifacts.some((artifact) => artifact.kind === "rule")
	) {
		log(
			"Warning: rules/ holds no .md file yet, so no rule copy is rendered. Run `bun run build`.",
		);
		log();
	}
}

function printResult(problems: readonly string[], pass: string, log: Log) {
	log("## Result");
	log();
	log(problems.length === 0 ? pass : `FAIL: ${problems.join(", ")}.`);
	log();
}

async function nestedWorktrees(repo: string): Promise<string[]> {
	const listed = await realRepoGit(repo, [
		"worktree",
		"list",
		"--porcelain",
		"-z",
	]);
	const root = realpathSync(repo);
	return listed.stdout
		.split("\0")
		.flatMap((field) =>
			field.startsWith("worktree ")
				? [relative(root, field.slice("worktree ".length))]
				: [],
		)
		.filter(
			(path) =>
				path !== "" &&
				path !== ".." &&
				!path.startsWith("../") &&
				!isAbsolute(path),
		);
}

type CopyStep = { readonly dir: string; readonly entries: readonly string[] };

function copySteps(
	repo: string,
	skipped: readonly string[],
	dir = "",
): CopyStep[] {
	const entries = readdirSync(join(repo, dir)).map((name) =>
		dir === "" ? name : `${dir}/${name}`,
	);
	const parents = entries.filter((path) =>
		skipped.some((worktree) => worktree.startsWith(`${path}/`)),
	);
	return [
		{
			dir,
			entries: entries.filter(
				(path) => !skipped.includes(path) && !parents.includes(path),
			),
		},
		...parents.flatMap((path) => copySteps(repo, skipped, path)),
	];
}

async function copyRepo(
	repo: string,
	copy: string,
	skipped: readonly string[],
): Promise<string | undefined> {
	try {
		for (const step of copySteps(repo, skipped)) {
			mkdirSync(join(copy, step.dir), { recursive: true });
			for (const path of step.entries) {
				await cp(join(repo, path), join(copy, path), {
					recursive: true,
					mode: constants.COPYFILE_FICLONE,
					verbatimSymlinks: true,
				});
			}
		}
	} catch (error) {
		return messageOf(error);
	}
	return undefined;
}

export async function dryRunProject(
	project: ProjectConfig,
	options: ProjectRunOptions,
): Promise<number> {
	const { log } = options;
	const repo = projectPath(project);
	if (!existsSync(repo)) {
		log(`${project.name}: ${repo} does not exist`);
		return 1;
	}
	const live = await readLiveState(repo);
	if (project.mode === "report-only") {
		return reportOnly(
			project,
			repo,
			live,
			log,
			"--dry-run",
			options.profileDir,
			options.deny,
		);
	}
	printLive(project, repo, live, log, "--dry-run");

	const rendered = renderRepoArtifacts(
		project,
		readRuleSources(),
		options.profileDir,
	);
	warnMissingRules(project, rendered, log);

	mkdirSync(options.scratch, { recursive: true });
	const scratch = realpathSync(options.scratch);
	const copy = join(scratch, `apply-${project.name}-${timestamp()}`);
	assertOwnedCopy(scratch, copy, project.name);
	const started = Date.now();
	const skipped = await nestedWorktrees(repo);
	const copyError = await copyRepo(repo, copy, skipped);
	if (copyError !== undefined) {
		log(`Repository copy failed: ${copyError}`);
		if (existsSync(copy)) rmSync(copy, { recursive: true, force: true });
		return 1;
	}
	log(
		`Copy: ${copy} (filesystem copy, ${((Date.now() - started) / 1000).toFixed(1)}s, with no copy of ${skipped.length} nested worktree(s))`,
	);
	let exitCode = 0;
	try {
		exitCode = await dryRunInCopy(project, repo, copy, live, rendered, options);
	} catch (error) {
		log(`Dry run failed: ${messageOf(error)}`);
		exitCode = 1;
	} finally {
		if (options.keep) {
			log(`Kept the copy at ${copy}. Delete it with: rm -rf '${copy}'`);
		} else {
			assertOwnedCopy(scratch, copy, project.name);
			rmSync(copy, { recursive: true, force: true });
			log(`Deleted the copy at ${copy}.`);
		}
	}
	return exitCode;
}

async function dryRunInCopy(
	project: ProjectConfig,
	repo: string,
	copy: string,
	live: LiveState,
	rendered: Rendered,
	options: ProjectRunOptions,
): Promise<number> {
	const { log } = options;
	if (kindOf(join(copy, ".git")) !== "directory") {
		log(
			"Refused: the copy's .git is not a directory, so git in the copy would write into another repository.",
		);
		return 1;
	}
	const copyHead = await copyGit(copy, ["rev-parse", "HEAD"]);
	if (copyHead.stdout.trim() !== live.head) {
		log(
			`Warning: HEAD moved while copying (${live.head} before, ${copyHead.stdout.trim()} in the copy). The copy is what was checked.`,
		);
	}
	log();
	const staged = await stageInTree(
		project,
		repo,
		copy,
		rendered,
		options.deny,
		options.marketplaceRepo,
		log,
		"copy",
	);
	printResult(
		staged.problems,
		`PASS: ${staged.paths.length} file(s) written in the copy, no new gate failure.`,
		log,
	);
	return staged.problems.length === 0 ? 0 : 1;
}

type Staged = {
	problems: string[];
	paths: string[];
	removed: string[];
	kinds: ArtifactKind[];
};

async function stageInTree(
	project: ProjectConfig,
	repo: string,
	tree: string,
	rendered: Rendered,
	deny: TargetDeny,
	marketplaceRepo: string | undefined,
	log: Log,
	where: "copy" | "worktree",
): Promise<Staged> {
	const settings = project.artifacts.settings
		? await planSettings(tree, marketplaceRepo)
		: undefined;
	const artifacts =
		settings?.status === "write"
			? [...rendered.artifacts, settings.artifact]
			: rendered.artifacts;

	const probe = fsProbe(tree);
	const refusals: string[] = [];
	const safe: Artifact[] = [];
	for (const artifact of artifacts) {
		const reason = writeRefusal(artifact.path, probe);
		if (reason === undefined) safe.push(artifact);
		else refusals.push(`${artifact.path}: ${reason}`);
	}
	const ignoredPaths = new Set<string>();
	if (safe.length > 0) {
		const ignored = await copyGit(tree, [
			"check-ignore",
			"--no-index",
			"--",
			...safe.map((artifact) => artifact.path),
		]);
		for (const path of ignored.stdout.split("\n").filter(Boolean)) {
			ignoredPaths.add(path);
			refusals.push(
				`${path}: gitignored, so the generated file would stay untracked`,
			);
		}
	}
	const allowed = safe.filter((artifact) => !ignoredPaths.has(artifact.path));
	const removal = planRemovals({
		project,
		written: artifacts.map((artifact) => artifact.path),
		previous: managedList(readProfileJson(tree)),
		probe,
	});
	refusals.push(...removal.refused);
	const tracked = await copyGit(tree, ["ls-files", "-z"]);
	refusals.push(
		...strayCopies({
			project,
			tracked: tracked.stdout.split("\0").filter(Boolean),
			written: artifacts.map((artifact) => artifact.path),
			removed: removal.remove.map((entry) => entry.path),
		}),
	);

	const lint = await lintTarget(project, artifacts, deny);
	log("## Neutrality lint of repo-bound content");
	log();
	for (const problem of rendered.problems) log(`Source problem: ${problem}`);
	for (const warning of lint.warnings) log(`Warning: ${warning}`);
	if (lint.findings.length === 0)
		log(`No findings in ${artifacts.length} file(s).`);
	for (const finding of lint.findings) log(`- ${formatFinding(finding)}`);
	log();

	log("## Settings wiring");
	log();
	if (settings === undefined) {
		log("Not configured for this project.");
	} else if (settings.status === "pending") {
		log(`Pending publication: ${settings.reason}. Once published, apply adds:`);
		log(formatSettings(pendingWiring()).trimEnd());
	} else if (settings.status === "refused") {
		log(`Refused: ${settings.reason}`);
		refusals.push(`.claude/settings.json: ${settings.reason}`);
	} else {
		log(
			settings.status === "unchanged"
				? ".claude/settings.json already carries the wiring."
				: "Merged the wiring into .claude/settings.json.",
		);
		for (const note of settings.notes) log(`Note: ${note}`);
	}
	log();

	const flowProblems = project.artifacts.agentDocs
		? await printFlowConfig(project, tree, repo, log)
		: [];

	log("## Refused writes");
	log();
	if (refusals.length === 0) log("None.");
	for (const refusal of refusals) log(`- ${refusal}`);
	log();

	log("## Deleted files");
	log();
	if (removal.remove.length === 0) log("None.");
	for (const { path, reason } of removal.remove) log(`- ${path}: ${reason}`);
	log();

	const jsonPaths = allowed
		.filter((artifact) => artifact.path.endsWith(".json"))
		.map((artifact) => artifact.path);
	const baselineJson = jsonPaths.filter((path) => existsSync(join(tree, path)));
	const baseline: GateRun[] = [];
	for (const gate of project.gates) {
		baseline.push(await runGate(gate, tree, baselineJson));
	}

	for (const artifact of allowed) {
		const target = join(tree, artifact.path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, artifact.content);
	}
	const paths = allowed.map((artifact) => artifact.path);
	const removed = removal.remove.map((entry: Removal) => entry.path);
	if (paths.length > 0) {
		const added = await copyGit(tree, ["add", "--", ...paths]);
		if (added.exitCode !== 0) {
			log(`git add in the ${where} failed: ${added.stderr.trim()}`);
			return { problems: ["git add failed"], paths, removed, kinds: [] };
		}
	}
	if (removed.length > 0) {
		const deleted = await copyGit(tree, ["rm", "--quiet", "--", ...removed]);
		if (deleted.exitCode !== 0) {
			log(`git rm in the ${where} failed: ${deleted.stderr.trim()}`);
			return { problems: ["git rm failed"], paths, removed, kinds: [] };
		}
	}

	const verdicts: GateVerdict[] = [];
	for (const [index, gate] of project.gates.entries()) {
		const candidate = await runGate(gate, tree, jsonPaths);
		const before = baseline[index] ?? {
			status: "skipped" as const,
			reason: "not run",
		};
		verdicts.push(compareGateRuns(gate.name, before, candidate));
	}
	printVerdicts(verdicts, where, log);

	const pin = bunPin(tree);
	if (pin !== undefined && pin !== Bun.version) {
		log(`Note: the repo pins bun ${pin}; the gates ran on bun ${Bun.version}.`);
		log();
	}

	log(`## Diff of written and deleted files (staged in the ${where})`);
	log();
	if (paths.length === 0 && removed.length === 0) {
		log("Nothing written.");
	} else {
		const diff = await copyGit(tree, [
			"diff",
			"--cached",
			"--no-color",
			"--no-ext-diff",
			"--src-prefix=a/",
			"--dst-prefix=b/",
			"--",
			...paths,
			...removed,
		]);
		log(diff.stdout.trimEnd());
	}
	log();

	printConflicts(project, repo, log);
	const decisionProblems = printDecisions(
		project,
		(path) => readText(join(tree, path)),
		log,
	);
	printCiOnly(project, where, log);
	const parity = printCiParity(project, tree, rendered.artifacts, log);
	const rewrites = await printRewrites(tree, rendered.artifacts, log);
	const envFiles = await printEnvFiles(tree, rendered.artifacts, log);
	const taskCache = await printTaskCache(tree, rendered.artifacts, log);
	const platformTools = await printPlatformTools(tree, rendered.artifacts, log);
	const citations = await printCitations(project, tree, log);
	const lineCitations = await printLineCitations(tree, rendered.artifacts, log);

	const newFailures = verdicts.filter(
		(verdict) => verdict.verdict === "new-failure",
	);
	return {
		problems: [
			...(rendered.problems.length > 0
				? [`${rendered.problems.length} source problem(s)`]
				: []),
			...(flowProblems.length > 0
				? [`${flowProblems.length} flow config problem(s)`]
				: []),
			...(lint.findings.length > 0
				? [`${lint.findings.length} lint finding(s)`]
				: []),
			...(refusals.length > 0 ? [`${refusals.length} refused write(s)`] : []),
			...(decisionProblems.length > 0
				? [`${decisionProblems.length} decided comment form(s) not in effect`]
				: []),
			...(newFailures.length > 0
				? [`${newFailures.length} new gate failure(s)`]
				: []),
			...(parity.length > 0 ? [`${parity.length} CI parity failure(s)`] : []),
			...(rewrites.length > 0
				? [`${rewrites.length} rewrites problem(s)`]
				: []),
			...treeCheckProblems(
				envFiles,
				taskCache,
				platformTools,
				citations,
				lineCitations,
			),
		],
		paths,
		removed,
		kinds: allowed.map((artifact) => artifact.kind),
	};
}

async function readMainState(repo: string): Promise<MainState> {
	const head = await realRepoGit(repo, ["rev-parse", "HEAD"]);
	const branch = await realRepoGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const status = await realRepoGit(repo, [
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=all",
	]);
	if (head.exitCode !== 0 || status.exitCode !== 0) {
		throw new Error(
			`cannot read the state of ${repo}: ${head.stderr.trim()} ${status.stderr.trim()}`,
		);
	}
	return {
		head: head.stdout.trim(),
		branch: branch.stdout.trim(),
		statusHash: statusHash(status.stdout),
	};
}

async function originHead(repo: string): Promise<string | undefined> {
	const result = await realRepoGit(repo, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	const ref = result.stdout.trim();
	return result.exitCode === 0 && ref !== "" ? ref : undefined;
}

function readTextFiles(root: string, paths: readonly string[]): TextFile[] {
	return paths.flatMap((path) => {
		const text = readText(join(root, path));
		return text === undefined ? [] : [{ path, text }];
	});
}

function workflowPaths(root: string): string[] {
	try {
		return readdirSync(join(root, ".github/workflows"))
			.filter((name) => /\.ya?ml$/.test(name))
			.sort()
			.map((name) => `.github/workflows/${name}`);
	} catch {
		return [];
	}
}

const branchRuleDocs = [
	"CLAUDE.md",
	"AGENTS.md",
	"CONTRIBUTING.md",
	".github/CONTRIBUTING.md",
	"docs/CONTRIBUTING.md",
];

function linkDeps(
	repo: string,
	worktree: string,
	project: ProjectConfig,
	log: Log,
): () => void {
	const source = join(repo, "node_modules");
	const target = join(worktree, "node_modules");
	if (
		!gatesNeedDeps(project.gates) ||
		kindOf(source) !== "directory" ||
		kindOf(target) !== "missing"
	) {
		return () => {};
	}
	symlinkSync(source, target, "dir");
	log(`Linked ${target} to ${source} for the gate run.`);
	log();
	return () => {
		if (kindOf(target) !== "symlink") return;
		unlinkSync(target);
		log(`Removed the link ${target}.`);
		log();
	};
}

async function removeWorktree(
	repo: string,
	worktree: string,
	branch: string,
	log: Log,
): Promise<void> {
	const removed = await realRepoGit(repo, [
		"worktree",
		"remove",
		"--force",
		worktree,
	]);
	const deleted = await realRepoGit(repo, ["branch", "-D", branch]);
	log(
		removed.exitCode === 0 && deleted.exitCode === 0
			? `Removed the worktree ${worktree} and the branch ${branch}.`
			: `Could not clean up: ${removed.stderr.trim()} ${deleted.stderr.trim()}`.trim(),
	);
	log();
}

type WorktreeOutcome = { code: number; committed: boolean; next: string[] };

const failed: WorktreeOutcome = { code: 1, committed: false, next: [] };

type CommitMode =
	| { readonly kind: "create"; readonly baseBranch: string }
	| { readonly kind: "update" };

async function commitInWorktree(
	config: ProjectConfig,
	repo: string,
	worktree: string,
	branch: string,
	mode: CommitMode,
	overlay: string | undefined,
	options: WorktreeOptions,
): Promise<WorktreeOutcome> {
	const { log } = options;
	const project = overlaid(config, overlay);
	if (overlay !== undefined) {
		log(
			`Overlay: ${overlay}, from branches.${overlay} of projects/${project.name}.json and ${reviewProfileLabel(project.name, overlay)}`,
		);
		log();
	}
	const rendered = renderRepoArtifacts(
		project,
		readRuleSources(),
		options.profileDir,
		overlay,
	);
	warnMissingRules(project, rendered, log);
	const warning = branchWarning(
		branch,
		worktree,
		findBranchChecks(readTextFiles(worktree, workflowPaths(worktree))),
		documentedShapes(readTextFiles(worktree, branchRuleDocs)),
	);
	log("## Branch name");
	log();
	if (warning.length === 0)
		log(`No branch-name rule found that ${branch} fails.`);
	for (const line of warning) log(line);
	log();

	const unlink = linkDeps(repo, worktree, project, log);
	let staged: Staged;
	try {
		staged = await stageInTree(
			project,
			repo,
			worktree,
			rendered,
			options.deny,
			options.marketplaceRepo,
			log,
			"worktree",
		);
	} finally {
		unlink();
	}
	printResult(
		staged.problems,
		`PASS: ${staged.paths.length} file(s) written and staged in the worktree, no new gate failure.`,
		log,
	);
	if (staged.problems.length > 0) return failed;

	const cached = await copyGit(worktree, [
		"diff",
		"--cached",
		"--name-only",
		"-z",
	]);
	const stagedNames = cached.stdout.split("\0").filter(Boolean);
	if (stagedNames.length === 0) {
		log(
			`Nothing to commit: ${mode.kind === "create" ? mode.baseBranch : branch} already holds these files.`,
		);
		log();
		return { code: 0, committed: false, next: [] };
	}
	const stray = stagedNames.filter(
		(name) => !staged.paths.includes(name) && !staged.removed.includes(name),
	);
	if (stray.length > 0) {
		log(
			`Refused: these staged paths are not apply output: ${stray.join(", ")}`,
		);
		return failed;
	}
	const history = await copyGit(worktree, [
		"log",
		"-50",
		"--format=%s",
		"HEAD",
	]);
	const style = detectCommitStyle(history.stdout.split("\n"));
	const kindOfPath = new Map(
		staged.paths.map((path, index) => [path, staged.kinds[index]]),
	);
	const removes = stagedNames.some((name) => staged.removed.includes(name));
	const words =
		project.neutralCommit === undefined ? ASTACK_WORDS : NEUTRAL_WORDS;
	const parts = commitParts(
		stagedNames.flatMap((name) => kindOfPath.get(name) ?? []),
		words,
	);
	const added = await copyGit(worktree, [
		"diff",
		"--cached",
		"--name-only",
		"--diff-filter=A",
		"-z",
	]);
	const addsFiles = added.stdout.split("\0").some(Boolean);
	const subject =
		mode.kind === "update" ||
		(project.commitSubject === undefined && !addsFiles)
			? updateSubject(style, parts, removes, words)
			: project.commitSubject === undefined
				? commitSubject(style, parts, removes, words)
				: removes
					? subjectWithRemoval(project.commitSubject, style, words)
					: project.commitSubject;
	const command = `bun run apply --project ${project.name} --worktree${mode.kind === "update" ? " --update" : ""}${mode.kind === "update" && overlay !== undefined ? ` --overlay ${overlay}` : ""}`;
	const paragraphs = commitParagraphs(
		subject,
		project.neutralCommit === undefined
			? [
					`Written by \`${command}\` in the astack repo.`,
					stagedNames.map((name) => `- ${name}`).join("\n"),
				]
			: [
					`The agent tooling writer made this commit. It changes ${stagedNames.length} file${stagedNames.length === 1 ? "" : "s"}.`,
				],
		options.trailers,
	);
	const deniedText =
		project.neutralCommit === undefined
			? []
			: scanSubstrings(
					{ path: "", content: paragraphs.join("\n\n") },
					project.lint.denySubstrings,
				);
	if (deniedText.length > 0) {
		log(
			`Refused: the commit message holds a substring that lint.denySubstrings of projects/${project.name}.json denies, and neutralCommit asks for a commit text with none. Change the trailer or commitSubject.`,
		);
		for (const finding of deniedText)
			log(`- line ${finding.line}: ${finding.detail}`);
		log();
		return failed;
	}
	const refusals = steRefusals(
		paragraphs.join("\n\n"),
		subject,
		loadSettings(worktree).glossary,
	);
	if (refusals.length > 0) {
		log(
			`Refused: the astack STE hook blocks this commit message or PR title. Change commitSubject in projects/${project.name}.json.`,
		);
		for (const line of refusals) log(`- ${line}`);
		log();
		return failed;
	}
	const committed = await copyGit(worktree, [
		"commit",
		"--quiet",
		...paragraphs.flatMap((paragraph) => ["-m", paragraph]),
	]);
	if (committed.exitCode !== 0) {
		log(`git commit failed: ${committed.stderr.trim()}`);
		return failed;
	}
	const shown = await copyGit(worktree, [
		"show",
		"--stat",
		"--format=%H%n%n%B",
		"HEAD",
	]);
	log("## Commit");
	log();
	log(shown.stdout.trimEnd());
	log();
	if (mode.kind === "update") {
		const upstream = await copyGit(worktree, [
			"rev-parse",
			"--abbrev-ref",
			"--symbolic-full-name",
			"@{upstream}",
		]);
		return {
			code: 0,
			committed: true,
			next: updateSteps(worktree, branch, upstream.exitCode === 0),
		};
	}
	return {
		code: 0,
		committed: true,
		next: nextSteps({
			repo,
			worktree,
			branch,
			baseBranch: mode.baseBranch,
			subject,
			prTemplate: findPrTemplate(worktree),
			tracker: project.tracker,
			branchWarning: warning,
		}),
	};
}

function updateSteps(
	worktree: string,
	branch: string,
	pushed: boolean,
): string[] {
	return [
		"## Next steps",
		"",
		"Review the follow-up commit.",
		"",
		`    git -C ${worktree} show --stat HEAD`,
		`    git -C ${worktree} show HEAD`,
		"",
		pushed
			? "Push it as a new commit on the branch. An open PR gets it as one more commit. Never force-push."
			: "The branch is not on the remote yet. Push it when the owner says so.",
		"",
		`    git -C ${worktree} push ${pushed ? "" : "-u "}origin ${branch}`,
	];
}

async function writeInWorktree(
	project: ProjectConfig,
	repo: string,
	options: WorktreeOptions,
): Promise<WorktreeOutcome> {
	const { log } = options;
	const refuse = (reason: string): WorktreeOutcome => {
		log(`Refused: ${reason}`);
		log();
		return failed;
	};
	const fetched = await run(["git", "-C", repo, "fetch", "--quiet", "origin"], {
		cwd: repo,
		timeoutSeconds: 300,
		env: cleanEnv({ GIT_TERMINAL_PROMPT: "0" }),
	});
	if (fetched.exitCode !== 0) {
		return refuse(
			`git fetch origin failed: ${fetched.timedOut ? "timed out" : fetched.stderr.trim()}`,
		);
	}
	const head = await originHead(repo);
	const base = options.base ?? head;
	if (base === undefined) {
		return refuse("origin has no default branch. Pass --base <ref>.");
	}
	const baseSha = await realRepoGit(repo, [
		"rev-parse",
		"--verify",
		"--quiet",
		`${base}^{commit}`,
	]);
	if (baseSha.exitCode !== 0) return refuse(`${base} is not a commit`);
	const fromBase = remoteBranchName(base) ?? base;
	const baseOverlay =
		project.branches?.[fromBase] === undefined ? undefined : fromBase;
	if (
		baseOverlay !== undefined &&
		options.overlay !== undefined &&
		options.overlay !== baseOverlay
	)
		return refuse(
			`--base ${base} takes the ${baseOverlay} overlay, not ${options.overlay}. Pass --overlay ${baseOverlay}, or leave it out.`,
		);
	const overlay = baseOverlay ?? options.overlay;
	const branch =
		options.branch ??
		expandBranchTemplate(project.branchTemplate ?? SETUP_BRANCH, options.today);
	const badName = branchRefusal(branch);
	if (badName !== undefined) return refuse(badName);
	for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
		const exists = await realRepoGit(repo, [
			"show-ref",
			"--verify",
			"--quiet",
			ref,
		]);
		if (exists.exitCode === 0) {
			return refuse(
				`${ref} already exists. Pass --branch <name>, or delete that branch first.`,
			);
		}
	}
	const worktree = worktreePath(
		resolve(expandHome(options.worktrees)),
		project.name,
		branch,
	);
	if (isInside(repo, worktree)) {
		return refuse(
			`${worktree} is inside ${repo}. Pass --worktrees <dir> with a folder outside the repo.`,
		);
	}
	if (existsSync(worktree)) return refuse(`${worktree} already exists`);
	mkdirSync(dirname(worktree), { recursive: true });
	const added = await run(
		[
			"git",
			"-C",
			repo,
			"worktree",
			"add",
			"--quiet",
			"--no-track",
			"-b",
			branch,
			worktree,
			base,
		],
		{ cwd: repo, timeoutSeconds: 900, env: cleanEnv() },
	);
	if (added.exitCode !== 0) {
		return refuse(`git worktree add failed: ${added.stderr.trim()}`);
	}
	log(`Worktree: ${worktree}`);
	log(
		`Branch: ${branch}, from ${base} at ${baseSha.stdout.trim().slice(0, 12)}`,
	);
	log();
	let outcome: WorktreeOutcome = failed;
	try {
		outcome = await commitInWorktree(
			project,
			repo,
			worktree,
			branch,
			{
				kind: "create",
				baseBranch:
					baseOverlay ??
					remoteBranchName(base) ??
					remoteBranchName(head ?? "") ??
					base,
			},
			overlay,
			options,
		);
		return outcome;
	} catch (error) {
		log(`Write mode failed: ${messageOf(error)}`);
		return failed;
	} finally {
		if (!outcome.committed) {
			if (options.keep && outcome.code !== 0) {
				log(`Kept the worktree ${worktree} and the branch ${branch}.`);
				log();
			} else {
				await removeWorktree(repo, worktree, branch, log);
			}
		}
	}
}

async function sameGitDir(left: string, right: string): Promise<boolean> {
	const commonDir = async (dir: string) => {
		const result = await realRepoGit(dir, [
			"rev-parse",
			"--path-format=absolute",
			"--git-common-dir",
		]);
		return result.exitCode === 0
			? realpathSync(result.stdout.trim())
			: undefined;
	};
	const [one, two] = [await commonDir(left), await commonDir(right)];
	return one !== undefined && one === two;
}

type OverlayBases = { defaultRef: string; overlays: string[] };

async function overlayBases(
	project: ProjectConfig,
	worktree: string,
): Promise<OverlayBases | undefined> {
	const defaultRef = await originHead(worktree);
	if (defaultRef === undefined) return undefined;
	const overlays: string[] = [];
	for (const name of Object.keys(project.branches ?? {})) {
		if (`origin/${name}` === defaultRef) continue;
		const forkPoint = await copyGit(worktree, [
			"merge-base",
			"HEAD",
			`refs/remotes/origin/${name}`,
		]);
		if (forkPoint.exitCode !== 0) continue;
		const onDefault = await copyGit(worktree, [
			"merge-base",
			"--is-ancestor",
			forkPoint.stdout.trim(),
			defaultRef,
		]);
		if (onDefault.exitCode === 1) overlays.push(name);
	}
	return { defaultRef, overlays };
}

async function updateInWorktree(
	project: ProjectConfig,
	repo: string,
	options: WorktreeOptions,
): Promise<WorktreeOutcome> {
	const { log } = options;
	const refuse = (reason: string): WorktreeOutcome => {
		log(`Refused: ${reason}`);
		log();
		return failed;
	};
	const branch =
		options.branch ??
		expandBranchTemplate(project.branchTemplate ?? SETUP_BRANCH, options.today);
	const worktree = worktreePath(
		resolve(expandHome(options.worktrees)),
		project.name,
		branch,
	);
	if (kindOf(worktree) !== "directory")
		return refuse(
			`${worktree} does not exist. Run apply with --worktree and without --update first.`,
		);
	const top = await copyGit(worktree, ["rev-parse", "--show-toplevel"]);
	if (
		top.exitCode !== 0 ||
		realpathSync(top.stdout.trim()) !== realpathSync(worktree)
	)
		return refuse(`${worktree} is not the root of a git worktree`);
	if (!(await sameGitDir(repo, worktree)))
		return refuse(`${worktree} is a worktree of another repo, not ${repo}`);
	const current = (
		await copyGit(worktree, ["branch", "--show-current"])
	).stdout.trim();
	if (current !== branch)
		return refuse(
			`${worktree} is on ${current || "a detached HEAD"}, not ${branch}`,
		);
	const status = await copyGit(worktree, [
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	]);
	if (status.exitCode !== 0 || status.stdout.trim() !== "")
		return refuse(`${worktree} has changes. Commit or remove them first.`);
	const bases = await overlayBases(project, worktree);
	if (
		bases !== undefined &&
		bases.overlays.length > 0 &&
		(options.overlay === undefined || !bases.overlays.includes(options.overlay))
	)
		return refuse(
			`${branch} holds commits of ${bases.overlays.map((name) => `origin/${name}`).join(", ")} that ${bases.defaultRef} does not hold, so the ${bases.overlays.join(", ")} overlay applies to it. Pass --overlay ${bases.overlays.join(" or --overlay ")}.`,
		);
	const head = (await copyGit(worktree, ["rev-parse", "HEAD"])).stdout.trim();
	log(`Worktree: ${worktree}`);
	log(
		`Branch: ${branch} at ${head.slice(0, 12)}. apply adds one commit on top and never amends or force-pushes.`,
	);
	log();
	let outcome: WorktreeOutcome = failed;
	try {
		outcome = await commitInWorktree(
			project,
			repo,
			worktree,
			branch,
			{ kind: "update" },
			options.overlay,
			options,
		);
		return outcome;
	} catch (error) {
		log(`Update failed: ${messageOf(error)}`);
		return failed;
	} finally {
		if (outcome.code !== 0) {
			if (options.keep) {
				log(`Kept the changes in ${worktree}.`);
			} else {
				await copyGit(worktree, ["reset", "--quiet", "--hard", head]);
				await copyGit(worktree, ["clean", "--quiet", "-f", "-d"]);
				log(`Put ${worktree} back to ${head.slice(0, 12)} with no changes.`);
			}
			log();
		}
	}
}

type CommittedSource =
	| { readonly kind: "committed"; readonly sha: string }
	| { readonly kind: "refused"; readonly reason: string };

type ApplySource = {
	readonly name: "astack" | "companion";
	readonly root: string;
	readonly place: string;
	readonly pathspec: readonly string[];
	readonly scope: string;
};

const ASTACK_SOURCES: readonly string[] = [
	"marketplace",
	"rules",
	"scripts",
	"src",
	"templates",
	"upstream",
];

const MAX_LISTED_CHANGES = 10;

function astackSourceAt(root: string): ApplySource {
	return {
		name: "astack",
		root,
		place: `the astack repo at ${root}`,
		pathspec: ASTACK_SOURCES,
		scope: ` in ${ASTACK_SOURCES.join(", ")}`,
	};
}

function companionSourceAt(root: string): ApplySource {
	return {
		name: "companion",
		root,
		place: `the companion at ${root}`,
		pathspec: ["."],
		scope: "",
	};
}

async function committedSource(source: ApplySource): Promise<CommittedSource> {
	const head = await realRepoGit(source.root, [
		"rev-parse",
		"--verify",
		"--quiet",
		"HEAD^{commit}",
	]);
	if (head.exitCode !== 0)
		return {
			kind: "refused",
			reason: `${source.place} has no commit, so the apply commit cannot name the ${source.name} source that wrote it. Make a first commit there.`,
		};
	const status = await realRepoGit(source.root, [
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
		"--",
		...source.pathspec,
	]);
	if (status.exitCode !== 0)
		return {
			kind: "refused",
			reason: `git status failed in ${source.place}: ${status.stderr.trim()}`,
		};
	const changed = status.stdout
		.split("\n")
		.filter(Boolean)
		.map((line) => line.slice(3));
	if (changed.length > 0) {
		const more = changed.length - MAX_LISTED_CHANGES;
		return {
			kind: "refused",
			reason: `${source.place} has changes that are not committed${source.scope}: ${changed.slice(0, MAX_LISTED_CHANGES).join(", ")}${more > 0 ? `, and ${more} more` : ""}. Commit them first, so the apply commit names the ${source.name} source that wrote it.`,
		};
	}
	return { kind: "committed", sha: head.stdout.trim() };
}

export async function worktreeProject(
	project: ProjectConfig,
	options: WorktreeOptions,
): Promise<number> {
	const { log } = options;
	const repo = projectPath(project);
	if (!existsSync(repo)) {
		log(`${project.name}: ${repo} does not exist`);
		return 1;
	}
	const live = await readLiveState(repo);
	if (project.mode === "report-only") {
		await reportOnly(
			project,
			repo,
			live,
			log,
			"--worktree",
			options.profileDir,
			options.deny,
		);
		log("## Refused");
		log();
		log(
			`${project.name} is report-only, so the write mode does not run. The report above says what must change first.`,
		);
		log();
		return 1;
	}
	printLive(
		project,
		repo,
		live,
		log,
		options.update ? "--worktree --update" : "--worktree",
	);
	const source = await committedSource(astackSourceAt(options.astackRoot));
	if (source.kind === "refused") {
		log(`Refused: ${source.reason}`);
		log();
		return 1;
	}
	const companion = await committedSource(
		companionSourceAt(options.companionRoot),
	);
	if (companion.kind === "refused") {
		log(`Refused: ${companion.reason}`);
		log();
		return 1;
	}
	log(`astack source: ${options.astackRoot} at ${source.sha}`);
	log(`companion source: ${options.companionRoot} at ${companion.sha}`);
	log();
	if (
		options.overlay !== undefined &&
		project.branches?.[options.overlay] === undefined
	) {
		log(
			`Refused: --overlay ${options.overlay} names no key of branches in projects/${project.name}.json. Its overlays: ${Object.keys(project.branches ?? {}).join(", ") || "none"}.`,
		);
		log();
		return 1;
	}
	const stamped: WorktreeOptions = {
		...options,
		trailers: [
			`${project.neutralCommit?.provenanceKey ?? "Astack-Commit"}: ${source.sha}`,
			`Companion-Commit: ${companion.sha}`,
			...options.trailers,
		],
	};
	const before = await readMainState(repo);
	const outcome = options.update
		? await updateInWorktree(project, repo, stamped)
		: await writeInWorktree(project, repo, stamped);
	const after = await readMainState(repo);
	const changes = mainStateChanges(before, after);
	log("## Main checkout");
	log();
	log(
		changes.length === 0
			? `Unchanged: HEAD ${after.head} on ${after.branch}, and the same git status hash ${after.statusHash.slice(0, 16)}.`
			: `CHANGED: ${changes.join(", ")}.`,
	);
	log();
	if (changes.length > 0) return 1;
	for (const line of outcome.next) log(line);
	if (outcome.next.length > 0) log();
	return outcome.code;
}

export const scratchDefault = resolve(
	process.env.AGENT_STACK_SCRATCH ?? process.env.TMPDIR ?? "/tmp",
);
