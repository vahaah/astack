import { chmodSync } from "node:fs";
import { resolve } from "node:path";
import { BUNDLE_PATH, compileBundle } from "./lib/bundle.ts";

const ROOT = resolve(import.meta.dir, "..");

async function main(): Promise<number> {
	if (Bun.argv.length > 2) {
		console.error("Usage: bun scripts/bundle.ts");
		return 2;
	}
	const bundle = await compileBundle(ROOT);
	if (!bundle.ok) {
		for (const problem of bundle.error) console.error(problem);
		return 1;
	}
	const target = resolve(ROOT, BUNDLE_PATH);
	await Bun.write(target, bundle.value);
	chmodSync(target, 0o644);
	console.log(`${BUNDLE_PATH} written`);
	return 0;
}

if (import.meta.main) process.exitCode = await main();
