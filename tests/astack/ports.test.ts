import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CursorStore,
	runCursorHook,
} from "../../src/astack/hook/cursor.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import {
	ALLOW,
	defineHandler,
	type Handler,
} from "../../src/astack/hook/events.ts";
import { type Ports, portsFrom, processPorts } from "../../src/astack/ports.ts";
import { fakePorts } from "./fake-ports.ts";

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-ports-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function counted(links: Readonly<Record<string, string>>) {
	const reads: string[] = [];
	const roots: string[] = [];
	const base = fakePorts({
		profiles: { "/private/var/r": { ste: { mode: "deny" } } },
	});
	const raw: Ports = {
		files: {
			...base.files,
			realPath: (path) => links[path] ?? path,
		},
		git: {
			...base.git,
			gitRoot: (cwd) => {
				roots.push(cwd);
				return "/private/var/r";
			},
		},
		profile: {
			readProfile: (dir) => {
				reads.push(dir);
				return base.profile.readProfile(dir);
			},
		},
	};
	return { raw, reads, roots };
}

describe("[control:ports-profile-once] one Ports value", () => {
	test("reads the profile of each canonical folder once and gives that value again", () => {
		const { raw, reads } = counted({ "/var/r": "/private/var/r" });
		const ports = portsFrom(raw);
		const first = ports.profile.readProfile("/private/var/r");
		expect(first).toEqual({ ste: { mode: "deny" } });
		expect(ports.profile.readProfile("/var/r")).toBe(first);
		expect(ports.profile.readProfile("/private/var/r")).toBe(first);
		expect(reads).toEqual(["/private/var/r"]);
	});

	test("a folder with no profile is read once too", () => {
		const { raw, reads } = counted({});
		const ports = portsFrom(raw);
		expect(ports.profile.readProfile("/none")).toBeUndefined();
		expect(ports.profile.readProfile("/none")).toBeUndefined();
		expect(reads).toEqual(["/none"]);
	});

	test("the git root of a canonical folder is read once", () => {
		const { raw, roots } = counted({ "/var/r": "/private/var/r" });
		const ports = portsFrom(raw);
		expect(ports.git.gitRoot("/var/r")).toBe("/private/var/r");
		expect(ports.git.gitRoot("/private/var/r")).toBe("/private/var/r");
		expect(roots).toEqual(["/var/r"]);
	});

	test("a second value reads again, so no answer leaks across hook calls", () => {
		const { raw, reads } = counted({});
		portsFrom(raw).profile.readProfile("/private/var/r");
		portsFrom(raw).profile.readProfile("/private/var/r");
		expect(reads).toEqual(["/private/var/r", "/private/var/r"]);
	});
});

describe("[control:ports-profile-once] one hook call", () => {
	const real = join(scratch, "repo");
	const linked = join(scratch, "linked");
	const git = (...args: string[]) => spawnSync("git", args, { cwd: real });
	mkdirSync(join(real, ".astack"), { recursive: true });
	symlinkSync(real, linked);
	git("init", "-q", "-b", "main");
	git("config", "user.email", "t@example.com");
	git("config", "user.name", "T");
	writeFileSync(
		join(real, ".astack/profile.json"),
		JSON.stringify({ ste: { mode: "deny" } }),
	);
	writeFileSync(join(real, "a.ts"), "export const a = 1;\n");
	writeFileSync(
		join(real, "notes.md"),
		"# Notes\n\nThe tool reads the file.\n",
	);
	git("add", ".");
	git("commit", "-q", "-m", "first");
	writeFileSync(join(real, "a.ts"), "export const a = 2;\n");
	git("add", "a.ts");

	function reads(dir: string, fields: Readonly<Record<string, unknown>>) {
		const spy = spyOn(fs, "readFileSync");
		try {
			runHook(
				"claude-code",
				"PreToolUse",
				JSON.stringify({ cwd: dir, session_id: "ports", ...fields }),
				{ ASTACK_STATE_DIR: join(scratch, "state") },
			);
			return spy.mock.calls.filter(([path]) =>
				String(path).endsWith(".astack/profile.json"),
			).length;
		} finally {
			spy.mockRestore();
		}
	}

	test.each([
		["the repo folder", real],
		["a link to the repo folder", linked],
	])(
		"a Write, an Edit and a git commit in %s each read the profile once",
		(_name, dir) => {
			expect([
				reads(dir, {
					tool_name: "Write",
					tool_input: {
						file_path: join(dir, "b.ts"),
						content: "export const b = 1;\n",
					},
				}),
				reads(dir, {
					tool_name: "Edit",
					tool_input: {
						file_path: join(dir, "notes.md"),
						old_string: "reads",
						new_string: "opens",
					},
				}),
				reads(dir, {
					tool_name: "Bash",
					tool_input: { command: 'git commit -m "feat: change a"' },
				}),
			]).toEqual([1, 1, 1]);
		},
	);
});

describe("[control:ports-one-edge] each hook call", () => {
	function edge() {
		const built: Ports[] = [];
		const seen: Ports[] = [];
		const watcher: Handler = defineHandler({
			id: "watcher",
			on: ["write", "shell", "reply"],
			run: (_event, context) => {
				seen.push(context.ports);
				return ALLOW;
			},
		});
		const ports = () => {
			const made = fakePorts({ files: { [join(scratch, "a.ts")]: "x\n" } });
			built.push(made);
			return made;
		};
		return { built, seen, ports, handlers: [watcher, watcher] };
	}

	test("runHook builds the ports once and gives that value to each handler", () => {
		const { built, seen, ports, handlers } = edge();
		runHook(
			"claude-code",
			"PreToolUse",
			JSON.stringify({
				cwd: scratch,
				tool_name: "Bash",
				tool_input: { command: "git status && ls" },
			}),
			{},
			{ cwd: scratch, today: "2026-11-23", ports, handlers },
		);
		expect(built.length).toBe(1);
		expect(seen.length).toBe(2);
		expect(new Set([...built, ...seen]).size).toBe(1);
	});

	const store: CursorStore = {
		saveReply: () => {},
		takeReply: () => "the reply",
		saveProblem: () => {},
		problems: () => [],
		removeProblem: () => {},
		addNote: () => {},
		takeNotes: () => [],
	};

	test.each([
		[
			"afterFileEdit",
			{
				file_path: join(scratch, "a.ts"),
				edits: [{ old_string: "", new_string: "x\n" }],
			},
		],
		["stop", { status: "completed" }],
		["beforeShellExecution", { command: "ls", cwd: scratch }],
	] as const)("runCursorHook builds the ports once for %s", (event, fields) => {
		const { built, seen, ports, handlers } = edge();
		runCursorHook(
			event,
			JSON.stringify({
				conversation_id: "c1",
				workspace_roots: [scratch],
				...fields,
			}),
			{},
			{ cwd: scratch, today: "2026-11-23", ports, handlers, store },
		);
		expect(built.length).toBe(1);
		expect(seen.length).toBe(2);
		expect(new Set([...built, ...seen]).size).toBe(1);
	});
});

describe("[control:ports-total] the node ports", () => {
	const file = join(scratch, "file.txt");
	writeFileSync(file, "x\n");
	const missing = join(scratch, "missing");
	const ports = processPorts();

	test.each([
		["a missing file", missing, "missing"],
		["a path under a file", join(file, "below"), "unreadable"],
	] as const)("give no throw on %s", (_name, path, kind) => {
		expect(ports.files.readText(path)).toBeUndefined();
		expect(ports.files.pathKind(path)).toBe(kind);
		expect(ports.files.realPath(path)).toBeUndefined();
		expect(ports.files.listDir(path)).toBeUndefined();
		expect(ports.files.isExecutable(path)).toBe(false);
		expect(ports.files.folderId(path)).toBeUndefined();
		expect(ports.files.isScratch(scratch, path)).toBe(false);
		expect(ports.profile.readProfile(path)).toBeUndefined();
	});

	test.each([
		["a missing folder", missing],
		["a folder that is no repo", scratch],
	])("give a failed git result on %s", (_name, dir) => {
		const run = ports.git.gitRun(dir, ["rev-parse", "--show-toplevel"]);
		expect(run.ok).toBe(false);
		expect(run.stdout.length).toBe(0);
		expect(ports.git.gitText(dir, ["status"])).toBeUndefined();
		expect(ports.git.gitRoot(dir)).toBeUndefined();
		expect(ports.git.gitBranch(dir)).toBeUndefined();
		expect(ports.git.gitOrigin(dir)).toBeUndefined();
		expect(ports.git.gitChanges(dir, { staged: true })).toBeUndefined();
	});

	test("read a folder and a file that exist", () => {
		expect(ports.files.readText(file)).toBe("x\n");
		expect(ports.files.pathKind(scratch)).toBe("directory");
		expect(ports.files.listDir(scratch)).toContain("file.txt");
		expect(ports.files.folderId(scratch)?.inode).toMatch(/^\d+$/);
	});
});
