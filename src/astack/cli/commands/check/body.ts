import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	type HeadingSource,
	missingHeadings,
	type Template,
	templateNamed,
} from "../../../headings.ts";
import { type Io, usageError } from "../../io.ts";

export interface BodyArgs {
	source: string | undefined;
	template: string | undefined;
	flags: Set<string>;
}

export function bodyArgs(args: readonly string[]): BodyArgs | undefined {
	const parsed: BodyArgs = {
		source: undefined,
		template: undefined,
		flags: new Set(),
	};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (arg === "--template") {
			parsed.template = args[++i];
			if (!parsed.template) return undefined;
		} else if (arg.startsWith("--template="))
			parsed.template = arg.slice("--template=".length);
		else if (arg.startsWith("--")) parsed.flags.add(arg);
		else parsed.source ??= arg;
	}
	return parsed;
}

export function readInput(
	io: Io,
	source: string | undefined,
): string | undefined {
	if (!source) return undefined;
	try {
		return readFileSync(source === "-" ? 0 : resolve(io.cwd, source), "utf8");
	} catch {
		return undefined;
	}
}

export function pickTemplate(
	io: Io,
	command: string,
	templates: Template[],
	name: string,
): Template | number {
	const chosen = templateNamed(templates, name);
	if (chosen) return chosen;
	const names = templates.map((template) => template.name).join(", ");
	return usageError(
		io,
		`${command}: no template named ${name}. ${names ? `The repo has: ${names}.` : "The repo has none."}`,
	);
}

export function reportGaps(
	io: Io,
	body: string,
	what: string,
	sources: HeadingSource[],
): number {
	const gaps = sources
		.map((source) => ({
			source: source.source,
			missing: missingHeadings(body, source.headings),
		}))
		.filter((gap) => gap.missing.length > 0);
	for (const gap of gaps)
		io.out(
			`${what} is missing (from ${gap.source}): ${gap.missing.join(", ")}\n`,
		);
	if (gaps.length > 0) return 1;
	const from = sources.map((source) => source.source).join(" and ");
	io.out(`ok: ${what} has every heading from ${from}\n`);
	return 0;
}
