import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	companionFrom,
	exampleCompanionRoot,
	writable,
} from "../scripts/lib/companion.ts";
import { cleanEnv } from "../scripts/lib/exec.ts";
import { readLeakScan } from "../scripts/lib/leak-rules.ts";
import {
	coversPath,
	type FileScan,
	formatFinding,
	HashMatcher,
	lintFiles,
	parseHashList,
	scanAdrCitations,
	scanConflictMarkers,
	scanHashes,
	scanSubstrings,
	sha256,
	wordTokens,
} from "../scripts/lib/neutrality.ts";
import {
	type ProjectConfig,
	repoRoot,
	validateProjectConfig,
} from "../scripts/lib/projects.ts";
import {
	lintTarget,
	loadHashLists,
	readDenyList,
	readTargetDeny,
	withoutOwnName,
} from "../scripts/lib/target-lint.ts";
import { scanTree, type TreeReport } from "../scripts/neutral.ts";
import { envWithoutCompanion } from "./child-env.ts";
import { trackedTree } from "./tracked-tree.ts";

const listed = new HashMatcher(
	new Set(
		[
			"initech",
			"acmewidgets",
			"umbrellacyberlabs",
			"vandelayimportexportgroup",
		].map(sha256),
	),
);

function file(content: string, path = "rules/x.md") {
	return { path, content };
}

function project(name: string, denySubstrings: string[] = []): ProjectConfig {
	return validateProjectConfig(
		{
			name,
			path: `~/Projects/${name}`,
			mode: "write",
			rulesDir: ".claude/rules/standards",
			artifacts: {
				rules: true,
				settings: false,
				reviewStub: false,
				agentDocs: true,
				profile: true,
			},
			tracker: { kind: "none", dir: ".scratch" },
			domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
			keepPatterns: [],
			lint: {
				adrCitation: false,
				conflictMarkers: false,
				denySubstrings,
				denySubstringsExempt: ["docs/agents/"],
			},
			gates: [],
			ciOnlyGates: [],
			commentConflicts: [],
			adrNeeded: [],
		},
		name,
	);
}

function companion(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "astack-deny-"));
	mkdirSync(join(root, "projects"));
	mkdirSync(join(root, "deny"));
	for (const [path, content] of Object.entries(files)) {
		writeFileSync(join(root, path), content);
	}
	return root;
}

function run(script: string, args: readonly string[]) {
	const result = spawnSync(
		process.execPath,
		[join(repoRoot, "scripts", script), ...args],
		{ encoding: "utf8", env: envWithoutCompanion() },
	);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

describe("wordTokens", () => {
	test("splits on punctuation and camelCase and lowercases", () => {
		expect(wordTokens("globexClient @Acme-Widgets/api HTMLParser")).toEqual([
			"globex",
			"client",
			"acme",
			"widgets",
			"api",
			"html",
			"parser",
		]);
	});
});

describe("the deny hashes", () => {
	test.each([
		["a token in another case", "see Initech for details", ["hash 4cdc1a42"]],
		[
			"a camelCase token",
			"import { initechClient } from 'x'",
			["hash 4cdc1a42"],
		],
		["a two-word name", "ACME Widgets shipped", ["hash 1ddead9e"]],
		[
			"a two-word name in camelCase",
			"the acmeWidgetsApi repo",
			["hash 1ddead9e"],
		],
		["a three-word name", "Umbrella Cyber Labs shipped", ["hash 12399367"]],
		[
			"a three-word name in camelCase",
			"the umbrellaCyberLabsApi repo",
			["hash 12399367"],
		],
		[
			"a four-word name",
			"Vandelay Import Export Group shipped",
			["hash 6643de3b"],
		],
		[
			"a four-word name in camelCase",
			"the vandelayImportExportGroupApi repo",
			["hash 6643de3b"],
		],
		[
			"a four-word name at the end of a line",
			"shipped by Vandelay Import Export Group",
			["hash 6643de3b"],
		],
		["each word of a two-word name alone", "acme alone, widgets alone", []],
		["the two words in the other order", "widgets acme", []],
		["a listed token inside a longer word", "initechs", []],
	])("%s: %p", (_name, line, details) => {
		expect(scanHashes(file(line), listed).map((found) => found.detail)).toEqual(
			details,
		);
	});

	test.each([
		["a camelCase token", "rules/initechClient.md", "hash 4cdc1a42"],
		["a token inside a longer word", "rules/myinitech.md", "hash 4cdc1a42"],
		["a two-word name", "rules/acme-widgets/notes.md", "hash 1ddead9e"],
		[
			"a three-word name",
			"rules/umbrella-cyber-labs/notes.md",
			"hash 12399367",
		],
		[
			"a four-word name",
			"rules/vandelay-import-export-group.md",
			"hash 6643de3b",
		],
	])("finds %s in a path", (_name, path, detail) => {
		expect(scanHashes(file("", path), listed).map(formatFinding)).toEqual([
			`${path}: denied-name-in-path: ${detail}`,
		]);
	});

	test("the scan takes each name from the companion, and public code adds none", async () => {
		expect(await loadHashLists([], new Set())).toEqual({
			hashes: new Set(),
			warnings: [],
		});
	});

	test("parses a hash list and reports bad lines by number only", () => {
		const parsed = parseHashList(`${sha256("a")}\nnot-a-hash\n`);
		expect(parsed.hashes.size).toBe(1);
		expect(parsed.errors).toEqual([
			"line 2 is not 64 lowercase hex characters",
		]);
	});
});

describe("the deny list of the companion", () => {
	const backwards = (text: string): string => [...text].reverse().join("");
	const capital = (word: string): string =>
		`${word.charAt(0).toUpperCase()}${word.slice(1)}`;
	const exampleToken = backwards("xarfolliuq");
	const exampleWords = [backwards("xenrav"), backwards("nirtlod")];

	test("the tree scan finds a camelCase name and a two-word name that only the example list holds", async () => {
		const list = await readDenyList(companionFrom(undefined, {}));
		const root = trackedTree({
			"marketplace/notes.md": `const ${exampleToken}Client = 1;\n${exampleWords.map(capital).join(" ")} shipped\n`,
		});
		const tree = await scanTree(
			root,
			{ projects: [], hashes: list.ok ? list.value : new Set() },
			formatLeaks,
		);
		expect({ code: tree.code, stderr: tree.stderr }).toEqual({
			code: 1,
			stderr: [
				"marketplace/notes.md:1: denied-name: hash 10f42cb9",
				"marketplace/notes.md:2: denied-name: hash 822f3090",
			],
		});
	});

	test.each<[string, boolean, Pick<TreeReport, "code" | "stderr">]>([
		[
			"the example gives the scan only its 2 hashes, so the name of its project never fails it",
			false,
			{ code: 0, stderr: [] },
		],
		[
			"another companion also denies the name of each of its projects",
			true,
			{
				code: 1,
				stderr: ["marketplace/notes.md:1: denied-name: hash 822b33ad"],
			},
		],
	])("%s", async (_name, flagged, expected) => {
		const other = companion({
			"deny/names.sha256": `${sha256("zorblax")}\n`,
			"deny/canary": "zorblax\n",
		});
		const deny = await readTargetDeny(
			companionFrom(flagged ? other : undefined, {}),
			[project("acme")],
		);
		const root = trackedTree({ "marketplace/notes.md": "Acme ships it.\n" });
		const tree = deny.ok
			? await scanTree(root, deny.value, formatLeaks)
			: undefined;
		expect({ code: tree?.code, stderr: tree?.stderr }).toEqual(expected);
	});

	test("a companion list with a canary that the scan finds gives its hashes", async () => {
		const root = companion({
			"deny/names.sha256": `${sha256("zorblax")}\n`,
			"deny/canary": "zorblax\n",
		});
		expect(await readDenyList(companionFrom(root, {}))).toEqual({
			ok: true,
			value: new Set([sha256("zorblax")]),
		});
	});

	test.each<[string, Record<string, string>, (root: string) => string]>([
		[
			"a missing list",
			{ "deny/canary": "zorblax\n" },
			(root) =>
				`${root}/deny/names.sha256 does not exist. Add a name with bun run deny add <name>.`,
		],
		[
			"an empty list",
			{ "deny/names.sha256": "", "deny/canary": "zorblax\n" },
			(root) =>
				`${root}/deny/names.sha256 holds no hash. Add a name with bun run deny add <name>.`,
		],
		[
			"a bad line",
			{
				"deny/names.sha256": `${sha256("zorblax")}\nzorblax\n`,
				"deny/canary": "zorblax\n",
			},
			(root) =>
				`${root}/deny/names.sha256: line 2 is not 64 lowercase hex characters`,
		],
		[
			"a missing canary",
			{ "deny/names.sha256": `${sha256("zorblax")}\n` },
			(root) =>
				`${root}/deny/canary does not exist. Write one private token in it, and add the token with bun run deny add <token>.`,
		],
		[
			"a canary that the scan does not find",
			{
				"deny/names.sha256": `${sha256("zorblax")}\n`,
				"deny/canary": "frobnitz\n",
			},
			(root) =>
				`The scan finds no listed name in ${root}/deny/canary, so the deny list or the scan is wrong.`,
		],
	])("neutral exits 1 on %s", (_name, files, message) => {
		const root = companion(files);
		expect(run("neutral.ts", ["--companion", root])).toEqual({
			status: 1,
			stdout: "",
			stderr: `${message(root)}\n`,
		});
	});

	test("neutral --target renders the profile of the project from the flag folder and fails on its denied name", () => {
		const root = mkdtempSync(join(tmpdir(), "astack-target-"));
		cpSync(exampleCompanionRoot, root, { recursive: true });
		writeFileSync(join(root, "deny/names.sha256"), `${sha256("flagcanary")}\n`);
		writeFileSync(join(root, "deny/canary"), "flagcanary\n");
		const profile = join(root, "projects/acme/pr-review-hardening.profile.md");
		writeFileSync(
			profile,
			readFileSync(profile, "utf8").replace(
				"Settings for the PR review hardening loop",
				"Flagcanary notes. Settings for the PR review hardening loop",
			),
		);
		const result = run("neutral.ts", ["--target", "acme", "--companion", root]);
		expect({
			status: result.status,
			stderr: result.stderr,
			summary: /^neutral --target acme: \d+ file\(s\), 1 finding\(s\)\n$/.test(
				result.stdout,
			),
		}).toEqual({
			status: 1,
			stderr:
				"acme: .claude/pr-review-hardening.profile.md:3: denied-name: hash ec450180\n",
			summary: true,
		});
	});

	test("neutral fails on a word of the tree that only the list of the flag folder names", () => {
		const canary = backwards("elfrans");
		const root = companion({
			"deny/names.sha256": `${sha256(canary)}\n${sha256("verbatim")}\n`,
			"deny/canary": `${canary}\n`,
			"machine.json": JSON.stringify({
				home: `/srv/${canary}`,
				profiles: [],
				handles: [],
				emails: [],
				hosts: [],
			}),
		});
		const result = run("neutral.ts", ["--companion", root]);
		expect({
			status: result.status,
			deniedNames: [
				...new Set(
					result.stderr
						.split("\n")
						.map((line) => line.split(": ").slice(1).join(": "))
						.filter((detail) => detail.startsWith("denied-name")),
				),
			],
		}).toEqual({ status: 1, deniedNames: ["denied-name: hash b9113628"] });
	});
});

async function exampleLeakScan(): Promise<FileScan> {
	const leaks = await readLeakScan(companionFrom(undefined, {}), []);
	if (!leaks.ok) throw new Error(leaks.error);
	return leaks.value;
}

const formatLeaks = await exampleLeakScan();

describe("the tree scan", () => {
	const deny = { projects: [], hashes: new Set([sha256("zorblax")]) };
	const binary = new Uint8Array([0x89, 0x50, 0x00, 0x01]);
	const frozenBinary = "upstream/acme/logo.png";
	const reportRules = [
		"branch-prefix",
		"companion-path",
		"denied-name",
		"denied-name-in-path",
		"host-name",
		"local-path",
		"owner-email",
		"owner-handle",
		"private-pr",
		"profile-dir",
		"secret",
		"session-id",
		"session-url",
		"team-key",
		"ticket-key",
	];
	const rows = (counts: Readonly<Record<string, number>>): string[] =>
		reportRules.map((rule) => `${rule}: ${counts[rule] ?? 0} finding(s)`);

	test("reads each tracked file, names each binary, counts the findings of each class, also at 0, and exits 1 on a finding", async () => {
		const tempDir = ["", "tmp", "claude-501"].join("/");
		const root = trackedTree({
			"marketplace/a.md": "Zorblax ships.\nconst zorblaxClient = 1;\n",
			"docs/zorblax/b.md": `plain ${tempDir}\n`,
			[frozenBinary]: binary,
		});
		writeFileSync(join(root, "untracked.md"), "zorblax\n");
		expect(await scanTree(root, deny, formatLeaks)).toEqual({
			code: 1,
			stdout: [
				"neutral: read 3 of 3 tracked file(s), 1 binary",
				`binary ${frozenBinary}`,
				...rows({
					"denied-name": 2,
					"denied-name-in-path": 1,
					"local-path": 1,
				}),
				"neutral: 4 finding(s)",
			],
			stderr: [
				"docs/zorblax/b.md: denied-name-in-path: hash 433c2a98",
				"docs/zorblax/b.md:1: local-path: claude temp dir",
				"marketplace/a.md:1: denied-name: hash 433c2a98",
				"marketplace/a.md:2: denied-name: hash 433c2a98",
			],
		});
	});

	test.each<
		[
			string,
			{ path: string; content: string | Uint8Array; inWorktree: boolean },
			readonly string[],
			string,
		]
	>([
		[
			"a new binary file outside upstream/",
			{ path: "docs/new.png", content: binary, inWorktree: true },
			["neutral: read 1 of 1 tracked file(s), 1 binary", "binary docs/new.png"],
			"docs/new.png: binary, and only a frozen upstream snapshot can hold a binary file",
		],
		[
			"a tracked file that the worktree no longer holds",
			{ path: "docs/gone.md", content: "text\n", inWorktree: false },
			["neutral: read 0 of 1 tracked file(s), 0 binary"],
			"docs/gone.md: tracked, but the scan cannot read it",
		],
	])("exits 1 on %s", async (_name, tracked, head, problem) => {
		const root = trackedTree({ [tracked.path]: tracked.content });
		if (!tracked.inWorktree) rmSync(join(root, tracked.path));
		expect(await scanTree(root, deny, formatLeaks)).toEqual({
			code: 1,
			stdout: [...head, ...rows({}), "neutral: 0 finding(s)"],
			stderr: [problem],
		});
	});

	test("exits 2 in a folder that git does not track, and never reports 0 files", async () => {
		const root = mkdtempSync(join(tmpdir(), "astack-report-"));
		const result = await scanTree(root, deny, formatLeaks);
		expect({
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr.map((line) => line.split(": fatal: ")[0]),
		}).toEqual({
			code: 2,
			stdout: [],
			stderr: [`git ls-files failed in ${root}`],
		});
	});

	test("bun run neutral reads each file that git ls-files lists in this repo, and finds only the 7 images of the frozen pstack snapshot", () => {
		const snapshotImages = [
			"upstream/pstack/assets/logo.png",
			"upstream/pstack/docs/guide/images/design.jpg",
			"upstream/pstack/docs/guide/images/overnight.jpg",
			"upstream/pstack/docs/guide/images/recipes.jpg",
			"upstream/pstack/docs/guide/images/router.jpg",
			"upstream/pstack/docs/guide/images/understanding.jpg",
			"upstream/pstack/docs/guide/images/verification.jpg",
		];
		const tracked = spawnSync("git", ["ls-files", "-z"], {
			cwd: repoRoot,
			env: cleanEnv(),
			encoding: "utf8",
		})
			.stdout.split("\0")
			.filter(Boolean).length;
		const result = run("neutral.ts", []);
		const lines = result.stdout.split("\n");
		expect({
			head: lines[0],
			binaries: lines.filter((line) => line.startsWith("binary ")),
		}).toEqual({
			head: `neutral: read ${tracked} of ${tracked} tracked file(s), ${snapshotImages.length} binary`,
			binaries: snapshotImages.map((path) => `binary ${path}`),
		});
	});

	test("exits 1 on a companion with no machine.json, because the owner classes have no values", () => {
		const root = companion({
			"deny/names.sha256": `${sha256("zorblax")}\n`,
			"deny/canary": "zorblax\n",
		});
		expect(run("neutral.ts", ["--companion", root])).toEqual({
			status: 1,
			stdout: "",
			stderr: `${root}/machine.json does not exist. Write the home dir, the profile dirs, the handles, the emails and the hosts of the owner in it.\n`,
		});
	});
});

describe("deny add", () => {
	test("refuses the example companion and leaves its list as it was", () => {
		const list = join(exampleCompanionRoot, "deny", "names.sha256");
		const before = readFileSync(list, "utf8");
		const refusal = writable(companionFrom(undefined, {}));
		expect(run("deny.ts", ["add", "initech"])).toEqual({
			status: 1,
			stdout: "",
			stderr: `${refusal.ok ? "" : refusal.error}\n`,
		});
		expect(readFileSync(list, "utf8")).toBe(before);
	});

	test("writes the hash of the joined words, prints only the hash prefix, and adds a name once", () => {
		const root = companion({});
		const list = `${root}/deny/names.sha256`;
		const runs = [
			["add", "Acme Widgets", "--companion", root],
			["add", "initech", "--companion", root],
			["add", "acmeWidgets", "--companion", root],
		].map((args) => run("deny.ts", args));
		expect(runs).toEqual([
			{ status: 0, stdout: `added hash 1ddead9e to ${list}\n`, stderr: "" },
			{ status: 0, stdout: `added hash 4cdc1a42 to ${list}\n`, stderr: "" },
			{
				status: 0,
				stdout: `hash 1ddead9e is already in ${list}\n`,
				stderr: "",
			},
		]);
		expect(readFileSync(list, "utf8")).toBe(
			`${sha256("acmewidgets")}\n${sha256("initech")}\n`,
		);
	});

	test("refuses a name with more words than the scan reads", () => {
		expect(
			run("deny.ts", [
				"add",
				"one two three four five",
				"--companion",
				companion({}),
			]),
		).toEqual({
			status: 2,
			stdout: "",
			stderr:
				"The name has 5 words. A name can have 1 to 4 words, because the scan reads 4 words at most.\n",
		});
	});
});

describe("repo-bound content checks", () => {
	test.each([
		["<".repeat(7)],
		[`${"<".repeat(7)} HEAD`],
		["|".repeat(7)],
		["=".repeat(7)],
		[`${">".repeat(7)} main`],
	])("flags the conflict-marker line %p", (line) => {
		expect(scanConflictMarkers(file(`a\n${line}\nb`))).toHaveLength(1);
	});

	test.each([
		[" ".concat("<".repeat(7))],
		["<".repeat(8)],
		["<<< not a marker"],
	])("does not flag %p", (line) => {
		expect(scanConflictMarkers(file(line))).toEqual([]);
	});

	test.each([["ADR 0001 D2"], ["ADR-0042 D10"], ["see ADR 1234  D3."]])(
		"flags the decision citation in %p",
		(line) => {
			expect(scanAdrCitations(file(line))).toHaveLength(1);
		},
	);

	test.each([["ADR 0001"], ["ADR NNNN Dn"], ["an ADR with D2"]])(
		"does not flag %p",
		(line) => {
			expect(scanAdrCitations(file(line))).toEqual([]);
		},
	);

	test("flags denied substrings case-insensitively, in content and path", () => {
		const found = scanSubstrings(file("Run /Toolkit:x", "rules/toolkit.md"), [
			"toolkit",
		]);
		expect(found.map((finding) => finding.rule)).toEqual([
			"denied-substring-in-path",
			"denied-substring",
		]);
	});

	test("lintFiles applies only the checks a target turns on", () => {
		const content = `ADR 0001 D2\n${"=".repeat(7)}\ninitech`;
		const off = lintFiles([file(content)], {
			matcher: new HashMatcher(new Set()),
			adrCitation: false,
			conflictMarkers: false,
			denySubstrings: [],
			denySubstringsExempt: [],
		});
		const on = lintFiles([file(content)], {
			matcher: listed,
			adrCitation: true,
			conflictMarkers: true,
			denySubstrings: [],
			denySubstringsExempt: [],
		});
		expect(off).toEqual([]);
		expect(on.map((finding) => finding.rule).sort()).toEqual([
			"adr-citation",
			"conflict-marker",
			"denied-name",
		]);
	});

	test("a denied substring under an exempt path gives no finding, and the same text at .claude/settings.json gives one", () => {
		const found = lintFiles(
			[
				file("Run /toolkit:x\ninitech", ".astack/NOTICE"),
				file("toolkit", ".claude/pr-review-hardening.profile.md"),
				file("toolkit", ".claude/settings.json"),
				file("toolkit", ".astack-old/NOTICE"),
				file("toolkit", ".claude/pr-review-hardening.profile.md.bak"),
			],
			{
				matcher: listed,
				adrCitation: false,
				conflictMarkers: false,
				denySubstrings: ["toolkit"],
				denySubstringsExempt: [
					".astack/",
					".claude/pr-review-hardening.profile.md",
				],
			},
		);
		expect(found.map(formatFinding)).toEqual([
			".astack/NOTICE:2: denied-name: hash 4cdc1a42",
			".claude/settings.json:1: denied-substring: toolkit",
			".astack-old/NOTICE:1: denied-substring: toolkit",
			".claude/pr-review-hardening.profile.md.bak:1: denied-substring: toolkit",
		]);
	});

	test.each([
		[[".astack/"], ".astack/NOTICE", true],
		[[".astack/"], ".astack/sub/profile.json", true],
		[[".astack/"], ".astack-old/NOTICE", false],
		[[".astack/"], ".astack", false],
		[["docs/agents/"], "docs/agents.md", false],
		[[".claude/x.md"], ".claude/x.md", true],
		[[".claude/x.md"], ".claude/x.md/y", false],
		[[], ".astack/NOTICE", false],
	])(
		"coversPath(%p, %p) is %p: an entry with a slash at the end is a folder, any other entry is one file",
		(exempt, path, covered) => {
			expect(coversPath(exempt, path)).toBe(covered);
		},
	);
});

describe("lintTarget", () => {
	test("skips the denied substrings only in the files under the exempt paths of the project", async () => {
		const acme = project("acme", ["toolkit"]);
		const { findings } = await lintTarget(
			acme,
			[file("toolkit", "docs/agents/domain.md"), file("toolkit", "README.md")],
			{ projects: [acme], hashes: new Set() },
		);
		expect(findings.map(formatFinding)).toEqual([
			"README.md:1: denied-substring: toolkit",
		]);
	});

	test("a finding on another project name or a companion name gives its hash and never the name", async () => {
		const acme = project("acme");
		const { findings } = await lintTarget(
			acme,
			[file("acme uses globexLabs\nand Globex Labs\nand Zorblax")],
			{
				projects: [acme, project("globex-labs")],
				hashes: new Set([sha256("zorblax")]),
			},
		);
		expect(findings.map(formatFinding)).toEqual([
			"rules/x.md:1: denied-name: hash f716b484",
			"rules/x.md:2: denied-name: hash f716b484",
			"rules/x.md:3: denied-name: hash 433c2a98",
		]);
	});
});

describe("withoutOwnName", () => {
	test("lets a repo name itself in each form but not other projects", () => {
		expect(
			withoutOwnName(
				"acme-widgets",
				new Set(["acmewidgets", "acme", "widgets", "globex"].map(sha256)),
			),
		).toEqual(new Set([sha256("globex")]));
	});
});
