import {
	bodyText,
	ghBody,
	ghFlags,
	ghRepoPrefix,
	inputString,
	isGh,
} from "../../gh.ts";
import { originSlug, repoRoot, runGit } from "../../git.ts";
import {
	duplicateReasons,
	type ListOpenPrs,
	listOpenPrsWithGh,
	type NewPr,
} from "../../pr/open.ts";
import {
	loadSessionPrs,
	saveSessionPrs,
	sessionStore,
} from "../../pr/session-prs.ts";
import { sessionReasons, splitInstructionIn } from "../../pr/split.ts";
import { type ShellStep, shellSteps } from "../../shell.ts";
import { stagedReader } from "../body-reader.ts";
import {
	ALLOW,
	type Context,
	combineAll,
	defineHandler,
	deny,
	type EventOf,
	type Handler,
	projectDirOf,
	type Verdict,
} from "../events.ts";

type Draft = {
	readonly head: string | undefined;
	readonly body: string | undefined;
	readonly base: string | undefined;
	readonly repo: string | undefined;
};

function flagValue(
	step: ShellStep,
	names: readonly string[],
): string | undefined {
	const words = step.words.slice(3);
	for (let index = 0; index < words.length; index++) {
		const value = words[index]?.value ?? "";
		if (names.includes(value)) return words[index + 1]?.value;
		const long = names.find((name) => value.startsWith(`${name}=`));
		if (long !== undefined) return value.slice(long.length + 1);
	}
	return undefined;
}

function gitLine(dir: string, args: string[]): string | undefined {
	const result = runGit(dir, args);
	const line = result.ok ? result.stdout.toString("utf8").trim() : "";
	return line === "" ? undefined : line;
}

function currentBranch(dir: string): string | undefined {
	const branch = gitLine(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	return branch === "HEAD" ? undefined : branch;
}

function defaultBase(dir: string): string {
	const remote = gitLine(dir, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	return remote?.replace(/^origin\//, "") ?? "";
}

function newPr(draft: Draft, dir: string): NewPr {
	const root = repoRoot(dir) ?? dir;
	return {
		head: draft.head,
		body: draft.body,
		base: draft.base ?? defaultBase(dir),
		repo: (draft.repo ?? originSlug(root) ?? "").toLowerCase(),
		root,
	};
}

function verdictOf(
	subject: string,
	draft: Draft,
	dir: string,
	list: ListOpenPrs,
	context: Context,
): Verdict {
	if (draft.head === undefined && draft.body === undefined) return ALLOW;
	const open = list(dir, draft.repo);
	if (!open) return ALLOW;
	const pr = newPr(draft, dir);
	const store = sessionStore(context.env, context.session);
	const record = loadSessionPrs(store);
	const reasons = [
		...duplicateReasons(pr, open),
		...sessionReasons(pr, record, open),
	];
	if (reasons.length === 0) {
		if (pr.head !== undefined)
			saveSessionPrs(
				{
					split: record.split,
					opens: [
						...record.opens,
						{ root: pr.root, repo: pr.repo, base: pr.base, head: pr.head },
					],
				},
				store,
			);
		return ALLOW;
	}
	return deny(
		[
			`astack blocked ${subject}, because one plan is one PR:`,
			...reasons.map((reason) => `- ${reason}`),
			"Open a second PR only when the owner says so.",
		].join("\n"),
	);
}

function shellVerdict(
	event: EventOf<"shell">,
	context: Context,
	list: ListOpenPrs,
): Verdict {
	if (!/\bgh\b/.test(event.command)) return ALLOW;
	const steps = shellSteps(event.command, event.cwd);
	return combineAll(
		steps.flatMap((step, at) => {
			if (!isGh(step.values, "pr", "create")) return [];
			const flags = ghFlags(step.words.slice(3));
			const body = bodyText(
				ghBody(flags, step.simple, step.dir, stagedReader(steps, at)),
			);
			return [
				verdictOf(
					"gh pr create",
					{
						head: flagValue(step, ["-H", "--head"]) ?? currentBranch(step.dir),
						body,
						base: flagValue(step, ["-B", "--base"]),
						repo: flags.repo ?? ghRepoPrefix(step.env) ?? context.env.GH_REPO,
					},
					step.dir,
					list,
					context,
				),
			];
		}),
	);
}

function isMcpCreate(event: EventOf<"mcp">): boolean {
	if (/github/i.test(event.server) && event.tool === "create_pull_request")
		return true;
	return /create/i.test(event.tool) && /pull_?request/i.test(event.tool);
}

function mcpVerdict(
	event: EventOf<"mcp">,
	context: Context,
	list: ListOpenPrs,
): Verdict {
	if (!isMcpCreate(event)) return ALLOW;
	const dir = projectDirOf(context);
	const owner = inputString(event.input, "owner");
	const repo = inputString(event.input, "repo");
	return verdictOf(
		event.tool,
		{
			head: inputString(event.input, "head") ?? currentBranch(dir),
			body: inputString(event.input, "body"),
			base: inputString(event.input, "base"),
			repo: owner && repo ? `${owner}/${repo}` : undefined,
		},
		dir,
		list,
		context,
	);
}

function promptVerdict(event: EventOf<"prompt">, context: Context): Verdict {
	if (!event.human) return ALLOW;
	const store = sessionStore(context.env, event.session);
	const record = loadSessionPrs(store);
	const split = splitInstructionIn(event.text);
	if (split !== record.split)
		saveSessionPrs({ split, opens: record.opens }, store);
	return ALLOW;
}

export function duplicatePr(list: ListOpenPrs): Handler {
	return defineHandler({
		id: "duplicate-pr",
		on: ["prompt", "shell", "mcp"],
		run: (event, context) => {
			switch (event.kind) {
				case "prompt":
					return promptVerdict(event, context);
				case "shell":
					return shellVerdict(event, context, list);
				case "mcp":
					return mcpVerdict(event, context, list);
			}
		},
	});
}

export const handler = duplicatePr(listOpenPrsWithGh);
