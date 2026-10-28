import {
	chmodSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export type FileEntry = {
	readonly bytes: Uint8Array;
	readonly executable: boolean;
};

export type FileTree = ReadonlyMap<string, FileEntry>;

const IGNORED = new Set([".DS_Store", "__pycache__", "node_modules"]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function textFile(text: string, executable = false): FileEntry {
	return { bytes: encoder.encode(text), executable };
}

export function textOf(entry: FileEntry): string {
	return decoder.decode(entry.bytes);
}

export function isText(entry: FileEntry): boolean {
	return !entry.bytes.subarray(0, 8000).includes(0);
}

function walk(root: string, dir: string): string[] {
	return readdirSync(join(root, dir))
		.filter((name) => !IGNORED.has(name))
		.sort()
		.flatMap((name) => {
			const path = dir === "" ? name : `${dir}/${name}`;
			return statSync(join(root, path)).isDirectory()
				? walk(root, path)
				: [path];
		});
}

export function readTree(root: string): FileTree {
	return new Map(
		walk(root, "").map((path) => {
			const absolute = join(root, path);
			return [
				path,
				{
					bytes: new Uint8Array(readFileSync(absolute)),
					executable: (statSync(absolute).mode & 0o111) !== 0,
				},
			];
		}),
	);
}

export function sortTree(entries: Iterable<[string, FileEntry]>): FileTree {
	return new Map([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function mount(prefix: string, tree: FileTree): FileTree {
	return new Map(
		[...tree].map(([path, entry]) => [`${prefix}/${path}`, entry] as const),
	);
}

export function collisions(trees: readonly FileTree[]): string[] {
	const seen = new Set<string>();
	const repeated = new Set<string>();
	for (const tree of trees)
		for (const path of tree.keys()) {
			if (seen.has(path)) repeated.add(path);
			seen.add(path);
		}
	return [...repeated].sort();
}

export function union(trees: readonly FileTree[]): FileTree {
	return sortTree(trees.flatMap((tree) => [...tree]));
}

export function sameBytes(a: FileEntry, b: FileEntry): boolean {
	return (
		a.executable === b.executable &&
		a.bytes.length === b.bytes.length &&
		a.bytes.every((byte, index) => byte === b.bytes[index])
	);
}

export function writeTree(root: string, tree: FileTree): void {
	rmSync(root, { recursive: true, force: true });
	for (const [path, entry] of tree) {
		const absolute = join(root, path);
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, entry.bytes);
		chmodSync(absolute, entry.executable ? 0o755 : 0o644);
	}
}
