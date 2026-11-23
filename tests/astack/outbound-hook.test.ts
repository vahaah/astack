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
	ALLOW,
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
	const PUBLIC = "o/r (public)";
	const spelling = (text: string): HookEvent =>
		shell(`gh issue comment 21 -b "x ${text} y"`);
	const forms: readonly [string, HookEvent, string][] = [
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
			"an issue create whose body file an earlier step writes",
			shell(
				`cat > staged.md <<'EOF'\nfor ${NAME}\nEOF\ngh issue create -t x -F staged.md`,
			),
			"gh issue create",
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
			"an issue close with --comment",
			shell(`gh issue close 21 --comment "Fixed for ${NAME}"`),
			"gh issue close",
		],
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
			"a host comment_on_issue",
			mcp("cocode", "comment_on_issue", {
				url: "https://github.com/o/r/issues/21",
				body: NAME,
			}),
			"comment_on_issue",
		],
		[
			"a host pull_request_respond",
			mcp("cocode", "pull_request_respond", { comments: [{ body: NAME }] }),
			"pull_request_respond",
		],
	];

	test.each<[string, HookEvent, Verdict]>([
		...forms.map(([label, event, subject]): [string, HookEvent, Verdict] => [
			label,
			event,
			listedDeny(subject, NAME_HASH, PUBLIC),
		]),
		[
			"an upper case name",
			spelling(WORDS.join(" ").toUpperCase()),
			listedDeny("gh issue comment", NAME_HASH, PUBLIC),
		],
		[
			"a name with a hyphen",
			spelling(WORDS.join("-")),
			listedDeny("gh issue comment", NAME_HASH, PUBLIC),
		],
		[
			"a camelCase name",
			spelling(WORDS.map(capital).join("")),
			listedDeny("gh issue comment", NAME_HASH, PUBLIC),
		],
		[
			"a name in a file name",
			spelling(`${WORDS.join("_")}.md`),
			listedDeny("gh issue comment", NAME_HASH, PUBLIC),
		],
		[
			"a one-word name",
			spelling(capital(TOKEN)),
			listedDeny("gh issue comment", TOKEN_HASH, PUBLIC),
		],
		[
			"a one-word name in an identifier",
			spelling(`${TOKEN}Client`),
			listedDeny("gh issue comment", TOKEN_HASH, PUBLIC),
		],
		[
			"an issue to a private repo",
			shell(`gh issue create --repo acme/private -b "${NAME}"`),
			ALLOW,
		],
		["a clean text", shell('gh issue create -b "the plan notes"'), ALLOW],
		[
			"a body that only a variable gives",
			shell('gh issue create --body "$TEXT"'),
			ALLOW,
		],
		[
			"a Linear save_issue",
			mcp("linear", "save_issue", { title: NAME }),
			ALLOW,
		],
		["gh issue list", shell(`gh issue list --search "${NAME}"`), ALLOW],
		[
			"a comment to an internal repo",
			mcp("github", "add_issue_comment", {
				owner: "acme",
				repo: "internal",
				body: NAME,
			}),
			ALLOW,
		],
	])(
		"[control:outbound-text] %s gets the deny-list deny with no text line, or passes",
		(_, event, verdict) => {
			expect(guard.run(event, context(listed))).toEqual(verdict);
		},
	);

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
			none: ALLOW,
		});
	});

	test("[control:outbound-unread] a body that astack cannot read denies, and no copy passes", () => {
		const piped = shell("git log | gh issue comment 21 -F -");
		expect({
			listed: guard.run(piped, context(listed)),
			none: guard.run(piped, context(empty)),
		}).toEqual({
			listed: deny(
				[
					"astack blocked gh issue comment, because astack cannot read its body from piped stdin or a variable file.",
					"- Public or unknown targets: an unknown repo (unknown)",
					"Write the body in the command or in a file, or let the owner post it.",
				].join("\n"),
			),
			none: ALLOW,
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
			read: ALLOW,
		});
	});
});
