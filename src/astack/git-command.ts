import { basename, relative, resolve } from "node:path";
import { type ChangeSources, type Pathspec, repoRoot } from "./git.ts";
import { canonical, toPosix } from "./paths.ts";
import type { ShellStep, Unreadable, Word } from "./shell.ts";

export interface GitInvocation {
	sub: string;
	args: string[];
	dir: string;
}

type GitWords = {
	readonly sub: Word;
	readonly args: readonly Word[];
	readonly dir: string;
	readonly dynamicPlace: boolean;
};

const PLACE_FLAGS = ["-c", "--git-dir", "--work-tree", "--namespace"];

function gitWords(words: readonly Word[], dir: string): GitWords | undefined {
	const [program, ...rest] = words;
	if (program === undefined || basename(program.value) !== "git")
		return undefined;
	let cwd = dir;
	let dynamicPlace = false;
	for (let i = 0; i < rest.length; i++) {
		const word = rest[i];
		if (word === undefined) break;
		const next = rest[i + 1];
		if (word.value === "-C" || PLACE_FLAGS.includes(word.value)) {
			dynamicPlace ||= word.dynamic || next?.dynamic === true;
			if (word.value === "-C") cwd = resolve(cwd, next?.value ?? "");
			i++;
		} else if (word.value.startsWith("-")) {
			dynamicPlace ||= word.dynamic;
		} else {
			return { sub: word, args: rest.slice(i + 1), dir: cwd, dynamicPlace };
		}
	}
	return undefined;
}

function invocationOf(git: GitWords): GitInvocation {
	return {
		sub: git.sub.value,
		args: git.args.map((word) => word.value),
		dir: git.dir,
	};
}

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
	"checkout",
	"clean",
	"commit",
	"push",
	"reset",
	"restore",
	"switch",
]);

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
	["checkout", ["-b", "-B", "--orphan"]],
	["clean", ["-e", "--exclude"]],
	["commit", [...COMMIT_VALUE_FLAGS]],
	["push", ["-o", "--push-option"]],
	["restore", ["-s", "--source"]],
	["switch", ["-c", "-C", "--orphan", "--create", "--force-create"]],
]);

const CAUSES: Readonly<Record<Unreadable, string>> = {
	folder: "an earlier cd goes to a folder that astack cannot read",
	depth: "it runs more than 4 levels deep in shell bodies",
	body: "a variable or a command substitution is in its shell body",
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
	const git = tokens.findIndex((token) => basename(token) === "git");
	if (git < 0 && step.unreadable !== "program") return undefined;
	return tokens.slice(git + 1).find((token) => GUARDED_VERBS.has(token));
}

function attachedValue(text: string, flag: string): boolean {
	return flag.startsWith("--")
		? text.startsWith(`${flag}=`)
		: text.startsWith(flag) && text.length > flag.length;
}

function hasDynamicWord(sub: string, args: readonly Word[]): boolean {
	const valued = VERB_VALUE_FLAGS.get(sub) ?? [];
	for (let i = 0; i < args.length; i++) {
		const word = args[i];
		if (word === undefined) break;
		if (!word.dynamic) {
			if (valued.includes(word.value)) i++;
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
	if (step.unreadable !== undefined && step.unreadable !== "folder") {
		const verb = hiddenVerb(step);
		return verb === undefined
			? NONE
			: unreadable(verb, CAUSES[step.unreadable], step.dir);
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
	if (!GUARDED_VERBS.has(verb))
		return { kind: "plain", git: invocationOf(git) };
	if (step.unreadable === "folder")
		return unreadable(verb, CAUSES.folder, undefined);
	if (git.dynamicPlace)
		return unreadable(
			verb,
			"a variable or a command substitution gives the -C, -c, --git-dir or --work-tree value",
			git.dir,
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
