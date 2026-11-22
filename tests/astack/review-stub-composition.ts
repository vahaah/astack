import type { ProjectConfig } from "../../scripts/lib/projects.ts";
import {
	planRemovals,
	type RemovalInput,
	type RemovalPlan,
} from "../../scripts/lib/removals.ts";
import { type Rendered, renderReviewCopies } from "../../scripts/lib/render.ts";
import {
	type ReviewProfileProblem,
	reviewProfileProblems,
} from "../../src/astack/pr-review-profile.ts";

export const reviewStubArrows = {
	renderReviewCopies: renderReviewCopies satisfies (
		project: ProjectConfig,
		dir: string,
	) => Rendered,
	reviewProfileProblems: reviewProfileProblems satisfies (
		markdown: string,
		keep: readonly RegExp[],
	) => ReviewProfileProblem[],
	planRemovals: planRemovals satisfies (input: RemovalInput) => RemovalPlan,
};
