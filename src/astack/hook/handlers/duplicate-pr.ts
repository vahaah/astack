import { ghBody, ghFlags, isGh } from "../../gh.ts";
import { runGit } from "../../git.ts";
import {
	duplicateReasons,
	type ListOpenPrs,
	listOpenPrsWithGh,
	type NewPr,
} from "../../pr/open.ts";
import { type ShellStep, shellSteps } from "../../shell.ts";
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

function headFlag(step: ShellStep): string | undefined {
	const words = step.words.slice(3);
	for (let index = 0; index < words.length; index++) {
		const value = words[index]?.value ?? "";
		if (value === "-H" || value === "--head") return words[index + 1]?.value;
		if (value.startsWith("--head=")) return value.slice("--head=".length);
	}
	return undefined;
}

function currentBranch(dir: string): string | undefined {
	const result = runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const branch = result.ok ? result.stdout.toString("utf8").trim() : "";
	return branch === "" || branch === "HEAD" ? undefined : branch;
}

function verdictOf(
	subject: string,
	pr: NewPr,
	dir: string,
	repo: string | undefined,
	list: ListOpenPrs,
): Verdict {
	if (pr.head === undefined && pr.body === undefined) return ALLOW;
	const open = list(dir, repo);
	if (!open) return ALLOW;
	const reasons = duplicateReasons(pr, open);
	if (reasons.length === 0) return ALLOW;
	return deny(
		[
			`astack blocked ${subject}, because one plan is one PR:`,
			...reasons.map((reason) => `- ${reason}`),
			"Open a second PR only when the owner says so.",
		].join("\n"),
	);
}

function shellVerdict(event: EventOf<"shell">, list: ListOpenPrs): Verdict {
	if (!/\bgh\b/.test(event.command)) return ALLOW;
	return combineAll(
		shellSteps(event.command, event.cwd)
			.filter((step) => isGh(step.values, "pr", "create"))
			.map((step) => {
				const flags = ghFlags(step.words.slice(3));
				const head = headFlag(step) ?? currentBranch(step.dir);
				return verdictOf(
					"gh pr create",
					{ head, body: ghBody(flags, step.simple, step.dir) },
					step.dir,
					flags.repo,
					list,
				);
			}),
	);
}

function field(input: unknown, key: string): string | undefined {
	if (typeof input !== "object" || input === null) return undefined;
	const value: unknown = Reflect.get(input, key);
	return typeof value === "string" ? value : undefined;
}

function mcpVerdict(
	event: EventOf<"mcp">,
	context: Context,
	list: ListOpenPrs,
): Verdict {
	if (!/github/i.test(event.server) || event.tool !== "create_pull_request")
		return ALLOW;
	const owner = field(event.input, "owner");
	const repo = field(event.input, "repo");
	return verdictOf(
		"create_pull_request",
		{ head: field(event.input, "head"), body: field(event.input, "body") },
		projectDirOf(context),
		owner && repo ? `${owner}/${repo}` : undefined,
		list,
	);
}

export function duplicatePr(list: ListOpenPrs): Handler {
	return defineHandler({
		id: "duplicate-pr",
		on: ["shell", "mcp"],
		run: (event, context) => {
			switch (event.kind) {
				case "shell":
					return shellVerdict(event, list);
				case "mcp":
					return mcpVerdict(event, context, list);
			}
		},
	});
}

export const handler = duplicatePr(listOpenPrsWithGh);
