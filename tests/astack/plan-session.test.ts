import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command as board } from "../../src/astack/cli/commands/board.ts";
import { command as session } from "../../src/astack/cli/commands/session.ts";
import { buildBoard } from "../../src/astack/plan/board.ts";
import { parsePlan } from "../../src/astack/plan/parse.ts";
import {
	nextScope,
	type SessionRecord,
} from "../../src/astack/plan/session.ts";
import {
	EMPTY_SNAPSHOT,
	type Snapshot,
} from "../../src/astack/plan/tracker.ts";
import {
	checkText,
	DEFAULT_GLOSSARY,
	denied,
} from "../../src/astack/ste/check.ts";
import {
	commitAll,
	fixture,
	freshRepo,
	git,
	REPO,
	run,
	setFromRepo,
} from "./plan-helpers.ts";

const EXPORT = "docs/plans/member-export.md";
const INDEX = "docs/plans/data-platform/index.md";
const BRIEF = "docs/plans/data-platform/B01.md";
const dirs: string[] = [];
let repo = "";
let summary = "";

beforeAll(() => {
	repo = freshRepo(dirs);
	const notes = mkdtempSync(join(tmpdir(), "astack-summary-"));
	dirs.push(notes);
	summary = join(notes, "summary.md");
	writeFileSync(
		summary,
		"The export streams rows.\nThe route checks the admin role.\n",
	);
});

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function json(args: readonly string[], cwd = repo) {
	const result = run(session.run, [...args, "--json"], cwd);
	if (result.code !== 0) throw new Error(result.err);
	return JSON.parse(result.out);
}

describe("astack session", () => {
	test("start names the branch, claims the ticket and saves a record in the git dir", () => {
		const out = json(["start", EXPORT, "--prefix", "sam", "--ultracode"]);
		expect(out.record).toMatchObject({
			session: "S1",
			branch: "sam/abc-120/member-export",
			ultracode: true,
			checkpoints: [],
		});
		expect(out.writes).toEqual([
			expect.objectContaining({
				via: "linear",
				tool: "save_issue",
				args: { id: "ABC-120", state: "In Progress", assignee: "me" },
			}),
		]);
		expect(out.text).toContain("Checkpoints. One per step, mode report.");
		expect(out.text).toContain(
			"- W1, step 1. Remove the in-memory export path, lane a.\n- W1, step 2. Guard the export route for admins, lane b.",
		);
	});

	test("a brief start claims the session issue and posts a claim comment on it", () => {
		const spec = json(["start", BRIEF, "B01/S1", "--prefix", "sam"]);
		expect(spec.record.branch).toBe("sam/abc-210/b01-s1-data-platform");
		expect(
			spec.writes.map((write: { summary: string }) => write.summary),
		).toEqual(["move ABC-210 to In Progress and assign it to you"]);
		expect(spec.text).toContain("Delegation is on.");
		const path = join(repo, BRIEF);
		const text = readFileSync(path, "utf8");
		writeFileSync(
			path,
			text.replace(
				"### B01/S1 The ingest service publishes events to the queue\n\nState. now",
				"### B01/S1 The ingest service publishes events to the queue\n\nState. now\nTicket. ABC-211",
			),
		);
		const own = json(["start", BRIEF, "B01/S1", "--prefix", "sam"]);
		expect(
			own.writes.map((write: { summary: string }) => write.summary),
		).toEqual([
			"move ABC-211 to In Progress and assign it to you",
			"post a claim comment on ABC-211",
		]);
		writeFileSync(path, text);
	});

	test("a second start keeps the checkpoints of the record", () => {
		const dirs2: string[] = [];
		const other = freshRepo(dirs2);
		json(["start", EXPORT, "--prefix", "sam"], other);
		json(["checkpoint", EXPORT, "--summary", summary], other);
		const again = run(session.run, ["start", EXPORT, "--prefix", "sam"], other);
		expect(again.out).toContain(
			"The record of S1 already existed, so its 1 checkpoint stays.",
		);
		for (const dir of dirs2) rmSync(dir, { recursive: true, force: true });
	});

	test("checkpoint packages one step, opens a draft PR first, and keeps chat to 6 lines", () => {
		writeFileSync(join(repo, "src.txt"), "one\n");
		commitAll(repo, "step 1");
		const out = json([
			"checkpoint",
			EXPORT,
			"--gates",
			"lint 0, tests 12 of 12",
			"--summary",
			summary,
		]);
		const [chat = "", body = ""] = out.text.split(
			"\n--- package for the PR ---\n",
		);
		expect((chat.trim().split("\n\n")[0] ?? "").split("\n")).toHaveLength(6);
		expect(chat).toContain("S1 checkpoint 1 of 4. W1, step 1 done.");
		expect(body).toContain("Decisions covered. D2.");
		expect(body).toContain("Gates. lint 0, tests 12 of 12.");
		expect(body).toContain("src.txt");
		expect(body).toContain("Mode. report. The session continues.");
		expect(out.writes[0]).toMatchObject({
			argv: [
				"gh",
				"pr",
				"create",
				"--draft",
				"--head",
				"sam/abc-120/member-export",
				"--title",
				"One PR streams member exports",
				"--body-file",
				"-",
			],
		});
		expect(out.writes[0].stdin).toStartWith("Part of ABC-120\n\n## Why");
		expect(out.writes[0].stdin).toEndWith(
			"\n\nSession. S1 of docs/plans/member-export.md. Use ultracode.",
		);
		expect(out.writes[1]).toMatchObject({
			argv: [
				"gh",
				"pr",
				"comment",
				"sam/abc-120/member-export",
				"--body-file",
				"-",
			],
			stdin: body.trimEnd(),
		});
		expect(chat).toContain(
			'Warning. Step 1 of S1 has no commit whose subject says "S1 step <n>"',
		);
	});

	test("a later checkpoint posts on the PR, and a UI-taste step waits for approval", () => {
		writeFileSync(join(repo, "src.txt"), "two\n");
		commitAll(repo, "S1 step 2 guard the export route");
		const second = json(["checkpoint", EXPORT, "--summary", summary]);
		expect(second.writes).toHaveLength(1);
		expect(second.writes[0].argv).toEqual([
			"gh",
			"pr",
			"comment",
			"sam/abc-120/member-export",
			"--body-file",
			"-",
		]);
		expect(second.text).not.toContain("Warning.");
		expect(second.text).toContain("Commits.\n- ");
		json(["checkpoint", EXPORT, "--pr", "41", "--summary", summary]);
		const out = json(["checkpoint", EXPORT, "--summary", summary]);
		expect(out.writes[0]).toMatchObject({
			argv: ["gh", "pr", "comment", "41", "--body-file", "-"],
		});
		expect(out.text).toContain("Waiting for your approve.");
		expect(
			out.record.checkpoints.map((c: { steps: string[] }) => c.steps),
		).toEqual([["1"], ["2"], ["3"], ["4"]]);
	});

	test("handoff fits in 5 lines, comments on the ticket and the PR, and prints the resume prompt", () => {
		const out = json(["handoff", EXPORT]);
		const [comment = "", prompt = ""] = out.text.split(
			"\n--- resume prompt ---\n",
		);
		expect(comment.trim().split("\n")).toHaveLength(5);
		expect(comment).toContain("Done. Steps 1, 2, 3, 4");
		expect(
			out.writes.map((write: { summary: string }) => write.summary),
		).toEqual(["post the hand-off on ABC-120", "post the hand-off on PR #41"]);
		expect(comment).toContain(
			"Resume. astack session resume docs/plans/member-export.md. Use ultracode.",
		);
		expect(prompt).toEndWith(" Use ultracode.\n");
	});

	test("resume prints the prompt with the branch, the PR, the grant and ultracode", () => {
		const result = run(session.run, ["resume", EXPORT], repo);
		expect(result.out).toContain(
			"Resume docs/plans/member-export.md, session S1, on branch sam/abc-120/member-export (PR #41).",
		);
		expect(result.out).toContain("Every step is done.");
		expect(result.out).toContain("Delegation is off.");
		expect(result.out).toContain(" Use ultracode.");
		const brief = run(session.run, ["resume", BRIEF, "B01/S1"], repo);
		expect(brief.out).toContain("Delegation is on.");
		expect(brief.out).not.toContain("ultracode");
	});

	test("a checkpoint needs a summary, and a proof log goes in as its tail, never as a path", () => {
		const dirs2: string[] = [];
		const other = freshRepo(dirs2);
		json(["start", EXPORT, "--prefix", "sam"], other);
		const refused = run(session.run, ["checkpoint", EXPORT], other);
		expect(refused.code).toBe(2);
		expect(refused.err).toContain("give --summary");
		const log = join(dirs2[0] ?? other, "..", `proof-${Date.now()}.log`);
		writeFileSync(log, "red: 1 fail\ngreen: 12 pass\nred again: 1 fail\n");
		dirs2.push(log);
		const out = json(
			["checkpoint", EXPORT, "--summary", summary, "--proof", log],
			other,
		);
		const body: string = out.writes[1].stdin;
		expect(body).toContain(
			"Red-green-red. The tail of the log:\n\n```text\nred: 1 fail\ngreen: 12 pass\nred again: 1 fail\n```",
		);
		expect(body).not.toContain(log);
		expect(body).not.toContain("The integrator writes");
		for (const dir of dirs2) rmSync(dir, { recursive: true, force: true });
	});

	test("resume in a clone with no record reads the steps from the commits and the PR JSON", () => {
		const dirs2: string[] = [];
		const origin = freshRepo(dirs2);
		git(origin, "checkout", "-q", "-b", "sam/abc-120/member-export");
		for (const step of ["1", "2"]) {
			writeFileSync(join(origin, `step-${step}.txt`), `${step}\n`);
			commitAll(origin, `S1 step ${step} land the step`);
		}
		const pr = JSON.stringify({
			number: 52,
			body: "Part of ABC-120\n\nSession. S1 of docs/plans/member-export.md. Use ultracode.",
			comments: [
				{ body: "Checkpoint 3 of 4 for S1 (step 3).\n\nThe summary." },
			],
		});
		const result = run(
			session.run,
			["resume", EXPORT, "--tracker", "-", "--prefix", "sam"],
			origin,
			{ input: pr },
		);
		expect(result.code).toBe(0);
		expect(result.out).toContain(
			"on branch sam/abc-120/member-export (PR #52).",
		);
		expect(result.out).toContain(
			"The next step is 4 Add the Export button to the Members page in W2.",
		);
		expect(result.out).toContain(" Use ultracode.");
		for (const dir of dirs2) rmSync(dir, { recursive: true, force: true });
	});

	test("every text that the session CLI renders passes the STE deny rules", () => {
		const dirs2: string[] = [];
		const other = freshRepo(dirs2);
		const texts: string[] = [];
		const start = json(
			["start", EXPORT, "--prefix", "sam", "--ultracode"],
			other,
		);
		texts.push(start.text);
		for (const step of ["1", "2", "3"]) {
			writeFileSync(join(other, `s${step}.txt`), `${step}\n`);
			commitAll(other, `S1 step ${step} land the step`);
			const out = json(["checkpoint", EXPORT, "--summary", summary], other);
			texts.push(
				out.text,
				...out.writes.map((write: { stdin?: string }) => write.stdin ?? ""),
			);
		}
		const handoff = json(["handoff", EXPORT], other);
		texts.push(
			handoff.text,
			...handoff.writes.map((write: { stdin?: string }) => write.stdin ?? ""),
		);
		texts.push(run(session.run, ["resume", EXPORT], other).out);
		for (const text of texts) {
			const blocked = denied(
				checkText(text, {
					surface: "pr",
					enforcement: "deny",
					glossary: DEFAULT_GLOSSARY,
				}),
			);
			expect(
				blocked.map((finding) => `${finding.rule}: ${finding.sentence}`),
			).toEqual([]);
		}
		for (const dir of dirs2) rmSync(dir, { recursive: true, force: true });
	});

	test("more than 8 steps checkpoint once per wave", () => {
		const plan = parsePlan("x.md", fixture("shapes/partner-go-live.md"));
		const s1 = plan.sessions[0];
		if (!s1) throw new Error("no session");
		const record: SessionRecord = {
			plan: "x.md",
			session: "S1",
			branch: "b",
			base: undefined,
			started: "",
			ultracode: false,
			pr: undefined,
			checkpoints: [],
		};
		const first = nextScope(s1, record);
		expect(first.wave).toBe("W0");
		expect(first.steps.map((step) => step.id)).toEqual(["1", "2"]);
		const second = nextScope(s1, {
			...record,
			checkpoints: [{ at: "", steps: ["1", "2"], wave: "W0", head: undefined }],
		});
		expect(second.wave).toBe("W1");
		expect(second.steps).toHaveLength(6);
	});

	test("a programme index and an unknown session are refused", () => {
		expect(run(session.run, ["start", INDEX], repo).code).toBe(2);
		expect(run(session.run, ["start", EXPORT, "S9"], repo).err).toContain(
			"no session S9",
		);
		expect(
			run(session.run, ["checkpoint", BRIEF, "B01/S2"], repo).err,
		).toContain("run astack session start first");
	});

	test("the record lives in the git common dir", () => {
		const common = git(repo, "rev-parse", "--absolute-git-dir");
		expect(run(session.run, ["resume", EXPORT, "S1"], repo).code).toBe(0);
		expect(
			Bun.file(join(common, "astack/plans/member-export/session-S1.json")).size,
		).toBeGreaterThan(0);
	});
});

describe("astack board", () => {
	const set = setFromRepo(REPO, INDEX);

	test("with no tracker, the frontier is the first session, and B02 needs its brief", () => {
		const view = buildBoard(set, EMPTY_SNAPSHOT, 5);
		expect(view.frontier.map((row) => row.handle)).toEqual(["B01/S1"]);
		expect(view.launch.map((row) => row.handle)).toEqual(["B01/S1"]);
		expect(view.blocked.map((row) => row.handle)).toEqual(["B01/S2"]);
		expect(view.briefNext).toEqual(["B02 Model the staging table"]);
		expect(view.frontier[0]?.tail).toBe(2);
	});

	test("an open PR drains first, so nothing new launches", () => {
		const snapshot: Snapshot = {
			...EMPTY_SNAPSHOT,
			objects: [
				{
					key: "ABC-211",
					type: "issue",
					title: "B01/S1",
					body: undefined,
					state: "in-review",
					parent: undefined,
					milestone: undefined,
					blockedBy: [],
					labels: [],
					assignee: undefined,
					claimedAt: undefined,
					targetDate: undefined,
					on: undefined,
					pr: { number: 7, state: "open", url: undefined, branch: undefined },
					link: "data-platform/B01/S1",
				},
			],
		};
		const view = buildBoard(set, snapshot, 5);
		expect(view.drain.map((row) => row.handle)).toEqual(["B01/S1"]);
		expect(view.launch).toEqual([]);
	});

	test("a merged session unlocks the next one, and the WIP cap bounds launches", () => {
		const done: Snapshot = {
			...EMPTY_SNAPSHOT,
			objects: [
				{
					key: "ABC-211",
					type: "issue",
					title: "B01/S1",
					body: undefined,
					state: "done",
					parent: undefined,
					milestone: undefined,
					blockedBy: [],
					labels: [],
					assignee: undefined,
					claimedAt: undefined,
					targetDate: undefined,
					on: undefined,
					pr: { number: 7, state: "merged", url: undefined, branch: undefined },
					link: "data-platform/B01/S1",
				},
			],
		};
		expect(buildBoard(set, done, 5).launch.map((row) => row.handle)).toEqual([
			"B01/S2",
		]);
		expect(buildBoard(set, done, 0).launch).toEqual([]);
	});

	test("the command prints the derived view", () => {
		const result = run(board.run, [INDEX], repo);
		expect(result.code).toBe(0);
		expect(result.out).toContain(
			"Board for data-platform. Derived from the plan, the tracker and git. Never commit it.",
		);
		expect(result.out).toContain(
			"- astack session start docs/plans/data-platform/B01.md B01/S1",
		);
		expect(result.out).toContain(
			"- B01/S2 The consumer fills the staging table (waits on B01/S1)",
		);
	});
});
