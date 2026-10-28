import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command as checkPlan } from "../../src/astack/cli/commands/check/plan.ts";
import { command as plan } from "../../src/astack/cli/commands/plan.ts";
import { command as planTicket } from "../../src/astack/cli/commands/plan-ticket.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import { TEMPLATES } from "../../src/astack/plan/template.ts";
import { trailCell } from "../../src/astack/plan/trail.ts";
import { loadProfile } from "../../src/astack/profile.ts";
import { fixture, freshRepo, git, run } from "./plan-helpers.ts";

const EXPORT = "docs/plans/member-export.md";
const INDEX = "docs/plans/data-platform/index.md";
const dirs: string[] = [];
let repo = "";

beforeAll(() => {
	repo = freshRepo(dirs);
});

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function withPlan(name: string, text: string, body: () => void): void {
	const path = join(repo, `docs/plans/${name}.md`);
	writeFileSync(path, text.replace("plan: member-export", `plan: ${name}`));
	try {
		body();
	} finally {
		rmSync(path);
	}
}

function tempDir(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	dirs.push(dir);
	return dir;
}

describe("check-plan in plan mode and on briefs", () => {
	test("--as checks plan text from stdin under the path that it gets after approval", () => {
		const text = readFileSync(join(repo, EXPORT), "utf8");
		const result = run(
			checkPlan.run,
			["--as", EXPORT, "-", "--no-trail"],
			repo,
			{ input: text },
		);
		expect(result.out).toBe("0 errors, 0 warnings, 0 notes in 1 plan\n");
		expect(result.code).toBe(0);
		const wrong = run(
			checkPlan.run,
			["--as", "docs/plans/other.md", "-", "--no-trail"],
			repo,
			{ input: text },
		);
		expect(wrong.out).toContain(
			"plan is member-export but the file slug is other",
		);
	});

	test("a brief reads the trail of its programme", () => {
		const dirs2: string[] = [];
		const other = freshRepo(dirs2);
		const common = git(other, "rev-parse", "--absolute-git-dir");
		const dir = join(common, "astack/plans/data-platform");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "trail.tsv"),
			"ts\tphase\tdecision\twhy\tevidence\tresult\n2026-10-16T09:00:00Z\tstart\tB01\tthe owner asked\towner prompt\tstarted\n",
		);
		const result = run(
			checkPlan.run,
			["docs/plans/data-platform/B01.md"],
			other,
		);
		expect(result.out).toContain("has no trail row");
		for (const path of dirs2) rmSync(path, { recursive: true, force: true });
	});
});

describe("astack check-plan", () => {
	test("each real-plan shape passes --strict, because size and step counts are notes", () => {
		const bare = tempDir("astack-shapes-");
		git(bare, "init", "-q");
		mkdirSync(join(bare, "docs/plans"), { recursive: true });
		for (const name of ["shift-booking", "partner-go-live", "form-order"]) {
			writeFileSync(
				join(bare, `docs/plans/${name}.md`),
				fixture(`shapes/${name}.md`),
			);
			const result = run(
				checkPlan.run,
				[`docs/plans/${name}.md`, "--strict", "--no-trail"],
				bare,
			);
			expect(result.out).toContain("0 errors, 0 warnings");
			expect(result.code).toBe(0);
		}
	});

	test("the fixture plans pass with a summary line", () => {
		const result = run(
			checkPlan.run,
			[EXPORT, INDEX, "docs/plans/data-platform/B01.md"],
			repo,
		);
		expect(result.out).toBe("0 errors, 0 warnings, 0 notes in 3 plans\n");
		expect(result.code).toBe(0);
	});

	test("errors exit 1 and print file:line: message", () => {
		withPlan(
			"broken",
			readFileSync(join(repo, EXPORT), "utf8").replace(
				"| D3 | rule |",
				"| D3 | behaviour |",
			),
			() => {
				const result = run(checkPlan.run, ["docs/plans/broken.md"], repo);
				expect(result.code).toBe(1);
				expect(result.out).toContain(
					'docs/plans/broken.md:36: D3 kind is "behaviour"',
				);
			},
		);
	});

	test("warnings fail only under --strict, and --json prints data", () => {
		withPlan(
			"warned",
			readFileSync(join(repo, EXPORT), "utf8").replace(
				"by hand for access reviews.",
				"by hand; reviews are slow.",
			),
			() => {
				expect(run(checkPlan.run, ["docs/plans/warned.md"], repo).code).toBe(0);
				expect(
					run(checkPlan.run, ["docs/plans/warned.md", "--strict"], repo).code,
				).toBe(1);
				const json = JSON.parse(
					run(checkPlan.run, ["docs/plans/warned.md", "--json"], repo).out,
				);
				expect(json.warnings).toBe(1);
				expect(json.findings[0].group).toBe("ste");
			},
		);
	});

	test.each(["standard", "programme", "brief"])(
		"--template=%s prints that tier",
		(tier) => {
			const result = run(checkPlan.run, [`--template=${tier}`], repo);
			expect(result.out).toContain(`tier: ${tier}`);
			expect(result.out).toContain("## Unresolved questions");
		},
	);

	test("--brief lists each plan with its now unit and the delegation grant", () => {
		const result = run(checkPlan.run, ["--brief"], repo);
		expect(result.out.split("\n")).toEqual([
			"B01: B01/S1 The ingest service publishes events to the queue, delegate on",
			"data-platform: M1 Events land in staging within 10 minutes",
			"member-export: S1 One PR streams member exports",
			"",
		]);
	});

	test("--all lists a plan whose sessions are all done", () => {
		const done = readFileSync(join(repo, EXPORT), "utf8")
			.replace("status: active", "status: paused")
			.replace("execute: S1", "execute: none")
			.replace("State. now", "State. done")
			.replace("State. later", "State. done");
		withPlan("finished", done, () => {
			expect(run(checkPlan.run, ["--all"], repo).out).toContain(
				"docs/plans/finished.md: every session is done or every milestone exited",
			);
		});
	});

	test("--base keeps owner rows stable", () => {
		const path = join(repo, EXPORT);
		const before = readFileSync(path, "utf8");
		writeFileSync(path, before.replace("no guest", "no visitor"));
		const result = run(checkPlan.run, [EXPORT, "--base", "HEAD"], repo);
		expect(result.code).toBe(1);
		expect(result.out).toContain("D1 is an owner decision");
		writeFileSync(path, before);
	});
});

describe("astack plan-ticket", () => {
	test("renders a session body that carries the feature headings", () => {
		const result = run(planTicket.run, [EXPORT, "S1"], repo);
		expect(result.code).toBe(0);
		for (const heading of [
			"## Problem",
			"## Outcome",
			"## Acceptance criteria",
			"## Scope",
			"## Verification",
		])
			expect(result.out).toContain(heading);
		expect(result.out).toContain("- [ ] Given a member who is not an admin");
		expect(result.out).toContain(
			"- Step 4. Add the Export button to the Members page. Wave W2. Lane b.",
		);
	});

	test("renders blocks and decisions from a programme", () => {
		expect(run(planTicket.run, [INDEX, "B01"], repo).out).toContain(
			"- [ ] B01/S1 merges.",
		);
		const decision = run(planTicket.run, [INDEX, "Q1"], repo).out;
		expect(decision).toContain(
			"Interim default. Yes, because the ingest service already has write access there",
		);
		expect(decision).toContain("Binds. B02. Decide by. M1.");
	});

	test("--frontier --out with no directory writes under the git common dir", () => {
		const result = run(planTicket.run, [EXPORT, "--frontier", "--out"], repo);
		expect(result.code).toBe(0);
		const [line] = result.out.trim().split("\n");
		const [path = "", title] = (line ?? "").split("\t");
		expect(title).toBe("S1 One PR streams member exports");
		expect(path).toContain(".git/astack/plans/member-export/tickets/");
		expect(existsSync(join(repo, path))).toBe(true);
	});

	test("an unknown unit lists the known ones", () => {
		const result = run(planTicket.run, [EXPORT, "S9"], repo);
		expect(result.code).toBe(1);
		expect(result.err).toContain("the units are member-export, S1, S2");
	});
});

describe("astack plan attended, trail, draft and delegate", () => {
	test.each([
		[{ CLAUDE_CODE_SESSION_ATTENDED: "0" }, "unattended\n"],
		[{ CLAUDE_CODE_ENTRYPOINT: "sdk-ts" }, "unattended\n"],
		[{}, "attended\n"],
	])("attended reads the session env", (env, expected) => {
		expect(run(plan.run, ["attended"], repo, { env }).out).toBe(expected);
	});

	test("trail writes under the git common dir and prints the rows since the last start", () => {
		const cells = ["start", "plan the export", "new work", "session", "open"];
		const path = run(
			plan.run,
			["trail", "member-export", ...cells],
			repo,
		).out.trim();
		expect(path).toBe(
			join(
				git(repo, "rev-parse", "--absolute-git-dir"),
				"astack/plans/member-export/trail.tsv",
			),
		);
		run(
			plan.run,
			[
				"trail",
				"member-export",
				"checkpoint",
				"S1 step 1",
				"package",
				"abc",
				"report",
			],
			repo,
		);
		const rows = run(plan.run, ["trail", "member-export"], repo)
			.out.trim()
			.split("\n");
		expect(rows).toHaveLength(3);
		expect(rows[2]).toContain("\tcheckpoint\tS1 step 1\t");
		expect(
			run(
				plan.run,
				["trail", "member-export", "bogus", "a", "b", "c", "d"],
				repo,
			).code,
		).toBe(2);
		expect(trailCell("-1 test")).toBe("'-1 test");
	});

	test("draft keeps out-of-scope findings for the owner to file", () => {
		const first = run(
			plan.run,
			[
				"draft",
				"member-export",
				"Header row repeats",
				"Found in step 3, out of scope.",
			],
			repo,
		);
		expect(first.code).toBe(0);
		const listed = run(plan.run, ["draft", "member-export"], repo).out;
		expect(listed).toContain("## Header row repeats");
		expect(listed).toContain("The owner files each one with agree.");
		const blocked = run(
			plan.run,
			["draft", "member-export", "Footer row", "It's out of scope; file it."],
			repo,
		);
		expect(blocked.code).toBe(1);
		expect(blocked.err).toContain("astack STE blocked this draft");
		expect(run(plan.run, ["draft", "member-export"], repo).out).not.toContain(
			"Footer row",
		);
	});

	test("delegate on writes the grant and report mode, and logs it", () => {
		withPlan(
			"grant",
			readFileSync(join(repo, EXPORT), "utf8").replace(
				"checkpoints: report",
				"checkpoints: approve",
			),
			() => {
				const result = run(
					plan.run,
					["delegate", "docs/plans/grant.md", "on"],
					repo,
				);
				expect(result.out).toBe(
					"docs/plans/grant.md: delegate on, checkpoints report\n",
				);
				const text = readFileSync(join(repo, "docs/plans/grant.md"), "utf8");
				expect(text).toContain("delegate: on\n");
				expect(text).toContain("checkpoints: report\n");
				expect(run(plan.run, ["trail", "grant"], repo).out).toContain(
					"\tdelegated\tdelegate on\t",
				);
				expect(
					run(plan.run, ["delegate", "docs/plans/grant.md", "off"], repo).out,
				).toBe("docs/plans/grant.md: delegate off, checkpoints approve\n");
				const after = readFileSync(join(repo, "docs/plans/grant.md"), "utf8");
				expect(after).toContain("delegate: off\n");
				expect(after).toContain("checkpoints: approve\n");
			},
		);
	});
});

describe("plan hooks", () => {
	type HookResult = { deny?: string; context?: string } | undefined;

	function write(path: string, content: string): HookResult {
		const output = runHook(
			"claude-code",
			"PreToolUse",
			JSON.stringify({
				hook_event_name: "PreToolUse",
				tool_name: "Write",
				cwd: repo,
				tool_input: { file_path: join(repo, path), content },
			}),
			{ CLAUDE_PROJECT_DIR: repo },
		);
		if (output.exit === 2) return { deny: output.stderr.trim() };
		return output.stdout === ""
			? undefined
			: {
					context: JSON.parse(output.stdout).hookSpecificOutput
						.additionalContext,
				};
	}

	function edit(oldString: string, newString: string): HookResult {
		const output = runHook(
			"claude-code",
			"PreToolUse",
			JSON.stringify({
				hook_event_name: "PreToolUse",
				tool_name: "Edit",
				cwd: repo,
				tool_input: {
					file_path: join(repo, EXPORT),
					old_string: oldString,
					new_string: newString,
				},
			}),
			{ CLAUDE_PROJECT_DIR: repo },
		);
		if (output.exit === 2) return { deny: output.stderr.trim() };
		return output.stdout === ""
			? undefined
			: {
					context: JSON.parse(output.stdout).hookSpecificOutput
						.additionalContext,
				};
	}

	test("the real-plan shapes never meet a deny", () => {
		for (const name of ["shift-booking", "partner-go-live", "form-order"]) {
			const result = write(
				`docs/plans/${name}.md`,
				fixture(`shapes/${name}.md`),
			);
			expect(result?.deny).toBeUndefined();
		}
	});

	test("denies an added checkbox, an added Status line and an added register table", () => {
		expect(
			edit("Baseline. 0 of 2", "- [ ] ship it\nBaseline. 0 of 2")?.deny,
		).toContain("it adds a checkbox");
		expect(
			edit("Baseline. 0 of 2", "Status: blocked\nBaseline. 0 of 2")?.deny,
		).toContain("it adds a Status: line");
		expect(
			edit(
				"## Proof",
				"| Defect | Owner |\n|---|---|\n| Header repeats | admin |\n\n## Proof",
			)?.deny,
		).toContain("it adds a register table");
	});

	test("denies a plan over 32 KB and only notes other findings", () => {
		const big = fixture(`repo/${EXPORT}`).replace(
			"## Proof",
			`## Proof\n\n${"- `bun test` passes for this case.\n".repeat(1200)}`,
		);
		expect(write(EXPORT, big)?.deny).toContain("over the 32768-byte limit");
		const noted = edit("| D3 | rule |", "| D3 | behaviour |");
		expect(noted?.deny).toBeUndefined();
		expect(noted?.context).toContain('D3 kind is "behaviour"');
	});

	test("session start lists plans with their now units and stays silent without them", () => {
		const output = runHook(
			"claude-code",
			"SessionStart",
			JSON.stringify({ cwd: repo }),
			{},
		);
		const context = JSON.parse(output.stdout).hookSpecificOutput
			.additionalContext;
		expect(context).toContain(
			"- member-export: S1 One PR streams member exports\n",
		);
		expect(context).toContain(
			"- B01: B01/S1 The ingest service publishes events to the queue, delegate on\n",
		);
		expect(context).toContain("astack session resume <plan path>");
		const empty = tempDir("astack-empty-");
		mkdirSync(join(empty, "docs/plans"), { recursive: true });
		writeFileSync(
			join(empty, "docs/plans/draft.md"),
			TEMPLATES.standard.replace("<slug>", "draft"),
		);
		const draft = runHook(
			"claude-code",
			"SessionStart",
			JSON.stringify({ cwd: empty }),
			{},
		);
		expect(
			JSON.parse(draft.stdout).hookSpecificOutput.additionalContext,
		).toContain(
			"- draft (draft): S1 <What becomes true when this PR merges>; 1 default, 1 unresolved question",
		);
		const none = tempDir("astack-none-");
		expect(
			runHook("claude-code", "SessionStart", JSON.stringify({ cwd: none }), {})
				.stdout,
		).toBe("");
		const afk = runHook(
			"claude-code",
			"SessionStart",
			JSON.stringify({ cwd: none }),
			{ CLAUDE_CODE_SESSION_ATTENDED: "0" },
		);
		expect(
			JSON.parse(afk.stdout).hookSpecificOutput.additionalContext,
		).toContain("Unattended session");
	});
});

describe("the plan block of .astack/profile.json", () => {
	test("reads dir, glossary and adr, and refuses paths that leave the repo", () => {
		const dir = tempDir("astack-cfg-");
		mkdirSync(join(dir, ".astack"));
		writeFileSync(
			join(dir, ".astack/profile.json"),
			JSON.stringify({
				plan: { dir: "plans/", glossary: "GLOSSARY.md", adr: "/etc" },
			}),
		);
		expect(loadProfile(dir).plan).toEqual({
			dir: "plans",
			glossary: "GLOSSARY.md",
			adr: "docs/adr",
		});
		writeFileSync(
			join(dir, ".astack/profile.json"),
			JSON.stringify({ plan: { dir: "../x" } }),
		);
		expect(loadProfile(dir).plan.dir).toBe("docs/plans");
	});
});
