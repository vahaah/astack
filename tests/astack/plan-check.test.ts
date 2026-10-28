import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	checkAgainstBase,
	checkPlan,
	PLAN_CAPS,
	planSlug,
	readyToDelete,
} from "../../src/astack/plan/check.ts";
import { parsePlan } from "../../src/astack/plan/parse.ts";
import { proseFindings } from "../../src/astack/plan/prose.ts";
import { TEMPLATES } from "../../src/astack/plan/template.ts";
import type { PlanFinding } from "../../src/astack/plan/types.ts";
import { FIXTURES, fixture, fixtureEnv, REPO } from "./plan-helpers.ts";

const EXPORT = "docs/plans/member-export.md";
const INDEX = "docs/plans/data-platform/index.md";
const BRIEF = "docs/plans/data-platform/B01.md";

function check(text: string, path = EXPORT): PlanFinding[] {
	const root =
		path.startsWith("shapes/") || path.startsWith("invalid/") ? FIXTURES : REPO;
	return checkPlan(parsePlan(join(root, path), text), fixtureEnv(root));
}

function errors(findings: readonly PlanFinding[]): string[] {
	return findings.filter((f) => f.severity === "error").map((f) => f.message);
}

function warnings(findings: readonly PlanFinding[]): string[] {
	return findings.filter((f) => f.severity === "warning").map((f) => f.message);
}

const memberExport = fixture(`repo/${EXPORT}`);
const index = fixture(`repo/${INDEX}`);
const brief = fixture(`repo/${BRIEF}`);

describe("the fixture repo plans", () => {
	test.each([
		[EXPORT, memberExport],
		[INDEX, index],
		[BRIEF, brief],
	])("%s passes with no finding", (path, text) => {
		expect(check(text, path)).toEqual([]);
	});

	test("parses units, handles, steps and blocks", () => {
		const plan = parsePlan(EXPORT, memberExport);
		expect(plan.sessions.map((s) => s.handle)).toEqual(["S1", "S2"]);
		expect(
			plan.sessions[0]?.steps.map((s) => [s.id, s.wave, s.lane, s.checkpoint]),
		).toEqual([
			["1", "W1", "a", "report"],
			["2", "W1", "b", "report"],
			["3", "W2", "a", "report"],
			["4", "W2", "b", "approve ui"],
		]);
		expect(
			plan.decisions.rows.map((row) => [row.handle, row.kind, row.settled]),
		).toContainEqual(["D4", "decision", "delegated"]);
		const programme = parsePlan(INDEX, index);
		expect(
			programme.milestones[0]?.blocks.map((b) => [b.handle, b.lane, b.brief]),
		).toEqual([
			["B01", "a", "B01.md"],
			["B02", "b", "stub"],
		]);
		expect(programme.questions[0]?.binds).toEqual(["B02"]);
		expect(programme.questions[0]?.decideBy).toBe("M1");
	});

	test("a template parses into each tier", () => {
		expect(
			parsePlan("x.md", TEMPLATES.standard).sessions[0]?.steps,
		).toHaveLength(3);
		expect(parsePlan("x.md", TEMPLATES.brief).sessions[0]?.handle).toBe(
			"B01/S1",
		);
		expect(
			parsePlan("x.md", TEMPLATES.programme).milestones.map((m) => m.handle),
		).toEqual(["M1", "M2"]);
	});
});

describe("the caps fit the owner's real plans", () => {
	const shapes = [
		["shapes/shift-booking.md", 10_802, ["steps"]],
		["shapes/partner-go-live.md", 19_670, ["47 steps"]],
		["shapes/form-order.md", 27_247, ["16 steps", "bytes"]],
	] as const;

	test.each(shapes)(
		"%s has the size of its source plan and passes with no error",
		(path, size, expected) => {
			const text = fixture(path);
			const bytes = Buffer.byteLength(text, "utf8");
			expect(Math.abs(bytes - size) / size).toBeLessThan(0.03);
			const findings = check(text, path);
			expect(errors(findings)).toEqual([]);
			for (const warning of warnings(findings))
				expect(expected.some((part) => warning.includes(part))).toBe(true);
		},
	);

	test("the long grill shape is past the warn cap and under the deny cap", () => {
		const bytes = Buffer.byteLength(fixture("shapes/form-order.md"), "utf8");
		expect(bytes).toBeGreaterThan(PLAN_CAPS.planWarnBytes);
		expect(bytes).toBeLessThan(PLAN_CAPS.planDenyBytes);
	});

	test("the go-live shape has many decision rows and an integrator lane", () => {
		const plan = parsePlan("x.md", fixture("shapes/partner-go-live.md"));
		const steps = plan.sessions[0]?.steps ?? [];
		expect(steps.length).toBe(47);
		expect(new Set(steps.map((s) => s.wave)).size).toBe(8);
		expect(steps.some((s) => s.lane === "integrator")).toBe(true);
		expect(
			parsePlan("x.md", fixture("shapes/shift-booking.md")).decisions.rows
				.length,
		).toBe(31);
	});

	test("a standard plan over 32 KB fails, and a programme index over 16 KB fails", () => {
		const big = memberExport.replace(
			"## Proof",
			`## Proof\n\n${"- `bun test` passes.\n".repeat(1700)}`,
		);
		expect(errors(check(big))).toContainEqual(
			expect.stringContaining("stops at 32768"),
		);
		const bigIndex = index.replace(
			"## Not yet specified\n",
			`## Not yet specified\n\n${"- A question nobody can ask yet.\n".repeat(560)}`,
		);
		expect(errors(check(bigIndex, INDEX))).toContainEqual(
			expect.stringContaining("stops at 16384"),
		);
	});

	test("a programme index warns past 15 live decisions, and a standard plan has no row cap", () => {
		const rows = Array.from(
			{ length: 16 },
			(_, i) =>
				`| D${i + 3} | rule | Rule ${i} holds | | two-way | user R1 | plan |`,
		).join("\n");
		const many = index.replace("| D2 | rule |", `${rows}\n| D2 | rule |`);
		expect(warnings(check(many, INDEX))).toContainEqual(
			expect.stringContaining("18 live decisions"),
		);
		const standard = memberExport.replace(
			"| D4 |",
			`${rows.replaceAll("| D", "| D1")}\n| D4 |`,
		);
		expect(errors(check(standard))).toEqual([]);
	});
});

describe("sessions and steps", () => {
	test("two steps in one wave on one hot-file region fail", () => {
		const findings = check(
			fixture("invalid/hot-file-clash.md"),
			"invalid/hot-file-clash.md",
		);
		expect(errors(findings)).toEqual([
			expect.stringContaining("both edit src/router.ts in W1"),
		]);
	});

	test("two regions of one file in one wave pass, and the integrator lane may share a file", () => {
		const regions = fixture("invalid/hot-file-clash.md").replace(
			"src/router.ts |",
			"src/router.ts#list |",
		);
		expect(errors(check(regions, "invalid/hot-file-clash.md"))).toEqual([]);
		const integrator = fixture("invalid/hot-file-clash.md")
			.replaceAll("| a |", "| integrator |")
			.replaceAll("| b |", "| integrator |");
		expect(errors(check(integrator, "invalid/hot-file-clash.md"))).toEqual([]);
	});

	test("one now session per lane", () => {
		const twoNow = memberExport.replace(
			"State. later\nDepends on. S1.",
			"State. now\nDepends on. S1.",
		);
		expect(errors(check(twoNow))).toContainEqual(
			"2 sessions are now; keep one now session per lane",
		);
		const second = [
			"### S2 Large exports run as jobs",
			"",
			"State. now",
			"Lane. jobs",
			"Depends on. None.",
			"Exit.",
			"- Given a 2M-row export, when it runs, then a link arrives within 10 minutes.",
			"Proof. `bun test jobs`",
			"",
			"| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |",
			"|---|---|---|---|---|---|---|---|---|",
			"| 1 | Queue large exports | W1 | jobs | src/jobs/export.ts | D4 | A 2M-row export queues one job | `bun test jobs` | report |",
			"",
		].join("\n");
		const lanes = memberExport
			.replace(
				"State. now\nDepends on. None.",
				"State. now\nLane. web\nDepends on. None.",
			)
			.replace(/### S2[\s\S]*?(?=## Proof)/, second)
			.replace(" Blocks. S2.", "");
		expect(errors(check(lanes))).toEqual([]);
	});

	test("Depends on names earlier sessions only", () => {
		const forward = memberExport.replace(
			"State. now\nDepends on. None.",
			"State. now\nDepends on. S2.",
		);
		expect(errors(check(forward))).toContainEqual(
			"S1: depends on S2, which is not an earlier session in this plan",
		);
	});

	test("a step names live decisions, a wave and a checkpoint reason", () => {
		const bad = memberExport
			.replace("| D3 | A member call", "| D9 | A member call")
			.replace(
				"| W2 | b | src/ui/members.tsx",
				"| wave two | b | src/ui/members.tsx",
			)
			.replace("approve ui |", "approve |");
		const found = errors(check(bad));
		expect(found).toContainEqual(
			"S1 step 2: Covers names D9, which is not a live decision",
		);
		expect(found).toContainEqual("S1 step 4: Wave is W<n>");
		expect(found).toContainEqual(
			expect.stringContaining(
				"S1 step 4: Checkpoint is report, approve ui or approve one-way",
			),
		);
	});

	test("steps out of wave order warn, and more than 8 steps in one wave warn", () => {
		const swapped = memberExport.replace(
			"| 2 | Guard the export route for admins | W1 |",
			"| 2 | Guard the export route for admins | W3 |",
		);
		expect(warnings(check(swapped))).toContainEqual(
			expect.stringContaining("W2 comes after W3"),
		);
		const rows = Array.from(
			{ length: 9 },
			(_, i) =>
				`| ${i + 5} | Add check ${i} | W2 | c${i} | src/c${i}.ts | | Check ${i} passes | | report |`,
		).join("\n");
		const many = memberExport
			.replace(
				"| 4 | Add the Export button",
				`${rows}\n| 14 | Add the Export button`,
			)
			.replaceAll("| W1 |", "| W2 |");
		expect(warnings(check(many))).toContainEqual(
			expect.stringContaining("in one wave; label waves"),
		);
	});

	test("a steps table with a register column fails", () => {
		const status = memberExport.replace(
			"| Proof | Checkpoint |\n|---|---|---|---|---|---|---|---|---|",
			"| Proof | Checkpoint | Status |\n|---|---|---|---|---|---|---|---|---|---|",
		);
		expect(errors(check(status))).toContainEqual(
			"S1: the steps table has a Status column; status lives in the tracker",
		);
	});

	test("a register table fails", () => {
		expect(
			errors(
				check(
					fixture("invalid/register-table.md"),
					"invalid/register-table.md",
				),
			),
		).toEqual([expect.stringContaining("a register table")]);
	});

	test("a plan used as a diary fails on every ledger rule", () => {
		const found = errors(
			check(fixture("invalid/ledger-plan.md"), "invalid/ledger-plan.md"),
		);
		for (const part of [
			"## Progress is a ledger",
			"a checkbox",
			"a Status: line",
			"still a default",
			"missing ## Proof",
		])
			expect(found.some((m) => m.includes(part))).toBe(true);
	});

	test("an active plan needs a now session, and execute names now sessions only", () => {
		const none = memberExport.replace(
			"State. now\nDepends on. None.",
			"State. next\nDepends on. None.",
		);
		expect(errors(check(none))).toContainEqual(
			"an active plan has a now session",
		);
		const wrong = memberExport.replace("execute: S1", "execute: S2");
		expect(errors(check(wrong))).toContainEqual(
			"execute names S2, which is not a now session",
		);
		const draft = memberExport.replace("status: active", "status: draft");
		expect(errors(check(draft))).toContainEqual(
			"a draft plan has execute none; only an owner answer grants execution",
		);
	});
});

describe("frontmatter", () => {
	test("delegate and checkpoints take their values", () => {
		const bad = memberExport
			.replace("delegate: off", "delegate: yes")
			.replace("checkpoints: report", "checkpoints: always");
		const found = errors(check(bad));
		expect(found).toContainEqual("delegate yes is not on or off");
		expect(found).toContainEqual("checkpoints always is not report or approve");
	});

	test("owner gates are fixed, and only a programme lifts hosted migrations", () => {
		const money = memberExport.replace("money, ", "");
		expect(errors(check(money))).toContainEqual(
			"owner-gates drops money; it is a fixed owner gate",
		);
		const hosted = memberExport.replace("hosted migration, ", "");
		expect(errors(check(hosted))).toContainEqual(
			"only a programme can lift the hosted migration gate",
		);
		const programme = index.replace("hosted migration 3 per day, ", "");
		expect(errors(check(programme, INDEX))).toEqual([]);
	});

	test("home other than repo warns that the tracker copy is the plan", () => {
		expect(
			warnings(check(memberExport.replace("home: repo", "home: linear"))),
		).toContainEqual(expect.stringContaining("home is linear"));
	});

	test("a brief needs its programme and block, and its sessions use the block handle", () => {
		const bare = brief.replace("programme: data-platform\n", "");
		expect(errors(check(bare, BRIEF))).toContainEqual(
			"a brief needs programme",
		);
		const other = brief.replace("### B01/S2", "### B02/S2");
		expect(errors(check(other, BRIEF))).toContainEqual(
			"B02/S2 belongs to another block; this brief is B01",
		);
		expect(
			errors(check(memberExport.replace("### S2", "### B01/S2"))),
		).toContainEqual("B01/S2 is a programme handle; a standard plan uses S<n>");
	});
});

describe("decisions", () => {
	test("a row has a D handle, a kind, a door and a settled value", () => {
		const bad = memberExport
			.replace("| D1 | goal |", "| 1 | goal |")
			.replace("| D3 | rule |", "| D3 | behaviour |")
			.replace("| two-way | delegated |", "| maybe | owner |");
		const found = errors(check(bad));
		expect(found).toContainEqual(
			'a decision row starts with its D<n> handle, not "1"',
		);
		expect(found).toContainEqual(
			'D3 kind is "behaviour"; use goal, decision, rule, tech',
		);
		expect(found).toContainEqual('D4 door is "maybe"; use one-way or two-way');
		expect(found).toContainEqual(
			'D4 settled is "owner"; use user R<n>, delegated, evidence or default',
		);
	});

	test("a one-way door names its rejected option and cites an ADR or a question", () => {
		const bad = memberExport.replace(
			"| Build in memory, 3 GB peak at 2M rows | one-way | user R2 | ADR 0012 D1 |",
			"| | one-way | user R2 | plan |",
		);
		const found = errors(check(bad));
		expect(found).toContainEqual(
			"D2 is a one-way door; name the rejected option and why it lost",
		);
		expect(found).toContainEqual(
			expect.stringContaining("D2 is a one-way door; cite its ADR"),
		);
	});

	test("a default needs a question that settles it, and blocks active", () => {
		const draft = memberExport
			.replace("status: active", "status: draft")
			.replace("execute: S1", "execute: none")
			.replace("| delegated |", "| default |");
		expect(errors(check(draft))).toEqual([
			"D4 is a default; an unresolved question must say Settles. D4.",
		]);
		const settled = draft.replace("Blocks. S2.", "Blocks. S2. Settles. D4.");
		expect(errors(check(settled))).toEqual([]);
		const active = settled
			.replace("status: draft", "status: active")
			.replace("execute: none", "execute: S1");
		expect(errors(check(active))).toEqual([
			"D4 is still a default; ratify it in a round before active",
		]);
	});

	test("a superseded row keeps only its handle and its pointer", () => {
		const superseded = memberExport.replace(
			"| D4 | decision | Exports over 100k rows run as jobs that email a link | Every export as a job, most are small | two-way | delegated | plan |",
			"| D4 | | Superseded by D5 | | | | |\n| D5 | decision | Exports over 50k rows run as jobs | Every export as a job | two-way | user R3 | plan |",
		);
		expect(errors(check(superseded))).toEqual([]);
		const dirty = superseded.replace(
			"| D4 | | Superseded by D5 | | | | |",
			"| D4 | rule | Superseded by D5 | | | | |",
		);
		expect(errors(check(dirty))).toContainEqual(
			"superseded D4 keeps only | D4 | | Superseded by D5 | | | | |",
		);
	});

	test("a row past about 300 characters warns", () => {
		const long = memberExport.replace(
			"Every export as a job, most are small",
			"x ".repeat(220),
		);
		expect(warnings(check(long))).toContainEqual(
			expect.stringContaining("D4 runs"),
		);
	});

	test("old typed IDs warn, and the plan handles pass", () => {
		const typed = memberExport.replace(
			"The export serves the access review",
			"G1 says the export serves the access review",
		);
		expect(warnings(check(typed))).toContainEqual(
			"G1 reads like a typed ID; use one D<n> family with a Kind",
		);
	});
});

describe("unresolved questions", () => {
	test("a question that blocks the now session fails while active", () => {
		const blocking = memberExport.replace("Blocks. S2.", "Blocks. S1.");
		expect(errors(check(blocking))).toContainEqual(
			"question 1 blocks the now session S1",
		);
	});

	test("Settles and Blocks name real units", () => {
		const bad = memberExport.replace("Blocks. S2.", "Blocks. S7. Settles. D8.");
		const found = errors(check(bad));
		expect(found).toContainEqual("Blocks. S7 names no unit in this plan");
		expect(found).toContainEqual("Settles. D8 names no decision row");
	});

	test("the questions section comes last, and None. is legal", () => {
		const late = `${memberExport}\n## Premises\n\n- A premise.\n`;
		expect(errors(check(late))).toContainEqual(
			"## Unresolved questions comes last",
		);
		const none = memberExport.replace(
			/1\. Keep the job threshold[^\n]*\n/,
			"None.\n",
		);
		expect(errors(check(none))).toEqual([]);
	});
});

describe("programmes", () => {
	test("milestones carry a demo, a proof and real blocks", () => {
		const bad = index
			.replace("Brief. B01.md.", "Brief. B09.md.")
			.replace(
				"Lane. b. Brief. stub.",
				"Lane. z. Depends on. B07. Brief. stub.",
			)
			.replace("Target. 2026-11-20", "Target. soon");
		const found = errors(check(bad, INDEX));
		expect(found).toContainEqual(
			"B01: brief B09.md does not exist; write it, or say Brief. stub",
		);
		expect(found).toContainEqual("B02: lane z is not under ## Lanes");
		expect(found).toContainEqual(
			"B02: depends on B07, which is not a block in this index",
		);
		expect(found).toContainEqual("M1: Target is a YYYY-MM-DD date");
	});

	test("one now milestone, and an index has no execute grant", () => {
		const two = index.replace(
			"State. later\nDemo.",
			"State. now\nProof. `bun x`\nBlocks.\n- B03 Another block. Brief. stub.\nDemo.",
		);
		expect(errors(check(two, INDEX))).toContainEqual(
			"2 milestones are now; keep one",
		);
		const grant = index.replace("execute: none", "execute: B01/S1");
		expect(errors(check(grant, INDEX))).toContainEqual(
			"a programme index has execute none; each brief holds its own grant",
		);
	});

	test("an index is ready to delete when every milestone exited", () => {
		const exited = index
			.replace("State. now", "State. exited")
			.replace("State. later", "State. exited");
		expect(readyToDelete(parsePlan(INDEX, exited))).toBe(true);
		expect(readyToDelete(parsePlan(INDEX, index))).toBe(false);
	});
});

describe("prose", () => {
	const lines = (texts: readonly string[]) =>
		texts.map((text, i) => ({ n: i + 1, text, code: false }));
	const found = (texts: readonly string[]) =>
		proseFindings(lines(texts)).map(
			(f) => `${f.line} ${f.severity} ${f.group} ${f.message.split(":")[0]}`,
		);

	test("the STE engine finds dashes and the deny rules, and the plan rules find the rest", () => {
		const result = found([
			"Intro \u2014 with a long dash.",
			"Pages 3\u20135 are a range, and a \u2013 dash is not.",
			"It\u2019s curly.",
			"We don't stop; we go.",
			"Use e.g. a list, and/or a table.",
			`A ${"very ".repeat(26)}long sentence.`,
			"| Row \u2014 cell | x |",
		]);
		expect(result).toContainEqual("1 error ste STE dash");
		expect(result).toContainEqual("2 error ste STE dash");
		expect(result).toContainEqual(
			"3 error prose curly quote; use a straight quote",
		);
		expect(result).toContainEqual("4 warning ste STE contraction");
		expect(result).toContainEqual("4 warning ste STE semicolon");
		expect(result).toContainEqual("5 warning ste STE latin");
		expect(result).toContainEqual("5 warning ste STE and-or");
		expect(result).toContainEqual("6 warning ste STE sentence-length");
		expect(result).toContainEqual(
			"7 error prose long dash; use a period or a comma",
		);
	});

	test("a number range, inline code and a fenced block pass", () => {
		expect(
			found([
				"Pages 3\u20135 are a range.",
				"Run `a \u2014 b; c` once.",
				"```",
				"x \u2014 y; z",
				"```",
			]),
		).toEqual([]);
	});

	test("line numbers stay file line numbers after the front matter", () => {
		const after = [{ n: 5, text: "We don't stop.", code: false }] as const;
		expect(proseFindings(after).map((f) => f.line)).toEqual([5]);
	});
});

describe("check against the base", () => {
	const base = parsePlan(EXPORT, memberExport);
	const head = (text: string) =>
		checkAgainstBase(parsePlan(EXPORT, text), base, fixtureEnv()).map(
			(f) => f.message,
		);

	test("rewording an owner row in place fails", () => {
		expect(head(memberExport.replace("no guest", "no visitor"))).toContainEqual(
			"D1 is an owner decision; add a new row and supersede it instead of rewording",
		);
	});

	test("a delegated row may change wording", () => {
		expect(
			head(memberExport.replace("email a link", "email a download link")),
		).toEqual([]);
	});

	test("a new row may not reuse a number, and a row may not vanish", () => {
		const removed = memberExport.replace(/\| D3 \|.*\n/, "");
		expect(head(removed)).toContainEqual(
			"D3 disappeared; supersede it, or graduate it to an ADR or with a session that closed",
		);
		const closed = removed.replace(
			"State. now\nDepends on. None.",
			"State. done\nDepends on. None.",
		);
		expect(head(closed).filter((m) => m.includes("disappeared"))).toEqual([]);
	});

	test("the slug of an index is its directory", () => {
		expect(planSlug(join(FIXTURES, "repo", INDEX))).toBe("data-platform");
	});
});
