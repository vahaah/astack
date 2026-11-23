import { resolve } from "node:path";
import type { SimpleCommand, StagedText, Word } from "./shell.ts";

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

export type BodyReader = (path: string) => StagedText;

const MISSING: StagedText = { kind: "missing" };

function given(text: string | undefined): StagedText {
	return text === undefined ? MISSING : { kind: "text", text };
}

export function ghBody(
	flags: GhFlags,
	command: SimpleCommand,
	dir: string,
	read: BodyReader,
): StagedText {
	if (flags.body) return flags.body.dynamic ? MISSING : given(flags.body.value);
	if (!flags.bodyFile || flags.bodyFile.dynamic) return MISSING;
	return flags.bodyFile.value === "-"
		? given(command.stdin)
		: read(resolve(dir, flags.bodyFile.value));
}

export function bodyText(staged: StagedText): string | undefined {
	switch (staged.kind) {
		case "text":
			return staged.text;
		case "unread":
			return staged.disk;
		case "missing":
			return undefined;
	}
}

function repoSlug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
		.replace(/^[^@/]+@/, "")
		.replace(/\/+$/, "")
		.replace(/\.git$/, "")
		.split(/[/:]/)
		.slice(-2)
		.join("/");
}

export function sameRepo(named: string, origin: string): boolean {
	return repoSlug(named) === repoSlug(origin);
}

export function foreignRepo(
	named: string | undefined,
	origin: string | undefined,
): string | undefined {
	return named !== undefined &&
		(origin === undefined || !sameRepo(named, origin))
		? named
		: undefined;
}

export function isGh(
	values: readonly string[],
	group: string,
	action: string,
): boolean {
	return values[0] === "gh" && values[1] === group && values[2] === action;
}

export function ghRepoPrefix(env: readonly Word[]): string | undefined {
	return env
		.map((word) => /^GH_REPO=(.*)$/s.exec(word.value)?.[1])
		.filter((value) => value !== undefined)
		.at(-1);
}

export function inputString(input: unknown, key: string): string | undefined {
	if (typeof input !== "object" || input === null) return undefined;
	const value: unknown = Reflect.get(input, key);
	return typeof value === "string" ? value : undefined;
}
