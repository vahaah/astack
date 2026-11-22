import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveGateRecord } from "../../src/astack/gates.ts";
import { gitInvocation } from "../../src/astack/git-command.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import type { Context, Handler } from "../../src/astack/hook/events.ts";
import {
	handler as destructive,
	type Treeish,
	type WorkLoss,
	workLoss,
} from "../../src/astack/hook/handlers/destructive.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import { isScratchPath } from "../../src/astack/paths.ts";
import type { ReadPullRequest } from "../../src/astack/pr/github.ts";
import {
	AUTHORITY,
	type Change,
	type Command,
	codeLost,
	loadSessionGuards,
	MERGE_START,
	merge,
	oneOf,
	orderedPrompts,
	pinFailures,
	prompt,
	promptPayload,
	pullRequest,
	push,
	readSessionGuards,
	scratch,
	toolPayload,
} from "./session-guards-model.ts";

const ROOT = join(import.meta.dir, "../..");
const MODEL = loadSessionGuards(ROOT);
const TEMP = mkdtempSync(join(tmpdir(), "astack-conformance-"));
afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

function git(dir: string, ...args: string[]): string {
	const run = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
	return run.stdout.trim();
}

function context(cwd: string, env: Context["env"]): Context {
	return {
		tool: "claude-code",
		event: "PreToolUse",
		cwd,
		projectDir: cwd,
		env,
		today: "2026-11-22",
		session: "conformance",
	};
}

describe("the SessionGuards model reader", () => {
	test("reads the spec that the registry names and counts each table", () => {
		expect(MODEL.path).toBe("formal/SessionGuards.tla");
		expect({
			prs: MODEL.prs,
			clauses: MODEL.clauses.length,
			prompts: MODEL.prompts.length,
			sources: MODEL.sources,
			baseAuthorities: MODEL.baseAuthorities,
			channels: MODEL.channels,
			kinds: MODEL.kinds,
			places: MODEL.places,
			changes: MODEL.changes.length,
			commands: MODEL.commands.length,
			files: MODEL.files.length,
			targets: MODEL.targets,
		}).toEqual({
			prs: [1, 2],
			clauses: 7,
			prompts: 28,
			sources: ["frame", "machine", "none", "user"],
			baseAuthorities: ["base", "standing", "turn", "unread"],
			channels: ["gh", "mcp"],
			kinds: ["both", "staged", "unstaged", "untracked"],
			places: ["folder", "named", "other"],
			changes: 12,
			commands: 16,
			files: 16,
			targets: ["commit", "head", "refs"],
		});
		expect(MODEL.commands).toContainEqual({
			name: "restore -SW src",
			lost: "tracked",
			scope: "folder",
			effect: "tracked",
		});
	});

	test("a row added to a table changes its count", () => {
		const text = MODEL.text.replace(
			'[name |-> "stash", lost |-> "none", scope |-> "tree", effect |-> "stash"]}',
			'[name |-> "stash", lost |-> "none", scope |-> "tree", effect |-> "stash"],\n   [name |-> "stash -u", lost |-> "none", scope |-> "tree", effect |-> "stash"]}',
		);
		expect(readSessionGuards(MODEL.path, text).commands.length).toBe(17);
	});

	describe("[control:sg-model-pin] the mirror pins", () => {
		test("each operator that the mirror copies equals its pin", () => {
			expect(pinFailures(MODEL.text)).toEqual([]);
		});

		test.each([
			["ModeOf", 'IF p = {"fullStop"}', 'IF "fullStop" \\in p'],
			["Merge", '/\\ mode # "fullStop"\n', ""],
			[
				"Scratch",
				"~f.inProject /\\ ~(f.git",
				"~f.inProject /\\ (f.inTemp \\/ ~(f.git",
			],
		])("a changed %s fails its pin", (name, from, to) => {
			expect(MODEL.text).toContain(from);
			expect(pinFailures(MODEL.text.replace(from, to))).toEqual([name]);
		});
	});
});

const TREES: Treeish = (name) => name === "HEAD" || name === "main";
const PATHSPEC_SCOPE: Readonly<Record<string, string>> = {
	":/": "tree",
	".": "tree",
	src: "folder",
	"notes.txt": "named",
};
const PLACE_FILE: Readonly<Record<string, string>> = {
	named: "notes.txt",
	folder: "src/a.txt",
	other: "other.txt",
};

type Row = {
	readonly name: string;
	readonly lost: string;
	readonly scope?: string;
};

function codeRow(command: Command): Row {
	const invocation = gitInvocation(["git", ...command.name.split(" ")], ROOT);
	const loss: WorkLoss | undefined =
		invocation === undefined ? undefined : workLoss(invocation, TREES);
	return loss === undefined
		? { name: command.name, lost: "none" }
		: {
				name: command.name,
				lost: loss.lost,
				scope: loss.pathspecs.map((spec) => oneOf(PATHSPEC_SCOPE, spec)).join(),
			};
}

function changedRepo(change: Change): string {
	const dir = join(TEMP, "work-loss", `${change.kind}-${change.place}`);
	const file = oneOf(PLACE_FILE, change.place);
	mkdirSync(join(dir, "src"), { recursive: true });
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "T");
	git(dir, "config", "commit.gpgsign", "false");
	for (const path of Object.values(PLACE_FILE))
		if (change.kind !== "untracked" || path !== file)
			writeFileSync(join(dir, path), "base\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "base");
	writeFileSync(join(dir, file), "staged\n");
	if (change.kind === "staged" || change.kind === "both") git(dir, "add", file);
	if (change.kind === "both") writeFileSync(join(dir, file), "work\n");
	return dir;
}

describe("[control:sg-conformance-work-loss] the work-loss guard answers each row of the model", () => {
	test("workLoss gives the kind and the scope of each command row", () => {
		expect(MODEL.commands.map(codeRow)).toEqual(
			MODEL.commands.map(
				({ name, lost, scope }): Row =>
					lost === "none" ? { name, lost } : { name, lost, scope },
			),
		);
	});

	test("the destructive handler denies a command on a repo with one change exactly when CodeLost holds", () => {
		const env = { ASTACK_STATE_DIR: join(TEMP, "work-loss-state") };
		const verdicts = MODEL.changes.flatMap((change) => {
			const dir = changedRepo(change);
			return MODEL.commands.map((command) => ({
				command: command.name,
				change,
				code:
					destructive.run(
						{ kind: "shell", command: `git ${command.name}`, cwd: dir },
						context(dir, env),
					).kind === "deny",
				model: codeLost(command, [change]).length > 0,
			}));
		});
		expect(verdicts.length).toBe(MODEL.changes.length * MODEL.commands.length);
		expect(verdicts.filter(({ code, model }) => code !== model)).toEqual([]);
		expect(verdicts.some(({ model }) => model)).toBe(true);
	});
});

const PUSH_FORMS: Readonly<Record<string, readonly [string, string]>> = {
	head: ["git push", "git push --no-verify"],
	refs: ["git push --all", "git push --no-verify --all"],
	commit: ["git commit -m x", "git commit --no-verify -m x"],
};

describe("[control:sg-conformance-push] the push guard answers each target of the model", () => {
	test("a hook skip passes exactly when Push allows it", () => {
		const dir = join(TEMP, "push");
		mkdirSync(dir, { recursive: true });
		git(dir, "init", "-q", "-b", "main");
		git(dir, "config", "user.email", "t@example.com");
		git(dir, "config", "user.name", "T");
		git(dir, "commit", "-q", "--allow-empty", "-m", "base");
		const head = git(dir, "rev-parse", "HEAD");
		const states = [false, true].map((recorded) => {
			const env = { ASTACK_STATE_DIR: join(TEMP, `push-${recorded}`) };
			if (recorded)
				saveGateRecord(env, {
					head,
					base: "main",
					baseSha: head,
					ran: [],
					skipped: [],
				});
			return { recorded, env };
		});
		const verdicts = MODEL.targets.flatMap((target) =>
			states.flatMap(({ recorded, env }) =>
				[false, true].map((skips) => {
					const command = oneOf(PUSH_FORMS, target)[skips ? 1 : 0] ?? "";
					return {
						target,
						recorded,
						skips,
						code:
							destructive.run(
								{ kind: "shell", command, cwd: dir },
								context(dir, env),
							).kind !== "deny",
						model: push(skips, target, recorded),
					};
				}),
			),
		);
		expect(verdicts.length).toBe(MODEL.targets.length * 4);
		expect(verdicts.filter(({ code, model }) => code !== model)).toEqual([]);
	});
});

describe("[control:sg-conformance-merge] the merge guard answers each merge of the model", () => {
	test("each prompt, source, attended state, base authority and PR gives the merge verdict of the model, and an MCP merge and a failed PR read give a deny", () => {
		const project = join(TEMP, "merge-project");
		mkdirSync(project, { recursive: true });
		const stateDir = join(TEMP, "merge-state");
		let id = 0;
		const verdicts = orderedPrompts(MODEL).flatMap((clauses) =>
			MODEL.sources.flatMap((source) =>
				[true, false].flatMap((attended) =>
					MODEL.baseAuthorities.flatMap((authority) =>
						MODEL.prs.map((n) => {
							const session = `merge-${id++}`;
							const env = attended
								? { ASTACK_STATE_DIR: stateDir }
								: {
										ASTACK_STATE_DIR: stateDir,
										CLAUDE_CODE_SESSION_ATTENDED: "0",
									};
							const pr = pullRequest(n, oneOf(AUTHORITY, authority));
							const read: ReadPullRequest = () => pr;
							const deps = (handler: Handler) => ({
								cwd: project,
								today: "2026-11-22",
								readText: () => undefined,
								handlers: [handler],
							});
							const guard = mergeGuard(read);
							runHook(
								"claude-code",
								"UserPromptSubmit",
								promptPayload(session, project, clauses, source),
								env,
								deps(guard),
							);
							const passes = (handler: Handler, name: string, input: object) =>
								runHook(
									"claude-code",
									"PreToolUse",
									toolPayload(session, project, name, input),
									env,
									deps(handler),
								).exit === 0;
							const thrown = mergeGuard(() => {
								throw new Error("gh failed");
							});
							const modelState = prompt(
								MODEL,
								MERGE_START,
								clauses,
								source,
								attended,
							);
							return {
								case: `${clauses.join("+")} ${source} ${attended} ${authority} ${n}`,
								code: [
									passes(guard, "Bash", {
										command: `gh pr merge ${pr.number}`,
									}),
									passes(guard, "mcp__github__merge_pull_request", {
										owner: "o",
										repo: "r",
										pullNumber: pr.number,
									}),
									passes(thrown, "Bash", {
										command: `gh pr merge ${pr.number}`,
									}),
								],
								model: [
									merge(modelState, authority, n, "gh", false),
									merge(modelState, authority, n, "mcp", false),
									merge(modelState, authority, n, "gh", true),
								],
							};
						}),
					),
				),
			),
		);
		expect(verdicts.length).toBe(
			orderedPrompts(MODEL).length *
				MODEL.sources.length *
				2 *
				MODEL.baseAuthorities.length *
				MODEL.prs.length,
		);
		expect(
			verdicts.filter(({ code, model }) => code.join() !== model.join()),
		).toEqual([]);
		expect(verdicts.filter(({ model }) => model[0]).length).toBeGreaterThan(0);
	});
});

describe("[control:sg-conformance-scratch] isScratchPath answers each file fact of the model", () => {
	test("each fact gives the Scratch verdict of the model", () => {
		const temp = join(TEMP, "scratch", "tmp");
		const home = join(TEMP, "scratch", "home");
		const other = join(home, "project");
		mkdirSync(other, { recursive: true });
		const saved = process.env.TMPDIR;
		process.env.TMPDIR = temp;
		try {
			const verdicts = MODEL.files.map((fact, index) => {
				const base = join(fact.inTemp ? temp : home, `fact-${index}`);
				mkdirSync(join(base, "sub"), { recursive: true });
				if (fact.git) mkdirSync(join(base, ".git"));
				if (fact.marked) {
					mkdirSync(join(base, ".astack"));
					writeFileSync(join(base, ".astack/profile.json"), "{}\n");
				}
				const file = join(base, "sub", "probe.ts");
				writeFileSync(file, "export {};\n");
				return {
					fact,
					code: isScratchPath(fact.inProject ? base : other, file),
					model: scratch(fact),
				};
			});
			expect(verdicts.length).toBe(16);
			expect(verdicts.filter(({ code, model }) => code !== model)).toEqual([]);
			expect(verdicts.filter(({ model }) => model).length).toBe(2);
		} finally {
			if (saved === undefined) delete process.env.TMPDIR;
			else process.env.TMPDIR = saved;
		}
	});
});
