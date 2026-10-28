import { ORCH_USAGE, runOrch } from "../../orch/cli.ts";
import type { Command } from "../command.ts";

export const command: Command<Promise<number>> = {
	name: "orch",
	summary:
		"Reads and writes the plain-file store of an orchestrate run. Run astack orch --help for its commands. An error exits 1, and a record that is not in the store exits 2.",
	usage: ORCH_USAGE,
	run: runOrch,
};
