import {
	filesDigest,
	type StackConfigVerdict,
	shellWord,
	stackConfigVerdict,
} from "../../../stack-config.ts";
import {
	checkoutOf,
	readStackRecord,
	recordPath,
	runningContainers,
	stackProject,
	watchedFiles,
} from "../../../stack-edge.ts";
import { positional, valueAfter, valuesAfter } from "../../args.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check stack-config";

type Stack = {
	readonly project: string;
	readonly folder: string;
	readonly watched: readonly string[];
	readonly restart: string;
};

function restartLines(io: Io, stack: Stack): string[] {
	const start = [
		"astack",
		"stack",
		"start",
		stack.folder,
		...stack.watched.flatMap((path) => ["--watch", path]),
		"--run",
		stack.restart,
	]
		.map(shellWord)
		.join(" ");
	return [
		"astack never restarts a stack. To start it with the files of this checkout, run this command yourself:",
		`  cd ${shellWord(io.cwd)} && ${start}`,
		"",
	];
}

function report(io: Io, stack: Stack, verdict: StackConfigVerdict): number {
	const paths = stack.watched.join(", ");
	const fail = (...lines: string[]): number => {
		io.out([...lines, ...restartLines(io, stack)].join("\n"));
		return 1;
	};
	switch (verdict.kind) {
		case "same-files":
			io.out(
				`The local stack ${stack.project} started with the files of ${paths} that this checkout holds.\n`,
			);
			return 0;
		case "no-container":
			return fail(`No container of the local stack ${stack.project} runs.`);
		case "no-record":
			return fail(
				`astack has no record of the files that the local stack ${stack.project} read at its start. Only astack stack start writes that record.`,
			);
		case "unreadable":
			return fail(
				`astack cannot read its record of the local stack ${stack.project} at ${verdict.path}.`,
			);
		case "restarted":
			return fail(
				`The local stack ${stack.project} started again after astack recorded its files, so astack cannot tell which files it read.`,
			);
		case "other-files":
			return fail(
				`The local stack ${stack.project} started from ${verdict.record.checkout} with files of ${paths} that are not the files of this checkout.`,
				"A local stack keeps the config of its start. So a gate on it can test a config that is not the config of this branch.",
			);
		default: {
			const unhandled: never = verdict;
			return unhandled;
		}
	}
}

function run(args: readonly string[], io: Io): number {
	const [folder] = positional(args, ["--watch", "--restart"]);
	const watched = valuesAfter(args, "--watch");
	const restart = valueAfter(args, "--restart");
	if (
		folder === undefined ||
		watched === undefined ||
		watched.length === 0 ||
		typeof restart !== "string"
	)
		return usageError(
			io,
			`${NAME}: give the Supabase folder, at least one --watch <path> and --restart <command>`,
		);
	const project = stackProject(io, folder);
	if (!project.ok) return usageError(io, `${NAME}: ${project.error}`);
	const checkout = checkoutOf(io);
	if (!checkout.ok) return usageError(io, `${NAME}: ${checkout.error}`);
	const files = watchedFiles(io, checkout.value, watched);
	if (!files.ok) return usageError(io, `${NAME}: ${files.error}`);
	const running = runningContainers(io, project.value);
	if (!running.ok) return usageError(io, `${NAME}: ${running.error}`);
	const verdict = stackConfigVerdict(
		running.value,
		readStackRecord(recordPath(checkout.value, project.value)),
		filesDigest(files.value),
	);
	return report(
		io,
		{ project: project.value, folder, watched, restart },
		verdict,
	);
}

export const command: Command = {
	name: "stack-config",
	summary:
		"Compares the files that a long-lived local Supabase stack read at its start with the watched paths of this checkout. It reads the project_id of <folder>/config.toml, the containers of that project that run, and the record that astack stack start wrote. Exits 1 when no container runs, when no record exists, when no recorded container still runs, or when the files differ. It prints an astack stack start command with the restart command for the owner, and never restarts.",
	usage:
		"check stack-config <folder> --watch <path> [--watch <path>]... --restart <command>",
	run,
};
