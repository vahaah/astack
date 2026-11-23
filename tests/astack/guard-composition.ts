import {
	type GateRecord,
	type GateRun,
	recordOf,
	runGates,
} from "../../src/astack/gates.ts";
import {
	type GitInvocation,
	type GitRead,
	madeRepoTarget,
	readGit,
} from "../../src/astack/git-command.ts";
import type {
	Context,
	Handler,
	HookEvent,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { handler as commentsHandler } from "../../src/astack/hook/handlers/comments.ts";
import {
	handler as destructiveHandler,
	type Treeish,
	type WorkLoss,
	workLoss,
} from "../../src/astack/hook/handlers/destructive.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import { handler as steArtifactHandler } from "../../src/astack/hook/handlers/ste-artifact.ts";
import { handler as typesHandler } from "../../src/astack/hook/handlers/types.ts";
import {
	type ReadPullRequest,
	readPullRequestWithGh,
} from "../../src/astack/pr/github.ts";
import {
	type MergeGrant,
	mergeGrantIn,
	startsFullStop,
} from "../../src/astack/pr/grant.ts";
import {
	type MadeProbe,
	type RepoIdentity,
	type SessionRepos,
	sessionRepoAt,
	settleRepos,
} from "../../src/astack/session-repos.ts";
import { type ShellStep, shellSteps } from "../../src/astack/shell.ts";

export type GuardArrow = (event: HookEvent, context: Context) => Verdict;

export const grantArrow: (prompt: string) => MergeGrant = mergeGrantIn;

export const fullStopArrow: (prompt: string) => boolean = startsFullStop;

export const workLossArrow: (
	git: GitInvocation,
	isTreeish: Treeish,
) => WorkLoss | undefined = workLoss;

export const pullRequestArrow: ReadPullRequest = readPullRequestWithGh;

export const plainFormArrow: (command: string, cwd: string) => ShellStep[] =
	shellSteps;

export const gitReadArrow: (step: ShellStep) => GitRead = readGit;

export const madeRepoArrow: (step: ShellStep) => string | undefined =
	madeRepoTarget;

export const settleArrow: (
	repos: SessionRepos,
	probes: ReadonlyMap<string, MadeProbe>,
) => SessionRepos = settleRepos;

export const sessionRepoArrow: (
	repos: SessionRepos,
	root: string,
	identity: RepoIdentity,
) => boolean = sessionRepoAt;

export const gatesRunArrow: (
	...args: Parameters<typeof runGates>
) => readonly GateRun[] = runGates;

export const gateRecordArrow: (
	runs: readonly GateRun[],
	head: string,
	base: string,
	baseSha: string,
	profile: string,
) => GateRecord | undefined = recordOf;

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
