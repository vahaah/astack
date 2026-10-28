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

function oldNode(dir: string, name: string): string {
	const path = join(dir, name);
	writeFileSync(
		path,
		`#!/bin/sh\nif [ "$1" = --version ]; then echo v20.18.0; exit 0; fi\necho "${name} $*"\n`,
	);
	chmodSync(path, 0o755);
	return path;
}

function launch(
	env: Record<string, string>,
	args: readonly string[] = ["check", "plan"],
	launcher = LAUNCHER,
	input?: string,
): {
	status: number | null;
	stdout: string;
} {
	const result = spawnSync(launcher, [...args], {
		encoding: "utf8",
		env: { PATH: "/usr/bin:/bin", ...env },
		...(input === undefined ? {} : { input }),
	});
	return { status: result.status, stdout: result.stdout.trim() };
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

	test("a node below version 22 is skipped for the next runtime", () => {
		const home = scratch();
		const old = oldNode(home, "old");
		const saved = fakeRuntime(home, "saved");
		mkdirSync(join(home, ".local/state/astack"), { recursive: true });
		writeFileSync(join(home, ".local/state/astack/runtime"), `${saved}\n`);
		const run = launch({ HOME: home, ASTACK_RUNTIME: old });
		expect(run.stdout).toStartWith("saved ");
	});

	test("with no runtime, Cursor permission events get valid JSON that allows", () => {
		const home = scratch();
		const empty = join(home, "empty-path");
		mkdirSync(empty);
		const isolated = join(home, "astack");
		writeFileSync(
			isolated,
			readFileSync(LAUNCHER, "utf8").replace(
				/\/(?:opt\/homebrew|usr\/local)\/bin\//g,
				`${home}/none/`,
			),
		);
		chmodSync(isolated, 0o755);
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
