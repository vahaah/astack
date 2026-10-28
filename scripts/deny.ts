import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { companionPaths, openCompanion, writable } from "./lib/companion.ts";
import {
	MAX_NAME_WORDS,
	nameHash,
	parseHashList,
	wordTokens,
} from "./lib/neutrality.ts";

const usage = "Usage: bun scripts/deny.ts add <name> [--companion <dir>]";

type Args = { name: string; companion?: string };

function parseArgs(argv: readonly string[]): Args | string {
	const [command, ...rest] = argv;
	if (command !== "add") return usage;
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
	const name = words.join(" ");
	const count = wordTokens(name).length;
	if (count === 0) return `The name holds no letter or digit. ${usage}`;
	if (count > MAX_NAME_WORDS)
		return `The name has ${count} words. A name can have 1 to ${MAX_NAME_WORDS} words, because the scan reads ${MAX_NAME_WORDS} words at most.`;
	return companion === undefined ? { name } : { name, companion };
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
	const hash = nameHash(args.name);
	const prefix = hash.slice(0, 8);
	if (parsed.hashes.has(hash)) {
		console.log(`hash ${prefix} is already in ${path}`);
		return 0;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		[...parsed.hashes, hash].map((line) => `${line}\n`).join(""),
	);
	console.log(`added hash ${prefix} to ${path}`);
	return 0;
}

if (import.meta.main) {
	process.exitCode = await main(Bun.argv.slice(2));
}
