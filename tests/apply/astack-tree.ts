import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TargetDeny } from "../../scripts/lib/target-lint.ts";

type TreeState = "committed" | "no-commit";

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

function gitTree(
	root: string,
	state: TreeState,
	files: Readonly<Record<string, string>>,
): string {
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.name", "Test Owner");
	git(root, "config", "user.email", "owner@example.com");
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	if (state === "committed") {
		git(root, "add", "-A");
		git(root, "commit", "-qm", "feat: start the tree");
	}
	return root;
}

export function astackTree(root: string, state: TreeState): string {
	return gitTree(root, state, { "src/index.ts": "export const astack = 1;\n" });
}

export function companionTree(root: string, state: TreeState): string {
	return gitTree(root, state, { "projects/acme.json": '{ "name": "acme" }\n' });
}

export const emptyDeny: TargetDeny = { projects: [], hashes: new Set() };
