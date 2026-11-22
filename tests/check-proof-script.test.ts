import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pinnedJar } from "../src/astack/change-proof/runner.ts";
import {
	BASE_FILES,
	git,
	PROOF_FILES,
	scratchDir,
	validProof,
	writeFiles,
} from "./astack/change-proof-fixture.ts";

const SCRIPT = resolve(import.meta.dir, "../scripts/check-proof.ts");
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

function mergedQAfterR(
	originMain: "head" | "r",
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
	git(
		root,
		"update-ref",
		"refs/remotes/origin/main",
		originMain === "head" ? git(root, "rev-parse", "HEAD") : r,
	);
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

test.each<[string, string, "head" | "r", boolean]>([
	["a push to the default branch", "refs/heads/main", "head", false],
	["a release tag", "refs/tags/v1.0.0", "head", false],
	["a push to another branch", "refs/heads/topic", "r", true],
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
);

test("[control:proof-push-payload] a branch push with no default branch in the event payload fails before the proof", () => {
	const repo = mergedQAfterR("head", false, "{}");
	expect(pushRun(repo, "refs/heads/main")).toEqual({
		code: 1,
		out: "",
		err: "A push proof needs repository.default_branch in the GITHUB_EVENT_PATH payload.\n",
	});
});
