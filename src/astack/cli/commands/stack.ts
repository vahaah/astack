import { spawnSync } from "node:child_process";
import { filesDigest, startVerdict } from "../../stack-config.ts";
import {
	checkoutOf,
	recordPath,
	runningContainers,
	stackProject,
	watchedFiles,
	writeStackRecord,
} from "../../stack-edge.ts";
import { positional, valueAfter, valuesAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";

const NAME = "astack stack start";

function start(args: readonly string[], io: Io): number {
	const [folder] = positional(args, ["--watch", "--run"]);
	const watched = valuesAfter(args, "--watch");
	const command = valueAfter(args, "--run");
	if (
		folder === undefined ||
		watched === undefined ||
		watched.length === 0 ||
		typeof command !== "string"
	)
		return usageError(
			io,
			`${NAME}: give the Supabase folder, at least one --watch <path> and --run <command>`,
		);
	const checkout = checkoutOf(io);
	if (!checkout.ok) return usageError(io, `${NAME}: ${checkout.error}`);
	const files = watchedFiles(io, checkout.value, watched);
	if (!files.ok) return usageError(io, `${NAME}: ${files.error}`);
	const before = runningContainers(io);
	if (!before.ok) return usageError(io, `${NAME}: ${before.error}`);
	const started = spawnSync("bash", ["-c", command], {
		cwd: io.cwd,
		env: io.env,
		stdio: "inherit",
	});
	if (started.error !== undefined)
		return usageError(io, `${NAME}: cannot run bash: ${started.error.message}`);
	if (started.status !== 0) {
		io.out(
			`The start command exited ${started.status ?? started.signal}, so astack recorded nothing.\n`,
		);
		return 1;
	}
	const project = stackProject(io, folder);
	if (!project.ok) return usageError(io, `${NAME}: ${project.error}`);
	const after = runningContainers(io, project.value);
	if (!after.ok) return usageError(io, `${NAME}: ${after.error}`);
	const verdict = startVerdict(before.value, after.value);
	switch (verdict.kind) {
		case "no-container":
			io.out(
				`No container of the local stack ${project.value} runs after the start command, so astack recorded nothing.\n`,
			);
			return 1;
		case "kept":
			io.out(
				`The local stack ${project.value} ran before the start command, so it kept the config of an earlier start, and astack recorded nothing. Stop the stack. Then run this command again.\n`,
			);
			return 1;
		case "fresh": {
			const written = writeStackRecord(
				recordPath(checkout.value, project.value),
				{
					project: project.value,
					checkout: checkout.value.root,
					files: filesDigest(files.value),
					containers: verdict.containers,
				},
			);
			if (!written.ok) return usageError(io, `${NAME}: ${written.error}`);
			io.out(
				`astack recorded the files of ${watched.join(", ")} in ${checkout.value.root} for the local stack ${project.value}.\n`,
			);
			return 0;
		}
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function run(args: readonly string[], io: Io): number {
	const [action, ...rest] = args;
	if (action === "start") return start(rest, io);
	return usageError(io, "astack stack: give start");
}

export const command: Command = {
	name: "stack",
	summary:
		"stack start runs the start command of a long-lived local Supabase stack with bash. Then it records the files of each watched path of this checkout and the containers of the stack. The record is in the git folder that all worktrees of the clone share. astack check stack-config compares a checkout with that record. It records nothing when the start command fails, or when the stack ran before the start command.",
	usage:
		"stack start <folder> --watch <path> [--watch <path>]... --run <command>",
	run,
};
