import { describe, expect, test } from "bun:test";
import {
	type AdrFile,
	type AdrFolder,
	type TemplateFacts,
	templateProblems,
	treeProblems,
} from "../../src/astack/adr.ts";
import { parseCard } from "../../src/astack/domain/notation.ts";
import type { ContextsCard } from "../../src/astack/domain/rules.ts";

const DIR = "docs/adr";
const INDEX = `${DIR}/README.md`;

function adr(
	number: string,
	title: string,
	header: readonly string[],
	body: readonly string[] = [],
): AdrFile {
	return {
		path: `${DIR}/${number}-${title.toLowerCase().replaceAll(" ", "-")}.md`,
		text: [
			`# ${number}. ${title}`,
			"",
			...header,
			"",
			"## Decisions",
			"",
			"### D1. The first rule holds",
			"",
			"Text.",
			"",
			"### D4. The second rule holds",
			"",
			"Text.",
			...body,
			"",
		].join("\n"),
	};
}

const ALPHA = adr("0001", "Alpha holds", [
	"Status: Accepted",
	"Date: 2026-11-01",
	"Supersedes: none",
	"Amended by: 0002 D1",
]);
const BETA = adr("0002", "Beta holds", [
	"Status: Accepted",
	"Date: 2026-11-02",
	"Amends: 0001 D4",
]);
const GAMMA = adr("0003", "Gamma holds", [
	"Status: Superseded by 0004",
	"Date: 2026-11-03",
]);
const DELTA = adr("0004", "Delta holds", [
	"Status: Accepted",
	"Date: 2026-11-04",
	"Supersedes: 0003",
]);

function indexOf(rows: readonly string[]): AdrFile {
	return {
		path: INDEX,
		text: [
			"# Architecture decision records",
			"",
			"| Number | Title | Status |",
			"|---|---|---|",
			...rows,
			"",
		].join("\n"),
	};
}

const ROWS = [
	"| [0001](0001-alpha-holds.md) | Alpha holds | Accepted |",
	"| [0002](0002-beta-holds.md) | Beta holds | Accepted |",
	"| [0003](0003-gamma-holds.md) | Gamma holds | Superseded by 0004 |",
	"| [0004](0004-delta-holds.md) | Delta holds | Accepted |",
];

const FOLDER: AdrFolder = {
	files: [ALPHA, BETA, GAMMA, DELTA],
	index: indexOf(ROWS),
};

function replaced(file: AdrFile, from: string, to: string): AdrFile {
	if (!file.text.includes(from))
		throw new Error(`${file.path} holds no ${from}`);
	return { ...file, text: file.text.replace(from, to) };
}

function withFile(folder: AdrFolder, file: AdrFile): AdrFolder {
	return {
		...folder,
		files: folder.files.map((one) => (one.path === file.path ? file : one)),
	};
}

describe("the index and relation rules of an ADR folder", () => {
	test("the fixture folder has no problem", () => {
		expect(treeProblems(FOLDER)).toEqual([]);
	});

	test.each<[string, AdrFolder, [string, number, string][]]>([
		[
			"a file with no row",
			{
				...FOLDER,
				index: indexOf(ROWS.filter((row) => !row.includes("0003"))),
			},
			[[GAMMA.path, 1, `ADR 0003 has no row in ${INDEX}`]],
		],
		[
			"a row with no file",
			{
				...FOLDER,
				index: indexOf([
					...ROWS,
					"| [0005](0005-echo-holds.md) | Echo holds | Accepted |",
				]),
			},
			[
				[
					INDEX,
					9,
					"the row of ADR 0005 links 0005-echo-holds.md, and no ADR file has that name",
				],
			],
		],
		[
			"a row with another title",
			{
				...FOLDER,
				index: indexOf(ROWS.map((row) => row.replace("Beta holds", "Beta"))),
			},
			[
				[
					INDEX,
					6,
					`the row of ADR 0002 gives the title "Beta", and the H1 of ${BETA.path} gives "Beta holds"`,
				],
			],
		],
		[
			"a row with another status",
			{
				...FOLDER,
				index: indexOf(
					ROWS.map((row) => row.replace("Superseded by 0004 |", "Accepted |")),
				),
			},
			[
				[
					INDEX,
					7,
					`the row of ADR 0003 gives the status "Accepted", and ${GAMMA.path} has "Superseded by 0004"`,
				],
			],
		],
		[
			"two files with one number",
			{
				...FOLDER,
				files: [...FOLDER.files, { ...DELTA, path: `${DIR}/0004-other.md` }],
			},
			[
				[
					`${DIR}/0004-other.md`,
					1,
					`ADR 0004 has two files, ${DELTA.path} and ${DIR}/0004-other.md`,
				],
			],
		],
	])("[control:adr-index] %s fails", (_name, folder, problems) => {
		expect(
			treeProblems(folder).map((one) => [one.file, one.line, one.message]),
		).toEqual(problems);
	});

	test.each<[string, AdrFolder, [string, number, string][]]>([
		[
			"an Amends line whose target names no Amended by: entry",
			withFile(FOLDER, replaced(ALPHA, "Amended by: 0002 D1\n", "")),
			[
				[
					BETA.path,
					5,
					`ADR 0002 amends 0001, and ${ALPHA.path} names no 0002 in its Amended by: line`,
				],
			],
		],
		[
			"an Amended by: entry that the named ADR does not cite",
			withFile(FOLDER, replaced(BETA, "Amends: 0001 D4", "Amends: none")),
			[
				[
					ALPHA.path,
					6,
					`ADR 0001 names 0002 in its Amended by: line, and ${BETA.path} has no Amends line, text "ADR 0001" or link for it`,
				],
			],
		],
		[
			"a decision that the named ADR does not hold",
			withFile(FOLDER, replaced(BETA, "Amends: 0001 D4", "Amends: 0001 D9")),
			[[BETA.path, 5, "ADR 0001 has no ### D9. heading"]],
		],
		[
			"a Supersedes line whose target has another status",
			withFile(
				FOLDER,
				replaced(GAMMA, "Status: Superseded by 0004", "Status: Accepted"),
			),
			[
				[
					DELTA.path,
					5,
					`ADR 0004 supersedes 0003, and ${GAMMA.path} has the status "Accepted", not "Superseded by 0004"`,
				],
				[
					INDEX,
					7,
					`the row of ADR 0003 gives the status "Superseded by 0004", and ${GAMMA.path} has "Accepted"`,
				],
			],
		],
		[
			"a Superseded by status with no Supersedes line",
			withFile(FOLDER, replaced(DELTA, "Supersedes: 0003", "Supersedes: none")),
			[
				[
					GAMMA.path,
					3,
					`ADR 0003 has the status Superseded by 0004, and ${DELTA.path} has no Supersedes: line that names 0003`,
				],
			],
		],
		[
			"a superseded ADR with an Amends line and no back link",
			withFile(
				FOLDER,
				replaced(
					GAMMA,
					"Date: 2026-11-03",
					"Date: 2026-11-03\nAmends: 0001 D1",
				),
			),
			[],
		],
		[
			"a second Amended by: line in the header",
			withFile(
				FOLDER,
				replaced(
					ALPHA,
					"Amended by: 0002 D1\n",
					"Amended by: 0002 D1\nAmended by: 0002 the rule now skips review.\n",
				),
			),
			[
				[
					ALPHA.path,
					7,
					"ADR 0001 has a second Amended by: line; name each amending ADR in the one header line",
				],
			],
		],
		[
			"an Amended by: line in a decision",
			withFile(
				FOLDER,
				replaced(
					ALPHA,
					"Text.\n",
					"Text.\nAmended by: 0002 the rule now skips review.\n",
				),
			),
			[
				[
					ALPHA.path,
					13,
					"ADR 0001 has an Amended by: line after the header; it goes before the first ## part",
				],
			],
		],
	])("[control:adr-relations] %s", (_name, folder, problems) => {
		expect(
			treeProblems(folder).map((one) => [one.file, one.line, one.message]),
		).toEqual(problems);
	});

	test.each<[string, AdrFolder, [string, number, string][]]>([
		[
			"no Status line",
			withFile(FOLDER, replaced(ALPHA, "Status: Accepted\n", "")),
			[[ALPHA.path, 1, "ADR 0001 needs one Status line, and it has none"]],
		],
		[
			"a second Status line in a decision",
			withFile(
				FOLDER,
				replaced(ALPHA, "Text.\n", "Text.\nStatus: Deprecated · gone\n"),
			),
			[
				[
					ALPHA.path,
					13,
					"ADR 0001 needs one Status line, and it has one at each of lines 3 and 13",
				],
			],
		],
		[
			"a status that no lifecycle has",
			withFile(FOLDER, replaced(ALPHA, "Status: Accepted", "Status: Adopted")),
			[
				[
					ALPHA.path,
					3,
					'ADR 0001 has the status "Adopted", and a status is Proposed, Accepted, Deprecated or Superseded by NNNN',
				],
			],
		],
	])(
		"[control:adr-status-tree] treeProblems names %s",
		(_name, folder, problems) => {
			expect(
				treeProblems(folder).map((one) => [one.file, one.line, one.message]),
			).toEqual(problems);
		},
	);
});

const CARD = ((): ContextsCard => {
	const parsed = parseCard([
		{
			path: "CONTEXT.md",
			text: "# Glossary\n\n## Contexts\n\n```domain\ncontext Billing : src/billing/**\n```\n",
		},
	]);
	if (!parsed.ok || parsed.value.kind !== "card")
		throw new Error("the card fixture does not parse");
	return parsed.value;
})();

const FACTS: TemplateFacts = {
	card: CARD,
	registry: undefined,
	glossary: { path: "CONTEXT.md", terms: new Set(["Export"]) },
	controls: new Set(["export-rows-once"]),
};

const NEW_ADR = [
	"# 0005. Exports stream rows",
	"",
	"Status: Accepted",
	"Date: 2026-11-05",
	"Ticket: none",
	"Supersedes: none",
	"Amends: none",
	"",
	"## Context",
	"",
	"Exports build the file in memory.",
	"",
	"## Decisions",
	"",
	"### D1. Exports write each row as the query returns it",
	"",
	"Text.",
	"",
	"## Domain and effects",
	"",
	"Terms. Export",
	"",
	"```domain",
	"context Billing",
	"agg  Export @ src/billing/export.ts: ExportState",
	"inv  EX1 Export: an export sends each row once",
	"step streamRows : ExportQuery -> ExportRow[]",
	"law  L1 EX1 each row reaches the response once   check: prop export-rows-once",
	"rung R3",
	"```",
	"",
	"## Consequences",
	"",
	"Memory stays flat.",
	"",
	"## Alternatives considered",
	"",
	"- Build the file in memory. Rejected because it used 3 GB.",
	"",
].join("\n");

const NEW_PATH = `${DIR}/0005-exports-stream-rows.md`;

function headWith(text: string): AdrFolder {
	return { ...FOLDER, files: [...FOLDER.files, { path: NEW_PATH, text }] };
}

describe("the template rule of a new ADR", () => {
	test.each<[string, (text: string) => string, [number, string][]]>([
		["the template", (text) => text, []],
		[
			"None. and a reason in place of the fence",
			(text) =>
				text.replace(
					/```domain\n[\s\S]*?```\n/,
					"None. The decision changes only text.\n",
				),
			[],
		],
		[
			"no Domain and effects part",
			(text) =>
				text.replace(/## Domain and effects\n[\s\S]*?(?=## Consequences)/, ""),
			[[1, "a new ADR needs the part ## Domain and effects"]],
		],
		[
			"parts out of order",
			(text) =>
				text
					.replace("## Consequences\n\nMemory stays flat.\n\n", "")
					.replace(
						"## Context\n",
						"## Consequences\n\nMemory stays flat.\n\n## Context\n",
					),
			[
				[
					13,
					"## Context comes after ## Consequences; keep the order of the template",
				],
			],
		],
		[
			"a Superseded status",
			(text) => text.replace("Status: Accepted", "Status: Superseded by 0006"),
			[
				[
					3,
					'a new ADR has the status Proposed or Accepted, not "Superseded by 0006"',
				],
			],
		],
		[
			"no Amends: line",
			(text) => text.replace("Amends: none\n", ""),
			[[1, "a new ADR needs the header line Amends:"]],
		],
		[
			"no D1 heading",
			(text) => text.replace("### D1. ", "### D2. "),
			[[13, "## Decisions needs a ### D1. heading"]],
		],
		[
			"a term that the glossary does not define",
			(text) => text.replace("Terms. Export", "Terms. Export, Invoice"),
			[[21, 'Terms. names "Invoice", which CONTEXT.md does not define']],
		],
		[
			"no Terms. line",
			(text) => text.replace("Terms. Export\n\n", ""),
			[
				[
					19,
					"## Domain and effects needs a Terms. line with glossary terms or none",
				],
			],
		],
		[
			"no fence and no None. line",
			(text) => text.replace(/```domain\n[\s\S]*?```\n/, "Some prose.\n"),
			[
				[
					19,
					"## Domain and effects needs one domain fence, or None. and a reason",
				],
			],
		],
		[
			"an unknown card context",
			(text) => text.replace("context Billing", "context Shipping"),
			[
				[
					24,
					"context Shipping is no context of the card in CONTEXT.md; use Billing",
				],
			],
		],
		[
			"a prop law with no control",
			(text) => text.replace("prop export-rows-once", "prop export-gone"),
			[
				[
					28,
					"law L1 cites control:export-gone, which no test under tests/ declares",
				],
			],
		],
	])("[control:adr-template] %s", (_name, edit, problems) => {
		expect(
			templateProblems(FOLDER, headWith(edit(NEW_ADR)), FACTS).map((one) => [
				one.line,
				one.message,
			]),
		).toEqual(problems);
	});

	test("[control:adr-template-edit] an edited Domain and effects part of an older ADR runs the block rules, and an unchanged part runs none", () => {
		const base = headWith(
			NEW_ADR.replace("context Billing", "context Shipping"),
		);
		expect(templateProblems(base, base, FACTS)).toEqual([]);
		expect(
			templateProblems(
				base,
				headWith(NEW_ADR.replace("prop export-rows-once", "prop export-gone")),
				FACTS,
			).map((one) => [one.file, one.line]),
		).toEqual([[NEW_PATH, 28]]);
	});

	test("with no card, only the control of each prop law runs", () => {
		const facts: TemplateFacts = { ...FACTS, card: undefined };
		expect(
			templateProblems(
				FOLDER,
				headWith(
					NEW_ADR.replace("context Billing", "context Shipping").replace(
						"prop export-rows-once",
						"prop export-gone",
					),
				),
				facts,
			).map((one) => one.line),
		).toEqual([28]);
	});
});
