export type LengthKind = "block" | "export-doc";

export interface LengthLimit {
	max: number;
	over: "deny" | "judge";
}

export type CommentLimits = Record<LengthKind, LengthLimit>;

export interface CommentSize {
	kind: LengthKind;
	lines: number;
	limit: number;
}

export const DEFAULT_LIMITS: CommentLimits = {
	block: { max: 2, over: "deny" },
	"export-doc": { max: 12, over: "judge" },
};

export const REWRITE_MAX_LINES = 2;

export function limitsFor(maxCommentLines: number | undefined): CommentLimits {
	if (maxCommentLines === undefined) return DEFAULT_LIMITS;
	const exportDoc = DEFAULT_LIMITS["export-doc"];
	return {
		block: { ...DEFAULT_LIMITS.block, max: maxCommentLines },
		"export-doc": {
			...exportDoc,
			max: Math.max(exportDoc.max, maxCommentLines),
		},
	};
}

export function rewriteLines(sizes: CommentSize[]): number {
	return Math.min(REWRITE_MAX_LINES, ...sizes.map((size) => size.limit));
}
