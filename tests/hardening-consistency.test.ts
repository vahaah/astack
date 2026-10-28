import { describe, expect, test } from "bun:test";
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
import { reviewStubSource } from "../scripts/lib/render.ts";
import { exemptPaths } from "../scripts/lib/ste-exempt.ts";
import { marketplacePlugins, originItems } from "../scripts/validate.ts";
import {
	FALLBACK_EXEMPT,
	FALLBACK_KEYS,
	FALLBACK_UNREAD,
	FIXER_FLAGS,
	missingFallbackKeys,
	PROFILE_KEYS,
	PROFILE_LEAF_KEYS,
	parseProfile,
	profileGates,
	validateProfile,
} from "../src/astack/pr-review-profile.ts";
import {
	exampleProjects,
	profilePaths,
	scanProjectDirs,
	scanRows,
} from "./profile-paths.ts";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const engine = "marketplace/plugins/astack/skills/pr-review-hardening";
const stub = readFileSync(reviewStubSource, "utf8");

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

	test("the stub fallback uses the same labels as the engine", () => {
		expect(stub).toContain(labels);
		expect(stub).not.toContain("Reproduce every Critical or Important finding");
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

	test("the stub states the rule in the same words", () => {
		expect(stub).toContain(commitRule());
		expect(stub.toLowerCase()).not.toContain("one commit per finding");
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
		expect(redCommit.test(stub)).toBe(false);
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

describe("arguments of the stub fallback", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));

	test("the fallback parses the arguments with the engine's sentences", () => {
		expect(fallback).toContain(
			sentencesFrom(engineSkill, "A bare word is the base branch.", "if any."),
		);
	});

	test("the fallback reads the PR's base with the engine's command", () => {
		const command = "`gh pr view <n> --json baseRefName`";
		expect(engineSkill).toContain(command);
		expect(fallback).toContain(command);
	});
});

describe("gate run of the stub fallback", () => {
	const gate = read(`${engine}/references/gate.md`);
	const gateRun = paragraphStarting(stub, "Gate run:");

	test.each(["GIT_STATUS_BEFORE_GATE", "GIT_STATUS_AFTER_GATE"])(
		"prints %s as the engine does",
		(label) => {
			const line = `\`git status --short\` as \`${label}\``;
			expect(gate).toContain(line);
			expect(gateRun).toContain(line);
		},
	);

	test("a changed tracked file stops the run in principled incompletion", () => {
		expect(gateRun).toContain(
			"If a tracked file changed after the restore, print its `git diff`. The gate is red, and the run stops with principled incompletion.",
		);
	});

	const restore =
		"Before the subshell of a gate opens, record `git -C <WORKTREE> diff --name-only`. Right after it exits, whatever its exit code, the run restores the `rewrites` paths that were not in that list. It uses `git -C <WORKTREE> checkout -- <path>`. It prints `<NAME>_RESTORED=<path>` for each restored path that `git -C <WORKTREE> diff --name-only` showed before the restore. A `rewrites` path that changed before the gate stays as it is, so the status check after the gates shows it.";

	test.each([
		["references/gate.md", gate],
		["the stub fallback", gateRun],
	])(
		"%s restores only the rewrites that the gate itself made, so an earlier write or an uncommitted change stays red",
		(_, text) => {
			expect(text).toContain(restore);
		},
	);

	test.each([
		["references/gate.md", gate],
		["references/profile.md", read(`${engine}/references/profile.md`)],
		["the stub fallback", gateRun],
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
		expect(gateRun.indexOf(restore)).toBeLessThan(
			gateRun.indexOf("as `GIT_STATUS_AFTER_GATE`"),
		);
		expect(gate).toContain(
			"no gate changed a tracked file that its `rewrites` does not name.",
		);
	});

	test("the baseline and every iteration do the gate run", () => {
		expect(paragraphStarting(stub, "Baseline:")).toContain(
			"Baseline: do the gate run once.",
		);
		expect(
			paragraphStarting(stub.slice(stub.indexOf("Each iteration:")), "6. "),
		).toContain("6. Do the gate run.");
	});
});

describe("gate entries that fix the tree", () => {
	const readOnly = paragraphStarting(
		read(`${engine}/references/gate.md`),
		"A gate command must not write tracked files",
	);
	const rule = paragraphStarting(stub, "- Gates are read-only.");

	test.each([
		["references/gate.md", readOnly],
		["the stub fallback", rule],
	])("%s names each fixer flag that the profile check refuses", (_, text) => {
		for (const { flag } of FIXER_FLAGS) expect(text).toContain(`\`${flag}\``);
	});

	test.each([
		["references/gate.md", readOnly],
		["the stub fallback", rule],
	])(
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const gateRun = sentencesFrom(gate, "## Run it", "## Green");

	test.each([
		["references/gate.md", gateRun],
		["the stub fallback", paragraphStarting(stub, "Gate run:")],
	])(
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
		["the preflight of the stub fallback", stepWith(fallback, prerequisites)],
		["the gate run of the stub fallback", paragraphStarting(stub, "Gate run:")],
	])(
		"%s runs each check, start, setup command and gate command in its own subshell from the root",
		(_, text) => {
			expect(text).toContain("`( cd <WORKTREE> && <entry> )`");
		},
	);

	test.each([
		["the preflight of SKILL.md", stepWith(engineSkill, prerequisites)],
		["the preflight of the stub fallback", stepWith(fallback, prerequisites)],
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

describe("keys the stub fallback reads", () => {
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const dotted = [...fallback.matchAll(/`([a-z_]+(?:\[\])?(?:\.[a-z_]+)+)`/g)]
		.map((match) => match[1] ?? "")
		.filter((key) => !/\.(?:json|toml|md|ts|ya?ml)$/.test(key));

	test("a file name is not a key", () => {
		expect(fallback).toContain("`package.json`");
		expect(dotted).not.toContain("package.json");
		expect(dotted).toContain("base.from_pr");
	});

	test("every dotted key in the fallback is a listed fallback key", () => {
		expect(dotted.filter((key) => !FALLBACK_KEYS.includes(key))).toEqual([]);
	});

	test("the fallback names every listed key", () => {
		expect(
			FALLBACK_KEYS.filter((key) => !fallback.includes(`\`${key}\``)),
		).toEqual([]);
	});

	const placedKeys = [
		...FALLBACK_KEYS,
		...FALLBACK_UNREAD.map(({ key }) => key),
		...FALLBACK_EXEMPT.map(({ key }) => key),
	];
	const isWithin = (key: string, outer: string) =>
		key === outer ||
		key.startsWith(`${outer}.`) ||
		key.startsWith(`${outer}[].`);
	const unplaced = (leaves: readonly string[]) => {
		const wholes = placedKeys.filter(
			(outer) =>
				!placedKeys.some((key) => key !== outer && isWithin(key, outer)),
		);
		return leaves.filter(
			(leaf) => !wholes.some((outer) => isWithin(leaf, outer)),
		);
	};

	test("the schema keys reach into lists of gates and nullable blocks", () => {
		expect(PROFILE_LEAF_KEYS).toEqual(
			expect.arrayContaining([
				"gates[].env[].name",
				"test.side_effects",
				"metrics.command",
				"proof.pr_comment.heading",
			]),
		);
		expect(PROFILE_LEAF_KEYS).not.toContain("gates");
		expect(PROFILE_KEYS).toContain("gates");
	});

	test("each leaf key of the profile schema is read by the fallback, reported by apply or exempt with a reason", () => {
		expect(unplaced(PROFILE_LEAF_KEYS)).toEqual([]);
	});

	const wholeBlocks: Readonly<Record<string, readonly string[]>> = {
		"gates[].env": ["[].name", "[].why"],
		"gates[].requires": ["[].name", "[].check", "[].on_missing", "[].start"],
		"gates[].ci_env": ["[].name", "[].value", "[].why"],
		"gates[].tools": [".bun", ".supabase"],
		"gates[].rewrites": ["[].path", "[].why"],
		"test.env": ["[].name", "[].why"],
		"test.requires": ["[].name", "[].check", "[].on_missing", "[].start"],
		"test.ci_env": ["[].name", "[].value", "[].why"],
		"test.tools": [".bun", ".supabase"],
		"test.rewrites": ["[].path", "[].why"],
		"reviewers.checklists": ["[].path", "[].use"],
		"proof.pr_comment": [".heading", ".extra"],
		"proof.on_unclean": [".draft", ".label", ".post_to"],
		type_coverage: [".command", ".min_percent"],
		"reviewers.extra": ["[].name", "[].invoke", "[].when"],
		"conventions.pr": [".title", ".body_first_line", ".forbidden_body_words"],
		"conventions.ticket": [".key_pattern"],
	};

	test("each block that the fallback reads whole holds only the child keys that the table records, so a new key inside it needs a decision", () => {
		const wholes = placedKeys.filter(
			(outer) =>
				!placedKeys.some((key) => key !== outer && isWithin(key, outer)),
		);
		const found: Readonly<Record<string, readonly string[]>> =
			Object.fromEntries(
				wholes.flatMap((outer) => {
					const children = PROFILE_LEAF_KEYS.filter(
						(leaf) => leaf !== outer && isWithin(leaf, outer),
					).map((leaf) => leaf.slice(outer.length));
					return children.length === 0 ? [] : [[outer, children]];
				}),
			);
		expect(found).toEqual(wholeBlocks);
	});

	test("a new key beside the listed keys of a block has no place, and a key inside a block that the fallback reads whole has one", () => {
		expect(
			unplaced([
				"reviewers.focus",
				"gates[].retries",
				"proof.pr_comment.heading",
				"gates[].env[].name",
			]),
		).toEqual(["reviewers.focus", "gates[].retries"]);
	});

	const runTexts = [
		"SKILL.md",
		"references/gate.md",
		"references/review.md",
		"references/fix.md",
		"references/comments.md",
		"references/typescript.md",
	];
	const exemptRunReads: Readonly<Record<string, string>> = {
		"merge.command":
			"The stub runs the merge command of the profile in its merge sentence when merge.after_clean_stop is merge, as the engine does.",
	};

	test("a text that a step of the run reads names no exempt key, other than a key that the stub follows in its own words", () => {
		expect(
			FALLBACK_EXEMPT.flatMap(({ key }) =>
				runTexts
					.filter((path) => read(`${engine}/${path}`).includes(`\`${key}\``))
					.filter(() => exemptRunReads[key] === undefined)
					.map((path) => `${path}: ${key}`),
			),
		).toEqual([]);
		expect(
			Object.keys(exemptRunReads).filter(
				(key) =>
					!FALLBACK_EXEMPT.some((entry) => entry.key === key) ||
					!runTexts.some((path) =>
						read(`${engine}/${path}`).includes(`\`${key}\``),
					),
			),
		).toEqual([]);
	});

	const sample = parseProfile(
		read("examples/companion/projects/acme/pr-review-hardening.profile.md"),
	).data;
	const withNull = (data: unknown, path: string): unknown => {
		const [head = "", ...rest] = path.split(".");
		if (typeof data !== "object" || data === null || Array.isArray(data))
			return data;
		const record: Readonly<Record<string, unknown>> = { ...data };
		return {
			...record,
			[head]: rest.length === 0 ? null : withNull(record[head], rest.join(".")),
		};
	};
	const nullableBlocks = [
		...new Set(
			FALLBACK_KEYS.flatMap((key) => {
				const block = key.split(".").slice(0, -1).join(".");
				return block === "" || block.includes("[]") ? [] : [block];
			}),
		),
	].filter(
		(block) =>
			!validateProfile(withNull(sample, block)).some(
				(issue) => issue.path === block,
			),
	);
	const nullableKeys = FALLBACK_KEYS.flatMap((key) =>
		nullableBlocks
			.filter((block) => key.startsWith(`${block}.`))
			.map((block) => ({ block, key })),
	);
	const namesKey = (sentence: string, block: string, key: string) =>
		sentence.includes(`\`${key}\``) ||
		(key === `${block}.command` && sentence.includes(`the ${block} command`));
	const isConditional = (sentence: string, block: string, key: string) =>
		[
			`\`${block}\` is not \`null\``,
			`\`${block}\` is set`,
			`if ${block} ran`,
			`\`${key}\` set to`,
			`\`${key}\` is`,
		].some((condition) =>
			sentence.toLowerCase().includes(condition.toLowerCase()),
		);

	test("a profile can set metrics and typescript to null, and the scan reads the keys under them", () => {
		expect(validateProfile(sample)).toEqual([]);
		expect(nullableBlocks).toEqual(["metrics", "typescript"]);
		expect(nullableKeys.map(({ key }) => key)).toEqual([
			"metrics.command",
			"metrics.never_increase",
			"typescript.rules",
		]);
	});

	test.each([
		["the stub fallback", fallback],
		...runTexts.map((path): [string, string] => [
			path,
			read(`${engine}/${path}`),
		]),
	])(
		"%s runs or prints a key of a block that a profile can set to null only when the block is not null",
		(_, text) => {
			expect(
				text
					.split("\n")
					.flatMap(sentencesOf)
					.filter((sentence) =>
						nullableKeys.some(
							({ block, key }) =>
								namesKey(sentence, block, key) &&
								!isConditional(sentence, block, key),
						),
					),
			).toEqual([]);
		},
	);

	test("each listed key is a key of the profile schema, in one list only", () => {
		expect(placedKeys.filter((key) => !PROFILE_KEYS.includes(key))).toEqual([]);
		expect(
			placedKeys.filter((key, index) => placedKeys.indexOf(key) !== index),
		).toEqual([]);
	});

	const review = read(`${engine}/references/review.md`);

	test.each([
		[
			"the ledger path",
			sentencesFrom(
				review,
				"Keep one ledger per branch at",
				"replaced by `-`.",
			),
		],
		[
			"the rename of an earlier ledger",
			"With `false`, rename an existing ledger to `<branch>.<UTC timestamp>.json` and start empty.",
		],
		[
			"the rule that a fixed or advisory entry comes back only when its blob changed",
			"An entry that is `fixed` or `advisory` there is not raised again unless its file's blob has changed since.",
		],
		[
			"the blob of each entry",
			"`git rev-parse HEAD:<file>` when the entry was last decided",
		],
	])(
		"the stub fallback states %s, which it needs to follow ledger.carry_over as the engine does",
		(_, sentence) => {
			expect(review).toContain(sentence);
			expect(fallback).toContain(sentence);
		},
	);

	type HowTo = {
		readonly stub: string;
		readonly file: string;
		readonly engine: string;
	};
	const gateHowTo: Readonly<Record<string, HowTo>> = {
		name: {
			stub: "`<NAME>` is the `gates[].name` or the `test.name` of the gate in upper case, with `-` replaced by `_`.",
			file: "references/gate.md",
			engine:
				"`<NAME>` is the gate's `name` in upper case with `-` replaced by `_`.",
		},
		command: {
			stub: "Print each command as the profile writes it, with no variable expanded, and its exit code and output.",
			file: "references/gate.md",
			engine:
				"Otherwise print `<NAME>_CMD=<command>`, with the command as the profile writes it.",
		},
		env: {
			stub: "For each gate that applies, every `env` variable must be set.",
			file: "SKILL.md",
			engine: "print each `env` name as `set` or `missing`, never its value.",
		},
		requires: {
			stub: "Then run the `check` of each prerequisite in `requires` in the CI environment of the gate.",
			file: "SKILL.md",
			engine:
				"Run the `check` of each prerequisite in `requires` in the CI environment of the gate",
		},
		setup: {
			stub: "Before each gate, check its `env` and prerequisites again and run its `setup` commands in order.",
			file: "references/gate.md",
			engine:
				"Then run each `setup` command in order, and print each one with its exit code.",
		},
		when_changed: {
			stub: "An empty `when_changed` means that the gate applies to every diff.",
			file: "references/gate.md",
			engine: "A gate with an empty `when_changed` applies to every diff.",
		},
		ci_env: {
			stub: "Before its prerequisites, its `setup` commands and its command, the run exports `CI=true`, then each `ci_env` entry that has a `value`.",
			file: "references/gate.md",
			engine:
				"Before its prerequisites, its `setup` commands and its command, the run exports `CI=true`, then each `ci_env` entry that has a `value`.",
		},
		after: {
			stub: "A gate that names gates in `after` runs only when each of them exited 0 earlier in the same gate run.",
			file: "references/gate.md",
			engine:
				"A gate that names gates in `after` runs only when each of them exited 0 earlier in the same gate run.",
		},
		tools: {
			stub: "Each gate runs bun and the Supabase CLI at the versions in its `tools`, and so does each script that it starts.",
			file: "references/gate.md",
			engine:
				"Each gate runs bun and the Supabase CLI at the versions in its `tools`, and so does each script that it starts.",
		},
		rewrites: {
			stub: "Right after it exits, whatever its exit code, the run restores the `rewrites` paths that were not in that list.",
			file: "references/gate.md",
			engine:
				"Right after it exits, whatever its exit code, the run restores the `rewrites` paths that were not in that list.",
		},
	};
	const prepass: HowTo = {
		stub: "Run each entry of `prepasses` whose `prepasses[].when` fits this PR, once, before the baseline.",
		file: "SKILL.md",
		engine: "Run each entry of `prepasses` whose `when` applies to this PR",
	};
	const merge: HowTo = {
		stub: "Merge only when `merge.after_clean_stop` is `merge` and every line of `merge.conditions` holds.",
		file: "SKILL.md",
		engine:
			"If the stop is clean and `merge.after_clean_stop` is `merge`, compare each line of `merge.conditions` with git and GitHub.",
	};
	const howTo: Readonly<Record<string, HowTo>> = {
		"base.default": {
			stub: "else `base.default`.",
			file: "SKILL.md",
			engine: "Otherwise use `base.default`.",
		},
		"base.from_pr": {
			stub: "else the PR's base when `base.from_pr` is true and a PR exists",
			file: "SKILL.md",
			engine:
				"Otherwise, when `base.from_pr` is true and a PR exists, use its base",
		},
		"base.sync": {
			stub: "With `base.sync` set to `merge`, run `git merge origin/<base>`. With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.",
			file: "SKILL.md",
			engine:
				"With `base.sync` set to `merge`, run `git merge origin/<base>`. With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.",
		},
		"iterations.min": {
			stub: "at least `iterations.min` iterations have run",
			file: "SKILL.md",
			engine: "A clean stop needs at least `iterations.min` iterations.",
		},
		"iterations.max": {
			stub: "the run reached `iterations.max`",
			file: "SKILL.md",
			engine:
				"For each iteration `n` up to `iterations.max`, from 1 or from the first iteration of a resumed run:",
		},
		push: {
			stub: "Push as `push` says.",
			file: "SKILL.md",
			engine: "and push as the profile says",
		},
		guardrails: {
			stub: "Print these rules at the start of every iteration, followed by the profile's `guardrails`:",
			file: "SKILL.md",
			engine:
				"Print these at the start of every iteration, followed by each line of the profile's `guardrails`:",
		},
		gates: {
			stub: "Run every gate that applies, then the test gate",
			file: "references/gate.md",
			engine: "For each entry of `gates`, then `test`:",
		},
		test: {
			stub: "Run every gate that applies, then the test gate",
			file: "references/gate.md",
			engine: "For each entry of `gates`, then `test`:",
		},
		...Object.fromEntries(
			Object.entries(gateHowTo).flatMap(([key, row]) => [
				[`gates[].${key}`, row],
				[`test.${key}`, row],
			]),
		),
		metrics: {
			stub: "A `metrics` value of `null` means no metrics.",
			file: "references/gate.md",
			engine: "Without `metrics`, print `METRICS=UNAVAILABLE`.",
		},
		"metrics.command": {
			stub: "When `metrics` is not `null`, run `metrics.command`.",
			file: "references/gate.md",
			engine: "If `metrics` is set, run `metrics.command`",
		},
		"metrics.never_increase": {
			stub: "When `metrics` is not `null`, no key in `metrics.never_increase` may rise.",
			file: "references/gate.md",
			engine:
				"each key in `metrics.never_increase` is no higher than in the previous iteration",
		},
		"reviewers.select": {
			stub: "With `reviewers.select` set to `all`, launch every agent in `reviewers.agents`. Otherwise launch `code-reviewer`, plus each agent in `reviewers.agents` that fits what the diff changes.",
			file: "references/review.md",
			engine: "`applicable`: `code-reviewer` always.",
		},
		"reviewers.agents": {
			stub: "With `reviewers.select` set to `all`, launch every agent in `reviewers.agents`.",
			file: "references/review.md",
			engine: "`all`: every agent in `reviewers.agents`, every iteration.",
		},
		"reviewers.checklists": {
			stub: "Then examine the diff against each file in `reviewers.checklists`.",
			file: "references/review.md",
			engine:
				"After the reviewers return, read each file in `reviewers.checklists` and check the diff against the part its `use` names.",
		},
		"reviewers.notes": {
			stub: "Give each one every line of `reviewers.notes`.",
			file: "references/review.md",
			engine: "every line of `reviewers.notes`.",
		},
		"typescript.rules": {
			stub: "With `typescript.rules` set to true, a fix proves or narrows a type.",
			file: "SKILL.md",
			engine:
				"`references/typescript.md` applies when `typescript.rules` is true.",
		},
		"ledger.carry_over": {
			stub: "with `ledger.carry_over` set to `true`, start from the previous run's records. An entry that is `fixed` or `advisory` there is not raised again unless its file's blob has changed since.",
			file: "references/review.md",
			engine:
				"An entry that is `fixed` or `advisory` there is not raised again unless its file's blob has changed since.",
		},
		"comments.keep_patterns": {
			stub: "A comment stays too when it fits in 2 lines and one of its lines matches `comments.keep_patterns`, with or without its comment marker. A pattern that starts with a comment marker matches only a line with that marker. A pattern keeps only the lines that it matches. Delete the comment when another line, or the `rest` group of a pattern, holds a form that the hook denies. Those forms are provenance, narration, a `file:line` reference, the file's own path, a banner and commented-out code.",
			file: "references/comments.md",
			engine:
				"A comment survives when one of its lines matches a pattern, with or without its comment marker. A pattern that starts with a comment marker, such as `^-- `, matches only a line with that marker. A pattern keeps only the lines that it matches.",
		},
		"forbidden.commands": {
			stub: "never run a command that matches `forbidden.commands`.",
			file: "references/fix.md",
			engine: "Never run a command in `forbidden.commands`",
		},
		"forbidden.paths": {
			stub: "No dependency, lockfile, migration or CI edits, and nothing under `forbidden.paths`.",
			file: "references/fix.md",
			engine: "touches a path in `forbidden.paths`;",
		},
		"conventions.branch.create": {
			stub: "If you are on it, create a branch named by `conventions.branch.create`.",
			file: "SKILL.md",
			engine:
				"If the current branch is the base branch, create a new branch from it named by `conventions.branch.create`.",
		},
		"conventions.branch.pattern": {
			stub: "When `conventions.branch.pattern` is not null, the name must match it.",
			file: "SKILL.md",
			engine:
				"When `conventions.branch.pattern` is set, the name must match it.",
		},
		"conventions.commit.subject": {
			stub: "Write each commit subject from `conventions.commit.subject`.",
			file: "references/fix.md",
			engine:
				"Write each subject from `conventions.commit.subject` with the finding id filled in.",
		},
		"conventions.commit.trailers": {
			stub: "End each commit with a trailer for each key in `conventions.commit.trailers`.",
			file: "references/fix.md",
			engine: "Keep the trailers named in `conventions.commit.trailers`.",
		},
		test_adequacy: {
			stub: "With `test_adequacy` set to `control-per-clause`, a planted control covers a contract clause when the control fails without the code of the clause.",
			file: "references/review.md",
			engine:
				"With `test_adequacy: control-per-clause`, a contract clause is covered when at least one planted control fails if the clause's code is removed.",
		},
		prepasses: prepass,
		"prepasses[].when": prepass,
		"prepasses[].sources": {
			stub: "For `contract-coverage`, build a clause-to-control matrix over the specs that `prepasses[].sources` names.",
			file: "references/review.md",
			engine:
				"`contract-coverage`: build a clause-to-control matrix over the specs in `sources`.",
		},
		"threads.answer": {
			stub: "If `threads.answer` is true, answer each review-bot thread on the PR before the merge.",
			file: "SKILL.md",
			engine: "If `threads.answer` is true, answer the PR's review-bot threads",
		},
		"proof.pr_comment": {
			stub: "If `proof.pr_comment` is set, post a comment on the PR.",
			file: "references/gate.md",
			engine:
				"When `proof.pr_comment` is set and the branch has a PR, post a comment after each iteration",
		},
		"proof.on_unclean": {
			stub: "On an unclean stop, do what `proof.on_unclean` says when it is not `null`.",
			file: "SKILL.md",
			engine:
				"If the stop is not clean and `proof.on_unclean` is set, do what it says.",
		},
		"merge.after_clean_stop": merge,
		"merge.conditions": merge,
	};

	test("each key that the fallback reads has a row that tells how the stub follows it", () => {
		expect(Object.keys(howTo).sort()).toEqual([...FALLBACK_KEYS].sort());
	});

	test.each(Object.entries(howTo))(
		"the stub fallback states how to follow %s, and the engine holds the sentence that the stub follows",
		(_, row) => {
			expect(fallback).toContain(row.stub);
			expect(read(`${engine}/${row.file}`)).toContain(row.engine);
		},
	);

	test.each(profilePaths)("%s defines every key the fallback reads", (path) => {
		expect(missingFallbackKeys(parseProfile(read(path)).data)).toEqual([]);
	});

	test("a null block satisfies the keys under it, and an absent key does not", () => {
		expect(
			missingFallbackKeys({ metrics: null, proof: { pr_comment: null } }),
		).toContain("proof.on_unclean");
		expect(
			missingFallbackKeys({ metrics: null, proof: { pr_comment: null } }),
		).not.toContain("metrics.never_increase");
	});

	test("the key check of the stub fallback, as apply does, finds no missing key under a null block, so a run with metrics: null goes on", () => {
		const keyCheck = sentencesOf(
			paragraphStarting(fallback, "Read the YAML block in the profile."),
		);
		const stop =
			"If a key that this section names is missing, stop with principled incompletion.";
		const nullBlock =
			"A `null` block, such as `metrics: null`, holds no key, so no key under it is missing.";
		expect(keyCheck).toContain(stop);
		expect(keyCheck.indexOf(nullBlock)).toBe(keyCheck.indexOf(stop) + 1);
		expect(missingFallbackKeys({ metrics: null })).not.toContain(
			"metrics.command",
		);
	});

	test("a gate key that the fallback reads is defined on every gate, and an empty gate list needs none", () => {
		const bare = { name: "lint", command: "bun run lint" };
		const full = {
			...bare,
			env: [],
			requires: [],
			setup: [],
			when_changed: [],
			ci_env: [],
			after: [],
			tools: {},
			rewrites: [],
		};
		const gateKeys = (data: unknown) =>
			missingFallbackKeys(data).filter(
				(key) => key.startsWith("gates[]") || key.startsWith("test."),
			);
		expect(gateKeys({ gates: [full, bare], test: full })).toEqual([
			"gates[].env",
			"gates[].requires",
			"gates[].setup",
			"gates[].when_changed",
			"gates[].ci_env",
			"gates[].after",
			"gates[].tools",
			"gates[].rewrites",
		]);
		expect(gateKeys({ gates: [], test: bare })).toEqual([
			"test.env",
			"test.requires",
			"test.setup",
			"test.when_changed",
			"test.ci_env",
			"test.after",
			"test.tools",
			"test.rewrites",
		]);
		expect(gateKeys({ gates: [full], test: full })).toEqual([]);
	});
});

describe("the proof, the commits and the stop of the stub fallback", () => {
	const gate = read(`${engine}/references/gate.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const gateBullets = (heading: string): string[] => {
		const from = gate.indexOf(`\n## ${heading}\n`);
		if (from === -1) throw new Error(`no section ${heading}`);
		const to = gate.indexOf("\n## ", from + 1);
		return gate
			.slice(from, to === -1 ? undefined : to)
			.split("\n")
			.filter((line) => line.startsWith("- "));
	};
	const commentFields: Readonly<Record<string, string>> = {
		"- the head SHA the iteration ended on;":
			"the head SHA that the iteration ended on",
		"- the iteration number;": "the iteration number",
		"- the blocking finding count;": "the blocking finding count",
		"- each gate command as the profile writes it, with its exit code, `SKIPPED`, `UNAVAILABLE`, `NOT_STARTED` or `BLOCKED`;":
			"each gate command as the profile writes it, with its exit code, `SKIPPED`, `UNAVAILABLE`, `NOT_STARTED` or `BLOCKED`",
		"- the mode, and each advisory gate of mode `ci_proof` with its proof;":
			"It also holds the mode, and each advisory gate of mode `ci_proof` with its proof.",
		"- the decision;": "Then it holds the decision",
		"- every item in `proof.pr_comment.extra`.":
			"each item of its `extra` list",
	};
	const uncleanSteps: Readonly<Record<string, string>> = {
		"- if `draft` is true, return the PR to draft with `gh pr ready <n> --undo`;":
			"With `draft` set to true, return the PR to draft with `gh pr ready <n> --undo`.",
		"- if `label` is set, add it, creating it first with `gh label create` if it is missing;":
			"When `label` is set, add that label to the PR. Create the label first with `gh label create` when it is missing.",
		"- post the unresolved findings with their exact reasons to each place in `post_to`. `issue` means the issue the PR body's first line names.":
			"Post each unresolved finding with its exact reason to each place in `post_to`. The place `issue` is the issue that the first line of the PR body names.",
	};

	test("each field of the PR comment of the engine has one row", () => {
		expect(Object.keys(commentFields)).toEqual(gateBullets("PR comment"));
	});

	test.each(Object.entries(commentFields))(
		"the PR comment of the stub fallback holds the field of %p",
		(_, field) => {
			expect(stepWith(fallback, "If `proof.pr_comment` is set")).toContain(
				field,
			);
		},
	);

	test("each step of the unclean stop of the engine has one row", () => {
		expect(Object.keys(uncleanSteps)).toEqual(gateBullets("Unclean stop"));
	});

	test.each(Object.entries(uncleanSteps))(
		"the unclean stop of the stub fallback does the step of %p",
		(_, step) => {
			expect(paragraphStarting(fallback, "After the stop")).toContain(step);
		},
	);

	test("the stub fallback takes the value of each trailer key from the session", () => {
		expect(fallback).toContain(
			"End each commit with a trailer for each key in `conventions.commit.trailers`. Take its value from this session, such as the URL of the session.",
		);
	});

	test("the stub fallback runs only the contract-coverage prepass, and stops on another", () => {
		expect(stepWith(fallback, "Run each entry of `prepasses`")).toContain(
			"Stop with principled incompletion on an entry with another name.",
		);
	});
});

describe("gates that mirror CI", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const mirror =
		"The profile's gates mirror the blocking jobs of the repo's CI.";
	const notStarted =
		"A gate that applies but cannot start is an unclean stop. The run never skips it.";

	test.each([
		["SKILL.md", engineSkill],
		["references/gate.md", gate],
		["references/profile.md", profile],
		["the stub fallback", fallback],
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const ciEnvironment =
		"Each gate runs in the CI environment of its jobs. Before its prerequisites, its `setup` commands and its command, the run exports `CI=true`, then each `ci_env` entry that has a `value`. An entry with a `why` and no `value` leaves its variable as the session has it, and that holds for `CI` too. The run never sets `GITHUB_ACTIONS` or another `GITHUB_` or `RUNNER_` variable, because no gate runs on GitHub Actions.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
		["the stub fallback", fallback],
	])(
		"%s exports CI=true and the CI values, and never fakes the runner",
		(_, text) => {
			expect(text).toContain(ciEnvironment);
		},
	);

	const environmentLine =
		"`<NAME>_ENV` lists the names that the run exports as `<name>=<value>`, which are `CI` and each `ci_env` entry that has a `value`. It lists each other name of the `ci_env` and `env` of the gate as `<name>=set` or `<name>=unset`.";

	test.each([
		["references/gate.md", gate],
		["the gate run of the stub fallback", paragraphStarting(stub, "Gate run:")],
	])(
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const secrets =
		"Never print a value from the session or from a file. Such a value can be a secret, such as a token, a key or a database URL.";

	test.each([
		[
			"the rules of SKILL.md",
			sentencesFrom(engineSkill, "## Rules for the whole run", "## Preflight"),
		],
		["references/gate.md", gate],
		[
			"the rules of the stub fallback",
			sentencesFrom(fallback, "Print these rules at the start", "Preflight:"),
		],
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
		["the stub fallback", fallback],
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

	test.each([
		["references/gate.md", gate],
		["the gate run of the stub fallback", paragraphStarting(stub, "Gate run:")],
	])("%s prints each command with no variable expanded", (_, text) => {
		expect(text).toContain(unexpanded);
	});
});

describe("the tool versions of a gate", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const pinned =
		"Each gate runs bun and the Supabase CLI at the versions in its `tools`, and so does each script that it starts.";
	const local =
		"When bunx cannot get a pinned version, the gate runs the local version. The final report names each difference as a note, and the run goes on. It is not an unclean stop.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
		["the stub fallback", fallback],
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
		["the stub fallback", fallback],
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

	test.each([
		["references/gate.md", gate],
		["the stub fallback", fallback],
	])(
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
		["the stub fallback", fallback],
	])("%s never stops a gate on the local version of a tool", (_, text) => {
		expect(text).not.toMatch(/test "\$\((?:bun|supabase) --version\)"/);
		expect(text).not.toContain("compares the version with the pin");
	});
});

describe("a run that names a PR reviews that PR", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const view =
		"`gh pr view <n> --json headRefName,headRefOid,baseRefName,state,isCrossRepository`";
	const sentences = [
		view,
		"`git worktree add --detach <dir>`",
		"`gh pr checkout <n> --branch <local branch>`",
		"With `--pr`, the base branch is the bare word, else the PR's `baseRefName`, whatever `base.from_pr` says.",
		"Never create a review branch in a run with `--pr`.",
	];

	test.each(sentences)(
		"the engine and the stub fallback say %s",
		(sentence) => {
			expect(engineSkill).toContain(sentence);
			expect(fallback).toContain(sentence);
		},
	);

	test("the run checks out the PR before it loads the profile, so the profile of the PR head applies", () => {
		const before = (text: string, first: string, second: string) => {
			const at = text.indexOf(first);
			expect(at).toBeGreaterThan(-1);
			expect(at).toBeLessThan(text.indexOf(second));
		};
		before(engineSkill, view, "## Load the profile");
		before(fallback, view, "Read the YAML block in the profile.");
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
		["the stub fallback", fallback] as const,
		...profilePaths.map((path) => [path, read(path)] as const),
	])(
		"%s takes no checkout of a PR by the name of its head branch, which a branch of a fork can share with a local branch such as main",
		(_, text) => {
			expect(takesByName(text)).toEqual([]);
		},
	);

	test.each([
		["SKILL.md", engineSkill],
		["the stub fallback", fallback],
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const onlyWithPr = [
		[
			"SKILL.md",
			sentencesFrom(
				engineSkill,
				"## Review the PR that --pr names",
				"The fix commits go on the local branch of the PR.",
			),
		],
		[
			"the stub fallback",
			sentencesFrom(
				fallback,
				"With `--pr <n>` in `$ARGUMENTS`",
				"Never switch the branch of this checkout.",
			),
		],
	] as const;
	const headCheck = [
		"Without `--pr`, read `gh pr view --json number,headRefOid` for the current branch.",
		"Run `git fetch origin <headRefOid>`. When it fails, stop with principled incompletion.",
		"Print `HEAD` as the output of `git rev-parse HEAD`, and `PR_HEAD` as `headRefOid`. When `git merge-base --is-ancestor <headRefOid> HEAD` fails, stop with principled incompletion before the baseline.",
		"Print `git log --oneline <headRefOid>..HEAD` as `UNPUSHED`. CI did not test these commits, so the final report names each one.",
	];

	test.each(headCheck)(
		"the engine and the stub fallback check the head of every PR, with --pr or without it: %s",
		(sentence) => {
			expect(engineSkill).toContain(sentence);
			expect(fallback).toContain(sentence);
			for (const [, text] of onlyWithPr) expect(text).not.toContain(sentence);
		},
	);

	test("a local branch that is only ahead of the PR goes on, and the report names its commits", () => {
		for (const text of [engineSkill, fallback])
			expect(text).not.toContain("When they differ, stop");
		expect(gate).toContain(
			"Unpushed commits: the `UNPUSHED` list of the last head check. CI did not test these commits.",
		);
	});

	const push =
		"In a run with a PR, push the branch as `push` says when `HEAD` is not `PR_HEAD`.";
	const readPrHead =
		"Then read the `headRefOid` of the PR again and do the head check again.";

	test.each([
		["the decision step of SKILL.md", stepWith(engineSkill, "7. Decide.")],
		[
			"the decision step of the stub fallback",
			stepWith(fallback, "Print a gate summary and a decision."),
		],
	])(
		"%s pushes an unpushed head of the PR, then reads the head of the PR again before the summary",
		(_, step) => {
			expect(step).toContain(push);
			expect(step).toContain(readPrHead);
			expect(step.indexOf(push)).toBeLessThan(step.indexOf(readPrHead));
			expect(step.indexOf(readPrHead)).toBeLessThan(step.search(/summary/i));
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
		[
			"the decision of the stub fallback",
			sentencesFrom(fallback, "Decide:", "After the stop"),
			"It also applies in a run with a PR when `PR_HEAD` is still not `HEAD` after step 7, because the run cannot push. Then the report names each commit of `UNPUSHED`.",
		],
	])(
		"%s stops clean only on the head of the PR, and stops with principled incompletion on a commit that the run cannot push",
		(_, text, cannotPush) => {
			for (const sentence of pushedHead) expect(text).toContain(sentence);
			expect(text).toContain(cannotPush);
		},
	);

	const again =
		"When the run has a PR, read its `headRefOid` again and do the head check again. A push to the PR can move its head.";

	test.each([
		["references/gate.md", sentencesFrom(gate, "## Run it", "## Green")],
		["the gate run of the stub fallback", paragraphStarting(stub, "Gate run:")],
	])("%s checks the head of the PR again", (_, text) => {
		expect(text).toContain(again);
	});
});

describe("the branch of the fix commits", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const fix = read(`${engine}/references/fix.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
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

	test.each(playbooks)(
		"%s reads the fork fields of the PR, and pushes nothing to a fork that does not allow edits from maintainers",
		(_, text) => {
			expect(text).toMatch(readsForkFields);
			expect(text).toContain(playbookForkStop);
			expect(text).toContain(
				"Tell the owner that the fork does not allow edits from maintainers, so no fix can reach the PR.",
			);
		},
	);

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
		[
			"the stub fallback",
			fallback,
			sentencesFrom(
				fallback,
				"With `--pr <n>` in `$ARGUMENTS`",
				"Never switch the branch of this checkout.",
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

	test.each([
		["references/fix.md", fix],
		["the stub fallback", fallback],
	])(
		"%s pushes the branch of the fix commits, and pushes a branch with no upstream with git push -u origin <branch>",
		(_, text) => {
			expect(text).toContain(pushedBranch);
			expect(text).toContain(firstPush);
		},
	);

	test.each([
		["references/fix.md", fix],
		["the stub fallback", fallback],
		...playbooks,
	])(
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
		[
			"the stub fallback",
			stepWith(fallback, "Never commit on the base branch."),
			sentencesFrom(fallback, "Decide:", "After the stop"),
			"It also applies when the PR is from a fork that does not allow edits from maintainers.",
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
		["the stub fallback", fallback],
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
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
		[
			"the preflight of the stub fallback",
			sentencesFrom(fallback, "Preflight:", "Gate run:"),
		],
	])(
		"%s installs the dependencies as CI does in every worktree, not only in a new one",
		(_, text) => {
			for (const sentence of install) expect(text).toContain(sentence);
		},
	);

	test("the step that makes a worktree for --pr installs nothing of its own", () => {
		for (const text of [engineSkill, fallback])
			expect(stepWith(text, "`gh pr checkout <n> --branch")).not.toContain(
				"install",
			);
	});

	test.each([
		["references/gate.md", sentencesFrom(gate, "## Run it", "## Green")],
		["the gate run of the stub fallback", paragraphStarting(stub, "Gate run:")],
	])("%s installs the dependencies again", (_, text) => {
		expect(text).toContain("Run the install of the preflight again.");
	});
});

describe("the base, the diff and the gates of the stub fallback match the engine", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const profile = read(`${engine}/references/profile.md`);
	const review = read(`${engine}/references/review.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));

	test.each([
		"Run `git fetch origin <base>`. When it fails, or when `git rev-parse --verify origin/<base>` fails, stop with principled incompletion. The local base branch can be behind, so the run never diffs against it.",
		"When `git diff --quiet origin/<base>...HEAD` exits 0, the branch has no change to review. Stop with principled incompletion, and create no branch.",
		"CI tests the merge of the branch into the base, so the gates need every commit of the base. When `git merge-base --is-ancestor origin/<base> HEAD` fails, the branch lacks base commits. With `base.sync` set to `merge`, run `git merge origin/<base>`. With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.",
		"Print `BASE_SHA` as the output of `git rev-parse origin/<base>`. Every diff of the run is `git diff <BASE_SHA>...HEAD`.",
		"Print `WORKTREE` as the output of `git rev-parse --show-toplevel`. Start every command of the run with `cd <WORKTREE> &&`, because a tool call can start in another directory.",
	])("the engine and the stub fallback say %s", (sentence) => {
		expect(engineSkill).toContain(sentence);
		expect(fallback).toContain(sentence);
	});

	test("no run diffs against the local base branch", () => {
		for (const text of [engineSkill, gate, profile, review, fallback])
			expect(text).not.toMatch(/(?<!origin\/)<base>\.\.\.HEAD/);
	});

	const reviewerDiff =
		"`git -C <WORKTREE> diff <BASE_SHA>...<HEAD>`, with the path and both SHAs written out";

	test.each([
		["SKILL.md", engineSkill],
		["references/review.md", review],
		["the stub fallback", fallback],
	])(
		"%s gives each reviewer the absolute worktree and the pinned SHAs",
		(_, text) => {
			expect(text).toContain(reviewerDiff);
		},
	);

	test("the stub fallback gives each reviewer the notes of the profile, as the engine does", () => {
		expect(review).toContain("every line of `reviewers.notes`");
		expect(fallback).toContain(
			"Give each one every line of `reviewers.notes`.",
		);
	});

	const globs = sentencesFrom(
		profile,
		"A glob matches the whole repo-relative path.",
		"prints the paths that make the gate apply.",
	);

	test.each([
		["references/gate.md", gate],
		["the stub fallback", fallback],
	])(
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

	test("a gate whose earlier gate did not pass is BLOCKED in the engine and in the stub fallback", () => {
		expect(fallback).toContain(blocked);
		expect(gate).toContain("no gate is `NOT_STARTED` or `BLOCKED`");
	});

	const redGate = sentencesFrom(
		gate,
		"A red gate is a finding `G<n>.<k>`",
		"The run cannot stop clean while it stays red.",
	);

	test("a red gate that the PR made is a finding, and a pre-existing red is never fixed, in the engine and in the stub fallback", () => {
		expect(redGate).toContain("never fix it");
		expect(fallback).toContain(redGate);
		expect(fallback).toContain(
			"The gate findings of the last gate run are blocking findings too.",
		);
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
		["the gate run of the stub fallback", paragraphStarting(stub, "Gate run:")],
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const prune =
		"First delete the `node_modules` folder next to each `package.json` that git tracks, with `cd <WORKTREE> && git ls-files -z ':(glob)**/package.json' | while IFS= read -r -d '' file; do rm -rf -- \"$(dirname -- \"$file\")/node_modules\"; done`. A frozen install keeps a package that the lockfile no longer lists, and CI installs into a new checkout.";

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
		],
		[
			"the preflight of the stub fallback",
			sentencesFrom(fallback, "Preflight:", "Gate run:"),
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
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

	function ruleOf(text: string): string {
		const from = text.indexOf(ruleStart);
		if (from === -1) throw new Error(`no sentence starts with "${ruleStart}"`);
		return text.slice(from, text.indexOf(". ", from) + 1);
	}

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

	test.each([
		["SKILL.md", engineSkill],
		["the stub fallback", fallback],
	])(
		"%s takes the no-PR message of gh as no PR, with an uppercase or a lowercase first letter",
		(_, text) => {
			const rule = ruleOf(text);
			expect(noPrMessages.filter((message) => !isNoPr(rule, message))).toEqual(
				[],
			);
		},
	);

	test.each([
		["SKILL.md", engineSkill],
		["the stub fallback", fallback],
	])("%s never takes another failure of gh as no PR", (_, text) => {
		const rule = ruleOf(text);
		expect(failures.filter((message) => isNoPr(rule, message))).toEqual([]);
	});

	test("SKILL.md and the stub fallback give the same rule, and each other failure stops the run", () => {
		const rule = ruleOf(engineSkill);
		expect(ruleOf(fallback)).toBe(rule);
		for (const text of [engineSkill, fallback]) {
			expect(text).toContain(
				"Each other failure of a `gh pr view` of the run stops the run with principled incompletion, and the run prints the error of gh.",
			);
			expect(text).not.toContain("When it finds no PR, the run has no PR");
			expect(text).not.toContain("that `gh pr view --json number` finds");
		}
	});

	const prHeadCheck =
		"The state and the diff of a PR hold for its `headRefOid` only. Compare `git rev-parse HEAD` with `headRefOid` before you act on the PR.";
	const noPrRule =
		"There is no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`. Each other failure of `gh pr view` is an error, not a missing PR. Print the error of gh, and stop.";
	const ownForms: readonly (readonly [string, string])[] = [
		[
			`${engine}/SKILL.md`,
			"The engine holds the run form of both rules, which the tests above and the head check tests pin.",
		],
		[
			`${engine}/references/gate.md`,
			"The gate run does the head check of SKILL.md again.",
		],
		[
			"marketplace/plugins/astack/README.md",
			"It says what the merge guard reads, and has no step that acts on a PR.",
		],
	];
	const noPrListRule =
		"There is no PR only when `gh pr list` exits 0 and prints no PR. Each other failure of `gh pr list` is an error, not a missing PR. Print the error of gh, and stop.";
	const prRead =
		/\bgh pr (?:view|list|status|checks|diff)\b|\bgh api\b[^\n]*\bpulls\b|\bheadRefOid\b/;
	const lookups: readonly (readonly [RegExp, string])[] = [
		[/\bgh pr (?:view|status)\b/, noPrRule],
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
	const missingRules = (path: string, text = read(path)): string[] =>
		readLines(path, text).flatMap((line) =>
			lookups
				.filter(([lookup, rule]) => lookup.test(line) && !text.includes(rule))
				.map(([, rule]) => rule),
		);

	test("the no-PR rule of the other astack texts takes only the no-PR message of gh as no PR", () => {
		expect(
			noPrMessages.filter((message) => !isNoPr(noPrRule, message)),
		).toEqual([]);
		expect(failures.filter((message) => isNoPr(noPrRule, message))).toEqual([]);
	});

	test("each astack text and profile that reads a PR with gh compares the head of the PR with the local head", () => {
		expect(
			prReaders.filter((path) => !read(path).includes(prHeadCheck)),
		).toEqual([]);
	});

	test("each astack text and profile that looks up a PR with gh stops on a failure of gh that is not the no-PR answer", () => {
		expect(prReaders.filter((path) => missingRules(path).length > 0)).toEqual(
			[],
		);
	});

	test("the scan finds a lookup through gh pr list that reads an empty list as no PR, and each row of the reason table still names a line", () => {
		const triage =
			"marketplace/plugins/astack/skills/mode/references/comments-triage.md";
		expect(
			missingRules(
				triage,
				read(triage)
					.replace(
						"`gh pr view --json number,url,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`",
						"`gh pr list --head <branch> --state open --json number,url,headRefName,headRefOid,baseRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`",
					)
					.replace(noPrRule, "When the list is empty, there is no PR."),
			),
		).toEqual([noPrListRule]);
		expect(
			describesOnly.filter((row) => !read(row.path).includes(row.line)),
		).toEqual([]);
	});

	test("the scan finds a text that runs gh pr view, a text that runs gh pr list and a text that only names headRefOid, and each own form still reads a PR", () => {
		expect(prReaders).toEqual(
			expect.arrayContaining([
				"marketplace/plugins/astack/skills/mode/references/resume.md",
				"marketplace/plugins/astack/skills/mode/references/create-pr.md",
				"marketplace/plugins/astack/skills/plan/references/sessions.md",
			]),
		);
		expect(ownForms.filter(([path]) => !prRead.test(read(path)))).toEqual([]);
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const ask =
		"A dev server or another session can use the `node_modules` folders of a checkout that the run did not create, such as the current checkout. So before the first delete in such a checkout, print `WORKTREE` and ask the owner. Without a yes, stop with principled incompletion. The yes holds for each later install of the run.";

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
		],
		[
			"the preflight of the stub fallback",
			sentencesFrom(fallback, "Preflight:", "Gate run:"),
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const listed = "`git diff --name-only --no-renames <BASE_SHA>...HEAD`";
	const reason =
		"CI splits a rename into a delete and an add, so `--no-renames` lists both paths.";

	test.each([
		["references/gate.md", gate],
		["references/profile.md", profile],
		["the stub fallback", fallback],
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const ciCheck = [
		"`astack check ci-pins --base <BASE_SHA>`, and print its output and its exit code. It exits 3 when the diff changes only paths under `.github/workflows/` or `.github/actions/`, or in the folder of a local action that a workflow uses. For exit 3, each tool version that CI sets up stays the same, and the last line starts with `ci_proof:`. The check reads the tools of the setup steps, the runner, the container and service images and the ref of a remote reusable workflow. It does not read a tool that a `run` step or a script installs, so the review examines such a change. When the diff also changes another file, the check exits 1, because a red gate can then come from that file. A version file is a file that a workflow or an action names in a `-version-file` input. The check exits 1 when the diff changes a version file and the version that the setup action reads from it changes. It also exits 1 when it cannot read an exact version from a version file at `BASE_SHA` or at `HEAD`. It also exits 1 when the diff changes CI and a tool version that CI sets up, or when it cannot read such a version. When it exits 0 and its last line starts with `ok:`, the run goes on. When it exits 3 and its last line starts with `ci_proof:`, the run goes on in mode `ci_proof`. Otherwise stop with principled incompletion. With no node and no bun, the launcher prints a note and exits 0, so the exit code alone is not a pass.",
		"Another change to a version file, such as a new dependency in `package.json`, gets the gates of the run.",
		"The gates mirror the CI that astack apply read, and CI runs the workflows of the PR, so only CI can prove a CI change.",
		"In mode `ci_proof`, the run reviews, fixes and gates the PR as usual.",
	];
	const recorded = {
		engine:
			"It records the mode in the ledger, in each `GATE_SUMMARY` and in each PR comment.",
		stub: "It records the mode in the ledger, in each gate summary and in each PR comment.",
	};
	const exitOne = /\bwhen it does not exit 0\b/i;
	const everyVersionFile =
		"`-version-file` input, stop with principled incompletion";
	const noCli =
		"When `command -v astack` fails, the run cannot do this check. Then stop with principled incompletion when the diff changes a path under `.github/workflows/` or `.github/actions/`, or a version file. Also stop when it changes a path in the folder of a local action that a workflow uses.";

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
		],
		[
			"the preflight of the stub fallback",
			sentencesFrom(fallback, "Preflight:", "Gate run:"),
		],
	])("%s stops, because the gates mirror the CI that apply read", (_, text) => {
		for (const sentence of ciCheck) expect(text).toContain(sentence);
		expect(text).not.toContain(everyVersionFile);
	});

	test.each([
		[
			"the preflight of SKILL.md",
			sentencesFrom(engineSkill, "## Preflight", "## Baseline"),
			recorded.engine,
		],
		[
			"the preflight of the stub fallback",
			sentencesFrom(fallback, "Preflight:", "Gate run:"),
			recorded.stub,
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

	test("the reviewers of mode ci_proof learn that only they examine the CI files and each tool that a run step installs, in the engine and in the stub", () => {
		const review = sentencesFrom(
			read(`${engine}/references/review.md`),
			"Every reviewer prompt carries:",
			"## The ledger",
		);
		const stubReview = stepWith(fallback, "Print `REVIEWED_HEAD`");
		for (const sentence of [
			"in mode `ci_proof`, that the gates mirror the CI of the base, so only the review examines the CI files before CI runs.",
			"`astack check ci-pins` does not read a tool that a `run` step or a script installs, so a change to such an install is a blocking finding;",
		])
			expect(review).toContain(sentence);
		for (const sentence of [
			"In mode `ci_proof`, also tell each one that the gates mirror the CI of the base. So only the review examines the CI files before CI runs.",
			"Also tell each one that `astack check ci-pins` does not read a tool that a `run` step or a script installs. A change to such an install is a blocking finding.",
		])
			expect(stubReview).toContain(sentence);
	});

	test("the gate run takes the mode of its own CI check, and the ledger and the PR comment hold it", () => {
		expect(
			sentencesFrom(
				read(`${engine}/references/review.md`),
				"## The ledger",
				"## Review-bot threads",
			),
		).toContain(
			"The ledger also holds `mode`, the mode of the last CI check of the run, `standard` or `ci_proof`.",
		);
		expect(stepWith(fallback, "If `proof.pr_comment` is set")).toContain(
			"It also holds the mode, and each advisory gate of mode `ci_proof` with its proof.",
		);
		expect(stepWith(fallback, "Print `BASE_SHA`")).toContain(
			"The mode follows the result of the last check of the run.",
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

	test.each([
		["the green gate of references/gate.md", gate],
		["the red gates of the stub fallback", fallback],
	])(
		"%s makes a red gate of mode ci_proof advisory only with its proof",
		(_, text) => {
			for (const sentence of advisory) expect(text).toContain(sentence);
			expect(text).not.toContain("git grep");
		},
	);

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
		[
			"the steps after the stop of the stub fallback",
			paragraphStarting(fallback, "After the stop,"),
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
			"In that mode, do the read-back after the push of the decision step of each iteration that is clean otherwise, and again before a merge. A clean stop and a merge each need it to pass.",
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
			"In mode `ci_proof`, the run also does the CI read-back of `references/gate.md` before a clean stop and before a merge, whatever `after_clean_stop` and `conditions` say.",
		);
		expect(paragraphStarting(gate, "/goal Run")).toContain(
			"with every gate exit 0, or ADVISORY_CI_PROOF only when that GATE_SUMMARY shows mode ci_proof,",
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
			"Also the mode of the run. In mode `ci_proof`, also each advisory gate with its proof, and the result of the CI read-back.",
		);
		expect(paragraphStarting(fallback, "After the stop,")).toContain(
			"Also report the mode of the run, and in mode `ci_proof` each advisory gate with its proof.",
		);
	});

	test("the engine merges in mode ci_proof only after the CI read-back, and the stub does the same", () => {
		expect(
			sentencesFrom(engineSkill, "## After the stop", "## References"),
		).toContain(
			"In mode `ci_proof`, also do the CI read-back of `references/gate.md`, and merge only when it passes.",
		);
		expect(paragraphStarting(fallback, "After the stop,")).toContain(
			"In mode `ci_proof`, merge only when the CI read-back passes.",
		);
	});

	test("a finding whose fix needs a CI edit is out-of-scope in mode ci_proof, because a fix never edits CI", () => {
		expect(
			sentencesFrom(
				read(`${engine}/references/fix.md`),
				"## Fix fence",
				"## Files that astack writes",
			),
		).toContain(
			"In mode `ci_proof`, the diff holds CI files, and the reviewers review them like each other file. A fix never edits CI, also in that mode, and `forbidden.paths` still holds. So a finding whose fix needs a CI edit is `out-of-scope`.",
		);
		expect(fallback).toContain(
			"No dependency, lockfile, migration or CI edits, and nothing under `forbidden.paths`.",
		);
		for (const text of [
			sentencesFrom(
				read(`${engine}/references/fix.md`),
				"## Fix fence",
				"## Files that astack writes",
			),
			fallback,
		])
			expect(text).toContain(
				"A CI file is each path that `astack check ci-pins` prints with `the PR changes this CI file.`, also a script in the folder of a local action.",
			);
	});

	test("the stub fallback stops on each change to a version file only when no astack command is on the PATH", () => {
		const step = stepWith(fallback, "Print `BASE_SHA`");
		expect(step).toContain(
			"When `command -v astack` succeeds, run `astack check ci-pins --base <BASE_SHA>`",
		);
		expect(step).toContain(noCli);
		expect(engineSkill).not.toContain("command -v astack");
	});

	test("each gate run of the engine does the CI check again, and the stub repeats the step that holds it", () => {
		expect(sentencesFrom(gate, "## Run it", "## Green")).toContain(
			"Do the CI check of the preflight again. Its result sets the mode of the run.",
		);
		for (const sentence of ciCheck)
			expect(stepWith(fallback, "Print `BASE_SHA`")).toContain(sentence);
		expect(stepWith(fallback, "Print `BASE_SHA`")).toStartWith("7. ");
		expect(paragraphStarting(stub, "Gate run:")).toContain(
			"do preflight steps 6 and 7 again",
		);
	});
});

describe("a clean iteration commits no fix", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const unseen =
		"An iteration that commits a fix in step 4 is not clean, because no reviewer saw that commit.";

	test.each([
		[
			"the decision of SKILL.md",
			sentencesFrom(engineSkill, "## Decide", "## After the stop"),
		],
		[
			"the decision of the stub fallback",
			sentencesFrom(fallback, "Decide:", "After the stop"),
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
		[
			"the review step of the stub fallback",
			stepWith(fallback, "Launch the `pr-review-toolkit` review agents"),
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
		[
			"the decision of the stub fallback",
			sentencesFrom(fallback, "Decide:", "After the stop"),
		],
	])(
		"%s stops clean only on the head that the reviewers saw, whatever commit came after them",
		(_, text) => {
			expect(text).toContain(cleanHead);
		},
	);
});

describe("the proof of a clean stop", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
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
				"with every gate exit 0",
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
				"In mode `ci_proof`, a clean stop also needs `mode: ci_proof` in the `GATE_SUMMARY`",
			fields: ["mode"],
			goal: [
				"If the CI check gave mode ci_proof, that GATE_SUMMARY also shows mode ci_proof and ciReadBack pass.",
			],
		},
		{
			condition:
				"In mode `ci_proof`, a clean stop also needs `ciReadBack: pass` in the `GATE_SUMMARY`",
			fields: ["ciReadBack"],
			goal: ["that GATE_SUMMARY also shows mode ci_proof and ciReadBack pass"],
		},
		{
			condition: "so a run of mode `ci_proof` without a PR cannot stop clean",
			fields: ["ciReadBack", "prHead"],
			goal: ["mode ci_proof and ciReadBack pass", "prHead equal to headSha"],
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
			"decision: continue | stop_clean | stop_recurring | stop_principled_incompletion",
		mode: "`mode` is the mode of the last CI check of the run.",
		ciReadBack:
			"`ciReadBack` is the result of the CI read-back of the iteration, `pass` or `fail`, or `not_run` when the iteration did no read-back.",
	};

	test("the stop_clean bullet of the engine and of the stub fallback holds only the conditions that the proof rows name", () => {
		expect(paragraphStarting(decide, "- `stop_clean`:")).toBe(
			"- `stop_clean`: the iteration is clean and `n >= iterations.min`.",
		);
		expect(
			paragraphStarting(
				sentencesFrom(fallback, "Decide:", "After the stop"),
				"- `stop_clean`:",
			),
		).toBe(
			"- `stop_clean`: the iteration found no blocking finding, the comment gate removed nothing and every gate exited 0 or is an advisory gate of mode `ci_proof`. Also, the metrics held, and at least `iterations.min` iterations have run. An iteration that commits a fix in step 4 is not clean, because no reviewer saw that commit. A clean stop also needs `REVIEWED_HEAD` to equal the output of `git rev-parse HEAD` after the last gate run. No reviewer saw a commit that comes after the review, such as the merge of a moved base in a gate run. A clean stop also needs a diff from the base that is not empty. In a run with a PR, a clean stop also needs `PR_HEAD` to equal `HEAD` after the push of step 7. CI tests only the head of the PR, so a review or a gate run of an unpushed commit proves nothing for the PR. In mode `ci_proof`, a clean stop also needs the mode in the gate summary, so the report names the mode. It also needs a CI read-back that passes on `PR_HEAD`, as the steps after the stop say, whatever `merge.after_clean_stop` says. A run of mode `ci_proof` without a PR stops with principled incompletion.",
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
		["the stub fallback", stub],
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

	test("the scan reads the review reference and the stub fallback, which take the blob of each ledger entry", () => {
		expect(
			blobTexts
				.filter(([, text]) => blobForms(text).length > 0)
				.map(([name]) => name),
		).toEqual([`${engine}/references/review.md`, "the stub fallback"]);
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
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	const reset =
		"With `false`, rename an existing ledger to `<branch>.<UTC timestamp>.json` and start empty.";
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
			"the stub fallback",
			sentencesFrom(fallback, "Preflight:", "Gate run:"),
			sentencesFrom(fallback, "Gate run:", "Decide:"),
		],
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

	test("the stub fallback renames an earlier ledger in its preflight, before the first iteration", () => {
		expect(sentencesFrom(fallback, "Preflight:", "Gate run:")).toContain(reset);
	});

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
	const stubLoad = stepWith(fallback, "Load the ledger once per run");

	test.each([
		["references/review.md", ledgerRule],
		["the preflight of the stub fallback", stubLoad],
	])(
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
		["the preflight of the stub fallback", stubLoad],
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
		["the stub fallback", paragraphStarting(fallback, "After the stop,")],
	])(
		"the steps after the stop in %s record the decision in the ledger, so the next run does not resume a run that stopped",
		(_, text) => {
			expect(text).toContain(stopRecord);
		},
	);
});

describe("each sentence of the run has a counterpart in the stub fallback", () => {
	const engineSkill = read(`${engine}/SKILL.md`);
	const gate = read(`${engine}/references/gate.md`);
	const review = read(`${engine}/references/review.md`);
	const fallback = stub.slice(stub.indexOf("## Fallback"));
	type Counterpart =
		| {
				readonly engine: string;
				readonly stub: readonly string[];
				readonly leaves?: string;
		  }
		| { readonly engine: string; readonly unread: string }
		| { readonly engine: string; readonly reason: string };

	const stubbed = (key: string, ...texts: string[]): Counterpart => ({
		engine: key,
		stub: texts,
	});
	const unread = (key: string, profileKey: string): Counterpart => ({
		engine: key,
		unread: profileKey,
	});
	const reasoned = (key: string, reason: string): Counterpart => ({
		engine: key,
		reason,
	});
	const explains =
		"It gives the reason for a step. It holds no step or stop of its own.";
	const pointer =
		"It names the reference that holds the detail. The stub states the short form in its own steps.";
	const noChecklist =
		"references/checklist.md ships only in the astack plugin, and the fallback runs when the plugin is absent. So the fallback has no checklist pass, no class field in its ledger and no lesson candidates.";

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

	const argumentsRows: readonly Counterpart[] = [
		stubbed("Arguments: `$ARGUMENTS`.", "Read the arguments, `$ARGUMENTS`."),
		stubbed(
			"A bare word is the base branch.",
			"A bare word is the base branch.",
		),
		stubbed(
			"`--pr <number>` names the pull request.",
			"`--pr <number>` names the pull request.",
		),
		stubbed(
			"Without `--pr`, the PR is the one that the head check finds",
			"Without `--pr`, the PR is the one that the head check finds for the current branch, if any.",
		),
	];

	const reviewPrRows: readonly Counterpart[] = [
		stubbed(
			"reviews the head of that PR and nothing else",
			"With `--pr <n>` in `$ARGUMENTS`, select the head of that PR first",
		),
		stubbed(
			"Do these steps before you load the profile",
			"because the profile of the PR head applies",
		),
		stubbed(
			"and print the three ref values",
			"1. Read `gh pr view <n> --json headRefName,headRefOid,baseRefName,state,isCrossRepository`, and print the three ref values.",
		),
		stubbed(
			"Stop with principled incompletion when `state` is not `OPEN`.",
			"Stop with principled incompletion when `state` is not `OPEN`.",
		),
		stubbed(
			"The local branch of the PR is `headRefName`",
			"The local branch of the PR is `headRefName`, or `pr-<n>` when `isCrossRepository` is true.",
		),
		stubbed(
			"A branch of a fork can have the name of a local branch",
			"A branch of a fork can have the name of a local branch, such as `main`.",
		),
		stubbed(
			"So the run never takes a checkout by the head branch name",
			"So the run never takes a checkout by the head branch name of a PR from a fork.",
		),
		stubbed(
			"When `git branch --show-current` prints the local branch of the PR",
			"When `git branch --show-current` prints the local branch of the PR, stay in this checkout.",
		),
		stubbed(
			"Otherwise, look for the local branch of the PR in `git worktree list --porcelain`",
			"Otherwise continue in the worktree that holds the local branch of the PR in `git worktree list --porcelain`.",
		),
		stubbed(
			"When no worktree holds it",
			"When no worktree holds it, run `git worktree add --detach <dir>` with a new directory outside this checkout.",
		),
		stubbed(
			"Then run `gh pr checkout <n> --branch <local branch>` in it.",
			"Then run `gh pr checkout <n> --branch <local branch>` in it.",
		),
		stubbed(
			"Continue the run in that worktree.",
			"Continue the run in that worktree.",
		),
		stubbed(
			"Never switch the branch of this checkout.",
			"Never switch the branch of this checkout.",
		),
		stubbed(
			"With `--pr`, the base branch is the bare word",
			"With `--pr`, the base branch is the bare word, else the PR's `baseRefName`, whatever `base.from_pr` says.",
		),
		stubbed(
			"Never create a review branch in a run with `--pr`.",
			"Never create a review branch in a run with `--pr`.",
		),
		stubbed(
			"The fix commits go on the local branch of the PR.",
			"In a run with `--pr`, the fix commits go on the local branch of the PR.",
		),
		reasoned("A new worktree has no file that git ignores", explains),
		stubbed(
			"A gate prerequisite that checks such a file stops the run there",
			"If a variable or a prerequisite is still missing, stop with principled incompletion before running anything. Name the gate and the missing item.",
		),
	];

	const headCheckRows: readonly Counterpart[] = [
		stubbed("CI tests the head of the PR.", "CI tests the head of the PR."),
		reasoned("gives a stale tree to the reviewers and the gates", explains),
		stubbed(
			"So every run with a PR does the head check",
			"So every run with a PR does the head check, with `--pr` or without it, before it reads the profile:",
		),
		stubbed(
			"Without `--pr`, read `gh pr view --json number,headRefOid`",
			"Without `--pr`, read `gh pr view --json number,headRefOid` for the current branch.",
		),
		stubbed(
			"The run has no PR only when gh exits 1",
			"The run has no PR only when gh exits 1 and its standard error matches `grep -qi 'no pull requests found for branch'`.",
		),
		stubbed("Then it skips this check.", "Then it skips this check."),
		stubbed(
			"gh can start that message with an uppercase or a lowercase letter.",
			"gh can start that message with an uppercase or a lowercase letter.",
		),
		stubbed(
			"Each other failure of a `gh pr view` of the run stops the run",
			"Each other failure of a `gh pr view` of the run stops the run with principled incompletion, and the run prints the error of gh.",
		),
		stubbed(
			"Run `git fetch origin <headRefOid>`.",
			"Run `git fetch origin <headRefOid>`.",
		),
		stubbed(
			"When it fails, stop with principled incompletion.",
			"Run `git fetch origin <headRefOid>`. When it fails, stop with principled incompletion.",
		),
		stubbed(
			"Print `HEAD` as the output of `git rev-parse HEAD`",
			"Print `HEAD` as the output of `git rev-parse HEAD`, and `PR_HEAD` as `headRefOid`.",
		),
		stubbed(
			"When `git merge-base --is-ancestor <headRefOid> HEAD` fails",
			"When `git merge-base --is-ancestor <headRefOid> HEAD` fails, stop with principled incompletion before the baseline.",
		),
		reasoned("so the owner pulls first", explains),
		stubbed(
			"as `UNPUSHED`.",
			"Print `git log --oneline <headRefOid>..HEAD` as `UNPUSHED`.",
		),
		stubbed(
			"CI did not test these commits, so the final report names each one.",
			"CI did not test these commits, so the final report names each one.",
		),
		stubbed(
			"Each gate run does the head check again",
			"read its `headRefOid` again and do the head check again",
		),
	];

	const authorityRows: readonly Counterpart[] = [
		reasoned("are the truth", explains),
		stubbed("decide pass or fail", "Gates decide."),
		stubbed(
			"The comment gate decides which comments survive.",
			"5. Comment gate.",
		),
		stubbed("Its findings block.", "the comment gate removed nothing"),
		stubbed(
			"Reviewers produce candidate findings.",
			"Reviewers only propose findings.",
		),
		stubbed("They decide nothing.", "Reviewers only propose findings."),
		stubbed("Prose is never proof", "Prose is not proof."),
		stubbed(
			"Every stop decision rests on output printed in the transcript.",
			"Print a gate summary and a decision.",
		),
		stubbed(
			"When a reviewer claim and a green gate disagree",
			"3. Reproduce each candidate.",
		),
		stubbed(
			"If it does not reproduce, it is advisory.",
			"It blocks only when the reproduction shows a concrete failure that the PR introduces.",
		),
	];

	const loadRows: readonly Counterpart[] = [
		stubbed(
			"read `.claude/pr-review-hardening.profile.md` there",
			"Read the YAML block in the profile.",
		),
		stubbed(
			"Take the first fenced code block tagged `yaml` or `json`.",
			"Read the YAML block in the profile.",
		),
		stubbed(
			"defines every key and its default",
			"The fallback has no defaults, so the profile defines every key that it reads.",
		),
		stubbed(
			"If the file is missing or the block does not parse",
			"If the file is missing or the block does not parse, stop with principled incompletion.",
		),
		reasoned(
			"Offer to draft a profile",
			"The draft procedure is in references/profile.md of the astack plugin, which the fallback runs without.",
		),
		stubbed(
			"Never run gate commands you guessed.",
			"Never run a gate command that you guessed.",
		),
		stubbed(
			"Print `RUN_CONFIG`.",
			"Print the base branch, each `gates[].command` and the `test.command`, the reviewers and the iteration bounds.",
		),
		stubbed(
			"It holds the profile path and its `git hash-object`",
			"Print the base branch, each `gates[].command`",
		),
		stubbed(
			"It holds each gate with its command",
			"Print the base branch, each `gates[].command`",
		),
		stubbed(
			"It also holds the reviewer set",
			"the reviewers and the iteration bounds",
		),
		stubbed(
			"When `metrics` is not `null`, it holds the metrics command",
			"When `metrics` is not `null`, also print `metrics.command`.",
		),
		stubbed(
			"Last are the repo keep patterns",
			"one of its lines matches `comments.keep_patterns`, with or without its comment marker",
		),
		stubbed(
			"It holds no value from the session or from a file.",
			"Never print a value from the session or from a file.",
		),
		stubbed(
			"The config is frozen for the run.",
			"They stay fixed for the run.",
		),
		stubbed(
			"Never edit the profile, package scripts",
			"No suppressions, no config weakening",
		),
		stubbed(
			"The profile's gates mirror the blocking jobs of the repo's CI.",
			"The profile's gates mirror the blocking jobs of the repo's CI.",
		),
		stubbed(
			"A gate that applies but cannot start is an unclean stop.",
			"A gate that applies but cannot start is an unclean stop.",
		),
		stubbed("The run never skips it.", "The run never skips it."),
		stubbed(
			"says when a gate applies and when it cannot start",
			"An empty `when_changed` means that the gate applies to every diff.",
		),
		stubbed(
			"Each gate runs with `CI=true`",
			"Each gate runs in the CI environment of its jobs.",
		),
	];

	const rulesRows: readonly Counterpart[] = [
		stubbed(
			"Print these at the start of every iteration",
			"Print these rules at the start of every iteration, followed by the profile's `guardrails`:",
		),
		stubbed("Gates decide.", "Gates decide."),
		stubbed("Reviewers advise.", "Reviewers only propose findings."),
		stubbed("Prose is not proof.", "Prose is not proof."),
		stubbed("Gates are read-only.", "- Gates are read-only."),
		stubbed(
			"A gate that changes a tracked file outside its `rewrites` is red.",
			"A gate that changes a tracked file outside its `rewrites` is red.",
		),
		stubbed(
			"No suppressions, no config weakening",
			"No suppressions, no config weakening, no deleted or narrowed tests, no type laundering.",
		),
		stubbed("The fix fence holds.", "Edit only the files a finding names."),
		stubbed(
			"Edit only the files a finding names.",
			"Edit only the files a finding names.",
		),
		stubbed(
			"A file that astack writes is fixed in the astack repo",
			"its fix goes to the astack repo",
		),
		stubbed(
			"A fix can add a test or script that fails for the finding's reason.",
			"A fix can add a test or script that fails for the finding's reason.",
		),
		stubbed(
			"Run the failing check before the fix.",
			"Run the failing check before the fix.",
		),
		stubbed("Record its output.", "Record its output."),
		stubbed(
			"Then commit the test or script together with the fix",
			"Then commit the test or script together with the fix, so every commit is green.",
		),
		stubbed(
			"The PR's Verification shows the failing run first",
			"The PR's Verification shows the failing run first, then the passing run.",
		),
		stubbed("Each finding owns its commits.", "Each finding owns its commits."),
		stubbed("No commit holds two findings.", "No commit holds two findings."),
		stubbed(
			"No comment survives outside the keep list",
			"Otherwise delete every comment on an added or changed line unless it is on the keep list.",
		),
		stubbed(
			"Print a value only when the profile holds it",
			"Print a value only when the profile holds it, such as a `ci_env` value.",
		),
		stubbed(
			"Never print a value from the session or from a file.",
			"Never print a value from the session or from a file.",
		),
		stubbed(
			"Such a value can be a secret",
			"Such a value can be a secret, such as a token, a key or a database URL.",
		),
		stubbed(
			"Stop at the iteration limit, on recurrence, or on principled incompletion.",
			"- `stop_recurring`: a finding came back after one fix attempt.",
			"the run reached `iterations.max`",
		),
		stubbed(
			"A clean stop needs at least `iterations.min` iterations.",
			"at least `iterations.min` iterations have run",
		),
		reasoned(
			"This loop runs now.",
			"The fallback runs the loop in the session that reads it, so it has no step that hands the loop to another command.",
		),
		reasoned(
			"Do not hand it to `/loop`",
			"The fallback runs the loop in the session that reads it, so it has no step that hands the loop to another command.",
		),
	];

	const preflightRows: readonly Counterpart[] = [
		stubbed(
			"Print `git branch --show-current` and `git status --short`.",
			"Print `WORKTREE` as the output of `git rev-parse --show-toplevel`.",
		),
		stubbed(
			"Print `WORKTREE` as the output of `git rev-parse --show-toplevel`.",
			"Print `WORKTREE` as the output of `git rev-parse --show-toplevel`.",
		),
		stubbed(
			"Start every command of the run with `cd <WORKTREE> &&`",
			"Start every command of the run with `cd <WORKTREE> &&`, because a tool call can start in another directory.",
		),
		stubbed(
			"Resolve the base branch.",
			"Without `--pr`, the base branch is the bare word, else the PR's base when `base.from_pr` is true and a PR exists, else `base.default`.",
		),
		stubbed("Use the argument if given.", "A bare word is the base branch."),
		stubbed(
			"Otherwise, with `--pr`, use the PR's `baseRefName`.",
			"With `--pr`, the base branch is the bare word, else the PR's `baseRefName`",
		),
		stubbed(
			"Otherwise, when `base.from_pr` is true and a PR exists",
			"else the PR's base when `base.from_pr` is true and a PR exists",
			"Read the PR's base with `gh pr view <n> --json baseRefName`.",
		),
		stubbed("Otherwise use `base.default`.", "else `base.default`."),
		stubbed(
			"The working tree must be clean",
			"2. The working tree must be clean.",
		),
		stubbed(
			"If it is not, stop and ask what to do with the changes.",
			"If it is not, stop and ask what to do with the changes.",
		),
		stubbed(
			"Run `git fetch origin <base>`.",
			"3. Run `git fetch origin <base>`.",
		),
		stubbed(
			"When it fails, or when `git rev-parse --verify origin/<base>` fails",
			"When it fails, or when `git rev-parse --verify origin/<base>` fails, stop with principled incompletion.",
		),
		stubbed(
			"The local base branch can be behind",
			"The local base branch can be behind, so the run never diffs against it.",
		),
		stubbed(
			"When `git diff --quiet origin/<base>...HEAD` exits 0",
			"4. When `git diff --quiet origin/<base>...HEAD` exits 0, the branch has no change to review.",
		),
		stubbed(
			"Stop with principled incompletion, and create no branch.",
			"Stop with principled incompletion, and create no branch.",
		),
		stubbed(
			"If the current branch is the base branch",
			"If you are on it, create a branch named by `conventions.branch.create`.",
		),
		stubbed(
			"When `conventions.branch.pattern` is set",
			"When `conventions.branch.pattern` is not null, the name must match it.",
		),
		stubbed(
			"In a run with `--pr`, the run is on the local branch of the PR and creates no branch.",
			"Never create a review branch in a run with `--pr`.",
		),
		stubbed(
			"Without `--pr`, the fix commits go on the current branch",
			"Without `--pr`, the fix commits go on the current branch, or on the branch that this step creates.",
		),
		stubbed(
			"Never commit to the base branch.",
			"Never commit on the base branch.",
		),
		stubbed("Never force-push.", "Never force-push"),
		stubbed(
			"In a run with a PR, read `gh pr view <n> --json headRefName",
			"In a run with a PR, read `gh pr view <n> --json headRefName,headRepositoryOwner,headRepository,isCrossRepository,maintainerCanModify`.",
		),
		stubbed(
			"When `isCrossRepository` is true, the PR is from a fork",
			"When `isCrossRepository` is true, the run pushes with `git push <head repository URL> HEAD:<headRefName>`, and never pushes a branch to `origin`.",
		),
		stubbed(
			"When `isCrossRepository` is true and `maintainerCanModify` is false",
			"When `isCrossRepository` is true and `maintainerCanModify` is false, the run makes no fix commit, and it stops with principled incompletion.",
		),
		stubbed(
			"The report says that the fork does not allow edits from maintainers",
			"The report says that the fork does not allow edits from maintainers, so the run cannot push a fix.",
		),
		stubbed(
			"CI tests the merge of the branch into the base",
			"CI tests the merge of the branch into the base, so the gates need every commit of the base.",
		),
		stubbed(
			"When `git merge-base --is-ancestor origin/<base> HEAD` fails",
			"When `git merge-base --is-ancestor origin/<base> HEAD` fails, the branch lacks base commits.",
		),
		stubbed(
			"With `base.sync` set to `merge`",
			"With `base.sync` set to `merge`, run `git merge origin/<base>`.",
		),
		stubbed(
			"With `none`, print `git log --oneline HEAD..origin/<base>`",
			"With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.",
		),
		stubbed(
			"Print `BASE_SHA` as the output of `git rev-parse origin/<base>`.",
			"7. Print `BASE_SHA` as the output of `git rev-parse origin/<base>`.",
		),
		stubbed(
			"Every diff of the run is `git diff <BASE_SHA>...HEAD`.",
			"Every diff of the run is `git diff <BASE_SHA>...HEAD`.",
		),
		stubbed(
			"Run `astack check ci-pins --base <BASE_SHA>`",
			"run `astack check ci-pins --base <BASE_SHA>`, and print its output and its exit code.",
		),
		stubbed(
			"It exits 3 when the diff changes only paths under",
			"It exits 3 when the diff changes only paths under `.github/workflows/` or `.github/actions/`, or in the folder of a local action that a workflow uses.",
		),
		stubbed(
			"For exit 3, each tool version that CI sets up stays the same",
			"For exit 3, each tool version that CI sets up stays the same, and the last line starts with `ci_proof:`.",
		),
		stubbed(
			"The check reads the tools of the setup steps",
			"The check reads the tools of the setup steps, the runner, the container and service images and the ref of a remote reusable workflow.",
		),
		stubbed(
			"It does not read a tool that a `run` step or a script installs",
			"It does not read a tool that a `run` step or a script installs, so the review examines such a change.",
		),
		stubbed(
			"When the diff also changes another file, the check exits 1",
			"When the diff also changes another file, the check exits 1, because a red gate can then come from that file.",
		),
		stubbed(
			"A version file is a file that a workflow or an action names",
			"A version file is a file that a workflow or an action names in a `-version-file` input.",
		),
		stubbed(
			"The check exits 1 when the diff changes a version file",
			"The check exits 1 when the diff changes a version file and the version that the setup action reads from it changes.",
		),
		stubbed(
			"It also exits 1 when it cannot read an exact version",
			"It also exits 1 when it cannot read an exact version from a version file at `BASE_SHA` or at `HEAD`.",
		),
		stubbed(
			"It also exits 1 when the diff changes CI and a tool version",
			"It also exits 1 when the diff changes CI and a tool version that CI sets up, or when it cannot read such a version.",
		),
		stubbed(
			"When it exits 0 and its last line starts with `ok:`",
			"When it exits 0 and its last line starts with `ok:`, the run goes on.",
		),
		stubbed(
			"When it exits 3 and its last line starts with `ci_proof:`",
			"When it exits 3 and its last line starts with `ci_proof:`, the run goes on in mode `ci_proof`.",
		),
		stubbed(
			"Otherwise stop with principled incompletion.",
			"Otherwise stop with principled incompletion.",
		),
		stubbed(
			"With no node and no bun, the launcher prints a note",
			"With no node and no bun, the launcher prints a note and exits 0, so the exit code alone is not a pass.",
		),
		stubbed(
			"Another change to a version file",
			"Another change to a version file, such as a new dependency in `package.json`, gets the gates of the run.",
		),
		stubbed(
			"so only CI can prove a CI change",
			"The gates mirror the CI that astack apply read, and CI runs the workflows of the PR, so only CI can prove a CI change.",
		),
		stubbed(
			"In mode `ci_proof`, the run reviews, fixes and gates the PR as usual.",
			"In mode `ci_proof`, the run reviews, fixes and gates the PR as usual.",
		),
		stubbed(
			"It records the mode in the ledger",
			"It records the mode in the ledger, in each gate summary and in each PR comment.",
		),
		stubbed(
			"A red gate is advisory in that mode only with the proof",
			"A red gate is advisory in that mode only with the proof below.",
		),
		stubbed(
			"The merge also needs the CI read-back",
			"The merge also needs the CI read-back of the steps after the stop.",
		),
		stubbed(
			"get the versions in the `tools` of the gate",
			"get each version in the `tools` of each gate that applies",
		),
		stubbed(
			"A version that bunx cannot get is a note, not a stop.",
			"When bunx cannot get a pinned version, the gate runs the local version.",
		),
		stubbed(
			"CI runs the pinned versions, and CI gates the merge.",
			"CI runs the pinned versions, and CI gates the merge.",
		),
		stubbed(
			"So a local run with a version note is advisory for that tool.",
			"So a local run with a version note is advisory for that tool.",
		),
		stubbed(
			"Install the dependencies in `WORKTREE` with a frozen lockfile",
			"8. Install the dependencies in `WORKTREE` with a frozen lockfile, as the install step of CI does, such as `bun install --frozen-lockfile`.",
		),
		stubbed(
			"First delete the `node_modules` folder",
			"First delete the `node_modules` folder next to each `package.json` that git tracks",
		),
		stubbed(
			"A frozen install keeps a package that the lockfile no longer lists",
			"A frozen install keeps a package that the lockfile no longer lists, and CI installs into a new checkout.",
		),
		stubbed(
			"Put the `bun` of step 9 first on `PATH`",
			"Put the `bun` of the tools first on `PATH`.",
		),
		stubbed("Do this in every run.", "Do this in every run."),
		stubbed(
			"A dev server or another session can use the `node_modules` folders",
			"A dev server or another session can use the `node_modules` folders of a checkout that the run did not create, such as the current checkout.",
		),
		stubbed(
			"print `WORKTREE` and ask the owner",
			"So before the first delete in such a checkout, print `WORKTREE` and ask the owner.",
		),
		stubbed(
			"Without a yes, stop with principled incompletion.",
			"Without a yes, stop with principled incompletion.",
		),
		stubbed(
			"The yes holds for each later install of the run.",
			"The yes holds for each later install of the run.",
		),
		stubbed(
			"When the install fails, stop with principled incompletion.",
			"When the install fails, stop with principled incompletion.",
		),
		stubbed(
			"print each `env` name as `set` or `missing`",
			"For each gate that applies, every `env` variable must be set.",
		),
		stubbed(
			"Put the tools of the gate first on `PATH`.",
			"Put the tools of the gate first on `PATH`.",
		),
		stubbed(
			"Run the `check` of each prerequisite in `requires`",
			"Then run the `check` of each prerequisite in `requires` in the CI environment of the gate.",
		),
		stubbed("Print its exit code.", "Print its exit code."),
		stubbed(
			"When a check fails and its `on_missing` is `start`",
			"When a check fails and its `on_missing` is `start`, run its `start` command and check again.",
		),
		stubbed(
			"Run each `check` and each `start` with bash",
			"Run each `check` and each `start` with bash, in its own subshell from the root, as `( cd <WORKTREE> && <entry> )`.",
		),
		reasoned("Then a `cd` in one entry never moves the next entry.", explains),
		stubbed(
			"A missing variable or a prerequisite that still fails stops the run",
			"If a variable or a prerequisite is still missing, stop with principled incompletion before running anything.",
		),
		reasoned("reports a false green", explains),
		stubbed(
			"Load the ledger",
			"Keep one ledger per branch at `$(git rev-parse --git-common-dir)/pr-review-hardening/<branch>.json`",
		),
		stubbed(
			"A ledger whose `stopped` is `null` comes from a run that was cut off",
			"A ledger whose `stopped` is `null` comes from a run that was cut off, so this run resumes it, whatever `ledger.carry_over` says.",
		),
		stubbed(
			"A resumed run keeps each entry",
			"A resumed run keeps each entry, and its first iteration is the one after the highest `iteration` of the entries.",
		),
		stubbed(
			"earlier runs' findings carry into this one",
			"Otherwise, with `ledger.carry_over` set to `true`, start from the previous run's records.",
		),
		stubbed(
			"Each run sets `stopped` to `null` at this load",
			"Each run sets `stopped` to `null` at this load, and to its decision when it stops.",
		),
		stubbed(
			"Each run also sets `mode`",
			"Each run also sets `mode` to the mode of step 7 at this load, and to the mode of each later CI check.",
		),
		stubbed(
			"No iteration renames or empties the ledger",
			"No iteration renames or empties the ledger, because `stop_recurring` reads the entries of earlier iterations.",
		),
		stubbed(
			"Run each entry of `prepasses`",
			"Run each entry of `prepasses` whose `prepasses[].when` fits this PR, once, before the baseline.",
		),
	];

	const baselineRows: readonly Counterpart[] = [
		stubbed(
			"Run the deterministic gate once on the starting head",
			"Baseline: do the gate run once.",
		),
		stubbed(
			"Its metric values are the first budget.",
			"Its metric values are the first budget.",
		),
		stubbed(
			"If a gate is red at baseline",
			"A red gate is a finding `G<n>.<k>` when the failure is in a file that the PR changed.",
		),
		stubbed(
			"Reproduce a failure on the base branch before you call it pre-existing.",
			"It is also a finding when the same command is green on the base branch.",
		),
		stubbed(
			"A red the PR did not introduce cannot be fixed inside the fix fence.",
			"Otherwise it is a pre-existing red. List it, and never fix it.",
		),
		stubbed(
			"The run may still fix in-scope findings",
			"The run cannot stop clean while it stays red.",
		),
	];

	const iterateRows: readonly Counterpart[] = [
		stubbed(
			"For each iteration `n` up to `iterations.max`, from 1 or from the first iteration of a resumed run:",
			"Each iteration:",
			"the run reached `iterations.max`",
			"its first iteration is the one after the highest `iteration` of the entries.",
		),
		stubbed(
			"Print `ITERATION <n>` and the rules.",
			"Print these rules at the start of every iteration",
		),
		stubbed(
			"Review.",
			"Launch the `pr-review-toolkit` review agents in parallel with the Agent tool.",
		),
		stubbed(
			"Print `REVIEWED_HEAD` as the output of `git rev-parse HEAD`.",
			"Print `REVIEWED_HEAD` as the output of `git rev-parse HEAD`.",
		),
		stubbed(
			"It is the `<HEAD>` of the diff that the reviewers get.",
			"It is the `<HEAD>` of the diff that the reviewers get.",
		),
		stubbed(
			"Launch the reviewers over",
			"Tell each one to review `git -C <WORKTREE> diff <BASE_SHA>...<HEAD>`, with the path and both SHAs written out.",
			"Paste each output unmodified.",
		),
		{
			engine: "Then run the checklist pass",
			stub: [
				"Then examine the diff against each file in `reviewers.checklists`.",
			],
			leaves: noChecklist,
		},
		reasoned("`references/review.md` says how.", pointer),
		stubbed("Triage.", "2. Triage each finding by its label."),
		{
			engine: "Give each candidate an id",
			stub: ["Record each finding with an id, file, reproduction, status"],
			leaves: noChecklist,
		},
		stubbed(
			"Reproduce it, then classify it",
			"3. Reproduce each candidate.",
			"Mark a candidate advisory only for one of four reasons.",
		),
		stubbed("Fix.", "4. Fix each blocking finding for real"),
		stubbed(
			"Fix every open blocking finding in the ledger",
			"The gate findings of the last gate run are blocking findings too.",
		),
		stubbed(
			"Commit each finding as the rules above say",
			"with its commits as the rules say",
			"Push as `push` says.",
		),
		reasoned(
			"Before each fix, read the item of `references/checklist.md`",
			noChecklist,
		),
		stubbed(
			"`references/fix.md` holds the rules",
			"With `typescript.rules` set to true, a fix proves or narrows a type.",
		),
		stubbed("Comment gate.", "5. Comment gate."),
		stubbed(
			"Run it over `git diff <BASE_SHA>...HEAD`",
			"Invoke `astack:no-comments` over the diff if the Skill tool lists it.",
		),
		stubbed(
			"Each accepted deletion set and each in-fence `MUST KILL` fix",
			"Commit the deletions file by file.",
		),
		stubbed("Deterministic gate.", "6. Do the gate run."),
		stubbed(
			"Run every gate, and the metrics when `metrics` is not `null`",
			"6. Do the gate run. When `metrics` is not `null`, no key in `metrics.never_increase` may rise.",
		),
		stubbed(
			"A failure the PR introduced becomes a finding `G<n>.<k>`",
			"The gate findings of the last gate run are blocking findings too.",
		),
		stubbed("Decide.", "Print a gate summary and a decision."),
		stubbed(
			"push the branch as `push` says when `HEAD` is not `PR_HEAD`",
			"In a run with a PR, push the branch as `push` says when `HEAD` is not `PR_HEAD`.",
		),
		stubbed(
			"Then read the `headRefOid` of the PR again",
			"Then read the `headRefOid` of the PR again and do the head check again.",
		),
		stubbed(
			"Print `GATE_SUMMARY` with the decision",
			"If `proof.pr_comment` is set, post a comment on the PR.",
		),
	];

	const decideRows: readonly Counterpart[] = [
		stubbed(
			"The iteration is clean when",
			"the comment gate removed nothing and every gate exited 0",
		),
		stubbed(
			"That is zero blocking reviewer or checklist findings",
			"the iteration found no blocking finding",
		),
		stubbed(
			"An iteration that commits a fix in step 4 is not clean",
			"An iteration that commits a fix in step 4 is not clean, because no reviewer saw that commit.",
		),
		stubbed(
			"A clean stop also needs `REVIEWED_HEAD`",
			"A clean stop also needs `REVIEWED_HEAD` to equal the output of `git rev-parse HEAD` after the last gate run.",
		),
		stubbed(
			"No reviewer saw a commit that comes after the review",
			"No reviewer saw a commit that comes after the review, such as the merge of a moved base in a gate run.",
		),
		stubbed(
			"A clean stop also needs a diff from the base that is not empty.",
			"A clean stop also needs a diff from the base that is not empty.",
		),
		stubbed(
			"In a run with a PR, a clean stop also needs `PR_HEAD`",
			"In a run with a PR, a clean stop also needs `PR_HEAD` to equal `HEAD` after the push of step 7.",
		),
		stubbed(
			"so a review or a gate run of an unpushed commit proves nothing",
			"CI tests only the head of the PR, so a review or a gate run of an unpushed commit proves nothing for the PR.",
		),
		stubbed(
			"In mode `ci_proof`, a clean stop also needs `mode: ci_proof`",
			"In mode `ci_proof`, a clean stop also needs the mode in the gate summary, so the report names the mode.",
		),
		stubbed(
			"a clean stop also needs `ciReadBack: pass`",
			"It also needs a CI read-back that passes on `PR_HEAD`, as the steps after the stop say, whatever `merge.after_clean_stop` says.",
		),
		stubbed(
			"so a run of mode `ci_proof` without a PR cannot stop clean",
			"A run of mode `ci_proof` without a PR stops with principled incompletion.",
		),
		stubbed("`stop_clean`:", "at least `iterations.min` iterations have run"),
		stubbed("`continue`:", "- Otherwise continue."),
		stubbed(
			"A clean iteration below the minimum continues",
			"at least `iterations.min` iterations have run",
		),
		stubbed(
			"`stop_recurring`:",
			"- `stop_recurring`: a finding came back after one fix attempt.",
		),
		stubbed(
			"Print the ledger and the suspected root cause.",
			"Print the ledger and the suspected root cause.",
		),
		stubbed("Do not try again.", "Do not try again."),
		stubbed(
			"`stop_principled_incompletion`:",
			"- `stop_principled_incompletion`:",
		),
		stubbed(
			"A configured reviewer cannot be launched.",
			"a reviewer or gate cannot run",
		),
		stubbed(
			"A gate command cannot be identified",
			"a gate wrote a tracked file outside its `rewrites`",
			"Gates are read-only.",
		),
		stubbed(
			"A gate that applies cannot start.",
			"A gate that applies but cannot start is an unclean stop.",
			"print `NOT_STARTED` for the gate with the reason, and stop with principled incompletion",
		),
		stubbed(
			"The report names the gate and the missing item.",
			"Name the gate and the missing item.",
		),
		stubbed(
			"The diff from the base is empty",
			"the branch has no change to review. Stop with principled incompletion",
			"With `none`, print `git log --oneline HEAD..origin/<base>` and stop with principled incompletion.",
		),
		stubbed(
			"The local branch does not hold the head of the PR",
			"Run `git fetch origin <headRefOid>`. When it fails, stop with principled incompletion.",
			"fails, stop with principled incompletion before the baseline.",
		),
		stubbed(
			"The install of the dependencies with a frozen lockfile fails.",
			"When the install fails, stop with principled incompletion.",
		),
		stubbed(
			"The owner does not allow the delete",
			"Without a yes, stop with principled incompletion.",
		),
		stubbed(
			"`astack check ci-pins` gives no `ok:` last line with exit 0",
			"Otherwise stop with principled incompletion.",
		),
		stubbed(
			"A gate run finds an untracked or uncommitted file.",
			"stop with principled incompletion before the first gate, and name each path",
		),
		stubbed(
			"In mode `ci_proof`, the run has no PR, or the CI read-back fails.",
			"A run of mode `ci_proof` without a PR stops with principled incompletion.",
			"It also applies in mode `ci_proof` when the CI read-back fails.",
		),
		stubbed(
			"In mode `ci_proof`, the PR removes a CI step that runs a gate command.",
			"When the PR removes a CI step that runs a gate command, the gates no longer mirror CI, so the profile must change. Then stop with principled incompletion, and name the step.",
		),
		stubbed(
			"A correct fix needs a file outside the fix fence",
			"when a fix needs a file outside the fence",
			"No dependency, lockfile, migration or CI edits",
		),
		stubbed("The git identity is missing.", "the git identity is missing"),
		stubbed(
			"`PR_HEAD` is still not `HEAD` after step 7",
			"It also applies in a run with a PR when `PR_HEAD` is still not `HEAD` after step 7, because the run cannot push.",
		),
		stubbed(
			"The report names each commit of `UNPUSHED`.",
			"Then the report names each commit of `UNPUSHED`.",
		),
		stubbed(
			"The PR is from a fork that does not allow edits from maintainers.",
			"It also applies when the PR is from a fork that does not allow edits from maintainers.",
		),
		stubbed("The iteration limit is spent", "the run reached `iterations.max`"),
		stubbed(
			"A gate is still red for a reason the PR did not introduce.",
			"Otherwise it is a pre-existing red. List it, and never fix it. The run cannot stop clean while it stays red.",
		),
	];

	const afterStopRows: readonly Counterpart[] = [
		stubbed(
			"When this run loaded the ledger, set its `stopped` to the decision.",
			"After the stop, when this run loaded the ledger, set its `stopped` to the decision.",
		),
		{
			engine: "Then print the final report",
			stub: [
				"Then report the findings fixed, the commits and the metrics before and after.",
			],
			leaves: noChecklist,
		},
		stubbed(
			"If the stop is not clean and `proof.on_unclean` is set",
			"On an unclean stop, do what `proof.on_unclean` says when it is not `null`.",
		),
		stubbed(
			"If `threads.answer` is true",
			"If `threads.answer` is true, answer each review-bot thread on the PR before the merge.",
		),
		stubbed(
			"If the stop is clean and `merge.after_clean_stop` is `merge`",
			"Merge only when `merge.after_clean_stop` is `merge` and every line of `merge.conditions` holds.",
		),
		stubbed(
			"In mode `ci_proof`, also do the CI read-back",
			"In mode `ci_proof`, merge only when the CI read-back passes.",
		),
		stubbed(
			"Print the evidence, then run `merge.command`.",
			"Then use the merge command of the profile.",
		),
		stubbed("Otherwise never merge.", "Otherwise never merge."),
	];

	const appliesRows: readonly Counterpart[] = [
		stubbed(
			"A gate with an empty `when_changed` applies to every diff.",
			"An empty `when_changed` means that the gate applies to every diff.",
		),
		stubbed(
			"Otherwise it applies when a path in",
			"Otherwise the gate applies when a path in `git diff --name-only --no-renames <BASE_SHA>...HEAD` matches one of its globs and no glob that starts with `!`.",
		),
		stubbed(
			"A fix can make a gate apply in a later iteration",
			"A fix can make a gate apply in a later iteration, so decide again before each gate run.",
		),
		stubbed(
			"A glob matches the whole repo-relative path.",
			"A glob matches the whole repo-relative path.",
		),
		stubbed(
			"`*` matches inside one folder",
			"`*` matches inside one folder, and `**` matches across folders.",
		),
		stubbed(
			"So `*.md` matches only the Markdown files at the root",
			"So `*.md` matches only the Markdown files at the root, and `**/*.md` matches them in every folder.",
		),
		stubbed(
			"Git's glob pathspec matches the same way.",
			"Git's glob pathspec matches the same way.",
		),
		stubbed(
			"prints the paths that make the gate apply.",
			"prints the paths that make the gate apply.",
		),
		stubbed(
			"CI splits a rename into a delete and an add",
			"CI splits a rename into a delete and an add, so `--no-renames` lists both paths.",
		),
	];

	const afterRows: readonly Counterpart[] = [
		stubbed(
			"A gate that names gates in `after` runs only when",
			"A gate that names gates in `after` runs only when each of them exited 0 earlier in the same gate run.",
		),
		stubbed(
			"Otherwise print `<NAME>_EXIT=BLOCKED` and the gate that did not pass.",
			"Otherwise print `<NAME>_EXIT=BLOCKED` and the gate that did not pass.",
		),
		stubbed("A `BLOCKED` gate is red.", "A `BLOCKED` gate is red."),
		stubbed(
			"It is never a pass, and never a finding of its own.",
			"It is never a pass, and never a finding of its own.",
		),
		reasoned(
			"Use `after` for an output that an earlier gate writes",
			"It tells the author of a profile when to use `after`. The run follows `after` through the rule above.",
		),
		reasoned(
			"A prerequisite cannot check that output",
			"It tells the author of a profile when to use `after`. The run follows `after` through the rule above.",
		),
		stubbed(
			"When the build of the PR is red, the build gate gives the finding",
			"The gate findings of the last gate run are blocking findings too.",
		),
	];

	const cannotStartRows: readonly Counterpart[] = [
		stubbed(
			"A gate that applies cannot start when one of these holds:",
			"If one fails, print `NOT_STARTED` for the gate with the reason, and stop with principled incompletion.",
		),
		stubbed(
			"An `env` variable is missing.",
			"For each gate that applies, every `env` variable must be set.",
		),
		stubbed(
			"A prerequisite `check` fails, and `on_missing` is `stop`.",
			"If a variable or a prerequisite is still missing, stop with principled incompletion before running anything.",
		),
		stubbed(
			"A prerequisite `check` still fails after its `start` command ran.",
			"run its `start` command and check again",
		),
		stubbed(
			"A `setup` command exits with a code that is not 0.",
			"run its `setup` commands in order",
		),
		stubbed(
			"The command's script or binary does not exist on this branch, and the gate is not `optional`.",
			"Also make sure that the script or binary of the gate command exists on this branch.",
		),
		stubbed(
			"Then print `<NAME>_EXIT=NOT_STARTED` and the reason.",
			"print `NOT_STARTED` for the gate with the reason",
		),
		stubbed(
			"Name the variable, the prerequisite with its check output",
			"Name the gate and the missing item.",
		),
		stubbed(
			"The run stops in principled incompletion.",
			"and stop with principled incompletion",
		),
		stubbed(
			"A `NOT_STARTED` gate is never a pass and never a finding of the PR.",
			"A gate that applies but cannot start is an unclean stop.",
		),
	];

	const readOnlyRows: readonly Counterpart[] = [
		stubbed(
			"A gate command must not write tracked files",
			"A gate that changes a tracked file outside its `rewrites` is red.",
		),
		stubbed(
			"These flags fix the tree:",
			"No gate command, `setup` command or prerequisite runs `--write`",
		),
		stubbed(
			"Before the first gate runs, reject each gate command",
			"No gate command, `setup` command or prerequisite runs",
		),
		reasoned("Such a command can hide a red.", explains),
		stubbed(
			"A rejected command stops the run in principled incompletion.",
			"Such a command stops the run with principled incompletion.",
		),
		stubbed(
			"Formatting and import sorting are code changes.",
			"Edit only the files a finding names.",
		),
		stubbed(
			"If a real fix needs formatting",
			"Edit only the files a finding names.",
		),
		stubbed(
			"A tool that a gate runs can write a tracked file that the tool makes",
			"A path in `rewrites` is a tracked file that a tool of the gate writes, such as the `next-env.d.ts` of a Next.js app.",
		),
		stubbed(
			"The gate names that file in `rewrites`, with the reason.",
			"A path in `rewrites` is a tracked file that a tool of the gate writes",
		),
		stubbed(
			"The run restores the file from the root after the gate",
			"It uses `git -C <WORKTREE> checkout -- <path>`.",
		),
		stubbed(
			"A write to another tracked file makes the gate red.",
			"A gate that changes a tracked file outside its `rewrites` is red.",
		),
		reasoned(
			"A gate may have effects outside the tree only when its `side_effects` names them.",
			"side_effects is in FALLBACK_EXEMPT: it tells the reader of the profile what a gate changes outside the tree, and validateProfile requires it with a setup or a start.",
		),
		reasoned(
			"Its `setup` commands and the `start` commands of its prerequisites follow the same rule.",
			"side_effects is in FALLBACK_EXEMPT: it tells the reader of the profile what a gate changes outside the tree, and validateProfile requires it with a setup or a start.",
		),
	];

	const gateRunRows: readonly Counterpart[] = [
		stubbed(
			"Run the subshell of each gate with bash",
			"Run each gate in its own bash subshell, such as `bash -c '<gate script>'`",
		),
		stubbed(
			"GitHub Actions runs a `run` step with bash.",
			"as GitHub Actions runs a `run` step",
		),
		stubbed(
			"zsh does not split an unquoted",
			"zsh does not split an unquoted `$" +
				"{name:+...}` into words, and it has no `PIPESTATUS`.",
		),
		stubbed(
			"Start the gate script with `set +e`",
			"Start the gate script with `set +e`.",
		),
		stubbed(
			"Never judge a gate by the tail of its output.",
			"Print each command as the profile writes it, with no variable expanded, and its exit code and output.",
		),
		stubbed(
			"If you pipe a gate's output",
			"zsh does not split an unquoted `$" +
				"{name:+...}` into words, and it has no `PIPESTATUS`.",
		),
		stubbed(
			"In the subshell of the gate, run each entry",
			"in its own subshell from the root, as `( cd <WORKTREE> && <entry> )`",
		),
		stubbed(
			"An entry is a prerequisite `check`, a `start`, a `setup` command or the gate command.",
			"Run each `check`, `start`, `setup` command and the gate command in its own subshell from the root",
		),
		reasoned("Then a `cd` in one entry never moves the next entry.", explains),
		stubbed(
			"Each entry gets the CI environment and the `PATH`",
			"Put its tools first on `PATH` and export its CI environment there.",
		),
		stubbed(
			"Run `git fetch origin <base>`.",
			"Gate run: run `git fetch origin <base>`, and do preflight steps 6 and 7 again.",
		),
		stubbed(
			"so do the base check of the preflight again",
			"do preflight steps 6 and 7 again",
		),
		stubbed(
			"When the base moved, the branch takes it as `base.sync` says",
			"do preflight steps 6 and 7 again",
		),
		stubbed("Print `BASE_SHA` again.", "do preflight steps 6 and 7 again"),
		stubbed(
			"Do the CI check of the preflight again.",
			"do preflight steps 6 and 7 again",
		),
		stubbed(
			"Its result sets the mode of the run.",
			"The mode follows the result of the last check of the run.",
		),
		stubbed(
			"When the run has a PR, read its `headRefOid` again",
			"When the run has a PR, read its `headRefOid` again and do the head check again.",
		),
		stubbed(
			"A push to the PR can move its head.",
			"A push to the PR can move its head.",
		),
		stubbed(
			"Run the install of the preflight again.",
			"Run the install of the preflight again.",
		),
		stubbed(
			"Then print `git status --short` as `GIT_STATUS_BEFORE_GATE`.",
			"Print `git status --short` as `GIT_STATUS_BEFORE_GATE`.",
		),
		stubbed(
			"When `git -C <WORKTREE> status --porcelain --untracked-files=all` prints a line",
			"When `git -C <WORKTREE> status --porcelain --untracked-files=all` prints a line, stop with principled incompletion before the first gate, and name each path.",
		),
		stubbed(
			"CI tests the commit, so a gate never runs on a file",
			"CI tests the commit, so a gate never runs on a file that the commit does not hold.",
		),
		stubbed(
			"For each entry of `gates`, then `test`:",
			"Run every gate that applies, then the test gate",
		),
		stubbed(
			"If the gate does not apply to the diff",
			"Print a gate that does not apply as `SKIPPED`, with its globs.",
		),
		unread("and `optional` is true", "gates[].optional"),
		stubbed(
			"If a gate in its `after` did not exit 0",
			"print `<NAME>_EXIT=BLOCKED` and the gate that did not pass",
		),
		stubbed(
			"Open the bash subshell for the gate.",
			"Run each gate in its own bash subshell",
		),
		stubbed(
			'Put its tools first on `PATH`, as "Tool versions" says',
			"Put its tools first on `PATH` and export its CI environment there.",
			"Print `<NAME>_TOOLS` and `<NAME>_ENV`.",
		),
		stubbed(
			"Export its CI environment, and print `<NAME>_ENV`.",
			"Print `<NAME>_TOOLS` and `<NAME>_ENV`.",
		),
		stubbed(
			"`<NAME>_ENV` lists the names that the run exports",
			"`<NAME>_ENV` lists the names that the run exports as `<name>=<value>`, which are `CI` and each `ci_env` entry that has a `value`.",
		),
		stubbed(
			"It lists each other name of the `ci_env` and `env` of the gate",
			"It lists each other name of the `ci_env` and `env` of the gate as `<name>=set` or `<name>=unset`.",
		),
		stubbed(
			"Check its `env` and its prerequisites as the preflight does.",
			"Before each gate, check its `env` and prerequisites again",
		),
		stubbed(
			"Then run each `setup` command in order",
			"run its `setup` commands in order",
		),
		stubbed(
			"If the gate cannot start, print `<NAME>_EXIT=NOT_STARTED`",
			"print `NOT_STARTED` for the gate with the reason",
		),
		stubbed(
			"Otherwise print `<NAME>_CMD=<command>`",
			"Print each command as the profile writes it, with no variable expanded",
		),
		stubbed(
			"Run it in its own subshell from the root, and print `<NAME>_EXIT=<code>`",
			"and its exit code and output.",
		),
		reasoned(
			"For long output, save the full output to a file outside the tree",
			"It sets how the transcript shows a long output. The stub prints the output of each command.",
		),
		stubbed(
			"Before the subshell of a gate opens, record `git -C <WORKTREE> diff --name-only`.",
			"Before the subshell of a gate opens, record `git -C <WORKTREE> diff --name-only`.",
		),
		stubbed(
			"Right after it exits, whatever its exit code",
			"Right after it exits, whatever its exit code, the run restores the `rewrites` paths that were not in that list.",
		),
		stubbed(
			"It uses `git -C <WORKTREE> checkout -- <path>`.",
			"It uses `git -C <WORKTREE> checkout -- <path>`.",
		),
		stubbed(
			"It prints `<NAME>_RESTORED=<path>`",
			"It prints `<NAME>_RESTORED=<path>` for each restored path that `git -C <WORKTREE> diff --name-only` showed before the restore.",
		),
		stubbed(
			"A `rewrites` path that changed before the gate stays as it is",
			"A `rewrites` path that changed before the gate stays as it is, so the status check after the gates shows it.",
		),
		stubbed(
			"If `metrics` is set, run `metrics.command`",
			"When `metrics` is not `null`, run `metrics.command`.",
		),
		stubbed(
			"Print `METRICS_CMD`, `METRICS_EXIT` and the raw JSON.",
			"and its exit code and output.",
		),
		stubbed(
			"Without `metrics`, print `METRICS=UNAVAILABLE`.",
			"A `metrics` value of `null` means no metrics.",
		),
		stubbed(
			"Never re-create a metrics script from memory.",
			"Never re-create a metrics script from memory.",
		),
		reasoned("A re-created script measures something else", explains),
		unread("If `type_coverage` is set", "type_coverage"),
		stubbed(
			"Print `git status --short` as `GIT_STATUS_AFTER_GATE`.",
			"Then print `git status --short` as `GIT_STATUS_AFTER_GATE`.",
		),
		stubbed(
			"If a tracked file changed after the restore, print `git diff` for it.",
			"If a tracked file changed after the restore, print its `git diff`.",
		),
		stubbed(
			"The gate is red and the run stops in principled incompletion.",
			"The gate is red, and the run stops with principled incompletion.",
		),
		stubbed(
			"Never keep or discard the change silently.",
			"The gate is red, and the run stops with principled incompletion.",
		),
		stubbed(
			"`<NAME>` is the gate's `name`",
			"`<NAME>` is the `gates[].name` or the `test.name` of the gate in upper case, with `-` replaced by `_`.",
		),
	];

	const greenRows: readonly Counterpart[] = [
		stubbed("The gate is green when all of these hold:", "every gate exited 0"),
		stubbed(
			"every gate that ran exited 0, or is an advisory gate of mode `ci_proof`.",
			"every gate exited 0 or is an advisory gate of mode `ci_proof`",
		),
		stubbed(
			"`SKIPPED` and `UNAVAILABLE` gates are listed, never counted as passes;",
			"Print a gate that does not apply as `SKIPPED`, with its globs.",
		),
		stubbed(
			"no gate is `NOT_STARTED` or `BLOCKED`;",
			"A `BLOCKED` gate is red.",
			"A gate that applies but cannot start is an unclean stop.",
		),
		stubbed(
			"if metrics ran, `METRICS_EXIT` is 0",
			"When `metrics` is not `null`, no key in `metrics.never_increase` may rise.",
			"the metrics held",
		),
		unread("if type coverage ran", "type_coverage"),
		stubbed(
			"no gate changed a tracked file that its `rewrites` does not name.",
			"A gate that changes a tracked file outside its `rewrites` is red.",
		),
		stubbed(
			"A red gate is a finding `G<n>.<k>` when the failure is in a file that the PR changed.",
			"A red gate is a finding `G<n>.<k>` when the failure is in a file that the PR changed.",
		),
		stubbed(
			"It is also a finding when the same command is green on the base branch.",
			"It is also a finding when the same command is green on the base branch.",
		),
		stubbed(
			"Name the files in the failure output.",
			"Name the files in the failure output.",
		),
		stubbed(
			"Otherwise it is a pre-existing red.",
			"Otherwise it is a pre-existing red.",
		),
		stubbed("List it, and never fix it.", "List it, and never fix it."),
		stubbed(
			"The run cannot stop clean while it stays red.",
			"The run cannot stop clean while it stays red.",
		),
		...[
			"In mode `ci_proof`, a red gate is advisory when the run shows that the CI change of the PR makes it red.",
			"The proof names the changed line of the CI diff that the gate does not mirror.",
			"It also holds a run of the gate command as the CI of the PR runs it, and that run exits 0.",
			"The run gives the command what the changed line gives, such as an `env` value.",
			"When the PR removes a CI step that runs a gate command, the gates no longer mirror CI, so the profile must change.",
			"Then stop with principled incompletion, and name the step.",
			"Print the gate as `<NAME>_EXIT=<code> ADVISORY_CI_PROOF`, with the proof.",
			"Each other red gate blocks, as in the mode `standard`.",
			"CI on `PR_HEAD` still gates the merge.",
		].map((sentence) => stubbed(sentence, sentence)),
	];

	const blockingRows: readonly Counterpart[] = [
		stubbed(
			"A finding is a blocking candidate when its reviewer label is",
			"A finding is a blocking candidate when its reviewer label is Critical, Blocker, High or Important.",
		),
		stubbed(
			"A `normal` label is the same",
			"A `normal` label is the same when the reviewer's machine output uses it to mean Important.",
		),
		stubbed(
			"A finding with an unclear label is a candidate until you triage it.",
			"A finding with an unclear label is a candidate until you triage it.",
		),
		stubbed(
			"Nit, Style, Suggestion, Pre-existing, Advisory and Informational do not block",
			"Nit, Style, Suggestion, Pre-existing, Advisory and Informational do not block, unless the finding shows a gate failure.",
		),
		stubbed(
			"A checklist violation and a confirmed review-bot thread are candidates too",
			"A checklist violation is a candidate too, whatever its label.",
		),
		stubbed(
			"A candidate blocks only when its reproduction shows a concrete failure",
			"It blocks only when the reproduction shows a concrete failure that the PR introduces.",
		),
		stubbed(
			"a deterministic gate that fails or would fail;",
			"That is a failing gate",
		),
		stubbed(
			"a contract, ADR or documented repo rule that the code breaks;",
			"a broken contract or documented rule",
		),
		stubbed(
			"behaviour the PR adds with no test",
			"or added behaviour with no test",
		),
		stubbed(
			"a security or correctness defect, with an input that triggers it;",
			"A defect with an input that triggers it",
		),
		stubbed(
			"a doc or comment sentence that states something false about the code.",
			"and a false sentence, also block",
		),
		stubbed(
			"A bug fix with no cheap, correct test seam can still pass without a test",
			"A bug fix with no cheap, correct test seam needs no test when its PR's Verification shows the failing run, then the passing run.",
		),
		stubbed(
			"It does not block when the PR's Verification links its failing script or saved transcript.",
			"needs no test when its PR's Verification shows the failing run",
		),
		stubbed(
			"It also does not block when the Verification states the outcome of that run.",
			"needs no test when its PR's Verification shows the failing run",
		),
		stubbed(
			"It shows the failing run first, then the passing run.",
			"shows the failing run, then the passing run",
		),
		stubbed(
			"It blocks again when the reproduction shows such a seam",
			"It blocks again when the reproduction shows such a seam.",
		),
		stubbed(
			"These never block: wording preferences",
			"Wording preferences, completeness wishes, true docs that can say more, refactors, style, nits and problems that the PR did not introduce never block.",
		),
		stubbed(
			"A reviewer's severity is a claim.",
			"A finding with an unclear label is a candidate until you triage it.",
		),
		stubbed(
			"A fixer never promotes a suggestion to blocking.",
			"Nit, Style, Suggestion, Pre-existing, Advisory and Informational do not block",
		),
		stubbed(
			"With `test_adequacy: control-per-clause`",
			"With `test_adequacy` set to `control-per-clause`, a planted control covers a contract clause when the control fails without the code of the clause.",
		),
		stubbed(
			"The PR's coverage matrix must also name that control.",
			"The coverage matrix of the PR names that control.",
		),
		stubbed(
			"Another input for a covered clause",
			"Another input for a covered clause, such as another file extension, casing or character, is a suggestion.",
		),
		stubbed(
			"It becomes a correctness finding only when the code special-cases that input",
			"It is a correctness finding only when the code special-cases that input, and then it needs the input that triggers it.",
		),
		stubbed(
			"A missing test blocks only when a clause has no covering control.",
			"A missing test then blocks only when no control covers a clause.",
		),
		stubbed(
			"Mark a candidate advisory only when one of these holds",
			"Mark a candidate advisory only for one of four reasons.",
		),
		stubbed(
			"The exact reproduction fails on re-run.",
			"Its reproduction fails on a second run",
		),
		stubbed(
			"It names code that is no longer there.",
			"it names code that is gone",
		),
		stubbed(
			"It contradicts a green gate and no concrete failing path can be shown.",
			"It contradicts a green gate with no failing path",
		),
		stubbed(
			"It is pre-existing and this PR did not introduce it.",
			"or it is pre-existing",
		),
		stubbed(
			"Never mark a finding advisory because it is hard to fix.",
			"Never mark a finding advisory because it is hard to fix.",
		),
		stubbed(
			"A finding whose fix needs a file outside the fix fence is `out-of-scope`",
			"when a fix needs a file outside the fence",
		),
	];

	const skillSection = (heading: string): string[] =>
		sectionLines(engineSkill, heading);

	const sections: readonly (readonly [
		string,
		readonly string[],
		readonly Counterpart[],
	])[] = [
		[
			"the arguments of SKILL.md",
			[paragraphStarting(engineSkill, "Arguments:")],
			argumentsRows,
		],
		[
			"the PR that --pr names in SKILL.md",
			skillSection("Review the PR that --pr names"),
			reviewPrRows,
		],
		[
			"the head check of SKILL.md",
			skillSection("The head check"),
			headCheckRows,
		],
		["the authority of SKILL.md", skillSection("Authority"), authorityRows],
		[
			"the profile load of SKILL.md",
			skillSection("Load the profile"),
			loadRows,
		],
		[
			"the rules of SKILL.md",
			skillSection("Rules for the whole run"),
			rulesRows,
		],
		["the preflight of SKILL.md", skillSection("Preflight"), preflightRows],
		["the baseline of SKILL.md", skillSection("Baseline"), baselineRows],
		["the iterations of SKILL.md", skillSection("Iterate"), iterateRows],
		["the decision of SKILL.md", skillSection("Decide"), decideRows],
		[
			"the steps after the stop in SKILL.md",
			skillSection("After the stop"),
			afterStopRows,
		],
		[
			"the gates that apply in references/gate.md",
			sectionLines(gate, "When a gate applies"),
			appliesRows,
		],
		[
			"the gates that need an earlier gate in references/gate.md",
			sectionLines(gate, "A gate that needs an earlier gate"),
			afterRows,
		],
		[
			"the gates that cannot start in references/gate.md",
			sectionLines(gate, "When a gate cannot start"),
			cannotStartRows,
		],
		[
			"the read-only commands of references/gate.md",
			sectionLines(gate, "Read-only commands"),
			readOnlyRows,
		],
		[
			"the gate run of references/gate.md",
			sectionLines(gate, "Run it"),
			gateRunRows,
		],
		[
			"the green gate of references/gate.md",
			sectionLines(gate, "Green"),
			greenRows,
		],
		[
			"the blocking rules of references/review.md",
			sectionLines(review, "Which findings block"),
			blockingRows,
		],
	];

	const stopsTheRun = /\bstop(?:s|ped)?\b|\bincompletion\b/i;

	test("the table reads each section of SKILL.md from the arguments to the steps after the stop", () => {
		const headings = [...engineSkill.matchAll(/^## (.+)$/gm)].map(
			(match) => match[1] ?? "",
		);
		expect(headings.filter((heading) => heading !== "References")).toEqual([
			"Review the PR that --pr names",
			"The head check",
			"Authority",
			"Load the profile",
			"Rules for the whole run",
			"Preflight",
			"Baseline",
			"Iterate",
			"Decide",
			"After the stop",
		]);
	});

	test("the sentence split finds a stop that a new sentence adds to a line of the decision", () => {
		const line =
			"  - `astack check ci-pins` gives no `ok:` last line with exit 0 and no `ci_proof:` last line with exit 3. A draft PR also stops the run.";
		expect(sentencesOf(line)).toEqual([
			"`astack check ci-pins` gives no `ok:` last line with exit 0 and no `ci_proof:` last line with exit 3.",
			"A draft PR also stops the run.",
		]);
		expect(
			sentencesOf(line).filter(
				(sentence) =>
					decideRows.filter((row) => sentence.includes(row.engine)).length !==
					1,
			),
		).toEqual(["A draft PR also stops the run."]);
	});

	test.each(sections)(
		"each sentence of %s has one counterpart row, and each row names one sentence",
		(_, lines, rows) => {
			const sentences = lines.flatMap(sentencesOf);
			const matches = (sentence: string, row: Counterpart) =>
				sentence.includes(row.engine);
			expect(
				sentences.filter(
					(sentence) =>
						rows.filter((row) => matches(sentence, row)).length !== 1,
				),
			).toEqual([]);
			expect(
				rows
					.filter(
						(row) =>
							sentences.filter((sentence) => matches(sentence, row)).length !==
							1,
					)
					.map((row) => row.engine),
			).toEqual([]);
		},
	);

	test.each(sections)(
		"the stub fallback holds the counterpart of each sentence of %s",
		(_, _lines, rows) => {
			expect(
				rows.flatMap((row) =>
					"stub" in row
						? row.stub.filter((text) => !fallback.includes(text))
						: [],
				),
			).toEqual([]);
		},
	);

	test.each(sections)(
		"each sentence of %s that the stub leaves out follows a key that apply reports when a profile sets it",
		(_, _lines, rows) => {
			expect(
				rows.flatMap((row) =>
					"unread" in row &&
					!FALLBACK_UNREAD.some(({ key }) => key === row.unread)
						? [row.unread]
						: [],
				),
			).toEqual([]);
		},
	);

	test.each(sections)(
		"no sentence of %s that stops the run is left out with only a recorded reason",
		(_, lines, rows) => {
			const sentences = lines.flatMap(sentencesOf);
			expect(
				rows
					.filter((row) => "reason" in row)
					.flatMap((row) =>
						sentences.filter(
							(sentence) =>
								sentence.includes(row.engine) && stopsTheRun.test(sentence),
						),
					),
			).toEqual([]);
		},
	);
});
