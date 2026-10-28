import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderIssueTracker } from "../scripts/lib/flow-config.ts";
import type { TrackerConfig } from "../scripts/lib/projects.ts";
import { profilePaths } from "./profile-paths.ts";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const linear: TrackerConfig = {
	kind: "linear",
	team: "ABC",
	requirePartOf: true,
	categoryLabels: { bug: "Bug", enhancement: "Feature" },
};

const fallbackOf: readonly {
	readonly field: RegExp;
	readonly fallback: string;
}[] = [
	{ field: /\baddLabels\b/, fallback: "`labels`" },
	{ field: /\bremoveLabels\b/, fallback: "`labels`" },
	{ field: /`patch`/, fallback: "`description`" },
];

function uncheckedLines(text: string): string[] {
	return text
		.split("\n")
		.filter((line) =>
			fallbackOf.some(
				({ field, fallback }) =>
					field.test(line) &&
					!(line.includes("`save_issue` schema") && line.includes(fallback)),
			),
		);
}

const markdownUnder = (dir: string): string[] =>
	readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
		.filter((path) => path.endsWith(".md"))
		.map((path) => join(dir, path));

const shippedTexts = [
	...markdownUnder("marketplace/plugins"),
	...markdownUnder("rules"),
	...markdownUnder("docs"),
	...profilePaths,
	...markdownUnder("templates"),
];

describe("save_issue fields that some Linear servers lack", () => {
	test("an unchecked addLabels line is found", () => {
		const line =
			"- Apply or remove labels: `save_issue` with `id` and `addLabels` or `removeLabels`.";
		expect(uncheckedLines(`# Tracker\n${line}\n`)).toEqual([line]);
	});

	test("a field name with no backticks is found, and a plain patch is not a field", () => {
		const line = "Then call save_issue with addLabels to add the triage label.";
		expect(uncheckedLines(`${line}\nApply the patch to the file.\n`)).toEqual([
			line,
		]);
	});

	test("the rendered Linear tracker doc checks the schema before each such field", () => {
		expect(uncheckedLines(renderIssueTracker(linear))).toEqual([]);
	});

	test("the scan reads the vendored pstack and flow plugins, not only astack", () => {
		expect(shippedTexts).toContain(
			"marketplace/plugins/astack/skills/mode/playbooks/feature.md",
		);
		expect(shippedTexts).toContain(
			"marketplace/plugins/astack/skills/setup/issue-tracker-linear.md",
		);
	});

	test("the scan reads the review stub and the profiles that apply ships", () => {
		expect(shippedTexts).toEqual(
			expect.arrayContaining([
				"templates/pr-review-hardening.stub.SKILL.md",
				"examples/companion/projects/acme/pr-review-hardening.profile.md",
			]),
		);
	});

	const quotesTitles = "docs/review-lessons.md";
	const instructions = (path: string): string =>
		path === quotesTitles
			? read(path)
					.split("\n")
					.filter((line) => !line.startsWith("|"))
					.join("\n")
			: read(path);

	test.each(shippedTexts)(
		"%s checks the schema before each such field",
		(path) => {
			expect(uncheckedLines(instructions(path))).toEqual([]);
		},
	);

	test("the table rows of the review lessons quote test names and finding titles, and its other lines are still scanned", () => {
		expect(uncheckedLines(read(quotesTitles))).not.toEqual([]);
		expect(
			uncheckedLines(
				instructions(quotesTitles).concat(
					"\nCall save_issue with addLabels.\n",
				),
			),
		).toEqual(["Call save_issue with addLabels."]);
	});

	test("the export runbook sends the full labels list when the server has no addLabels", () => {
		expect(
			read("marketplace/plugins/astack/skills/plan/references/tracker.md"),
		).toContain(
			"An update can carry `addLabels`. When the `save_issue` schema of your Linear server has no `addLabels`, send `labels` in its place. Give the object's labels from the tracker JSON plus the new ones.",
		);
	});
});
