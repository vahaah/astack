import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export type TicketKind = "bug" | "feature";

export const TICKET_HEADINGS: Record<TicketKind, string[]> = {
	feature: [
		"Problem",
		"Outcome",
		"Acceptance criteria",
		"Scope",
		"Verification",
	],
	bug: [
		"Summary",
		"Environment",
		"Steps to reproduce",
		"Expected",
		"Actual",
		"Acceptance criteria",
	],
};

export const PR_HEADINGS = [
	"Why",
	"What changes",
	"Verification",
	"Risk and rollback",
];

const OPTIONAL_HEADING = /\((?:optional|if any|if needed|if applicable)\)\s*$/i;

export function normalizeHeading(text: string): string {
	return text
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function stripFrontMatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

export function markdownHeadings(markdown: string): string[] {
	const text = stripFrontMatter(markdown)
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/^(\s*)(```|~~~)[\s\S]*?^\1\2\s*$/gm, "");
	const headings: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const atx = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
		const bold = /^\s*\*\*([^*]+?)\*\*:?\s*$/.exec(line);
		const heading = atx?.[1] ?? bold?.[1];
		if (heading) headings.push(heading.trim());
	}
	return headings;
}

export function requiredHeadings(template: string): string[] {
	return markdownHeadings(template).filter(
		(heading) => !OPTIONAL_HEADING.test(heading),
	);
}

export function missingHeadings(body: string, required: string[]): string[] {
	const present = markdownHeadings(body).map(normalizeHeading);
	return required.filter((heading) => {
		const wanted = normalizeHeading(heading);
		return !present.some(
			(have) => have === wanted || have.startsWith(`${wanted} `),
		);
	});
}

export function detectTicketKind(input: {
	title?: string;
	labels?: string[];
	body: string;
}): TicketKind {
	if ((input.labels ?? []).some((label) => /\bbug\b/i.test(label)))
		return "bug";
	const headings = markdownHeadings(input.body).map(normalizeHeading);
	if (
		headings.includes("steps to reproduce") ||
		(headings.includes("expected") && headings.includes("actual"))
	) {
		return "bug";
	}
	return /\bbug\b|\bregression\b|\bcrash(?:es|ed)?\b|\bbroken\b/i.test(
		input.title ?? "",
	)
		? "bug"
		: "feature";
}

export function headingSkeleton(headings: string[]): string {
	return headings.map((heading) => `## ${heading}`).join("\n");
}

export interface Template {
	path: string;
	name: string;
	labels: string[];
	headings: string[];
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function inode(path: string): string | undefined {
	try {
		const stats = statSync(path);
		return `${stats.dev}:${stats.ino}`;
	} catch {
		return undefined;
	}
}

function listMarkdown(dir: string): string[] {
	try {
		return readdirSync(dir)
			.filter((file) => /\.md$/i.test(file))
			.sort()
			.map((file) => join(dir, file));
	} catch {
		return [];
	}
}

function frontMatterField(markdown: string, field: string): string[] {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1];
	if (!block) return [];
	const inline = new RegExp(`^${field}:\\s*(.+)$`, "m").exec(block)?.[1];
	if (inline) {
		return inline
			.replace(/^\[|\]$/g, "")
			.split(",")
			.map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
			.filter(Boolean);
	}
	const list = new RegExp(`^${field}:\\s*\\n((?:\\s+-\\s.*\\n?)+)`, "m").exec(
		block,
	)?.[1];
	return (list ?? "")
		.split("\n")
		.map((line) =>
			line
				.replace(/^\s+-\s*/, "")
				.trim()
				.replace(/^['"]|['"]$/g, ""),
		)
		.filter(Boolean);
}

function loadTemplate(root: string, path: string): Template | undefined {
	const text = readText(path);
	if (text === undefined) return undefined;
	return {
		path: path.slice(root.length + 1),
		name:
			frontMatterField(text, "name")[0] ?? basename(path).replace(/\.md$/i, ""),
		labels: frontMatterField(text, "labels"),
		headings: requiredHeadings(text),
	};
}

function templatesAt(
	root: string,
	files: string[],
	dirs: string[],
): Template[] {
	const single = files
		.map((file) => loadTemplate(root, join(root, file)))
		.find(Boolean);
	if (single) return [single];
	const seen = new Set<string>();
	return dirs
		.filter((dir) => {
			const id = inode(join(root, dir));
			if (id === undefined || seen.has(id)) return false;
			seen.add(id);
			return true;
		})
		.flatMap((dir) => listMarkdown(join(root, dir)))
		.flatMap((path) => {
			const template = loadTemplate(root, path);
			return template ? [template] : [];
		});
}

export function templateNamed(
	templates: Template[],
	name: string,
): Template | undefined {
	const wanted = name.toLowerCase().replace(/\.md$/, "");
	return templates.find(
		(template) =>
			template.name.toLowerCase() === wanted ||
			basename(template.path).toLowerCase().replace(/\.md$/, "") === wanted,
	);
}

export interface HeadingSource {
	source: string;
	headings: string[];
}

export function templateSource(template: Template): HeadingSource {
	return { source: template.path, headings: template.headings };
}

export function prTemplates(root: string): Template[] {
	return templatesAt(
		root,
		[
			".github/PULL_REQUEST_TEMPLATE.md",
			".github/pull_request_template.md",
			"PULL_REQUEST_TEMPLATE.md",
			"pull_request_template.md",
			"docs/PULL_REQUEST_TEMPLATE.md",
			"docs/pull_request_template.md",
		],
		[".github/PULL_REQUEST_TEMPLATE", ".github/pull_request_template"],
	);
}

export function prHeadings(root: string | undefined): HeadingSource {
	const templates = root ? prTemplates(root) : [];
	const [first, ...rest] = templates;
	if (!first)
		return { source: "the default PR body standard", headings: PR_HEADINGS };
	if (rest.length === 0) return templateSource(first);
	const shared = first.headings.filter((heading) =>
		rest.every((template) =>
			template.headings.some(
				(other) => normalizeHeading(other) === normalizeHeading(heading),
			),
		),
	);
	return { source: "the repo's PR templates", headings: shared };
}

export function issueTemplates(root: string): Template[] {
	return templatesAt(
		root,
		[
			".github/ISSUE_TEMPLATE.md",
			".github/issue_template.md",
			"ISSUE_TEMPLATE.md",
			"docs/ISSUE_TEMPLATE.md",
		],
		[".github/ISSUE_TEMPLATE", ".github/issue_template"],
	);
}

const KIND_PATTERN: Record<TicketKind, RegExp> = {
	bug: /bug/i,
	feature: /feature|enhancement|request|idea/i,
};

function namesKind(template: Template, kind: TicketKind): boolean {
	return [template.name, basename(template.path), ...template.labels].some(
		(value) => KIND_PATTERN[kind].test(value),
	);
}

export function issueTemplateFor(
	root: string | undefined,
	kind: TicketKind,
): Template | undefined {
	const templates = root ? issueTemplates(root) : [];
	const match = templates.find((template) => namesKind(template, kind));
	if (match) return match;
	const [only, ...rest] = templates;
	const other: TicketKind = kind === "bug" ? "feature" : "bug";
	return only && rest.length === 0 && !namesKind(only, other)
		? only
		: undefined;
}

export function ticketStandard(kind: TicketKind): HeadingSource {
	return {
		source: `the ${kind} ticket standard`,
		headings: TICKET_HEADINGS[kind],
	};
}

export function issueHeadings(
	root: string | undefined,
	kind: TicketKind,
): HeadingSource {
	const template = issueTemplateFor(root, kind);
	return template ? templateSource(template) : ticketStandard(kind);
}

const EMAIL =
	/([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const PLACEHOLDER_DOMAIN =
	/(?:^|\.)(?:example\.(?:com|org|net)|test|invalid|localhost|noreply\.github\.com)$/i;

export function emailAddresses(text: string): string[] {
	const found: string[] = [];
	for (const match of text.matchAll(EMAIL)) {
		const local = match[1] ?? "";
		const domain = match[2] ?? "";
		if (PLACEHOLDER_DOMAIN.test(domain) || /^no-?reply\b/i.test(local))
			continue;
		found.push(`${local.slice(0, 1)}***@${domain}`);
	}
	return found;
}

export function personalDataNote(emails: readonly string[]): string {
	return `astack: the issue text contains ${emails.length === 1 ? "an email address" : `${emails.length} email addresses`} (${emails.slice(0, 3).join(", ")}). Refer to people by role or ID, and keep personal and customer data out of tickets.`;
}

export interface HeadingGap {
	missing: string[];
	source: string;
	headings: string[];
	footer: string;
}

export function headingDeny(subject: string, gap: HeadingGap): string {
	return [
		`astack blocked ${subject}: the body is missing ${gap.missing.join(", ")} (required by ${gap.source}).`,
		"Write each section as a ## heading with these words:",
		headingSkeleton(gap.headings),
		gap.footer,
	].join("\n");
}

export function headingAdvice(
	subject: string,
	gap: HeadingGap,
	repo: string,
): string {
	return [
		`astack: the ${subject} body is missing ${gap.missing.join(", ")} (required by ${gap.source}). astack only advises because it targets --repo ${repo}.`,
		"Write each section as a ## heading with these words:",
		headingSkeleton(gap.headings),
		gap.footer,
	].join("\n");
}

function otherKind(kind: TicketKind): TicketKind {
	return kind === "bug" ? "feature" : "bug";
}

export function ticketFooter(kind: TicketKind): string {
	const other = otherKind(kind);
	return `If this is a ${other}, use: ${TICKET_HEADINGS[other].join(", ")}. The astack:write-ticket skill has the templates and the rubric.`;
}
