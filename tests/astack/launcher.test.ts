import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { floorStop, NODE_FLOOR } from "../../src/astack/cli/floor.ts";

const LAUNCHER = resolve(
	import.meta.dir,
	"../../marketplace/plugins/astack/bin/astack",
);
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-launcher-"));
	dirs.push(dir);
	return dir;
}

function fakeRuntime(dir: string, name: string): string {
	const path = join(dir, name);
	writeFileSync(path, `#!/bin/sh\necho "${name} $*"\n`);
	chmodSync(path, 0o755);
	return path;
}

function loggingNode(dir: string, log: string): string {
	const path = join(dir, "node");
	writeFileSync(path, `#!/bin/sh\necho "$*" >> '${log}'\necho "node $*"\n`);
	chmodSync(path, 0o755);
	return path;
}

function brokenNode(dir: string): string {
	const path = join(dir, "node");
	writeFileSync(
		path,
		'#!/bin/sh\nif [ "$1" = --version ]; then echo v14.21.3; exit 0; fi\necho "SyntaxError: Unexpected token" >&2\nexit 1\n',
	);
	chmodSync(path, 0o755);
	return path;
}

function isolatedLauncher(home: string): string {
	const isolated = join(home, "astack");
	writeFileSync(
		isolated,
		readFileSync(LAUNCHER, "utf8").replace(
			/\/(?:opt\/homebrew|usr\/local)\/bin\//g,
			`${home}/none/`,
		),
	);
	chmodSync(isolated, 0o755);
	return isolated;
}

function launch(
	env: Record<string, string>,
	args: readonly string[] = ["check", "plan"],
	launcher = LAUNCHER,
	input?: string,
): {
	status: number | null;
	stdout: string;
	stderr: string;
} {
	const result = spawnSync(launcher, [...args], {
		encoding: "utf8",
		env: { PATH: "/usr/bin:/bin", ...env },
		...(input === undefined ? {} : { input }),
	});
	return {
		status: result.status,
		stdout: result.stdout.trim(),
		stderr: result.stderr,
	};
}

describe("bin/astack", () => {
	test("ASTACK_RUNTIME comes first", () => {
		const home = scratch();
		const runtime = fakeRuntime(home, "first");
		const run = launch({ HOME: home, ASTACK_RUNTIME: runtime });
		expect(run.status).toBe(0);
		expect(run.stdout).toEndWith("/astack.js check plan");
		expect(run.stdout).toStartWith("first ");
	});

	test("the saved runtime comes next, and a missing ASTACK_RUNTIME is skipped", () => {
		const home = scratch();
		const saved = fakeRuntime(home, "saved");
		mkdirSync(join(home, ".local/state/astack"), { recursive: true });
		writeFileSync(join(home, ".local/state/astack/runtime"), `${saved}\n`);
		const run = launch({
			HOME: home,
			ASTACK_RUNTIME: join(home, "missing"),
		});
		expect(run.stdout).toStartWith("saved ");
	});

	test("[control:sg-runtime-no-probe] a node from PATH runs the command with no --version call", () => {
		const home = scratch();
		const bin = join(home, "bin");
		mkdirSync(bin);
		const log = join(home, "node.log");
		loggingNode(bin, log);
		const run = launch({ HOME: home, PATH: `${bin}:/usr/bin:/bin` });
		expect(run.stdout).toBe(
			`node ${resolve(LAUNCHER, "..")}/astack.js check plan`,
		);
		expect(readFileSync(log, "utf8")).toBe(
			`${resolve(LAUNCHER, "..")}/astack.js check plan\n`,
		);
	});

	test("[control:sg-runtime-bun-first] bun on PATH comes before node on PATH", () => {
		const home = scratch();
		const nodeBin = join(home, "node-bin");
		const bunBin = join(home, "bun-bin");
		mkdirSync(nodeBin);
		mkdirSync(bunBin);
		fakeRuntime(nodeBin, "node");
		fakeRuntime(bunBin, "bun");
		const run = launch({
			HOME: home,
			PATH: `${nodeBin}:${bunBin}:/usr/bin:/bin`,
		});
		expect(run.stdout).toStartWith("bun ");
	});

	test("[control:sg-runtime-floor] a hook on a node that cannot load the bundle exits 0 with the floor message, and a Cursor event gets the allow JSON", () => {
		const home = scratch();
		const bin = join(home, "bin");
		mkdirSync(bin);
		const node = brokenNode(bin);
		const isolated = isolatedLauncher(home);
		const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin` };
		const message = `astack: ${node} is node 14.21.3, which is older than node 22, so the astack checks did not run. Set ASTACK_RUNTIME to the path of node 22 or later or bun.\n`;
		const claude = launch(env, ["hook", "claude-code", "Stop"], isolated, "{}");
		expect(claude).toEqual({
			status: 0,
			stdout: "",
			stderr: `SyntaxError: Unexpected token\n${message}`,
		});
		const cursor = launch(
			env,
			["hook", "cursor", "preToolUse"],
			isolated,
			"{}",
		);
		expect(cursor.status).toBe(0);
		expect(JSON.parse(cursor.stdout)).toEqual({ permission: "allow" });
		expect(cursor.stderr).toBe(`SyntaxError: Unexpected token\n${message}`);
	});

	test("[control:sg-runtime-none] with no runtime, a command that is not a hook exits 1", () => {
		const home = scratch();
		const tools = join(home, "tools");
		mkdirSync(tools);
		symlinkSync("/usr/bin/dirname", join(tools, "dirname"));
		const run = launch(
			{ HOME: home, PATH: tools },
			["check", "plan"],
			isolatedLauncher(home),
		);
		expect(run).toEqual({
			status: 1,
			stdout: "",
			stderr:
				"astack: found no node 22 or later and no bun, so the astack checks did not run. Set ASTACK_RUNTIME to the path of node or bun.\n",
		});
	});

	test("with no runtime, Cursor permission events get valid JSON that allows", () => {
		const home = scratch();
		const empty = join(home, "empty-path");
		mkdirSync(empty);
		const isolated = isolatedLauncher(home);
		const cursor = (event: string) =>
			launch(
				{ HOME: home, PATH: empty },
				["hook", "cursor", event],
				isolated,
				"{}",
			).stdout;
		for (const event of [
			"preToolUse",
			"beforeShellExecution",
			"beforeMCPExecution",
		])
			expect(JSON.parse(cursor(event))).toEqual({ permission: "allow" });
		expect(JSON.parse(cursor("beforeSubmitPrompt"))).toEqual({
			continue: true,
		});
		expect(JSON.parse(cursor("stop"))).toEqual({});
		expect(
			launch(
				{ HOME: home, PATH: empty },
				["hook", "claude-code", "Stop"],
				isolated,
			).stdout,
		).toBe("");
	});

	test("a link to the launcher finds the bundle beside the real file", () => {
		const home = scratch();
		const runtime = fakeRuntime(home, "linked");
		const link = join(home, "astack");
		symlinkSync(LAUNCHER, link);
		const run = launch({ HOME: home, ASTACK_RUNTIME: runtime }, ["x"], link);
		expect(run.stdout).toBe(`linked ${resolve(LAUNCHER, "..")}/astack.js x`);
	});

	test("a copy outside the repository loads the bundle as an ES module", () => {
		const home = scratch();
		const bin = join(home, "cache", "astack", "bin");
		mkdirSync(bin, { recursive: true });
		for (const file of ["astack", "astack.js", "package.json"])
			copyFileSync(resolve(LAUNCHER, "..", file), join(bin, file));
		chmodSync(join(bin, "astack"), 0o755);
		const result = spawnSync(
			process.execPath.endsWith("bun") ? "node" : process.execPath,
			["--no-experimental-detect-module", join(bin, "astack.js"), "--help"],
			{ encoding: "utf8" },
		);
		expect(result.stderr).not.toContain("Failed to load the ES module");
		expect(result.stdout).toContain("astack hook");
	});
});

describe("the node floor", () => {
	test("the launcher floor is NODE_FLOOR", () => {
		expect(/^floor=(\d+)$/m.exec(readFileSync(LAUNCHER, "utf8"))?.[1]).toBe(
			String(NODE_FLOOR),
		);
	});

	const below = `astack: node 21.7.3 is older than node ${NODE_FLOOR}, so the astack checks did not run. Set ASTACK_RUNTIME to the path of node ${NODE_FLOOR} or later or bun.\n`;
	test.each<
		[
			string,
			Parameters<typeof floorStop>[0],
			string[],
			ReturnType<typeof floorStop>,
		]
	>([
		[
			"node 21 stops a command with exit 1",
			{ node: "21.7.3" },
			["check", "plan"],
			{ code: 1, message: below },
		],
		[
			"node 21 lets a hook pass with exit 0",
			{ node: "21.7.3" },
			["hook", "claude-code", "Stop"],
			{ code: 0, message: below },
		],
		[
			"node 22 runs the command",
			{ node: "22.0.0" },
			["check", "plan"],
			undefined,
		],
		[
			"bun runs the command",
			{ node: "21.7.3", bun: "1.4.3" },
			["check", "plan"],
			undefined,
		],
	])("[control:sg-runtime-entry] %s", (_name, versions, args, expected) => {
		expect(floorStop(versions, args)).toEqual(expected);
	});
});
