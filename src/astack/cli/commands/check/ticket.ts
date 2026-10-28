import { repoRoot } from "../../../git.ts";
import {
	detectTicketKind,
	emailAddresses,
	issueTemplateFor,
	issueTemplates,
	type Template,
	type TicketKind,
	templateSource,
	ticketStandard,
} from "../../../headings.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";
import { bodyArgs, pickTemplate, readInput, reportGaps } from "./body.ts";

function run(args: readonly string[], io: Io): number {
	const parsed = bodyArgs(args);
	if (!parsed)
		return usageError(io, "astack check-ticket: --template needs a name");
	const body = readInput(io, parsed.source);
	if (body === undefined)
		return usageError(
			io,
			"astack check-ticket: give a file path or - for stdin",
		);
	const kind: TicketKind = parsed.flags.has("--bug")
		? "bug"
		: parsed.flags.has("--feature")
			? "feature"
			: detectTicketKind({ body });
	const root = repoRoot(io.cwd);
	let template: Template | undefined;
	if (parsed.template) {
		const picked = pickTemplate(
			io,
			"astack check-ticket",
			root ? issueTemplates(root) : [],
			parsed.template,
		);
		if (typeof picked === "number") return picked;
		template = picked;
	} else if (!parsed.flags.has("--no-template"))
		template = issueTemplateFor(root, kind);
	for (const email of emailAddresses(body))
		io.out(`warning: email address ${email}\n`);
	const sources = [ticketStandard(kind)];
	if (template) sources.push(templateSource(template));
	return reportGaps(io, body, `${kind} ticket`, sources);
}

export const command: Command = {
	name: "ticket",
	summary:
		"Checks the headings of a ticket body, plus the headings of the repo issue template that fits it.",
	usage:
		"check ticket <file|-> [--bug | --feature] [--template <name> | --no-template]",
	run,
};
