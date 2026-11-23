import { err, ok, type Result } from "./result.ts";

export const STOP_DECISIONS = [
	"stop_clean",
	"stop_converged",
	"stop_recurring",
	"stop_principled_incompletion",
] as const;

export type StopDecision = (typeof STOP_DECISIONS)[number];

export type ReviewedHead = {
	readonly sha: string;
	readonly decision: StopDecision;
	readonly launches: number;
};

export type ReviewRecord = {
	readonly baseSha: string;
	readonly firstReviewedHead: string;
	readonly heads: readonly ReviewedHead[];
};

export type DeltaBase =
	| { readonly kind: "delta"; readonly sha: string }
	| { readonly kind: "full"; readonly reason: string };

const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function isCommitId(value: string): boolean {
	return COMMIT_ID.test(value);
}

export function isStopDecision(value: string): value is StopDecision {
	return STOP_DECISIONS.some((decision) => decision === value);
}

export function withHead(
	record: ReviewRecord,
	head: ReviewedHead,
): ReviewRecord {
	return { ...record, heads: [...record.heads, head] };
}

export function deltaBase(
	record: ReviewRecord,
	ancestors: readonly string[],
): DeltaBase {
	const clean = record.heads.filter((head) => head.decision === "stop_clean");
	if (clean.length === 0)
		return { kind: "full", reason: "the record holds no stop_clean head" };
	const held = clean.findLast((head) => ancestors.includes(head.sha));
	return held === undefined
		? { kind: "full", reason: "HEAD holds no stop_clean head of the record" }
		: { kind: "delta", sha: held.sha };
}

export function launchTotal(record: ReviewRecord): number {
	return record.heads.reduce((total, head) => total + head.launches, 0);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function commitField(
	value: Record<string, unknown>,
	key: string,
	at: string,
): Result<string, string> {
	const field = value[key];
	return typeof field === "string" && isCommitId(field)
		? ok(field)
		: err(`${at}${key} is not a full commit SHA`);
}

function parseHead(value: unknown, at: string): Result<ReviewedHead, string> {
	if (!isObject(value)) return err(`${at} is not an object`);
	const sha = commitField(value, "sha", `${at}.`);
	if (!sha.ok) return sha;
	const { decision, launches } = value;
	if (typeof decision !== "string" || !isStopDecision(decision))
		return err(`${at}.decision is not a stop decision`);
	if (
		typeof launches !== "number" ||
		!Number.isSafeInteger(launches) ||
		launches < 0
	)
		return err(`${at}.launches is not a whole number`);
	return ok({ sha: sha.value, decision, launches });
}

export function parseRecord(value: unknown): Result<ReviewRecord, string> {
	if (!isObject(value)) return err("the record is not an object");
	const baseSha = commitField(value, "baseSha", "");
	if (!baseSha.ok) return baseSha;
	const firstReviewedHead = commitField(value, "firstReviewedHead", "");
	if (!firstReviewedHead.ok) return firstReviewedHead;
	const raw = value.heads ?? [];
	if (!Array.isArray(raw)) return err("heads is not a list");
	const heads: ReviewedHead[] = [];
	for (const [index, entry] of raw.entries()) {
		const head = parseHead(entry, `heads[${index}]`);
		if (!head.ok) return head;
		heads.push(head.value);
	}
	return ok({
		baseSha: baseSha.value,
		firstReviewedHead: firstReviewedHead.value,
		heads,
	});
}
