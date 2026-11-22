import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const skills = join(import.meta.dir, "../marketplace/plugins/astack/skills");
const read = (path: string) => readFileSync(join(skills, path), "utf8");
const seats = read("arena/references/external-seats.md");
const solLoop = read("sol-loop/SKILL.md");
const setupModels = read("setup-models/SKILL.md");

const readOnlyFlag: Readonly<Record<string, string>> = {
	codex: "-s read-only",
	"cursor-agent": "--mode ask",
	claude: "--permission-mode plan",
};

function section(text: string, heading: string): string {
	const from = text.indexOf(`\n## ${heading}\n`);
	if (from === -1) throw new Error(`no section ${heading}`);
	const to = text.indexOf("\n## ", from + 1);
	return text.slice(from, to === -1 ? undefined : to);
}

function lineWith(text: string, start: string): string {
	const line = text.split("\n").find((entry) => entry.includes(start));
	if (line === undefined) throw new Error(`no line holds "${start}"`);
	return line;
}

const valuesIn = (text: string): string[] => [
	...new Set(
		[...text.matchAll(/`((?:codex|claude|cursor-agent)(?::<model>)?)`/g)].map(
			(match) => match[1] ?? "",
		),
	),
];

const cliOf = (value: string): string => value.split(":")[0] ?? value;

function listedValues(text: string): string[] {
	const intro = text.slice(0, text.indexOf("\n## "));
	return intro
		.split("\n")
		.filter((line) => line.startsWith("- "))
		.flatMap(valuesIn);
}

function readOnlyForms(text: string): string[] {
	const from = text.indexOf(
		"Use these forms for a read-only reviewer or judge:",
	);
	const block = text.slice(from).split("```")[1] ?? "";
	return block.split("\n").filter((line) => line.trim() !== "");
}

function missingSeats(text: string, values: readonly string[]): string[] {
	const listed = listedValues(text);
	const forms = readOnlyForms(text);
	return values.filter((value) => {
		const cli = cliOf(value);
		const flag = readOnlyFlag[cli];
		return (
			!listed.includes(value) ||
			flag === undefined ||
			!forms
				.map((form) => form.replace(/^cd \S+ && /, ""))
				.some((form) => form.startsWith(`${cli} `) && form.includes(flag))
		);
	});
}

function familiesOf(text: string): ReadonlyMap<string, string> {
	const sentence = lineWith(text, "is OpenAI");
	return new Map(
		[...sentence.matchAll(/`([^`]+)` is (\w+)/g)].map((match) => [
			match[1] ?? "",
			match[2] ?? "",
		]),
	);
}

const selection =
	"Take the first value of that line whose family is not the family of the session model.";
const defaults =
	/With no line, take `([^`]+)` under an (\w+) model and `([^`]+)` otherwise\./;
const blocker =
	"With no listed value of another family, report the blocker and stop.";
const noStandIn =
	"When the CLI is missing or signed out, report the blocker and stop. Never put another model in its place.";

const solLoopValues = () => valuesIn(section(solLoop, "The reviewer"));
const setupValues = () =>
	valuesIn(lineWith(setupModels, "For `sol-loop reviewer`, accept"));

describe("the seats of the sol-loop reviewer", () => {
	test("[control:sl-seat] each value that sol-loop or setup-models takes for the reviewer has a listed read-only form", () => {
		const values = [...solLoopValues(), ...setupValues()];
		expect(values).toEqual(expect.arrayContaining(["codex", "claude"]));
		expect(missingSeats(seats, values)).toEqual([]);
		expect(
			missingSeats(
				seats.replace(
					/^(cd \S+ && )?claude -p .*$/m,
					"$1claude -p --add-dir <out>",
				),
				values,
			),
		).toEqual(values.filter((value) => cliOf(value) === "claude"));
	});

	test("[control:sl-family] sol-loop takes a seat of another family than the session model, also with no role line", () => {
		const families = familiesOf(seats);
		expect(families.get("codex")).toBe("OpenAI");
		expect(families.get("claude")).toBe("Anthropic");
		expect(solLoop).toContain(selection);
		expect(solLoop).not.toContain("When the role is missing, use `codex`.");
		const [, underFamily, familyModel, otherwise] =
			defaults.exec(solLoop) ?? [];
		expect(familyModel).toBe("OpenAI");
		expect(families.get(underFamily ?? "")).not.toBe(familyModel);
		expect(families.get(otherwise ?? "")).toBe(familyModel);
	});

	test("the rule header of setup-models and the cross-family row of the mode name each value that setup-models accepts for the reviewer", () => {
		const subagents = read("mode/references/subagents.md");
		const header = lineWith(setupModels, "# External seats (");
		const row = lineWith(subagents, "| Cross-family reviewer |");
		const values = setupValues();
		expect(values).toEqual(
			expect.arrayContaining(["claude", "claude:<model>"]),
		);
		expect(values.filter((value) => !header.includes(value))).toEqual([]);
		expect(values.filter((value) => !valuesIn(row).includes(value))).toEqual(
			[],
		);
	});

	test("each sol-loop round reads a diff of the current tree, because the next round writes the diff and status files again into one named folder", () => {
		const outFolder =
			"`<out>` is a new folder from `mktemp -d`, outside the checkout.";
		const rewrite =
			"Write `<out>/diff.txt` and `<out>/status.txt` again with the commands of step 1.";
		expect(solLoop.indexOf(outFolder)).toBeGreaterThan(-1);
		expect(solLoop.indexOf(outFolder)).toBeLessThan(solLoop.indexOf("<out>/"));
		expect(section(solLoop, "4. Start the next round")).toContain(rewrite);
	});

	test("[control:sl-block] sol-loop reports a blocker when no seat of another family can run, and never puts another model in its place", () => {
		const reviewer = section(solLoop, "The reviewer");
		expect(reviewer).toContain(blocker);
		expect(reviewer).toContain(noStandIn);
		expect(reviewer).not.toContain("sonnet");
		expect(lineWith(seats, "escalation")).toContain("A refusal is a blocker.");
	});
});
