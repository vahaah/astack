import { relative, resolve } from "node:path";
import { type ChangeSources, type Pathspec, repoRoot } from "./git.ts";
import { canonical, toPosix } from "./paths.ts";

export interface GitInvocation {
	sub: string;
	args: string[];
	dir: string;
}

export function gitInvocation(
	values: string[],
	dir: string,
): GitInvocation | undefined {
	let cwd = dir;
	for (let i = 1; i < values.length; i++) {
		const value = values[i] ?? "";
		if (value === "-C") {
			cwd = resolve(cwd, values[i + 1] ?? "");
			i++;
		} else if (
			["-c", "--git-dir", "--work-tree", "--namespace"].includes(value)
		) {
			i++;
		} else if (!value.startsWith("-")) {
			return { sub: value, args: values.slice(i + 1), dir: cwd };
		}
	}
	return undefined;
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
