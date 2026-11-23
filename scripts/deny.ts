import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	MAX_NAME_WORDS,
	nameHash,
	parseHashList,
	wordTokens,
} from "../src/astack/deny-list.ts";
import { denyStore, writeDenyList } from "../src/astack/deny-store.ts";
import { companionPaths, openCompanion, writable } from "./lib/companion.ts";

const usage =
	"Usage: bun scripts/deny.ts add <name> [--companion <dir>] | sync [--companion <dir>]";

type Args =
	| { readonly command: "add"; readonly name: string; companion?: string }
	| { readonly command: "sync"; companion?: string };

function parseArgs(argv: readonly string[]): Args | string {
	const [command, ...rest] = argv;
	if (command !== "add" && command !== "sync") return usage;
	const words: string[] = [];
	let companion: string | undefined;
	for (let index = 0; index < rest.length; index++) {
		const arg = rest[index];
		if (arg !== "--companion") {
			if (arg !== undefined) words.push(arg);
			continue;
		}
		companion = rest[index + 1];
		index++;
		if (companion === undefined) return usage;
	}
	const named = companion === undefined ? {} : { companion };
	if (command === "sync")
		return words.length === 0 ? { command, ...named } : usage;
	const name = words.join(" ");
	const count = wordTokens(name).length;
	if (count === 0) return `The name holds no letter or digit. ${usage}`;
	if (count > MAX_NAME_WORDS)
		return `The name has ${count} words. A name can have 1 to ${MAX_NAME_WORDS} words, because the scan reads ${MAX_NAME_WORDS} words at most.`;
	return { command, name, ...named };
}

function copyToState(hashes: ReadonlySet<string>): number {
	const store = denyStore(process.env);
	if (store.kind === "none") {
		console.error(
			"astack has no state folder, so the hook has no copy of the list. Set ASTACK_STATE_DIR, XDG_STATE_HOME or HOME, and run bun run deny sync.",
		);
		return 1;
	}
	const written = writeDenyList(hashes, store);
	if (!written.ok) {
		console.error(`${written.error.path}: ${written.error.message}`);
		return 1;
	}
	console.log(`wrote ${hashes.size} hash(es) to ${store.path}`);
	return 0;
}

async function main(argv: readonly string[]): Promise<number> {
	const args = parseArgs(argv);
	if (typeof args === "string") {
		console.error(args);
		return 2;
	}
	const opened = openCompanion(args.companion, process.env);
	if (!opened.ok) {
		console.error(opened.error);
		return 2;
	}
	const companion = writable(opened.value);
	if (!companion.ok) {
		console.error(companion.error);
		return 1;
	}
	const path = companionPaths(companion.value).deny;
	const file = Bun.file(path);
	const parsed = parseHashList((await file.exists()) ? await file.text() : "");
	if (parsed.errors.length > 0) {
		console.error(`${path}: ${parsed.errors.join(", ")}`);
		return 1;
	}
	if (args.command === "sync") return copyToState(parsed.hashes);
	const hash = nameHash(args.name);
	const prefix = hash.slice(0, 8);
	if (parsed.hashes.has(hash)) {
		console.log(`hash ${prefix} is already in ${path}`);
		return copyToState(parsed.hashes);
	}
	const hashes = new Set([...parsed.hashes, hash]);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, [...hashes].map((line) => `${line}\n`).join(""));
	console.log(`added hash ${prefix} to ${path}`);
	return copyToState(hashes);
}

if (import.meta.main) {
	process.exitCode = await main(Bun.argv.slice(2));
}
