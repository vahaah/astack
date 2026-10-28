import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type Companion,
	companionFrom,
	companionPaths,
	exampleCompanionRoot,
} from "../scripts/lib/companion.ts";
import { type LeakRule, readLeakScan } from "../scripts/lib/leak-rules.ts";
import {
	formatFinding,
	HashMatcher,
	lintFiles,
	sha256,
	type TextFile,
} from "../scripts/lib/neutrality.ts";
import {
	loadAllProjects,
	type ProjectConfig,
	validateProjectConfig,
} from "../scripts/lib/projects.ts";
import { loadHashLists, readTargetDeny } from "../scripts/lib/target-lint.ts";
import { scanTree } from "../scripts/neutral.ts";
import type { Result } from "../src/astack/result.ts";
import { trackedTree } from "./tracked-tree.ts";

const flip = (text: string): string => [...text].reverse().join("");

const owner = {
	project: flip("ortnez"),
	denied: flip("xevrouq"),
	user: flip("eldnirb"),
	profile: flip("xz-edualc./~"),
	handle: flip("qhlertsek"),
	email: flip("elpmaxe.lertsek@spo"),
	host: flip("inim-wollat"),
	team: flip("XZQ"),
	branchTemplate: flip("}etad{-gniloot-tnega/zk"),
	repo: flip("ksed-tibro"),
	companionDir: flip("gfc-tluav"),
};

const fakeKey = "a1B2".repeat(9);
const githubToken = `${["gh", "p_"].join("")}${fakeKey}`;
const sessionUrl = ["https://claude", "ai/code/session_01AbCdEf"].join(".");
const fakeUuid = ["1234abcd", "5678", "9abc", "def0", "123456789abc"].join("-");
const sessionId = `{"session_id":"${fakeUuid}"}`;

function unwrap<T>(result: Result<T, string>): T {
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

const ownerHome = join(
	mkdtempSync(join(tmpdir(), "astack-leaks-")),
	owner.user,
);

const ownerRoot = join(ownerHome, owner.companionDir);

const outsideRoot = join(
	mkdtempSync(join(tmpdir(), "astack-outside-")),
	owner.companionDir,
);

async function ownerCompanion(root: string): Promise<Companion> {
	mkdirSync(join(root, "projects"), { recursive: true });
	mkdirSync(join(root, "deny"));
	writeFileSync(
		join(root, "deny", "names.sha256"),
		`${sha256(owner.denied)}\n`,
	);
	writeFileSync(join(root, "deny", "canary"), `${owner.denied}\n`);
	const acme = validateProjectConfig(
		await Bun.file(join(exampleCompanionRoot, "projects", "acme.json")).json(),
		"acme",
	);
	const { branches: _branches, ...base } = acme;
	const project: ProjectConfig = {
		...base,
		name: owner.project,
		path: `~/code/${owner.repo}`,
		tracker: {
			kind: "linear",
			team: owner.team,
			requirePartOf: true,
			categoryLabels: { bug: "Bug", enhancement: "Feature" },
		},
		branchTemplate: owner.branchTemplate,
	};
	writeFileSync(
		join(root, "projects", `${owner.project}.json`),
		JSON.stringify(project),
	);
	writeFileSync(
		join(root, "machine.json"),
		JSON.stringify({
			home: ownerHome,
			profiles: ["~/.claude", owner.profile],
			handles: [owner.handle],
			emails: [owner.email],
			hosts: [owner.host],
		}),
	);
	return companionFrom(root, {});
}

async function scanInputs(companion: Companion) {
	const projects = await loadAllProjects(companionPaths(companion).projects);
	return {
		deny: unwrap(await readTargetDeny(companion, projects)),
		leaks: unwrap(await readLeakScan(companion, projects)),
	};
}

async function scannerFor(
	companion: Companion,
): Promise<(files: readonly TextFile[]) => string[]> {
	const { deny, leaks } = await scanInputs(companion);
	const names = await loadHashLists(deny.projects, deny.hashes);
	return (files) =>
		lintFiles(files, {
			matcher: new HashMatcher(names.hashes),
			adrCitation: false,
			conflictMarkers: false,
			denySubstrings: [],
			denySubstringsExempt: [],
			leaks,
		}).map(formatFinding);
}

const owned = await ownerCompanion(ownerRoot);

const scan = await scannerFor(owned);

const ownerInputs = await scanInputs(owned);

const outsideScan = await scannerFor(await ownerCompanion(outsideRoot));

const notes = (content: string, path = "docs/notes.md"): TextFile => ({
	path,
	content,
});

type Sample = { readonly line: string; readonly finding: string };

const samples = {
	"client-project": {
		line: `${owner.project.toUpperCase()} ships today`,
		finding: "denied-name: hash c440ab10",
	},
	"client-name": {
		line: `the ${owner.denied}Client module`,
		finding: "denied-name: hash d0c4ef5e",
	},
	"profile-dir": {
		line: `cp ~/.claude/rules ${owner.profile}/rules`,
		finding: "profile-dir: machine.json profiles[1]",
	},
	"owner-handle": {
		line: `ask @${owner.handle} for a review`,
		finding: "owner-handle: machine.json handles[0]",
	},
	"owner-email": {
		line: `mail ${owner.email.toUpperCase()}`,
		finding: "owner-email: machine.json emails[0]",
	},
	"branch-prefix": {
		line: `git switch ${owner.branchTemplate.split("/")[0]}/fix-cart`,
		finding: "branch-prefix: projects[0] branchTemplate",
	},
	"local-path": {
		line: `open /Users/${owner.user}/notes`,
		finding: "local-path: machine.json home",
	},
	"session-url": {
		line: `see ${sessionUrl}`,
		finding: "session-url: agent session",
	},
	"session-id": { line: sessionId, finding: "session-id: session_id" },
	"ticket-key": {
		line: `fixes ${owner.team}-482`,
		finding: "ticket-key: projects[0] tracker.team",
	},
	"team-key": {
		line: `the ${owner.team} board`,
		finding: "team-key: projects[0] tracker.team",
	},
	"private-pr": {
		line: `https://github.com/someorg/${owner.repo}/pull/42`,
		finding: "private-pr: projects[0] path",
	},
	secret: { line: `token ${githubToken}`, finding: "secret: github token" },
	"host-name": {
		line: `ssh ${owner.host}.local`,
		finding: "host-name: machine.json hosts[0]",
	},
	"companion-path": {
		line: `cd ~/${owner.companionDir}/deny`,
		finding: "companion-path: companion root",
	},
} satisfies Record<LeakRule | "client-project" | "client-name", Sample>;

describe("the leak classes", () => {
	test.each(Object.entries(samples))(
		"a runtime sample of %s in a tracked file fails the tree scan with a finding of its class",
		async (_name, sample) => {
			const root = trackedTree({ "docs/notes.md": sample.line });
			const result = await scanTree(root, ownerInputs.deny, ownerInputs.leaks);
			expect({ code: result.code, stderr: result.stderr }).toEqual({
				code: 1,
				stderr: [`docs/notes.md:1: ${sample.finding}`],
			});
		},
	);

	test.each<[string, string, string]>([
		[
			"a private key",
			["-----BEGIN RSA PRIVATE", "KEY-----"].join(" "),
			"secret: private key",
		],
		[
			"an aws access key id",
			`${["AK", "IA"].join("")}${fakeKey.toUpperCase().slice(0, 16)}`,
			"secret: aws access key id",
		],
		[
			"an anthropic api key",
			["sk", "ant", fakeKey].join("-"),
			"secret: anthropic api key",
		],
		[
			"an openai api key",
			["sk", "proj", fakeKey].join("-"),
			"secret: openai api key",
		],
		["a slack token", ["xox", "b-", fakeKey].join(""), "secret: slack token"],
		[
			"a stripe live key",
			["sk", "live", fakeKey].join("_"),
			"secret: stripe live key",
		],
		[
			"a google api key",
			`${["AI", "za"].join("")}${fakeKey}`,
			"secret: google api key",
		],
		[
			"a linux home",
			`open /home/${owner.user}/notes`,
			"local-path: machine.json home",
		],
		[
			"the claude project folder of a mac home",
			`ls ~/.claude/projects/-Users-${owner.user}-code`,
			"local-path: machine.json home",
		],
		[
			"the claude project folder of a linux home",
			`ls ~/.claude/projects/-home-${owner.user}-code`,
			"local-path: machine.json home",
		],
		[
			"a chatgpt session",
			`see ${["https://chatgpt", "com/c/01AbCdEf"].join(".")}`,
			"session-url: agent session",
		],
		[
			"a cursor agent",
			`see ${["https://cursor", "com/agents?id=01AbCdEf"].join(".")}`,
			"session-url: agent session",
		],
		["a prompt id", `{"prompt_id":"${fakeUuid}"}`, "session-id: prompt_id"],
		[
			"a transcript path",
			`{"transcript_path":"~/.claude/projects/acme/${fakeUuid}.jsonl"}`,
			"session-id: transcript_path",
		],
		[
			"the companion root after $HOME",
			`cd $HOME/${owner.companionDir}/deny`,
			"companion-path: companion root",
		],
		[
			"the companion root after HOME in braces",
			`cd \${HOME}/${owner.companionDir}/deny`,
			"companion-path: companion root",
		],
	])("each form of a class gets a finding: %s", (_name, line, finding) => {
		expect(scan([notes(line)])).toEqual([`docs/notes.md:1: ${finding}`]);
	});

	test.each<[string, string, typeof scan, string]>([
		[
			"the home of machine.json",
			`open ${ownerHome}/notes`,
			scan,
			"local-path: machine.json home",
		],
		[
			"the root of a companion in the home",
			`cd ${ownerRoot}/deny`,
			scan,
			"companion-path: companion root",
		],
		[
			"the root of a companion outside the home",
			`cd ${outsideRoot}/deny`,
			outsideScan,
			"companion-path: companion root",
		],
	])(
		"a form in the temp dir of the test gets its own finding, also in the temp dir of an agent: %s",
		(_name, line, scanWith, finding) => {
			expect(
				scanWith([notes(line)]).filter((found) => found.endsWith(finding)),
			).toEqual([`docs/notes.md:1: ${finding}`]);
		},
	);

	test("a leak in the path of a file gets a finding with no line", () => {
		const path = `docs/${owner.host}/setup.md`;
		expect(scan([notes("plain", path)])).toEqual([
			`${path}: host-name: machine.json hosts[0]`,
		]);
	});

	test("the scan of this test file gives 0 findings", () => {
		expect(
			scan([
				notes(
					readFileSync(import.meta.path, "utf8"),
					"tests/neutral-classes.test.ts",
				),
			]),
		).toEqual([]);
	});

	test("a session id with a zero first group is synthetic", () => {
		const synthetic = ["00000000", "0000", "4000", "8000", "000000000001"];
		expect(scan([notes(`{"session_id":"${synthetic.join("-")}"}`)])).toEqual(
			[],
		);
	});

	test.each<[string, string, string[]]>([
		["a session URL", `see ${sessionUrl}`, []],
		["a session id", sessionId, []],
		[
			"a secret",
			`token ${githubToken}`,
			["upstream/pstack/notes.md:1: secret: github token"],
		],
	])(
		"frozen upstream/ is out of scope for the generic samples of its authors only: %s",
		(_name, line, findings) => {
			expect(scan([notes(line, "upstream/pstack/notes.md")])).toEqual(findings);
		},
	);

	test.each<[string, string, string, number[]]>([
		[
			"the public repo",
			"README.md",
			`claude plugin marketplace add ${owner.handle}/astack#v0.1.0`,
			[],
		],
		[
			"another repo of the handle",
			"README.md",
			`${owner.handle}/astack-source`,
			[1],
		],
		[
			"the copyright line of a licence",
			"marketplace/plugins/astack/LICENSE",
			`Copyright (c) 2026 ${owner.handle}`,
			[],
		],
		[
			"a credit line of a notice",
			"dist/NOTICE",
			`- astack, by ${owner.handle}, MIT.`,
			[],
		],
		[
			"the author of a manifest",
			"marketplace/plugins/astack/.claude-plugin/plugin.json",
			`\t"author": {\n\t\t"name": "${owner.handle}"\n\t},\n\t"author": "${owner.handle}",`,
			[],
		],
		[
			"another name field of a manifest",
			"marketplace/plugins/astack/.claude-plugin/plugin.json",
			`\t"name": "${owner.handle}",`,
			[1],
		],
		[
			"the author form outside a manifest",
			"docs/notes.md",
			`"author": "${owner.handle}"`,
			[1],
		],
	])("the owner handle in %s", (_name, path, content, lines) => {
		expect(scan([notes(content, path)])).toEqual(
			lines.map(
				(line) => `${path}:${line}: owner-handle: machine.json handles[0]`,
			),
		);
	});
});

describe("the owner values of the companion", () => {
	test("the example companion gives only the format rules, so its project values never fail the scan", async () => {
		const example = companionFrom(undefined, {});
		const exampleScan = await scannerFor(example);
		expect(
			exampleScan([
				notes(
					`git switch dev/fix-cart\nABC-12 on the ABC board\ntoken ${githubToken}`,
				),
			]),
		).toEqual(["docs/notes.md:3: secret: github token"]);
	});

	test.each<[string, string | undefined, (path: string) => string]>([
		[
			"a missing machine.json",
			undefined,
			(path) =>
				`${path} does not exist. Write the home dir, the profile dirs, the handles, the emails and the hosts of the owner in it.`,
		],
		[
			"a list that holds a value that is not a string",
			JSON.stringify({
				home: "/srv/owner",
				profiles: [],
				handles: [7],
				emails: [],
				hosts: [],
			}),
			(path) => `${path}: handles must be a list of strings`,
		],
		[
			"a relative home",
			JSON.stringify({
				home: "owner",
				profiles: [],
				handles: [],
				emails: [],
				hosts: [],
			}),
			(path) => `${path}: home must be an absolute path`,
		],
	])("a companion with %s gives an error", async (_name, machine, message) => {
		const root = mkdtempSync(join(tmpdir(), "astack-machine-"));
		mkdirSync(join(root, "projects"));
		const other = companionFrom(root, {});
		const path = companionPaths(other).machine;
		if (machine !== undefined) writeFileSync(path, machine);
		expect(await readLeakScan(other, [])).toEqual({
			ok: false,
			error: message(path),
		});
	});
});
