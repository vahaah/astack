import { repoRoot } from "../../../git.ts";
import {
	type HeadingSource,
	prHeadings,
	prTemplates,
	templateSource,
} from "../../../headings.ts";
import { processPorts } from "../../../ports.ts";
import { linkFindings } from "../../../pr/links.ts";
import { partOfRequired } from "../../../pr/profile.ts";
import { readProfileJson } from "../../../profile.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";
import { bodyArgs, pickTemplate, readInput, reportGaps } from "./body.ts";

export const PR_BODY_MAX_LINES = 40;

function reportLinks(io: Io, body: string, root: string | undefined): number {
	const requirePartOf =
		root !== undefined && partOfRequired(readProfileJson(root));
	const findings = linkFindings({ title: undefined, body }, { requirePartOf });
	for (const finding of findings) io.out(`PR body: ${finding}\n`);
	return findings.length > 0 ? 1 : 0;
}

type RecordLines = { readonly table: number; readonly code: number };

function recordLines(lines: readonly string[]): RecordLines {
	let fenced = false;
	let table = 0;
	let code = 0;
	for (const line of lines) {
		if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
		else if (fenced) code++;
		else if (line.trimStart().startsWith("|")) table++;
	}
	return { table, code };
}

function noteLength(io: Io, body: string): void {
	const lines = body.trimEnd().split("\n");
	if (lines.length <= PR_BODY_MAX_LINES) return;
	const { table, code } = recordLines(lines);
	const records =
		table + code > 0
			? `It has ${table} table rows and ${code} code lines. Post the tables and code blocks in one PR comment, and link that comment from Verification.`
			: "Link long run records from Verification.";
	io.out(
		`note: PR body has ${lines.length} lines, over the ${PR_BODY_MAX_LINES} lines of astack:write-docs. ${records}\n`,
	);
}

function headingSource(
	io: Io,
	root: string | undefined,
	template: string | undefined,
): HeadingSource | number {
	const { files } = processPorts();
	if (!template) return prHeadings(files, root);
	const picked = pickTemplate(
		io,
		"astack check-pr",
		root ? prTemplates(files, root) : [],
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
	noteLength(io, body);
	const headings = reportGaps(io, body, "PR body", [source]);
	return Math.max(links, headings);
}

export const command: Command = {
	name: "pr",
	summary: `Checks a PR body: the headings of the repo PR template or the default headings, the Part of line when the profile asks for it, and closing words before a ticket key. A note names a body over ${PR_BODY_MAX_LINES} lines and never fails.`,
	usage: "check pr <file|-> [--template <name>]",
	run,
};
