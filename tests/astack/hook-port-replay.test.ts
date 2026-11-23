import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { nameHash } from "../../src/astack/deny-list.ts";
import { denyStore, writeDenyList } from "../../src/astack/deny-store.ts";
import { fileStore, runCursorHook } from "../../src/astack/hook/cursor.ts";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import type { HookOutput } from "../../src/astack/hook/encode/base.ts";
import type { Handler, HookEventName } from "../../src/astack/hook/events.ts";
import { duplicatePr } from "../../src/astack/hook/handlers/duplicate-pr.ts";
import { HANDLERS } from "../../src/astack/hook/handlers/index.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import { outbound } from "../../src/astack/hook/handlers/outbound.ts";
import { type Ports, processPorts } from "../../src/astack/ports.ts";
import type { Env } from "../../src/astack/process.ts";
import { buildTemplate, copyRepo, git } from "../git-template.ts";
import { heavyTestTimeout } from "../heavy-test.ts";
import { answerCount, noAnswers, recording, replaying } from "./port-replay.ts";

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "astack-replay-")));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const LISTED_NAME = "Zeta Widget";

const PLAN = (cites: string) => `---
plan: demo
tier: standard
status: active
home: repo
tracker: none
delegate: off
checkpoints: report
execute: none
reviewed: 2026-10-16
---

# Two steps add two routes

## Goal

Goal. The router serves two new routes.
Decision. Do both routes ship in one PR?
Done when. \`bun test routes\` passes, and today 2 of 4 checks fail.

## Scope

- In. Two routes.${cites}
- Out. The client.

## Decisions

None.

## Sessions

### S1 One PR adds both routes

State. now
Depends on. None.
Exit.
- Given each new route, when a client calls it, then it returns 200.
Proof. \`bun test routes\`

| # | Step | Wave | Lane | Files | Covers | Exit | Proof | Checkpoint |
|---|---|---|---|---|---|---|---|---|
| 1 | Add the list route | W1 | a | src/router.ts | | The list route returns 200 | \`bun test routes/list\` | report |
| 2 | Add the detail route | W1 | b | src/routes.ts | | The detail route returns 200 | \`bun test routes/detail\` | report |

## Unresolved questions

None.
`;

const FILES: Readonly<Record<string, string>> = {
	".astack/profile.json": JSON.stringify({
		ste: { mode: "deny", technicalVerbs: ["utilize"] },
		tracker: { kind: "linear", team: "ABC", requirePartOf: true },
	}),
	"a.ts": "export const a = 1;\n",
	"b.ts": 'export const b = JSON.parse("1") as any;\n',
	".github/PULL_REQUEST_TEMPLATE.md": "## Summary\n\n## Test plan\n",
	".github/ISSUE_TEMPLATE/bug_report.md":
		"---\nname: Bug report\n---\n## What happened\n\n## How to reproduce\n",
	"docs/plans/demo.md": PLAN(""),
	"docs/adr/0001-routes-share-one-router.md":
		"# 0001. Routes share one router\n\n## Decisions\n\n### D1. One router\n\nText.\n",
	"msg.txt":
		"feat: change a\n\nThis change utilizes the new reader, e.g. for the export.\n",
	"body.md": "Fixes ABC-1\n",
	"note.md": `Notes for ${LISTED_NAME}\n`,
};

const template = buildTemplate(
	{
		name: "replay",
		repos: ["."],
		build: (root) => {
			git(root, ["init", "-q", "-b", "main"]);
			git(root, ["config", "user.email", "t@example.com"]);
			git(root, ["config", "user.name", "T"]);
			git(root, ["remote", "add", "origin", "https://github.com/o/r.git"]);
			for (const [path, text] of Object.entries(FILES)) {
				mkdirSync(dirname(join(root, path)), { recursive: true });
				writeFileSync(join(root, path), text);
			}
			git(root, ["add", "."]);
			git(root, ["commit", "-q", "-m", "first"]);
			git(root, ["checkout", "-q", "-b", "dev/feature"]);
			writeFileSync(
				join(root, "a.ts"),
				"// ABC-123: now uses the new API\nexport const a = 2;\n",
			);
			git(root, ["add", "a.ts"]);
		},
	},
	scratch,
);

const SESSION = "replay";

function handlerNamed(id: string): Handler {
	const found = HANDLERS.find((handler) => handler.id === id);
	if (found === undefined) throw new Error(`no handler ${id}`);
	return found;
}

type HookRun = {
	readonly name: string;
	readonly handler: Handler;
	readonly event: HookEventName;
	readonly fields: (root: string) => Readonly<Record<string, unknown>>;
	readonly shows: string;
};

const bash = (command: string) => () => ({
	tool_name: "Bash",
	tool_input: { command },
});

const RUNS: readonly HookRun[] = [
	{
		name: "comments",
		handler: handlerNamed("comments"),
		event: "PreToolUse",
		fields: bash('git commit -m "feat: change a"'),
		shows: "ABC-123",
	},
	{
		name: "types",
		handler: handlerNamed("types"),
		event: "PreToolUse",
		fields: bash(
			'cat > b.ts <<\'EOF\'\nexport const b = JSON.parse("1") as any;\nexport const c = JSON.parse("2") as any;\nEOF',
		),
		shows: "2 now and 1 before",
	},
	{
		name: "ste-artifact",
		handler: handlerNamed("ste-artifact"),
		event: "PreToolUse",
		fields: bash("git commit -F msg.txt"),
		shows: "commit message",
	},
	{
		name: "ste-reply",
		handler: handlerNamed("ste-reply"),
		event: "Stop",
		fields: () => ({
			last_assistant_message:
				"You utilize the new reader, e.g. for the reports.",
			stop_hook_active: false,
		}),
		shows: "e.g.",
	},
	{
		name: "destructive",
		handler: handlerNamed("destructive"),
		event: "PreToolUse",
		fields: bash("git reset --hard"),
		shows: "a.ts",
	},
	{
		name: "merge-guard",
		handler: mergeGuard(() => undefined),
		event: "PreToolUse",
		fields: bash("gh pr merge 12 --squash --body-file body.md"),
		shows: "Fixes ABC-1",
	},
	{
		name: "pr-body",
		handler: handlerNamed("pr-body"),
		event: "PreToolUse",
		fields: bash("gh pr create --title 'feat: x' --body 'Some text'"),
		shows: "Test plan",
	},
	{
		name: "ticket",
		handler: handlerNamed("ticket"),
		event: "PreToolUse",
		fields: bash(
			"gh issue create --title 'Login crash' --body '## What happened\nIt broke.'",
		),
		shows: "How to reproduce",
	},
	{
		name: "duplicate-pr",
		handler: duplicatePr(() => [
			{
				number: 7,
				url: "https://github.com/o/r/pull/7",
				head: "dev/feature",
				title: "feat: y",
				body: "Part of ABC-2",
			},
		]),
		event: "PreToolUse",
		fields: bash("gh pr create --title 'feat: x' --body 'Part of ABC-1'"),
		shows: "#7",
	},
	{
		name: "outbound",
		handler: outbound(() => "public"),
		event: "PreToolUse",
		fields: bash("gh issue comment 1 --body-file note.md"),
		shows: "deny list",
	},
	{
		name: "plan-file",
		handler: handlerNamed("plan-file"),
		event: "PreToolUse",
		fields: (root) => ({
			tool_name: "Write",
			tool_input: {
				file_path: join(root, "docs/plans/demo.md"),
				content: PLAN(" ADR 0001 D2 holds the rule."),
			},
		}),
		shows: "has no ### D2. heading",
	},
	{
		name: "plan-pointer",
		handler: handlerNamed("plan-pointer"),
		event: "SessionStart",
		fields: () => ({}),
		shows: "demo",
	},
];

function stateOf(root: string): string {
	return `${root}-state`;
}

function freshState(root: string): Env {
	const state = stateOf(root);
	rmSync(state, { recursive: true, force: true });
	mkdirSync(state);
	const env = {
		ASTACK_STATE_DIR: state,
		ASTACK_STE_TEST_INTERACTIVE: "1",
	};
	writeDenyList(new Set([nameHash(LISTED_NAME)]), denyStore(env));
	return env;
}

function hook(run: HookRun, root: string, ports: () => Ports): HookOutput {
	return runHook(
		"claude-code",
		run.event,
		JSON.stringify({ cwd: root, session_id: SESSION, ...run.fields(root) }),
		freshState(root),
		{ cwd: root, today: "2026-11-23", ports, handlers: [run.handler] },
	);
}

function cursorStop(root: string, ports: () => Ports): HookOutput {
	const env = freshState(root);
	const store = fileStore(stateOf(root));
	store.saveProblem({
		session: SESSION,
		workspace: root,
		handler: "types",
		path: join(root, "b.ts"),
		before: null,
		currentHash: "0".repeat(64),
		reason: "an earlier reason",
	});
	return runCursorHook(
		"stop",
		JSON.stringify({
			conversation_id: SESSION,
			status: "completed",
			workspace_roots: [root],
		}),
		env,
		{
			cwd: root,
			today: "2026-11-23",
			ports,
			handlers: [handlerNamed("types")],
			store,
		},
	);
}

function replayed(
	name: string,
	call: (root: string, ports: () => Ports) => HookOutput,
) {
	const root = join(scratch, name);
	copyRepo(template, root);
	const answers = noAnswers();
	const recorded = call(root, () => recording(processPorts(), answers));
	rmSync(root, { recursive: true, force: true });
	const misses: string[] = [];
	const again = call(root, () => replaying(answers, misses));
	const deleted = call(root, processPorts);
	return { recorded, again, deleted, misses, answers: answerCount(answers) };
}

describe("[control:hook-port-replay] a hook call on replayed port answers with its repo deleted", () => {
	test.each(RUNS.map((run) => [run.name, run] as const))(
		"%s gives the recorded verdict",
		(_name, run) => {
			const seen = replayed(run.name, (root, ports) => hook(run, root, ports));
			expect(`${seen.recorded.stdout}${seen.recorded.stderr}`).toContain(
				run.shows,
			);
			expect(seen.misses).toEqual([]);
			expect(seen.answers).toBeGreaterThan(0);
			expect(seen.again).toEqual(seen.recorded);
			expect(seen.deleted).not.toEqual(seen.recorded);
		},
		heavyTestTimeout,
	);

	test(
		"a Cursor stop gives the recorded follow-up",
		() => {
			const seen = replayed("cursor-stop", cursorStop);
			expect(seen.recorded.stdout).toContain("as any");
			expect(seen.misses).toEqual([]);
			expect(seen.answers).toBeGreaterThan(0);
			expect(seen.again).toEqual(seen.recorded);
			expect(seen.deleted).not.toEqual(seen.recorded);
		},
		heavyTestTimeout,
	);
});

const HOOK_DIR = resolve(import.meta.dir, "../../src/astack/hook");
const SRC = resolve(import.meta.dir, "../../src/astack");

const READERS: Readonly<Record<string, readonly string[]>> = {
	"paths.ts": [
		"readOptional",
		"canonical",
		"canonicalFile",
		"canonicalRelative",
		"workTreeRoot",
		"isScratchPath",
		"realPath",
		"listDir",
		"isExecutable",
		"folderId",
	],
	"git.ts": [
		"runGit",
		"gitText",
		"gitValue",
		"currentBranch",
		"repoRoot",
		"originSlug",
		"readBlobs",
		"gitChanges",
	],
	"profile.ts": ["readProfileJson", "profileSection", "loadProfile"],
	"repo-facts.ts": ["kindOf", "findPrTemplate", "readFacts"],
	"ste/profile.ts": ["loadSettings"],
	"process.ts": ["runProcess"],
	"ports.ts": [
		"readText",
		"pathKind",
		"realPath",
		"relativePath",
		"isScratch",
		"workTree",
		"listDir",
		"isExecutable",
		"folderId",
		"gitRun",
		"gitText",
		"gitRoot",
		"gitBranch",
		"gitOrigin",
		"gitChanges",
		"readProfile",
	],
};

const IMPORT =
	/import\s+(type\s+)?(?:\*\s+as\s+\w+|\{([^}]*)\})\s+from\s+"([^"]+)";/g;

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? sources(join(dir, entry.name))
			: entry.name.endsWith(".ts")
				? [join(dir, entry.name)]
				: [],
	);
}

function directReads(dir: string): string[] {
	return sources(dir).flatMap((file) => {
		const text = readFileSync(file, "utf8");
		const handler = relative(dir, file).startsWith("handlers/");
		return [...text.matchAll(IMPORT)].flatMap(
			([, typeOnly, names, specifier = ""]) => {
				if (typeOnly !== undefined) return [];
				const where = relative(dir, file);
				if (specifier === "node:fs" || specifier === "node:child_process")
					return handler ? [`${where}: ${specifier}`] : [];
				const module = relative(SRC, resolve(dirname(file), specifier));
				const listed = READERS[module];
				if (listed === undefined) return [];
				if (names === undefined) return [`${where}: * from ${module}`];
				return names
					.split(",")
					.map((name) => name.trim())
					.filter((name) => name !== "" && !name.startsWith("type "))
					.map((name) => name.split(/\s+as\s+/)[0] ?? name)
					.filter((name) => listed.includes(name))
					.map((name) => `${where}: ${name} from ${module}`);
			},
		);
	});
}

describe("[control:hook-no-direct-read] the hook folder", () => {
	test("imports no disk or git reader by value, and no handler imports node:fs or node:child_process", () => {
		expect(directReads(HOOK_DIR)).toEqual([]);
	});
});
