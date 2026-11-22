import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KEEP_LIST } from "../src/astack/comments/check.ts";

const repoRoot = join(import.meta.dir, "..");

const KEEP_CLASSES = [
	"license",
	"external dependency",
	"prettier-ignore",
	"public API contract",
	"RFC",
] as const;

type KeepClass = (typeof KEEP_CLASSES)[number];

type Copy =
	| {
			readonly kind: "markdown";
			readonly path: string;
			readonly heading: string;
	  }
	| { readonly kind: "constant"; readonly name: string; readonly text: string };

const ANCHOR: Copy = {
	kind: "markdown",
	path: "rules/comments.md",
	heading: "## Keep clauses",
};

const COPIES: readonly Copy[] = [
	ANCHOR,
	{
		kind: "markdown",
		path: "marketplace/plugins/astack/skills/coding-rules/SKILL.md",
		heading: "## Write no comments",
	},
	{
		kind: "markdown",
		path: "marketplace/plugins/astack/agents/comment-judge.md",
		heading: "## Keep clauses",
	},
	{ kind: "constant", name: "KEEP_LIST", text: KEEP_LIST },
	{
		kind: "markdown",
		path: "marketplace/plugins/astack/skills/pr-review-hardening/references/comments.md",
		heading: "## Keep list",
	},
	{ kind: "markdown", path: "AGENTS.md", heading: "## Write no comments" },
];

function repoText(path: string): string {
	return readFileSync(join(repoRoot, path), "utf8");
}

function firstListUnder(markdown: string, heading: string): string[] {
	const lines = markdown.split("\n");
	const at = lines.indexOf(heading);
	if (at < 0) return [];
	const items: string[] = [];
	for (const line of lines.slice(at + 1)) {
		if (line.startsWith("- ")) items.push(line.slice(2));
		else if (items.length > 0 || /^#{1,6} /.test(line)) break;
	}
	return items;
}

function keepItems(copy: Copy): string[] {
	switch (copy.kind) {
		case "markdown":
			return firstListUnder(repoText(copy.path), copy.heading);
		case "constant":
			return (copy.text.split(":")[1] ?? "").split(";");
		default: {
			const unknown: never = copy;
			return unknown;
		}
	}
}

function copyName(copy: Copy): string {
	return copy.kind === "constant" ? copy.name : copy.path;
}

function names(item: string, keepClass: KeepClass): boolean {
	return new RegExp(`\\b${keepClass}\\b`, "i").test(item);
}

describe("keep-list copies", () => {
	test("[control:keep-tie-anchor] each frozen keep clause names exactly one keep class", () => {
		expect(
			keepItems(ANCHOR).map((item) =>
				KEEP_CLASSES.filter((keepClass) => names(item, keepClass)),
			),
		).toEqual(KEEP_CLASSES.map((keepClass) => [keepClass]));
	});

	test.each(COPIES.map((copy) => [copyName(copy), copy] as const))(
		"[control:keep-tie-copies] %s names each keep class in exactly one keep item",
		(_name, copy) => {
			const items = keepItems(copy);
			expect(
				Object.fromEntries(
					KEEP_CLASSES.map((keepClass) => [
						keepClass,
						items.filter((item) => names(item, keepClass)).length,
					]),
				),
			).toEqual(
				Object.fromEntries(KEEP_CLASSES.map((keepClass) => [keepClass, 1])),
			);
		},
	);
});
