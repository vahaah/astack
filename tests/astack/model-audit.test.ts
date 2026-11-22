import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRegistry } from "../../src/astack/change-proof/registry.ts";
import { REGISTRY_PATH } from "../../src/astack/change-proof/rung.ts";

const ROOT = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const CLASSES = ["restates", "independent"];
const HEADING = "## Invariant audit";

function checkedNames(cfg: string): readonly string[] {
	return cfg
		.split("\n")
		.map((line) =>
			/^(?:INVARIANTS?|PROPERT(?:Y|IES))\s+(.*)$/.exec(line.trim()),
		)
		.flatMap((match) => match?.[1]?.split(/\s+/) ?? [])
		.filter((name) => name !== "" && name !== "TypeOK");
}

type Row = {
	readonly invariant: string;
	readonly kind: string;
	readonly action: string;
	readonly controls: readonly string[];
};

function cells(line: string): readonly string[] {
	return line
		.trim()
		.replace(/^\||\|$/g, "")
		.split("|")
		.map((cell) => cell.trim());
}

function auditSection(text: string): readonly string[] {
	return text
		.split(`\n${HEADING}\n`)
		.slice(1)
		.map((part) => part.split("\n## ")[0] ?? "");
}

function rowsOf(section: string): readonly Row[] {
	return section
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.slice(2)
		.map((line) => {
			const [invariant = "", kind = "", action = "", controls = ""] =
				cells(line);
			return {
				invariant: invariant.replaceAll("`", ""),
				kind,
				action,
				controls: controls
					.split(",")
					.map((control) => control.trim().replaceAll("`", ""))
					.filter((control) => control !== ""),
			};
		});
}

function auditProblems(
	record: string,
	text: string,
	checked: readonly string[],
	controls: ReadonlySet<string>,
): readonly string[] {
	const sections = auditSection(text);
	if (sections.length !== 1)
		return [`${record} has ${sections.length} Invariant audit sections, not 1`];
	const section = sections[0] ?? "";
	const rows = rowsOf(section);
	const problems: string[] = [];
	if (!/\b\d{4}-\d{2}-\d{2}\b/.test(section))
		problems.push(`${record}: the Invariant audit gives no date`);
	for (const name of checked)
		if (!rows.some((row) => row.invariant === name))
			problems.push(`${record}: ${name} has no audit row`);
	for (const [index, row] of rows.entries()) {
		const at = `${record}: ${row.invariant}`;
		if (!checked.includes(row.invariant))
			problems.push(
				`${at} has an audit row, but the config checks no such name`,
			);
		if (rows.findIndex((other) => other.invariant === row.invariant) < index)
			problems.push(`${at} has more than one audit row`);
		if (!CLASSES.includes(row.kind))
			problems.push(
				`${at} has the class "${row.kind}", not restates or independent`,
			);
		if (row.kind === "restates" && row.action === "")
			problems.push(`${at} restates no named action`);
		if (row.kind === "restates" && row.controls.length === 0)
			problems.push(`${at} restates ${row.action} but names no control`);
		if (row.kind === "independent" && row.action === "")
			problems.push(`${at} is independent but gives no reason`);
		for (const control of row.controls)
			if (!controls.has(control))
				problems.push(
					`${at} names the control ${control}, which no test holds`,
				);
	}
	return problems;
}

function testFiles(dir: string): readonly string[] {
	return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
		.filter((path) => path.endsWith(".ts") && !path.startsWith("fixtures/"))
		.map((path) => join(dir, path));
}

function controlMarkers(): ReadonlySet<string> {
	return new Set(
		testFiles("tests").flatMap((path) =>
			[...read(path).matchAll(/\[control:([A-Za-z][\w.-]*)\]/g)].map(
				(match) => match[1] ?? "",
			),
		),
	);
}

const SYNTHETIC_CONTROLS = new Set(["known-control"]);
const CHECKED = ["Safe", "Live"];

function record(rows: readonly string[], dated = true): string {
	return [
		"# A record",
		"",
		HEADING,
		"",
		dated
			? "The audit of 2026-11-22 reads the config."
			: "The audit reads the config.",
		"",
		"| Invariant | Class | Action | Controls |",
		"|---|---|---|---|",
		...rows,
		"",
	].join("\n");
}

const SAFE = "| `Safe` | restates | `Step` | `known-control` |";
const LIVE = "| `Live` | independent | It joins two actions |  |";

describe("[control:model-audit] the invariant audit of each registered model", () => {
	test("each invariant and property except TypeOK of each model has one row in its first record, and each restating row names a control that a test holds", () => {
		const registry = parseRegistry(read(REGISTRY_PATH));
		if (!registry.ok) throw new Error(registry.error);
		const controls = controlMarkers();
		const problems = registry.value.models.flatMap((entry) => {
			const checked = checkedNames(read(entry.model.config));
			expect(checked).toEqual(
				[...entry.model.invariants, ...entry.model.properties].filter(
					(name) => name !== "TypeOK",
				),
			);
			const home = entry.records[0] ?? "";
			return auditProblems(home, read(home), checked, controls);
		});
		expect(problems).toEqual([]);
	});

	test.each([
		["a complete audit", record([SAFE, LIVE]), []],
		["a missing row", record([SAFE]), ["formal/A.md: Live has no audit row"]],
		[
			"a stale row",
			record([
				SAFE,
				LIVE,
				"| `Gone` | independent | It joins two actions |  |",
			]),
			[
				"formal/A.md: Gone has an audit row, but the config checks no such name",
			],
		],
		[
			"a restating row with no control",
			record(["| `Safe` | restates | `Step` |  |", LIVE]),
			["formal/A.md: Safe restates `Step` but names no control"],
		],
		[
			"an independent row with no reason",
			record([SAFE, "| `Live` | independent |  |  |"]),
			["formal/A.md: Live is independent but gives no reason"],
		],
		[
			"an unknown control",
			record(["| `Safe` | restates | `Step` | `ghost-control` |", LIVE]),
			[
				"formal/A.md: Safe names the control ghost-control, which no test holds",
			],
		],
		[
			"an unknown class",
			record(["| `Safe` | vacuous | `Step` | `known-control` |", LIVE]),
			[
				'formal/A.md: Safe has the class "vacuous", not restates or independent',
			],
		],
		[
			"a repeated row",
			record([SAFE, SAFE, LIVE]),
			["formal/A.md: Safe has more than one audit row"],
		],
		[
			"an audit with no date",
			record([SAFE, LIVE], false),
			["formal/A.md: the Invariant audit gives no date"],
		],
		[
			"no audit",
			"# A record\n",
			["formal/A.md has 0 Invariant audit sections, not 1"],
		],
	])("%s gives its problems", (_, text, problems) => {
		expect(
			auditProblems("formal/A.md", text, CHECKED, SYNTHETIC_CONTROLS),
		).toEqual(problems);
	});

	test("the config reader takes INVARIANT, INVARIANTS and PROPERTY lines and drops TypeOK", () => {
		expect(
			checkedNames(
				"SPECIFICATION Spec\nINVARIANTS TypeOK Safe Other\nINVARIANT Live\nPROPERTY Done\n",
			),
		).toEqual(["Safe", "Other", "Live", "Done"]);
	});
});
