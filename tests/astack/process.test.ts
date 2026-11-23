import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../../src/astack/process.ts";

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-process-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function output(program: string, args: readonly string[], options = {}) {
	const run = runProcess(program, args, options);
	if (!run.ok) throw new Error(`no start: ${run.error.cause}`);
	return {
		status: run.value.status,
		signal: run.value.signal,
		stdout: run.value.stdout.toString("utf8"),
		stderr: run.value.stderr.toString("utf8"),
		stopped: run.value.stopped,
	};
}

describe("[control:process-run] runProcess", () => {
	test("gives the status, stdout and stderr of a run that exits", () => {
		expect(output("bash", ["-c", "echo out; echo err >&2; exit 3"])).toEqual({
			status: 3,
			signal: null,
			stdout: "out\n",
			stderr: "err\n",
			stopped: undefined,
		});
	});

	test("sends the input, the folder and the environment", () => {
		expect(
			output("bash", ["-c", 'read line; echo "$line $X $PWD"'], {
				input: "hello\n",
				cwd: scratch,
				env: { X: "y", PATH: process.env.PATH },
			}).stdout,
		).toBe(`hello y ${scratch}\n`);
	});

	test("gives the stop cause of a run that passes its timeout", () => {
		const run = output("sleep", ["1"], { timeoutMs: 50 });
		expect(run.status).toBeNull();
		expect(run.signal).toBe("SIGTERM");
		expect(run.stopped).toContain("ETIMEDOUT");
	});

	test("gives empty output for a run that writes to the parent streams", () => {
		const run = output("bash", ["-c", "exit 0"], {
			stdin: "ignore",
			output: "inherit",
		});
		expect(run).toEqual({
			status: 0,
			signal: null,
			stdout: "",
			stderr: "",
			stopped: undefined,
		});
	});

	test.each([
		["a missing program", "astack-no-such-program", {}],
		["a missing folder", "bash", { cwd: join(scratch, "missing") }],
	])("gives the cause of %s that cannot start", (_name, program, options) => {
		const run = runProcess(program, ["-c", "exit 0"], options);
		expect(run.ok).toBe(false);
		if (!run.ok) expect(run.error.cause).toMatch(/ENOENT|not found/);
	});
});
