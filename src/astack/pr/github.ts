import { spawnSync } from "node:child_process";
import { PROFILE_PATH } from "../profile.ts";
import { type MergeProfile, parseMergeProfile } from "./profile.ts";

export type CheckState = "success" | "pending" | "failure" | "none";

export type BaseAuthority =
	| {
			readonly kind: "committed";
			readonly commit: string;
			readonly profile: MergeProfile;
	  }
	| { readonly kind: "absent"; readonly commit: string }
	| { readonly kind: "unread"; readonly reason: string };

export type PullRequestState = {
	readonly number: number;
	readonly url: string;
	readonly title: string;
	readonly body: string;
	readonly base: string;
	readonly head: string;
	readonly openThreads: number;
	readonly threadsListed: boolean;
	readonly checks: CheckState;
	readonly checkedHead: string | undefined;
	readonly authority: BaseAuthority;
};

export type PrTarget = {
	readonly selector: string | undefined;
	readonly repo: string | undefined;
	readonly dir: string;
};

export type ReadPullRequest = (
	target: PrTarget,
) => PullRequestState | undefined;

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function at(value: unknown, ...path: readonly (string | number)[]): unknown {
	let current = value;
	for (const key of path) {
		if (typeof key === "number")
			current = Array.isArray(current) ? current[key] : undefined;
		else current = isFields(current) ? current[key] : undefined;
	}
	return current;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

const PULL_REQUEST_FACTS = `query($owner: String!, $name: String!, $number: Int!, $profile: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { isResolved } }
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
      baseRef { target { oid } }
    }
    object(expression: $profile) { ... on Blob { text isBinary isTruncated } }
  }
}`;

function baseProfileExpression(base: string): string {
	return `refs/heads/${base}:${PROFILE_PATH}`;
}

function parsedJson(text: string): { readonly value: unknown } | undefined {
	try {
		return { value: JSON.parse(text) };
	} catch {
		return undefined;
	}
}

function baseAuthorityFrom(repository: unknown, base: string): BaseAuthority {
	const commit = text(
		at(repository, "pullRequest", "baseRef", "target", "oid"),
	);
	if (!commit)
		return {
			kind: "unread",
			reason: `the PR read gives no commit for the base branch ${base}`,
		};
	const blob = at(repository, "object");
	if (blob === null) return { kind: "absent", commit };
	const where = `${PROFILE_PATH} at ${commit.slice(0, 7)}`;
	const body = text(at(blob, "text"));
	if (
		body === undefined ||
		at(blob, "isBinary") === true ||
		at(blob, "isTruncated") === true
	)
		return { kind: "unread", reason: `${where} is not a readable text file` };
	const parsed = parsedJson(body);
	return parsed === undefined
		? { kind: "unread", reason: `${where} is not valid JSON` }
		: { kind: "committed", commit, profile: parseMergeProfile(parsed.value) };
}

export function checkState(rollup: unknown): CheckState {
	switch (rollup) {
		case "SUCCESS":
			return "success";
		case "PENDING":
		case "EXPECTED":
			return "pending";
		case "FAILURE":
		case "ERROR":
			return "failure";
		default:
			return "none";
	}
}

export function repoOfUrl(
	url: string,
): { readonly owner: string; readonly name: string } | undefined {
	const match = /^https:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(url);
	return match?.[1] && match[2]
		? { owner: match[1], name: match[2] }
		: undefined;
}

export function pullRequestFrom(
	view: unknown,
	graph: unknown,
): PullRequestState | undefined {
	const number = at(view, "number");
	const url = text(at(view, "url"));
	const head = text(at(view, "headRefOid"));
	const base = text(at(view, "baseRefName"));
	if (typeof number !== "number" || !url || !head || !base) return undefined;
	const repository = at(graph, "data", "repository");
	const pull = at(repository, "pullRequest");
	const threads = at(pull, "reviewThreads", "nodes");
	if (!Array.isArray(threads)) return undefined;
	const commit = at(pull, "commits", "nodes", 0, "commit");
	return {
		number,
		url,
		title: text(at(view, "title")) ?? "",
		body: text(at(view, "body")) ?? "",
		base,
		head,
		openThreads: threads.filter((thread) => at(thread, "isResolved") !== true)
			.length,
		threadsListed:
			at(pull, "reviewThreads", "pageInfo", "hasNextPage") !== true,
		checks: checkState(at(commit, "statusCheckRollup", "state")),
		checkedHead: text(at(commit, "oid")),
		authority: baseAuthorityFrom(repository, base),
	};
}

const GH_TIMEOUT_MS = 4000;

export function ghJson(dir: string, args: readonly string[]): unknown {
	const result = spawnSync("gh", args, {
		cwd: dir,
		encoding: "utf8",
		timeout: GH_TIMEOUT_MS,
	});
	if (result.status !== 0 || !result.stdout) return undefined;
	try {
		return JSON.parse(result.stdout);
	} catch {
		return undefined;
	}
}

export const readPullRequestWithGh: ReadPullRequest = (target) => {
	const view = ghJson(target.dir, [
		"pr",
		"view",
		...(target.selector ? [target.selector] : []),
		...(target.repo ? ["--repo", target.repo] : []),
		"--json",
		"number,url,title,body,baseRefName,headRefOid",
	]);
	const number = at(view, "number");
	const repo = repoOfUrl(text(at(view, "url")) ?? "");
	const base = text(at(view, "baseRefName"));
	if (typeof number !== "number" || !repo || !base) return undefined;
	const graph = ghJson(target.dir, [
		"api",
		"graphql",
		"-f",
		`query=${PULL_REQUEST_FACTS}`,
		"-f",
		`owner=${repo.owner}`,
		"-f",
		`name=${repo.name}`,
		"-F",
		`number=${number}`,
		"-f",
		`profile=${baseProfileExpression(base)}`,
	]);
	return pullRequestFrom(view, graph);
};

export type Visibility = "public" | "private" | "internal" | "unknown";

export type ReadVisibility = (slug: string, dir: string) => Visibility;

const VISIBILITIES: readonly Visibility[] = ["public", "private", "internal"];

export const visibilityWithGh: ReadVisibility = (slug, dir) => {
	const result = spawnSync(
		"gh",
		["api", `repos/${slug}`, "--jq", ".visibility"],
		{ cwd: dir, encoding: "utf8", timeout: GH_TIMEOUT_MS },
	);
	const answer = result.status === 0 ? result.stdout.trim() : "";
	return VISIBILITIES.find((one) => one === answer) ?? "unknown";
};
