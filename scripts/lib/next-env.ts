import { dirname, posix } from "node:path";
import type { ProfileGate } from "../../src/astack/pr-review-profile.ts";

type Writer = {
	readonly action: string;
	readonly why: string;
	readonly writes: (segment: string) => readonly string[];
};

const NEXT_WRITE = /\bnext\s+(?:build|dev|typegen)\b/;

const REDIRECT = /(?<![<>])\d*>>?(?!&)\s*("[^"]*"|'[^']*'|[^\s;&|<>()]+)/g;

const TEE = /(?<![\w.-])tee((?:\s+(?:"[^"]*"|'[^']*'|[^\s;&|<>()]+))*)/g;

const OUTPUT_FLAG =
	/(?<![\w-])(?:-o|--output)(?:=|\s+)("[^"]*"|'[^']*'|[^\s;&|<>()-][^\s;&|<>()]*)/g;

function unquoted(word: string): string {
	return /^(["']).*\1$/.test(word) ? word.slice(1, -1) : word;
}

function teeFiles(segment: string): string[] {
	return [...segment.matchAll(TEE)].flatMap((match) =>
		[...(match[1] ?? "").matchAll(/"[^"]*"|'[^']*'|[^\s;&|<>()]+/g)]
			.map((word) => word[0])
			.filter((word) => !word.startsWith("-"))
			.map(unquoted),
	);
}

export const WRITERS = {
	next: {
		action: "runs next build or next dev",
		why: "next writes that file again when its text is not the text of the command.",
		writes: (segment) => (NEXT_WRITE.test(segment) ? ["next-env.d.ts"] : []),
	},
	redirect: {
		action:
			"redirects the output of a command, such as supabase gen types, into a file",
		why: "The redirect writes the output of the command over that file each time the gate runs.",
		writes: (segment) =>
			[...segment.matchAll(REDIRECT)].flatMap((match) =>
				match[1] === undefined ? [] : [unquoted(match[1])],
			),
	},
	tee: {
		action: "sends the output of a command into a file with tee",
		why: "tee writes the output of the command over that file each time the gate runs.",
		writes: teeFiles,
	},
	output: {
		action: "gives a command an output file with -o or --output",
		why: "The command writes its output over that file each time the gate runs.",
		writes: (segment) =>
			[...segment.matchAll(OUTPUT_FLAG)].flatMap((match) =>
				match[1] === undefined ? [] : [unquoted(match[1])],
			),
	},
} satisfies Record<string, Writer>;

export type WriterName = keyof typeof WRITERS;

function isWriterName(name: string): name is WriterName {
	return name in WRITERS;
}

const WRITER_NAMES = Object.keys(WRITERS).filter(isWriterName);

export type Write = {
	readonly writer: WriterName;
	readonly where: string;
	readonly path: string;
};

export type ScriptWrite = {
	readonly script: string;
	readonly writer: WriterName;
	readonly path: string;
};

export type WriterPackage = {
	readonly dir: string;
	readonly name: string | undefined;
	readonly writes: readonly ScriptWrite[];
};

const SCOPED = /--filter|--cwd|\s-F\s|\bcd\s/;

const CD = /^\s*\(?\s*cd\s+("[^"]*"|'[^']*'|[^\s()]+)\s*\)?\s*$/;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escaped(word: string): string {
	return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inRepo(dir: string, path: string): string | undefined {
	if (path === "" || path.startsWith("/") || /[$`*?~]/.test(path))
		return undefined;
	const joined = posix.normalize(posix.join(dir, path));
	return joined === ".." || joined.startsWith("../") ? undefined : joined;
}

export function commandWrites(text: string, start: string): Write[] {
	const found: Write[] = [];
	let cwd: string | undefined = start;
	for (const segment of text.split(/&&|\|\||[;|\n]/)) {
		const cd = CD.exec(segment);
		if (cd?.[1] !== undefined) {
			cwd = cwd === undefined ? undefined : inRepo(cwd, unquoted(cd[1]));
			continue;
		}
		const where = cwd;
		if (where === undefined) continue;
		for (const writer of WRITER_NAMES)
			for (const file of WRITERS[writer].writes(segment)) {
				const path = inRepo(where, file);
				if (path !== undefined && path !== ".")
					found.push({ writer, where, path });
			}
	}
	return found;
}

export function writerPackage(
	path: string,
	packageJson: string | undefined,
): WriterPackage | undefined {
	if (packageJson === undefined) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(packageJson);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || !isRecord(parsed.scripts)) return undefined;
	const dir = dirname(path);
	const writes = Object.entries(parsed.scripts).flatMap(([script, text]) =>
		typeof text === "string"
			? commandWrites(text, dir).map(({ writer, path: file }) => ({
					script,
					writer,
					path: file,
				}))
			: [],
	);
	if (writes.length === 0) return undefined;
	return {
		dir,
		name: typeof parsed.name === "string" ? parsed.name : undefined,
		writes,
	};
}

function names(text: string, word: string): boolean {
	return new RegExp(`(?<![\\w@.-])${escaped(word)}(?![\\w-])`).test(text);
}

function runsScript(text: string, script: string): boolean {
	const runner =
		"\\b(?:turbo(?:\\s+run)?|bun\\s+run|npm\\s+run|pnpm(?:\\s+run)?|yarn(?:\\s+run)?)";
	const scope = "(?:\\s+(?:--filter[= ]|-F\\s+|--cwd[= ])\\S+)*";
	return new RegExp(`${runner}${scope}\\s+${escaped(script)}(?![\\w:-])`).test(
		text,
	);
}

function runsIn(text: string, pack: WriterPackage, script: string): boolean {
	if (!runsScript(text, script)) return false;
	if (pack.dir === ".") return !SCOPED.test(text);
	if (names(text, pack.dir)) return true;
	if (pack.name !== undefined && names(text, pack.name)) return true;
	return !SCOPED.test(text);
}

export function rewriteGaps(
	packages: readonly WriterPackage[],
	gates: readonly ProfileGate[],
	tracked: ReadonlySet<string>,
): string[] {
	return gates.flatMap((gate) => {
		const entries = [gate.command, ...gate.preparation];
		const scripted = packages.flatMap((pack) =>
			pack.writes
				.filter((write) =>
					entries.some((text) => runsIn(text, pack, write.script)),
				)
				.map(({ writer, path }) => ({ writer, where: pack.dir, path })),
		);
		const direct = entries.flatMap((text) => commandWrites(text, "."));
		const seen = new Set<string>();
		return [...scripted, ...direct].flatMap(({ writer, where, path }) => {
			if (!tracked.has(path) || gate.rewrites.includes(path) || seen.has(path))
				return [];
			seen.add(path);
			const { action, why } = WRITERS[writer];
			const folder = where === "." ? "the repo root" : where;
			return [
				`The gate ${gate.name} ${action} in ${folder}, and git tracks ${path}. ${why} Add ${path} to the rewrites of the gate, with the reason, so the run restores the file after the gate.`,
			];
		});
	});
}

export function untrackedRewrites(
	gates: readonly ProfileGate[],
	tracked: ReadonlySet<string>,
): string[] {
	return gates.flatMap((gate) =>
		gate.rewrites
			.filter((path) => !tracked.has(path))
			.map(
				(path) =>
					`The gate ${gate.name} names ${path} in rewrites, but git does not track that file, so the run cannot restore it.`,
			),
	);
}
