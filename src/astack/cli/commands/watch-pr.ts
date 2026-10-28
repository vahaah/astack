import { ghRuntime, main } from "../../watch-pr/cli.ts";
import type { Command } from "../command.ts";

export const command: Command<Promise<number>> = {
	name: "watch-pr",
	summary:
		"Watches a pull request, its open stack or a queued stack through gh, and prints each verdict as JSON, or as text with --pretty. It exits with the code of the last verdict, and a usage error exits 64.",
	usage:
		"watch-pr [--pr <n>] [--stack | --queued-stack [--stack-prs <n,...>]] [--status-only] [--pretty]",
	run: (args, io) => main(args, ghRuntime(io)),
};
