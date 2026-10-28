import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { command as plan } from "../../src/astack/cli/commands/plan.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import { driftReport } from "../../src/astack/plan/drift.ts";
import {
	type ExportOptions,
	exportPlan,
	importPlan,
	type WritePlan,
} from "../../src/astack/plan/export.ts";
import { writeKeys } from "../../src/astack/plan/keys.ts";
import {
	type PlanSet,
	planSetFromText,
} from "../../src/astack/plan/planset.ts";
import {
	EMPTY_SNAPSHOT,
	parseSnapshot,
	type Snapshot,
	type TrackerObject,
} from "../../src/astack/plan/tracker.ts";
import {
	applyWrites,
	commitAll,
	fixture,
	freshRepo,
	REPO,
	run,
	setFromRepo,
} from "./plan-helpers.ts";

const EXPORT = "docs/plans/member-export.md";
const INDEX = "docs/plans/data-platform/index.md";

function options(
	target: "linear" | "github",
	extra: Partial<ExportOptions> = {},
): ExportOptions {
	return {
		target,
		sha: "abc1234",
		team: "Core",
		repo: undefined,
		initiative: undefined,
		move: false,
		...extra,
	};
}

function toGithub(text: string): string {
	return text.replace(/\bABC-(\d+)\b/g, "#$1");
}

function setFor(path: string, target: "linear" | "github"): PlanSet {
	const set = setFromRepo(REPO, path);
	if (target === "linear") return set;
	const briefs = new Map(
		[...set.briefs.values()].map((brief) => [brief.path, brief.plan.text]),
	);
	return planSetFromText(set.path, toGithub(set.root.text), (brief) => {
		const text = briefs.get(brief);
		return text === undefined ? undefined : toGithub(text);
	});
}

function asGithub(repo: string): void {
	for (const path of [EXPORT, INDEX, "docs/plans/data-platform/B01.md"]) {
		const file = join(repo, path);
		writeFileSync(file, toGithub(readFileSync(file, "utf8")));
	}
	commitAll(repo, "use GitHub keys");
}

function exported(
	path: string,
	target: "linear" | "github",
	snapshot: Snapshot = EMPTY_SNAPSHOT,
	extra: Partial<ExportOptions> = {},
): WritePlan {
	const result = exportPlan(
		setFor(path, target),
		snapshot,
		options(target, extra),
	);
	if (!result.ok) throw new Error(result.error.join("\n"));
	return result.value;
}

function summaries(writePlan: WritePlan): string[] {
	return writePlan.writes.map((write) => write.summary);
}

describe("astack plan export", () => {
	test("a standard plan writes only the addendum comment on the existing ticket", () => {
		const writes = exported(EXPORT, "linear");
		expect(summaries(writes)).toEqual(["create comment Plan addendum"]);
		expect(writes.writes[0]?.call).toMatchObject({
			tool: "save_comment",
			args: { issueId: "ABC-120" },
		});
		expect(writes.keys).toEqual(["member-export/decisions"]);
	});

	test("export refuses a key that does not fit the target", () => {
		const result = exportPlan(
			setFromRepo(REPO, EXPORT),
			EMPTY_SNAPSHOT,
			options("github"),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.join("\n")).toContain(
			"ABC-120 is a Linear key, but the export goes to GitHub",
		);
		const back = exportPlan(
			setFor(EXPORT, "github"),
			EMPTY_SNAPSHOT,
			options("linear"),
		);
		expect(back.ok).toBe(false);
	});

	test("a programme maps to a project, milestones, decision issues, block issues and session sub-issues in Linear", () => {
		const writes = exported(INDEX, "linear");
		expect(summaries(writes)).toEqual([
			"create label group Kind",
			"create label Kind/decision",
			"create label group Lane",
			"create label Lane/a",
			"create label Lane/b",
			"create project Analysts query product events within one hour of capture",
			"create milestone M1 Events land in staging within 10 minutes",
			"create milestone M2 Analysts query events within one hour",
			"create issue Keep the staging table in the warehouse project?",
			"create issue B01 Stream events into the staging table",
			"create issue B02 Model the staging table",
			"create issue B01/S1 The ingest service publishes events to the queue",
			"create issue B01/S2 The consumer fills the staging table",
			"create document Analysts query product events within one hour of capture (plan index)",
			"create document B01 brief",
		]);
		const block = writes.writes.find(
			(write) => write.unit === "data-platform/B01",
		);
		expect(block?.call).toMatchObject({
			args: {
				parentId: "ABC-210",
				project: "<key:data-platform>",
				milestone: "M1 Events land in staging within 10 minutes",
				labels: ["Lane/a"],
			},
		});
		const b02 = writes.writes.find(
			(write) => write.unit === "data-platform/B02",
		);
		expect(b02?.call).toMatchObject({
			args: { blockedBy: ["<key:data-platform/Q1>"] },
		});
		const session = writes.writes.find(
			(write) => write.unit === "data-platform/B01/S2",
		);
		expect(session?.call).toMatchObject({
			args: {
				parentId: "<key:data-platform/B01>",
				blockedBy: ["<key:data-platform/B01/S1>"],
			},
		});
	});

	test("a programme maps to a map issue, repository milestones, sub-issues and labels in GitHub", () => {
		const writes = exported(INDEX, "github", EMPTY_SNAPSHOT, {
			repo: "acme/data",
		});
		const argv = (unit: string) => {
			const call = writes.writes.find((write) => write.unit === unit)?.call;
			return call?.via === "gh" ? call.argv : [];
		};
		expect(argv("data-platform")).toEqual([
			"gh",
			"issue",
			"create",
			"--title",
			"Analysts query product events within one hour of capture",
			"--type",
			"Feature",
			"--body-file",
			"-",
			"--label",
			"kind:programme",
			"-R",
			"acme/data",
		]);
		expect(argv("data-platform/M1").slice(0, 4)).toEqual([
			"gh",
			"api",
			"repos/acme/data/milestones",
			"-f",
		]);
		for (const write of writes.writes)
			if (write.call.via === "gh" && write.call.argv[1] === "api")
				expect(write.call.argv).not.toContain("-R");
		expect(argv("data-platform/B01/S2")).toContain("--blocked-by");
		expect(argv("data-platform/B01/S2")).toContain(
			"<number:data-platform/B01/S1>",
		);
		expect(argv("data-platform/B01/S1")).toEqual(
			expect.arrayContaining([
				"--type",
				"Task",
				"--parent",
				"<number:data-platform/B01>",
			]),
		);
		expect(argv("data-platform/Q1")).toEqual(
			expect.arrayContaining(["--label", "kind:decision"]),
		);
	});

	test("every issue body passes the ticket hook", () => {
		for (const path of [EXPORT, INDEX]) {
			for (const write of exported(path, "linear").writes) {
				if (write.call.via !== "linear" || write.call.tool !== "save_issue")
					continue;
				const output = runHook(
					"claude-code",
					"PreToolUse",
					JSON.stringify({
						hook_event_name: "PreToolUse",
						tool_name: "mcp__plugin_linear_linear__save_issue",
						cwd: REPO,
						tool_input: write.call.args,
					}),
					{},
				);
				expect(output.exit).toBe(0);
			}
		}
	});

	test("a session whose ticket is the plan ticket is the ticket itself, so export never writes it", () => {
		const set = planSetFromText(
			"docs/plans/shift-booking.md",
			fixture("shapes/shift-booking.md"),
			() => undefined,
		);
		const result = exportPlan(set, EMPTY_SNAPSHOT, options("linear"));
		if (!result.ok) throw new Error(result.error.join(";"));
		expect(summaries(result.value)).toEqual(["create comment Plan addendum"]);
	});

	test("a Linear export that creates issues needs a team, and a standard plan creates none", () => {
		const result = exportPlan(
			setFromRepo(REPO, INDEX),
			EMPTY_SNAPSHOT,
			options("linear", { team: undefined }),
		);
		expect(result.ok).toBe(false);
		expect(
			exportPlan(
				setFromRepo(REPO, EXPORT),
				EMPTY_SNAPSHOT,
				options("linear", { team: undefined }),
			).ok,
		).toBe(true);
	});

	test.each([
		[EXPORT, "linear"],
		[EXPORT, "github"],
		[INDEX, "linear"],
		[INDEX, "github"],
	] as const)(
		"a second export of %s to %s plans no tracker write",
		(path, target) => {
			const first = exported(path, target);
			const applied = applyWrites(first, EMPTY_SNAPSHOT);
			expect(exported(path, target, applied).writes).toEqual([]);
		},
	);

	test("export rewrites only the owned fields that changed", () => {
		const first = exported(INDEX, "github");
		const applied = applyWrites(first, EMPTY_SNAPSHOT);
		const set = setFor(INDEX, "github");
		const changed = planSetFromText(
			set.path,
			set.root.text.replace(
				"B01 Stream events into the staging table.",
				"B01 Stream web events into the staging table.",
			),
			(path) =>
				set.briefs.get("B01")?.path === path
					? set.briefs.get("B01")?.plan.text
					: undefined,
		);
		const result = exportPlan(changed, applied, options("github"));
		if (!result.ok) throw new Error(result.error.join(";"));
		expect(
			summaries(result.value).map((s) => s.replace(/#\d+/, "#n")),
		).toContain(
			"update #n B01 Stream web events into the staging table (title, body)",
		);
	});

	test("an update over a person's edit is marked, and needs --overwrite", () => {
		const first = exported(INDEX, "github");
		const applied = applyWrites(first, EMPTY_SNAPSHOT);
		const set = setFor(INDEX, "github");
		const changed = planSetFromText(
			set.path,
			set.root.text.replace(
				"B01 Stream events into the staging table.",
				"B01 Stream web events into the staging table.",
			),
			(path) =>
				set.briefs.get("B01")?.path === path
					? set.briefs.get("B01")?.plan.text
					: undefined,
		);
		const edited = new Set(["data-platform/B01"]);
		const refused = exportPlan(changed, applied, options("github", { edited }));
		expect(refused.ok).toBe(false);
		if (!refused.ok)
			expect(refused.error.join("\n")).toContain(
				"overwrites an edit that a person made in the tracker",
			);
		const forced = exportPlan(
			changed,
			applied,
			options("github", { edited, overwrite: true }),
		);
		expect(forced.ok).toBe(true);
	});
});

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

describe("astack plan drift", () => {
	const set = setFor(INDEX, "github");
	const applied = applyWrites(exported(INDEX, "github"), EMPTY_SNAPSHOT);
	const drift = (
		snapshot: Snapshot,
		renderAt: (
			sha: string,
		) => ReturnType<typeof setFromRepo> | undefined = () => set,
	) =>
		driftReport(set, snapshot, {
			target: "github",
			today: "2026-10-16",
			now: new Date("2026-10-16T12:00:00Z"),
			renderAt,
		});
	const edit = (
		unit: string,
		change: (object: TrackerObject) => TrackerObject,
	): Snapshot => ({
		...applied,
		objects: applied.objects.map((object) =>
			object.link === unit ? change(object) : object,
		),
	});

	test("an applied export shows no drift", () => {
		expect(drift(applied)).toEqual([]);
	});

	test("an empty tracker shows every unit as not exported", () => {
		expect(new Set(drift(EMPTY_SNAPSHOT).map((d) => d.kind))).toEqual(
			new Set(["not-exported"]),
		);
	});

	test("a person's edit is edited-in-tracker, and a plan change is stale-export", () => {
		const edited = edit("data-platform/B01", (object) => ({
			...object,
			body: `A person wrote this.\n\n${object.body}`,
		}));
		expect(drift(edited).map((d) => d.kind)).toEqual(["edited-in-tracker"]);
		const newer = planSetFromText(
			set.path,
			set.root.text.replace(
				"Stream events into the staging table.",
				"Stream web events into the staging table.",
			),
			(path) =>
				set.briefs.get("B01")?.path === path
					? set.briefs.get("B01")?.plan.text
					: undefined,
		);
		const stale = driftReport(newer, applied, {
			target: "github",
			today: "2026-10-16",
			now: new Date(),
			renderAt: () => set,
		});
		expect(stale.map((d) => d.kind)).toContain("stale-export");
		expect(stale.map((d) => d.kind)).not.toContain("edited-in-tracker");
	});

	test("orphans, unmapped children, edges and status contradictions", () => {
		const block = applied.objects.find(
			(object) => object.link === "data-platform/B01",
		);
		if (!block) throw new Error("the export holds no B01 issue");
		const extra: TrackerObject[] = [
			{
				...block,
				key: "#990",
				link: "data-platform/B07",
				title: "B07 Old block",
			},
			{
				...block,
				key: "#991",
				link: undefined,
				title: "A side fix",
				parent: block.key,
				body: "found later",
			},
		];
		const snapshot = edit("data-platform/B01/S1", (object) => ({
			...object,
			blockedBy: ["#555"],
			state: "done",
			pr: { number: 12, state: "open", url: undefined, branch: undefined },
		}));
		const kinds = drift({
			...snapshot,
			objects: [...snapshot.objects, ...extra],
		}).map((d) => d.kind);
		expect(kinds).toEqual(
			expect.arrayContaining([
				"orphan",
				"unmapped-child",
				"edge-mismatch",
				"done-with-open-pr",
			]),
		);
	});

	test("a stale claim and a past target date", () => {
		const late = planSetFromText(
			set.path,
			set.root.text.replace("Target. 2026-11-20", "Target. 2026-10-01"),
			() => set.briefs.get("B01")?.plan.text,
		);
		const claimed = edit("data-platform/B01/S1", (object) => ({
			...object,
			state: "in-progress",
			claimedAt: "2026-10-14T08:00:00Z",
		}));
		const kinds = driftReport(late, claimed, {
			target: "github",
			today: "2026-10-16",
			now: new Date("2026-10-16T12:00:00Z"),
			renderAt: () => late,
		}).map((d) => d.kind);
		expect(kinds).toEqual(
			expect.arrayContaining(["stale-claim", "past-target"]),
		);
	});

	test("the command reads tracker JSON on stdin and exits 1 on drift", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		asGithub(repo);
		const input = JSON.stringify({
			target: "github",
			objects: applied.objects,
			labels: applied.labels,
		});
		expect(run(plan.run, ["drift", INDEX], repo, { input })).toMatchObject({
			code: 0,
			out: "data-platform: no drift between the plan and the tracker\n",
		});
		const none = run(plan.run, ["drift", INDEX], repo, { input: "[]" });
		expect(none.code).toBe(1);
		expect(none.out).toContain("not-exported");
		expect(run(plan.run, ["drift", INDEX], repo, { input: "{bad" }).code).toBe(
			2,
		);
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});

	test("the command finds a stale export through the commit in the back-link", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		asGithub(repo);
		const first = run(
			plan.run,
			["export", EXPORT, "--to", "github", "--json"],
			repo,
		);
		const snapshot = applyWrites(JSON.parse(first.out), EMPTY_SNAPSHOT);
		const path = join(repo, EXPORT);
		writeFileSync(
			path,
			readFileSync(path, "utf8").replace(
				"A member who is not an admin gets 403 from the export route",
				"A member who is not an admin gets 403 from each export route",
			),
		);
		commitAll(repo, "change D3");
		const result = run(plan.run, ["drift", EXPORT], repo, {
			input: JSON.stringify(snapshot),
		});
		expect(result.code).toBe(1);
		expect(result.out).toContain("stale-export");
		expect(result.out).toContain("the plan changed since export");
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});
});

describe("astack plan move and import", () => {
	test("move writes the plan copy with its new home and deletes the repo files", () => {
		const moved = exported(INDEX, "linear", EMPTY_SNAPSHOT, { move: true });
		expect(moved.kind).toBe("move");
		const deletes = moved.writes
			.filter((write) => write.call.via === "repo")
			.map((write) => (write.call.via === "repo" ? write.call.path : ""));
		expect(deletes).toEqual([INDEX, "docs/plans/data-platform/B01.md"]);
		const copy = moved.writes.find(
			(write) => write.unit === "data-platform/copy",
		);
		expect(JSON.stringify(copy?.call)).toContain("home: linear");
	});

	test.each(["linear", "github"] as const)(
		"import gives back the moved plan with home repo (%s)",
		(target) => {
			const moved = exported(INDEX, target, EMPTY_SNAPSHOT, { move: true });
			const snapshot = applyWrites(moved, EMPTY_SNAPSHOT);
			const result = importPlan("data-platform", snapshot, target, "def5678");
			if (!result.ok) throw new Error(result.error.join(";"));
			const files = new Map(
				result.value.writes.flatMap((write) =>
					write.call.via === "repo" && write.call.content
						? [[write.call.path, write.call.content] as const]
						: [],
				),
			);
			const keyed = (text: string) =>
				target === "github" ? toGithub(text) : text;
			expect(files.get(INDEX)).toBe(keyed(fixture(`repo/${INDEX}`)));
			expect(files.get("docs/plans/data-platform/B01.md")).toBe(
				keyed(fixture("repo/docs/plans/data-platform/B01.md")),
			);
			expect(
				result.value.writes.filter((write) => write.action === "update"),
			).toHaveLength(2);
		},
	);

	test("a standard plan moves to one copy and comes back", () => {
		const moved = exported(EXPORT, "github", EMPTY_SNAPSHOT, { move: true });
		const snapshot = applyWrites(moved, EMPTY_SNAPSHOT);
		const result = importPlan("member-export", snapshot, "github", "def5678");
		if (!result.ok) throw new Error(result.error.join(";"));
		const write = result.value.writes.find(
			(candidate) => candidate.call.via === "repo",
		);
		expect(write?.call.via === "repo" ? write.call.content : "").toBe(
			toGithub(fixture(`repo/${EXPORT}`)),
		);
	});

	test("export refuses a plan whose home is the tracker", () => {
		const set = setFromRepo(REPO, EXPORT);
		const away = planSetFromText(
			set.path,
			set.root.text.replace("home: repo", "home: linear"),
			() => undefined,
		);
		expect(exportPlan(away, EMPTY_SNAPSHOT, options("linear")).ok).toBe(false);
	});

	test("drift on a moved plan reads the plan from the tracker copy", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		const moved = exported(EXPORT, "github", EMPTY_SNAPSHOT, { move: true });
		const snapshot = applyWrites(moved, EMPTY_SNAPSHOT);
		rmSync(join(repo, EXPORT));
		commitAll(repo, "move the plan");
		const result = run(plan.run, ["drift", "member-export"], repo, {
			input: JSON.stringify(snapshot),
		});
		expect(result.out).toBe(
			"member-export: no drift between the plan and the tracker\n",
		);
		expect(result.code).toBe(0);
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});

	test("a moved programme shows no drift right after the move", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		const moved = exported(INDEX, "linear", EMPTY_SNAPSHOT, { move: true });
		const snapshot = applyWrites(moved, EMPTY_SNAPSHOT);
		rmSync(join(repo, "docs/plans/data-platform"), {
			recursive: true,
			force: true,
		});
		commitAll(repo, "move the plan");
		const result = run(plan.run, ["drift", "data-platform"], repo, {
			input: JSON.stringify({ ...snapshot, target: "linear" }),
		});
		expect(result.out).not.toContain("edited-in-tracker");
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});

	test("drift on a slug of a plan in the repo reads the repo file", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		asGithub(repo);
		const first = exported(EXPORT, "github");
		const snapshot = applyWrites(first, EMPTY_SNAPSHOT);
		const path = join(repo, EXPORT);
		writeFileSync(
			path,
			readFileSync(path, "utf8").replace(
				"A member who is not an admin gets 403 from the export route",
				"A member who is not an admin gets 403 from each export route",
			),
		);
		commitAll(repo, "change D3");
		const result = run(plan.run, ["drift", "member-export"], repo, {
			input: JSON.stringify(snapshot),
		});
		expect(result.code).toBe(1);
		expect(result.out).toMatch(/stale-export|changed/);
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	});

	test("a Linear export, keys and a second export give no write and no project parent", () => {
		const dirs: string[] = [];
		const repo = freshRepo(dirs);
		const first = run(
			plan.run,
			["export", INDEX, "--to", "linear", "--team", "Core", "--json"],
			repo,
		);
		const plan1: WritePlan = JSON.parse(first.out);
		const snapshot = applyWrites(plan1, EMPTY_SNAPSHOT);
		const keyed = Object.fromEntries(
			snapshot.objects.flatMap((object) =>
				object.link ? [[object.link, object.key]] : [],
			),
		);
		expect(
			run(plan.run, ["keys", INDEX], repo, { input: JSON.stringify(keyed) })
				.code,
		).toBe(0);
		expect(
			readFileSync(join(repo, "docs/plans/data-platform/B01.md"), "utf8"),
		).not.toContain(`tracker: ${keyed["data-platform"]}`);
		commitAll(repo, "keys");
		const again = run(
			plan.run,
			[
				"export",
				INDEX,
				"--to",
				"linear",
				"--team",
				"Core",
				"--tracker",
				"-",
				"--json",
			],
			repo,
			{ input: JSON.stringify({ ...snapshot, target: "linear" }) },
		);
		const plan2: WritePlan = JSON.parse(again.out);
		expect(
			plan2.writes.every((write) =>
				write.summary.startsWith("update document"),
			),
		).toBe(true);
		for (const write of plan2.writes)
			if (write.call.via === "linear")
				expect(write.call.args.parentId).not.toBe(keyed["data-platform"]);
		for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
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
