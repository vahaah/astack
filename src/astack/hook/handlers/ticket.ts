import { bodyText, foreignRepo, ghBody, ghFlags, isGh } from "../../gh.ts";
import {
	detectTicketKind,
	emailAddresses,
	type HeadingGap,
	headingAdvice,
	headingDeny,
	issueHeadings,
	missingHeadings,
	personalDataNote,
	TICKET_HEADINGS,
	ticketFooter,
} from "../../headings.ts";
import type { Ports } from "../../ports.ts";
import { type ShellStep, shellSteps } from "../../shell.ts";
import { stagedReader } from "../body-reader.ts";
import {
	ALLOW,
	combineAll,
	defineHandler,
	deny,
	type EventOf,
	note,
	type Verdict,
} from "../events.ts";

const SUBJECT = "gh issue create";

function notesVerdict(notes: readonly string[]): Verdict {
	return notes.length > 0 ? note(notes.join("\n\n")) : ALLOW;
}

function issueCreateVerdict(
	steps: readonly ShellStep[],
	at: number,
	ports: Ports,
): Verdict {
	const step = steps[at];
	if (step === undefined) return ALLOW;
	const flags = ghFlags(step.words.slice(3));
	if (flags.skip) return ALLOW;
	const body = bodyText(
		ghBody(flags, step.simple, step.dir, stagedReader(steps, at, ports.files)),
	);
	if (body === undefined) return ALLOW;
	const kind = detectTicketKind({
		title: flags.title,
		labels: flags.labels,
		body,
	});
	const root = ports.git.gitRoot(step.dir);
	const source = issueHeadings(ports.files, root, kind);
	const missing = missingHeadings(body, source.headings);
	const gap: HeadingGap | undefined =
		missing.length > 0
			? {
					missing,
					source: source.source,
					headings: source.headings,
					footer: ticketFooter(kind),
				}
			: undefined;
	const emails = emailAddresses(`${flags.title ?? ""}\n${body}`);
	const notes = emails.length > 0 ? [personalDataNote(emails)] : [];
	const foreign = foreignRepo(
		flags.repo,
		root === undefined ? undefined : ports.git.gitOrigin(root),
	);
	if (gap && foreign)
		return notesVerdict([headingAdvice(SUBJECT, gap, foreign), ...notes]);
	if (gap) return deny([headingDeny(SUBJECT, gap), ...notes].join("\n\n"));
	return notesVerdict(notes);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldsOf(value: unknown): Fields {
	return isFields(value) ? value : {};
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

const LINEAR_TOOL = /linear/i;
const LINEAR_ISSUE_WRITE = /(?:save|create|update)_issue$/;

function linearVerdict(event: EventOf<"mcp">): Verdict {
	const toolName = `mcp__${event.server}__${event.tool}`;
	if (!LINEAR_TOOL.test(toolName) || !LINEAR_ISSUE_WRITE.test(toolName))
		return ALLOW;
	const input = fieldsOf(event.input);
	const update = /update_issue/.test(toolName) || Boolean(text(input.id));
	const body =
		text(input.description) ?? text(input.body) ?? text(input.content);
	const title = text(input.title) ?? "";
	const labels = [...strings(input.labels), ...strings(input.addLabels)];
	const patchText = Array.isArray(input.patch)
		? input.patch
				.flatMap((op) => [
					text(fieldsOf(op).new_string),
					text(fieldsOf(op).text),
				])
				.filter(Boolean)
		: [];
	const notes: string[] = [];
	const emails = emailAddresses([title, body ?? "", ...patchText].join("\n"));
	if (emails.length > 0) notes.push(personalDataNote(emails));
	const fromTemplate =
		!update &&
		(body === undefined || body.trim() === "") &&
		Boolean(text(input.template));
	if (!fromTemplate && (body !== undefined || !update)) {
		const kind = detectTicketKind({ title, labels, body: body ?? "" });
		const required = TICKET_HEADINGS[kind];
		const missing = missingHeadings(body ?? "", required);
		if (missing.length > 0 && !update) {
			const denial = headingDeny(`this new ${kind} issue`, {
				missing,
				source: `the ${kind} ticket standard`,
				headings: required,
				footer: ticketFooter(kind),
			});
			return deny([denial, ...notes].join("\n\n"));
		}
		if (missing.length > 0)
			notes.unshift(
				`astack: this ${kind} issue update leaves out ${missing.join(", ")}. A complete ${kind} ticket has: ${required.join(", ")}. The astack:write-ticket skill has the template.`,
			);
	}
	return notesVerdict(notes);
}

export const handler = defineHandler({
	id: "ticket",
	on: ["shell", "mcp"],
	run: (event, context) => {
		switch (event.kind) {
			case "shell": {
				if (!/\bgh\b/.test(event.command)) return ALLOW;
				const steps = shellSteps(event.command, event.cwd);
				return combineAll(
					steps.flatMap((step, at) =>
						isGh(step.values, "issue", "create")
							? [issueCreateVerdict(steps, at, context.ports)]
							: [],
					),
				);
			}
			case "mcp":
				return linearVerdict(event);
		}
	},
});
