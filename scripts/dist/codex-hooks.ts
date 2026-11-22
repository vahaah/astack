import { readCodexHooks } from "../../src/astack/codex-hooks.ts";

const result = await readCodexHooks({
	cwd: process.argv[2] ?? process.cwd(),
	env: process.env,
	timeoutMs: 30_000,
});
if (result.kind === "listed")
	process.stdout.write(`${JSON.stringify(result.list)}\n`);
else {
	process.stderr.write(`${result.cause}\n`);
	process.exitCode = 1;
}
