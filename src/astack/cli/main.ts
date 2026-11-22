import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { asksForHelp, printHelp, usageLines } from "./command.ts";
import { CHECKS } from "./commands/check/index.ts";
import { ALIASES, COMMANDS } from "./commands/index.ts";
import { type Io, processIo, usageError } from "./io.ts";

export function usage(): string {
	return [
		"usage:",
		...COMMANDS.flatMap(usageLines),
		"",
		...COMMANDS.map((command) => `${command.name}: ${command.summary}`),
		...CHECKS.map((check) => `check ${check.name}: ${check.summary}`),
		`${ALIASES.map((alias) => alias.name).join(", ")} are short forms of check <name>.`,
		"Add --help or -h to a command or a check to print only its usage and summary.",
		"A usage error exits 2, unless the summary of the command gives a different code.",
		"astack --version prints the version of the plugin or package that holds this script.",
	].join("\n");
}

const VERSION_FILES = [
	".claude-plugin/plugin.json",
	".cursor-plugin/plugin.json",
	"package.json",
] as const;

function versionIn(path: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
	if (typeof parsed !== "object" || parsed === null) return undefined;
	const version: unknown = Reflect.get(parsed, "version");
	return typeof version === "string" && version !== "" ? version : undefined;
}

function printVersion(io: Io): number {
	if (io.scriptPath === undefined) {
		io.err("astack --version: the process gives no script path\n");
		return 1;
	}
	const root = resolve(dirname(resolve(io.cwd, io.scriptPath)), "..");
	for (const file of VERSION_FILES) {
		const version = versionIn(join(root, file));
		if (version !== undefined) {
			io.out(`${version}\n`);
			return 0;
		}
	}
	io.err(
		`astack --version: ${root} holds no .claude-plugin/plugin.json, .cursor-plugin/plugin.json or package.json with a version\n`,
	);
	return 1;
}

export function main(
	argv: readonly string[],
	io: Io = processIo(),
): number | Promise<number> {
	const [name, ...args] = argv;
	if (
		name === undefined ||
		name === "help" ||
		name === "--help" ||
		name === "-h"
	) {
		io.out(`${usage()}\n`);
		return 0;
	}
	if (name === "--version" && args.length === 0) return printVersion(io);
	const command = [...COMMANDS, ...ALIASES].find(
		(candidate) => candidate.name === name,
	);
	if (!command)
		return usageError(io, `astack: unknown command ${name}\n${usage()}`);
	if (!command.ownsHelp && asksForHelp(args)) return printHelp(command, io);
	return command.run(args, io);
}
