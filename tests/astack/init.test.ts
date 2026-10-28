import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Io } from "../../src/astack/cli/io.ts";
import { main } from "../../src/astack/cli/main.ts";
import {
	detectTracker,
	initProfile,
	parseTrackerFlag,
	type RepoFacts,
} from "../../src/astack/init.ts";
import { profileProblems } from "../../src/astack/profile.ts";
import { jsonIndent } from "../../src/astack/repo-facts.ts";
import {
	advised,
	checkText,
	DEFAULT_GLOSSARY,
	denied,
} from "../../src/astack/ste/check.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-init-")));
	dirs.push(dir);
	return dir;
}

function git(cwd: string, ...args: string[]): void {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

function write(root: string, path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function commit(repo: string, subject: string): void {
	git(repo, "commit", "-q", "--allow-empty", "-m", subject);
}

function linearRepo(): string {
	const repo = tempDir();
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.name", "Test Owner");
	git(repo, "config", "user.email", "owner@example.com");
	write(repo, "CONTEXT.md", "# Context\n");
	write(repo, "docs/adr/0001-start.md", "# Start\n");
	write(repo, ".github/pull_request_template.md", "## Summary\n");
	git(repo, "add", "-A");
	commit(repo, "feat(app): start the app");
	commit(repo, "fix(app): handle empty rows (ABC-7)");
	git(repo, "branch", "dev/abc-12-export");
	git(repo, "branch", "dev/abc-14-import");
	return repo;
}

function runInit(cwd: string, ...args: string[]) {
	let out = "";
	let err = "";
	const io: Io = {
		out: (text) => {
			out += text;
		},
		err: (text) => {
			err += text;
		},
		cwd,
		env: {},
		today: "2026-10-16",
		now: new Date("2026-10-16T09:30:00Z"),
		scriptPath: undefined,
	};
	const code = main(["init", ...args], io);
	return { code, out, err };
}

const facts: RepoFacts = {
	branches: [],
	subjects: [],
	remoteUrl: undefined,
	defaultBranch: "main",
	prTemplate: undefined,
	glossary: undefined,
	adrDir: undefined,
	issueTemplate: undefined,
	indent: "  ",
};

describe("detectTracker", () => {
	test("ticket keys in branch names win over keys in subjects, and a word is not a team", () => {
		expect(
			detectTracker({
				...facts,
				branches: [
					"dev/abc-12/s0-export",
					"origin-copy/abc-12/s0-export",
					"dev/abc-14-import",
					"dev/phase-5-feed",
					"dev/phase-6-assets",
					"main",
				],
				subjects: ["Rows land (DS-361)", "Rows land (DS-362)", "(DS-363)"],
			}),
		).toEqual({
			choice: { kind: "linear", team: "ABC" },
			evidence: "Linear team ABC. Branch names name 2 tickets such as ABC-<n>.",
		});
	});

	test("without branch keys, only keys in a ticket position of a subject count", () => {
		expect(
			detectTracker({
				...facts,
				subjects: [
					"fix: handle rows (ABC-7)",
					"feat: export [Part of ABC-9, ABC-10]",
					"docs: decide the rows (DZ-73\u2026DZ-84)",
					"docs: DZ-85 and DZ-86 in the log",
					"docs: ADR-0001 and ADR-0002",
				],
			}),
		).toEqual({
			choice: { kind: "linear", team: "ABC" },
			evidence:
				"Linear team ABC. Commit subjects name 3 tickets such as ABC-<n>.",
		});
	});

	test("issue numbers or an issue template on a GitHub remote give GitHub issues", () => {
		expect(
			detectTracker({
				...facts,
				remoteUrl: "git@github.com:acme/app.git",
				branches: ["12-fix-login", "main"],
				subjects: ["Fix login (closes #12)", "Add export, part of #14 (#15)"],
			}),
		).toEqual({
			choice: { kind: "github" },
			evidence:
				"GitHub issues. Branch names and commit subjects name issues 3 times.",
		});
		expect(
			detectTracker({
				...facts,
				remoteUrl: "https://github.com/acme/app.git",
				issueTemplate: ".github/ISSUE_TEMPLATE",
			}),
		).toEqual({
			choice: { kind: "github" },
			evidence: "GitHub issues. The repo has .github/ISSUE_TEMPLATE.",
		});
	});

	test("one ticket in many branches, ADR numbers or PR numbers give no tracker", () => {
		expect(
			detectTracker({
				...facts,
				remoteUrl: "https://github.com/acme/app.git",
				branches: [
					"docs/uvt-001-follow-ups",
					"fix/uvt-001-field-report",
					"feat/adr-0075-provenance",
					"pr-13-rebuild",
					"release-2",
				],
				subjects: ["docs: ADR-0001", "docs: ADR-0002", "Add export (#15)"],
			}),
		).toEqual({
			choice: { kind: "none" },
			evidence:
				"none found in branch names and commit subjects. Pass --tracker to set one.",
		});
	});
});

describe("flags and the profile", () => {
	test("--tracker takes linear:<TEAM>, github or none", () => {
		expect(parseTrackerFlag("linear:abc")).toEqual({
			ok: true,
			value: { kind: "linear", team: "ABC" },
		});
		expect(parseTrackerFlag("github")).toEqual({
			ok: true,
			value: { kind: "github" },
		});
		expect(parseTrackerFlag("jira")).toEqual({
			ok: false,
			error:
				'--tracker takes linear:<TEAM>, github or none, not "jira". TEAM is a Linear team key such as ABC.',
		});
	});

	test("a Part of line needs a tracker", () => {
		expect(
			initProfile(
				facts,
				{ kind: "none" },
				{ requirePartOf: true, ste: undefined },
			),
		).toEqual({
			ok: false,
			error:
				"--require-part-of needs a tracker. Pass --tracker linear:<TEAM> or --tracker github.",
		});
	});

	test("the JSON indent follows the Biome config of the repo", () => {
		expect(jsonIndent(undefined)).toBe("  ");
		expect(jsonIndent('{"formatter": {"enabled": true}}')).toBe("\t");
		expect(
			jsonIndent('{"formatter": {"indentStyle": "space", "indentWidth": 4}}'),
		).toBe("    ");
	});
});

describe("astack init in a repo", () => {
	test("writes a valid profile from what it finds", () => {
		const repo = linearRepo();
		const result = runInit(repo, "--require-part-of", "--ste", "deny");
		expect(result.err).toBe("");
		expect(result.code).toBe(0);
		const profile = JSON.parse(
			readFileSync(join(repo, ".astack/profile.json"), "utf8"),
		);
		expect(profile).toEqual({
			tracker: { kind: "linear", team: "ABC", requirePartOf: true },
			merge: { authority: "turn" },
			ste: { mode: "deny", technicalNouns: [] },
			plan: { glossary: "CONTEXT.md", adr: "docs/adr" },
		});
		expect(profileProblems(profile)).toEqual([]);
		expect(result.out).toContain(
			"- PR template: .github/pull_request_template.md.",
		);
		expect(result.out).toContain(
			'    git commit -m "chore: add the astack profile"',
		);
		expect(result.out).toContain(
			'Put "Part of ABC-<n>" on the first line of the body.',
		);
		expect(result.out).toContain("    gh pr create --base main");
	});

	test("prints next steps with no STE finding", () => {
		const repo = linearRepo();
		const { out } = runInit(repo, "--dry-run", "--require-part-of");
		const report = checkText(out, {
			surface: "doc",
			enforcement: "deny",
			glossary: DEFAULT_GLOSSARY,
		});
		expect(denied(report)).toEqual([]);
		expect(advised(report)).toEqual([]);
	});

	test("--dry-run writes nothing", () => {
		const repo = linearRepo();
		const result = runInit(repo, "--dry-run");
		expect(result.code).toBe(0);
		expect(result.out.split("\n")[0]).toBe(
			"astack init --dry-run: it wrote no file.",
		);
		expect(existsSync(join(repo, ".astack"))).toBe(false);
	});

	test("refuses to replace a profile without --force", () => {
		const repo = linearRepo();
		write(
			repo,
			".astack/profile.json",
			'{"merge": {"authority": "standing"}}\n',
		);
		const refused = runInit(repo);
		expect(refused.code).toBe(1);
		expect(refused.err).toBe(
			"astack init: .astack/profile.json exists. Edit it, or run astack init again with --force to replace it.\n",
		);
		expect(readFileSync(join(repo, ".astack/profile.json"), "utf8")).toBe(
			'{"merge": {"authority": "standing"}}\n',
		);
		expect(runInit(repo, "--force", "--tracker", "none").code).toBe(0);
		expect(
			JSON.parse(readFileSync(join(repo, ".astack/profile.json"), "utf8"))
				.tracker,
		).toEqual({ kind: "none", requirePartOf: false });
	});

	test("never writes through a .astack link to a folder outside the repo", () => {
		const repo = linearRepo();
		const outside = tempDir();
		symlinkSync(outside, join(repo, ".astack"));
		const result = runInit(repo, "--force");
		expect(result.code).toBe(1);
		expect(result.err).toBe(
			"astack init: .astack is not a folder, so astack init does not write through it.\n",
		);
		expect(existsSync(join(outside, "profile.json"))).toBe(false);
	});

	test("runs only in the repo root", () => {
		const repo = linearRepo();
		mkdirSync(join(repo, "apps"));
		const result = runInit(join(repo, "apps"));
		expect(result.code).toBe(1);
		expect(result.err).toBe(`astack init: run it in the repo root, ${repo}.\n`);
		expect(existsSync(join(repo, ".astack"))).toBe(false);
	});

	test("bad flags are usage errors", () => {
		const repo = linearRepo();
		expect(runInit(repo, "--tracker", "jira").code).toBe(2);
		expect(runInit(repo, "--ste", "strict").err).toBe(
			"astack init: --ste takes deny or advise\n",
		);
		expect(runInit(repo, "--tracker", "none", "--require-part-of").code).toBe(
			2,
		);
		expect(runInit(repo, "--commit").err).toBe(
			"astack init: unknown argument --commit\n",
		);
		expect(existsSync(join(repo, ".astack"))).toBe(false);
	});

	test("prints JSON that the repo's Biome leaves as it is", () => {
		const repo = linearRepo();
		write(repo, "biome.json", '{"formatter": {"enabled": true}}\n');
		expect(runInit(repo).code).toBe(0);
		expect(readFileSync(join(repo, ".astack/profile.json"), "utf8")).toContain(
			'\t"tracker": {',
		);
		const biome = resolve(import.meta.dir, "../../node_modules/.bin/biome");
		const result = spawnSync(biome, ["format", ".astack/profile.json"], {
			cwd: repo,
			encoding: "utf8",
		});
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"would have printed",
		);
		expect(result.status).toBe(0);
	});
});
