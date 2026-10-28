import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fsProbe,
	type PathKind,
	writeRefusal,
} from "../../scripts/lib/write-paths.ts";

function probeOf(kinds: Record<string, PathKind>) {
	return (path: string): PathKind => kinds[path] ?? "missing";
}

const plainRepo = probeOf({
	".claude": "directory",
	".claude/rules": "directory",
	".claude/skills": "directory",
	".claude/skills/pr-review-hardening": "directory",
	".claude/skills/pr-review-hardening/SKILL.md": "file",
});

describe("writeRefusal", () => {
	test.each([
		[".claude/rules/standards/coding.md"],
		[".claude/skills/pr-review-hardening/SKILL.md"],
		[".claude/pr-review-hardening.profile.md"],
		[".claude/settings.json"],
	])("allows %p in a plain repo", (path) => {
		expect(writeRefusal(path, plainRepo)).toBeUndefined();
	});

	test.each([
		["CLAUDE.md"],
		["AGENTS.md"],
		["REVIEW.md"],
		["apps/app/CLAUDE.md"],
		["docs/agents.md"],
		["Review.md"],
	])("refuses the instruction file %p", (path) => {
		expect(writeRefusal(path, plainRepo)).toContain("instruction file");
	});

	test("refuses to write into a symlinked .agents/skills", () => {
		const probe = probeOf({
			".agents": "directory",
			".agents/skills": "symlink",
		});
		expect(writeRefusal(".agents/skills/x/SKILL.md", probe)).toContain(
			".agents/skills is a symlink",
		);
	});

	test("refuses to write through any symlinked directory", () => {
		const probe = probeOf({ ".claude": "symlink" });
		expect(writeRefusal(".claude/rules/standards/coding.md", probe)).toBe(
			".claude is a symlink; apply never writes through a symlink",
		);
	});

	test("refuses to replace a symlinked target file", () => {
		const probe = probeOf({
			".claude": "directory",
			".claude/settings.json": "symlink",
		});
		expect(writeRefusal(".claude/settings.json", probe)).toContain(
			"never replaces one",
		);
	});

	test("refuses when a parent path is a file", () => {
		const probe = probeOf({ ".claude": "file" });
		expect(writeRefusal(".claude/settings.json", probe)).toContain(
			"is not a directory",
		);
	});

	test.each([
		["/etc/passwd"],
		["../outside.md"],
		[".claude/../CLAUDE.md"],
		[".claude//x.md"],
		["a\\b.md"],
		[""],
		[".git/config"],
	])("refuses the unsafe path %p", (path) => {
		expect(writeRefusal(path, plainRepo)).toBeDefined();
	});
});

describe("fsProbe", () => {
	const root = mkdtempSync(join(tmpdir(), "write-paths-"));
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	test("reports real symlinks, files, directories and missing paths", () => {
		mkdirSync(join(root, ".claude/skills"), { recursive: true });
		mkdirSync(join(root, ".agents"));
		symlinkSync("../.claude/skills", join(root, ".agents/skills"));
		writeFileSync(join(root, "CLAUDE.md"), "x");
		const probe = fsProbe(root);
		expect(probe(".agents/skills")).toBe("symlink");
		expect(probe(".claude/skills")).toBe("directory");
		expect(probe("CLAUDE.md")).toBe("file");
		expect(probe("missing.md")).toBe("missing");
		expect(writeRefusal(".agents/skills/new/SKILL.md", probe)).toContain(
			".agents/skills is a symlink",
		);
	});
});
