import { describe, expect, test } from "bun:test";
import {
	type OutboundCall,
	type OutboundWrite,
	outboundWrites,
} from "../../src/astack/outbound.ts";

const DIR = "/w/repo";
const REMOTES = { kind: "remotes", dir: DIR } as const;
const NAMED = { kind: "named", slug: "o/r" } as const;
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
	bodyFiles: readonly string[] = [],
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
			[write("gh pr create", SUB_REMOTES, ["Plan"], [`${DIR}/sub/notes.md`])],
		],
		[
			"an issue comment on an issue URL",
			shell("gh issue comment https://github.com/o/r/issues/21 --body notes"),
			[write("gh issue comment", NAMED, ["notes"])],
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
			"a gh api comment with -f body=",
			shell("gh api repos/o/r/issues/21/comments -f body='the notes'"),
			[write("gh api repos/o/r/issues/21/comments", NAMED, ["the notes"])],
		],
		[
			"a gh api edit with --input",
			shell("gh api -X PATCH /repos/{owner}/{repo}/pulls/12 --input body.json"),
			[
				write(
					"gh api /repos/{owner}/{repo}/pulls/12",
					REMOTES,
					[],
					[`${DIR}/body.json`],
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
		["a GitHub MCP read", mcp("github", "get_issue", { owner: "o" }), []],
	])("[control:outbound-writes] %s", (_, call, writes) => {
		expect(outboundWrites(call)).toEqual(writes);
	});
});
