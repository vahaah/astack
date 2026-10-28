import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { scanSubstrings } from "../../scripts/lib/neutrality.ts";
import { worktreeProject } from "../../scripts/lib/project-apply.ts";
import { validateProjectConfig } from "../../scripts/lib/projects.ts";
import {
	branchRefusal,
	branchWarning,
	commitParts,
	documentedShapes,
	expandBranchTemplate,
	findBranchChecks,
	gatesNeedDeps,
	isInside,
	mainStateChanges,
	nextSteps,
	renameCommand,
	shapeMatches,
	statusHash,
	steRefusals,
	suggestedBranch,
	worktreePath,
} from "../../scripts/lib/worktree.ts";
import {
	commitParagraphs,
	NEUTRAL_WORDS,
} from "../../src/astack/commit-style.ts";
import {
	checkText,
	DEFAULT_GLOSSARY,
	denied,
} from "../../src/astack/ste/check.ts";
import { astackTree, companionTree, emptyDeny } from "./astack-tree.ts";
import { fixtureProfile } from "./ci-parity-fixtures.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	dirs.push(dir);
	return dir;
}

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

function write(root: string, path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function steDenied(lines: readonly string[]): string[] {
	return denied(
		checkText(lines.join("\n"), {
			surface: "doc",
			enforcement: "deny",
			glossary: DEFAULT_GLOSSARY,
		}),
	).map((finding) => `${finding.rule}: ${finding.sentence}`);
}

describe("branch names", () => {
	test("accept a plain setup branch", () => {
		expect(branchRefusal("astack/setup")).toBeUndefined();
		expect(branchRefusal("team/abc-12/s0-astack-setup")).toBeUndefined();
	});

	test.each([
		[
			"a b",
			'"a b" has a space or a character that git does not allow in a branch name',
		],
		[
			"a~b",
			'"a~b" has a space or a character that git does not allow in a branch name',
		],
		["a..b", '"a..b" has .., @{ or //'],
		["-a", '"-a" starts with - or /, or ends with /'],
		["a/", '"a/" starts with - or /, or ends with /'],
		["a.lock", '"a.lock" ends with . or .lock'],
		["a/.b", '"a/.b" has a part that starts with .'],
		["", "the branch name is empty"],
	])("refuse %p", (name, reason) => {
		expect(branchRefusal(name)).toBe(reason);
	});

	test("a template fills {date}, and the slug keeps the path flat", () => {
		expect(expandBranchTemplate("astack/setup-{date}", "2026-10-16")).toBe(
			"astack/setup-2026-10-16",
		);
		expect(worktreePath("/w", "acme", "astack/setup")).toBe(
			"/w/acme/astack-setup",
		);
	});

	test("a worktree under the repo is inside it, and a sibling is not", () => {
		expect(isInside("/r/acme", "/r/acme/.claude/worktrees/x")).toBe(true);
		expect(isInside("/r/acme", "/r/acme-wt/x")).toBe(false);
		expect(isInside("/r/acme", "/state/acme/x")).toBe(false);
	});
});

describe("the main checkout proof", () => {
	test("names each field that changed", () => {
		const before = { head: "a1", branch: "main", statusHash: statusHash("") };
		expect(mainStateChanges(before, { ...before })).toEqual([]);
		expect(
			mainStateChanges(before, {
				head: "b2",
				branch: "topic",
				statusHash: statusHash("?? x\0"),
			}),
		).toEqual([
			"HEAD moved from a1 to b2",
			"the branch changed from main to topic",
			"the output of git status --porcelain changed",
		]);
	});
});

describe("gates that need node_modules", () => {
	test("a repo binary or a package runner needs them, and a system tool does not", () => {
		expect(
			gatesNeedDeps([{ name: "biome", run: ["./node_modules/.bin/biome"] }]),
		).toBe(true);
		expect(gatesNeedDeps([{ name: "docs", run: ["bun", "run", "docs"] }])).toBe(
			true,
		);
		expect(gatesNeedDeps([{ name: "jq", run: ["jq", "."] }])).toBe(false);
		expect(gatesNeedDeps([])).toBe(false);
	});
});

const FIXTURES = resolve(import.meta.dir, "../fixtures/branch-rules");
const workflow = readFileSync(join(FIXTURES, "check.yml"), "utf8");

const doc = readFileSync(join(FIXTURES, "instructions.md"), "utf8");

describe("branch-name rules in a repo", () => {
	test("a workflow that gives the PR branch to a repo script is a check", () => {
		expect(
			findBranchChecks([
				{ path: ".github/workflows/check.yml", text: workflow },
			]),
		).toEqual([
			{
				path: ".github/workflows/check.yml",
				line: 8,
				command: "bun tooling/lane.ts",
			},
		]);
		expect(
			findBranchChecks([
				{
					path: ".github/workflows/x.yml",
					text: workflow.replace("github.head_ref", "inputs.branch"),
				},
			]),
		).toEqual([]);
	});

	test("instruction files give branch shapes, and file paths and commands are not shapes", () => {
		expect(documentedShapes([{ path: "CLAUDE.md", text: doc }])).toEqual([
			{
				path: "CLAUDE.md",
				line: 3,
				shapes: ["team/abc-<ticket>/b<block>-s<n>-<slug>"],
			},
			{ path: "CLAUDE.md", line: 4, shapes: ["…/s0-<slug>"] },
		]);
	});

	test("a CLI flag, an example name or a path on a branch line is not a shape", () => {
		expect(
			documentedShapes([
				{
					path: "CLAUDE.md",
					text: "CI runs each branch as `--shard=<i>/4` with `-b <name>/x-y`.",
				},
				{
					path: "AGENTS.md",
					text: "A branch slug such as `…/s0-portfolio-lines-ab-7` saves shots to `shots/<pr>/<sha>/…`.",
				},
			]),
		).toEqual([]);
	});

	test("a shape matches a branch with its placeholders filled", () => {
		expect(
			shapeMatches(
				"team/abc-<ticket>/b<block>-s<n>-<slug>",
				"team/abc-12/b3-s1-export",
			),
		).toBe(true);
		expect(shapeMatches("…/s0-<slug>", "team/abc-12/s0-setup")).toBe(true);
		expect(shapeMatches("…/s0-<slug>", "astack/setup")).toBe(false);
	});

	test("the suggested name is the simplest shape under the prefix of the others", () => {
		expect(
			suggestedBranch(
				["team/abc-<ticket>/b<block>-s<n>-<slug>", "…/s0-<slug>"],
				"astack/setup",
			),
		).toBe("team/abc-<ticket>/s0-astack-setup");
		expect(suggestedBranch([], "astack/setup")).toBeUndefined();
	});

	test("the warning names the check, the shapes and the rename command", () => {
		const lines = branchWarning(
			"astack/setup",
			"/w/acme/astack-setup",
			findBranchChecks([
				{ path: ".github/workflows/check.yml", text: workflow },
			]),
			documentedShapes([{ path: "CLAUDE.md", text: doc }]),
		);
		expect(lines).toEqual([
			"Warning: this repo has a rule for branch names, and astack/setup can fail it.",
			"",
			"- .github/workflows/check.yml:8 gives the branch name to `bun tooling/lane.ts` in CI.",
			"- CLAUDE.md:3 gives the shapes `team/abc-<ticket>/b<block>-s<n>-<slug>`.",
			"- CLAUDE.md:4 gives the shapes `…/s0-<slug>`.",
			"",
			"Rename the branch before you push it. First set the shell variable TICKET. The command stops when it is empty.",
			"",
			`    git -C /w/acme/astack-setup branch -m astack/setup "team/abc-\${TICKET:?set TICKET}/s0-astack-setup"`,
		]);
		expect(steDenied(lines)).toEqual([]);
	});

	test("the rename command needs a shell variable for each placeholder, and quotes the rest", () => {
		expect(
			renameCommand("/w", "astack/setup", "team/b<block>-s<n>-<block>"),
		).toEqual({
			variables: ["BLOCK", "N"],
			command: `git -C /w branch -m astack/setup "team/b\${BLOCK:?set BLOCK}-s\${N:?set N}-\${BLOCK:?set BLOCK}"`,
		});
		expect(renameCommand("/w", "astack/setup", "team/s0-setup")).toEqual({
			variables: [],
			command: "git -C /w branch -m astack/setup 'team/s0-setup'",
		});
		const lines = branchWarning(
			"astack/setup",
			"/w",
			[],
			[{ path: "CLAUDE.md", line: 1, shapes: ["a/<x>-<y>"] }],
		);
		expect(lines).toContain(
			"Rename the branch before you push it. First set the shell variables X and Y. The command stops when one is empty.",
		);
		expect(steDenied(lines)).toEqual([]);
	});

	test("no warning when the branch matches a shape, or when the repo has no rule", () => {
		const shapes = documentedShapes([{ path: "CLAUDE.md", text: doc }]);
		expect(branchWarning("team/abc-1/s0-setup", "/w", [], shapes)).toEqual([]);
		expect(branchWarning("astack/setup", "/w", [], [])).toEqual([]);
	});
});

describe("the setup commit and the next steps", () => {
	test("the subject parts follow the artifact kinds, once each", () => {
		expect(
			commitParts([
				"rule",
				"flow-config",
				"astack-profile",
				"review-stub",
				"review-profile",
			]),
		).toEqual([
			"the astack profile",
			"review stub",
			"hardening profile",
			"flow docs",
			"rule copies",
		]);
		expect(commitParts(["flow-config"])).toEqual(["the astack flow docs"]);
	});

	test("a commit that changes only the hardening profile names that profile, not the review stub", () => {
		expect(commitParts(["review-profile"])).toEqual([
			"the astack hardening profile",
		]);
		expect(commitParts(["review-stub"])).toEqual(["the astack review stub"]);
	});

	test("the neutral subject parts name no tool", () => {
		expect(
			commitParts(
				["rule", "flow-config", "astack-profile", "notice"],
				NEUTRAL_WORDS,
			),
		).toEqual([
			"the agent tooling profile",
			"agent docs",
			"rule copies",
			"license notices",
		]);
		expect(commitParts(["review-stub"], NEUTRAL_WORDS)).toEqual([
			"the agent tooling review stub",
		]);
	});

	test("the next steps name the push, the PR and the cleanup, in STE", () => {
		const lines = nextSteps({
			repo: "/r/acme",
			worktree: "/w/acme/astack-setup",
			branch: "astack/setup",
			baseBranch: "main",
			subject: "chore: add the astack profile",
			prTemplate: ".github/pull_request_template.md",
			tracker: {
				kind: "linear",
				team: "ABC",
				requirePartOf: true,
				categoryLabels: { bug: "Bug", enhancement: "Feature" },
			},
			branchWarning: [],
		});
		expect(lines).toContain(
			"    git -C /w/acme/astack-setup push -u origin astack/setup",
		);
		expect(lines).toContain(
			"Write the body in the template from .github/pull_request_template.md.",
		);
		expect(lines).toContain(
			'Put "Part of ABC-<n>" on the first line of the body.',
		);
		expect(lines).toContain(
			"    gh pr create --base main --title 'chore: add the astack profile'",
		);
		expect(lines).toContain(
			"    git -C /r/acme worktree remove /w/acme/astack-setup",
		);
		expect(lines).toContain("    git -C /r/acme branch -D astack/setup");
		expect(steDenied(lines)).toEqual([]);
	});

	test("after a rename warning, the push and the cleanup do not name the old branch", () => {
		const lines = nextSteps({
			repo: "/r/acme",
			worktree: "/w/acme/astack-setup",
			branch: "astack/setup",
			baseBranch: "main",
			subject: "chore: add the astack profile",
			prTemplate: undefined,
			tracker: {
				kind: "github",
				requirePartOf: false,
				categoryLabels: { bug: "bug", enhancement: "enhancement" },
			},
			branchWarning: ["Warning: rename the branch."],
		});
		expect(lines).toContain(
			"    git -C /w/acme/astack-setup push -u origin HEAD",
		);
		expect(
			lines.slice(
				lines.indexOf(
					"After the merge, remove the worktree and the local branch.",
				),
			),
		).toEqual([
			"After the merge, remove the worktree and the local branch.",
			"",
			"    branch=$(git -C /w/acme/astack-setup branch --show-current)",
			"    git -C /r/acme worktree remove /w/acme/astack-setup",
			'    git -C /r/acme branch -D "$branch"',
		]);
		expect(lines.filter((line) => line.includes("astack/setup "))).toEqual([]);
		expect(steDenied(lines)).toEqual([]);
	});

	test("the STE check refuses a subject or a PR title that the astack hook blocks", () => {
		const message = (subject: string) =>
			commitParagraphs(
				subject,
				["Written by the apply script.", "- docs/agents/domain.md"],
				["Co-Authored-By: Test Bot <bot@example.com>"],
			).join("\n\n");
		const tagged =
			"S0 — the repo carries the astack profile, review stub, flow docs and rule copies";
		expect(steRefusals(message(tagged), tagged, DEFAULT_GLOSSARY)).toEqual([]);
		const dashed = "Add the profile — and the docs";
		const fix =
			'L1 dash: Use a comma, a colon or a new sentence, not a long dash. Sentence: "Add the profile — and the docs"';
		expect(steRefusals(message(dashed), dashed, DEFAULT_GLOSSARY)).toEqual([
			`the commit message: ${fix}`,
			`the PR title: ${fix}`,
		]);
	});
});

const astackRoot = astackTree(tempDir("astack-src-"), "committed");
const companionRoot = companionTree(tempDir("companion-src-"), "committed");
const companionInputs = {
	companionRoot,
	profileDir: join(companionRoot, "projects", "acme"),
	deny: emptyDeny,
};

function seedRepos(extra: Readonly<Record<string, string>> = {}): {
	main: string;
	worktrees: string;
} {
	const root = tempDir("astack-wt-");
	const origin = join(root, "origin.git");
	const seed = join(root, "seed");
	const main = join(root, "main");
	git(root, "init", "-q", "--bare", "-b", "main", origin);
	git(root, "clone", "-q", origin, seed);
	for (const repo of [seed]) {
		git(repo, "config", "user.name", "Test Owner");
		git(repo, "config", "user.email", "owner@example.com");
	}
	write(seed, ".gitignore", "node_modules/\n");
	write(seed, "CONTEXT.md", "# Context\n");
	write(seed, "docs/adr/0001-start.md", "# Start\n");
	write(seed, "CLAUDE.md", doc);
	write(seed, ".github/workflows/check.yml", workflow);
	for (const [path, text] of Object.entries(extra)) write(seed, path, text);
	git(seed, "add", "-A");
	git(seed, "commit", "-qm", "feat(core): start the repo");
	write(seed, "README.md", "# Acme\n");
	git(seed, "add", "-A");
	git(seed, "commit", "-qm", "fix(core): ABC-1 readme");
	git(seed, "push", "-q", "origin", "main");
	git(root, "clone", "-q", origin, main);
	git(main, "config", "user.name", "Test Owner");
	git(main, "config", "user.email", "owner@example.com");
	git(main, "switch", "-qc", "topic");
	write(main, "notes.txt", "work in progress\n");
	write(
		main,
		"node_modules/.bin/check-files",
		'#!/bin/sh\nfor f in "$@"; do test -f "$f" || exit 1; done\necho "checked $#"\n',
	);
	chmodSync(join(main, "node_modules/.bin/check-files"), 0o755);
	return { main, worktrees: join(root, "worktrees") };
}

function acme(
	main: string,
	mode: "write" | "report-only" = "write",
	extra: Readonly<Record<string, string>> = {},
) {
	const renders = mode === "write";
	return validateProjectConfig(
		{
			...extra,
			name: "acme",
			path: main,
			mode,
			rulesDir: ".claude/rules/standards",
			artifacts: {
				rules: renders,
				settings: false,
				reviewStub: false,
				agentDocs: renders,
				profile: renders,
			},
			tracker: {
				kind: "linear",
				team: "ABC",
				requirePartOf: true,
				categoryLabels: { bug: "Bug", enhancement: "Feature" },
			},
			domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
			keepPatterns: [],
			lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
			gates: [
				{
					name: "files exist",
					run: ["./node_modules/.bin/check-files"],
					files: "written-json",
				},
			],
			ciOnlyGates: [],
			commentConflicts: [],
			adrNeeded: [],
		},
		"acme",
	);
}

const trailers = [
	"Co-Authored-By: Test Bot <bot@example.com>",
	"Claude-Session: https://example.com/session/1",
];

describe("apply --worktree on a temp repo", () => {
	const { main, worktrees } = seedRepos();
	const worktree = join(worktrees, "acme", "astack-setup");
	const statusBefore = git(
		main,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);
	const headBefore = git(main, "rev-parse", "HEAD");
	const lines: string[] = [];
	const run = worktreeProject(acme(main), {
		astackRoot,
		...companionInputs,
		worktrees,
		trailers,
		keep: false,
		today: "2026-10-16",
		log: (line = "") => lines.push(line),
	});

	test("commits the files once on a new branch from origin/main", async () => {
		expect(await run).toBe(0);
		expect(git(worktree, "branch", "--show-current")).toBe("astack/setup");
		expect(git(worktree, "rev-parse", "HEAD~1")).toBe(
			git(main, "rev-parse", "origin/main"),
		);
		expect(git(worktree, "log", "-1", "--format=%B")).toBe(
			[
				"chore: add the astack profile, flow docs, rule copies and license notices",
				"",
				"Written by `bun run apply --project acme --worktree` in the astack repo.",
				"",
				git(worktree, "show", "--name-only", "--format=", "HEAD")
					.split("\n")
					.map((path) => `- ${path}`)
					.join("\n"),
				"",
				`Astack-Commit: ${git(astackRoot, "rev-parse", "HEAD")}`,
				`Companion-Commit: ${git(companionRoot, "rev-parse", "HEAD")}`,
				...trailers,
			].join("\n"),
		);
		expect(
			git(worktree, "show", "--name-only", "--format=", "HEAD").split("\n"),
		).toContain(".astack/profile.json");
		expect(
			JSON.parse(readFileSync(join(worktree, ".astack/profile.json"), "utf8"))
				.tracker,
		).toEqual({ kind: "linear", team: "ABC", requirePartOf: true });
		expect(git(worktree, "status", "--porcelain")).toBe("");
	});

	test("links node_modules only for the gates, and removes the link", async () => {
		await run;
		expect(lines).toContain(
			`Linked ${join(worktree, "node_modules")} to ${join(main, "node_modules")} for the gate run.`,
		);
		expect(lines).toContain(
			`Removed the link ${join(worktree, "node_modules")}.`,
		);
		expect(existsSync(join(worktree, "node_modules"))).toBe(false);
		expect(lines.some((line) => line.startsWith("- files exist: pass"))).toBe(
			true,
		);
	});

	test("leaves the main checkout as it was, and says so", async () => {
		await run;
		expect(git(main, "rev-parse", "HEAD")).toBe(headBefore);
		expect(git(main, "branch", "--show-current")).toBe("topic");
		expect(git(main, "status", "--porcelain=v1", "--untracked-files=all")).toBe(
			statusBefore,
		);
		expect(
			lines.some((line) =>
				line.startsWith(`Unchanged: HEAD ${headBefore} on topic`),
			),
		).toBe(true);
	});

	test("warns about the branch rule and prints the next steps last", async () => {
		await run;
		expect(lines).toContain(
			`    git -C ${worktree} branch -m astack/setup "team/abc-\${TICKET:?set TICKET}/s0-astack-setup"`,
		);
		const next = lines.indexOf("## Next steps");
		expect(next).toBeGreaterThan(lines.indexOf("## Main checkout"));
		expect(lines).toContain(`    git -C ${worktree} push -u origin HEAD`);
		expect(lines).not.toContain(
			`    git -C ${worktree} push -u origin astack/setup`,
		);
		expect(lines).toContain("Write the body with the astack:write-docs skill.");
	});

	test("refuses a second run, because the branch exists", async () => {
		await run;
		const again: string[] = [];
		const code = await worktreeProject(acme(main), {
			astackRoot,
			...companionInputs,
			worktrees,
			trailers,
			keep: false,
			today: "2026-10-16",
			log: (line = "") => again.push(line),
		});
		expect(code).toBe(1);
		expect(again).toContain(
			"Refused: refs/heads/astack/setup already exists. Pass --branch <name>, or delete that branch first.",
		);
		expect(lstatSync(worktree).isDirectory()).toBe(true);
	});

	test("a report-only project prints its report and refuses", async () => {
		await run;
		const report: string[] = [];
		const code = await worktreeProject(acme(main, "report-only"), {
			astackRoot,
			...companionInputs,
			worktrees,
			trailers,
			keep: false,
			today: "2026-10-16",
			log: (line = "") => report.push(line),
		});
		expect(code).toBe(1);
		expect(report).toContain(
			"acme is report-only, so the write mode does not run. The report above says what must change first.",
		);
		expect(report[0]).toBe("# apply --project acme --worktree");
	});
});

describe("apply --worktree with a neutral commit text, as a repo that must not name the tool", () => {
	const denied = ["pstack", "astack:", "flow:", "Comment Sicko", "astack"];
	const neutral = (main: string) => ({
		...acme(main),
		lint: {
			adrCitation: false,
			conflictMarkers: true,
			denySubstrings: denied,
			denySubstringsExempt: [
				".astack/",
				".claude/rules/standards/",
				"docs/agents/",
			],
		},
		neutralCommit: { provenanceKey: "Tooling-Commit" },
		branchTemplate: "tooling/setup",
	});
	const run = (main: string, worktrees: string, extra: readonly string[]) => {
		const lines: string[] = [];
		return {
			lines,
			code: worktreeProject(neutral(main), {
				astackRoot,
				...companionInputs,
				worktrees,
				trailers: [...trailers, ...extra],
				keep: false,
				today: "2026-10-16",
				log: (line = "") => lines.push(line),
			}),
		};
	};

	test("the commit message holds no denied substring, and its neutral trailer names the source commit", async () => {
		const { main, worktrees } = seedRepos();
		const worktree = join(worktrees, "acme", "tooling-setup");
		expect(await run(main, worktrees, []).code).toBe(0);
		const message = git(worktree, "log", "-1", "--format=%B");
		expect(scanSubstrings({ path: "", content: message }, denied)).toEqual([]);
		const files = git(worktree, "show", "--name-only", "--format=", "HEAD")
			.split("\n")
			.filter(Boolean);
		expect(files).toContain(".astack/profile.json");
		expect(message).toBe(
			[
				"chore: add the agent tooling profile, agent docs, rule copies and license notices",
				"",
				`The agent tooling writer made this commit. It changes ${files.length} files.`,
				"",
				`Tooling-Commit: ${git(astackRoot, "rev-parse", "HEAD")}`,
				`Companion-Commit: ${git(companionRoot, "rev-parse", "HEAD")}`,
				...trailers,
			].join("\n"),
		);
	});

	test("a trailer that holds a denied substring is refused, and nothing is committed", async () => {
		const { main, worktrees } = seedRepos();
		const { lines, code } = run(main, worktrees, [
			"Session: https://example.com/astack/1",
		]);
		expect(await code).toBe(1);
		expect(lines).toContain(
			"Refused: the commit message holds a substring that lint.denySubstrings of projects/acme.json denies, and neutralCommit asks for a commit text with none. Change the trailer or commitSubject.",
		);
		expect(lines).toContain("- line 9: astack");
		expect(git(main, "branch", "--list", "tooling/setup")).toBe("");
	});
});

function shell(cwd: string, script: string, env: Record<string, string> = {}) {
	return spawnSync("sh", ["-c", script], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, ...env },
	});
}

describe("the printed next steps on a temp repo with a branch rule", () => {
	const { main, worktrees } = seedRepos();
	const worktree = join(worktrees, "acme", "astack-setup");
	const lines: string[] = [];
	const run = worktreeProject(acme(main), {
		astackRoot,
		...companionInputs,
		worktrees,
		trailers,
		keep: false,
		today: "2026-10-16",
		log: (line = "") => lines.push(line),
	});
	const commands = async (pattern: RegExp): Promise<string[]> => {
		await run;
		return lines
			.slice(lines.indexOf("## Next steps"))
			.filter((line) => line.startsWith("    ") && pattern.test(line))
			.map((line) => line.trim());
	};

	test("the rename stops when the shell variable is empty, and keeps the branch", async () => {
		const [rename] = await commands(/ branch -m /);
		const stopped = shell(main, rename ?? "false", { TICKET: "" });
		expect(stopped.status).not.toBe(0);
		expect(stopped.stderr).toContain("set TICKET");
		expect(git(worktree, "branch", "--show-current")).toBe("astack/setup");
	});

	test("the rename, the push and the cleanup run in order and leave no branch behind", async () => {
		const steps = await commands(
			/ branch -m | push | worktree remove |branch -D |--show-current/,
		);
		const done = shell(main, ["set -e", ...steps].join("\n"), {
			TICKET: "12",
		});
		expect(done.stderr).not.toContain("error:");
		expect(done.status).toBe(0);
		expect(git(main, "ls-remote", "--heads", "origin")).toContain(
			"refs/heads/team/abc-12/s0-astack-setup",
		);
		expect(git(main, "branch", "--list", "astack/setup", "team/*")).toBe("");
		expect(existsSync(worktree)).toBe(false);
	});
});

describe("apply --worktree --update on a temp repo", () => {
	const { main, worktrees } = seedRepos();
	const worktree = join(worktrees, "acme", "astack-setup");
	const options = (lines: string[]) => ({
		astackRoot,
		...companionInputs,
		worktrees,
		trailers,
		keep: false,
		today: "2026-10-16",
		log: (line = "") => lines.push(line),
	});
	const first = worktreeProject(acme(main), options([]));
	const mainState = () => [
		git(main, "rev-parse", "HEAD"),
		git(main, "branch", "--show-current"),
		git(main, "status", "--porcelain=v1", "--untracked-files=all"),
	];

	test("refuses when the setup worktree does not exist yet", async () => {
		const other = seedRepos();
		const lines: string[] = [];
		const code = await worktreeProject(acme(other.main), {
			...options(lines),
			worktrees: other.worktrees,
			update: true,
		});
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: ${join(other.worktrees, "acme", "astack-setup")} does not exist. Run apply with --worktree and without --update first.`,
		);
		expect(git(other.main, "branch", "--list", "astack/setup")).toBe("");
	});

	test("adds one follow-up commit that writes the new content and deletes what astack no longer writes", async () => {
		expect(await first).toBe(0);
		write(worktree, ".claude/rules/standards/old.md", "# Old\n");
		const profilePath = join(worktree, ".astack/profile.json");
		const profile = JSON.parse(readFileSync(profilePath, "utf8"));
		profile.managed = [
			...profile.managed,
			".claude/rules/standards/old.md",
		].sort();
		writeFileSync(profilePath, `${JSON.stringify(profile, null, "\t")}\n`);
		git(worktree, "add", "-A");
		git(worktree, "commit", "-qm", "chore: add an old rule copy");
		const before = git(worktree, "rev-parse", "HEAD");
		const mainBefore = mainState();
		const lines: string[] = [];
		const code = await worktreeProject(
			{ ...acme(main), keepPatterns: ["^Source: \\S"] },
			{ ...options(lines), update: true },
		);
		expect(code).toBe(0);
		expect(git(worktree, "rev-parse", "HEAD~1")).toBe(before);
		expect(git(worktree, "log", "-1", "--format=%s")).toBe(
			"chore: update the astack profile and rule copies, and remove the files that astack replaces",
		);
		expect(
			git(worktree, "show", "--name-status", "--format=", "HEAD")
				.split("\n")
				.sort(),
		).toEqual([
			"D\t.claude/rules/standards/old.md",
			"M\t.astack/profile.json",
			"M\t.claude/rules/standards/comments.md",
		]);
		expect(git(worktree, "log", "-1", "--format=%b")).toContain(
			"Written by `bun run apply --project acme --worktree --update` in the astack repo.",
		);
		expect(git(worktree, "log", "-1", "--format=%B")).toEndWith(
			[
				`Astack-Commit: ${git(astackRoot, "rev-parse", "HEAD")}`,
				`Companion-Commit: ${git(companionRoot, "rev-parse", "HEAD")}`,
				...trailers,
			].join("\n"),
		);
		expect(git(worktree, "status", "--porcelain")).toBe("");
		expect(mainState()).toEqual(mainBefore);
		expect(lines).toContain(
			"- .claude/rules/standards/old.md: astack apply no longer writes it.",
		);
		expect(lines[0]).toBe("# apply --project acme --worktree --update");
		expect(lines).toContain(
			"The branch is not on the remote yet. Push it when the owner says so.",
		);
		expect(lines).toContain(
			`    git -C ${worktree} push -u origin astack/setup`,
		);
	});

	test("a second update with nothing new makes no commit", async () => {
		await first;
		const before = git(worktree, "rev-parse", "HEAD");
		const lines: string[] = [];
		const code = await worktreeProject(
			{ ...acme(main), keepPatterns: ["^Source: \\S"] },
			{ ...options(lines), update: true },
		);
		expect(code).toBe(0);
		expect(git(worktree, "rev-parse", "HEAD")).toBe(before);
		expect(lines).toContain(
			"Nothing to commit: astack/setup already holds these files.",
		);
	});

	test("a failed update puts the worktree back to its commit", async () => {
		await first;
		const before = git(worktree, "rev-parse", "HEAD");
		const config = acme(main);
		const lines: string[] = [];
		const code = await worktreeProject(
			{
				...config,
				keepPatterns: ["^TODO\\(B\\d+"],
				lint: { ...config.lint, denySubstrings: ["Third-party notices"] },
			},
			{ ...options(lines), update: true },
		);
		expect(code).toBe(1);
		expect(git(worktree, "rev-parse", "HEAD")).toBe(before);
		expect(git(worktree, "status", "--porcelain")).toBe("");
		expect(lines).toContain(
			`Put ${worktree} back to ${before.slice(0, 12)} with no changes.`,
		);
	});

	test("refuses a worktree with changes, and leaves them as they are", async () => {
		await first;
		write(worktree, "notes.md", "draft\n");
		const lines: string[] = [];
		const code = await worktreeProject(acme(main), {
			...options(lines),
			update: true,
		});
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: ${worktree} has changes. Commit or remove them first.`,
		);
		expect(readFileSync(join(worktree, "notes.md"), "utf8")).toBe("draft\n");
		rmSync(join(worktree, "notes.md"));
	});
});

describe("apply --worktree on a new branch from a main that already holds the astack files", () => {
	const { main, worktrees } = seedRepos();
	const options = {
		astackRoot,
		...companionInputs,
		worktrees,
		trailers,
		keep: false,
		today: "2026-10-16",
		log: () => {},
	};

	test("the commit says update and names only the files that it changes, as a follow-up PR after a merged setup PR needs", async () => {
		expect(await worktreeProject(acme(main), options)).toBe(0);
		git(
			join(worktrees, "acme", "astack-setup"),
			"push",
			"-q",
			"origin",
			"astack/setup:main",
		);
		const code = await worktreeProject(
			{ ...acme(main), keepPatterns: ["^Source: \\S"] },
			{ ...options, branch: "astack/follow-up" },
		);
		expect(code).toBe(0);
		const followUp = join(worktrees, "acme", "astack-follow-up");
		expect(git(followUp, "log", "-1", "--format=%s")).toBe(
			"chore: update the astack profile and rule copies",
		);
		expect(
			git(followUp, "show", "--name-status", "--format=", "HEAD")
				.split("\n")
				.sort(),
		).toEqual([
			"M\t.astack/profile.json",
			"M\t.claude/rules/standards/comments.md",
		]);
	});
});

describe("apply on a temp repo with a subject that the STE hook blocks", () => {
	test("refuses before the commit and removes the worktree", async () => {
		const { main, worktrees } = seedRepos();
		const lines: string[] = [];
		const code = await worktreeProject(
			acme(main, "write", { commitSubject: "Add the profile — and the docs" }),
			{
				astackRoot,
				...companionInputs,
				worktrees,
				trailers,
				keep: false,
				today: "2026-10-16",
				log: (line = "") => lines.push(line),
			},
		);
		expect(code).toBe(1);
		expect(lines).toContain(
			"Refused: the astack STE hook blocks this commit message or PR title. Change commitSubject in projects/acme.json.",
		);
		expect(lines).toContain(
			'- the PR title: L1 dash: Use a comma, a colon or a new sentence, not a long dash. Sentence: "Add the profile — and the docs"',
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
		expect(existsSync(join(worktrees, "acme", "astack-setup"))).toBe(false);
	});
});

describe("apply --worktree reads the state of the astack tree that it writes from", () => {
	const runFrom = async (root: string) => {
		const { main, worktrees } = seedRepos();
		const lines: string[] = [];
		const code = await worktreeProject(acme(main), {
			astackRoot: root,
			...companionInputs,
			worktrees,
			trailers,
			keep: false,
			today: "2026-10-16",
			log: (line = "") => lines.push(line),
		});
		return { code, lines, main, worktrees };
	};

	test("refuses an astack tree with no commit, and makes no branch", async () => {
		const root = astackTree(tempDir("astack-src-"), "no-commit");
		const { code, lines, main, worktrees } = await runFrom(root);
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: the astack repo at ${root} has no commit, so the apply commit cannot name the astack source that wrote it. Make a first commit there.`,
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
		expect(existsSync(join(worktrees, "acme", "astack-setup"))).toBe(false);
	});

	test("refuses an astack tree with a change in its sources that is not committed, and ignores a file outside them", async () => {
		const root = astackTree(tempDir("astack-src-"), "committed");
		write(root, "src/index.ts", "export const astack = 2;\n");
		write(root, "rules/new.md", "# New\n");
		write(root, "notes.md", "draft\n");
		const { code, lines, main } = await runFrom(root);
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: the astack repo at ${root} has changes that are not committed in marketplace, rules, scripts, src, templates, upstream: src/index.ts, rules/new.md. Commit them first, so the apply commit names the astack source that wrote it.`,
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
	});

	test("refuses an astack tree with an uncommitted change in upstream, which the NOTICE that apply writes reads", async () => {
		const root = astackTree(tempDir("astack-src-"), "committed");
		write(root, "upstream/lock.json", '{ "sources": [] }\n');
		const { code, lines, main } = await runFrom(root);
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: the astack repo at ${root} has changes that are not committed in marketplace, rules, scripts, src, templates, upstream: upstream/lock.json. Commit them first, so the apply commit names the astack source that wrote it.`,
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
	});

	test("refuses an astack tree with an uncommitted change in templates, which holds the review stub that apply copies", async () => {
		const root = astackTree(tempDir("astack-src-"), "committed");
		write(root, "templates/pr-review-hardening.stub.SKILL.md", "# Stub\n");
		const { code, lines, main } = await runFrom(root);
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: the astack repo at ${root} has changes that are not committed in marketplace, rules, scripts, src, templates, upstream: templates/pr-review-hardening.stub.SKILL.md. Commit them first, so the apply commit names the astack source that wrote it.`,
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
	});
});

describe("apply --worktree reads the state of the companion that holds the project config", () => {
	const runFrom = async (root: string) => {
		const { main, worktrees } = seedRepos();
		const lines: string[] = [];
		const code = await worktreeProject(acme(main), {
			astackRoot,
			companionRoot: root,
			profileDir: join(root, "projects", "acme"),
			deny: emptyDeny,
			worktrees,
			trailers,
			keep: false,
			today: "2026-10-16",
			log: (line = "") => lines.push(line),
		});
		return { code, lines, main, worktrees };
	};

	test("refuses a companion with a change that is not committed in any of its files, and makes no branch", async () => {
		const root = companionTree(tempDir("companion-src-"), "committed");
		write(root, "projects/acme.json", '{ "name": "acme", "mode": "write" }\n');
		write(root, "notes.md", "draft\n");
		const { code, lines, main, worktrees } = await runFrom(root);
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: the companion at ${root} has changes that are not committed: projects/acme.json, notes.md. Commit them first, so the apply commit names the companion source that wrote it.`,
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
		expect(existsSync(join(worktrees, "acme", "astack-setup"))).toBe(false);
	});

	test("refuses a companion with no commit, and makes no branch", async () => {
		const root = companionTree(tempDir("companion-src-"), "no-commit");
		const { code, lines, main } = await runFrom(root);
		expect(code).toBe(1);
		expect(lines).toContain(
			`Refused: the companion at ${root} has no commit, so the apply commit cannot name the companion source that wrote it. Make a first commit there.`,
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
	});
});

describe("apply --worktree into a repo that holds an old copy of the hardening command", () => {
	const withStub = (main: string, commitSubject?: string) => {
		const config = acme(main);
		return {
			...config,
			artifacts: { ...config.artifacts, reviewStub: true },
			...(commitSubject === undefined ? {} : { commitSubject }),
		};
	};
	const runWith = async (
		extra: Readonly<Record<string, string>>,
		commitSubject?: string,
	) => {
		const { main, worktrees } = seedRepos(extra);
		const profileDir = tempDir("astack-profile-");
		write(
			profileDir,
			"pr-review-hardening.profile.md",
			fixtureProfile("after"),
		);
		const lines: string[] = [];
		const code = await worktreeProject(withStub(main, commitSubject), {
			astackRoot,
			...companionInputs,
			worktrees,
			trailers,
			keep: false,
			today: "2026-10-16",
			profileDir,
			log: (line = "") => lines.push(line),
		});
		return {
			code,
			lines,
			main,
			worktree: join(worktrees, "acme", "astack-setup"),
		};
	};

	test("the create commit deletes the retired command and names the removal in its subject", async () => {
		const { code, worktree } = await runWith({
			".claude/commands/pr-review-hardening.md": "# Old command\n",
		});
		expect(code).toBe(0);
		expect(git(worktree, "log", "-1", "--format=%s")).toBe(
			"chore: add the astack profile, review stub, hardening profile, flow docs, rule copies and license notices, and remove the files that astack replaces",
		);
		expect(
			git(worktree, "show", "--name-status", "--format=", "HEAD").split("\n"),
		).toContain("D\t.claude/commands/pr-review-hardening.md");
	});

	test("a create commit with a subject from the project config still names the removal", async () => {
		const { code, worktree } = await runWith(
			{ ".claude/commands/pr-review-hardening.md": "# Old command\n" },
			"chore(agents): add the astack agent files",
		);
		expect(code).toBe(0);
		expect(git(worktree, "log", "-1", "--format=%s")).toBe(
			"chore(agents): add the astack agent files, and remove the files that astack replaces",
		);
		expect(
			git(worktree, "show", "--name-status", "--format=", "HEAD").split("\n"),
		).toContain("D\t.claude/commands/pr-review-hardening.md");
	});

	test("a tracked copy of the command at another path stops the apply before the commit", async () => {
		const { code, lines, main } = await runWith({
			".cursor/commands/pr-review-hardening.md": "# Old command\n",
		});
		expect(code).toBe(1);
		expect(lines).toContain(
			"- .cursor/commands/pr-review-hardening.md: a tracked copy of the pr-review-hardening skill or command that apply neither writes nor deletes. A harness can load it in place of the review stub. Delete it in the repo, or add it to RETIRED_PATHS in src/astack/managed.ts so apply deletes it.",
		);
		expect(git(main, "branch", "--list", "astack/setup")).toBe("");
	});
});
