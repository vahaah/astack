import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { loadGateRecord, profileBlobs, sameProfile } from "../../gates.ts";
import { READ_ONLY_GIT } from "../../git.ts";
import {
	type GitInvocation,
	type GitRead,
	HOOKS_PATH_KEY,
	isLongForm,
	isPlaceVariable,
	madeRepoTarget,
	movesPlace,
	readGit,
} from "../../git-command.ts";
import { realFile, toPosix } from "../../paths.ts";
import type { FilePorts, GitPorts, Ports } from "../../ports.ts";
import {
	isSessionRepo,
	rememberRepos,
	type SessionRepos,
	saveSessionRepos,
	settledRepos,
} from "../../session-repos.ts";
import { type ShellStep, shellSteps, type Word } from "../../shell.ts";
import { stateDir } from "../../state.ts";
import {
	ALLOW,
	combineAll,
	defineHandler,
	deny,
	type Env,
	type Verdict,
} from "../events.ts";

const SHARED_BRANCH =
	/^(?:main|master|trunk|develop|dev|staging|stage|production|prod|release(?:[/-].*)?|hotfix\/.*)$/;
const RUNNERS = new Set(["npx", "bunx", "pnpx"]);
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const OWNER_GATE = "This is an owner gate, so stop and ask the owner.";

function denial(reasons: readonly string[]): Verdict {
	return reasons.length === 0
		? ALLOW
		: deny(
				[
					"astack blocked a destructive command:",
					...reasons.map((reason) => `- ${reason}`),
				].join("\n"),
			);
}

function supabaseArgs(
	values: readonly string[],
): readonly string[] | undefined {
	const [first, second, third] = values;
	if (first === "supabase") return values.slice(1);
	if (RUNNERS.has(first ?? "") && second === "supabase") return values.slice(2);
	if (
		PACKAGE_MANAGERS.has(first ?? "") &&
		(second === "exec" || second === "dlx" || second === "x") &&
		third === "supabase"
	)
		return values.slice(3);
	if (PACKAGE_MANAGERS.has(first ?? "") && second === "supabase")
		return values.slice(2);
	return undefined;
}

function isReset(args: readonly string[] | undefined): boolean {
	const plain = (args ?? []).filter((arg) => !arg.startsWith("-"));
	return plain[0] === "db" && plain[1] === "reset";
}

function scriptText(
	ports: Ports,
	dir: string,
	name: string,
): string | undefined {
	const root = ports.git.gitRoot(dir) ?? dir;
	for (const base of [dir, root]) {
		const text = ports.files.readText(join(base, "package.json"));
		if (text === undefined) continue;
		try {
			const parsed: unknown = JSON.parse(text);
			const scripts =
				typeof parsed === "object" && parsed !== null
					? Reflect.get(parsed, "scripts")
					: undefined;
			const script =
				typeof scripts === "object" && scripts !== null
					? Reflect.get(scripts, name)
					: undefined;
			if (typeof script === "string") return script;
		} catch {}
	}
	return undefined;
}

function scriptName(values: readonly string[]): string | undefined {
	const [first, second, third] = values;
	if (!PACKAGE_MANAGERS.has(first ?? "")) return undefined;
	if (second === "run" || second === "run-script") return third;
	if (first === "yarn" || first === "pnpm" || first === "bun") return second;
	return undefined;
}

function supabaseReasons(step: ShellStep, ports: Ports): readonly string[] {
	if (isReset(supabaseArgs(step.values)))
		return [`supabase db reset deletes the database data. ${OWNER_GATE}`];
	const name = scriptName(step.values);
	const script =
		name === undefined ? undefined : scriptText(ports, step.dir, name);
	return script !== undefined &&
		/\bsupabase(?:\.[cm]?[jt]s)?\s+db\s+reset\b/.test(script)
		? [
				`The script ${name} runs supabase db reset, which deletes the database data. ${OWNER_GATE}`,
			]
		: [];
}

function pushTargets(
	refspecs: readonly string[],
	dir: string,
	git: GitPorts,
): readonly string[] {
	if (refspecs.length === 0) {
		const branch = git.gitBranch(dir);
		return branch === undefined ? [] : [branch];
	}
	return refspecs.map((spec) => {
		const plain = spec.replace(/^\+/, "");
		const target = plain.includes(":")
			? plain.slice(plain.indexOf(":") + 1)
			: plain;
		return target.replace(/^refs\/heads\//, "");
	});
}

export type LostChange = "unstaged" | "tracked" | "untracked";

export interface WorkLoss {
	readonly lost: LostChange;
	readonly pathspecs: readonly string[];
	readonly excludes?: readonly string[];
	readonly keepsUntrackedFolders?: boolean;
	readonly removesNestedRepos?: boolean;
	readonly reachesNestedRepos?: boolean;
	readonly target?: string;
}

const WHOLE_TREE = [":/"];

interface Operands {
	readonly flags: readonly string[];
	readonly plain: readonly string[];
	readonly dashed: readonly string[] | undefined;
}

function operands(
	args: readonly string[],
	valueFlags: readonly string[],
): Operands {
	const flags: string[] = [];
	const plain: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (arg === "--") return { flags, plain, dashed: args.slice(i + 1) };
		if (!arg.startsWith("-")) plain.push(arg);
		else {
			flags.push(arg);
			if (valueFlags.includes(arg)) i++;
		}
	}
	return { flags, plain, dashed: undefined };
}

function hasFlag(
	flags: readonly string[],
	long: string,
	letter: string,
): boolean {
	return flags.some(
		(flag) =>
			isLongForm(flag, long) ||
			(/^-[A-Za-z]+$/.test(flag) && flag.includes(letter)),
	);
}

function letterCount(flags: readonly string[], long: string, letter: string) {
	return flags.reduce(
		(count, flag) =>
			count +
			(isLongForm(flag, long)
				? 1
				: /^-[A-Za-z]+$/.test(flag)
					? flag.split(letter).length - 1
					: 0),
		0,
	);
}

function dryRun(flags: readonly string[]): boolean {
	return flags.reduce(
		(dry, flag) =>
			isLongForm(flag, "--no-dry-run")
				? false
				: isLongForm(flag, "--dry-run") ||
						(/^-[A-Za-z]+$/.test(flag) && flag.includes("n"))
					? true
					: dry,
		false,
	);
}

export type Treeish = (name: string) => boolean;

function treeishIn(git: GitPorts, dir: string): Treeish {
	return (name) =>
		git.gitRun(dir, ["rev-parse", "--verify", "--quiet", `${name}^{tree}`]).ok;
}

function readsPathspecFile(args: readonly string[]): boolean {
	return args.some((arg) =>
		isLongForm(arg.split("=")[0] ?? "", "--pathspec-from-file"),
	);
}

function checkoutLoss(
	args: readonly string[],
	isTreeish: Treeish,
): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-b", "-B", "--orphan"]);
	const [first, ...rest] = plain;
	const hasSource =
		first !== undefined && (dashed !== undefined || isTreeish(first));
	const pathspecs = readsPathspecFile(args)
		? WHOLE_TREE
		: (dashed ?? (hasSource ? rest : plain));
	if (pathspecs.length > 0)
		return { lost: hasSource ? "tracked" : "unstaged", pathspecs };
	return hasFlag(flags, "--force", "f")
		? {
				lost: "tracked",
				pathspecs: WHOLE_TREE,
				...(hasSource && first !== undefined ? { target: first } : {}),
			}
		: undefined;
}

function switchLoss(
	args: readonly string[],
	isTreeish: Treeish,
): WorkLoss | undefined {
	const { flags, plain } = operands(args, ["-c", "-C", "--orphan"]);
	const [first] = plain;
	return hasFlag(flags, "--force", "f") ||
		flags.some((flag) => isLongForm(flag, "--discard-changes"))
		? {
				lost: "tracked",
				pathspecs: WHOLE_TREE,
				...(first !== undefined && isTreeish(first) ? { target: first } : {}),
			}
		: undefined;
}

function restoreLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-s", "--source"]);
	const staged = hasFlag(flags, "--staged", "S");
	const worktree = !staged || hasFlag(flags, "--worktree", "W");
	const pathspecs = readsPathspecFile(args)
		? WHOLE_TREE
		: [...plain, ...(dashed ?? [])];
	return worktree && pathspecs.length > 0
		? { lost: staged ? "tracked" : "unstaged", pathspecs }
		: undefined;
}

interface CleanOperands {
	readonly flags: readonly string[];
	readonly pathspecs: readonly string[];
	readonly excludes: readonly string[];
}

function cleanOperands(args: readonly string[]): CleanOperands {
	const flags: string[] = [];
	const pathspecs: string[] = [];
	const excludes: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		const cluster = /^-([A-Za-z]*?)e(.*)$/.exec(arg);
		const [name = "", value] = arg.split(/=(.*)/s);
		if (arg === "--") {
			pathspecs.push(...args.slice(i + 1));
			break;
		} else if (isLongForm(name, "--exclude") && value !== undefined) {
			excludes.push(value);
		} else if (isLongForm(arg, "--exclude")) {
			i++;
			excludes.push(args[i] ?? "");
		} else if (cluster && !arg.startsWith("--")) {
			if (cluster[1]) flags.push(`-${cluster[1]}`);
			if (cluster[2]) excludes.push(cluster[2]);
			else {
				i++;
				excludes.push(args[i] ?? "");
			}
		} else if (arg.startsWith("-")) flags.push(arg);
		else pathspecs.push(arg);
	}
	return { flags, pathspecs, excludes };
}

function cleanLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags, pathspecs, excludes } = cleanOperands(args);
	const removesUntracked =
		(hasFlag(flags, "--force", "f") || hasFlag(flags, "--interactive", "i")) &&
		!dryRun(flags) &&
		!hasFlag(flags, "-X", "X");
	return removesUntracked
		? {
				lost: "untracked",
				pathspecs: pathspecs.length > 0 ? pathspecs : ["."],
				excludes,
				keepsUntrackedFolders:
					pathspecs.length === 0 && !hasFlag(flags, "-d", "d"),
				removesNestedRepos: letterCount(flags, "--force", "f") >= 2,
			}
		: undefined;
}

function resetLoss(
	args: readonly string[],
	isTreeish: Treeish,
): WorkLoss | undefined {
	if (!args.some((arg) => isLongForm(arg, "--hard"))) return undefined;
	const [first] = operands(args, []).plain;
	return {
		lost: "tracked",
		pathspecs: WHOLE_TREE,
		...(first !== undefined && isTreeish(first) ? { target: first } : {}),
	};
}

const STDIN_FILE = /^\/(?:dev\/stdin|dev\/fd\/\d+|proc\/self\/fd\/\d+)$/;

function applyLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-p", "-C", "--directory"]);
	const long = (name: string) => flags.some((flag) => isLongForm(flag, name));
	const indexOnly = long("--cached") && !long("--index");
	const patches = [...plain, ...(dashed ?? [])].filter(
		(patch) => !STDIN_FILE.test(patch),
	);
	return hasFlag(flags, "--reverse", "R") && !indexOnly && patches.length === 0
		? { lost: "tracked", pathspecs: WHOLE_TREE }
		: undefined;
}

function readTreeLoss(args: readonly string[]): WorkLoss | undefined {
	return args.includes("-u") && args.includes("--reset")
		? { lost: "tracked", pathspecs: WHOLE_TREE }
		: undefined;
}

function checkoutIndexLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags } = operands(args, ["--stage"]);
	return hasFlag(flags, "--force", "f") &&
		hasFlag(flags, "--all", "a") &&
		!flags.some((flag) => isLongForm(flag.split("=")[0] ?? "", "--prefix"))
		? { lost: "tracked", pathspecs: WHOLE_TREE }
		: undefined;
}

export function workLoss(
	git: GitInvocation,
	isTreeish: Treeish,
): WorkLoss | undefined {
	switch (git.sub) {
		case "apply":
			return applyLoss(git.args);
		case "read-tree":
			return readTreeLoss(git.args);
		case "checkout-index":
			return checkoutIndexLoss(git.args);
		case "reset":
			return resetLoss(git.args, isTreeish);
		case "checkout":
			return checkoutLoss(git.args, isTreeish);
		case "switch":
			return switchLoss(git.args, isTreeish);
		case "restore":
			return restoreLoss(git.args);
		case "clean":
			return cleanLoss(git.args);
		default:
			return undefined;
	}
}

function isLost(lost: LostChange, index: string, worktree: string): boolean {
	const untracked = index === "?";
	switch (lost) {
		case "untracked":
			return untracked;
		case "tracked":
			return !untracked;
		case "unstaged":
			return !untracked && worktree !== " ";
	}
}

function changedPaths(
	git: GitPorts,
	dir: string,
	loss: WorkLoss,
): readonly string[] {
	const status = git.gitRun(dir, [
		...READ_ONLY_GIT,
		"status",
		"--porcelain=v1",
		"-z",
		loss.keepsUntrackedFolders
			? "--untracked-files=normal"
			: "--untracked-files=all",
		"--",
		...loss.pathspecs,
	]);
	if (!status.ok) return [];
	const entries = status.stdout.toString("utf8").split("\0");
	const paths: string[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i] ?? "";
		if (entry.length < 4) continue;
		const index = entry.charAt(0);
		const path = entry.slice(3);
		const keptFolder =
			path.endsWith("/") &&
			(loss.keepsUntrackedFolders === true || !loss.removesNestedRepos);
		if (isLost(loss.lost, index, entry.charAt(1)) && !keptFolder)
			paths.push(path);
		if (index === "R" || index === "C") i++;
	}
	return paths;
}

const GLOB_CHARACTER = /[*?[\\]/;
const PATHSPEC_MAGIC = /^:(?!\/[^/!^:])/;

function isLiteral(pathspec: string): boolean {
	return !GLOB_CHARACTER.test(pathspec) && !PATHSPEC_MAGIC.test(pathspec);
}

function rootRelative(
	files: FilePorts,
	pathspec: string,
	dir: string,
	root: string,
): string {
	return pathspec.startsWith(":/")
		? pathspec.slice(2).replace(/\/+$/, "")
		: files.relativePath(root, resolve(dir, pathspec));
}

function excludedPaths(
	git: GitPorts,
	dir: string,
	loss: WorkLoss,
): ReadonlySet<string> {
	const patterns = loss.excludes ?? [];
	if (patterns.length === 0) return new Set();
	const listed = git.gitRun(dir, [
		...READ_ONLY_GIT,
		"ls-files",
		"--others",
		"--ignored",
		"--full-name",
		"-z",
		...patterns.map((pattern) => `--exclude=${pattern}`),
		"--",
		...loss.pathspecs,
	]);
	if (!listed.ok) return new Set();
	return new Set(listed.stdout.toString("utf8").split("\0").filter(Boolean));
}

function overwrittenPaths(
	git: GitPorts,
	dir: string,
	target: string,
): readonly string[] {
	const untracked = new Set(
		changedPaths(git, dir, { lost: "untracked", pathspecs: WHOLE_TREE }),
	);
	if (untracked.size === 0) return [];
	const listed = git.gitRun(dir, [
		...READ_ONLY_GIT,
		"ls-tree",
		"-r",
		"--name-only",
		"-z",
		"--full-tree",
		target,
	]);
	if (!listed.ok) return [...untracked];
	return listed.stdout
		.toString("utf8")
		.split("\0")
		.filter((path) => untracked.has(path));
}

type SessionRepoTest = (root: string) => boolean;

const NO_SESSION_REPO: SessionRepoTest = () => false;

function lostPaths(
	ports: Ports,
	loss: WorkLoss,
	dir: string,
	sessionRepo: SessionRepoTest,
): readonly string[] {
	const { files, git } = ports;
	const root = git.gitRoot(dir);
	if (root === undefined) return [];
	const namedFiles = loss.pathspecs
		.filter(isLiteral)
		.map((pathspec) => rootRelative(files, pathspec, dir, root));
	const excluded = excludedPaths(git, dir, loss);
	const overwritten =
		loss.target === undefined ? [] : overwrittenPaths(git, dir, loss.target);
	const changed = [...changedPaths(git, dir, loss), ...overwritten];
	const session =
		(changed.length > 0 || loss.reachesNestedRepos === true) &&
		sessionRepo(root);
	const nested =
		session && loss.reachesNestedRepos === true
			? changedPaths(git, dir, {
					lost: "untracked",
					pathspecs: loss.pathspecs,
					removesNestedRepos: true,
				}).filter(
					(path) => path.endsWith("/") && extractionReaches(git, root, path),
				)
			: [];
	const lost = [...changed, ...nested].filter(
		(path) => !namedFiles.includes(path) && !excluded.has(path),
	);
	return session
		? lost.filter((path) => inUnboundRepo(files, root, path, sessionRepo))
		: lost;
}

function inUnboundRepo(
	files: FilePorts,
	root: string,
	path: string,
	sessionRepo: SessionRepoTest,
): boolean {
	const parts = path.replace(/\/$/, "").split("/");
	return parts.some((_, at) => {
		const folder = join(root, ...parts.slice(0, at + 1));
		return isRepoRoot(files, folder) && !sessionRepo(folder);
	});
}

function extractionReaches(
	git: GitPorts,
	root: string,
	nested: string,
): boolean {
	const path = nested.replace(/\/$/, "");
	const folder = `${path.toLowerCase()}/`;
	const held = git.gitRun(root, [
		...READ_ONLY_GIT,
		"ls-tree",
		"-r",
		"--name-only",
		"-z",
		"HEAD",
	]);
	const status = git.gitRun(join(root, path), [
		...READ_ONLY_GIT,
		"status",
		"--porcelain=v1",
		"-z",
		"--ignored",
	]);
	return (
		!held.ok ||
		held.stdout
			.toString("utf8")
			.split("\0")
			.some((tracked) => `${tracked.toLowerCase()}/`.startsWith(folder)) ||
		!status.ok ||
		status.stdout.length > 0
	);
}

function isRepoRoot(files: FilePorts, path: string): boolean {
	const kind = files.pathKind(path);
	if (kind === "unreadable") return true;
	return (
		kind === "directory" && files.pathKind(join(path, ".git")) !== "missing"
	);
}

const RECURSING_VERBS = new Set([
	"checkout",
	"read-tree",
	"reset",
	"restore",
	"switch",
]);

function hasSubmodules(git: GitPorts, dir: string): boolean {
	const staged = git.gitRun(dir, [
		...READ_ONLY_GIT,
		"ls-files",
		"--stage",
		"-z",
	]);
	return (
		!staged.ok ||
		staged.stdout
			.toString("utf8")
			.split("\0")
			.some((entry) => entry.startsWith("160000 "))
	);
}

function recursesSubmodules(ports: Ports, git: GitInvocation): boolean {
	return RECURSING_VERBS.has(git.sub) && hasSubmodules(ports.git, git.dir);
}

function workLossReasons(
	step: ShellStep,
	git: GitInvocation,
	shell: ShellState,
): readonly string[] {
	const loss = workLoss(git, treeishIn(shell.ports.git, git.dir));
	return loss === undefined
		? []
		: lossReasons(
				shell.ports,
				step.values.join(" "),
				loss,
				git.dir,
				(root) =>
					shell.sessionRepo(root) && !recursesSubmodules(shell.ports, git),
			);
}

const TAR_LIST = /^(?:--list|-[A-Za-z]*t[A-Za-z]*|[A-Za-z]*t[A-Za-z]*)$/;
const TAR_EXTRACT =
	/^(?:--extract|--get|-[A-Za-z]*x[A-Za-z]*|[A-Za-z]*x[A-Za-z]*)$/;

function tarExtracts(step: ShellStep): boolean {
	const [program, ...args] = step.words;
	if (program === undefined || basename(program.value) !== "tar") return false;
	const lists = args.some((arg, at) =>
		at === 0
			? TAR_LIST.test(arg.value)
			: /^(?:--list|-[A-Za-z]*t)/.test(arg.value),
	);
	return (
		!lists ||
		step.env.length > 0 ||
		args.some((arg) => arg.dynamic || TAR_EXTRACT.test(arg.value))
	);
}

const TAR_HERE =
	/^(?:-|-?[fkmopvx]+|--(?:extract|get|verbose|keep-old-files|file(?:=-)?))$/;

function archivesHead(step: ShellStep, tar: ShellStep): boolean {
	return (
		step.env.length === 0 &&
		step.dir === tar.dir &&
		step.words.every((word) => !word.dynamic) &&
		step.values.join(" ") === "git archive HEAD"
	);
}

function extractsHere(step: ShellStep): boolean {
	return (
		step.env.length === 0 &&
		step.words.slice(1).every((word) => TAR_HERE.test(word.value))
	);
}

function statusFails(git: GitPorts, dir: string): boolean {
	return (
		git.gitRoot(dir) !== undefined &&
		!git.gitRun(dir, [...READ_ONLY_GIT, "status", "--porcelain=v1", "-z"]).ok
	);
}

function extractReasons(
	step: ShellStep,
	previous: ShellStep | undefined,
	shell: ShellState,
): readonly string[] {
	if (step.simple.piped !== true || previous === undefined) return [];
	const source = readGit(previous);
	if (
		source.kind !== "plain" ||
		source.git.sub !== "archive" ||
		!tarExtracts(step)
	)
		return [];
	const command = `${previous.values.join(" ")} | ${step.values.join(" ")}`;
	if (statusFails(shell.ports.git, step.dir))
		return [
			`${command} extracts files, and git status fails in ${step.dir}, so astack cannot see the uncommitted changes that it discards. ${OWNER_GATE}`,
		];
	const exempt = extractsHere(step) && archivesHead(previous, step);
	return lossReasons(
		shell.ports,
		command,
		{ lost: "tracked", pathspecs: WHOLE_TREE, reachesNestedRepos: exempt },
		step.dir,
		exempt ? shell.sessionRepo : NO_SESSION_REPO,
	);
}

function lossReasons(
	ports: Ports,
	command: string,
	loss: WorkLoss,
	dir: string,
	sessionRepo: SessionRepoTest,
): readonly string[] {
	const lost = lostPaths(ports, loss, dir, sessionRepo);
	if (lost.length === 0) return [];
	const effect =
		loss.lost === "untracked"
			? "deletes the untracked files"
			: "discards the uncommitted changes in";
	const more = lost.length > 3 ? ` and ${lost.length - 3} more` : "";
	return [
		`${command} ${effect} ${lost.slice(0, 3).join(", ")}${more}. ${OWNER_GATE}`,
	];
}

const SKIP_NAME = /^(?:HUSKY|LEFTHOOK)(?:=|$)/i;
const SKIP_VARIABLE = /^(?:HUSKY|LEFTHOOK)=(?:0|false)$/i;
const CONFIG_NAME = /^GIT_CONFIG(?:_\w+)?(?==|$)/;
const INCLUDE_KEY = /^include(?:if\..*)?\.path$/i;
const PUSHES_UNRECORDED = ["--all", "--branches", "--mirror", "--tags"];
const PUSH_VALUE_FLAGS = [
	"-o",
	"--exec",
	"--push-option",
	"--receive-pack",
	"--repo",
];

type ShellState = {
	readonly exported: readonly Word[];
	readonly env: Env;
	readonly sessionRepo: SessionRepoTest;
	readonly ports: Ports;
};

function isSkipVariable(word: Word): boolean {
	return (
		SKIP_NAME.test(word.value) &&
		(word.dynamic ||
			!word.value.includes("=") ||
			SKIP_VARIABLE.test(word.value))
	);
}

type EnvConfig = {
	readonly words: readonly Word[];
	readonly settings: readonly string[];
	readonly unread: boolean;
};

function envConfig(env: readonly Word[]): EnvConfig {
	const words = env.filter((word) => CONFIG_NAME.test(word.value));
	const latest = new Map<string, Word>();
	for (const word of words)
		latest.set(CONFIG_NAME.exec(word.value)?.[0] ?? "", word);
	const value = (name: string): string | undefined => {
		const word = latest.get(name);
		return word === undefined || word.dynamic || !word.value.includes("=")
			? undefined
			: word.value.slice(name.length + 1);
	};
	const count = value("GIT_CONFIG_COUNT");
	const pairs = count !== undefined && /^\d+$/.test(count) ? Number(count) : -1;
	const read = new Set(["GIT_CONFIG_COUNT"]);
	const settings: string[] = [];
	for (let at = 0; at < pairs && at * 2 < latest.size; at++) {
		const key = value(`GIT_CONFIG_KEY_${at}`);
		const setting = value(`GIT_CONFIG_VALUE_${at}`);
		if (key === undefined || setting === undefined) break;
		settings.push(`${key}=${setting}`);
		read.add(`GIT_CONFIG_KEY_${at}`).add(`GIT_CONFIG_VALUE_${at}`);
	}
	return {
		words,
		settings,
		unread:
			words.length > 0 &&
			(settings.length !== pairs ||
				[...latest.keys()].some((name) => !read.has(name))),
	};
}

const HOOK_NAMES = [
	"applypatch-msg",
	"commit-msg",
	"fsmonitor-watchman",
	"p4-changelist",
	"p4-post-changelist",
	"p4-pre-submit",
	"p4-prepare-changelist",
	"post-applypatch",
	"post-checkout",
	"post-commit",
	"post-index-change",
	"post-merge",
	"post-receive",
	"post-rewrite",
	"post-update",
	"pre-applypatch",
	"pre-auto-gc",
	"pre-commit",
	"pre-merge-commit",
	"pre-push",
	"pre-rebase",
	"pre-receive",
	"prepare-commit-msg",
	"proc-receive",
	"push-to-checkout",
	"reference-transaction",
	"sendemail-validate",
	"update",
];

type ActiveHooks = { readonly dir: string; readonly names: readonly string[] };

function activeHooks(ports: Ports, root: string): ActiveHooks | undefined {
	const folder = ports.git.gitText(root, [
		...READ_ONLY_GIT,
		"rev-parse",
		"--git-path",
		"hooks",
	]);
	if (folder === undefined) return undefined;
	const dir = resolve(root, folder);
	return {
		dir,
		names: HOOK_NAMES.filter((name) =>
			ports.files.isExecutable(join(dir, name)),
		),
	};
}

const EXECUTABLE_BLOB = /^100755 blob ([0-9a-f]+)\t([\s\S]*)$/;

function headHooks(
	git: GitPorts,
	root: string,
	path: string,
): ReadonlyMap<string, string> {
	const prefix = path === "" ? "" : `${path}/`;
	const listed = git.gitRun(root, [
		...READ_ONLY_GIT,
		"ls-tree",
		"-z",
		"--full-tree",
		"HEAD",
		"--",
		...HOOK_NAMES.map((name) => `:(literal)${prefix}${name}`),
	]);
	if (!listed.ok) return new Map();
	return new Map(
		listed.stdout
			.toString("utf8")
			.split("\0")
			.flatMap((entry): [string, string][] => {
				const [, blob, tracked] = EXECUTABLE_BLOB.exec(entry) ?? [];
				const name = tracked?.slice(prefix.length);
				return blob !== undefined &&
					tracked === `${prefix}${name}` &&
					name !== undefined &&
					HOOK_NAMES.includes(name)
					? [[name, blob]]
					: [];
			}),
	);
}

function blobIds(
	git: GitPorts,
	root: string,
	files: readonly string[],
): readonly string[] {
	if (files.length === 0) return [];
	const hashed = git.gitText(root, [
		...READ_ONLY_GIT,
		"hash-object",
		"--no-filters",
		"--",
		...files,
	]);
	return hashed === undefined ? [] : hashed.split("\n");
}

function changedUnder(git: GitPorts, root: string, path: string): boolean {
	const status = git.gitRun(root, [
		...READ_ONLY_GIT,
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=all",
		"--ignored",
		"--",
		`:(literal)${path === "" ? "." : path}`,
	]);
	return !status.ok || status.stdout.length > 0;
}

function hooksFolder(
	files: FilePorts,
	root: string,
	folder: string,
): string | undefined {
	if (folder === "" || folder.split(/[\\/]/).includes("..")) return undefined;
	const top = files.realPath(root) ?? root;
	const real = files.realPath(resolve(root, folder));
	if (real === undefined || real !== resolve(top, folder)) return undefined;
	const path = relative(top, real);
	return path.startsWith("..") || isAbsolute(path) ? undefined : toPosix(path);
}

function tracksHooks(ports: Ports, dir: string, folder: string): boolean {
	const { files, git } = ports;
	const root = git.gitRoot(dir);
	const path =
		root === undefined ? undefined : hooksFolder(files, root, folder);
	const active = root === undefined ? undefined : activeHooks(ports, root);
	if (root === undefined || path === undefined || active === undefined)
		return false;
	if (files.realPath(active.dir) === files.realPath(join(root, path)))
		return true;
	const tracked = headHooks(git, root, path);
	if (tracked.size === 0 || changedUnder(git, root, path)) return false;
	const ids = blobIds(
		git,
		root,
		active.names.map((name) => join(active.dir, name)),
	);
	return (
		ids.length === active.names.length &&
		active.names.every((name, at) => tracked.get(name) === ids[at])
	);
}

function turnsHooksOff(ports: Ports, setting: string, dir: string): boolean {
	const at = setting.indexOf("=");
	const key = at < 0 ? setting : setting.slice(0, at);
	return (
		INCLUDE_KEY.test(key) ||
		(HOOKS_PATH_KEY.test(key) &&
			!tracksHooks(ports, dir, at < 0 ? "" : setting.slice(at + 1)))
	);
}

function noVerify(git: GitInvocation, flags: readonly string[]): boolean {
	return flags.some(
		(flag) =>
			isLongForm(flag, "--no-verify") ||
			(git.sub === "commit" && /^-[A-Za-z]*n[A-Za-z]*$/.test(flag)),
	);
}

function skipForm(
	step: ShellStep,
	git: GitInvocation,
	flags: readonly string[],
	shell: ShellState,
): string | undefined {
	if (noVerify(git, flags)) return `git ${git.sub} --no-verify`;
	const env = [...shell.exported, ...step.env];
	const config = envConfig(env);
	const turnsOff = (setting: string) =>
		turnsHooksOff(shell.ports, setting, git.dir);
	const fromEnv = config.unread || config.settings.some(turnsOff);
	const shown = [
		...env.filter(isSkipVariable),
		...(fromEnv ? config.words : []),
	].map((word) => word.value);
	return shown.length > 0 || git.config.some(turnsOff)
		? [...shown, ...step.values].join(" ")
		: undefined;
}

function recorded(spec: string, dir: string, shell: ShellState): boolean {
	const source = spec.replace(/^\+/, "").split(":")[0] ?? "";
	if (source === "") return false;
	const sha = shell.ports.git.gitText(dir, [
		"rev-parse",
		"--verify",
		"--quiet",
		`${source}^{commit}`,
	]);
	const record = sha === undefined ? undefined : loadGateRecord(shell.env, sha);
	const blobs =
		sha === undefined || record === undefined
			? undefined
			: profileBlobs(shell.ports.git, dir, sha, record.baseSha);
	return (
		record !== undefined &&
		blobs !== undefined &&
		sameProfile(record, blobs.source, blobs.base)
	);
}

function skipPushReasons(
	form: string,
	git: GitInvocation,
	refspecs: readonly string[],
	shell: ShellState,
): readonly string[] {
	const skips = `${form} skips the git hooks of the repo`;
	if (git.args.some((arg) => PUSHES_UNRECORDED.includes(arg)))
		return [
			`${skips}, and it pushes refs that astack gates run cannot record. ${OWNER_GATE}`,
		];
	const sources = refspecs.length === 0 ? ["HEAD"] : refspecs;
	const missing = sources.filter((spec) => !recorded(spec, git.dir, shell));
	return missing.length === 0
		? []
		: [
				`${skips}. astack gates run has no green record for ${missing.join(", ")}, so this is an owner gate. Ask the owner, or run astack gates run --base <ref> on a clean tree, then push again.`,
			];
}

function hooksPathReasons(
	step: ShellStep,
	git: GitInvocation,
	ports: Ports,
): readonly string[] {
	const { flags, plain } = operands(git.args, [
		"-f",
		"--blob",
		"--comment",
		"--default",
		"--file",
		"--type",
		"--value",
	]);
	const verbs = ["get", "list", "set", "unset"];
	const action = verbs.includes(plain[0] ?? "") ? plain[0] : undefined;
	const [key, value] = action === undefined ? plain : plain.slice(1);
	if (key === undefined || !(HOOKS_PATH_KEY.test(key) || INCLUDE_KEY.test(key)))
		return [];
	const unsets =
		action === "unset" || flags.some((flag) => /^--unset(?:-all)?$/.test(flag));
	const reads =
		action === "get" ||
		action === "list" ||
		flags.some((flag) => /^(?:--get|--list|-l)/.test(flag)) ||
		(!unsets && value === undefined);
	if (
		reads ||
		(!unsets &&
			value !== undefined &&
			HOOKS_PATH_KEY.test(key) &&
			tracksHooks(ports, git.dir, value))
	)
		return [];
	return [
		`${step.values.join(" ")} skips the git hooks of the repo. ${OWNER_GATE}`,
	];
}

function gitReasons(
	step: ShellStep,
	git: GitInvocation,
	shell: ShellState,
): readonly string[] {
	if (git.sub === "config") return hooksPathReasons(step, git, shell.ports);
	const flags = git.args.filter((arg) => arg.startsWith("-"));
	const form = skipForm(step, git, flags, shell);
	if (git.sub === "commit")
		return form === undefined
			? []
			: [`${form} skips the git hooks of the repo. ${OWNER_GATE}`];
	if (git.sub !== "push") return [];
	const refspecs = operands(git.args, PUSH_VALUE_FLAGS).plain.slice(1);
	const reasons: string[] =
		form === undefined ? [] : [...skipPushReasons(form, git, refspecs, shell)];
	const forced =
		flags.some(
			(flag) =>
				flag === "--force" ||
				flag.startsWith("--force-with-lease") ||
				flag === "--force-if-includes" ||
				/^-[A-Za-z]*f[A-Za-z]*$/.test(flag),
		) || refspecs.some((spec) => spec.startsWith("+"));
	if (!forced) return reasons;
	const shared = pushTargets(refspecs, git.dir, shell.ports.git).filter(
		(target) => SHARED_BRANCH.test(target),
	);
	if (shared.length > 0)
		reasons.push(
			`A force-push to the shared branch ${shared.join(", ")} rewrites the history of other people. ${OWNER_GATE}`,
		);
	return reasons;
}

const LOST_BY_VERB: ReadonlyMap<string, LostChange> = new Map([
	["apply", "tracked"],
	["checkout", "tracked"],
	["checkout-index", "tracked"],
	["clean", "untracked"],
	["read-tree", "tracked"],
	["reset", "tracked"],
	["restore", "tracked"],
	["switch", "tracked"],
]);

function shown(words: readonly Word[]): string {
	return words
		.map((word) => {
			if (!word.dynamic) return word.value;
			return word.value === "" ? "$(...)" : `$${word.value}`;
		})
		.join(" ");
}

function unreadableReasons(
	step: ShellStep,
	read: Extract<GitRead, { kind: "unreadable" }>,
	shell: ShellState,
): readonly string[] {
	const lost =
		read.verb === undefined ? undefined : LOST_BY_VERB.get(read.verb);
	if (
		lost !== undefined &&
		read.dir !== undefined &&
		lostPaths(
			shell.ports,
			{ lost, pathspecs: WHOLE_TREE },
			read.dir,
			shell.sessionRepo,
		).length === 0
	)
		return [];
	return [
		`astack cannot read ${shown(step.words)}, because ${read.cause}. Write the git command with static words, such as a branch name or HEAD in place of a variable. ${OWNER_GATE}`,
	];
}

function stepReasons(
	step: ShellStep,
	previous: ShellStep | undefined,
	shell: ShellState,
): readonly string[] {
	const read = readGit(step);
	switch (read.kind) {
		case "none":
			return [
				...supabaseReasons(step, shell.ports),
				...extractReasons(step, previous, shell),
			];
		case "unreadable":
			return [
				...supabaseReasons(step, shell.ports),
				...unreadableReasons(step, read, shell),
			];
		case "plain":
			return [
				...supabaseReasons(step, shell.ports),
				...gitReasons(step, read.git, shell),
				...workLossReasons(step, read.git, shell),
			];
	}
}

function isAllExport(option: string): boolean {
	return option.replaceAll("_", "").toLowerCase() === "allexport";
}

const ZSH_OPTIONS = /^options\[/;

function exportsVariables(step: ShellStep): boolean {
	const [name = "", ...args] = step.values;
	if (ZSH_OPTIONS.test(name)) return true;
	switch (name) {
		case "export":
			return true;
		case "declare":
		case "typeset":
			return args.some((arg) => /^-[A-Za-z]*x/.test(arg));
		case "set":
			return args.some(
				(arg, at) =>
					/^-[A-Za-z]*a/.test(arg) ||
					(arg === "-o" && isAllExport(args[at + 1] ?? "")),
			);
		case "setopt":
		case "unsetopt":
			return true;
		default:
			return false;
	}
}

function exportedWords(steps: readonly ShellStep[], index: number): Word[] {
	const earlier = steps.slice(0, index);
	const forms = earlier.filter(exportsVariables);
	if (forms.length === 0) return [];
	const hookWord = (word: Word) =>
		SKIP_NAME.test(word.value) || CONFIG_NAME.test(word.value);
	return [
		...forms.flatMap((step) => step.words.slice(1).filter(hookWord)),
		...earlier
			.filter((step) => step.words.length === 0)
			.flatMap((step) => step.env.filter(hookWord)),
	];
}

function placedLine(steps: readonly ShellStep[], env: Env): boolean {
	return (
		Object.entries(env).some(
			([key, value]) =>
				value !== undefined && isPlaceVariable({ value: key, dynamic: false }),
		) || steps.some(movesPlace)
	);
}

function sessionRepoTest(
	repos: SessionRepos,
	placed: boolean,
	ports: Ports,
): SessionRepoTest {
	return placed ? NO_SESSION_REPO : (root) => isSessionRepo(repos, root, ports);
}

const GATE_READERS = new Set([
	"cat",
	"cmp",
	"diff",
	"grep",
	"head",
	"jq",
	"ls",
	"md5",
	"md5sum",
	"sha1sum",
	"sha256sum",
	"shasum",
	"stat",
	"tail",
	"wc",
]);
function readsOnly(step: ShellStep): boolean {
	const [program, ...args] = step.words;
	if (program === undefined || program.dynamic) return false;
	return (
		GATE_READERS.has(program.value) &&
		args.every(
			(arg) =>
				!arg.dynamic &&
				arg.expands !== true &&
				arg.splits !== true &&
				!arg.value.includes("\\"),
		)
	);
}

type RecordFolder = {
	readonly path: string;
	readonly name: string;
	readonly writer: string;
};

function recordFolders(env: Env, files: FilePorts): readonly RecordFolder[] {
	const state = stateDir(env);
	return state === undefined
		? []
		: [
				{
					path: realFile(files.realPath, join(state, "gates")),
					name: "gate record folder",
					writer: "astack gates run writes a gate record",
				},
				{
					path: realFile(files.realPath, join(state, "session-repos")),
					name: "session repo record folder",
					writer: "the destructive hook writes a session repo record",
				},
			];
}

function inFolder(files: FilePorts, folder: string, path: string): boolean {
	const inside = relative(folder, realFile(files.realPath, path));
	return inside === "" || (!inside.startsWith("..") && !isAbsolute(inside));
}

function folderReason(what: string, folder: RecordFolder): string {
	return `${what} writes into the ${folder.name} ${folder.path}, and only ${folder.writer}. ${OWNER_GATE}`;
}

const GLOB_START = /[*?[{]/;

function globFolder(text: string): string {
	const head = text.slice(0, Math.max(0, text.search(GLOB_START)));
	return head.slice(0, head.lastIndexOf("/") + 1) || ".";
}

function wordPaths(step: ShellStep, word: Word, env: Env): readonly string[] {
	if (word.dynamic) return [];
	const home = (text: string) =>
		env.HOME && (text === "~" || text.startsWith("~/"))
			? join(env.HOME, text.slice(1))
			: text;
	const texts = [
		word.value,
		word.value.slice(word.value.indexOf("=") + 1),
	].filter((text) => text !== "");
	return [
		...texts,
		...(word.expands === true ? texts.map(globFolder) : []),
	].map((text) => resolve(step.dir, home(text)));
}

function outputTargets(step: ShellStep): readonly Word[] {
	return step.simple.redirects
		.filter((redirect) => redirect.op.includes(">"))
		.map((redirect) => redirect.target);
}

function isGit(word: Word | undefined): boolean {
	return word !== undefined && !word.dynamic && word.value === "git";
}

function reaches(files: FilePorts, folder: string, path: string): boolean {
	return (
		inFolder(files, folder, path) ||
		inFolder(files, realFile(files.realPath, path), folder)
	);
}

const STATE_VARIABLE =
	/\$(?:\{(HOME|XDG_STATE_HOME|ASTACK_STATE_DIR)\}|(HOME|XDG_STATE_HOME|ASTACK_STATE_DIR)(?!\w))/g;
const PLAIN_PATH = /^[\w./@+-]+$/;

function expandStateVariables(command: string, env: Env): string {
	return command.replace(
		STATE_VARIABLE,
		(match, braced: string | undefined, bare: string | undefined) => {
			const value = env[braced ?? bare ?? ""];
			return value !== undefined && PLAIN_PATH.test(value) ? value : match;
		},
	);
}

function namesRecordFolder(
	command: string,
	env: Env,
	files: FilePorts,
): boolean {
	const state = stateDir(env);
	return (
		/gates|session-repos/i.test(command) ||
		(state !== undefined &&
			(command.includes(state) ||
				command.includes(files.realPath(state) ?? state)))
	);
}

const SCRIPT_FLAG = /^(?:-[A-Za-z]*[ce]|--eval|--command)$/;

function recordFolderReasons(
	command: string,
	cwd: string,
	folders: readonly RecordFolder[],
	env: Env,
	files: FilePorts,
): readonly string[] {
	if (folders.length === 0) return [];
	const expanded = expandStateVariables(command, env);
	const names = namesRecordFolder(expanded, env, files);
	return shellSteps(expanded, cwd).flatMap((step) => {
		const reads = readsOnly(step);
		const words = [...outputTargets(step), ...(reads ? [] : step.words)];
		const runsScript =
			!reads &&
			!isGit(step.words[0]) &&
			step.words.slice(1).some((word) => SCRIPT_FLAG.test(word.value));
		if (names && (runsScript || words.some((word) => word.dynamic)))
			return [
				`astack cannot read where ${shown(step.words)} writes. The command names a record folder of astack, the gate record folder or the session repo record folder. ${OWNER_GATE}`,
			];
		return folders.flatMap((folder) =>
			words.some((word) =>
				wordPaths(step, word, env).some((path) =>
					reaches(files, folder.path, path),
				),
			)
				? [folderReason(shown(step.words), folder)]
				: [],
		);
	});
}

function touchesRepo(
	steps: readonly ShellStep[],
	root: string,
	env: Env,
	files: FilePorts,
): boolean {
	const folder = realFile(files.realPath, root);
	const inside = (path: string) => inFolder(files, folder, path);
	return steps.some((step) => {
		const [program, ...args] = step.words;
		const targets = outputTargets(step);
		if (program === undefined || (readsOnly(step) && targets.length === 0))
			return false;
		const unknown = step.unreadable === "folder";
		const here = unknown || inside(step.dir);
		if (
			here &&
			(program.dynamic || (step.unreadable !== undefined && !unknown))
		)
			return true;
		if (isGit(program)) return false;
		const words = [...args, ...targets];
		const paths = words.flatMap((word) =>
			wordPaths(step, word, env).filter(
				(path) => !basename(path).startsWith("-"),
			),
		);
		return (
			(here || paths.some(inside)) &&
			(unknown
				? words.length > 0
				: words.some((word) => word.dynamic) ||
					paths.some((path) => !inside(path)))
		);
	});
}

export const handler = defineHandler({
	id: "destructive",
	on: ["shell", "write", "edit"],
	run: (event, context) => {
		const { ports } = context;
		const folders = recordFolders(context.env, ports.files);
		if (event.kind !== "shell")
			return denial(
				folders
					.filter((folder) =>
						inFolder(
							ports.files,
							folder.path,
							resolve(context.cwd, event.path),
						),
					)
					.map((folder) =>
						folderReason(
							`A ${event.kind === "write" ? "Write" : "Edit"} call to ${event.path}`,
							folder,
						),
					),
			);
		const records = denial(
			recordFolderReasons(
				event.command,
				event.cwd,
				folders,
				context.env,
				ports.files,
			),
		);
		const steps = shellSteps(event.command, event.cwd);
		const settled = settledRepos(context.env, context.session, ports);
		const repos = settled.filter(
			(repo) => !touchesRepo(steps, repo.path, context.env, ports.files),
		);
		if (repos.length !== settled.length)
			saveSessionRepos(context.env, context.session, repos);
		if (
			!/\b(?:supabase|git|npm|pnpm|yarn|bun|gates|session-repos)\b/i.test(
				event.command,
			)
		)
			return records;
		const placed = placedLine(steps, context.env);
		const sessionRepo = sessionRepoTest(repos, placed, ports);
		const verdict = combineAll([
			...steps.map((step, index) =>
				denial(
					stepReasons(step, steps[index - 1], {
						exported: exportedWords(steps, index),
						env: context.env,
						sessionRepo,
						ports,
					}),
				),
			),
			records,
		]);
		if (verdict.kind !== "deny" && !placed)
			rememberRepos(
				context.env,
				context.session,
				repos,
				steps.flatMap((step) => {
					const target = madeRepoTarget(step);
					return target === undefined ||
						touchesRepo(steps, target, context.env, ports.files)
						? []
						: [target];
				}),
				ports.files,
			);
		return verdict;
	},
});
