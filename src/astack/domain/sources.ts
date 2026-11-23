import { join } from "node:path";
import { readBlobs, runGit } from "../git.ts";
import { anyGlob } from "../glob.ts";
import { readOptional } from "../paths.ts";
import { err, ok, type Result } from "../result.ts";

export type SourceAt =
	| { readonly kind: "tree" }
	| { readonly kind: "commit"; readonly commit: string };

export type SourceQuery = {
	readonly root: string;
	readonly codeRoots: readonly string[];
	readonly at: SourceAt;
};

export type ModuleSource =
	| { readonly kind: "text"; readonly path: string; readonly text: string }
	| {
			readonly kind: "report";
			readonly path: string;
			readonly message: string;
	  };

export type SourceStop = { readonly message: string };

type Entry = { readonly mode: string; readonly path: string };

const MODULE = /\.tsx?$/;
const SYMLINK = "120000";
const REGULAR = new Set(["100644", "100755"]);

function rootAnchored(codeRoots: readonly string[]): readonly string[] {
	return codeRoots.map((glob) => (glob.includes("/") ? glob : `./${glob}`));
}

function isModule(codeRoots: readonly string[], path: string): boolean {
	return MODULE.test(path) && anyGlob(rootAnchored(codeRoots), path);
}

function entries(output: string, pattern: RegExp): Entry[] {
	return output.split("\0").flatMap((record) => {
		const match = pattern.exec(record);
		return match === null
			? []
			: [{ mode: match[1] ?? "", path: match[2] ?? "" }];
	});
}

function listing(root: string, at: SourceAt): Buffer | undefined {
	if (at.kind === "commit" && at.commit.startsWith("-")) return undefined;
	const run =
		at.kind === "tree"
			? runGit(root, ["ls-files", "-s", "-z"])
			: runGit(root, ["ls-tree", "-r", "-z", `${at.commit}^{commit}`]);
	return run.ok ? run.stdout : undefined;
}

function listed(query: SourceQuery): Result<readonly Entry[], SourceStop> {
	const { root, at } = query;
	const output = listing(root, at);
	if (output === undefined)
		return err({
			message:
				at.kind === "tree"
					? "git cannot list the tracked files of the tree"
					: `${at.commit} is not a commit of the repo`,
		});
	const pattern =
		at.kind === "tree"
			? /^(\d{6}) [0-9a-f]+ \d+\t(.+)$/s
			: /^(\d{6}) \w+ [0-9a-f]+\t(.+)$/s;
	return ok(
		entries(output.toString("utf8"), pattern).filter((entry) =>
			isModule(query.codeRoots, entry.path),
		),
	);
}

function report(path: string, message: string): ModuleSource {
	return { kind: "report", path, message };
}

function reader(
	root: string,
	at: SourceAt,
	paths: readonly string[],
): (path: string) => string | undefined {
	if (at.kind === "tree") return (path) => readOptional(join(root, path));
	const spec = (path: string): string => `${at.commit}:${path}`;
	const blobs = readBlobs(root, paths.map(spec));
	return (path) => blobs.get(spec(path));
}

export function moduleSources(
	query: SourceQuery,
): Result<readonly ModuleSource[], SourceStop> {
	const found = listed(query);
	if (!found.ok) return found;
	const { root, at } = query;
	const regular = [
		...new Set(
			found.value
				.filter((entry) => REGULAR.has(entry.mode))
				.map((entry) => entry.path),
		),
	];
	const read = reader(root, at, regular);
	const seen = new Set<string>();
	return ok(
		found.value.flatMap((entry): ModuleSource[] => {
			if (seen.has(entry.path)) return [];
			seen.add(entry.path);
			if (entry.mode === SYMLINK)
				return [
					report(
						entry.path,
						"the module is a symlink, so the check reads no class of it",
					),
				];
			if (!REGULAR.has(entry.mode)) return [];
			const text = read(entry.path);
			return text === undefined
				? [report(entry.path, "the module cannot be read")]
				: [{ kind: "text", path: entry.path, text }];
		}),
	);
}
