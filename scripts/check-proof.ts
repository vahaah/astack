import { main } from "../src/astack/cli/main.ts";

const args = ["check", "proof"];
if (process.env.GITHUB_EVENT_NAME === "pull_request") {
	const base = process.env.GITHUB_BASE_REF;
	if (base === undefined || base === "") {
		process.stderr.write("A pull-request proof needs GITHUB_BASE_REF.\n");
		process.exit(1);
	}
	args.push("--base", `origin/${base}`);
}
process.exitCode = await main(args);
