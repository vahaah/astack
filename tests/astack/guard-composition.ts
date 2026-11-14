import type {
	Context,
	Handler,
	HookEvent,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { handler as commentsHandler } from "../../src/astack/hook/handlers/comments.ts";
import { handler as destructiveHandler } from "../../src/astack/hook/handlers/destructive.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import { handler as steArtifactHandler } from "../../src/astack/hook/handlers/ste-artifact.ts";
import { handler as typesHandler } from "../../src/astack/hook/handlers/types.ts";
import type { ReadPullRequest } from "../../src/astack/pr/github.ts";
import { type MergeGrant, mergeGrantIn } from "../../src/astack/pr/grant.ts";

export type GuardArrow = (event: HookEvent, context: Context) => Verdict;

export const grantArrow: (prompt: string) => MergeGrant = mergeGrantIn;

export function guardArrows(read: ReadPullRequest) {
	const merge: Handler = mergeGuard(read);
	return {
		merge: merge.run,
		comments: commentsHandler.run,
		types: typesHandler.run,
		docSte: steArtifactHandler.run,
		workLoss: destructiveHandler.run,
	} satisfies Readonly<Record<string, GuardArrow>>;
}
