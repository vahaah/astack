import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { loadGateRecord } from "../../gates.ts";
import { repoRoot, runGit } from "../../git.ts";
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
import {
	canonical,
	canonicalRelative,
	readOptional,
	toPosix,
} from "../../paths.ts";
import {
	isSessionRepo,
	rememberRepos,
	type SessionRepos,
	settledRepos,
} from "../../session-repos.ts";
import { type ShellStep, shellSteps, type Word } from "../../shell.ts";
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
const READ_ONLY_GIT = ["--no-optional-locks", "-c", "core.fsmonitor=false"];

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
	readonly excludes?: readonly string[];
	readonly keepsUntrackedFolders?: boolean;
	readonly removesNestedRepos?: boolean;
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

function isTreeish(dir: string, name: string): boolean {
	return runGit(dir, ["rev-parse", "--verify", "--quiet", `${name}^{tree}`]).ok;
}

function readsPathspecFile(args: readonly string[]): boolean {
	return args.some((arg) =>
		isLongForm(arg.split("=")[0] ?? "", "--pathspec-from-file"),
	);
}

function checkoutLoss(
	args: readonly string[],
	dir: string,
): WorkLoss | undefined {
	const { flags, plain, dashed } = operands(args, ["-b", "-B", "--orphan"]);
	const [first, ...rest] = plain;
	const hasSource =
		first !== undefined && (dashed !== undefined || isTreeish(dir, first));
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
	dir: string,
): WorkLoss | undefined {
	const { flags, plain } = operands(args, ["-c", "-C", "--orphan"]);
	const [first] = plain;
	return hasFlag(flags, "--force", "f") ||
		flags.some((flag) => isLongForm(flag, "--discard-changes"))
		? {
				lost: "tracked",
				pathspecs: WHOLE_TREE,
				...(first !== undefined && isTreeish(dir, first)
					? { target: first }
					: {}),
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

function resetLoss(args: readonly string[], dir: string): WorkLoss | undefined {
	if (!args.some((arg) => isLongForm(arg, "--hard"))) return undefined;
	const [first] = operands(args, []).plain;
	return {
		lost: "tracked",
		pathspecs: WHOLE_TREE,
		...(first !== undefined && isTreeish(dir, first) ? { target: first } : {}),
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

function workLoss(git: GitInvocation): WorkLoss | undefined {
	switch (git.sub) {
		case "apply":
			return applyLoss(git.args);
		case "read-tree":
			return readTreeLoss(git.args);
		case "checkout-index":
			return checkoutIndexLoss(git.args);
		case "reset":
			return resetLoss(git.args, git.dir);
		case "checkout":
			return checkoutLoss(git.args, git.dir);
		case "switch":
			return switchLoss(git.args, git.dir);
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

function rootRelative(pathspec: string, dir: string, root: string): string {
	return pathspec.startsWith(":/")
		? pathspec.slice(2).replace(/\/+$/, "")
		: canonicalRelative(root, resolve(dir, pathspec));
}

function excludedPaths(dir: string, loss: WorkLoss): ReadonlySet<string> {
	const patterns = loss.excludes ?? [];
	if (patterns.length === 0) return new Set();
	const listed = runGit(dir, [
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

function overwrittenPaths(dir: string, target: string): readonly string[] {
	const untracked = new Set(
		changedPaths(dir, { lost: "untracked", pathspecs: WHOLE_TREE }),
	);
	if (untracked.size === 0) return [];
	const listed = runGit(dir, [
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

function lostPaths(
	loss: WorkLoss,
	dir: string,
	sessionRepo: SessionRepoTest,
): readonly string[] {
	const root = repoRoot(dir);
	if (root === undefined) return [];
	const namedFiles = loss.pathspecs
		.filter(isLiteral)
		.map((pathspec) => rootRelative(pathspec, dir, root));
	const excluded = excludedPaths(dir, loss);
	const overwritten =
		loss.target === undefined ? [] : overwrittenPaths(dir, loss.target);
	const lost = [...changedPaths(dir, loss), ...overwritten].filter(
		(path) => !namedFiles.includes(path) && !excluded.has(path),
	);
	return lost.length > 0 && sessionRepo(root)
		? lost.filter(
				(path) =>
					path.endsWith("/") && !sessionRepo(join(root, path.slice(0, -1))),
			)
		: lost;
}

function workLossReasons(
	step: ShellStep,
	git: GitInvocation,
	sessionRepo: SessionRepoTest,
): readonly string[] {
	const loss = workLoss(git);
	return loss === undefined
		? []
		: lossReasons(step.values.join(" "), loss, git.dir, sessionRepo);
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

function statusFails(dir: string): boolean {
	return (
		repoRoot(dir) !== undefined &&
		!runGit(dir, [...READ_ONLY_GIT, "status", "--porcelain=v1", "-z"]).ok
	);
}

function extractReasons(
	step: ShellStep,
	previous: ShellStep | undefined,
	sessionRepo: SessionRepoTest,
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
	if (statusFails(step.dir))
		return [
			`${command} extracts files, and git status fails in ${step.dir}, so astack cannot see the uncommitted changes that it discards. ${OWNER_GATE}`,
		];
	return lossReasons(
		command,
		{ lost: "tracked", pathspecs: WHOLE_TREE },
		step.dir,
		sessionRepo,
	);
}

function lossReasons(
	command: string,
	loss: WorkLoss,
	dir: string,
	sessionRepo: SessionRepoTest,
): readonly string[] {
	const lost = lostPaths(loss, dir, sessionRepo);
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

const SKIP_VARIABLE = /^(?:HUSKY|LEFTHOOK)=(?:0|false)$/i;
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
};

function isSkipVariable(word: Word): boolean {
	return !word.dynamic && SKIP_VARIABLE.test(word.value);
}

function gitText(dir: string, args: string[]): string | undefined {
	const result = runGit(dir, args);
	return result.ok ? result.stdout.toString("utf8").trim() : undefined;
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

function isExecutable(path: string): boolean {
	const stat = statSync(path, { throwIfNoEntry: false });
	return stat?.isFile() === true && (stat.mode & 0o111) !== 0;
}

function activeHooks(root: string): readonly string[] | undefined {
	const folder = gitText(root, [
		...READ_ONLY_GIT,
		"rev-parse",
		"--git-path",
		"hooks",
	]);
	if (folder === undefined) return undefined;
	const dir = resolve(root, folder);
	return HOOK_NAMES.filter((name) => isExecutable(join(dir, name)));
}

const EXECUTABLE_BLOB = /^100755 blob [0-9a-f]+\t([\s\S]*)$/;

function headHooks(root: string, path: string): ReadonlySet<string> {
	const prefix = path === "" ? "" : `${path}/`;
	const listed = runGit(root, [
		...READ_ONLY_GIT,
		"ls-tree",
		"-z",
		"--full-tree",
		"HEAD",
		"--",
		...HOOK_NAMES.map((name) => `:(literal)${prefix}${name}`),
	]);
	if (!listed.ok) return new Set();
	return new Set(
		listed.stdout
			.toString("utf8")
			.split("\0")
			.flatMap((entry) => {
				const tracked = EXECUTABLE_BLOB.exec(entry)?.[1];
				const name = tracked?.slice(prefix.length);
				return tracked === `${prefix}${name}` &&
					name !== undefined &&
					HOOK_NAMES.includes(name)
					? [name]
					: [];
			}),
	);
}

function realFolder(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

function hooksFolder(root: string, folder: string): string | undefined {
	if (folder === "" || folder.split(/[\\/]/).includes("..")) return undefined;
	const top = canonical(root);
	const real = realFolder(resolve(root, folder));
	if (real === undefined || real !== resolve(top, folder)) return undefined;
	const path = relative(top, real);
	return path.startsWith("..") || isAbsolute(path) ? undefined : toPosix(path);
}

function tracksHooks(dir: string, folder: string): boolean {
	const root = repoRoot(dir);
	const path = root === undefined ? undefined : hooksFolder(root, folder);
	const active = root === undefined ? undefined : activeHooks(root);
	if (root === undefined || path === undefined || active === undefined)
		return false;
	const tracked = headHooks(root, path);
	return tracked.size > 0 && active.every((name) => tracked.has(name));
}

function turnsHooksOff(setting: string, dir: string): boolean {
	const at = setting.indexOf("=");
	const key = at < 0 ? setting : setting.slice(0, at);
	return (
		HOOKS_PATH_KEY.test(key) &&
		!tracksHooks(dir, at < 0 ? "" : setting.slice(at + 1))
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
	const variables = [...shell.exported, ...step.env]
		.filter(isSkipVariable)
		.map((word) => word.value);
	return variables.length > 0 ||
		git.config.some((setting) => turnsHooksOff(setting, git.dir))
		? [...variables, ...step.values].join(" ")
		: undefined;
}

function recorded(spec: string, dir: string, env: Env): boolean {
	const source = spec.replace(/^\+/, "").split(":")[0] ?? "";
	if (source === "") return false;
	const sha = gitText(dir, [
		"rev-parse",
		"--verify",
		"--quiet",
		`${source}^{commit}`,
	]);
	return sha !== undefined && loadGateRecord(env, sha) !== undefined;
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
	const missing = sources.filter((spec) => !recorded(spec, git.dir, shell.env));
	return missing.length === 0
		? []
		: [
				`${skips}. astack gates run has no green record for ${missing.join(", ")}, so this is an owner gate. Ask the owner, or run astack gates run --base <ref> on a clean tree, then push again.`,
			];
}

function hooksPathReasons(
	step: ShellStep,
	git: GitInvocation,
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
	if (key === undefined || !HOOKS_PATH_KEY.test(key)) return [];
	const unsets =
		action === "unset" || flags.some((flag) => /^--unset(?:-all)?$/.test(flag));
	const reads =
		action === "get" ||
		action === "list" ||
		flags.some((flag) => /^(?:--get|--list|-l)/.test(flag)) ||
		(!unsets && value === undefined);
	if (reads || (!unsets && value !== undefined && tracksHooks(git.dir, value)))
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
	if (git.sub === "config") return hooksPathReasons(step, git);
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
	const shared = pushTargets(refspecs, git.dir).filter((target) =>
		SHARED_BRANCH.test(target),
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
	sessionRepo: SessionRepoTest,
): readonly string[] {
	const lost =
		read.verb === undefined ? undefined : LOST_BY_VERB.get(read.verb);
	if (
		lost !== undefined &&
		read.dir !== undefined &&
		lostPaths({ lost, pathspecs: WHOLE_TREE }, read.dir, sessionRepo).length ===
			0
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
				...supabaseReasons(step),
				...extractReasons(step, previous, shell.sessionRepo),
			];
		case "unreadable":
			return [
				...supabaseReasons(step),
				...unreadableReasons(step, read, shell.sessionRepo),
			];
		case "plain":
			return [
				...supabaseReasons(step),
				...gitReasons(step, read.git, shell),
				...workLossReasons(step, read.git, shell.sessionRepo),
			];
	}
}

function exportedSkips(steps: readonly ShellStep[], index: number): Word[] {
	return steps
		.slice(0, index)
		.filter((step) => step.values[0] === "export")
		.flatMap((step) => step.words.slice(1).filter(isSkipVariable));
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
): SessionRepoTest {
	return placed ? () => false : (root) => isSessionRepo(repos, root);
}

export const handler = defineHandler({
	id: "destructive",
	on: ["shell"],
	run: (event, context) => {
		const repos = settledRepos(context.env, context.session);
		if (!/\b(?:supabase|git|npm|pnpm|yarn|bun)\b/i.test(event.command))
			return ALLOW;
		const steps = shellSteps(event.command, event.cwd);
		const placed = placedLine(steps, context.env);
		const sessionRepo = sessionRepoTest(repos, placed);
		const verdict = combineAll(
			steps.map((step, index) =>
				denial(
					stepReasons(step, steps[index - 1], {
						exported: exportedSkips(steps, index),
						env: context.env,
						sessionRepo,
					}),
				),
			),
		);
		if (verdict.kind !== "deny" && !placed)
			rememberRepos(
				context.env,
				context.session,
				repos,
				steps.flatMap((step) => madeRepoTarget(step) ?? []),
			);
		return verdict;
	},
});
