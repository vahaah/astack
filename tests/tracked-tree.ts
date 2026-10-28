import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cleanEnv } from "../scripts/lib/exec.ts";

export function trackedTree(
	files: Readonly<Record<string, string | Uint8Array>>,
): string {
	const root = mkdtempSync(join(tmpdir(), "astack-tree-"));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	for (const args of [
		["init", "-q"],
		["add", "-A", "-f"],
	]) {
		spawnSync("git", args, { cwd: root, env: cleanEnv() });
	}
	return root;
}
