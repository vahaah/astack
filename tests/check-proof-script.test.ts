import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pinnedJar } from "../src/astack/change-proof/runner.ts";
import {
	BASE_FILES,
	git,
	PROOF_FILES,
	scratchDir,
	validProof,
	writeFiles,
} from "./astack/change-proof-fixture.ts";
import { heavyTestTimeout } from "./heavy-test.ts";

const SCRIPT = resolve(import.meta.dir, "../scripts/check-proof.ts");

const rule = (section: string): string =>
	`rule: read the section "${section}" of the file that "astack skill-path astack:pr-review-hardening references/proof-contract.md" prints\n`;
const scratch = scratchDir("astack-check-proof-script-");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function environment(
	extra: Readonly<Record<string, string>>,
): Record<string, string> {
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? homedir(),
		...extra,
	};
	for (const name of ["JAVA_HOME", "ASTACK_TLC_JAR", "XDG_CACHE_HOME"]) {
		const value = process.env[name];
		if (value !== undefined) env[name] = value;
	}
	return env;
}

const prepared = await pinnedJar(environment({}), scratch);
if (!prepared.ok) throw new Error(prepared.error);

type Pushed = { readonly root: string; readonly event: string };

type OriginMain = "head" | "r" | "ahead";

function mergedQAfterR(
	originMain: OriginMain,
	extraCommit: boolean,
	payload: string,
): Pushed {
	const root = mkdtempSync(join(scratch, "repo-"));
	git(root, "init", "-q", "-b", "main");
	writeFiles(root, BASE_FILES);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "M0");
	const m0 = git(root, "rev-parse", "HEAD");
	writeFiles(root, { "notes/r.md": "PR R\n" });
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "merge PR R");
	const r = git(root, "rev-parse", "HEAD");
	writeFiles(root, {
		...PROOF_FILES,
		".astack/proof.json": `${JSON.stringify(validProof(m0), null, 2)}\n`,
	});
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "PR Q with base M0");
	if (extraCommit) {
		writeFiles(root, { "src/gate.ts": `${PROOF_FILES["src/gate.ts"]}\n` });
		git(root, "commit", "-q", "-am", "PR Q again");
	}
	const head = git(root, "rev-parse", "HEAD");
	const tips: Record<OriginMain, string> = {
		head,
		r,
		ahead: git(
			root,
			"commit-tree",
			"HEAD^{tree}",
			"-p",
			head,
			"-m",
			"main moves on",
		),
	};
	git(root, "update-ref", "refs/remotes/origin/main", tips[originMain]);
	const event = `${root}.event.json`;
	writeFileSync(event, payload);
	return { root, event };
}

function pushRun(repo: Pushed, ref: string) {
	const result = spawnSync(process.execPath, [SCRIPT], {
		cwd: repo.root,
		encoding: "utf8",
		env: environment({
			GITHUB_EVENT_NAME: "push",
			GITHUB_REF: ref,
			GITHUB_EVENT_PATH: repo.event,
		}),
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const PAYLOAD = JSON.stringify({ repository: { default_branch: "main" } });

test.each<[string, string, OriginMain, boolean]>([
	["a push to the default branch", "refs/heads/main", "head", false],
	["a release tag", "refs/tags/v1.0.0", "head", false],
	["a push to another branch", "refs/heads/topic", "r", true],
	["a new branch at the default branch tip", "refs/heads/topic", "head", false],
	["a branch behind the default branch", "refs/heads/topic", "ahead", false],
])(
	"[control:proof-push-base] %s admits PR Q with base M0 after PR R merged",
	(_name, ref, originMain, extraCommit) => {
		const repo = mergedQAfterR(originMain, extraCommit, PAYLOAD);
		const run = pushRun(repo, ref);
		expect(run.err).toBe("");
		expect(run.out.trimEnd().split("\n").at(-1)).toBe(
			`ok: proof gate-admission admitted at ${git(repo.root, "rev-parse", "HEAD")}`,
		);
		expect(run.code).toBe(0);
	},
	heavyTestTimeout,
);

test("[control:proof-push-payload] a branch push with no default branch in the event payload fails before the proof", () => {
	const repo = mergedQAfterR("head", false, "{}");
	expect(pushRun(repo, "refs/heads/main")).toEqual({
		code: 1,
		out: "",
		err: "A push proof needs repository.default_branch in the GITHUB_EVENT_PATH payload.\n",
	});
});

function localRun(root: string) {
	const result = spawnSync(process.execPath, [SCRIPT], {
		cwd: root,
		encoding: "utf8",
		env: environment({}),
	});
	return { code: result.status, out: result.stdout, err: result.stderr };
}

const followMain = (root: string): void => {
	git(
		root,
		"symbolic-ref",
		"refs/remotes/origin/HEAD",
		"refs/remotes/origin/main",
	);
};

const rootCommit = (root: string): string =>
	git(root, "rev-list", "--max-parents=0", "HEAD");

test.each<[string, OriginMain, boolean]>([
	["a branch that merged main", "r", true],
	["a clean default tip with 0 changed files", "head", false],
])(
	"[control:proof-local-base] a local run on %s admits PR Q with base M0 after PR R merged",
	(_name, originMain, extraCommit) => {
		const repo = mergedQAfterR(originMain, extraCommit, PAYLOAD);
		followMain(repo.root);
		const run = localRun(repo.root);
		expect(run.err).toBe("");
		expect(run.out.trimEnd().split("\n").at(-1)).toBe(
			`ok: proof gate-admission admitted at ${git(repo.root, "rev-parse", "HEAD")}`,
		);
		expect(run.code).toBe(0);
	},
	heavyTestTimeout,
);

test("[control:proof-local-untracked] an untracked path at the default tip reads its diff from origin/main", () => {
	const repo = mergedQAfterR("head", false, PAYLOAD);
	followMain(repo.root);
	writeFileSync(join(repo.root, "notes/new.md"), "new\n");
	const idle = validProof(rootCommit(repo.root)).scope.map(
		(row) => `scope row ${row.path} covers no changed path`,
	);
	expect(localRun(repo.root)).toEqual({
		code: 1,
		err: rule("Required records"),
		out: `stop: proof controls: ${["no scope row covers the changed path notes/new.md", ...idle].join("; ")}\n`,
	});
});

test.each<[string, (root: string) => void]>([
	["a missing origin/HEAD", () => {}],
	[
		"a dangling origin/HEAD",
		(root) =>
			git(
				root,
				"symbolic-ref",
				"refs/remotes/origin/HEAD",
				"refs/remotes/origin/gone",
			),
	],
])(
	"[control:proof-local-fallback] a local run with %s keeps the manifest base",
	(_name, setup) => {
		const repo = mergedQAfterR("r", true, PAYLOAD);
		setup(repo.root);
		expect(localRun(repo.root)).toEqual({
			code: 1,
			err: rule("Required records"),
			out: "stop: proof controls: no scope row covers the changed path notes/r.md\n",
		});
	},
);

test("[control:proof-local-shallow] a local run on a clean default tip with no HEAD^ keeps the manifest base", () => {
	const repo = mergedQAfterR("head", false, PAYLOAD);
	const shallow = `${repo.root}-shallow`;
	git(
		scratch,
		"clone",
		"-q",
		"--depth",
		"1",
		pathToFileURL(repo.root).href,
		shallow,
	);
	expect(localRun(shallow)).toEqual({
		code: 1,
		err: rule("Base"),
		out: `stop: proof stale: the base ${rootCommit(repo.root)} is not a commit in this repository\n`,
	});
});
