import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
	profileDirFor,
	projectNames,
	reviewProfileName,
	validateProjectConfig,
} from "../scripts/lib/projects.ts";
import { exemptPaths } from "../scripts/lib/ste-exempt.ts";
import { marketplacePlugins, originItems } from "../scripts/validate.ts";
import {
	FIXER_FLAGS,
	parseProfile,
	profileGates,
} from "../src/astack/pr-review-profile.ts";
import {
	astack,
	createWorld,
	removeWorlds,
	script,
} from "./astack/pr-head-harness.ts";
import {
	exampleProjects,
	profilePaths,
	scanProjectDirs,
	scanRows,
} from "./profile-paths.ts";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const engine = "marketplace/plugins/astack/skills/pr-review-hardening";
const headLine =
	"Run `astack check pr-head` before you act on a PR, with `--pr <n>` for a named PR. Go on only after exit 0 with an `ok:` last line or exit 3 with a `no_pr:` last line.";
const failureLine =
	"A failure of `gh pr view` is an error, not a missing PR. Print it, and stop.";
const repairSentence =
	"After `stop: HEAD does not hold PR_HEAD`, pull the PR branch. Then run `astack check pr-head` again.";

function paragraphStarting(text: string, start: string): string {
	const line = text.split("\n").find((entry) => entry.startsWith(start));
	if (line === undefined) throw new Error(`no line starts with "${start}"`);
	return line;
}

function stepWith(text: string, part: string): string {
	const line = text
		.split("\n")
		.find((entry) => /^\d+\. /.test(entry) && entry.includes(part));
	if (line === undefined) throw new Error(`no step holds "${part}"`);
	return line;
}

function sectionLines(text: string, heading: string): string[] {
	const from = text.indexOf(`\n## ${heading}\n`);
	if (from === -1) throw new Error(`no section ${heading}`);
	const to = text.indexOf("\n## ", from + 1);
	return text
		.slice(from, to === -1 ? undefined : to)
		.split("\n")
		.slice(2)
		.filter((line) => line.trim() !== "");
}

function sentencesFrom(text: string, first: string, last: string): string {
	const from = text.indexOf(first);
	const to = text.indexOf(last, from);
	if (from === -1 || to === -1)
		throw new Error(`no text from "${first}" to "${last}"`);
	return text.slice(from, to + last.length);
}

function sentencesOf(line: string): string[] {
	return line
		.replace(/^\s*(?:\d+\.|-)\s+/, "")
		.split(/(?<=\.)\s+(?=\S)/)
		.filter((sentence) => sentence !== "");
}

const markdownUnder = (dir: string): string[] =>
	readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
		.filter((path) => path.endsWith(".md"))
		.map((path) => join(dir, path));

describe("the profile scans", () => {
	const writtenBy = (projects: string): string[] =>
		projectNames(projects).flatMap((name) => {
			const project = validateProjectConfig(
				JSON.parse(readFileSync(join(projects, `${name}.json`), "utf8")),
				name,
			);
			return [undefined, ...Object.keys(project.branches ?? {})].map((branch) =>
				relative(
					root,
					join(projects, profileDirFor(name, branch), reviewProfileName),
				),
			);
		});

	test("the profile list of the scans holds each profile that apply writes, the profile of each branch overlay included", () => {
		expect(writtenBy(exampleProjects)).toEqual([
			"examples/companion/projects/acme/pr-review-hardening.profile.md",
			"examples/companion/projects/acme/branches/v2/pr-review-hardening.profile.md",
		]);
		expect(
			scanProjectDirs
				.flatMap(writtenBy)
				.filter((path) => !profilePaths.includes(path)),
		).toEqual([]);
	});
});

describe("the one keep list of the repo", () => {
	const retiredRow =
		"| `comments` | object | none | Retired. The comment gate and the marker rule read only `commentKeep` in `.astack/profile.json`. The check command passes a profile that still sets `comments.keep_patterns`, and apply refuses it. |";

	test("[control:rs-one-list] RUN_CONFIG names only commentKeep, and comments.keep_patterns stays only in the retired row of references/profile.md", () => {
		expect(
			stepWith(read(`${engine}/SKILL.md`), "Print `RUN_CONFIG`."),
		).toContain(
			"Last are the keep patterns of `commentKeep` in `.astack/profile.json`.",
		);
		expect(
			markdownUnder(engine).flatMap((path) =>
				read(path)
					.split("\n")
					.filter((line) => line.includes("keep_patterns"))
					.map((line) => `${path}: ${line}`),
			),
		).toEqual([`${engine}/references/profile.md: ${retiredRow}`]);
	});
});

describe("severity labels", () => {
	const labels = paragraphStarting(
		read(`${engine}/references/review.md`),
		"A finding is a blocking candidate when",
	);

	test("the engine names every label the replaced protocol blocked on", () => {
		for (const label of ["Critical", "Blocker", "High", "Important"])
			expect(labels).toContain(label);
		expect(labels).toContain("`normal`");
		expect(labels).toContain("unclear label");
	});

	test("the engine never narrows the labels to three buckets", () => {
		expect(read(`${engine}/references/review.md`)).not.toContain(
			"Aggregate the outputs as Critical, Important and Suggestions",
		);
	});
});

describe("commits of a finding", () => {
	const commitRule = () =>
		sentencesFrom(
			read("rules/coding.md"),
			"Run the failing check before the fix.",
			"No commit holds two findings.",
		);
	const files = [
		"marketplace/plugins/astack/skills/coding-rules/SKILL.md",
		"marketplace/plugins/astack/skills/coding-guide/SKILL.md",
		`${engine}/SKILL.md`,
		`${engine}/references/fix.md`,
		"marketplace/plugins/astack/skills/mode/references/comments-triage.md",
	];

	test("the coding rule puts the failing check in the commit of the fix, so every commit is green", () => {
		expect(commitRule()).toBe(
			"Run the failing check before the fix. Record its output. Then commit the test or script together with the fix, so every commit is green. The PR's Verification shows the failing run first, then the passing run. Each finding owns its commits. No commit holds two findings.",
		);
	});

	test.each(files)("%s states the rule in the same words", (path) => {
		expect(read(path)).toContain(commitRule());
		expect(read(path).toLowerCase()).not.toContain("one commit per finding");
	});

	const redCommit =
		/\bcommits? (?:(?:a|the|that) )?(?:(?:failing|red) )?(?:tests? or scripts?|tests?|checks?|scripts?)\b(?: first|,? then the fix| before the fix)|\bthe fix on top\b/i;

	test("the red-commit pattern finds the order that the rule replaced", () => {
		expect(
			[
				"Commit that check first, then the fix.",
				"For a bug, commit the failing test or script before the fix.",
				"Commit a failing test or script, then the fix",
				"commits the failing test or script before the fix.",
				"Commit the failing test first, then the fix.",
				"commit the failing test before the fix",
				"This is the canonical **sequence-verifiable-units** principle skill, the failing test first and the fix on top.",
				"The canonical shape is the failing test first, then the fix on top.",
				"Commit failing tests before the fix.",
				"Commit the red test first, then the fix.",
				"Commit the failing check first, as its own commit.",
			].filter((sentence) => !redCommit.test(sentence)),
		).toEqual([]);
	});

	test("the red-commit pattern leaves the write order of a failing test and the astack commit rule alone", () => {
		expect(
			[
				"Write the failing test first.",
				"Write the failing test first, then only enough code to pass it.",
				"write the failing test before the fix.",
				"Run the failing check before the fix.",
				"Commit the failing check together with the fix, so every commit is green.",
			].filter((sentence) => redCommit.test(sentence)),
		).toEqual([]);
	});

	test("no astack text commits a failing check apart from its fix", () => {
		const paths = [
			"rules/coding.md",
			...markdownUnder("marketplace/plugins/astack"),
			...profilePaths,
		];
		expect(paths.filter((path) => redCommit.test(read(path)))).toEqual([]);
	});

	test("the scan of astack texts reads each project profile, whose guardrails the run prints each iteration", () => {
		expect(profilePaths).toEqual(
			expect.arrayContaining([
				"examples/companion/projects/acme/pr-review-hardening.profile.md",
			]),
		);
	});

	test("no item with an origin commits a failing check apart from its fix", () => {
		const plugins = marketplacePlugins(join(root, "marketplace"));
		expect(plugins.ok).toBe(true);
		const items = originItems(plugins.ok ? plugins.value : []).items.filter(
			(item) => item.origin.length > 0,
		);
		expect(items.length).toBeGreaterThan(0);
		const paths = items.flatMap((item) => {
			const itemPath = relative(root, join(item.plugin.root, item.path));
			return itemPath.endsWith(".md") ? [itemPath] : markdownUnder(itemPath);
		});
		expect(paths.filter((path) => redCommit.test(read(path)))).toEqual([]);
	});

	test("the ledger records every commit of a finding", () => {
		expect(read(`${engine}/references/review.md`)).toContain(
			"`commits`, the SHAs of the finding's commits, in order",
		);
	});
});

describe("the gate run", () => {
	const gate = read(`${engine}/references/gate.md`);

	const restore =
		"Before the subshell of a gate opens, record `git -C <WORKTREE> diff --name-only`. Right after it exits, whatever its exit code, the run restores the `rewrites` paths that were not in that list. It uses `git -C <WORKTREE> checkout -- <path>`. It prints `<NAME>_RESTORED=<path>` for each restored path that `git -C <WORKTREE> diff --name-only` showed before the restore. A `rewrites` path that changed before the gate stays as it is, so the status check after the gates shows it.";

	test.each([["references/gate.md", gate]])(
		"%s restores only the rewrites that the gate itself made, so an earlier write or an uncommitted change stays red",
		(_, text) => {
			expect(text).toContain(restore);
		},
	);

	test.each([
		["references/gate.md", gate],
		["references/profile.md", read(`${engine}/references/profile.md`)],
	])(
		"%s restores a rewrite from the root, so a cd in the gate command cannot move its pathspec",
		(_, text) => {
			expect(text).toContain("`git -C <WORKTREE> checkout -- <path>`");
			expect(text).not.toContain("`git checkout -- <path>`");
		},
	);

	test("the restore comes before the status check, so only a write that no entry allows is red", () => {
		const at = gate.indexOf(restore);
		expect(at).toBeGreaterThan(-1);
		expect(at).toBeLessThan(gate.indexOf("as `GIT_STATUS_AFTER_GATE`"));
		expect(gate).toContain(
			"no gate changed a tracked file that its `rewrites` does not name.",
		);
	});
});

describe("gate entries that fix the tree", () => {
	const readOnly = paragraphStarting(
		read(`${engine}/references/gate.md`),
		"A gate command must not write tracked files",
	);

	test.each([["references/gate.md", readOnly]])(
		"%s names each fixer flag that the profile check refuses",
		(_, text) => {
			for (const { flag } of FIXER_FLAGS) expect(text).toContain(`\`${flag}\``);
		},
	);

	test.each([["references/gate.md", readOnly]])(
		"%s refuses a fixer flag in a setup command and a prerequisite, not only in the gate command",
		(_, text) => {
			expect(text).toContain("`setup` command");
			expect(text).toMatch(/prerequisite/);
		},
	);
});

describe("the shell and the directory of each gate entry", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const gateRun = sentencesFrom(gate, "## Run it", "## Green");

	test.each([["references/gate.md", gateRun]])(
		"%s runs the subshell of each gate with bash, as GitHub Actions runs a run step",
		(_, text) => {
			expect(text).toContain("`bash -c '<gate script>'`");
			expect(text).toContain("`set +e`");
		},
	);

	const prerequisites = "the `check` of each prerequisite in `requires`";

	test.each([
		["the preflight of SKILL.md", stepWith(engineSkill, prerequisites)],
		["the gate run of references/gate.md", gateRun],
	])(
		"%s runs each check, start, setup command and gate command in its own subshell from the root",
		(_, text) => {
			expect(text).toContain("`( cd <WORKTREE> && <entry> )`");
		},
	);

	test.each([
		["the preflight of SKILL.md", stepWith(engineSkill, prerequisites)],
	])(
		"%s runs each check and start with bash, because zsh does not split the word list of a for loop",
		(_, text) => {
			expect(text).toContain(
				"Run each `check` and each `start` with bash, in its own subshell from the root, as `( cd <WORKTREE> && <entry> )`.",
			);
		},
	);

	const splitByShell = /(?<!")\$\{\w+:\+[^}]*\s[^}]*\}/;

	test("the word-split pattern finds the form that zsh passes as one word", () => {
		expect(
			splitByShell.test(
				sentencesFrom(gate, "zsh does not split", "into two words"),
			),
		).toBe(true);
		expect(
			splitByShell.test(
				'if [ -n "$pattern" ]; then bun run e2e:full --grep "$pattern"; fi',
			),
		).toBe(false);
	});

	test.each(profilePaths)(
		"%s has no entry whose words depend on how the shell splits an unquoted expansion",
		(path) => {
			const gates = profileGates(parseProfile(read(path)).data);
			expect(
				gates.flatMap((entry) =>
					[entry.command, ...entry.preparation].filter((text) =>
						splitByShell.test(text),
					),
				),
			).toEqual([]);
		},
	);
});

describe("gates that mirror CI", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const mirror =
		"The profile's gates mirror the blocking jobs of the repo's CI.";
	const notStarted =
		"A gate that applies but cannot start is an unclean stop. The run never skips it.";

	test.each([
		["SKILL.md", engineSkill],
		["references/gate.md", gate],
		["references/profile.md", profile],
	])(
		"%s says the gates mirror CI and a gate that cannot start stops the run",
		(_, text) => {
			expect(text).toContain(mirror);
			expect(text).toContain(notStarted);
		},
	);

	test("the engine prints NOT_STARTED for a gate that cannot start, and the stop names it", () => {
		expect(gate).toContain("`<NAME>_EXIT=NOT_STARTED`");
		expect(engineSkill).toContain(
			"A gate that applies cannot start. The report names the gate and the missing item.",
		);
	});
});

describe("the CI environment of a gate", () => {
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const ciEnvironment =
		"Each gate runs in the CI environment of its jobs. Before its prerequisites, its `setup` commands and its command, the run exports `CI=true`, then each `ci_env` entry that has a `value`. An entry with a `why` and no `value` leaves its variable as the session has it, and that holds for `CI` too. The run never sets `GITHUB_ACTIONS` or another `GITHUB_` or `RUNNER_` variable, because no gate runs on GitHub Actions.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
	])(
		"%s exports CI=true and the CI values, and never fakes the runner",
		(_, text) => {
			expect(text).toContain(ciEnvironment);
		},
	);

	const environmentLine =
		"`<NAME>_ENV` lists the names that the run exports as `<name>=<value>`, which are `CI` and each `ci_env` entry that has a `value`. It lists each other name of the `ci_env` and `env` of the gate as `<name>=set` or `<name>=unset`.";

	test.each([["references/gate.md", gate]])(
		"%s prints a value of the profile, and only set or unset for a value of the session",
		(_, text) => {
			expect(text).toContain(environmentLine);
			expect(text).not.toContain("name=value>");
		},
	);
});

describe("values that the run prints", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const secrets =
		"Never print a value from the session or from a file. Such a value can be a secret, such as a token, a key or a database URL.";

	test.each([
		[
			"the rules of SKILL.md",
			sentencesFrom(engineSkill, "## Rules for the whole run", "## Preflight"),
		],
		["references/gate.md", gate],
	])("%s never prints a value of the session or of a file", (_, text) => {
		expect(text).toContain(secrets);
	});

	test("RUN_CONFIG holds no value of the session or of a file", () => {
		expect(paragraphStarting(engineSkill, "3. Print `RUN_CONFIG`.")).toContain(
			"It holds no value from the session or from a file.",
		);
	});

	const printsSessionValue = (sentence: string): boolean =>
		/\b(?:print|prints|name|names|show|shows|list|lists|echo|log|post|report)\b/i.test(
			sentence,
		) &&
		/\bvalues?\b/i.test(sentence) &&
		/\bsession\b|\bfrom a file\b|\.env\b|\benvironment\b|`env`|\bvariables?\b/i.test(
			sentence,
		) &&
		!/\bnever\b|\bno value\b|\bnot\b|\bonly when the profile holds it\b/i.test(
			sentence,
		);

	test("the scan finds a sentence that prints a value of the session, and passes the rule that forbids it", () => {
		expect(
			printsSessionValue(
				"Name the variable and the value that the session gives it, the prerequisite with its check output, or the setup command with its output.",
			),
		).toBe(true);
		expect(printsSessionValue("Print the value of each `env` variable.")).toBe(
			true,
		);
		expect(printsSessionValue(secrets.split(". ")[0] ?? "")).toBe(false);
		expect(
			printsSessionValue(
				"Print a value only when the profile holds it, such as a `ci_env` value.",
			),
		).toBe(false);
	});

	test.each([
		["SKILL.md", engineSkill],
		["references/gate.md", gate],
	])(
		"%s has no sentence that prints a value of the session or of a file",
		(_, text) => {
			expect(
				text.split("\n").flatMap(sentencesOf).filter(printsSessionValue),
			).toEqual([]);
		},
	);

	test("the gate that cannot start names the variable, never its value", () => {
		expect(gate).toContain(
			"Then print `<NAME>_EXIT=NOT_STARTED` and the reason. Name the variable, the prerequisite with its check output, or the setup command with its output.",
		);
	});

	const unexpanded = "as the profile writes it, with no variable expanded";

	test.each([["references/gate.md", gate]])(
		"%s prints each command with no variable expanded",
		(_, text) => {
			expect(text).toContain(unexpanded);
		},
	);
});

describe("the tool versions of a gate", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const pinned =
		"Each gate runs bun and the Supabase CLI at the versions in its `tools`, and so does each script that it starts.";
	const local =
		"When bunx cannot get a pinned version, the gate runs the local version. The final report names each difference as a note, and the run goes on. It is not an unclean stop.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
	])(
		"%s runs the pinned versions, and a version that bunx cannot get is a note",
		(_, text) => {
			expect(text).toContain(pinned);
			expect(text).toContain(local);
		},
	);

	const advisory =
		"CI runs the pinned versions, and CI gates the merge. So a local run with a version note is advisory for that tool.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
	])(
		"%s says that CI runs the pins and gates the merge, so a version note is advisory",
		(_, text) => {
			expect(text).toContain(`${local} ${advisory}`);
		},
	);

	test("the final report names each version note as advisory for its tool", () => {
		expect(gate).toContain(
			"12. Tool notes: each tool that a gate ran at its local version, with the pin, the local version and the error. A note is not a finding. CI runs the pinned versions, and CI gates the merge. So a local run with a version note is advisory for that tool.",
		);
	});

	test.each([["references/gate.md", gate]])(
		"%s gets each version through bunx and puts it first on PATH",
		(_, text) => {
			expect(text).toContain(
				"`bunx bun@<version> -e 'console.log(process.execPath)'`",
			);
			expect(text).toContain('`exec bunx supabase@<version> "$@"`');
			expect(text).toContain("`<NAME>_TOOLS=");
		},
	);

	test("the preflight gets the tool versions before it checks a prerequisite", () => {
		const tools = engineSkill.indexOf("get the versions in the `tools`");
		expect(tools).toBeGreaterThan(-1);
		expect(tools).toBeLessThan(engineSkill.indexOf("Run the `check` of each"));
	});

	test.each([
		["SKILL.md", engineSkill],
		["references/gate.md", gate],
		["references/profile.md", profile],
	])("%s never stops a gate on the local version of a tool", (_, text) => {
		expect(text).not.toMatch(/test "\$\((?:bun|supabase) --version\)"/);
		expect(text).not.toContain("compares the version with the pin");
	});
});

describe("a run that names a PR reviews that PR", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const view =
		"`gh pr view <n> --json headRefName,headRefOid,baseRefName,state,isCrossRepository`";
	const sentences = [
		view,
		"`git worktree add --detach <dir>`",
		"`gh pr checkout <n> --branch <local branch>`",
		"With `--pr`, the base branch is the bare word, else the PR's `baseRefName`, whatever `base.from_pr` says.",
		"Never create a review branch in a run with `--pr`.",
	];

	test.each(sentences)("SKILL.md says %s", (sentence) => {
		expect(engineSkill).toContain(sentence);
	});

	test("the run checks out the PR before it loads the profile, so the profile of the PR head applies", () => {
		const before = (text: string, first: string, second: string) => {
			const at = text.indexOf(first);
			expect(at).toBeGreaterThan(-1);
			expect(at).toBeLessThan(text.indexOf(second));
		};
		before(engineSkill, view, "## Load the profile");
	});

	const takesByName = (text: string): string[] =>
		text
			.split("\n")
			.flatMap(sentencesOf)
			.filter(
				(sentence) =>
					sentence.includes("`headRefName`") &&
					/git worktree list|git branch --show-current|\bcurrent branch\b/.test(
						sentence,
					),
			);
	const localBranch =
		"The local branch of the PR is `headRefName`, or `pr-<n>` when `isCrossRepository` is true.";
	const forkCheckout = "`gh pr checkout <n> --branch <local branch>`";
	const readsFork = /`gh pr view [^`]*--json [^`]*\bisCrossRepository\b/;

	test("the name scan finds a checkout that a run takes by the name of the head branch of the PR", () => {
		expect(
			takesByName(
				[
					"2. When `git branch --show-current` prints `headRefName`, stay in this checkout.",
					"3. Otherwise, look for `headRefName` in `git worktree list --porcelain`, and continue in the worktree that holds it.",
					"   - When the current branch is not `headRefName`, work in the worktree that holds it in `git worktree list --porcelain`.",
					"2. When `git branch --show-current` prints the local branch of the PR, stay in this checkout.",
					"5. The fix commits go on `headRefName`.",
				].join("\n"),
			),
		).toEqual([
			"When `git branch --show-current` prints `headRefName`, stay in this checkout.",
			"Otherwise, look for `headRefName` in `git worktree list --porcelain`, and continue in the worktree that holds it.",
			"When the current branch is not `headRefName`, work in the worktree that holds it in `git worktree list --porcelain`.",
		]);
	});

	test.each([
		...markdownUnder("marketplace/plugins/astack").map(
			(path) => [path, read(path)] as const,
		),
		...profilePaths.map((path) => [path, read(path)] as const),
	])(
		"%s takes no checkout of a PR by the name of its head branch, which a branch of a fork can share with a local branch such as main",
		(_, text) => {
			expect(takesByName(text)).toEqual([]);
		},
	);

	test.each([
		["SKILL.md", engineSkill],
		[
			"the comments triage of the mode",
			read(
				"marketplace/plugins/astack/skills/mode/references/comments-triage.md",
			),
		],
	])(
		"%s reads isCrossRepository and checks out a PR from a fork on a local branch of its own",
		(_, text) => {
			expect(text).toMatch(readsFork);
			expect(text).toContain(localBranch);
			expect(text).toContain(forkCheckout);
		},
	);
});

describe("the head of the PR on every path", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const onlyWithPr = [
		[
			"SKILL.md",
			sentencesFrom(
				engineSkill,
				"## Review the PR that --pr names",
				"The fix commits go on the local branch of the PR.",
			),
		],
	] as const;
	const commandHeadCheck = [
		"Run `astack check pr-head`, and add `--pr <n>` in a run with `--pr`. Print its output and its exit code.",
		"Each call reads the PR again, fetches its head, and prints `HEAD`, `PR_HEAD` and `UNPUSHED`. A run with `--pr` read the PR in its selection step, so the call reads it a second time.",
		"When it exits 0 and its last line starts with `ok:`, the check passes.",
		"When it exits 3 and its last line starts with `no_pr:`, the run has no PR.",
		"Only a run without `--pr` can get this result, and only when gh exits 1 with the no-PR message.",
		"Accept no other pair of exit code and last line. Stop with principled incompletion before the baseline.",
		"With no node and no bun, the launcher prints a note and exits 0, so the exit code alone is not a pass.",
		"The `UNPUSHED` list names the commits that CI did not test, so the final report names each one.",
	];

	const engineHeadCheck = sentencesFrom(
		engineSkill,
		"## The head check",
		"## Authority",
	);

	test.each(commandHeadCheck)(
		"the engine checks the head of every PR with one command, with --pr or without it: %s",
		(sentence) => {
			expect(engineHeadCheck).toContain(sentence);
			for (const [, text] of onlyWithPr) expect(text).not.toContain(sentence);
		},
	);

	test("[control:ph-pair] each text that runs the command takes only exit 0 with an ok: last line or exit 3 with a no_pr: last line, and after a stop only the repair sentence", () => {
		const callers = [
			...markdownUnder("marketplace/plugins/astack"),
			...markdownUnder("rules"),
			...profilePaths,
		].filter((path) => read(path).includes("astack check pr-head"));
		const scopes = [[`${engine}/SKILL.md`, engineHeadCheck]] as const;
		const others = callers.filter(
			(path) => !scopes.some(([scope]) => scope === path),
		);
		const strayResults = (text: string): string[] =>
			text
				.split("\n")
				.map((line) =>
					[headLine, failureLine, repairSentence].reduce(
						(rest, sentence) => rest.replaceAll(sentence, ""),
						line,
					),
				)
				.filter((rest) =>
					/`ok:`|`ok: HEAD|`no_pr:|`stop: (?:HEAD|gh|git)\b|pr-head.*\b(?:exit|fail|pass)|\b(?:exit|fail|pass).*pr-head/.test(
						rest,
					),
				);
		expect(callers).toEqual(
			expect.arrayContaining(scopes.map(([path]) => path)),
		);
		for (const [, text] of scopes)
			for (const sentence of commandHeadCheck.slice(2, 7))
				expect(text).toContain(sentence);
		const triage =
			"marketplace/plugins/astack/skills/mode/references/comments-triage.md";
		expect(others).toContain(triage);
		expect(
			others.filter(
				(path) =>
					!read(path).includes(headLine) || strayResults(read(path)).length > 0,
			),
		).toEqual([]);
		const actsAfterStop =
			"After `stop: HEAD does not hold PR_HEAD`, reply on each thread.";
		const mutated = read(triage).replace(repairSentence, actsAfterStop);
		const mutatedLines = mutated
			.split("\n")
			.filter((line) => line.includes(actsAfterStop));
		expect(mutatedLines).toHaveLength(1);
		expect(strayResults(mutated)).toEqual(mutatedLines);
	});

	test("a local branch that is only ahead of the PR goes on, and the report names its commits", () => {
		expect(engineSkill).not.toContain("When they differ, stop");
		expect(gate).toContain(
			"Unpushed commits: the `UNPUSHED` list of the last head check. CI did not test these commits.",
		);
	});

	const push =
		"In a run with a PR, push the branch as `push` says when `HEAD` is not `PR_HEAD`.";
	const checkAgain = "Then do the head check again.";

	test.each([
		[
			"the decision step of SKILL.md",
			stepWith(engineSkill, "7. Decide."),
			checkAgain,
		],
	])(
		"%s pushes an unpushed head of the PR, then reads the head of the PR again before the summary",
		(_, step, again) => {
			expect(step).toContain(push);
			expect(step).toContain(again);
			expect(step.indexOf(push)).toBeLessThan(step.indexOf(again));
			expect(step.indexOf(again)).toBeLessThan(step.search(/summary/i));
		},
	);

	const pushedHead = [
		"In a run with a PR, a clean stop also needs `PR_HEAD` to equal `HEAD` after the push of step 7.",
		"CI tests only the head of the PR, so a review or a gate run of an unpushed commit proves nothing for the PR.",
	];

	test.each([
		[
			"the decision of SKILL.md",
			sentencesFrom(engineSkill, "## Decide", "## After the stop"),
			"In a run with a PR, `PR_HEAD` is still not `HEAD` after step 7, because the run cannot push. The report names each commit of `UNPUSHED`.",
		],
	])(
		"%s stops clean only on the head of the PR, and stops with principled incompletion on a commit that the run cannot push",
		(_, text, cannotPush) => {
			for (const sentence of pushedHead) expect(text).toContain(sentence);
			expect(text).toContain(cannotPush);
		},
	);

	const gateAgain =
		"When the run has a PR, do the head check again. A push to the PR can move its head.";

	test.each([
		[
			"references/gate.md",
			sentencesFrom(gate, "## Run it", "## Green"),
			gateAgain,
		],
	])("%s checks the head of the PR again", (_, text, sentence) => {
		expect(text).toContain(sentence);
	});
});

describe("the branch of the fix commits", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const fix = read(`${engine}/references/fix.md`);
	const onCurrentBranch =
		"Without `--pr`, the fix commits go on the current branch, or on the branch that this step creates.";
	const pushedBranch =
		"A push sends the branch of the fix commits, which the preflight names.";
	const firstPush =
		"A run with no PR, or with a PR from the same repository, pushes a branch with no upstream with `git push -u origin <branch>`.";
	const forkRead =
		"In a run with a PR, read `gh pr view <n> --json headRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`.";
	const forkStop =
		"When `isCrossRepository` is true and `maintainerCanModify` is false, the run makes no fix commit, and it stops with principled incompletion.";
	const forkReason =
		"The report says that the fork does not allow edits from maintainers, so the run cannot push a fix.";
	const forkPush =
		"When `isCrossRepository` is true, the run pushes with `git push <head repository URL> HEAD:<headRefName>`, and never pushes a branch to `origin`.";
	const headRepositoryUrl =
		"To make the head repository URL, start from the URL of `origin`. Replace its owner with the `login` of `headRepositoryOwner`, and its repository name with the `name` of `headRepository`.";
	const mode = "marketplace/plugins/astack/skills/mode/references";
	const createPr = read(`${mode}/create-pr.md`);
	const playbooks = [
		["the create-pr playbook of the mode", createPr],
		[
			"the comments triage playbook of the mode",
			read(`${mode}/comments-triage.md`),
		],
	] as const;
	const readsForkFields =
		/`gh pr (?:view|list) [^`]*--json [^`]*\bheadRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify\b/;
	const playbookForkStop =
		"When `isCrossRepository` is true and `maintainerCanModify` is false, make no fix commit and push nothing.";
	const forkByName =
		"`--head` matches a branch of any owner. So a PR with `isCrossRepository` true is the PR of this work only when `git merge-base --is-ancestor <headRefOid> HEAD` exits 0.";

	const forkRules = [
		playbookForkStop,
		"Tell the owner that the fork does not allow edits from maintainers, so no fix can reach the PR.",
		forkPush,
		headRepositoryUrl,
	];
	const forkLink =
		"the fork rules of steps 1 and 7 of [`create-pr.md`](create-pr.md)";
	const holdsForkRules = (text: string): boolean =>
		text.includes(forkLink) || forkRules.every((rule) => text.includes(rule));

	test.each(playbooks)("%s reads the fork fields of the PR", (_, text) => {
		expect(text).toMatch(readsForkFields);
	});

	test("[control:fork-link] create-pr holds each fork rule, each other playbook holds them or links to create-pr, and a text with neither fails", () => {
		expect(forkRules.filter((rule) => !createPr.includes(rule))).toEqual([]);
		expect(
			playbooks
				.filter(([, text]) => !holdsForkRules(text))
				.map(([name]) => name),
		).toEqual([]);
		const triage = read(`${mode}/comments-triage.md`);
		expect(
			holdsForkRules(
				forkRules.reduce(
					(text, rule) => text.replaceAll(rule, ""),
					triage.replace(forkLink, ""),
				),
			),
		).toBe(false);
	});

	test("the create-pr playbook takes a PR from a fork that gh pr list finds by the name of the branch only when the branch holds the head of that PR", () => {
		expect(stepWith(createPr, "`gh pr list --head <branch>")).toContain(
			forkByName,
		);
	});
	const prParts = [
		[
			"SKILL.md",
			engineSkill,
			sentencesFrom(
				engineSkill,
				"## Review the PR that --pr names",
				"## The head check",
			),
		],
	] as const;
	const scopeTexts: readonly (readonly [string, string, string])[] = [
		...prParts,
		...markdownUnder(`${engine}/references`).map(
			(path) => [path, read(path), ""] as const,
		),
	];
	const namesPrBranch = /\bheadRefName\b|\bthe PR's (?:own )?branch\b/;
	const readsPrBranch = /`gh pr view [^`]*--json [^`]*\bheadRefName\b/;
	const inRunThatReadsIt = (sentence: string): boolean =>
		sentence.startsWith("In a run with `--pr`") ||
		sentence.startsWith("With `--pr`") ||
		sentence.startsWith("When `isCrossRepository` is true") ||
		readsPrBranch.test(sentence);

	const headRefOutsidePr = (text: string, prPart: string): string[] =>
		text
			.replace(prPart, "")
			.split("\n")
			.flatMap(sentencesOf)
			.filter(
				(sentence) =>
					namesPrBranch.test(sentence) && !inRunThatReadsIt(sentence),
			);

	test("the scope check finds a sentence that sends the fix commits of every run to headRefName", () => {
		expect(
			headRefOutsidePr(
				[
					"With `--pr <n>`, read `headRefName`.",
					"5. Never commit on the base branch. The fix commits go on `headRefName`.",
					"- `each-commit`: push to the PR's own branch right after each commit.",
					"- Push the fix commits of every run to headRefName.",
					"- Push the fix commits to `headRefName`, also in a run without `--pr`.",
					"In a run with `--pr`, the fix commits go on `headRefName`. With `--pr`, push `headRefName`.",
					`${forkRead} In a run with a PR, the fix commits go on \`headRefName\`.`,
					forkPush,
				].join("\n"),
				"With `--pr <n>`, read `headRefName`.",
			),
		).toEqual([
			"The fix commits go on `headRefName`.",
			"`each-commit`: push to the PR's own branch right after each commit.",
			"Push the fix commits of every run to headRefName.",
			"Push the fix commits to `headRefName`, also in a run without `--pr`.",
			"In a run with a PR, the fix commits go on `headRefName`.",
		]);
	});

	test("the scope check reads each reference of the engine, such as references/fix.md, which says where a push goes", () => {
		expect(scopeTexts.map(([name]) => name)).toContain(
			`${engine}/references/fix.md`,
		);
	});

	test.each(scopeTexts)(
		"%s names headRefName only in a sentence of a run that reads it: a run with --pr, the read of gh, or the push of a PR from a fork",
		(_, text, prPart) => {
			expect(headRefOutsidePr(text, prPart)).toEqual([]);
		},
	);

	test.each(prParts)(
		"%s puts the fix commits of a run without --pr on the current branch",
		(_, text) => {
			expect(text).toContain(onCurrentBranch);
		},
	);

	test.each([["references/fix.md", fix]])(
		"%s pushes the branch of the fix commits, and pushes a branch with no upstream with git push -u origin <branch>",
		(_, text) => {
			expect(text).toContain(pushedBranch);
			expect(text).toContain(firstPush);
		},
	);

	test.each([["references/fix.md", fix]])(
		"%s pushes the fixes of a PR from a fork to the head branch in the head repository, never to origin",
		(_, text) => {
			expect(text).toContain(forkPush);
			expect(text).toContain(headRepositoryUrl);
		},
	);

	test.each([
		[
			"SKILL.md",
			stepWith(engineSkill, "If the current branch is the base branch"),
			sentencesFrom(engineSkill, "## Decide", "## After the stop"),
			"The PR is from a fork that does not allow edits from maintainers.",
		],
	])(
		"the preflight of %s reads the head repository of the PR, and stops with no fix commit on a fork that does not allow edits from maintainers",
		(_, step, decision, stop) => {
			expect(step).toContain(forkRead);
			expect(step).toContain(forkStop);
			expect(step).toContain(forkReason);
			expect(step.indexOf(forkRead)).toBeLessThan(step.indexOf(forkStop));
			expect(decision).toContain(stop);
		},
	);

	const originTarget =
		/\bgit(?:\s+-C\s+\S+)?\s+push(?:\s+-\S+)*\s+`?origin\b(?!\/)|\b(?:to|into)\s+(?:the\s+)?`?origin\b(?!\/)/;
	const forkNegation = /\bnever pushes a branch to `origin`(?=[.?])/;
	const originPushes = (text: string): string[] =>
		text
			.split("\n")
			.flatMap(sentencesOf)
			.filter(
				(sentence) =>
					sentence !== firstPush &&
					originTarget.test(sentence.replace(forkNegation, "")),
			);
	const pushTexts: readonly (readonly [string, string])[] = [
		...[
			...markdownUnder("marketplace/plugins/astack"),
			...markdownUnder("rules"),
			...profilePaths,
		].map((path) => [path, read(path)] as const),
	];

	test("the origin scan reads each astack text, such as the create-pr playbook of the mode, which pushes a PR", () => {
		expect(pushTexts.map(([name]) => name)).toEqual(
			expect.arrayContaining([
				`${engine}/SKILL.md`,
				`${engine}/references/fix.md`,
				`${mode}/create-pr.md`,
				`${mode}/comments-triage.md`,
				"rules/astack.md",
			]),
		);
	});

	test("the origin scan finds each push to origin that a run for a PR from a fork can follow", () => {
		expect(
			originPushes(
				[
					"When that branch has no upstream, such as a branch that the preflight creates, the first push is `git push -u origin <branch>`.",
					"7. In a run with a PR, push with `git push origin HEAD:<headRefName>`.",
					"- Push the fix commits to `origin`.",
					"When the push to the head repository fails, push the branch to `origin`.",
					`${forkPush} When the head repository refuses the push, push the branch to \`origin\` instead.`,
					"In a run with a PR, the fix commits go to `origin`.",
					"A run with no PR, or with a PR from the same repository, or with a PR from a fork, pushes a branch with no upstream with `git push -u origin <branch>`.",
					firstPush,
					forkPush,
					headRepositoryUrl,
					"3. Run `git fetch origin <base>`. A push to the PR can move its head.",
					"When `git merge-base --is-ancestor origin/<base> HEAD` fails, push nothing.",
				].join("\n"),
			),
		).toEqual([
			"When that branch has no upstream, such as a branch that the preflight creates, the first push is `git push -u origin <branch>`.",
			"In a run with a PR, push with `git push origin HEAD:<headRefName>`.",
			"Push the fix commits to `origin`.",
			"When the push to the head repository fails, push the branch to `origin`.",
			"When the head repository refuses the push, push the branch to `origin` instead.",
			"In a run with a PR, the fix commits go to `origin`.",
			"A run with no PR, or with a PR from the same repository, or with a PR from a fork, pushes a branch with no upstream with `git push -u origin <branch>`.",
		]);
	});

	test.each(pushTexts)(
		"%s sends no fix commit to origin, except the push of a run with no PR or a PR from the same repository",
		(_, text) => {
			expect(originPushes(text)).toEqual([]);
		},
	);
});

describe("the dependencies of every run", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const install = [
		"Install the dependencies in `WORKTREE` with a frozen lockfile, as the install step of CI does, such as `bun install --frozen-lockfile`.",
		"Do this in every run.",
		"When the install fails, stop with principled incompletion.",
	];

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
		],
	])(
		"%s installs the dependencies as CI does in every worktree, not only in a new one",
		(_, text) => {
			for (const sentence of install) expect(text).toContain(sentence);
		},
	);

	test("the step that makes a worktree for --pr installs nothing of its own", () => {
		expect(stepWith(engineSkill, "`gh pr checkout <n> --branch")).not.toContain(
			"install",
		);
	});

	test.each([
		["references/gate.md", sentencesFrom(gate, "## Run it", "## Green")],
	])("%s installs the dependencies again", (_, text) => {
		expect(text).toContain("Run the install of the preflight again.");
	});
});

describe("the base, the diff and the gates of the run", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const review = read(`${engine}/references/review.md`);

	test.each([
		"Run `git fetch origin <base>`. When it fails, or when `git rev-parse --verify origin/<base>` fails, stop with principled incompletion. The local base branch can be behind, so the run never diffs against it.",
		"When `git diff --quiet origin/<base>...HEAD` exits 0, the branch has no change to review. Stop with principled incompletion, and create no branch.",
		"CI tests the merge of the branch into the base, so the gates need every commit of the base. When `git merge-base --is-ancestor origin/<base> HEAD` fails, the branch lacks base commits. With `base.sync` set to `merge`, run `git merge origin/<base>`. With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.",
		"Print `BASE_SHA` as the output of `git rev-parse origin/<base>`. Every diff of the run is `git diff <BASE_SHA>...HEAD`.",
		"Print `WORKTREE` as the output of `git rev-parse --show-toplevel`. Start every command of the run with `cd <WORKTREE> &&`, because a tool call can start in another directory.",
	])("the engine says %s", (sentence) => {
		expect(engineSkill).toContain(sentence);
	});

	test("no run diffs against the local base branch", () => {
		for (const text of [engineSkill, gate, profile, review])
			expect(text).not.toMatch(/(?<!origin\/)<base>\.\.\.HEAD/);
	});

	const reviewerDiff =
		"`git -C <WORKTREE> diff <BASE_SHA>...<HEAD>`, with the path and both SHAs written out";

	test.each([
		["SKILL.md", engineSkill],
		["references/review.md", review],
	])(
		"%s gives each reviewer the absolute worktree and the pinned SHAs",
		(_, text) => {
			expect(text).toContain(reviewerDiff);
		},
	);

	const globs = sentencesFrom(
		profile,
		"A glob matches the whole repo-relative path.",
		"prints the paths that make the gate apply.",
	);

	test.each([["references/gate.md", gate]])(
		"%s states what * and ** match, as the profile reference does",
		(_, text) => {
			expect(globs).toContain("`*` matches inside one folder");
			expect(text).toContain(globs);
		},
	);

	const blocked = sentencesFrom(
		gate,
		"A gate that names gates in `after` runs only when",
		"never a finding of its own.",
	);

	test("a gate whose earlier gate did not pass is BLOCKED in the engine", () => {
		expect(blocked).toContain("print `<NAME>_EXIT=BLOCKED`");
		expect(gate).toContain("no gate is `NOT_STARTED` or `BLOCKED`");
	});

	const redGate = sentencesFrom(
		gate,
		"A red gate is a finding `G<n>.<k>`",
		"The run cannot stop clean while it stays red.",
	);

	test("a red gate that the PR made is a finding, and a pre-existing red is never fixed, in the engine", () => {
		expect(redGate).toContain("never fix it");
	});
});

describe("the migrations of a long-lived local stack", () => {
	const profile = read(`${engine}/references/profile.md`);
	const check =
		"A gate that applies migrations to a local stack that lives longer than one run compares the stack with the migration files first. Before `supabase migration up`, its `setup` runs `astack check migrations <folder> --db <url> --reset <command> --allow-pending`. After it, the same command runs without `--allow-pending`.";

	test("the profile reference tells each stack gate to compare the stack with the files of the branch", () => {
		expect(profile).toContain(check);
	});

	const uncheckedMigrations = (data: unknown): string[] =>
		profileGates(data).flatMap((gate) => {
			const migrate = gate.preparation.findIndex((command) =>
				/\bsupabase(?::|\s+)migrat/.test(command),
			);
			if (migrate < 0) return [];
			const before = gate.preparation
				.slice(0, migrate)
				.some((command) =>
					/^astack check migrations .* --allow-pending$/.test(command),
				);
			const after = gate.preparation
				.slice(migrate + 1)
				.some(
					(command) =>
						/^astack check migrations /.test(command) &&
						!command.includes("--allow-pending"),
				);
			return before && after ? [] : [gate.name];
		});

	test("the guard finds a migrate step of the CLI or of a package script that has no migration check before and after it", () => {
		const checkFirst =
			'astack check migrations db/supabase/migrations --db postgresql://postgres:postgres@127.0.0.1:54322/postgres --reset "cd db && supabase db reset" --allow-pending';
		const checkAfter =
			'astack check migrations db/supabase/migrations --db postgresql://postgres:postgres@127.0.0.1:54322/postgres --reset "cd db && supabase db reset"';
		expect(
			uncheckedMigrations({
				version: 1,
				gates: [
					{
						name: "checked",
						command: "bun run e2e",
						setup: [checkFirst, "(cd db && supabase migration up)", checkAfter],
					},
					{
						name: "no-check-after",
						command: "bun run e2e",
						setup: [checkFirst, "(cd db && supabase migration up)"],
					},
					{
						name: "script",
						command: "bun run db:test",
						setup: ["bun run supabase:migrate"],
					},
					{ name: "lint", command: "bun run lint", setup: ["bun install"] },
				],
				test: { name: "test", command: "bun run test" },
			}),
		).toEqual(["no-check-after", "script"]);
	});

	test.each(profilePaths)(
		"%s compares the stack before and after each supabase migration up",
		(path) => {
			expect(uncheckedMigrations(parseProfile(read(path)).data)).toEqual([]);
		},
	);
});

describe("a gate run sees only the commit", () => {
	const gate = read(`${engine}/references/gate.md`);
	const fix = read(`${engine}/references/fix.md`);
	const clean =
		"When `git -C <WORKTREE> status --porcelain --untracked-files=all` prints a line, stop with principled incompletion before the first gate, and name each path. CI tests the commit, so a gate never runs on a file that the commit does not hold.";

	test.each([
		["references/gate.md", sentencesFrom(gate, "## Run it", "## Green")],
	])(
		"%s stops on an untracked or uncommitted file before the first gate",
		(_, text) => {
			expect(text).toContain(clean);
			expect(text.indexOf(clean)).toBeGreaterThan(
				text.indexOf("as `GIT_STATUS_BEFORE_GATE`"),
			);
		},
	);

	test("the commit step lists an untracked file, and keeps temporary files out of the tree", () => {
		const commit = sentencesFrom(fix, "Before each commit, print:", "```\n\n");
		expect(commit).toContain("git status --porcelain --untracked-files=all");
		expect(commit).not.toContain("git diff --name-only");
		expect(fix).toContain(
			"Put each temporary script, log and report outside `WORKTREE`, because a gate run stops on an untracked file.",
		);
	});
});

describe("a frozen install starts with no node_modules", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const prune =
		"First delete the `node_modules` folder next to each `package.json` that git tracks, with `cd <WORKTREE> && git ls-files -z ':(glob)**/package.json' | while IFS= read -r -d '' file; do rm -rf -- \"$(dirname -- \"$file\")/node_modules\"; done`. A frozen install keeps a package that the lockfile no longer lists, and CI installs into a new checkout.";

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
		],
	])("%s deletes node_modules before the frozen install", (_, text) => {
		expect(text).toContain(prune);
		expect(text.indexOf(prune)).toBeGreaterThan(
			text.indexOf("`bun install --frozen-lockfile`"),
		);
		expect(text).not.toContain(
			"A `node_modules` of an earlier install can pass a gate that fails in CI.",
		);
	});
});

describe("a failed gh is never a run with no PR", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const ruleStart = "The run has no PR only when gh exits 1 and";
	const noPrMessages = [
		'No pull requests found for branch "main"',
		'no pull requests found for branch "astack-hunt-no-pr-branch"',
	];
	const failures = [
		"could not determine current branch: failed to run git: fatal: not on any branch",
		"HTTP 401: Bad credentials (https://api.github.com/graphql)",
		"error connecting to api.github.com",
	];

	function isNoPr(rule: string, message: string): boolean {
		const matcher = /`([^`]+)`/.exec(rule)?.[1];
		if (matcher === undefined) throw new Error(`no matcher in "${rule}"`);
		if (!matcher.startsWith("grep ")) return message.includes(matcher);
		return (
			Bun.spawnSync(["/bin/bash", "-c", matcher], {
				stdin: new TextEncoder().encode(`${message}\n`),
				stdout: "ignore",
				stderr: "ignore",
			}).exitCode === 0
		);
	}

	afterAll(removeWorlds);

	test("the command and the manual rule of the setup seed classify each gh answer the same way", () => {
		const rule = noPrRule;
		const messages = [...noPrMessages, ...failures];
		const world = createWorld();
		const byCommand = messages.map((message, at) => {
			script(world, at + 1, { code: 1, out: "", err: `${message}\n` });
			return astack(world, []).code === 3;
		});
		const byRule = messages.map((message) => isNoPr(rule, message));
		expect(byCommand).toEqual(byRule);
		expect(byRule).toContain(true);
		expect(byRule).toContain(false);
	});

	test("SKILL.md leaves the no-PR rule to the command, and stops the run on each other failure", () => {
		expect(engineSkill).not.toContain(ruleStart);
		expect(engineSkill).not.toContain("grep -qi");
		expect(engineSkill).toContain(
			"Each other failure of a `gh pr view` of the run stops the run with principled incompletion, and the run prints the error of gh.",
		);
		expect(engineSkill).not.toContain("When it finds no PR, the run has no PR");
		expect(engineSkill).not.toContain("that `gh pr view --json number` finds");
	});

	const manualHeadCheck =
		"The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.";
	const noPrRule =
		"There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.";
	const seed =
		"marketplace/plugins/astack/skills/setup/issue-tracker-github.md";
	const ownForms: readonly (readonly [string, string])[] = [
		[
			`${engine}/SKILL.md`,
			"The engine holds the run form of both rules. Its head check calls the command that tests/astack/pr-head.test.ts pins, and the tests above pin the rest.",
		],
		[
			`${engine}/references/gate.md`,
			"The gate run does the head check of SKILL.md again.",
		],
		[
			"marketplace/plugins/astack/README.md",
			"It says what the merge guard reads, and has no step that acts on a PR.",
		],
		[
			seed,
			"Setup copies this seed into a product repo, where an agent can run with no astack. So it keeps the manual head check and the no-PR rule.",
		],
	];
	const noPrListRule =
		"There is no PR only when `gh pr list` exits 0 and prints no PR. Each other failure of `gh pr list` is an error, not a missing PR. Print the error of gh, and stop.";
	const prRead =
		/\bgh pr (?:view|list|status|checks|diff)\b|\bgh api\b[^\n]*\bpulls\b|\bheadRefOid\b/;
	const lookups: readonly (readonly [RegExp, string])[] = [
		[/\bgh pr (?:view|status)\b/, failureLine],
		[/\bgh pr list\b/, noPrListRule],
	];
	const { describesOnly } = scanRows;
	const exempt = new Set(exemptPaths(root));
	const scanned = [
		...markdownUnder("marketplace/plugins/astack").filter(
			(path) => !exempt.has(path),
		),
		...markdownUnder("rules"),
		...profilePaths,
	].filter((path) => !ownForms.some(([own]) => own === path));
	const readLines = (path: string, text = read(path)): string[] =>
		text
			.split("\n")
			.filter((line) => prRead.test(line))
			.filter(
				(line) =>
					!describesOnly.some(
						(row) => row.path === path && line.includes(row.line),
					),
			);
	const prReaders = scanned.filter((path) => readLines(path).length > 0);
	const holds = (text: string, rule: string): boolean =>
		rule === failureLine
			? text.includes(headLine) && text.indexOf(rule) > text.indexOf(headLine)
			: text.includes(rule);
	const missingRules = (path: string, text = read(path)): string[] => [
		...new Set(
			readLines(path, text).flatMap((line) =>
				lookups
					.filter(([lookup, rule]) => lookup.test(line) && !holds(text, rule))
					.map(([, rule]) => rule),
			),
		),
	];
	const resume = "marketplace/plugins/astack/skills/mode/references/resume.md";
	const triage =
		"marketplace/plugins/astack/skills/mode/references/comments-triage.md";
	const createPr =
		"marketplace/plugins/astack/skills/mode/references/create-pr.md";

	test("the setup seed keeps the manual head check, and its no-PR rule takes only the no-PR message of gh as no PR", () => {
		expect(
			[manualHeadCheck, noPrRule].filter((rule) => !read(seed).includes(rule)),
		).toEqual([]);
		expect(
			noPrMessages.filter((message) => !isNoPr(noPrRule, message)),
		).toEqual([]);
		expect(failures.filter((message) => isNoPr(noPrRule, message))).toEqual([]);
	});

	test("[control:ph-line] each astack text and profile that reads a PR with gh runs the head check command, and none keeps the manual check", () => {
		expect(
			prReaders.filter(
				(path) =>
					!read(path).includes(headLine) ||
					read(path).includes(manualHeadCheck),
			),
		).toEqual([]);
	});

	test("[control:ph-later] each astack text and profile that looks up a PR with gh view holds the failure line after the head line, and none keeps the old no-PR rule", () => {
		expect(
			prReaders.filter(
				(path) =>
					missingRules(path).length > 0 || read(path).includes(noPrRule),
			),
		).toEqual([]);
		const without = read(resume).replace(failureLine, "");
		expect(missingRules(resume, without)).toEqual([failureLine]);
		expect(missingRules(resume, `${failureLine}\n${without}`)).toEqual([
			failureLine,
		]);
	});

	test("[control:ph-list] create-pr keeps the list rule, and the scan finds a lookup through gh pr list that reads an empty list as no PR", () => {
		expect(read(createPr)).toContain(noPrListRule);
		expect(
			missingRules(
				triage,
				read(triage)
					.replace(
						"`gh pr view --json number,url,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`",
						"`gh pr list --head <branch> --state open --json number,url,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`",
					)
					.replace(failureLine, "When the list is empty, there is no PR."),
			),
		).toEqual([noPrListRule]);
	});

	test("each row of the reason table still names a line", () => {
		expect(
			describesOnly.filter((row) => !read(row.path).includes(row.line)),
		).toEqual([]);
	});

	test("the scan finds a text that runs gh pr view, a text that runs gh pr list and a text that creates a PR through gh api, and each own form still reads a PR", () => {
		expect(prReaders).toEqual(
			expect.arrayContaining([
				resume,
				createPr,
				"marketplace/plugins/astack/skills/file-pr/SKILL.md",
			]),
		);
		expect(ownForms.filter(([path]) => !prRead.test(read(path)))).toEqual([]);
	});
});

describe("the ready report names what the merge starts", () => {
	const shipping = read(
		"marketplace/plugins/astack/skills/mode/playbooks/shipping.md",
	);
	const readyRow = paragraphStarting(
		read("marketplace/plugins/astack/skills/mode/SKILL.md"),
		"| The open PR is green and clean |",
	);
	const readStarted = "Read what the merge starts";
	const holdDeploy =
		"Land a deployment only when the owner's words in this turn name that release or deployment.";

	test("the ready report reads the started workflows before it asks for the merge, names each publish or deploy job, and a deploy still needs the owner's words", () => {
		expect(readyRow.indexOf(readStarted)).toBeGreaterThan(-1);
		expect(readyRow.indexOf(readStarted)).toBeLessThan(
			readyRow.indexOf("Report it as ready to merge"),
		);
		expect(readyRow).toContain(
			"name each publish or deploy job, or say that there is none",
		);
		const section = shipping.indexOf("\n## What the merge starts\n");
		expect(section).toBeGreaterThan(-1);
		expect(section).toBeLessThan(shipping.indexOf("\n## Steps\n"));
		expect(shipping).toContain(holdDeploy);
	});
});

describe("each diff runs against the fetched base", () => {
	const gitOnBase = (text: string): string[] =>
		[...text.matchAll(/`git (?:diff|merge-base|rev-parse|log|merge)\b[^`]*`/g)]
			.map((match) => match[0])
			.filter((command) =>
				/(?<![\w/.-])(?:<base>|main|master|\$\{?BASE\}?)(?![\w-])/.test(
					command,
				),
			);
	const texts = [
		...markdownUnder("marketplace/plugins/astack"),
		...markdownUnder("rules"),
		...profilePaths,
	];

	test("the scan finds a diff, a merge base or a revision of the local base, and passes the fetched base", () => {
		expect(
			gitOnBase(
				"Print `git rev-parse <base>`, read `git diff main...HEAD`, and `git merge-base $BASE HEAD`.",
			),
		).toEqual([
			"`git rev-parse <base>`",
			"`git diff main...HEAD`",
			"`git merge-base $BASE HEAD`",
		]);
		expect(
			gitOnBase(
				"Read `git diff origin/<base>...HEAD`, `git rev-parse origin/main` and `git log --oneline HEAD..origin/<base>`.",
			),
		).toEqual([]);
	});

	test.each([...texts, "templates/pr-review-hardening.stub.SKILL.md"])(
		"%s runs no git command against the local base branch, which can be behind",
		(path) => {
			expect(gitOnBase(read(path))).toEqual([]);
		},
	);
});

describe("the node_modules delete in a checkout that the run did not create", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const ask =
		"A dev server or another session can use the `node_modules` folders of a checkout that the run did not create, such as the current checkout. So before the first delete in such a checkout, print `WORKTREE` and ask the owner. Without a yes, stop with principled incompletion. The yes holds for each later install of the run.";

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
		],
	])("%s asks the owner before the first delete", (_, text) => {
		expect(text).toContain(ask);
		expect(text).not.toContain("the current checkout included");
	});

	test("the decide list of SKILL.md names the delete that the owner refused", () => {
		expect(
			sentencesFrom(engineSkill, "## Decide", "## After the stop"),
		).toContain(
			"  - The owner does not allow the delete of `node_modules` in a checkout that the run did not create.",
		);
	});
});

describe("when_changed reads both paths of a rename", () => {
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const listed = "`git diff --name-only --no-renames <BASE_SHA>...HEAD`";
	const reason =
		"CI splits a rename into a delete and an add, so `--no-renames` lists both paths.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
	])("%s lists the old path of a rename", (_, text) => {
		expect(text).toContain(listed);
		expect(text).toContain(reason);
		expect(text).toContain(
			"`git diff --name-only --no-renames <BASE_SHA>...HEAD -- ':(glob)<glob>' ':(glob,exclude)<glob without its !>'`",
		);
		expect(text).not.toContain("`git diff --name-only <BASE_SHA>...HEAD");
	});
});

describe("a PR that changes CI", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const ciPins = read(`${engine}/references/ci-pins.md`);
	const ciPinsPointer =
		"When the exit code is not 0, or when the diff changes a CI file, read `references/ci-pins.md` for what each exit code means.";
	const reachEngine = (preflight: string): string =>
		preflight.replace(
			ciPinsPointer,
			sectionLines(ciPins, "What each exit code means").join(" "),
		);
	const ciCheck = [
		"`astack check ci-pins --base <BASE_SHA>`, and print its output and its exit code. It exits 3 when the diff changes only paths under `.github/workflows/` or `.github/actions/`, or in the folder of a local action that a workflow uses. For exit 3, each tool version that CI sets up stays the same, and the last line starts with `ci_proof:`. The check reads the tools of the setup steps, the runner, the container and service images and the ref of a remote reusable workflow. It does not read a tool that a `run` step or a script installs, so the review examines such a change. Exit 3 also permits the manifest that `check proof --base` reads, its declared `ratification.proofRecord` files under `formal/` and each deleted manifest. The committed manifest must pass the full schema, and its base must be an ancestor of the actual merge base. Each record must be non-executable UTF-8 Markdown with all required sections and references. Records cannot also supply ADRs, glossary, implementation, witness, matrix, model, or negative inputs. These records grant no proof result. The current proof gate stays blocking in every mode. For exit 3 with another changed file or a failed proof record, the last line starts with `ci_mixed:`. A red gate can then come from that file, so each gate blocks. A version file is a file that a workflow or an action names in a `-version-file` input. The check exits 1 when the diff changes a version file and the version that the setup action reads from it changes. It also exits 1 when it cannot read an exact version from a version file at `BASE_SHA` or at `HEAD`. It also exits 1 when the diff changes CI and a tool version that CI sets up, or when it cannot read such a version.",
		"When it exits 0 and its last line starts with `ok:`, the run goes on. When it exits 3 and its last line starts with `ci_proof:`, the run goes on in mode `ci_proof`. When it exits 3 and its last line starts with `ci_mixed:`, the run goes on in mode `ci_mixed`. Otherwise stop with principled incompletion. With no node and no bun, the launcher prints a note and exits 0, so the exit code alone is not a pass.",
		"Another change to a version file, such as a new dependency in `package.json`, gets the gates of the run.",
		"The gates mirror the CI that astack apply read, and CI runs the workflows of the PR, so only CI can prove a CI change.",
		"In mode `ci_proof` or `ci_mixed`, the run reviews, fixes and gates the PR as usual.",
	];
	const recorded =
		"It records the mode in the ledger, in each `GATE_SUMMARY` and in each PR comment.";
	const exitOne = /\bwhen it does not exit 0\b/i;
	const everyVersionFile =
		"`-version-file` input, stop with principled incompletion";

	test.each([
		[
			"the preflight of SKILL.md, with the reference that it points to",
			reachEngine(sentencesFrom(engineSkill, "## Preflight", "## Baseline")),
		],
	])("%s stops, because the gates mirror the CI that apply read", (_, text) => {
		for (const sentence of ciCheck) expect(text).toContain(sentence);
		expect(text).not.toContain(everyVersionFile);
	});

	test("the preflight of SKILL.md points to the reference of the exit codes", () => {
		expect(sentencesFrom(engineSkill, "## Preflight", "## Baseline")).toContain(
			ciPinsPointer,
		);
		expect(engineSkill).toContain("- `references/ci-pins.md`: ");
	});

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
			recorded,
		],
	])(
		"%s goes on in mode ci_proof only on exit 3 with a ci_proof: last line, and records the mode",
		(_, text, record) => {
			expect(text).not.toMatch(exitOne);
			expect(text).toContain(record);
			expect(text).toContain("Each run also sets `mode` to the mode of step ");
			expect(text).toContain(
				"at this load, and to the mode of each later CI check.",
			);
		},
	);

	test("the reviewers of mode ci_proof learn that only they examine the CI files and each tool that a run step installs, in the engine", () => {
		const review = sentencesFrom(
			read(`${engine}/references/review.md`),
			"Every reviewer prompt carries:",
			"## The ledger",
		);
		for (const sentence of [
			"in mode `ci_proof` or `ci_mixed`, that the gates mirror the CI of the base, so only the review examines the CI files before CI runs.",
			"`astack check ci-pins` does not read a tool that a `run` step or a script installs, so a change to such an install is a blocking finding;",
		])
			expect(review).toContain(sentence);
	});

	test("the gate run takes the mode of its own CI check, and the ledger and the PR comment hold it", () => {
		expect(
			sentencesFrom(
				read(`${engine}/references/review.md`),
				"## The ledger",
				"## Review-bot threads",
			),
		).toContain(
			"The ledger also holds `mode`, the mode of the last CI check of the run, `standard`, `ci_proof` or `ci_mixed`.",
		);
		expect(gate).toContain(
			"- the mode, and each advisory gate of mode `ci_proof` with its proof;",
		);
		expect(sentencesFrom(gate, "## Run it", "## Green")).toContain(
			"Do the CI check of the preflight again. Its result sets the mode of the run.",
		);
	});

	const advisory = [
		"In mode `ci_proof`, a red gate is advisory when the run shows that the CI change of the PR makes it red.",
		"The proof names the changed line of the CI diff that the gate does not mirror.",
		"It also holds a run of the gate command as the CI of the PR runs it, and that run exits 0.",
		"The run gives the command what the changed line gives, such as an `env` value.",
		"When the PR removes a CI step that runs a gate command, the gates no longer mirror CI, so the profile must change.",
		"Then stop with principled incompletion, and name the step.",
		"Print the gate as `<NAME>_EXIT=<code> ADVISORY_CI_PROOF`, with the proof.",
		"Each other red gate blocks, as in the mode `standard`.",
		"CI on `PR_HEAD` still gates the merge.",
	];

	test.each([["the green gate of references/gate.md", gate]])(
		"%s makes a red gate of mode ci_proof advisory only with its proof",
		(_, text) => {
			for (const sentence of advisory) expect(text).toContain(sentence);
			expect(text).not.toContain("git grep");
		},
	);

	test("[control:ci-proof-current] in mode ci_proof the green gate keeps the current proof gate blocking, so no proof result becomes advisory", () => {
		const advisoryRule = paragraphStarting(
			gate,
			"In mode `ci_proof`, a red gate is advisory",
		);
		expect(advisoryRule).toContain(
			"The required current proof gate stays blocking. No attribution makes a failed proof advisory.",
		);
	});

	const readBack = [
		"`gh pr view <n> --json headRefOid`, then `gh pr checks <n> --required --json name,state,bucket,event,workflow,link`, then",
		"A `pull_request` run takes its workflows from the merge of the PR head into the base, so it ran the CI of the PR.",
		"When a required check is still `pending`, wait with `gh pr checks <n> --required --watch`. Then read again.",
		"at least one required check",
		"the `bucket` `pass` and the `event` `pull_request`",
		"both reads of `headrefoid` give `pr_head`",
	];

	test.each([
		[
			"the CI read-back of references/gate.md",
			sentencesFrom(gate, "## CI read-back", "## Unclean stop"),
		],
	])(
		"%s merges a PR of mode ci_proof only when each required check of PR_HEAD passes on a pull_request run",
		(_, text) => {
			for (const part of readBack)
				expect(
					part === part.toLowerCase() ? text.toLowerCase() : text,
				).toContain(part);
		},
	);

	test("a clean stop of mode ci_proof needs a CI read-back that passes, whatever merge.after_clean_stop says, and the /goal ties ADVISORY_CI_PROOF to that mode", () => {
		expect(sentencesFrom(gate, "## CI read-back", "## Unclean stop")).toContain(
			"In both modes, do the read-back after the push of the decision step of each iteration that is clean otherwise, and again before a merge. A clean stop and a merge each need it to pass.",
		);
		expect(sentencesFrom(gate, "## CI read-back", "## Unclean stop")).toContain(
			"A run without a PR has no CI run to read, so its `ciReadBack` is `not_run`, and it stops with principled incompletion.",
		);
		expect(
			sentencesFrom(
				read(`${engine}/references/profile.md`),
				"## merge",
				"## Draft a profile",
			),
		).toContain(
			"In mode `ci_proof` or `ci_mixed`, the run also does the CI read-back of `references/gate.md` before a clean stop and before a merge. This holds whatever `after_clean_stop` and `conditions` say.",
		);
		expect(paragraphStarting(gate, "/goal Run")).toContain(
			"It shows every gate exit 0, or ADVISORY_CI_PROOF only in mode ci_proof.",
		);
	});

	test("only a pull_request run proves the CI change, and the final report names the mode, each advisory gate and the read-back", () => {
		expect(sentencesFrom(gate, "## CI read-back", "## Unclean stop")).toContain(
			"A `pull_request_target` run takes the workflows of the base, so it proves nothing for the CI change.",
		);
		expect(sentencesFrom(gate, "## CI read-back", "## Unclean stop")).toContain(
			"When a condition fails, the read-back fails. Then never merge, and stop with principled incompletion.",
		);
		expect(paragraphStarting(gate, "1. How the run stopped:")).toContain(
			"Also the mode of the run. In mode `ci_proof`, also each advisory gate with its proof. In mode `ci_proof` or `ci_mixed`, also the result of the CI read-back.",
		);
	});

	test("the engine merges in mode ci_proof only after the CI read-back", () => {
		expect(
			sentencesFrom(engineSkill, "## After the stop", "## References"),
		).toContain(
			"In mode `ci_proof` or `ci_mixed`, also do the CI read-back of `references/gate.md`, and merge only when it passes.",
		);
	});

	test("a finding whose fix needs a CI edit is out-of-scope in mode ci_proof, because a fix never edits CI", () => {
		const fence = sentencesFrom(
			read(`${engine}/references/fix.md`),
			"## Fix fence",
			"## Files that astack writes",
		);
		expect(fence).toContain(
			"In mode `ci_proof` or `ci_mixed`, the diff holds CI files, and the reviewers review them like each other file. A fix never edits CI, also in those modes, and `forbidden.paths` still holds. So a finding whose fix needs a CI edit is `out-of-scope`.",
		);
		expect(fence).toContain(
			"A CI file is each path that `astack check ci-pins` prints with `the PR changes this CI file.`, also a script in the folder of a local action.",
		);
	});

	test("[control:ci-mixed-gates] the preflight takes exit 3 with a ci_mixed: last line, a clean stop of that mode needs ciReadBack: pass, and no gate of the mode is advisory", () => {
		expect(sentencesFrom(engineSkill, "## Preflight", "## Baseline")).toContain(
			"When it exits 3 and its last line starts with `ci_mixed:`, the run goes on in mode `ci_mixed`.",
		);
		expect(
			paragraphStarting(
				sentencesFrom(engineSkill, "## Decide", "## After the stop"),
				"The iteration is clean when",
			),
		).toContain(
			"In mode `ci_proof` or `ci_mixed`, a clean stop also needs `ciReadBack: pass` in the `GATE_SUMMARY`, whatever `merge.after_clean_stop` says.",
		);
		const green = sentencesFrom(gate, "## Green", "## Iteration output");
		expect(green).toContain(
			"In mode `ci_mixed`, the PR also changes a file outside CI, so a red gate can come from that file. No gate of that mode is advisory, and each red gate blocks.",
		);
		expect(green).toContain(
			"every gate that ran exited 0, or is an advisory gate of mode `ci_proof`.",
		);
		expect(
			sentencesFrom(engineSkill, "## After the stop", "## References"),
		).toContain(
			"In mode `ci_proof` or `ci_mixed`, also do the CI read-back of `references/gate.md`, and merge only when it passes.",
		);
	});

	test("each gate run of the engine does the CI check again", () => {
		expect(sentencesFrom(gate, "## Run it", "## Green")).toContain(
			"Do the CI check of the preflight again. Its result sets the mode of the run.",
		);
	});
});

describe("the review range and the reviewer set", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const review = read(`${engine}/references/review.md`);
	const preflight = sentencesFrom(engineSkill, "## Preflight", "## Baseline");

	test("the preflight runs astack review base before it loads the ledger, and a delta run reviews only the delta", () => {
		const base = preflight.indexOf("Run `astack review base --head HEAD`");
		expect(base).toBeGreaterThan(-1);
		expect(base).toBeLessThan(
			preflight.indexOf("Load the ledger once per run"),
		);
		const delta = sentencesFrom(
			review,
			"## Delta run",
			"## Review-bot threads",
		);
		for (const sentence of [
			"Exit 0 with a `delta: <sha>` last line makes a delta run, and `DELTA_SHA` is that sha.",
			"Exit 3 with a `full:` last line, or exit 1, makes a full run.",
			"Exit 2 stops with principled incompletion.",
			"In a delta run, the reviewers get `git -C <WORKTREE> diff <DELTA_SHA> <HEAD>`, and an empty delta launches no reviewer.",
			"The run keeps the ledger, the comment gate and each gate.",
		])
			expect(delta).toContain(sentence);
	});

	test("[control:review-rung] the rung of the last change-proof gate sizes the applicable set, and R0 launches one agent", () => {
		const launch = sentencesFrom(
			review,
			"## Launch the reviewers",
			"## Additional astack reviewers",
		);
		for (const sentence of [
			"With `applicable`, the rung sizes the set. Read the `rung: R<n>` line of the last change-proof gate output. With no such line, a diff of Markdown files only is R0, and each other diff is R1.",
			"At R0, launch one agent: `comment-analyzer` when `reviewers.agents` lists it, else the first agent that it lists.",
			"From R1, launch the `applicable` set.",
			"An entry of `reviewers.extra` with `when: rung R<n>` applies from that rung up.",
		])
			expect(launch).toContain(sentence);
	});

	test("[control:rung-floor] a full or delta run with 0 reviewer launches over a review range that is not empty never stops clean", () => {
		expect(
			paragraphStarting(
				sentencesFrom(engineSkill, "## Decide", "## After the stop"),
				"The iteration is clean when",
			),
		).toContain(
			"A clean stop also needs `reviewerLaunches` above 0, or an empty `reviewRange`.",
		);
		expect(
			paragraphStarting(read(`${engine}/references/gate.md`), "/goal Run"),
		).toContain("It shows reviewerLaunches above 0, or an empty reviewRange.");
	});

	test("the run reads the review checklist only for a diff of the profile, of CI, of a package.json or of a gate script", () => {
		const area =
			"the profile, a file under `.github/`, a `package.json` or a script that a gate runs";
		expect(stepWith(engineSkill, "Launch the reviewers")).toContain(
			`\`references/review.md\` says how, and when the review checklist \`\${CLAUDE_SKILL_DIR}/references/checklist.md\` applies.`,
		);
		expect(
			sentencesFrom(review, "## Checklist pass", "## comment-analyzer"),
		).toContain(
			`When the diff changes ${area}, go through the review checklist, \`references/checklist.md\`.`,
		);
	});

	test("the review record of the PR is written only by astack review, and the stop adds its decision and launches", () => {
		const growth = sentencesFrom(review, "## Review growth", "## Delta run");
		for (const sentence of [
			"Only `astack review` writes it.",
			"run `astack review record --base <BASE_SHA> --head <REVIEWED_HEAD>`.",
			"run it again with `--decision <decision> --launches <n>`.",
			"When it exits 1, the record cannot be read. Report an unavailable growth check with the error, and never create a new record.",
		])
			expect(growth).toContain(sentence);
		expect(growth).not.toContain("Use the merge base of `BASE_SHA`");
	});
});

describe("the converge iterations and the deferred hold", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const review = read(`${engine}/references/review.md`);
	const gate = read(`${engine}/references/gate.md`);
	const decide = sentencesFrom(engineSkill, "## Decide", "## After the stop");

	test("[control:defer-hold] stop_clean needs 0 open deferred entries, a deferred entry stays open in each later run until each iteration reproduces it again and finds it fixed, and no merge follows stop_converged", () => {
		expect(paragraphStarting(decide, "The iteration is clean when")).toContain(
			"A clean stop also needs `deferredFindings` to be 0.",
		);
		expect(paragraphStarting(decide, "- `stop_converged`:")).toBe(
			"- `stop_converged`: the iteration is clean apart from open `deferred` entries, and `n >= iterations.min`. No merge follows it.",
		);
		const converge = sentencesFrom(
			review,
			"## Converge",
			"## Review-bot threads",
		);
		for (const sentence of [
			"With `converge: true`, an iteration after a fix commit reviews `<prior REVIEWED_HEAD>..<HEAD>`, with the ids of the open, `fixed` and `deferred` entries.",
			"A High or Important reviewer finding that recurs after one fix attempt becomes `deferred`, and the run goes on. A recurring Critical or Blocker finding still ends in `stop_recurring`.",
			"A gate or comment finding has no severity, so it never becomes `deferred`.",
			"A `deferred` entry carries into each later run, whatever `ledger.carry_over` says. Each iteration reproduces it again. It becomes `fixed` when the failure does not occur at `REVIEWED_HEAD`.",
		])
			expect(converge).toContain(sentence);
		expect(
			sentencesFrom(review, "## Tell each reviewer", "## Checklist pass"),
		).toContain("- the ledger's `deferred` entries, to check again;");
		expect(stepWith(engineSkill, "Triage.")).toContain(
			"Reproduce it, then classify it as blocking, advisory, out-of-scope, recurring or deferred.",
		);
		expect(gate).toContain(
			"decision: continue | stop_clean | stop_converged | stop_recurring | stop_principled_incompletion",
		);
		expect(paragraphStarting(gate, "/goal Run")).toContain(
			"Also stop on stop_converged, stop_recurring or stop_principled_incompletion, with the reason printed. No merge follows stop_converged.",
		);
	});
});

describe("a clean iteration commits no fix", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const unseen =
		"An iteration that commits a fix in step 4 is not clean, because no reviewer saw that commit.";

	test.each([
		[
			"the decision of SKILL.md",
			sentencesFrom(engineSkill, "## Decide", "## After the stop"),
		],
	])("%s never stops clean on a fix that no reviewer saw", (_, text) => {
		expect(text).toContain(unseen);
	});

	const reviewedHead =
		"Print `REVIEWED_HEAD` as the output of `git rev-parse HEAD`. It is the `<HEAD>` of the diff that the reviewers get.";

	test.each([
		[
			"the review step of SKILL.md",
			stepWith(engineSkill, "Launch the reviewers"),
		],
	])("%s prints the head that the reviewers get", (_, step) => {
		expect(step).toContain(reviewedHead);
		expect(step.indexOf(reviewedHead)).toBeLessThan(step.indexOf("Launch"));
	});

	const cleanHead =
		"A clean stop also needs `REVIEWED_HEAD` to equal the output of `git rev-parse HEAD` after the last gate run. No reviewer saw a commit that comes after the review, such as the merge of a moved base in a gate run.";

	test.each([
		[
			"the decision of SKILL.md",
			sentencesFrom(engineSkill, "## Decide", "## After the stop"),
		],
	])(
		"%s stops clean only on the head that the reviewers saw, whatever commit came after them",
		(_, text) => {
			expect(text).toContain(cleanHead);
		},
	);
});

test.each([["the engine", read(`${engine}/references/gate.md`)]])(
	"[control:proof-fallback-marker] %s requires exit 0 and the proof success line together",
	(_name, text) => {
		expect(text).toMatch(
			/(?:accepts|require)[^\n]*exit 0[^\n]*final (?:stdout )?line[^\n]*`ok: proof `/,
		);
	},
);

describe("the proof of a clean stop", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const decide = sentencesFrom(engineSkill, "## Decide", "## After the stop");
	const conditions = [
		...sentencesOf(paragraphStarting(decide, "The iteration is clean when")),
		paragraphStarting(decide, "- `stop_clean`:"),
	];
	const summaryFields = sentencesFrom(gate, "GATE_SUMMARY\n", "\n```")
		.split("\n")
		.flatMap((line) => /^(\w+):/.exec(line)?.[1] ?? []);
	const goal = paragraphStarting(gate, "/goal Run");
	const reviewedHead = {
		fields: ["reviewedHead", "headSha"],
		goal: ["reviewedHead equal to headSha"],
	};
	const prHead = {
		fields: ["prHead", "headSha"],
		goal: ["prHead equal to headSha or none"],
	};
	type Proof = {
		readonly condition: string;
		readonly fields: readonly string[];
		readonly goal: readonly string[];
	};
	const proofs: readonly Proof[] = [
		{
			condition: "The iteration is clean when the gate is green",
			fields: ["METRICS_EXIT", "gateFindings", "gitStatusChangedByGate"],
			goal: [
				"every gate exit 0",
				"If metrics ran, that GATE_SUMMARY also shows METRICS_EXIT 0",
				"gitStatusChangedByGate false",
			],
		},
		{
			condition: "That is zero blocking reviewer or checklist findings",
			fields: [
				"blockingReviewerFindings",
				"commentGateFindings",
				"gateFindings",
			],
			goal: ["zero blocking reviewer, comment-gate and gate findings"],
		},
		{
			condition: "An iteration that commits a fix in step 4 is not clean",
			...reviewedHead,
		},
		{
			condition: "A clean stop also needs `REVIEWED_HEAD`",
			...reviewedHead,
		},
		{
			condition: "No reviewer saw a commit that comes after the review",
			...reviewedHead,
		},
		{
			condition:
				"A clean stop also needs a diff from the base that is not empty",
			fields: ["diffFiles"],
			goal: ["diffFiles above 0"],
		},
		{
			condition: "In a run with a PR, a clean stop also needs `PR_HEAD`",
			...prHead,
		},
		{
			condition:
				"so a review or a gate run of an unpushed commit proves nothing",
			...prHead,
		},
		{
			condition:
				"a clean stop also needs that mode in the `mode` of the `GATE_SUMMARY`",
			fields: ["mode"],
			goal: [
				"If the CI check gave mode ci_proof or ci_mixed, that GATE_SUMMARY also shows that mode and ciReadBack pass.",
			],
		},
		{
			condition:
				"a clean stop also needs `ciReadBack: pass` in the `GATE_SUMMARY`",
			fields: ["ciReadBack"],
			goal: ["that GATE_SUMMARY also shows that mode and ciReadBack pass"],
		},
		{
			condition: "so a run of either mode without a PR cannot stop clean",
			fields: ["ciReadBack", "prHead"],
			goal: ["that mode and ciReadBack pass", "prHead equal to headSha"],
		},
		{
			condition:
				"A clean stop also needs `reviewerLaunches` above 0, or an empty `reviewRange`",
			fields: ["reviewerLaunches", "reviewRange"],
			goal: ["reviewerLaunches above 0, or an empty reviewRange"],
		},
		{
			condition: "A clean stop also needs `deferredFindings` to be 0",
			fields: ["deferredFindings"],
			goal: ["deferredFindings 0"],
		},
		{
			condition: "- `stop_clean`: the iteration is clean and",
			fields: ["decision"],
			goal: [
				"shows decision stop_clean after at least <iterations.min> iterations",
			],
		},
	];
	const definitions: Readonly<Record<string, string>> = {
		METRICS_EXIT: "Print `METRICS_CMD`, `METRICS_EXIT` and the raw JSON.",
		blockingReviewerFindings:
			"`blockingReviewerFindings` is the number of blocking reviewer and checklist findings of the iteration.",
		commentGateFindings:
			"`commentGateFindings` is the number of its findings `C<n>.<k>`, and `gateFindings` is the number of its findings `G<n>.<k>`.",
		gateFindings:
			"`commentGateFindings` is the number of its findings `C<n>.<k>`, and `gateFindings` is the number of its findings `G<n>.<k>`.",
		gitStatusChangedByGate:
			"`gitStatusChangedByGate` is true when `GIT_STATUS_AFTER_GATE` shows a tracked file that the restore did not restore.",
		diffFiles:
			"`diffFiles` is the number of paths that `git diff --name-only --no-renames <BASE_SHA>...HEAD` prints after the last gate run. A clean stop needs a value above 0.",
		reviewedHead:
			"`reviewedHead` is the `REVIEWED_HEAD` of the review step. `headSha` is the output of `git rev-parse HEAD` after the last gate run. A clean stop needs the two values to be equal.",
		headSha:
			"`reviewedHead` is the `REVIEWED_HEAD` of the review step. `headSha` is the output of `git rev-parse HEAD` after the last gate run. A clean stop needs the two values to be equal.",
		prHead:
			"`prHead` is the `PR_HEAD` of the last head check, after the push of the decision step, or `none` in a run without a PR. A clean stop in a run with a PR needs it to equal `headSha`.",
		decision:
			"decision: continue | stop_clean | stop_converged | stop_recurring | stop_principled_incompletion",
		deferredFindings:
			"`deferredFindings` is the number of open `deferred` entries of the ledger.",
		mode: "`mode` is the mode of the last CI check of the run.",
		reviewRange:
			"`reviewRange` is the range that the reviewers got, `<BASE_SHA>...<HEAD>` in a full run or `<DELTA_SHA>..<HEAD>` in a delta run.",
		reviewerLaunches:
			"`reviewerLaunches` is the number of reviewers that the iteration launched, the extra reviewers included.",
		ciReadBack:
			"`ciReadBack` is the result of the CI read-back of the iteration, `pass` or `fail`, or `not_run` when the iteration did no read-back.",
	};

	test("the stop_clean bullet of the engine holds only the conditions that the proof rows name", () => {
		expect(paragraphStarting(decide, "- `stop_clean`:")).toBe(
			"- `stop_clean`: the iteration is clean and `n >= iterations.min`.",
		);
	});

	test("each field that a condition of a clean stop needs has its pinned definition in gate.md", () => {
		const fields = [...new Set(proofs.flatMap((proof) => proof.fields))];
		expect(Object.keys(definitions).sort()).toEqual([...fields].sort());
		expect(
			fields.filter((field) => !gate.includes(definitions[field] ?? field)),
		).toEqual([]);
	});

	test("each condition of a clean stop has one proof row, and each row names one condition", () => {
		const matches = (condition: string, proof: Proof) =>
			condition.includes(proof.condition);
		expect(
			conditions.filter(
				(condition) =>
					proofs.filter((proof) => matches(condition, proof)).length !== 1,
			),
		).toEqual([]);
		expect(
			proofs
				.filter(
					(proof) =>
						conditions.filter((condition) => matches(condition, proof))
							.length !== 1,
				)
				.map((proof) => proof.condition),
		).toEqual([]);
	});

	test("GATE_SUMMARY prints each field that a condition of a clean stop needs", () => {
		expect(
			proofs.flatMap((proof) =>
				proof.fields.filter((field) => !summaryFields.includes(field)),
			),
		).toEqual([]);
	});

	test("the /goal condition asks for the metrics output only when metrics ran, as the green gate does, because a run with metrics: null prints no METRICS_EXIT", () => {
		expect(paragraphStarting(gate, "3. If `metrics` is set")).toContain(
			"Without `metrics`, print `METRICS=UNAVAILABLE`.",
		);
		expect(paragraphStarting(gate, "- if metrics ran,")).toContain(
			"`METRICS_EXIT` is 0",
		);
		expect(
			sentencesOf(goal).filter(
				(sentence) =>
					/METRICS_EXIT|never_increase/.test(sentence) &&
					!sentence.startsWith("If metrics ran,"),
			),
		).toEqual([]);
	});

	test("the /goal condition checks each condition of a clean stop", () => {
		expect(
			proofs.flatMap((proof) =>
				proof.goal.filter((clause) => !goal.includes(clause)),
			),
		).toEqual([]);
	});
});

describe("the ledger keeps the evidence of the whole run", () => {
	const blobCommand = "git rev-parse HEAD:<file>";
	const deletedBlob =
		"When `git rev-parse HEAD:<file>` fails because `HEAD` holds no such file, such as a file that the branch deletes, the blob is `deleted`.";
	const blobTexts: readonly (readonly [string, string])[] = [
		...markdownUnder("marketplace/plugins/astack").map(
			(path) => [path, read(path)] as const,
		),
	];
	const blobForm = /\bgit rev-parse ["']?HEAD:(?:<[^>\s]+>|\$\{?\w+\}?)/g;
	const blobForms = (text: string): string[] => [
		...new Set(Array.from(text.matchAll(blobForm), ([form]) => form)),
	];
	const formsWithoutDeletedBlob = (text: string): string[] =>
		blobForms(text).filter(
			(form) => !text.includes(deletedBlob.replace(blobCommand, form)),
		);

	test("the positive control of the blob scan: git rev-parse HEAD:<file> exits 128 on a file that the branch deletes, and 0 on a file that it keeps", () => {
		const repo = realpathSync(mkdtempSync(join(tmpdir(), "ledger-blob-")));
		try {
			const env = {
				...process.env,
				LC_ALL: "C",
				LANGUAGE: "",
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_NOSYSTEM: "1",
				GIT_AUTHOR_NAME: "t",
				GIT_AUTHOR_EMAIL: "t@example.com",
				GIT_COMMITTER_NAME: "t",
				GIT_COMMITTER_EMAIL: "t@example.com",
			};
			const git = (...args: string[]) =>
				spawnSync("git", args, { cwd: repo, encoding: "utf8", env });
			git("init", "-q", "-b", "main");
			writeFileSync(join(repo, "kept.txt"), "kept\n");
			writeFileSync(join(repo, "gone.txt"), "gone\n");
			git("add", ".");
			git("commit", "-qm", "base");
			git("rm", "-q", "gone.txt");
			git("commit", "-qm", "delete");
			const blobOf = (file: string) =>
				git(...blobCommand.replace("<file>", file).split(" ").slice(1));
			expect(blobOf("kept.txt").status).toBe(0);
			expect(blobOf("gone.txt").status).toBe(128);
			expect(blobOf("gone.txt").stderr).toContain(
				"path 'gone.txt' does not exist in 'HEAD'",
			);
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("the blob scan finds the forms HEAD:<file>, HEAD:<path> and HEAD:$, and asks each one for the blob of a deleted file", () => {
		expect(
			formsWithoutDeletedBlob(
				`Record the blob as \`git rev-parse HEAD:<path>\` or \`git rev-parse HEAD:$file\`. ${deletedBlob}`,
			),
		).toEqual(["git rev-parse HEAD:<path>", "git rev-parse HEAD:$file"]);
		expect(
			formsWithoutDeletedBlob(`The blob is \`${blobCommand}\`. ${deletedBlob}`),
		).toEqual([]);
	});

	test("the scan reads the review reference, which takes the blob of each ledger entry", () => {
		expect(
			blobTexts
				.filter(([, text]) => blobForms(text).length > 0)
				.map(([name]) => name),
		).toEqual([`${engine}/references/review.md`]);
	});

	test("each astack text that takes the blob with git rev-parse HEAD:<file>, HEAD:<path> or HEAD:$ gives the blob of a file that HEAD does not hold", () => {
		expect(
			blobTexts.flatMap(([name, text]) =>
				formsWithoutDeletedBlob(text).map((form) => `${name}: ${form}`),
			),
		).toEqual([]);
	});

	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const review = read(`${engine}/references/review.md`);
	const reset =
		"With `false`, rename an existing ledger to `<branch>.<UTC timestamp>.json` and start with only its `deferred` entries.";
	const keptThroughIterations =
		"No iteration renames or empties the ledger, because `stop_recurring` reads the entries of earlier iterations.";
	const preflightLoad =
		"The preflight loads the ledger once per run, before the prepasses.";
	const resetWords =
		/\brenam\w*|\bempt\w*|\breset\w*|\bload\w*|\bstart\w* (?:empty|with no)/i;

	const ledgerResets = (text: string): string[] =>
		text
			.split("\n")
			.flatMap((line) =>
				sentencesOf(line).filter(
					(sentence) =>
						/\bledger\b/i.test(sentence) &&
						resetWords.test(sentence) &&
						!(
							line.startsWith(preflightLoad) &&
							[preflightLoad, reset].includes(sentence)
						),
				),
			);

	test("the reset scan finds each form of a ledger reset, and passes the rule of the preflight", () => {
		expect(reset).toMatch(resetWords);
		expect(
			ledgerResets(
				[
					"With `ledger.carry_over` set to `false`, the run renames an existing ledger to `<branch>.<UTC timestamp>.json` and starts with no entries.",
					"Print the entries this iteration touched as `FINDING_LEDGER`. Each iteration loads the ledger as the next paragraph says.",
					`${preflightLoad} With \`ledger.carry_over: true\`, a new run starts from the existing ledger. ${reset}`,
					`${preflightLoad} ${reset} Each iteration empties the ledger.`,
				].join("\n"),
			),
		).toEqual([
			"With `ledger.carry_over` set to `false`, the run renames an existing ledger to `<branch>.<UTC timestamp>.json` and starts with no entries.",
			"Each iteration loads the ledger as the next paragraph says.",
			"Each iteration empties the ledger.",
		]);
	});

	test.each([
		[
			"SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
			sentencesFrom(engineSkill, "## Baseline", "## Decide"),
		],
	])(
		"%s keeps the ledger of the run for stop_recurring: the preflight holds the rule, and no gate run, baseline or iteration step resets the ledger",
		(_, preflight, afterPreflight) => {
			expect(afterPreflight).not.toMatch(resetWords);
			expect(preflight).toContain(keptThroughIterations);
		},
	);

	test.each([
		["references/gate.md", gate],
		["references/review.md", review],
	])(
		"%s resets or loads the ledger only in the rule of the preflight",
		(_, text) => {
			expect(ledgerResets(text)).toEqual([]);
		},
	);

	test("review.md says that the preflight loads the ledger once per run", () => {
		expect(
			sentencesFrom(review, "## The ledger", "## Review-bot threads"),
		).toContain(
			"The preflight loads the ledger once per run, before the prepasses.",
		);
	});

	const cutOff =
		"A ledger whose `stopped` is `null` comes from a run that was cut off, so this run resumes it, whatever `ledger.carry_over` says.";
	const resumed =
		"A resumed run keeps each entry, and its first iteration is the one after the highest `iteration` of the entries.";
	const stopRecord =
		"this run loaded the ledger, set its `stopped` to the decision.";
	const stoppedAtLoad =
		"Each run sets `stopped` to `null` at this load, and to its decision when it stops.";
	const stoppedField = [
		"It is `null` until that run stops.",
		"A ledger with no `stopped` key comes from a run that stopped.",
		stoppedAtLoad,
	];
	const ledgerRule = sentencesFrom(
		review,
		"## The ledger",
		"## Review-bot threads",
	);

	test.each([["references/review.md", ledgerRule]])(
		"%s defines the stopped field of the ledger, which tells a ledger of a run that was cut off",
		(_, text) => {
			for (const sentence of stoppedField) expect(text).toContain(sentence);
		},
	);

	test("the preflight of SKILL.md marks the loaded ledger as the ledger of a run in progress, so a run that is cut off leaves a ledger to resume", () => {
		expect(stepWith(engineSkill, "Load the ledger")).toContain(stoppedAtLoad);
	});

	test.each([
		["references/review.md", ledgerRule],
		["the preflight of SKILL.md", stepWith(engineSkill, "Load the ledger")],
	])(
		"%s resumes the ledger of a run that was cut off, so the rename of ledger.carry_over: false never archives it",
		(_, text) => {
			expect(text).toContain(cutOff);
			expect(text).toContain(resumed);
			expect(text.indexOf(cutOff)).toBeLessThan(
				text.indexOf("Otherwise, with `ledger.carry_over"),
			);
			if (text.includes(reset))
				expect(text.indexOf(cutOff)).toBeLessThan(text.indexOf(reset));
		},
	);

	test.each([
		[
			"SKILL.md",
			sentencesFrom(engineSkill, "## After the stop", "## References"),
		],
	])(
		"the steps after the stop in %s record the decision in the ledger, so the next run does not resume a run that stopped",
		(_, text) => {
			expect(text).toContain(stopRecord);
		},
	);
});

describe("hardening compaction keeps the active iteration", () => {
	test("recovery completes the in-progress iteration instead of exhausting the iteration cap", () => {
		const recovery = sentencesFrom(
			read(`${engine}/SKILL.md`),
			"## Recover after a compaction",
			"## Load the profile",
		);
		expect(recovery).toContain(
			"Continue the current iteration and its unfinished step.",
		);
		expect(recovery).toContain(
			"Complete every required step of that iteration before deciding.",
		);
		expect(recovery).not.toContain(
			"Continue with the iteration after the highest",
		);
	});
});

describe("an accepted skill edit lands in the source checkout of the skill", () => {
	const repairRule = "never in a project copy or an installed copy";
	const backlogRule = "With no source checkout, the edit goes to Backlog.";
	const checkoutTest =
		"A source checkout is a git work tree that tracks the skill, outside `dist/`, a plugin cache and an install folder.";
	const reflect = "marketplace/plugins/astack/skills/reflect/SKILL.md";
	const repairTexts = [
		"marketplace/plugins/astack/skills/mode/references/card.md",
		"rules/astack.md",
		"docs/design.md",
		reflect,
	];

	test("[control:sg-repair-source] the card, its rules copy, the design and reflect forbid an edit in an installed copy, and reflect sends an edit with no source checkout to Backlog", () => {
		expect(
			repairTexts.filter((path) => !read(path).includes(repairRule)),
		).toEqual([]);
		expect(read(reflect)).toContain(backlogRule);
	});

	test("reflect tells a source checkout from an install folder or a tracked dist copy", () => {
		expect(read(reflect)).toContain(checkoutTest);
	});
});
