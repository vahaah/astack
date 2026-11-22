import { cpSync, mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCES = [
	"src",
	"scripts",
	"marketplace",
	"rules",
	"examples",
	"dist",
	".claude-plugin",
	".cursor-plugin",
	"upstream/cursor-plugin-schemas",
	"package.json",
	"LICENSE",
	"NOTICE",
];

export function generatedTreeCopy(): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-generated-"));
	for (const path of SOURCES) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		cpSync(join(ROOT, path), join(dir, path), { recursive: true });
	}
	mkdirSync(join(dir, "node_modules"));
	cpSync(
		realpathSync(join(ROOT, "node_modules/yaml")),
		join(dir, "node_modules/yaml"),
		{ recursive: true },
	);
	return dir;
}
