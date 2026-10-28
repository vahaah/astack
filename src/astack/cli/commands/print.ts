import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cursorInstall, withFragment } from "../../print.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const NAME = "astack print";

function distRoot(io: Io): string | undefined {
	if (io.scriptPath === undefined) return undefined;
	const bin = dirname(resolve(io.scriptPath));
	return [resolve(bin, "../../.."), resolve(bin, "..")].find((root) =>
		existsSync(join(root, "codex", "AGENTS.fragment.md")),
	);
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function run(args: readonly string[], io: Io): number {
	const [what, file, ...rest] = args;
	if (rest.length > 0 || (what !== "codex-agents" && what !== "cursor-install"))
		return usageError(
			io,
			`${NAME}: give codex-agents [<AGENTS.md>] or cursor-install`,
		);
	const root = distRoot(io);
	if (root === undefined) {
		io.err(
			`${NAME}: this copy of the CLI is not in the repository build, so it has no fragment. Run it from the repository: node <repository root>/cli/astack.js print ${what}\n`,
		);
		return 1;
	}
	if (what === "cursor-install") {
		if (file !== undefined)
			return usageError(io, `${NAME}: cursor-install takes no file`);
		io.out(cursorInstall(root));
		return 0;
	}
	const fragment = readText(join(root, "codex", "AGENTS.fragment.md")) ?? "";
	const existing =
		file === undefined ? "" : (readText(resolve(io.cwd, file)) ?? "");
	io.out(withFragment(existing, fragment));
	return 0;
}

export const command: Command = {
	name: "print",
	summary:
		"Prints install text from the repository build. codex-agents prints AGENTS.md with the astack block in it, and replaces an old block. cursor-install prints the copy commands for the local Cursor plugin.",
	usage: "print codex-agents [<AGENTS.md>]\nprint cursor-install",
	run,
};
