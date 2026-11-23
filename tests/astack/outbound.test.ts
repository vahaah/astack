import { describe, expect, test } from "bun:test";
import {
	type BodyFile,
	type OutboundCall,
	type OutboundWrite,
	outboundWrites,
} from "../../src/astack/outbound.ts";

const DIR = "/w/repo";
const REMOTES = { kind: "remotes", dir: DIR } as const;
const NAMED = { kind: "named", slug: "o/r" } as const;
const UNKNOWN = { kind: "unknown" } as const;
const SUB_REMOTES = { kind: "remotes", dir: `${DIR}/sub` } as const;

function shell(
	command: string,
	env: Record<string, string> = {},
): OutboundCall {
	return { kind: "shell", command, cwd: DIR, env };
}

function mcp(server: string, tool: string, input: unknown): OutboundCall {
	return { kind: "mcp", server, tool, input, dir: DIR };
}

function write(
	subject: string,
	target: OutboundWrite["target"],
	texts: readonly string[],
	bodyFiles: readonly BodyFile[] = [],
): OutboundWrite {
	return { subject, target, texts, bodyFiles };
}

describe("the GitHub text writes of a shell step or an MCP call", () => {
	test.each<[string, OutboundCall, readonly OutboundWrite[]]>([
		[
			"an issue create with --body",
			shell('gh issue create --title "Plan" --body "the plan notes"'),
			[write("gh issue create", REMOTES, ["Plan", "the plan notes"])],
		],
		[
			"an issue create with --repo",
			shell("gh issue create --repo O/R -b notes"),
			[write("gh issue create", NAMED, ["notes"])],
		],
		[
			"an issue create with GH_REPO before the command",
			shell("GH_REPO=o/r gh issue create -b notes"),
			[write("gh issue create", NAMED, ["notes"])],
		],
		[
			"an issue create with GH_REPO in the hook env",
			shell("gh issue create -b notes", { GH_REPO: "o/r" }),
			[write("gh issue create", NAMED, ["notes"])],
		],
		[
			"a PR create with --body-file",
			shell("cd sub && gh pr create -t Plan --body-file notes.md"),
			[
				write(
					"gh pr create",
					SUB_REMOTES,
					["Plan"],
					[{ path: `${DIR}/sub/notes.md`, step: 0 }],
				),
			],
		],
		[
			"an issue comment on an issue URL",
			shell("gh issue comment https://github.com/o/r/issues/21 --body notes"),
			[write("gh issue comment", NAMED, ["notes"])],
		],
		[
			"a selector URL that differs from --repo",
			shell(
				"gh issue comment https://github.com/o/r/issues/21 -R acme/private -b notes",
			),
			[write("gh issue comment", UNKNOWN, ["notes"])],
		],
		[
			"a selector URL that agrees with --repo",
			shell("gh pr comment https://github.com/o/r/pull/12 --repo O/R -b notes"),
			[write("gh pr comment", NAMED, ["notes"])],
		],
		[
			"a URL that is the value of a flag",
			shell(
				"gh issue edit 21 --add-sub-issue https://github.com/acme/private/issues/3 -b notes",
			),
			[write("gh issue edit", REMOTES, ["notes"])],
		],
		[
			"a URL operand of a create",
			shell("gh pr create https://github.com/acme/private/pull/3 -b notes"),
			[write("gh pr create", REMOTES, ["notes"])],
		],
		[
			"an edit of two selectors",
			shell(
				"gh issue edit https://github.com/acme/private/issues/1 https://github.com/o/r/issues/2 -t notes",
			),
			[write("gh issue edit", UNKNOWN, ["notes"])],
		],
		[
			"a PR comment from a heredoc",
			shell("gh pr comment 12 --body-file - <<'EOF'\nthe notes\nEOF"),
			[write("gh pr comment", REMOTES, ["the notes"])],
		],
		[
			"a PR title edit",
			shell("gh pr edit 12 --title=Renamed"),
			[write("gh pr edit", REMOTES, ["Renamed"])],
		],
		[
			"a PR review whose -r asks for changes",
			shell("gh pr review 12 -r -b notes"),
			[write("gh pr review", REMOTES, ["notes"])],
		],
		[
			"a PR review whose -c is a comment switch",
			shell("gh pr review 12 -c -b notes"),
			[write("gh pr review", REMOTES, ["notes"])],
		],
		[
			"an issue close with --comment",
			shell("gh issue close 21 --reason completed --comment notes"),
			[write("gh issue close", REMOTES, ["notes"])],
		],
		[
			"a PR reopen with -c",
			shell("gh pr reopen 12 -c notes"),
			[write("gh pr reopen", REMOTES, ["notes"])],
		],
		[
			"short flags with attached values",
			shell('gh issue create -t"Plan" -b"notes" -Ro/r'),
			[write("gh issue create", NAMED, ["Plan", "notes"])],
		],
		[
			"a switch cluster that ends in an attached body",
			shell('gh pr create -db"notes"'),
			[write("gh pr create", REMOTES, ["notes"])],
		],
		[
			"an unknown flag",
			shell("gh issue comment 21 --bogus -b notes"),
			[
				write("gh issue comment", UNKNOWN, [
					"notes",
					"issue",
					"comment",
					"21",
					"--bogus",
					"-b",
					"notes",
				]),
			],
		],
		[
			"a selector that only a variable gives",
			shell('gh issue comment "$N" -b notes'),
			[
				write("gh issue comment", UNKNOWN, [
					"notes",
					"issue",
					"comment",
					"-b",
					"notes",
				]),
			],
		],
		[
			"a repo that only a variable gives",
			shell('gh issue comment 21 -R "$REPO" -b notes'),
			[
				write("gh issue comment", UNKNOWN, [
					"notes",
					"issue",
					"comment",
					"21",
					"-R",
					"-b",
					"notes",
				]),
			],
		],
		[
			"gh named by its path",
			shell("/usr/bin/gh issue comment 21 -b notes"),
			[write("gh issue comment", REMOTES, ["notes"])],
		],
		[
			"gh named with .exe",
			shell("gh.exe pr comment 12 -b notes"),
			[write("gh pr comment", REMOTES, ["notes"])],
		],
		[
			"an unread wrapper of gh",
			shell("sudo -Z gh issue comment 21 -b notes"),
			[write("gh", UNKNOWN, ["sudo -Z gh issue comment 21 -b notes"])],
		],
		[
			"a script that only a variable gives in a command that names gh",
			shell(`S='gh pr comment 12 -b notes'; bash -c "$S"`),
			[write("gh", UNKNOWN, [`S='gh pr comment 12 -b notes'; bash -c "$S"`])],
		],
		["an unread step in a command with no gh", shell('bash -c "$S"'), []],
		[
			"an action that only a variable gives",
			shell('gh issue "$A" 21 -b notes'),
			[write("gh issue", UNKNOWN, ["issue", "21", "-b", "notes"])],
		],
		[
			"a flag before the group",
			shell("gh -R o/r issue comment 21 -b notes"),
			[
				write("gh", UNKNOWN, [
					"-R",
					"o/r",
					"issue",
					"comment",
					"21",
					"-b",
					"notes",
				]),
			],
		],
		[
			"a gh api switch cluster that ends in a field",
			shell("gh api repos/o/r/issues -ifbody=notes"),
			[write("gh api repos/o/r/issues", NAMED, ["notes"])],
		],
		[
			"a comment body piped from a literal echo",
			shell('echo "the notes" | gh issue comment 21 -F -'),
			[write("gh issue comment", REMOTES, ["the notes\n"])],
		],
		[
			"a PR merge with a subject and a body",
			shell("gh pr merge 12 --squash --subject Plan -b notes"),
			[write("gh pr merge", REMOTES, ["Plan", "notes"])],
		],
		[
			"a gh api comment with -f body=",
			shell("gh api repos/o/r/issues/21/comments -f body='the notes'"),
			[write("gh api repos/o/r/issues/21/comments", NAMED, ["the notes"])],
		],
		[
			"a gh api comment with an attached -f value",
			shell("gh api repos/o/r/issues -fbody='the notes' -XPOST"),
			[write("gh api repos/o/r/issues", NAMED, ["the notes"])],
		],
		[
			"a gh api edit with --input",
			shell("gh api -X PATCH /repos/{owner}/{repo}/pulls/12 --input body.json"),
			[
				write(
					"gh api /repos/{owner}/{repo}/pulls/12",
					REMOTES,
					[],
					[{ path: `${DIR}/body.json`, step: 0 }],
				),
			],
		],
		[
			"a gh api graphql mutation",
			shell(
				"gh api graphql -f query='mutation { notes }' -F body=@-  <<<'the notes'",
			),
			[
				write("gh api graphql", { kind: "unknown" }, [
					"mutation { notes }",
					"the notes",
				]),
			],
		],
		[
			"a GitHub MCP create_issue",
			mcp("github", "create_issue", {
				owner: "o",
				repo: "r",
				title: "Plan",
				body: "notes",
			}),
			[write("create_issue", NAMED, ["o", "r", "Plan", "notes"])],
		],
		[
			"a GitHub MCP add_issue_comment",
			mcp("plugin_github_github", "add_issue_comment", {
				owner: "o",
				repo: "r",
				issue_number: 21,
				body: "notes",
			}),
			[write("add_issue_comment", NAMED, ["o", "r", "notes"])],
		],
		[
			"a host pull_request_create with no repo field",
			mcp("cocode", "pull_request_create", { title: "Plan", body: "notes" }),
			[write("pull_request_create", REMOTES, ["Plan", "notes"])],
		],
		[
			"a host pull_request_respond with a repo slug",
			mcp("cocode", "pull_request_respond", { repo: "o/r", body: "notes" }),
			[write("pull_request_respond", NAMED, ["o/r", "notes"])],
		],
		[
			"a host create_issue with no repo field",
			mcp("cocode", "create_issue", { title: "Plan", body: "notes" }),
			[write("create_issue", REMOTES, ["Plan", "notes"])],
		],
		[
			"a host comment_on_issue on an issue URL",
			mcp("cocode", "comment_on_issue", {
				url: "https://github.com/O/R/issues/21",
				body: "notes",
			}),
			[
				write("comment_on_issue", NAMED, [
					"https://github.com/O/R/issues/21",
					"notes",
				]),
			],
		],
		[
			"each nested MCP string",
			mcp("github", "create_pull_request_review", {
				owner: "o",
				repo: "r",
				comments: [{ path: "a.ts", body: "deep" }],
				meta: { note: { text: "deeper" } },
				pull_number: 12,
				draft: false,
			}),
			[
				write("create_pull_request_review", NAMED, [
					"o",
					"r",
					"a.ts",
					"deep",
					"deeper",
				]),
			],
		],
		["gh issue list", shell("gh issue list --search notes"), []],
		["a gh api read", shell("gh api repos/o/r/issues/21"), []],
		[
			"a gh api GET with a field",
			shell("gh api -X GET repos/o/r/issues -f state=open"),
			[],
		],
		["a Linear save_issue", mcp("linear", "save_issue", { title: "x" }), []],
		[
			"a Sentry issue note",
			mcp("plugin_sentry_sentry", "add_issue_note", { text: "x" }),
			[],
		],
		["a GitHub MCP read", mcp("github", "get_issue", { owner: "o" }), []],
	])("[control:outbound-writes] %s", (_, call, writes) => {
		expect(outboundWrites(call)).toEqual(writes);
	});
});
