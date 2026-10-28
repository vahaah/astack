import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addedUnits,
	applyEdit,
	parseUnifiedDiff,
} from "../../src/astack/comments/added.ts";
import {
	adviceMessage,
	checkChange,
	denyMessage,
} from "../../src/astack/comments/check.ts";
import { DEFAULT_LIMITS, limitsFor } from "../../src/astack/comments/limits.ts";
import { gitChanges } from "../../src/astack/git.ts";

const policy = { keep: [], limits: DEFAULT_LIMITS };

function addedTexts(
	before: string | undefined,
	after: string,
	regions?: { start: number; end: number }[],
): string[] {
	const units = addedUnits(before, after, "ts", regions ? { regions } : {});
	return (units ?? []).map(({ unit, newLines }) =>
		newLines.map((index) => unit.lines[index]?.text).join(" | "),
	);
}

function editAdds(
	current: string,
	oldString: string,
	newString: string,
	replaceAll = false,
): string[] {
	const edit = applyEdit(current, oldString, newString, replaceAll);
	if (!edit) throw new Error("edit did not apply");
	return addedTexts(current, edit.content, edit.regions);
}

describe("applyEdit", () => {
	test("replaces one occurrence and reports its region", () => {
		expect(applyEdit("a b c", "b", "XY", false)).toEqual({
			content: "a XY c",
			regions: [{ start: 2, end: 4 }],
		});
	});

	test("replaces every occurrence with replace_all", () => {
		expect(applyEdit("x.x", "x", "yy", true)).toEqual({
			content: "yy.yy",
			regions: [
				{ start: 0, end: 2 },
				{ start: 3, end: 5 },
			],
		});
	});

	test("refuses a missing or ambiguous old string", () => {
		expect(applyEdit("abc", "z", "y", false)).toBeUndefined();
		expect(applyEdit("aa", "a", "b", false)).toBeUndefined();
		expect(applyEdit(undefined, "a", "b", false)).toBeUndefined();
	});

	test("an empty old string on a missing file creates it", () => {
		expect(applyEdit(undefined, "", "new", false)).toEqual({
			content: "new",
			regions: [{ start: 0, end: 3 }],
		});
	});
});

describe("added comments for Edit", () => {
	const file = "// existing note\nexport const a = 1;\nexport const b = 2;\n";

	test("a comment in new_string is added", () => {
		expect(
			editAdds(
				file,
				"export const b = 2;",
				"// fresh note\nexport const b = 2;",
			),
		).toEqual(["fresh note"]);
	});

	test("a comment that already exists elsewhere in the file is moved, not added", () => {
		expect(
			editAdds(
				file,
				"export const b = 2;",
				"// existing note\nexport const b = 2;",
			),
		).toEqual([]);
	});

	test("removing a comment adds nothing", () => {
		expect(editAdds(file, "// existing note\n", "")).toEqual([]);
	});

	test("unchanged comments outside the edited region are ignored", () => {
		expect(editAdds(file, "a = 1", "a = 10")).toEqual([]);
	});

	test("only the new line of an edited block comment counts", () => {
		const source = "/**\n * Keeps rows.\n */\nexport const rows = [];\n";
		expect(
			editAdds(
				source,
				" * Keeps rows.\n",
				" * Keeps rows.\n * Sorted by id.\n",
			),
		).toEqual(["Sorted by id."]);
	});

	test("replace_all adds a comment once per region", () => {
		expect(editAdds("f();\nf();\n", "f();", "f(); // call", true)).toEqual([
			"call",
			"call",
		]);
	});

	test("an edit that leaves the file untokenizable is skipped", () => {
		const edit = applyEdit(
			file,
			"export const b = 2;",
			"export const b = `open",
			false,
		);
		expect(edit).toBeDefined();
		expect(
			addedUnits(file, edit?.content ?? "", "ts", { regions: edit?.regions }),
		).toBeUndefined();
	});
});

describe("added comments for Write", () => {
	test("a new file adds every comment", () => {
		expect(addedTexts(undefined, "// one\nconst a = 1; // two\n")).toEqual([
			"one",
			"two",
		]);
	});

	test("an overwrite adds only comments the old file lacked", () => {
		expect(
			addedTexts("// one\nconst a = 1;\n", "// one\n// two\nconst a = 2;\n"),
		).toEqual(["two"]);
	});
});

describe("checkChange", () => {
	test("advises instead of denying when the junk in an edited block already existed", () => {
		const before =
			"// Support tickets (ABC-139)\n// grouped here\nconst a = 1;\n";
		const after =
			"// Support tickets (ABC-139)\n// grouped here for the export\nconst a = 1;\n";
		const findings = checkChange({ relPath: "a.ts", before, after }, policy);
		expect(findings?.map((finding) => finding.verdict)).toEqual(["judge"]);
	});

	test("skips markdown, fixtures, vendored and generated paths", () => {
		for (const relPath of [
			"README.md",
			"docs/guide.mdx",
			"tests/fixtures/a.ts",
			"src/__fixtures__/a.ts",
			"vendor/lib/a.ts",
			"src/generated/api.ts",
			"src/api.generated.ts",
			"node_modules/pkg/index.js",
			"Makefile",
		]) {
			expect(
				checkChange(
					{ relPath, before: undefined, after: "// now uses the new cache\n" },
					policy,
				),
			).toEqual([]);
		}
	});

	test("checks declaration files", () => {
		const findings = checkChange(
			{
				relPath: "types.d.ts",
				before: undefined,
				after: "// now uses the new cache\n",
			},
			policy,
		);
		expect(findings?.[0]?.verdict).toBe("deny");
	});
});

describe("long comments in a change", () => {
	const block = (count: number, prefix = "Step") =>
		Array.from(
			{ length: count },
			(_, index) => `// ${prefix} ${index + 1} of the import.`,
		).join("\n");
	const file = (comment: string) => `${comment}\nexport const run = 1;\n`;
	const outcome = (before: string | undefined, after: string) =>
		(checkChange({ relPath: "a.ts", before, after }, policy) ?? []).map(
			(finding) =>
				`${finding.verdict}:${finding.rule}:${finding.size?.lines}/${finding.size?.limit}`,
		);

	test("an edit that grows a block past the limit is denied", () => {
		expect(outcome(file(block(2)), file(block(3)))).toEqual([
			"deny:long-comment:3/2",
		]);
	});

	test("an edit inside a block that was already too long only advises", () => {
		const before = file(block(6));
		const after = before.replace("Step 2 of", "Step 2 in");
		expect(outcome(before, after)).toEqual(["judge:long-comment:6/2"]);
	});

	test("rewriting every line of a long block is a new long block", () => {
		expect(outcome(file(block(6)), file(block(6, "Phase")))).toEqual([
			"deny:long-comment:6/2",
		]);
	});

	test("the denial says how to fix it and cites pstack", () => {
		const findings =
			checkChange(
				{ relPath: "a.ts", before: undefined, after: file(block(5)) },
				policy,
			) ?? [];
		const message = denyMessage("this edit", findings);
		expect(message).toContain(
			"astack blocked this edit: it adds comments over the line limit.",
		);
		expect(message).toContain(
			"a.ts:1 is a comment of 5 lines, over the 2-line limit:",
		);
		expect(message).toContain(
			"Delete the comment unless a keep rule covers it, and never shorten an uncovered comment to pass.",
		);
		expect(message).toContain(
			"fits in 2 lines. Keep the lines that state its constraint",
		);
		expect(message).toContain("a name, a type, a test or an ADR");
		expect(message).toContain("comment-sicko");
		expect(message).toContain("Never polish meat into a shorter alibi.");
		expect(message).not.toContain("State the constraint");
		expect(message).not.toContain("commentKeep");
	});

	test("paragraphs split by a blank line count as one long comment", () => {
		const para = (n: number) =>
			Array.from(
				{ length: 2 },
				(_, index) => `// Paragraph ${n} reason line ${index}.`,
			).join("\n");
		const after = `${para(1)}\n\n${para(2)}\nexport function f() {}\n`;
		const findings =
			checkChange({ relPath: "sp.ts", before: undefined, after }, policy) ?? [];
		expect(findings.map((finding) => finding.verdict)).toEqual([
			"deny",
			"deny",
		]);
		expect(findings[0]?.size).toEqual({ kind: "block", lines: 4, limit: 2 });
		const split = `${para(1)}\nconst a = 1;\n\n${para(2)}\nexport function f() {}\n`;
		expect(
			(
				checkChange(
					{ relPath: "sp.ts", before: undefined, after: split },
					policy,
				) ?? []
			).map((finding) => finding.verdict),
		).toEqual(["judge", "judge"]);
		const suppressed = `// eslint-disable-next-line no-console\n\n${para(1)}\nconsole.log(1);\n`;
		expect(
			(
				checkChange(
					{ relPath: "sp.ts", before: undefined, after: suppressed },
					policy,
				) ?? []
			).map((finding) => finding.verdict),
		).toEqual(["judge", "judge"]);
		const licensed = `// SPDX-License-Identifier: MIT\n\n${para(1)}\nexport function f() {}\n`;
		expect(
			(
				checkChange(
					{ relPath: "sp.ts", before: undefined, after: licensed },
					policy,
				) ?? []
			).map((finding) => finding.verdict),
		).toEqual(["judge"]);
	});

	test("a repo limit below two lines lowers the rewrite target", () => {
		const findings =
			checkChange(
				{ relPath: "a.ts", before: undefined, after: file(block(2)) },
				{ keep: [], limits: limitsFor(1) },
			) ?? [];
		expect(denyMessage("this edit", findings)).toContain("fits in 1 line.");
	});

	test("junk and long comments in one change get both explanations", () => {
		const after = `// now uses the new cache\nconst a = 1;\n${file(block(4))}`;
		const message = denyMessage(
			"this edit",
			checkChange({ relPath: "a.ts", before: undefined, after }, policy) ?? [],
		);
		expect(message).toContain(
			"it adds comments that no keep rule covers and comments over the line limit.",
		);
		expect(message).toContain("commentKeep");
		expect(message).toContain(
			"Delete the comment unless a keep rule covers it",
		);
	});

	test("advice for a long doc comment on an export names the size", () => {
		const doc = `/**\n${Array.from({ length: 13 }, (_, index) => ` * Rule ${index}.`).join("\n")}\n */\nexport function run() {}\n`;
		const findings =
			checkChange({ relPath: "a.ts", before: undefined, after: doc }, policy) ??
			[];
		expect(findings.map((finding) => finding.verdict)).toEqual(["judge"]);
		const message = adviceMessage(findings);
		expect(message).toContain(
			"astack: this change adds comments over the line limit.",
		);
		expect(message).toContain(
			"a.ts:2 is a doc comment of 13 lines, over the 12-line limit:",
		);
		expect(message).toContain(
			"A public API is an export that other packages import from its package's entry point, or an HTTP or RPC route that clients call.",
		);
		expect(message).not.toContain("need a reason to exist");
	});
});

describe("parseUnifiedDiff", () => {
	test("reads added line numbers, renames and new files", () => {
		const diff = [
			"diff --git a/src/a.ts b/src/a.ts",
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -3,0 +4,2 @@",
			"+// added one",
			"+// added two",
			"@@ -10 +12 @@",
			"-old",
			"+new",
			"diff --git a/old.ts b/new.ts",
			"similarity index 90%",
			"rename from old.ts",
			"rename to new.ts",
			"--- a/old.ts",
			"+++ b/new.ts",
			"@@ -1 +1 @@",
			"-x",
			"+y",
			"diff --git a/gone.ts b/gone.ts",
			"--- a/gone.ts",
			"+++ /dev/null",
			"@@ -1 +0,0 @@",
			"-z",
			"diff --git a/fresh.ts b/fresh.ts",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/fresh.ts",
			"@@ -0,0 +1 @@",
			"+// hi",
		].join("\n");
		expect(
			parseUnifiedDiff(diff).map((file) => ({
				path: file.path,
				oldPath: file.oldPath,
				added: [...file.added],
			})),
		).toEqual([
			{ path: "src/a.ts", oldPath: "src/a.ts", added: [4, 5, 12] },
			{ path: "new.ts", oldPath: "old.ts", added: [1] },
			{ path: "fresh.ts", oldPath: undefined, added: [1] },
		]);
	});
});

describe("git mode", () => {
	let repo = "";
	const git = (...args: string[]) => {
		const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
		if (result.status !== 0) throw new Error(result.stderr);
		return result.stdout;
	};

	beforeAll(() => {
		repo = mkdtempSync(join(tmpdir(), "astack-git-"));
		git("init", "-q", "-b", "main");
		git("config", "user.email", "test@example.com");
		git("config", "user.name", "Test");
		mkdirSync(join(repo, "src"));
		writeFileSync(
			join(repo, "src/keep.ts"),
			"// existing note\nexport const a = 1;\n",
		);
		writeFileSync(
			join(repo, "src/move.ts"),
			"// moved note\nexport const m = 1;\n",
		);
		git("add", ".");
		git("commit", "-q", "-m", "base");
	});

	afterAll(() => rmSync(repo, { recursive: true, force: true }));

	test("staged mode maps added lines to comments and ignores renamed content", () => {
		writeFileSync(
			join(repo, "src/keep.ts"),
			"// existing note\n// now uses the new cache\nexport const a = 1;\n",
		);
		git("mv", "src/move.ts", "src/moved.ts");
		writeFileSync(
			join(repo, "src/new.ts"),
			"// SPDX-License-Identifier: MIT\nexport const n = 1;\n",
		);
		git("add", "-A");
		const changes = gitChanges(repo, { staged: true }) ?? [];
		const findings = changes.flatMap(
			(change) =>
				checkChange(
					{
						relPath: change.path,
						before: change.before,
						after: change.after,
						addedLines: change.added,
					},
					policy,
				) ?? [],
		);
		expect(
			findings.map(
				(finding) =>
					`${finding.path}:${finding.line}:${finding.verdict}:${finding.rule}`,
			),
		).toEqual(["src/keep.ts:2:deny:narration"]);
	});

	test("worktree mode sees unstaged and untracked files", () => {
		writeFileSync(
			join(repo, "src/untracked.ts"),
			"// ─── Reads ───\nexport const u = 1;\n",
		);
		const paths = (
			gitChanges(repo, { staged: true, worktree: "all", untracked: "all" }) ??
			[]
		).map((change) => change.path);
		expect(paths).toContain("src/untracked.ts");
		expect(paths).toContain("src/keep.ts");
	});

	test("base mode compares HEAD with the merge base and drops pure renames", () => {
		git("commit", "-q", "-m", "change");
		const changes = gitChanges(repo, { base: "HEAD~1" }) ?? [];
		expect(changes.map((change) => change.path).sort()).toEqual([
			"src/keep.ts",
			"src/new.ts",
		]);
	});
});
