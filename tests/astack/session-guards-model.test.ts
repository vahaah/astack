import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	loadSessionGuards,
	pinFailures,
	readSessionGuards,
} from "./session-guards-model.ts";

const ROOT = join(import.meta.dir, "../..");
const MODEL = loadSessionGuards(ROOT);

describe("the SessionGuards model reader", () => {
	test("reads the spec that the registry names and counts each table", () => {
		expect(MODEL.path).toBe("formal/SessionGuards.tla");
		expect({
			prs: MODEL.prs,
			clauses: MODEL.clauses.length,
			prompts: MODEL.prompts.length,
			sources: MODEL.sources,
			baseAuthorities: MODEL.baseAuthorities,
			channels: MODEL.channels,
			kinds: MODEL.kinds,
			places: MODEL.places,
			changes: MODEL.changes.length,
			commands: MODEL.commands.length,
			files: MODEL.files.length,
			targets: MODEL.targets,
		}).toEqual({
			prs: [1, 2],
			clauses: 7,
			prompts: 28,
			sources: ["frame", "machine", "none", "user"],
			baseAuthorities: ["base", "standing", "turn", "unread"],
			channels: ["gh", "mcp"],
			kinds: ["both", "staged", "unstaged", "untracked"],
			places: ["folder", "named", "other"],
			changes: 12,
			commands: 16,
			files: 16,
			targets: ["commit", "head", "refs"],
		});
		expect(MODEL.commands).toContainEqual({
			name: "restore -SW src",
			lost: "tracked",
			scope: "folder",
			effect: "tracked",
		});
	});

	test("a row added to a table changes its count", () => {
		const text = MODEL.text.replace(
			'[name |-> "stash", lost |-> "none", scope |-> "tree", effect |-> "stash"]}',
			'[name |-> "stash", lost |-> "none", scope |-> "tree", effect |-> "stash"],\n   [name |-> "stash -u", lost |-> "none", scope |-> "tree", effect |-> "stash"]}',
		);
		expect(readSessionGuards(MODEL.path, text).commands.length).toBe(17);
	});

	describe("[control:sg-model-pin] the mirror pins", () => {
		test("each operator that the mirror copies equals its pin", () => {
			expect(pinFailures(MODEL.text)).toEqual([]);
		});

		test.each([
			["ModeOf", 'IF p = {"fullStop"}', 'IF "fullStop" \\in p'],
			["Merge", '/\\ mode # "fullStop"\n', ""],
			[
				"Scratch",
				"~f.inProject /\\ ~(f.git",
				"~f.inProject /\\ (f.inTemp \\/ ~(f.git",
			],
		])("a changed %s fails its pin", (name, from, to) => {
			expect(MODEL.text).toContain(from);
			expect(pinFailures(MODEL.text.replace(from, to))).toEqual([name]);
		});
	});
});
