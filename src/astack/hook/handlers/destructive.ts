import { join, resolve } from "node:path";
import { repoRoot, runGit } from "../../git.ts";
import { type GitInvocation, gitInvocation } from "../../git-command.ts";
import { canonicalRelative, readOptional } from "../../paths.ts";
import { type ShellStep, shellSteps } from "../../shell.ts";
import {
	ALLOW,
	combineAll,
	defineHandler,
	deny,
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

function scriptText(dir: string, name: string): string | undefined {
	const root = repoRoot(dir) ?? dir;
	for (const base of [dir, root]) {
		const text = readOptional(join(base, "package.json"));
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

function supabaseReasons(step: ShellStep): readonly string[] {
	if (isReset(supabaseArgs(step.values)))
		return [`supabase db reset deletes the database data. ${OWNER_GATE}`];
	const name = scriptName(step.values);
	const script = name === undefined ? undefined : scriptText(step.dir, name);
	return script !== undefined &&
		/\bsupabase(?:\.[cm]?[jt]s)?\s+db\s+reset\b/.test(script)
		? [
				`The script ${name} runs supabase db reset, which deletes the database data. ${OWNER_GATE}`,
			]
		: [];
}

function currentBranch(dir: string): string | undefined {
	const result = runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const branch = result.ok ? result.stdout.toString("utf8").trim() : "";
	return branch === "" || branch === "HEAD" ? undefined : branch;
}

function pushTargets(
	refspecs: readonly string[],
	dir: string,
): readonly string[] {
	if (refspecs.length === 0) {
		const branch = currentBranch(dir);
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

type LostChange = "unstaged" | "tracked" | "untracked";

interface WorkLoss {
	readonly lost: LostChange;
	readonly pathspecs: readonly string[];
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
			flag === long || (/^-[A-Za-z]+$/.test(flag) && flag.includes(letter)),
	);
}

function isTreeish(dir: string, name: string): boolean {
	return runGit(dir, ["rev-parse", "--verify", "--quiet", `${name}^{tree}`]).ok;
}

function checkoutLoss(
	args: readonly string[],
	dir: string,
): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-b", "-B", "--orphan"]);
	const [first, ...rest] = plain;
	const hasSource =
		first !== undefined && (dashed !== undefined || isTreeish(dir, first));
	const pathspecs = dashed ?? (hasSource ? rest : plain);
	if (pathspecs.length > 0)
		return { lost: hasSource ? "tracked" : "unstaged", pathspecs };
	return hasFlag(flags, "--force", "f")
		? { lost: "tracked", pathspecs: WHOLE_TREE }
		: undefined;
}

function switchLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags } = operands(args, ["-c", "-C", "--orphan"]);
	return hasFlag(flags, "--force", "f") || flags.includes("--discard-changes")
		? { lost: "tracked", pathspecs: WHOLE_TREE }
		: undefined;
}

function restoreLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-s", "--source"]);
	const staged = hasFlag(flags, "--staged", "S");
	const worktree = !staged || hasFlag(flags, "--worktree", "W");
	const pathspecs = [...plain, ...(dashed ?? [])];
	return worktree && pathspecs.length > 0
		? { lost: staged ? "tracked" : "unstaged", pathspecs }
		: undefined;
}

function cleanLoss(args: readonly string[]): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-e", "--exclude"]);
	const removesUntracked =
		hasFlag(flags, "--force", "f") &&
		!hasFlag(flags, "--dry-run", "n") &&
		!hasFlag(flags, "-X", "X");
	const pathspecs = [...plain, ...(dashed ?? [])];
	return removesUntracked
		? { lost: "untracked", pathspecs: pathspecs.length > 0 ? pathspecs : ["."] }
		: undefined;
}

function workLoss(git: GitInvocation): WorkLoss | undefined {
	switch (git.sub) {
		case "reset":
			return git.args.includes("--hard")
				? { lost: "tracked", pathspecs: WHOLE_TREE }
				: undefined;
		case "checkout":
			return checkoutLoss(git.args, git.dir);
		case "switch":
			return switchLoss(git.args);
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

function changedPaths(dir: string, loss: WorkLoss): readonly string[] {
	const status = runGit(dir, [
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=all",
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
		if (isLost(loss.lost, index, entry.charAt(1))) paths.push(entry.slice(3));
		if (index === "R" || index === "C") i++;
	}
	return paths;
}

const GLOB_CHARACTER = /[*?[\\]/;
const PATHSPEC_MAGIC = /^:(?!\/[^/!^:])/;

function isLiteral(pathspec: string): boolean {
	return !GLOB_CHARACTER.test(pathspec) && !PATHSPEC_MAGIC.test(pathspec);
}

function rootRelative(pathspec: string, dir: string, root: string): string {
	return pathspec.startsWith(":/")
		? pathspec.slice(2).replace(/\/+$/, "")
		: canonicalRelative(root, resolve(dir, pathspec));
}

function lostPaths(loss: WorkLoss, dir: string): readonly string[] {
	const root = repoRoot(dir);
	if (root === undefined) return [];
	const namedFiles = loss.pathspecs
		.filter(isLiteral)
		.map((pathspec) => rootRelative(pathspec, dir, root));
	return changedPaths(dir, loss).filter((path) => !namedFiles.includes(path));
}

function workLossReasons(step: ShellStep): readonly string[] {
	const git = gitInvocation(step.values, step.dir);
	const loss = git === undefined ? undefined : workLoss(git);
	if (git === undefined || loss === undefined) return [];
	const lost = lostPaths(loss, git.dir);
	if (lost.length === 0) return [];
	const effect =
		loss.lost === "untracked"
			? "deletes the untracked files"
			: "discards the uncommitted changes in";
	const more = lost.length > 3 ? ` and ${lost.length - 3} more` : "";
	return [
		`${step.values.join(" ")} ${effect} ${lost.slice(0, 3).join(", ")}${more}. ${OWNER_GATE}`,
	];
}

function gitReasons(step: ShellStep): readonly string[] {
	const git = gitInvocation(step.values, step.dir);
	if (!git) return [];
	const flags = git.args.filter((arg) => arg.startsWith("-"));
	if (git.sub === "commit") {
		const noVerify = flags.some(
			(flag) => flag === "--no-verify" || /^-[A-Za-z]*n[A-Za-z]*$/.test(flag),
		);
		return noVerify
			? [
					`git commit --no-verify skips the git hooks of the repo. ${OWNER_GATE}`,
				]
			: [];
	}
	if (git.sub !== "push") return [];
	const reasons: string[] = [];
	if (flags.includes("--no-verify"))
		reasons.push(
			`git push --no-verify skips the git hooks of the repo. ${OWNER_GATE}`,
		);
	const plainArgs = git.args.filter((arg) => !arg.startsWith("-"));
	const refspecs = plainArgs.slice(1);
	const forced =
		flags.some(
			(flag) =>
				flag === "--force" ||
				flag.startsWith("--force-with-lease") ||
				flag === "--force-if-includes" ||
				/^-[A-Za-z]*f[A-Za-z]*$/.test(flag),
		) || refspecs.some((spec) => spec.startsWith("+"));
	if (!forced) return reasons;
	const shared = pushTargets(refspecs, git.dir).filter((target) =>
		SHARED_BRANCH.test(target),
	);
	if (shared.length > 0)
		reasons.push(
			`A force-push to the shared branch ${shared.join(", ")} rewrites the history of other people. ${OWNER_GATE}`,
		);
	return reasons;
}

export const handler = defineHandler({
	id: "destructive",
	on: ["shell"],
	run: (event) => {
		if (!/\b(?:supabase|git|npm|pnpm|yarn|bun)\b/.test(event.command))
			return ALLOW;
		return combineAll(
			shellSteps(event.command, event.cwd).map((step) =>
				denial([
					...supabaseReasons(step),
					...gitReasons(step),
					...workLossReasons(step),
				]),
			),
		);
	},
});
