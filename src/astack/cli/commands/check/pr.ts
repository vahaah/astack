import { repoRoot } from "../../../git.ts";
import {
	type HeadingSource,
	prHeadings,
	prTemplates,
	templateSource,
} from "../../../headings.ts";
import { linkFindings } from "../../../pr/links.ts";
import { loadPrProfile } from "../../../pr/profile.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";
import { bodyArgs, pickTemplate, readInput, reportGaps } from "./body.ts";

function reportLinks(io: Io, body: string, root: string | undefined): number {
	const requirePartOf = root !== undefined && loadPrProfile(root).requirePartOf;
	const findings = linkFindings({ title: undefined, body }, { requirePartOf });
	for (const finding of findings) io.out(`PR body: ${finding}\n`);
	return findings.length > 0 ? 1 : 0;
}

function headingSource(
	io: Io,
	root: string | undefined,
	template: string | undefined,
): HeadingSource | number {
	if (!template) return prHeadings(root);
	const picked = pickTemplate(
		io,
		"astack check-pr",
		root ? prTemplates(root) : [],
		template,
	);
	return typeof picked === "number" ? picked : templateSource(picked);
}

function run(args: readonly string[], io: Io): number {
	const parsed = bodyArgs(args);
	if (!parsed)
		return usageError(io, "astack check-pr: --template needs a name");
	const body = readInput(io, parsed.source);
	if (body === undefined)
		return usageError(io, "astack check-pr: give a file path or - for stdin");
	const root = repoRoot(io.cwd);
	const source = headingSource(io, root, parsed.template);
	if (typeof source === "number") return source;
	const links = reportLinks(io, body, root);
	const headings = reportGaps(io, body, "PR body", [source]);
	return Math.max(links, headings);
}

export const command: Command = {
	name: "pr",
	summary:
		"Checks a PR body: the headings of the repo PR template or the default headings, the Part of line when the profile asks for it, and closing words before a ticket key.",
	usage: "check pr <file|-> [--template <name>]",
	run,
};
