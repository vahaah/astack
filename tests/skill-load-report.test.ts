import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	fallbackParity,
	planUpfrontSkills,
	pointerProblems,
	type Scenario,
	scenarios,
	workingTree,
} from "../scripts/skill-load-report.ts";

const root = resolve(import.meta.dir, "..");

describe("the static checks of the skill load report", () => {
	test("every moved UI recipe has a checked scenario that rejects a missing pointer", () => {
		const entry = "marketplace/plugins/astack/skills/control-ui/SKILL.md";
		const folder = "marketplace/plugins/astack/skills/control-ui/references";
		const current = workingTree(root);
		const text = current(entry);
		if (text === undefined) throw new Error("The UI entry point is missing");
		const references = readdirSync(resolve(root, folder))
			.filter((name) => name.endsWith(".md"))
			.map((name) => `${folder}/${name}`)
			.sort();
		const list = scenarios("", () => undefined).filter(
			(scenario) => scenario.entry === entry,
		);
		const covered = [...new Set(list.flatMap((scenario) => scenario.after))]
			.filter((path) => path !== entry)
			.sort();
		expect(covered).toEqual(references);
		for (const path of references) {
			const name = path.slice(path.lastIndexOf("/") + 1);
			const missing = (file: string) =>
				file === entry ? text.replaceAll(name, "") : current(file);
			expect(
				list.flatMap((scenario) => pointerProblems(missing, scenario)),
			).toEqual([`${entry} does not point to ${path} as "${name}"`]);
		}
	});

	test("each conditional read of the current tree has a pointer in its entry file", () => {
		const current = workingTree(root);
		const list = scenarios("", () => undefined);
		expect(
			list.flatMap((scenario) => pointerProblems(current, scenario)),
		).toEqual([]);
	});

	test("a missing pointer and a missing file are reported", () => {
		const scenario: Scenario = {
			name: "types, Swift",
			entry: "skills/types/SKILL.md",
			before: [],
			after: [
				"skills/types/SKILL.md",
				"skills/types/references/swift.md",
				"skills/types/references/gone.md",
			],
		};
		const files: Readonly<Record<string, string>> = {
			"skills/types/SKILL.md": "Read the Swift notes.",
			"skills/types/references/swift.md": "# Swift",
		};
		expect(pointerProblems((path) => files[path], scenario)).toEqual([
			'skills/types/SKILL.md does not point to skills/types/references/swift.md as "swift.md"',
			"skills/types/references/gone.md is missing",
		]);
	});

	test("the fallback parity names a line that the moved fallback dropped", () => {
		const oldStub = "# Stub\n\n## Fallback\n\nStep one.\nStep two.\n";
		expect(
			fallbackParity(oldStub, "# F\n\n## Fallback\n\nStep one.\nStep two.\n"),
		).toEqual({ identical: true, onlyInOld: [], onlyInNew: [] });
		expect(
			fallbackParity(oldStub, "# F\n\n## Fallback\n\nStep one.\n"),
		).toEqual({
			identical: false,
			onlyInOld: ["Step two."],
			onlyInNew: [],
		});
	});

	test("the upfront list of the old plan skill takes skill names and leaves slash commands out", () => {
		const oldPlan = [
			"## Load the skills you compose",
			"Read `astack:how` and `astack:why`.",
			"Name `/astack:retro` and `astack:how` again.",
			"## Pick the mode",
			"Later `astack:mode`.",
		].join("\n");
		expect(planUpfrontSkills(oldPlan)).toEqual(["how", "why"]);
	});
});
