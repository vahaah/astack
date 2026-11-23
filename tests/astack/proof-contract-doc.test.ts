import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	parseChangeProof,
	STAGE_SECTIONS,
	STAGES,
	type Stage,
} from "../../src/astack/change-proof/contract.ts";

const PROOF_ADMISSION = readFileSync(
	join(import.meta.dir, "../../formal/ProofAdmission.tla"),
	"utf8",
);

const REFERENCES = join(
	import.meta.dir,
	"../../marketplace/plugins/astack/skills/pr-review-hardening/references",
);
const CONTRACT = readFileSync(join(REFERENCES, "proof-contract.md"), "utf8");
const EXAMPLE_TEXT = readFileSync(
	join(REFERENCES, "proof-example.json"),
	"utf8",
);

function slug(heading: string): string {
	return heading
		.toLowerCase()
		.replaceAll(/[^a-z0-9 -]/g, "")
		.replaceAll(" ", "-");
}

const SECTIONS = new Map(
	CONTRACT.split(/^## /m)
		.slice(1)
		.map((section) => [slug(section.split("\n")[0] ?? ""), section]),
);

function codeTokens(text: string): ReadonlySet<string> {
	return new Set(
		[...text.matchAll(/`([^`]+)`/g)].flatMap((span) =>
			(span[1] ?? "").split(/[^A-Za-z0-9_]+/).filter(Boolean),
		),
	);
}

function nestedKeys(value: unknown): readonly string[] {
	if (Array.isArray(value)) return value.flatMap(nestedKeys);
	if (typeof value !== "object" || value === null) return [];
	return Object.entries(value).flatMap(([key, child]) => [
		key,
		...nestedKeys(child),
	]);
}

const ROWS = (SECTIONS.get("required-records") ?? "")
	.split("\n")
	.filter((line) => line.startsWith("| `"))
	.map((line) => {
		const [, records = "", keys = ""] = line.split("|");
		return { records: codeTokens(records), text: `${records}|${keys}` };
	});

const CARRIER_FORM = /^- `carrier \{kind: ([a-z-]+)((?:, [A-Za-z]+)*)\}`/gm;

function withCarrier(carrier: Readonly<Record<string, string>>): string {
	return JSON.stringify(
		JSON.parse(EXAMPLE_TEXT, (key, value: unknown) =>
			key === "carrier" ? carrier : value,
		),
	);
}

function documented(record: string): ReadonlySet<string> {
	const row = ROWS.find((candidate) => candidate.records.has(record));
	if (row === undefined) return new Set();
	const linked = [...row.text.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map(
		(link) => SECTIONS.get(link[1] ?? "") ?? "",
	);
	return codeTokens([row.text, ...linked].join("\n"));
}

describe("the proof contract reference", () => {
	test("[control:proof-example-parses] the example manifest parses", () => {
		const parsed = parseChangeProof(EXAMPLE_TEXT);
		expect(parsed.ok && parsed.value.change).toBe("gate-admission");
	});

	test("[control:proof-example-keys] each key of the example is in the row of its record or in the section that the row links", () => {
		const example: Record<string, unknown> = JSON.parse(EXAMPLE_TEXT);
		const missing = Object.entries(example).flatMap(([record, value]) => {
			const known = documented(record);
			return [record, ...nestedKeys(value)]
				.filter((key) => !known.has(key))
				.map((key) => `${record}: ${key}`);
		});
		expect([...new Set(missing)]).toEqual([]);
	});

	test("[control:proof-carrier-forms] the reference gives one carrier form for each carrier kind, and the schema accepts each form", () => {
		const forms = [
			...(SECTIONS.get("category-and-abstraction") ?? "").matchAll(
				CARRIER_FORM,
			),
		].map(([, kind = "", keys = ""]) => ({
			kind,
			...Object.fromEntries(
				keys
					.split(", ")
					.filter(Boolean)
					.map((key) => [key, "text"]),
			),
		}));
		const unknownKind = parseChangeProof(withCarrier({ kind: "none" }));
		const kinds = unknownKind.ok
			? []
			: [...unknownKind.error.message.matchAll(/"([a-z-]+)"/g)].map(
					([, kind = ""]) => kind,
				);
		expect(forms.map((form) => form.kind)).toEqual(kinds);
		expect(
			forms.map((form) => {
				const parsed = parseChangeProof(withCarrier(form));
				return parsed.ok || parsed.error.stage !== "schema"
					? "accepted"
					: parsed.error.message;
			}),
		).toEqual(kinds.map(() => "accepted"));
	});

	test("[control:proof-stop-heading] the section of each stop stage holds the rule of each cause of that stage", () => {
		const causes: Readonly<Record<Stage, readonly string[]>> = {
			schema: [
				"Unknown fields",
				"More than one manifest stops",
				"the diff from the merge base adds",
			],
			domain: ["glossary", "integratedAt", "context of the contexts card"],
			category: ["must compose", "monoid", "tsc witness", "links row"],
			controls: ["no row is idle", "spec-links.md"],
			rung: [
				"uncovered fail-closed path",
				"deleted registry",
				"R2 for a prop law on a read-only cap",
				"A tla law selects its model",
			],
			model: ["A positive result needs"],
			countermodel: ["The negative control"],
			stale: [
				"must be an ancestor",
				"before and after execution",
				"deletes each manifest",
			],
		};
		expect(
			STAGES.flatMap((stage) =>
				causes[stage]
					.filter(
						(rule) =>
							!(SECTIONS.get(slug(STAGE_SECTIONS[stage])) ?? "").includes(rule),
					)
					.map((rule) => `${stage}: ${rule}`),
			),
		).toEqual([]);
	});

	test("[control:domain-record-text] the plan skill names the H2 and the domain template, and domain-modeling names the card and domain.plan", () => {
		const skills = join(
			import.meta.dir,
			"../../marketplace/plugins/astack/skills",
		);
		const plan = readFileSync(join(skills, "plan/SKILL.md"), "utf8");
		const modeling = readFileSync(
			join(skills, "domain-modeling/SKILL.md"),
			"utf8",
		);
		const format = readFileSync(
			join(skills, "domain-modeling/GLOSSARY-FORMAT.md"),
			"utf8",
		);
		expect({
			h2: plan.includes("`## Domain and effects`"),
			template: plan.includes("astack check-plan --template=domain"),
			plan: modeling.includes("`domain.plan`"),
			card: format.includes("contexts card"),
			fence: [plan, modeling, format].some((text) => /^```domain/m.test(text)),
		}).toEqual({
			h2: true,
			template: true,
			plan: true,
			card: true,
			fence: false,
		});
	});

	test("[control:proof-model-sections] the Sections of ProofAdmission give each stop stage the section of STAGE_SECTIONS", () => {
		const record =
			/^Sections == \[([^\]]*)\]/m.exec(PROOF_ADMISSION)?.[1] ?? "";
		const sections = new Map(
			[...record.matchAll(/(\w+) \|-> "([^"]+)"/g)].map(([, stage, title]) => [
				stage,
				title,
			]),
		);
		expect(STAGES.map((stage) => [stage, sections.get(stage)])).toEqual(
			STAGES.map((stage) => [stage, STAGE_SECTIONS[stage]]),
		);
	});
});
