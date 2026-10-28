import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(
	import.meta.dir,
	"../marketplace/plugins/astack/skills/control-cli/scripts/pty_session.py",
);
const sessions: {
	dir: string;
	process: Bun.Subprocess<"ignore", "pipe", "pipe">;
}[] = [];

function start(command: string[], extra: string[] = []) {
	const dir = mkdtempSync(join(tmpdir(), "pty-session-"));
	const process = Bun.spawn(
		["python3", script, "start", "--dir", dir, ...extra, "--", ...command],
		{
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	sessions.push({ dir, process });
	return { dir, process };
}

function run(...args: string[]) {
	const result = Bun.spawnSync(["python3", script, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: result.exitCode,
		out: result.stdout.toString(),
		err: result.stderr.toString(),
	};
}

function offsetOf(output: string): string {
	const match = /offset (\d+)/.exec(output);
	if (!match?.[1]) throw new Error(`no offset in ${output}`);
	return match[1];
}

afterEach(() => {
	for (const { dir, process } of sessions.splice(0)) {
		process.kill("SIGKILL");
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("pty_session.py", () => {
	test("sends text, waits for output after the send, and reports the exit code", async () => {
		const { dir, process } = start([
			"sh",
			"-c",
			'printf "ready> "; read line; echo "got:$line"; exit 3',
		]);
		expect(
			run("wait", "--dir", dir, "--pattern", "ready>", "--timeout", "10").code,
		).toBe(0);
		const sent = run(
			"send",
			"--dir",
			dir,
			"--text",
			"hello",
			"--keys",
			"Enter",
		);
		expect(sent.code).toBe(0);
		expect(
			run(
				"wait",
				"--dir",
				dir,
				"--after",
				offsetOf(sent.out),
				"--pattern",
				"^got:hello$",
				"--timeout",
				"10",
			).code,
		).toBe(0);
		expect(await process.exited).toBe(0);
		expect(await new Response(process.stdout).text()).toBe("exit 3\n");
		expect(readFileSync(join(dir, "exit"), "utf8")).toBe("3");
	});

	test("delivers Ctrl-C through the terminal as SIGINT", async () => {
		const { dir, process } = start([
			"sh",
			"-c",
			'trap "echo trapped; exit 7" INT; echo armed; while :; do sleep 0.1; done',
		]);
		expect(
			run("wait", "--dir", dir, "--pattern", "armed", "--timeout", "10").code,
		).toBe(0);
		run("send", "--dir", dir, "--keys", "C-c");
		expect(
			run("wait", "--dir", dir, "--pattern", "trapped", "--timeout", "10").code,
		).toBe(0);
		await process.exited;
		expect(readFileSync(join(dir, "exit"), "utf8")).toBe("7");
	});

	test("sets and changes the terminal size", () => {
		const { dir } = start(
			["sh", "-c", "stty size; read line; stty size; sleep 30"],
			["--rows", "30", "--cols", "100"],
		);
		expect(
			run("wait", "--dir", dir, "--pattern", "^30 100$", "--timeout", "10")
				.code,
		).toBe(0);
		run("send", "--dir", dir, "--resize", "40", "120");
		run("send", "--dir", dir, "--keys", "Enter");
		expect(
			run("wait", "--dir", dir, "--pattern", "^40 120$", "--timeout", "10")
				.code,
		).toBe(0);
	});

	test("stop ends a session that ignores its input", async () => {
		const { dir, process } = start(["sleep", "60"]);
		expect(run("send", "--dir", dir, "--text", "").code).toBe(0);
		const stopped = run("stop", "--dir", dir);
		expect(stopped.code).toBe(0);
		expect(stopped.out).toBe(`exit ${128 + 15}\n`);
		await process.exited;
		expect(existsSync(join(dir, "control"))).toBe(false);
	});

	test("wait reports a timeout and a session that ended first", async () => {
		const { dir, process } = start(["sh", "-c", "echo done"]);
		await process.exited;
		expect(
			run("wait", "--dir", dir, "--pattern", "never-printed", "--timeout", "2")
				.code,
		).toBe(3);
		const live = start(["sleep", "30"]);
		expect(
			run(
				"wait",
				"--dir",
				live.dir,
				"--pattern",
				"never-printed",
				"--timeout",
				"0.5",
			).code,
		).toBe(1);
	});

	test("send rejects an unknown key name and a missing session", () => {
		const dir = mkdtempSync(join(tmpdir(), "pty-session-"));
		sessions.push({
			dir,
			process: Bun.spawn(["true"], {
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			}),
		});
		expect(run("send", "--dir", dir, "--keys", "Bogus").code).toBe(2);
		expect(run("send", "--dir", dir, "--text", "x").code).toBe(3);
	});

	test("screen strips escape codes and carriage-return overwrites", async () => {
		const { dir, process } = start([
			"sh",
			"-c",
			'printf "\\033[31mred\\033[0m\\n"; printf "old\\rnew\\n"',
		]);
		await process.exited;
		const screen = run("screen", "--dir", dir).out;
		expect(screen).toContain("red");
		expect(screen).toContain("new");
		expect(screen).not.toContain("old");
		expect(screen).not.toContain("\u001b");
	});
});
