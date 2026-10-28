import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type HookDeps, runHook } from "../../src/astack/hook/dispatch.ts";
import { HANDLERS } from "../../src/astack/hook/handlers/index.ts";
import { handler as types } from "../../src/astack/hook/handlers/types.ts";

const FIXTURES = resolve(import.meta.dir, "../fixtures/types");
const CLI = resolve(import.meta.dir, "../../src/astack/cli/bin.ts");

function fixture(name: string): string {
	return readFileSync(join(FIXTURES, name), "utf8");
}

let project = "";
let repo = "";

function deps(handlers = [types]): HookDeps {
	return {
		cwd: project,
		today: "2026-10-16",
		readText: (path) => {
			try {
				return readFileSync(path, "utf8");
			} catch {
				return undefined;
			}
		},
		handlers,
	};
}

function preToolUse(
	tool_name: string,
	tool_input: Record<string, unknown>,
	handlers = [types],
) {
	return runHook(
		"claude-code",
		"PreToolUse",
		JSON.stringify({ cwd: project, session_id: "s1", tool_name, tool_input }),
		{ CLAUDE_PROJECT_DIR: project },
		deps(handlers),
	);
}

function git(cwd: string, ...args: string[]): void {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr);
}

function astack(...args: string[]) {
	const result = spawnSync(process.execPath, [CLI, ...args], {
		cwd: repo,
		encoding: "utf8",
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

beforeAll(() => {
	project = mkdtempSync(join(tmpdir(), "astack-types-hook-"));
	mkdirSync(join(project, "src"));
	writeFileSync(join(project, "src/invite.ts"), fixture("base.ts"));
	writeFileSync(join(project, "src/notes.md"), "value as any\n");

	repo = mkdtempSync(join(tmpdir(), "astack-types-cli-"));
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.email", "test@example.com");
	git(repo, "config", "user.name", "Test");
	mkdirSync(join(repo, "src"));
	writeFileSync(join(repo, "src/invite.ts"), fixture("base.ts"));
	git(repo, "add", ".");
	git(repo, "commit", "-q", "-m", "base");
});

afterAll(() => {
	rmSync(project, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

describe("the types hook", () => {
	const file = () => join(project, "src/invite.ts");

	test("an Edit that adds a cast to a file with old casts is denied", () => {
		const output = preToolUse("Edit", {
			file_path: file(),
			old_string: "\treturn rows[0]!.id;",
			new_string: "\treturn (rows as Row[])[0]!.id;",
		});
		expect(output.exit).toBe(2);
		expect(output.stdout).toBe("");
		expect(output.stderr).toStartWith(
			"astack blocked this edit. It adds code that hides type errors from the compiler.\n- src/invite.ts: unsafe cast, 4 now and 3 before.\n  - line 9: return (rows as Row[])[0]!.id;\n",
		);
	});

	test("an Edit that renames on an old cast line is silent", () => {
		const output = preToolUse("Edit", {
			file_path: file(),
			old_string:
				"const raw = JSON.parse(text) as Record<string, unknown>;\n\treturn parseInvite(raw);",
			new_string:
				"const parsed = JSON.parse(text) as Record<string, unknown>;\n\treturn parseInvite(parsed);",
		});
		expect(output).toEqual({ stdout: "", stderr: "", exit: 0 });
	});

	test("a Write that adds an enum gets a note, not a deny", () => {
		const output = preToolUse("Write", {
			file_path: join(project, "src/role.ts"),
			content: fixture("advice.ts"),
		});
		expect(output.exit).toBe(0);
		const context = JSON.parse(output.stdout).hookSpecificOutput
			.additionalContext;
		expect(context).toStartWith(
			"astack: this change adds type code to review.\n",
		);
		expect(context).toContain("- src/role.ts: `enum`, 1 now and 0 before.");
	});

	test("a MultiEdit is checked as one write of the final file", () => {
		const output = preToolUse("MultiEdit", {
			file_path: file(),
			edits: [
				{
					old_string: "export function legacy",
					new_string: "export function older",
				},
				{
					old_string: "\treturn value;",
					new_string: "\treturn value!;",
				},
			],
		});
		expect(output.exit).toBe(2);
		expect(output.stderr).toContain(
			"astack blocked this write. It adds code that hides type errors from the compiler.\n- src/invite.ts: non-null assertion `!`, 2 now and 1 before.\n  - line 13: return value!;",
		);
	});

	test("a profile allow entry exempts the kind in its paths", () => {
		mkdirSync(join(project, ".astack"), { recursive: true });
		writeFileSync(
			join(project, ".astack/profile.json"),
			JSON.stringify({
				types: {
					allow: [
						{
							paths: ["src/brand.ts"],
							kinds: ["cast"],
							reason: "brand constructors",
						},
					],
				},
			}),
		);
		const content = "export const userId = (raw: string) => raw as UserId;\n";
		const allowed = preToolUse("Write", {
			file_path: join(project, "src/brand.ts"),
			content,
		});
		const denied = preToolUse("Write", {
			file_path: join(project, "src/other.ts"),
			content,
		});
		rmSync(join(project, ".astack"), { recursive: true, force: true });
		expect(allowed.exit).toBe(0);
		expect(denied.exit).toBe(2);
	});

	test("Markdown, declaration and generated files are silent", () => {
		for (const [path, content] of [
			["src/notes.md", "value as any\n"],
			["src/env.d.ts", "declare const x: any;\n"],
			["src/db.ts", fixture("supabase.ts")],
			["src/client.ts", fixture("generated.ts")],
		] as const)
			expect(
				preToolUse("Write", { file_path: join(project, path), content }),
			).toEqual({ stdout: "", stderr: "", exit: 0 });
	});

	test("the registry runs the types hook beside the other handlers", () => {
		const output = preToolUse(
			"Write",
			{
				file_path: join(project, "src/new.ts"),
				content: "export let a: any;\n",
			},
			[...HANDLERS],
		);
		expect(output.exit).toBe(2);
		expect(output.stderr).toContain(
			"- src/new.ts: `any` type, 1 now and 0 before.",
		);
	});

	test("the full registry reports a new compiler directive once, from the types hook", () => {
		const output = preToolUse(
			"Edit",
			{
				file_path: file(),
				old_string: "\treturn value;",
				new_string: "\t// @ts-ignore\n\treturn value;",
			},
			[...HANDLERS],
		);
		expect(output.exit).toBe(2);
		expect(output.stderr).toContain("`@ts-ignore`, 1 now and 0 before.");
		expect(output.stderr).not.toContain("it adds comments");
		expect(output.stderr).not.toContain("suppresses a correctness");
	});

	test("a shell heredoc and an echo into a source file are checked", () => {
		const heredoc = preToolUse("Bash", {
			command:
				"cat > src/h.ts <<'X'\nexport const v: any = 1;\nexport const w = (1 as unknown) as string;\nX",
		});
		expect(heredoc.exit).toBe(2);
		expect(heredoc.stderr).toContain(
			"- src/h.ts: `any` type, 1 now and 0 before.",
		);
		const echo = preToolUse("Bash", {
			command: "echo 'export const z = value!;' > src/e.ts",
		});
		expect(echo.exit).toBe(2);
		expect(echo.stderr).toContain("src/e.ts");
	});

	test("a directive on an old line that the edit touches is not blamed", () => {
		writeFileSync(
			join(project, "src/legacy.ts"),
			"// @ts-ignore\nexport const total = sum(1);\n",
		);
		const output = preToolUse(
			"Edit",
			{
				file_path: join(project, "src/legacy.ts"),
				old_string: "// @ts-ignore\nexport const total = sum(1);",
				new_string: "// @ts-ignore\nexport const total = sum(2);",
			},
			[...HANDLERS],
		);
		expect(output).toEqual({ stdout: "", stderr: "", exit: 0 });
	});
});

describe("the types hook on a commit", () => {
	test("a git commit with a new any in the index is denied", () => {
		writeFileSync(join(repo, "src/staged.ts"), "export const z: any = 1;\n");
		git(repo, "add", "src/staged.ts");
		const output = runHook(
			"claude-code",
			"PreToolUse",
			JSON.stringify({
				cwd: repo,
				session_id: "s1",
				tool_name: "Bash",
				tool_input: { command: 'git commit -m "Add the staged parser"' },
			}),
			{ CLAUDE_PROJECT_DIR: repo },
			{ ...deps(), cwd: repo },
		);
		expect(output.exit).toBe(2);
		expect(output.stderr).toContain("astack blocked this commit");
		expect(output.stderr).toContain("src/staged.ts: `any` type");
		git(repo, "reset", "-q", "src/staged.ts");
		rmSync(join(repo, "src/staged.ts"));
	});
});

describe("astack check-types", () => {
	const write = (name: string) =>
		writeFileSync(join(repo, "src/invite.ts"), fixture(name));

	test("a new cast in the working tree exits 1 and names the line", () => {
		write("new-cast.ts");
		const run = astack("check-types");
		expect(run.code).toBe(1);
		expect(run.out).toBe(
			"src/invite.ts: deny unsafe cast, 4 now and 3 before\nsrc/invite.ts:21: return (await response.json()) as { total: number };\n1 files denied, 0 with advice only, 1 files checked\n",
		);
	});

	test("a reflow or a move of old lines exits 0", () => {
		for (const name of ["reflowed.ts", "moved.ts", "touched.ts"]) {
			write(name);
			const run = astack("check", "types");
			expect(run.code).toBe(0);
			expect(run.out).toBe(
				"0 files denied, 0 with advice only, 1 files checked\n",
			);
		}
	});

	test("--staged reads only the index", () => {
		write("new-cast.ts");
		expect(astack("check-types", "--staged").code).toBe(0);
		git(repo, "add", "src/invite.ts");
		expect(astack("check-types", "--staged").code).toBe(1);
		git(repo, "reset", "-q");
	});

	test("--base compares HEAD with the merge base", () => {
		git(repo, "checkout", "-q", "-b", "feature");
		write("new-hatches.ts");
		git(repo, "commit", "-q", "-am", "feature");
		const run = astack("check-types", "--base", "main", "--json");
		git(repo, "checkout", "-q", "main");
		expect(run.code).toBe(1);
		const parsed = JSON.parse(run.out);
		expect(
			parsed.reports[0].rises.map((rise: { kind: string }) => rise.kind),
		).toEqual(["any", "non-null", "ts-ignore"]);
		expect(parsed.skipped).toEqual([]);
	});

	test("a usage error exits 2", () => {
		const run = astack("check-types", "--base");
		expect(run.code).toBe(2);
		expect(run.err).toBe("astack check-types: --base needs a ref\n");
	});
});
