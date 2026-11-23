import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { judge } from "../../src/astack/hook/dispatch.ts";
import {
	type Context,
	deny,
	type HookEvent,
	type Verdict,
} from "../../src/astack/hook/events.ts";
import { outbound } from "../../src/astack/hook/handlers/outbound.ts";
import type { Visibility } from "../../src/astack/pr/github.ts";

const ROOT = resolve(import.meta.dir, "../..");
const backwards = (text: string): string => [...text].reverse().join("");
const capital = (word: string): string =>
	`${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const TOKEN = backwards("xarfolliuq");
const WORDS = [backwards("xenrav"), backwards("nirtlod")];
const NAME = WORDS.map(capital).join(" ");
const TOKEN_HASH = "10f42cb9";
const NAME_HASH = "822f3090";

const root = realpathSync(mkdtempSync(join(tmpdir(), "astack-outbound-hook-")));
const repo = join(root, "repo");
const listed = join(root, "listed");
const bad = join(root, "bad");
const empty = join(root, "empty");

beforeAll(() => {
	mkdirSync(repo);
	spawnSync("git", ["init", "-q"], { cwd: repo });
	spawnSync("git", ["remote", "add", "origin", "https://github.com/o/r.git"], {
		cwd: repo,
	});
	writeFileSync(join(repo, "notes.md"), `Notes for ${NAME}\n`);
	writeFileSync(join(repo, "body.json"), JSON.stringify({ body: NAME }));
	mkdirSync(join(listed, "deny"), { recursive: true });
	copyFileSync(
		join(ROOT, "examples/companion/deny/names.sha256"),
		join(listed, "deny/names.sha256"),
	);
	mkdirSync(join(bad, "deny"), { recursive: true });
	writeFileSync(join(bad, "deny/names.sha256"), "zz\n");
	mkdirSync(empty);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const VISIBILITY: Readonly<Record<string, Visibility>> = {
	"o/r": "public",
	"acme/private": "private",
	"acme/internal": "internal",
};

const guard = outbound((slug) => VISIBILITY[slug] ?? "unknown");

function context(state: string): Context {
	return {
		tool: "claude-code",
		event: "PreToolUse",
		cwd: repo,
		projectDir: repo,
		env: { ASTACK_STATE_DIR: state },
		today: "2026-11-23",
	};
}

function shell(command: string): HookEvent {
	return { kind: "shell", command, cwd: repo };
}

function mcp(server: string, tool: string, input: unknown): HookEvent {
	return { kind: "mcp", server, tool, input };
}

function listedDeny(
	subject: string,
	prefixes: string,
	targets: string,
): Verdict {
	return deny(
		[
			`astack blocked ${subject}, because its text holds a name of the outbound deny list.`,
			`- Hash prefixes: ${prefixes}`,
			`- Public or unknown targets: ${targets}`,
			"Take the name out of the text, or let the owner post it.",
		].join("\n"),
	);
}

describe("the outbound guard", () => {
	test.each<[string, HookEvent, string]>([
		[
			"an issue create with --body",
			shell(`gh issue create --title Plan --body "Notes for ${NAME}"`),
			"gh issue create",
		],
		[
			"an issue create with --repo",
			shell(`gh issue create --repo o/r -b "${NAME}"`),
			"gh issue create",
		],
		[
			"an issue create with GH_REPO",
			shell(`GH_REPO=o/r gh issue create -b "${NAME}"`),
			"gh issue create",
		],
		[
			"a PR create with --body-file",
			shell("gh pr create -t Plan --body-file notes.md"),
			"gh pr create",
		],
		[
			"an issue comment",
			shell(`gh issue comment 21 --body "${NAME}"`),
			"gh issue comment",
		],
		[
			"a PR comment from a heredoc",
			shell(`gh pr comment 12 --body-file - <<'EOF'\nfor ${NAME}\nEOF`),
			"gh pr comment",
		],
		[
			"a PR title edit",
			shell(`gh pr edit 12 --title "${NAME} plan"`),
			"gh pr edit",
		],
		["a PR review", shell(`gh pr review 12 -r -b "${NAME}"`), "gh pr review"],
		[
			"a gh api comment with -f body=",
			shell(`gh api repos/o/r/issues/21/comments -f body='${NAME}'`),
			"gh api repos/o/r/issues/21/comments",
		],
		[
			"a gh api edit with --input",
			shell("gh api -X PATCH repos/o/r/pulls/12 --input body.json"),
			"gh api repos/o/r/pulls/12",
		],
		[
			"a GitHub MCP create_issue",
			mcp("github", "create_issue", { owner: "o", repo: "r", body: NAME }),
			"create_issue",
		],
		[
			"a GitHub MCP add_issue_comment",
			mcp("plugin_github_github", "add_issue_comment", {
				owner: "o",
				repo: "r",
				issue_number: 21,
				body: NAME,
			}),
			"add_issue_comment",
		],
		[
			"a host pull_request_create with no repo field",
			mcp("cocode", "pull_request_create", { title: "Plan", body: NAME }),
			"pull_request_create",
		],
		[
			"a host pull_request_respond",
			mcp("cocode", "pull_request_respond", { comments: [{ body: NAME }] }),
			"pull_request_respond",
		],
	])(
		"[control:outbound-text] %s gets the deny-list deny with no text line",
		(_, event, subject) => {
			expect(guard.run(event, context(listed))).toEqual(
				listedDeny(subject, NAME_HASH, "o/r (public)"),
			);
		},
	);

	test.each([
		[WORDS.join(" ").toUpperCase(), NAME_HASH],
		[WORDS.join("-"), NAME_HASH],
		[WORDS.map(capital).join(""), NAME_HASH],
		[`${WORDS.join("_")}.md`, NAME_HASH],
		[capital(TOKEN), TOKEN_HASH],
		[`${TOKEN}Client`, TOKEN_HASH],
	])(
		"[control:outbound-text] the spelling %p gets the deny of hash %p",
		(spelling, prefix) => {
			expect(
				guard.run(
					shell(`gh issue comment 21 -b "x ${spelling} y"`),
					context(listed),
				),
			).toEqual(listedDeny("gh issue comment", prefix, "o/r (public)"));
		},
	);

	test.each<[string, HookEvent]>([
		[
			"an issue to a private repo",
			shell(`gh issue create --repo acme/private -b "${NAME}"`),
		],
		["a clean text", shell('gh issue create -b "the plan notes"')],
		[
			"a body that only a variable gives",
			shell('gh issue create --body "$TEXT"'),
		],
		["a Linear save_issue", mcp("linear", "save_issue", { title: NAME })],
		["gh issue list", shell(`gh issue list --search "${NAME}"`)],
		[
			"a comment to an internal repo",
			mcp("github", "add_issue_comment", {
				owner: "acme",
				repo: "internal",
				body: NAME,
			}),
		],
	])("[control:outbound-text] %s passes", (_, event) => {
		expect(guard.run(event, context(listed))).toEqual({ kind: "allow" });
	});

	test("[control:outbound-fail-closed] an unread visibility and a bad copy deny, and no copy passes", () => {
		const hidden = shell(`gh issue create --repo acme/gone -b "${NAME}"`);
		const clean = shell('gh issue create -b "the plan notes"');
		expect({
			unread: guard.run(hidden, context(listed)),
			bad: guard.run(clean, context(bad)),
			none: guard.run(hidden, context(empty)),
		}).toEqual({
			unread: listedDeny("gh issue create", NAME_HASH, "acme/gone (unknown)"),
			bad: deny(
				`astack blocked gh issue create, because it cannot read the outbound deny list at ${bad}/deny/names.sha256: line 1 is not 64 lowercase hex characters. Run bun run deny sync.`,
			),
			none: { kind: "allow" },
		});
	});

	test("[control:outbound-fault] a throw of the guard denies each GitHub text write and passes other calls", () => {
		const failing = outbound(() => {
			throw new Error("gh exploded");
		});
		expect({
			write: judge(
				[failing],
				[shell(`gh issue create -b "${NAME}"`)],
				context(listed),
			),
			read: judge([failing], [shell("gh issue list")], context(listed)),
		}).toEqual({
			write: deny(
				'astack blocked gh issue create, because the outbound guard failed with "gh exploded", so astack cannot examine its text. Let the owner post it.',
			),
			read: { kind: "allow" },
		});
	});
});
