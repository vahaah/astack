import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function load(path: string): string {
	spawnSync("true");
	return readFileSync(path, "utf8");
}
