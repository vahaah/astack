import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "../../../src/astack/cli/io.ts";
import { runOrch } from "../../../src/astack/orch/cli.ts";

const directories: string[] = [];

afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});

async function makeDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "orch-cli-"));
	directories.push(directory);
	return directory;
}

async function run(
	args: readonly string[],
	options: {
		readonly env?: Record<string, string | undefined>;
		readonly cwd?: string;
	} = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
	const out: string[] = [];
	const err: string[] = [];
	const io: Io = {
		out: (text) => out.push(text),
		err: (text) => err.push(text),
		cwd: options.cwd ?? tmpdir(),
		env: options.env ?? {},
		today: "2026-10-24",
		now: new Date("2026-10-24T00:00:00Z"),
		scriptPath: undefined,
	};
	const code = await runOrch(args, io);
	return { code, stdout: out.join(""), stderr: err.join("") };
}

describe("astack orch", () => {
	test("prints the help of the program and of one command with exit 0", async () => {
		const help = await run(["--help"]);
		expect(help.code).toBe(0);
		expect(help.stdout).toContain("Commands:");
		expect(help.stdout).toContain("unit add <id>");
		expect(help.stdout).toContain("ledger record <pr> <sha> <verdict>");

		const frontierHelp = await run(["frontier", "set", "-h"]);
		expect(frontierHelp.code).toBe(0);
		expect(frontierHelp.stdout).toContain(
			"usage: astack orch frontier set [options]",
		);
		expect(frontierHelp.stdout).toContain("--repo <dir>");
		expect(frontierHelp.stdout).toContain("--forge <forge>");
		expect(frontierHelp.stdout).toContain("--prs <n,...>");
	});

	test.each([
		[
			"a missing required option",
			["unit", "add", "u1"],
			"required option '--track <track>' not specified",
		],
		[
			"an option of another command",
			["unit", "get", "u1", "--track", "build"],
			"unknown option '--track' for 'unit get'",
		],
		["an unknown option", ["--bogus"], "Unknown option '--bogus'"],
		["a missing argument", ["unit", "get"], "missing required argument 'id'"],
		[
			"an extra argument",
			["unit", "get", "u1", "u2"],
			"too many arguments for 'unit get'",
		],
		[
			"an unknown command",
			["unit", "remove", "u1"],
			"unknown command 'unit remove'",
		],
		[
			"a number that is not a positive integer",
			["unit", "set", "u1", "--state", "done", "--pr", "0"],
			"--pr must be a positive integer",
		],
		[
			"a forge that is not gh",
			["frontier", "set", "--repo", ".", "--forge", "gt"],
			"forge must be gh",
		],
	])("refuses %s with exit 1 and the usage", async (_, args, message) => {
		const directory = await makeDirectory();
		const result = await run(["--store", directory, ...args]);
		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toStartWith(`error: ${message}`);
		expect(result.stderr).toContain("usage: astack orch");
	});

	test("reads the store from ORCH_STORE and emits complete JSON", async () => {
		const directory = await makeDirectory();
		const env = { ORCH_STORE: directory };
		expect((await run(["init"], { env })).code).toBe(0);

		const added = await run(
			["unit", "add", "u1", "--track", "build", "--json"],
			{ env },
		);
		expect(added.code).toBe(0);
		expect(JSON.parse(added.stdout)).toEqual({
			id: "u1",
			track: "build",
			state: "pending",
			branch: "",
			pr: "",
			sha: "",
			brief: "",
		});
	});

	test("resolves a relative store against the current folder", async () => {
		const cwd = await makeDirectory();
		const result = await run(["--store", "store", "init"], { cwd });
		expect(result).toEqual({
			code: 0,
			stdout: `initialized ${join(cwd, "store")}\n`,
			stderr: "",
		});
	});

	test("maps user and not-found outcomes to the preserved exit codes", async () => {
		const missingStore = await run(["init"]);
		expect(missingStore.code).toBe(1);
		expect(missingStore.stderr).toStartWith(
			"error: set --store <dir> or ORCH_STORE\n",
		);

		const directory = await makeDirectory();
		expect((await run(["--store", directory, "init"])).code).toBe(0);

		const missingRepo = await run(["--store", directory, "frontier", "set"]);
		expect(missingRepo.code).toBe(1);
		expect(missingRepo.stderr).toStartWith(
			"error: set --repo <dir> or ORCH_REPO\n",
		);

		const userError = await run([
			"--store",
			directory,
			"unit",
			"add",
			"",
			"--track",
			"build",
		]);
		expect(userError).toEqual({
			code: 1,
			stdout: "",
			stderr: "error: unit id must not be empty\n",
		});

		const missingUnit = await run([
			"--store",
			directory,
			"unit",
			"get",
			"missing",
		]);
		expect(missingUnit).toEqual({
			code: 2,
			stdout: "",
			stderr: "error: unit missing not found\n",
		});

		const missingLedger = await run([
			"--store",
			directory,
			"--json",
			"ledger",
			"check",
			"184530",
			"abc123",
		]);
		expect(missingLedger.code).toBe(2);
		expect(JSON.parse(missingLedger.stdout)).toEqual({
			pr: "184530",
			sha: "abc123",
			verdict: "NOT-VERIFIED",
		});
		expect(missingLedger.stderr).toBe("");
	});
});
