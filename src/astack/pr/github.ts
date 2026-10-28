import { spawnSync } from "node:child_process";

export type CheckState = "success" | "pending" | "failure" | "none";

export type PullRequestState = {
	readonly number: number;
	readonly url: string;
	readonly title: string;
	readonly body: string;
	readonly base: string | undefined;
	readonly head: string;
	readonly openThreads: number;
	readonly threadsListed: boolean;
	readonly checks: CheckState;
	readonly checkedHead: string | undefined;
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

const THREADS_AND_CHECKS = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { isResolved } }
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
    }
  }
}`;

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
	if (typeof number !== "number" || !url || !head) return undefined;
	const pull = at(graph, "data", "repository", "pullRequest");
	const threads = at(pull, "reviewThreads", "nodes");
	if (!Array.isArray(threads)) return undefined;
	const commit = at(pull, "commits", "nodes", 0, "commit");
	return {
		number,
		url,
		title: text(at(view, "title")) ?? "",
		body: text(at(view, "body")) ?? "",
		base: text(at(view, "baseRefName")),
		head,
		openThreads: threads.filter((thread) => at(thread, "isResolved") !== true)
			.length,
		threadsListed:
			at(pull, "reviewThreads", "pageInfo", "hasNextPage") !== true,
		checks: checkState(at(commit, "statusCheckRollup", "state")),
		checkedHead: text(at(commit, "oid")),
	};
}

const GH_TIMEOUT_MS = 4000;

function ghJson(dir: string, args: readonly string[]): unknown {
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
	if (typeof number !== "number" || !repo) return undefined;
	const graph = ghJson(target.dir, [
		"api",
		"graphql",
		"-f",
		`query=${THREADS_AND_CHECKS}`,
		"-f",
		`owner=${repo.owner}`,
		"-f",
		`name=${repo.name}`,
		"-F",
		`number=${number}`,
	]);
	return pullRequestFrom(view, graph);
};
