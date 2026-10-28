import { resolve } from "node:path";
import { readOptional } from "./paths.ts";
import type { SimpleCommand, Word } from "./shell.ts";

export interface GhFlags {
	body?: Word;
	bodyFile?: Word;
	title?: string;
	labels: string[];
	repo?: string;
	skip: boolean;
}

const GH_VALUE_FLAGS: Record<string, keyof GhFlags | "ignore"> = {
	"-b": "body",
	"--body": "body",
	"-F": "bodyFile",
	"--body-file": "bodyFile",
	"-t": "title",
	"--title": "title",
	"-l": "labels",
	"--label": "labels",
	"-T": "ignore",
	"--template": "ignore",
	"-R": "repo",
	"--repo": "repo",
	"-a": "ignore",
	"--assignee": "ignore",
	"-B": "ignore",
	"--base": "ignore",
	"-H": "ignore",
	"--head": "ignore",
	"-m": "ignore",
	"--milestone": "ignore",
	"--parent": "ignore",
	"--blocked-by": "ignore",
	"--blocking": "ignore",
	"-p": "ignore",
	"--project": "ignore",
	"-r": "ignore",
	"--reviewer": "ignore",
	"--recover": "ignore",
};

const GH_SKIP_FLAGS = new Set([
	"-f",
	"--fill",
	"--fill-first",
	"--fill-verbose",
	"-w",
	"--web",
	"-e",
	"--editor",
]);

export function ghFlags(words: readonly Word[]): GhFlags {
	const flags: GhFlags = { labels: [], skip: false };
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if (!word) continue;
		const eq = word.value.indexOf("=");
		const name =
			word.value.startsWith("--") && eq > 0
				? word.value.slice(0, eq)
				: word.value;
		if (GH_SKIP_FLAGS.has(name)) {
			flags.skip = true;
			continue;
		}
		const target = GH_VALUE_FLAGS[name];
		if (!target) continue;
		const value: Word | undefined =
			name !== word.value
				? { value: word.value.slice(eq + 1), dynamic: word.dynamic }
				: words[++i];
		if (!value || target === "ignore") continue;
		if (target === "body" || target === "bodyFile") flags[target] = value;
		else if (target === "labels") flags.labels.push(...value.value.split(","));
		else if (target === "title" || target === "repo")
			flags[target] = value.value;
	}
	return flags;
}

export function ghBody(
	flags: GhFlags,
	command: SimpleCommand,
	dir: string,
): string | undefined {
	if (flags.body) return flags.body.dynamic ? undefined : flags.body.value;
	if (!flags.bodyFile || flags.bodyFile.dynamic) return undefined;
	return flags.bodyFile.value === "-"
		? command.stdin
		: readOptional(resolve(dir, flags.bodyFile.value));
}

export function isGh(
	values: readonly string[],
	group: string,
	action: string,
): boolean {
	return values[0] === "gh" && values[1] === group && values[2] === action;
}
