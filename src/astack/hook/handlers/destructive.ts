import { join } from "node:path";
import { repoRoot, runGit } from "../../git.ts";
import { gitInvocation } from "../../git-command.ts";
import { readOptional } from "../../paths.ts";
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
				denial([...supabaseReasons(step), ...gitReasons(step)]),
			),
		);
	},
});
