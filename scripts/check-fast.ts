import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "../src/astack/git.ts";
import { listFiles, REPO_ROOT } from "./lib/files.ts";

const CAP_SECONDS = 20;
const TEST = ["test", "--parallel", "--timeout=20000"];
export const REBUILD: readonly (readonly string[])[] = [
	["run", "build"],
	["run", "bundle"],
	["run", "dist", "--no-external"],
];
const STARTS_THE_BUILT_CLI =
	/marketplace\/plugins\/astack\/bin\/astack|dist\/cli\/astack\.js/;

export function launcherTests(root: string): string[] {
	return listFiles(root, "tests")
		.filter((path) => path.endsWith(".test.ts"))
		.filter((path) =>
			STARTS_THE_BUILT_CLI.test(readFileSync(join(root, path), "utf8")),
		);
}

export function changedBase(root: string): string | undefined {
	const base = runGit(root, ["merge-base", "HEAD", "refs/remotes/origin/HEAD"]);
	return base.ok ? base.stdout.toString("utf8").trim() : undefined;
}

export function changedTestCommand(root: string): string[] {
	const base = changedBase(root);
	return [
		process.execPath,
		...TEST,
		base === undefined ? "--changed" : `--changed=${base}`,
	];
}

function main(): number {
	const started = performance.now();
	if (changedBase(REPO_ROOT) === undefined)
		process.stdout.write(
			"check:fast: origin/HEAD does not resolve, so bun test --changed reads only uncommitted changes\n",
		);
	const steps: readonly (readonly string[])[] = [
		["tsc", "-p", "."],
		["biome", "ci", "."],
		...REBUILD.map((args) => [process.execPath, ...args]),
		[process.execPath, "run", "ste"],
		[process.execPath, "run", "budget"],
		changedTestCommand(REPO_ROOT),
		[process.execPath, ...TEST, ...launcherTests(REPO_ROOT)],
	];
	for (const [command = "", ...args] of steps) {
		const run = spawnSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
		if (run.status !== 0) {
			process.stderr.write(`check:fast: ${command} ${args.join(" ")} failed\n`);
			return 1;
		}
	}
	const seconds = ((performance.now() - started) / 1000).toFixed(1);
	process.stdout.write(
		`check:fast: ok in ${seconds} s. The cap is ${CAP_SECONDS} s.\n`,
	);
	return 0;
}

if (import.meta.main) process.exit(main());
