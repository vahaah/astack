import { basename, relative, resolve } from "node:path";
import { type ChangeSources, type Pathspec, repoRoot } from "./git.ts";
import { canonical, toPosix } from "./paths.ts";
import type { ShellStep, Unreadable, Word } from "./shell.ts";

export interface GitInvocation {
	sub: string;
	args: string[];
	dir: string;
	config: string[];
}

type GitWords = {
	readonly sub: Word;
	readonly args: readonly Word[];
	readonly dir: string;
	readonly config: readonly string[];
	readonly dynamicPlace: boolean;
	readonly movesRepo: boolean;
};

const CONFIG_ENV = "--config-env";
const REPO_FLAGS = ["--git-dir", "--work-tree"];
const PLACE_FLAGS = ["-c", CONFIG_ENV, ...REPO_FLAGS, "--namespace"];
const WORK_TREE_KEY = /^core\.worktree$/i;
const PLACE_NAME =
	"GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|CONFIG_PARAMETERS|CONFIG_COUNT)";
const PLACE_VARIABLE = new RegExp(`^${PLACE_NAME}(?:=|$)`);
const PLACE_MENTION = new RegExp(`(?:^|\\W)${PLACE_NAME}(?:\\W|$)`);
const SHELL_STATE = new Set([
	".",
	"alias",
	"declare",
	"emulate",
	"eval",
	"float",
	"integer",
	"local",
	"readonly",
	"set",
	"setopt",
	"source",
	"typeset",
	"unsetopt",
]);

export function isLongForm(flag: string, long: string): boolean {
	return (
		flag === long ||
		(long.startsWith("--") && flag.length >= 4 && long.startsWith(flag))
	);
}

function configKey(spec: string): string {
	const at = spec.indexOf("=");
	return at < 0 ? spec : spec.slice(0, at);
}

function gitWords(words: readonly Word[], dir: string): GitWords | undefined {
	const [program, ...rest] = words;
	if (program === undefined || basename(program.value) !== "git")
		return undefined;
	let cwd = dir;
	let dynamicPlace = false;
	let repoFlag = false;
	const config: string[] = [];
	for (let i = 0; i < rest.length; i++) {
		const word = rest[i];
		if (word === undefined) break;
		const next = rest[i + 1];
		if (word.value === "-C" || PLACE_FLAGS.includes(word.value)) {
			dynamicPlace ||= word.dynamic || next?.dynamic === true;
			repoFlag ||= REPO_FLAGS.includes(word.value);
			if (word.value === "-C") cwd = resolve(cwd, next?.value ?? "");
			if (word.value === "-c") config.push(next?.value ?? "");
			if (word.value === CONFIG_ENV) config.push(configKey(next?.value ?? ""));
			i++;
		} else if (word.value.startsWith(`${CONFIG_ENV}=`)) {
			dynamicPlace ||= word.dynamic;
			config.push(configKey(word.value.slice(CONFIG_ENV.length + 1)));
		} else if (word.value.startsWith("-")) {
			dynamicPlace ||= word.dynamic;
			repoFlag ||= REPO_FLAGS.some((flag) => word.value.startsWith(`${flag}=`));
		} else {
			return {
				sub: word,
				args: rest.slice(i + 1),
				dir: cwd,
				config,
				dynamicPlace,
				movesRepo:
					repoFlag ||
					config.some((setting) => WORK_TREE_KEY.test(configKey(setting))),
			};
		}
	}
	return undefined;
}

export function isPlaceVariable(word: Word): boolean {
	return PLACE_VARIABLE.test(word.value);
}

export function hasPlaceForm(step: ShellStep): boolean {
	const git = gitWords(step.words, step.dir);
	return (
		step.env.some(isPlaceVariable) ||
		git?.movesRepo === true ||
		git?.dynamicPlace === true
	);
}

function unreadWord(word: Word): boolean {
	return word.dynamic || word.expands === true || word.value.includes("\\");
}

export function movesPlace(step: ShellStep): boolean {
	const program = step.words[0];
	return (
		hasPlaceForm(step) ||
		(program !== undefined && SHELL_STATE.has(program.value)) ||
		[...step.env, ...step.words].some(
			(word) => unreadWord(word) || PLACE_MENTION.test(word.value),
		)
	);
}

const NO_OWN_GIT_DIR = ["--bare", "--mirror", "--separate-git-dir"];
const INIT_VALUE_FLAGS = [
	"-b",
	"--initial-branch",
	"--object-format",
	"--ref-format",
	"--separate-git-dir",
	"--template",
];
const CLONE_VALUE_FLAGS = [
	"-b",
	"-c",
	"-j",
	"-o",
	"-u",
	"--branch",
	"--bundle-uri",
	"--config",
	"--depth",
	"--filter",
	"--jobs",
	"--origin",
	"--ref-format",
	"--reference",
	"--reference-if-able",
	"--revision",
	"--separate-git-dir",
	"--server-option",
	"--shallow-exclude",
	"--shallow-since",
	"--template",
	"--upload-pack",
];
const WORKTREE_ADD_VALUE_FLAGS = ["-b", "-B", "--reason"];

function takesValue(text: string, valued: readonly string[]): boolean {
	return (
		valued.some((flag) => flag.startsWith("--") && isLongForm(text, flag)) ||
		takesNextWord(text, valued)
	);
}

function targetOperands(
	args: readonly Word[],
	valued: readonly string[],
): readonly string[] | undefined {
	if (args.some((word) => word.dynamic)) return undefined;
	const plain: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const text = args[i]?.value ?? "";
		if (text === "--")
			return [...plain, ...args.slice(i + 1).map((word) => word.value)];
		if (!text.startsWith("-")) plain.push(text);
		else if (NO_OWN_GIT_DIR.some((flag) => isLongForm(configKey(text), flag)))
			return undefined;
		else if (!text.includes("=") && takesValue(text, valued)) i++;
	}
	return plain;
}

function cloneFolder(url: string): string | undefined {
	const scheme = url.indexOf("://");
	const from = scheme < 0 ? 0 : scheme + 3;
	const slash = url.indexOf("/", from);
	const user = url.lastIndexOf("@", slash < 0 ? url.length : slash);
	let rest = url.slice(Math.max(from, user + 1)).replace(/[\s/]+$/, "");
	if (rest.length > 5 && rest.endsWith("/.git"))
		rest = rest.slice(0, -5).replace(/\/+$/, "");
	if (!rest.includes("/")) rest = rest.replace(/:\d*$/, "");
	const name = rest
		.slice(Math.max(rest.lastIndexOf("/"), rest.lastIndexOf(":")) + 1)
		.replace(/\.git$/, "");
	return name === "" ? undefined : name;
}

function madeFolder(verb: string, args: readonly Word[]): string | undefined {
	switch (verb) {
		case "init": {
			const plain = targetOperands(args, INIT_VALUE_FLAGS);
			return plain === undefined ? undefined : (plain[0] ?? ".");
		}
		case "clone": {
			const [url, folder] = targetOperands(args, CLONE_VALUE_FLAGS) ?? [];
			return folder ?? (url === undefined ? undefined : cloneFolder(url));
		}
		case "worktree": {
			const [add, ...rest] = args;
			return add?.value === "add" && !add.dynamic
				? targetOperands(rest, WORKTREE_ADD_VALUE_FLAGS)?.[0]
				: undefined;
		}
		default:
			return undefined;
	}
}

export function madeRepoTarget(step: ShellStep): string | undefined {
	const git = gitWords(step.words, step.dir);
	if (
		git === undefined ||
		git.sub.dynamic ||
		step.unreadable !== undefined ||
		hasPlaceForm(step)
	)
		return undefined;
	const folder = madeFolder(git.sub.value, git.args);
	return folder === undefined ? undefined : resolve(git.dir, folder);
}

function invocationOf(git: GitWords): GitInvocation {
	return {
		sub: git.sub.value,
		args: git.args.map((word) => word.value),
		dir: git.dir,
		config: [...git.config],
	};
}

export const HOOKS_PATH_KEY = /^core\.hookspath$/i;

export function gitInvocation(
	values: string[],
	dir: string,
): GitInvocation | undefined {
	const git = gitWords(
		values.map((value) => ({ value, dynamic: false })),
		dir,
	);
	return git === undefined ? undefined : invocationOf(git);
}

const GUARDED_VERBS = new Set([
	"apply",
	"checkout",
	"checkout-index",
	"clean",
	"commit",
	"push",
	"read-tree",
	"reset",
	"restore",
	"switch",
]);

const REVERSE = /^(?:--reverse|-[A-Za-z]*R[A-Za-z]*)$/;

function guarded(verb: string, args: readonly Word[]): boolean {
	if (verb === "apply")
		return args.some((word) => !word.dynamic && REVERSE.test(word.value));
	if (verb === "config")
		return args.some(
			(word) => !word.dynamic && HOOKS_PATH_KEY.test(word.value),
		);
	return GUARDED_VERBS.has(verb);
}

const COMMIT_VALUE_FLAGS = new Set([
	"-m",
	"-F",
	"-C",
	"-c",
	"-t",
	"--message",
	"--file",
	"--author",
	"--date",
	"--template",
	"--reuse-message",
	"--reedit-message",
	"--fixup",
	"--squash",
	"--trailer",
	"--cleanup",
]);

const VERB_VALUE_FLAGS: ReadonlyMap<string, readonly string[]> = new Map([
	["apply", ["-p", "-C", "--directory", "--exclude", "--include"]],
	["checkout", ["-b", "-B", "--orphan"]],
	["checkout-index", ["--prefix", "--stage"]],
	[
		"config",
		["-f", "--blob", "--comment", "--default", "--file", "--type", "--value"],
	],
	["clean", ["-e", "--exclude"]],
	["commit", [...COMMIT_VALUE_FLAGS]],
	["push", ["-o", "--push-option"]],
	["read-tree", ["--prefix", "--index-output"]],
	["restore", ["-s", "--source"]],
	["switch", ["-c", "-C", "--orphan", "--create", "--force-create"]],
]);

const CAUSES: Readonly<Record<Unreadable, string>> = {
	folder: "an earlier cd goes to a folder that astack cannot read",
	depth: "it runs more than 4 levels deep in shell bodies",
	body: "a variable or a command substitution is in its shell body",
	stdin:
		"the shell reads its script from a pipe or a heredoc that astack cannot read",
	wrapper: "a wrapper before it has a flag that astack does not know",
	program: "a variable gives the program",
};

export type GitRead =
	| { readonly kind: "none" }
	| { readonly kind: "plain"; readonly git: GitInvocation }
	| {
			readonly kind: "unreadable";
			readonly verb: string | undefined;
			readonly cause: string;
			readonly dir: string | undefined;
	  };

const NONE: GitRead = { kind: "none" };

function hiddenVerb(step: ShellStep): string | undefined {
	const tokens = [...step.values, ...(step.simple.substitutions ?? [])]
		.flatMap((value) => value.split(/\s+/))
		.filter(Boolean);
	const hooksPath = tokens.some((token) => HOOKS_PATH_KEY.test(token));
	return tokens.find(
		(token) => GUARDED_VERBS.has(token) || (token === "config" && hooksPath),
	);
}

function attachedValue(text: string, flag: string): boolean {
	return flag.startsWith("--")
		? text.startsWith(`${flag}=`)
		: text.startsWith(flag) && text.length > flag.length;
}

function takesNextWord(text: string, valued: readonly string[]): boolean {
	if (valued.includes(text)) return true;
	if (!/^-[A-Za-z]{2,}$/.test(text)) return false;
	const at = [...text.slice(1)].findIndex((letter) =>
		valued.includes(`-${letter}`),
	);
	return at === text.length - 2;
}

function hasDynamicWord(sub: string, args: readonly Word[]): boolean {
	const valued = VERB_VALUE_FLAGS.get(sub) ?? [];
	for (let i = 0; i < args.length; i++) {
		const word = args[i];
		if (word === undefined) break;
		if (!word.dynamic) {
			if (takesNextWord(word.value, valued)) i++;
		} else if (!valued.some((flag) => attachedValue(word.value, flag)))
			return true;
	}
	return false;
}

function unreadable(
	verb: string | undefined,
	cause: string,
	dir: string | undefined,
): GitRead {
	return { kind: "unreadable", verb, cause, dir };
}

export function readGit(step: ShellStep): GitRead {
	if (step.unreadable === "stdin")
		return unreadable(undefined, CAUSES.stdin, undefined);
	if (step.unreadable !== undefined && step.unreadable !== "folder") {
		const verb = hiddenVerb(step);
		return verb === undefined
			? NONE
			: unreadable(verb, CAUSES[step.unreadable], undefined);
	}
	const git = gitWords(step.words, step.dir);
	if (git === undefined) return NONE;
	if (git.sub.dynamic)
		return unreadable(
			undefined,
			"a variable or a command substitution gives the git subcommand",
			git.dir,
		);
	const verb = git.sub.value;
	if (!guarded(verb, git.args))
		return { kind: "plain", git: invocationOf(git) };
	if (step.unreadable === "folder")
		return unreadable(verb, CAUSES.folder, undefined);
	if (git.dynamicPlace)
		return unreadable(
			verb,
			"a variable or a command substitution gives the -C, -c, --config-env, --git-dir or --work-tree value",
			undefined,
		);
	if (hasDynamicWord(verb, git.args))
		return unreadable(
			verb,
			`a variable or a command substitution gives a flag or an operand of git ${verb}`,
			git.dir,
		);
	return { kind: "plain", git: invocationOf(git) };
}

export interface CommitFlags {
	all: boolean;
	dryRun: boolean;
}

export function commitFlags(args: string[]): CommitFlags {
	const flags = { all: false, dryRun: false };
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (arg === "--") break;
		if (arg === "--all") flags.all = true;
		else if (arg === "--dry-run") flags.dryRun = true;
		else if (COMMIT_VALUE_FLAGS.has(arg)) i++;
		else if (/^-[A-Za-z]+$/.test(arg)) {
			for (let j = 1; j < arg.length; j++) {
				const letter = arg[j] ?? "";
				if (letter === "a") flags.all = true;
				if ("mFCct".includes(letter)) {
					if (j === arg.length - 1) i++;
					break;
				}
			}
		}
	}
	return flags;
}

export interface Staging {
	worktree: Pathspec | undefined;
	untracked: Pathspec | undefined;
	interactive: boolean;
}

export function mergeSpec(
	current: Pathspec | undefined,
	next: Pathspec,
): Pathspec {
	if (current === "all" || next === "all") return "all";
	return [...(current ?? []), ...next];
}

export function recordAdd(
	staging: Staging,
	args: string[],
	dir: string,
	root: string,
): void {
	const base = canonical(dir);
	let mode: "paths" | "all" | "tracked" = "paths";
	const paths: string[] = [];
	let literal = false;
	for (const arg of args) {
		if (!literal && arg === "--") literal = true;
		else if (
			!literal &&
			(arg === "-A" || arg === "--all" || arg === "--no-ignore-removal")
		)
			mode = "all";
		else if (!literal && (arg === "-u" || arg === "--update")) mode = "tracked";
		else if (
			!literal &&
			["-p", "--patch", "-i", "--interactive", "-e", "--edit"].includes(arg)
		)
			staging.interactive = true;
		else if (literal || !arg.startsWith("-"))
			paths.push(toPosix(relative(root, resolve(base, arg))) || ".");
	}
	if (mode === "all") {
		staging.worktree = "all";
		staging.untracked = "all";
	} else if (mode === "tracked") {
		staging.worktree = "all";
	} else if (paths.length > 0) {
		staging.worktree = mergeSpec(staging.worktree, paths);
		staging.untracked = mergeSpec(staging.untracked, paths);
	}
}

export function freshStaging(): Staging {
	return { worktree: undefined, untracked: undefined, interactive: false };
}

export interface CommitScope {
	readonly dir: string;
	readonly root: string;
	readonly sources: ChangeSources;
}

export function commitScopes(
	steps: readonly { readonly values: string[]; readonly dir: string }[],
): CommitScope[] {
	let staging = freshStaging();
	let indexStaged = true;
	const scopes: CommitScope[] = [];
	for (const step of steps) {
		if (step.values[0] !== "git") continue;
		const git = gitInvocation(step.values, step.dir);
		if (git?.sub === "add") {
			const root = repoRoot(git.dir);
			if (root) recordAdd(staging, git.args, git.dir, root);
			continue;
		}
		if (git?.sub !== "commit") continue;
		const flags = commitFlags(git.args);
		if (flags.dryRun) continue;
		const root = staging.interactive ? undefined : repoRoot(git.dir);
		if (root)
			scopes.push({
				dir: git.dir,
				root,
				sources: {
					staged: indexStaged,
					worktree: flags.all
						? mergeSpec(staging.worktree, "all")
						: staging.worktree,
					untracked: staging.untracked,
				},
			});
		staging = freshStaging();
		indexStaged = false;
	}
	return scopes;
}
