import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Io } from "../../src/astack/cli/io.ts";
import { main } from "../../src/astack/cli/main.ts";
import { MANAGED_PATHS } from "../../src/astack/managed.ts";
import {
	MISSING_PROFILE_REPAIR,
	NO_BLOCK_REPAIR,
} from "../../src/astack/pr-review-profile.ts";

const example = readFileSync(
	resolve(
		import.meta.dir,
		"../../examples/companion/projects/acme/pr-review-hardening.profile.md",
	),
	"utf8",
);
const proofGate = `  - name: change-proof
    command: astack check proof --base origin/main
    env: []
    requires: []
    setup: []
    when_changed: []
    ci_env: []
    after: []
    tools: {}
    rewrites: []
`;

const markerProfile = (extra: string) =>
	[
		"# Profile",
		"",
		"```yaml",
		"version: 1",
		"gates:",
		"  - name: change-proof",
		"    command: astack check proof --base origin/main",
		"test:",
		"  name: test",
		"  command: bun test",
		"typescript:",
		"  rules: true",
		'  boundary_cast_marker: "// BOUNDARY-CAST:"',
		extra,
		"```",
		"",
	].join("\n");
const castKeep = "^\\s*// BOUNDARY-CAST: ";
const markerProblem =
	'typescript.boundary_cast_marker: no commentKeep pattern of the repo matches "// BOUNDARY-CAST:". Add a pattern that matches the marker to commentKeep in .astack/profile.json. Apply writes that list from keepPatterns of the project config';

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function repoWith(
	profile: string | undefined,
	commentKeep?: readonly string[],
): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-hp-")));
	dirs.push(dir);
	spawnSync("git", ["init", "-q", dir]);
	if (profile !== undefined) {
		mkdirSync(join(dir, ".claude"));
		writeFileSync(join(dir, MANAGED_PATHS.reviewProfile), profile);
	}
	if (commentKeep !== undefined) {
		mkdirSync(join(dir, ".astack"));
		writeFileSync(
			join(dir, MANAGED_PATHS.profile),
			JSON.stringify({ commentKeep }),
		);
	}
	return dir;
}

async function check(cwd: string) {
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
		today: "2026-11-22",
		now: new Date("2026-11-22T00:00:00Z"),
		scriptPath: undefined,
	};
	const code = await main(["check", "hardening-profile"], io);
	return { code, out, err };
}

test("[control:hp-proof-gate] a profile with no change-proof gate exits 1 with the gate issue and its repair", async () => {
	expect(example).toContain(proofGate);
	const repo = repoWith(example.replace(proofGate, ""));
	const path = join(repo, MANAGED_PATHS.reviewProfile);
	expect(await check(repo)).toEqual({
		code: 1,
		out: `${path}: gates: needs one gate named change-proof that runs astack check proof. Copy the change-proof gate from the Template section of references/profile.md of the pr-review-hardening skill\n`,
		err: "",
	});
});

test("[control:hp-ok] a profile that passes each rule exits 0", async () => {
	const repo = repoWith(example);
	expect(await check(repo)).toEqual({
		code: 0,
		out: `ok: ${join(repo, MANAGED_PATHS.reviewProfile)} passes the hardening profile rules\n`,
		err: "",
	});
});

test.each([
	[
		"[control:hp-missing] a missing profile",
		undefined,
		"is missing",
		MISSING_PROFILE_REPAIR,
	],
	[
		"[control:hp-no-block] a profile with no fenced block",
		"# Profile\n\nNo block here.\n",
		"has no fenced yaml or json block",
		NO_BLOCK_REPAIR,
	],
])(
	"%s exits 2 with the path and its repair",
	async (_name, profile, problem, repair) => {
		const repo = repoWith(profile);
		expect(await check(repo)).toEqual({
			code: 2,
			out: "",
			err: `astack check hardening-profile: ${join(repo, MANAGED_PATHS.reviewProfile)} ${problem}. ${repair}\n`,
		});
	},
);

test.each([
	["matches", [castKeep], 0, "ok"],
	["does not match", ["^TODO"], 1, "problem"],
] as const)(
	"[control:rs-keep-command] a boundary cast marker whose commentKeep pattern %s",
	async (_case, commentKeep, code, kind) => {
		const repo = repoWith(markerProfile(""), commentKeep);
		const path = join(repo, MANAGED_PATHS.reviewProfile);
		expect(await check(repo)).toEqual({
			code,
			out:
				kind === "ok"
					? `ok: ${path} passes the hardening profile rules\n`
					: `${path}: ${markerProblem}\n`,
			err: "",
		});
	},
);

test("[control:rs-window-command] a profile that still sets comments.keep_patterns exits 0", async () => {
	const repo = repoWith(markerProfile("comments:\n  keep_patterns: []"), [
		castKeep,
	]);
	expect((await check(repo)).code).toBe(0);
});

test.each([
	["true", 0, "ok"],
	["false", 0, "ok"],
	["1", 1, "converge: must be true or false"],
] as const)(
	"[control:profile-converge] the opt-in converge key with the value %s exits %d",
	async (value, code, result) => {
		const repo = repoWith(markerProfile(`converge: ${value}`), [castKeep]);
		const path = join(repo, MANAGED_PATHS.reviewProfile);
		expect(await check(repo)).toEqual({
			code,
			out:
				result === "ok"
					? `ok: ${path} passes the hardening profile rules\n`
					: `${path}: ${result}. Change it as references/profile.md of the pr-review-hardening skill says\n`,
			err: "",
		});
	},
);
