import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { checkFragments } from "../../scripts/dist/checks.ts";
import {
	splitFrontmatter,
	stringValue,
} from "../../scripts/dist/frontmatter.ts";
import { render } from "../../scripts/dist/render.ts";
import { readSource } from "../../scripts/dist/source.ts";
import { textOf } from "../../scripts/dist/tree.ts";
import { checkLinks } from "../../scripts/validate.ts";

const ROOT = resolve(import.meta.dir, "../..");
const source = () =>
	readSource({
		marketplace: join(ROOT, "marketplace"),
		rules: join(ROOT, "rules"),
	});
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function outputs() {
	const result = render(source());
	if (!result.ok) throw new Error(result.error.join("\n"));
	return result.value.tree;
}

function materialize(files: ReadonlyMap<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-review-links-"));
	dirs.push(dir);
	for (const [name, text] of files) {
		mkdirSync(dirname(join(dir, name)), { recursive: true });
		writeFileSync(join(dir, name), text);
	}
	return dir;
}

test("all clients receive scoped packs and both portable checklists within the fragment cap", () => {
	const tree = outputs();
	const text = (name: string) => {
		const entry = tree.get(name);
		if (entry === undefined) throw new Error(`${name} is missing`);
		return textOf(entry);
	};
	const cursor = splitFrontmatter(
		text("cursor/astack/rules/astack-typescript.mdc"),
		"typescript rule",
	);
	expect({
		globs: stringValue(cursor.values, "globs"),
		alwaysApply: cursor.values.alwaysApply,
	}).toEqual({
		globs: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts",
		alwaysApply: false,
	});
	for (const fragment of [
		"codex/AGENTS.fragment.md",
		"agentskills/AGENTS.fragment.md",
		"grok-bot/skills/astack-rules/SKILL.md",
	]) {
		expect(text(fragment)).toContain(
			"This section applies to files that match `**/*.sql`.",
		);
		expect(text(fragment)).toContain(
			"This section applies to files that match `**/*.ts`, `**/*.tsx`, `**/*.mts`, `**/*.cts`.",
		);
	}
	for (const root of [
		"claude-code/astack/skills/code-review",
		"cursor/astack/skills/astack-code-review",
		"grok-bot/skills/astack-code-review",
		"agentskills/skills/astack-code-review",
	])
		for (const language of ["typescript", "postgres"])
			expect(text(`${root}/references/${language}.md`)).toStartWith("# Review");
	expect(checkFragments(tree).errors).toEqual([]);
});

test("the dist build refuses an absent required language pack", () => {
	const current = source();
	const result = render({
		...current,
		rules: current.rules.filter((rule) => rule.name !== "typescript.md"),
	});
	expect(result.ok ? [] : result.error).toEqual([
		"rules/typescript.md is missing",
	]);
});

test("optional reviewers keep native read-only tools and resolve their emitted Cursor links", () => {
	const tree = outputs();
	for (const language of ["typescript", "postgres"]) {
		const path = `claude-code/astack/agents/${language}-reviewer.md`;
		const native = tree.get(path);
		if (native === undefined) throw new Error(`${path} is missing`);
		const split = splitFrontmatter(textOf(native), path);
		expect({
			model: stringValue(split.values, "model"),
			tools: stringValue(split.values, "tools"),
		}).toEqual({
			model: "inherit",
			tools: "Read, Grep, Glob",
		});
		const flatPath = `cursor/astack/agents/astack-${language}-reviewer.md`;
		const flat = tree.get(flatPath);
		if (flat === undefined) throw new Error(`${flatPath} is missing`);
		const cursor = splitFrontmatter(textOf(flat), flatPath);
		expect(cursor.values.readonly).toBe(true);
		const links = [...cursor.body.matchAll(/\]\((\.\.\/skills\/[^)]+)\)/g)].map(
			(match) => match[1],
		);
		expect(links).toHaveLength(2);
		for (const link of links) {
			if (link === undefined) throw new Error("The reviewer link is missing.");
			expect(
				tree.has(posix.normalize(posix.join(posix.dirname(flatPath), link))),
			).toBe(true);
		}
	}
});

test("the source link gate rejects a missing shared reviewer checklist", () => {
	const tree = outputs();
	const files = new Map<string, string>();
	for (const name of [
		"agents/typescript-reviewer.md",
		"agents/postgres-reviewer.md",
		"skills/coding-rules/SKILL.md",
		"skills/code-review/references/typescript.md",
		"skills/code-review/references/postgres.md",
	]) {
		const entry = tree.get(`claude-code/astack/${name}`);
		if (entry === undefined) throw new Error(`${name} is missing`);
		files.set(name, textOf(entry));
	}
	const root = materialize(files);
	expect(checkLinks([{ name: "astack", root }]).findings).toEqual([]);
	unlinkSync(join(root, "skills/code-review/references/postgres.md"));
	expect(
		checkLinks([{ name: "astack", root }]).findings.map(
			(finding) => finding.message,
		),
	).toEqual([
		"link ../skills/code-review/references/postgres.md has no target",
	]);
});
