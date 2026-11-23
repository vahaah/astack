import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { command as plan } from "../../src/astack/cli/commands/plan.ts";
import { writeKeys } from "../../src/astack/plan/keys.ts";
import { planSetFromText } from "../../src/astack/plan/planset.ts";
import { parseSnapshot } from "../../src/astack/plan/tracker.ts";
import { fixture, freshRepo, REPO, run } from "./plan-helpers.ts";

const EXPORT = "docs/plans/member-export.md";
const INDEX = "docs/plans/data-platform/index.md";

describe("astack plan keys", () => {
	test("writes keys into Ticket lines, block lines, questions and the frontmatter", () => {
		const index = fixture(`repo/${INDEX}`);
		const keys = new Map([
			["data-platform", "Data platform delivery"],
			["data-platform/M1", "M1 Events land in staging within 10 minutes"],
			["data-platform/B02", "ABC-302"],
			["data-platform/Q1", "ABC-305"],
			["data-platform/copy", "doc-1"],
		]);
		const result = writeKeys(index, "data-platform", keys);
		expect(result.applied).toEqual([
			"data-platform",
			"data-platform/M1",
			"data-platform/B02",
			"data-platform/Q1",
		]);
		expect(result.text).toContain("tracker: Data platform delivery\n");
		expect(result.text).toContain(
			"State. now\nTicket. M1 Events land in staging within 10 minutes\n",
		);
		expect(result.text).toContain(
			"- B02 Model the staging table. Lane. b. Brief. stub. Ticket. ABC-302.",
		);
		expect(result.text).toMatch(/Decide by\. M1\. Ticket\. ABC-305\.\n/);
		expect(writeKeys(result.text, "data-platform", keys).text).toBe(
			result.text,
		);
	});

	test("a GitHub key goes into the frontmatter as a quoted value", () => {
		const text = fixture(`repo/${EXPORT}`).replace(
			"tracker: ABC-120",
			"tracker: none",
		);
		const result = writeKeys(
			text,
			"member-export",
			new Map([["member-export", "#101"]]),
		);
		expect(result.text).toContain('tracker: "#101"\n');
		const set = planSetFromText(EXPORT, result.text, () => undefined);
		expect(set.root.frontmatter.fields.get("tracker")?.value).toBe('"#101"');
	});

	test("the command reads stdin and writes each plan file", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		const result = run(plan.run, ["keys", EXPORT], repo, {
			input: JSON.stringify({
				"member-export/S2": "ABC-125",
				"member-export/decisions": "c-9",
			}),
		});
		expect(result.code).toBe(0);
		expect(result.out).toContain(
			"1 keys written; 1 kept only in the tracker back-links (member-export/decisions)",
		);
		expect(readFileSync(join(repo, EXPORT), "utf8")).toContain(
			"State. later\nTicket. ABC-125\nDepends on. S1.",
		);
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});
});

describe("removed plan subcommands", () => {
	test.each(["move", "import"])(
		"astack plan %s is an unknown subcommand",
		(sub) => {
			const result = run(plan.run, [sub, "x", "--to", "linear"], REPO);
			expect(result.code).toBe(2);
			expect(result.err).toStartWith("astack plan: give one of\n");
		},
	);

	test("[control:plan-cut-commands] astack plan export and astack plan drift exit 2 and usage names neither", () => {
		for (const sub of ["export", "drift"] as const) {
			const res = run(plan.run, [sub, EXPORT], REPO);
			expect(res.code).toBe(2);
			expect(res.err).toStartWith("astack plan: give one of\n");
		}
		expect(plan.usage).not.toContain("export");
		expect(plan.usage).not.toContain("drift");
		expect(plan.summary).not.toContain("export");
		expect(plan.summary).not.toContain("drift");
	});
});

describe("tracker snapshots", () => {
	test("parse Linear and GitHub shapes into one model", () => {
		const parsed = parseSnapshot(
			JSON.stringify({
				target: "github",
				objects: [
					{
						number: 12,
						title: "B01 x",
						body: "text\n\nastack: data-platform/B01 @ abc",
						state: "OPEN",
						labels: ["lane:a"],
					},
					{
						identifier: "ABC-3",
						title: "S1 y",
						status: "In Review",
						parentId: "ABC-1",
						blockedBy: ["ABC-2"],
					},
				],
				labels: ["lane:a"],
				prs: [{ number: 4, state: "OPEN", isDraft: true }],
			}),
		);
		if (!parsed.ok) throw new Error(parsed.error.join(";"));
		const [github, linear] = parsed.value.objects;
		expect(github).toMatchObject({
			key: "#12",
			state: "todo",
			link: "data-platform/B01",
		});
		expect(linear).toMatchObject({
			key: "ABC-3",
			state: "in-review",
			parent: "ABC-1",
			blockedBy: ["ABC-2"],
		});
		expect(parsed.value.prs).toEqual([
			{ number: 4, state: "draft", url: undefined, branch: undefined },
		]);
	});

	test("refuse objects with no key", () => {
		expect(parseSnapshot(JSON.stringify([{ title: "x" }])).ok).toBe(false);
	});
});
