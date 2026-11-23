import { ghJson } from "./github.ts";
import { partOf } from "./links.ts";

export type OpenPr = {
	readonly number: number;
	readonly url: string;
	readonly head: string;
	readonly title: string;
	readonly body: string;
};

export type ListOpenPrs = (
	dir: string,
	repo: string | undefined,
) => readonly OpenPr[] | undefined;

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export function openPrsFrom(value: unknown): readonly OpenPr[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.filter(isFields).flatMap((pr) =>
		typeof pr.number === "number"
			? [
					{
						number: pr.number,
						url: text(pr.url),
						head: text(pr.headRefName),
						title: text(pr.title),
						body: text(pr.body),
					},
				]
			: [],
	);
}

export const listOpenPrsWithGh: ListOpenPrs = (dir, repo) =>
	openPrsFrom(
		ghJson(dir, [
			"pr",
			"list",
			"--author",
			"@me",
			"--state",
			"open",
			"--limit",
			"100",
			...(repo ? ["--repo", repo] : []),
			"--json",
			"number,url,headRefName,title,body",
		]),
	);

export function ticketKeys(body: string | undefined): readonly string[] {
	if (body === undefined) return [];
	const found = partOf(body);
	return found.kind === "found"
		? found.refs.filter((ref) => /^[A-Z][A-Z0-9]*-\d+$/.test(ref))
		: [];
}

export type NewPr = {
	readonly head: string | undefined;
	readonly body: string | undefined;
	readonly base: string;
	readonly repo: string;
	readonly root: string;
};

export function duplicateReasons(
	pr: Pick<NewPr, "head" | "body">,
	open: readonly OpenPr[],
): readonly string[] {
	const keys = new Set(ticketKeys(pr.body));
	return open.flatMap((existing) => {
		if (pr.head !== undefined && existing.head === pr.head)
			return [
				`#${existing.number} (${existing.url}) is already open for the branch ${pr.head}. Push to that branch, and update the PR with gh pr edit.`,
			];
		const shared = ticketKeys(existing.body).filter((key) => keys.has(key));
		return shared.length > 0
			? [
					`#${existing.number} (${existing.url}) is already open for ${shared.join(", ")}. A follow-up goes in the open PR.`,
				]
			: [];
	});
}
