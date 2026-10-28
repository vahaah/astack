import { ghBody, ghFlags, isGh } from "../../gh.ts";
import { originSlug, repoRoot } from "../../git.ts";
import {
	headingAdvice,
	headingDeny,
	missingHeadings,
	prHeadings,
} from "../../headings.ts";
import { linkFindings } from "../../pr/links.ts";
import { loadPrProfile } from "../../pr/profile.ts";
import { type ShellStep, shellSteps } from "../../shell.ts";
import {
	ALLOW,
	type Context,
	combine,
	combineAll,
	defineHandler,
	deny,
	type EventOf,
	note,
	projectDirOf,
	type Verdict,
} from "../events.ts";

type PrText = {
	readonly subject: string;
	readonly create: boolean;
	readonly title: string | undefined;
	readonly body: string | undefined;
	readonly foreign: string | undefined;
	readonly root: string | undefined;
};

function headingVerdict(pr: PrText, body: string): Verdict {
	const source = prHeadings(pr.root);
	const missing = missingHeadings(body, source.headings);
	if (missing.length === 0) return ALLOW;
	const gap = {
		missing,
		source: source.source,
		headings: source.headings,
		footer: "The astack:write-docs skill has the PR body standard.",
	};
	return pr.foreign
		? note(headingAdvice(pr.subject, gap, pr.foreign))
		: deny(headingDeny(pr.subject, gap));
}

function linkVerdict(pr: PrText): Verdict {
	const requirePartOf =
		!pr.foreign &&
		pr.root !== undefined &&
		loadPrProfile(pr.root).requirePartOf;
	const findings = linkFindings(
		{ title: pr.title, body: pr.body },
		{ requirePartOf },
	);
	if (findings.length === 0) return ALLOW;
	return deny(
		[
			`astack blocked ${pr.subject}:`,
			...findings.map((finding) => `- ${finding}`),
			"The astack:write-docs skill has the PR link rules.",
		].join("\n"),
	);
}

function textVerdict(pr: PrText): Verdict {
	const links = linkVerdict(pr);
	if (!pr.create || pr.body === undefined) return links;
	return combine(headingVerdict(pr, pr.body), links);
}

function shellPr(step: ShellStep): PrText | undefined {
	const action = step.values[2] ?? "";
	const flags = ghFlags(step.words.slice(3));
	if (flags.skip) return undefined;
	return {
		subject: `gh pr ${action}`,
		create: action === "create",
		title: flags.title,
		body: ghBody(flags, step.simple, step.dir),
		foreign: flags.repo,
		root: repoRoot(step.dir),
	};
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(input: Fields, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" ? value : undefined;
}

const MCP_PR_TOOLS = new Set(["create_pull_request", "update_pull_request"]);

function mcpPr(event: EventOf<"mcp">, context: Context): PrText | undefined {
	if (!/github/i.test(event.server) || !MCP_PR_TOOLS.has(event.tool))
		return undefined;
	const input = isFields(event.input) ? event.input : {};
	const root = repoRoot(projectDirOf(context));
	const owner = field(input, "owner");
	const repo = field(input, "repo");
	const named =
		owner !== undefined && repo !== undefined
			? `${owner}/${repo}`.toLowerCase()
			: undefined;
	const local = root === undefined ? undefined : originSlug(root);
	return {
		subject: event.tool,
		create: event.tool === "create_pull_request",
		title: field(input, "title"),
		body: field(input, "body"),
		foreign: named !== undefined && named !== local ? named : undefined,
		root,
	};
}

export const handler = defineHandler({
	id: "pr-body",
	on: ["shell", "mcp"],
	run: (event, context) => {
		switch (event.kind) {
			case "mcp": {
				const pr = mcpPr(event, context);
				return pr ? textVerdict(pr) : ALLOW;
			}
			case "shell": {
				if (!/\bgh\b/.test(event.command)) return ALLOW;
				return combineAll(
					shellSteps(event.command, event.cwd)
						.filter(
							(step) =>
								isGh(step.values, "pr", "create") ||
								isGh(step.values, "pr", "edit"),
						)
						.flatMap((step) => {
							const pr = shellPr(step);
							return pr ? [textVerdict(pr)] : [];
						}),
				);
			}
		}
	},
});
