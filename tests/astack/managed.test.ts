import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
import type { Io } from "../../src/astack/cli/io.ts";
import { main } from "../../src/astack/cli/main.ts";
import { ownership, RETIRED_PATHS } from "../../src/astack/managed.ts";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repoWith(profile: unknown): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-managed-")));
	dirs.push(dir);
	spawnSync("git", ["init", "-q", dir]);
	mkdirSync(join(dir, "src"), { recursive: true });
	if (profile !== undefined) {
		mkdirSync(join(dir, ".astack"), { recursive: true });
		writeFileSync(join(dir, ".astack/profile.json"), JSON.stringify(profile));
	}
	return dir;
}

function run(cwd: string, args: readonly string[]) {
	const out: string[] = [];
	const err: string[] = [];
	const io: Io = {
		out: (text) => out.push(text),
		err: (text) => err.push(text),
		cwd,
		env: {},
		today: "2026-10-16",
		now: new Date("2026-10-16T00:00:00Z"),
		scriptPath: undefined,
	};
	const code = main(["managed", ...args], io);
	return { code, out: out.join(""), err: err.join("") };
}

const written = ".claude/rules/standards/comments.md";
const profile = {
	tracker: { kind: "none", requirePartOf: false },
	managed: [".astack/profile.json", written],
};

describe("ownership", () => {
	test("a listed path is written, an unlisted one belongs to the repo", () => {
		expect(ownership(written, profile).kind).toBe("written");
		expect(ownership("src/index.ts", profile).kind).toBe("repo");
	});

	test("the retired hardening files and the merged settings are astack's", () => {
		for (const { path } of RETIRED_PATHS)
			expect(ownership(path, profile).kind).toBe("retired");
		expect(ownership(".claude/settings.json", profile).kind).toBe("merged");
	});

	test("a profile with no managed list cannot tell", () => {
		expect(ownership(written, { tracker: {} }).kind).toBe("unknown");
	});

	test("a repo with no profile owns every path", () => {
		expect(ownership(written, undefined).kind).toBe("repo");
	});
});

describe("astack managed", () => {
	test("names a written file and exits 0", () => {
		const repo = repoWith(profile);
		const result = run(repo, [written]);
		expect(result.code).toBe(0);
		expect(result.out).toBe(
			`written ${written}: astack apply writes this file. Fix its source in the astack repo. Then apply it again to every repo with a profile.\n`,
		);
	});

	test("reads a path from a subfolder, relative to that folder", () => {
		const repo = repoWith(profile);
		const result = run(join(repo, "src"), ["../.astack/profile.json"]);
		expect(result.code).toBe(0);
		expect(result.out.startsWith("written .astack/profile.json:")).toBe(true);
	});

	test("follows a symlinked skills folder to the file that apply writes", () => {
		const stub = ".claude/skills/pr-review-hardening/SKILL.md";
		const repo = repoWith({ ...profile, managed: [...profile.managed, stub] });
		mkdirSync(join(repo, ".claude/skills/pr-review-hardening"), {
			recursive: true,
		});
		writeFileSync(join(repo, stub), "stub\n");
		mkdirSync(join(repo, ".agents"));
		symlinkSync("../.claude/skills", join(repo, ".agents/skills"));
		const result = run(repo, [".agents/skills/pr-review-hardening/SKILL.md"]);
		expect(result.code).toBe(0);
		expect(result.out).toBe(
			`written ${stub}: astack apply writes this file. Fix its source in the astack repo. Then apply it again to every repo with a profile.\n`,
		);
	});

	test("follows a symlinked folder to a path that does not exist yet", () => {
		const repo = repoWith(profile);
		mkdirSync(join(repo, ".claude/commands"), { recursive: true });
		mkdirSync(join(repo, ".agents"));
		symlinkSync("../.claude/commands", join(repo, ".agents/commands"));
		const result = run(repo, [".agents/commands/pr-review-hardening.md"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain(
			"retired .claude/commands/pr-review-hardening.md: astack apply deletes this file.",
		);
	});

	test("names a repo file and exits 1", () => {
		const repo = repoWith(profile);
		const result = run(repo, ["src/index.ts"]);
		expect(result.code).toBe(1);
		expect(result.out).toBe(
			"repo src/index.ts: astack apply does not write it. Fix it in this repo.\n",
		);
	});

	test("names a retired file with the reason", () => {
		const repo = repoWith(profile);
		const result = run(repo, [".claude/commands/pr-review-hardening.md"]);
		expect(result.code).toBe(0);
		expect(result.out).toContain(
			"retired .claude/commands/pr-review-hardening.md: astack apply deletes this file.",
		);
	});

	test("exits 2 when the profile has no managed list", () => {
		const repo = repoWith({ tracker: { kind: "none" } });
		const result = run(repo, [written]);
		expect(result.code).toBe(2);
		expect(result.out).toContain(`unknown ${written}:`);
	});

	test("refuses a path outside the repo, and no path", () => {
		const repo = repoWith(profile);
		expect(run(repo, ["../elsewhere.md"]).code).toBe(2);
		expect(run(repo, []).code).toBe(2);
	});
});
