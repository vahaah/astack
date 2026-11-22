import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import type {
	Context,
	Handler,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { handler as destructive } from "../../src/astack/hook/handlers/destructive.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import type { PullRequestState } from "../../src/astack/pr/github.ts";
import { DEFAULT_MERGE_PROFILE } from "../../src/astack/pr/profile.ts";

const root = mkdtempSync(join(tmpdir(), "astack-wrapper-law-"));
const repo = join(root, "repo");
afterAll(() => rmSync(root, { recursive: true, force: true }));

function git(...args: string[]): void {
	spawnSync("git", args, { cwd: repo });
}

mkdirSync(repo);
git("init", "-q", "-b", "feature");
git("config", "user.email", "t@example.com");
git("config", "user.name", "T");
writeFileSync(join(repo, "a.txt"), "a\n");
git("add", ".");
git("commit", "-q", "-m", "base");
writeFileSync(join(repo, "a.txt"), "b\n");
writeFileSync(join(repo, "scratch.txt"), "x\n");

const HEAD = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const GREEN: PullRequestState = {
	number: 12,
	url: "https://github.com/o/r/pull/12",
	title: "feat: x",
	body: "Part of ABC-1\n\n## Why\nx",
	base: "main",
	head: HEAD,
	openThreads: 0,
	threadsListed: true,
	checks: "success",
	checkedHead: HEAD,
	authority: {
		kind: "committed",
		commit: HEAD,
		profile: DEFAULT_MERGE_PROFILE,
	},
};

const merge = mergeGuard(() => GREEN);

function context(event: Context["event"]): Context {
	return {
		tool: "claude-code",
		event,
		cwd: repo,
		projectDir: repo,
		env: { ASTACK_STATE_DIR: join(root, "state") },
		today: "2026-11-22",
		session: "law",
	};
}

merge.run(
	{ kind: "prompt", text: "merge 12 when green", human: true, session: "law" },
	context("UserPromptSubmit"),
);

function verdict(guard: Handler, command: string): Verdict {
	return guard.run(
		{ kind: "shell", command, cwd: repo },
		context("PreToolUse"),
	);
}

const COMMANDS = [
	"git reset --hard",
	"git checkout .",
	"git clean -fd",
	"git push --no-verify",
	"git commit --no-verify -m x",
	"gh pr merge 12 --admin",
	"gh pr merge 12",
	"gh api -X PUT repos/o/r/pulls/12/merge",
	"git status",
	"git log --oneline",
	"gh pr view 12",
	"ls",
] as const;

const WRAPPERS = [
	"env",
	"env -i",
	"command",
	"command -p",
	"builtin",
	"exec",
	"time",
	"time -p",
	"nohup",
	"nice",
	"nice -n 5",
	"timeout 60",
	"timeout -s KILL 60",
	"sudo",
	"sudo -u root",
	"doas",
	"doas -u root",
	"stdbuf -o0",
] as const;

const KEEPS_ENV = WRAPPERS.filter((wrapper) => wrapper !== "env -i");

const GUARDS: readonly (readonly [string, Handler, readonly string[]])[] = [
	["destructive", destructive, WRAPPERS],
	["merge-guard", merge, KEEPS_ENV],
];

function chains(list: readonly string[]) {
	return fc.array(fc.constantFrom(...list), { minLength: 1, maxLength: 3 });
}
const command = fc.constantFrom(...COMMANDS);

describe("the wrapper law of the guards", () => {
	test("[control:sg-wrapper-law] a wrapper keeps the verdict and the reason of its plain form in both guards", () => {
		for (const [, guard, list] of GUARDS)
			fc.assert(
				fc.property(chains(list), command, (chain, plain) => {
					expect(verdict(guard, `${chain.join(" ")} ${plain}`)).toEqual(
						verdict(guard, plain),
					);
				}),
				{ numRuns: 150 },
			);
	});

	test("xargs adds words, so it keeps only the deny or allow of its plain form", () => {
		for (const [, guard, list] of GUARDS)
			fc.assert(
				fc.property(chains(list), command, (chain, plain) => {
					expect(verdict(guard, `xargs ${chain.join(" ")} ${plain}`).kind).toBe(
						verdict(guard, plain).kind,
					);
				}),
				{ numRuns: 100 },
			);
	});
});
