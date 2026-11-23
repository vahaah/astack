import { main } from "../src/astack/cli/main.ts";
import { baseRef } from "./lib/check-base.ts";

const base = baseRef(process.env, process.cwd());
if (!base.ok) {
	process.stderr.write(`${base.error}\n`);
	process.exit(1);
}
process.exitCode = await main(
	base.value === undefined
		? ["check", "adr"]
		: ["check", "adr", "--base", base.value],
);
