import { boardText, buildBoard, DEFAULT_WIP } from "../../plan/board.ts";
import { planSettings } from "../../plan/edge.ts";
import { positional, valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";
import { printPlan, setFor, snapshotFrom, VALUE_FLAGS } from "./plan.ts";

function run(args: readonly string[], io: Io): number {
	const [file] = positional(args, VALUE_FLAGS);
	if (!file) return usageError(io, "astack board: give the plan file");
	const loaded = setFor(file, io);
	if (!loaded) return 2;
	const snapshot = snapshotFrom(args, io, false);
	if (!snapshot) return 2;
	const flag = Number(valueAfter(args, "--wip") ?? Number.NaN);
	const wip =
		Number.isInteger(flag) && flag > 0
			? flag
			: (planSettings(loaded.root).wip ?? DEFAULT_WIP);
	const view = buildBoard(loaded.set, snapshot, wip);
	printPlan(io, args, view, boardText(view));
	return 0;
}

export const command: Command = {
	name: "board",
	summary:
		"Prints the derived board of a plan: PRs to drain first, active sessions, the startable frontier with the longest tail first, and the launches the WIP cap allows. Never commit it.",
	usage: "board <plan> [--tracker <file|->] [--wip <n>] [--json]",
	run,
};
