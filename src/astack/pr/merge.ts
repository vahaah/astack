import { resolve } from "node:path";
import { readOptional } from "../paths.ts";
import { PROFILE_PATH } from "../profile.ts";
import type { SimpleCommand, Word } from "../shell.ts";
import type { BaseAuthority, PullRequestState } from "./github.ts";
import { grantCovers, type MergeGrant } from "./grant.ts";
import { closingRefs, linkFindings } from "./links.ts";
import { DEFAULT_MERGE_PROFILE, type MergeProfile } from "./profile.ts";

export type MergeCall = {
	readonly selector: string | undefined;
	readonly repo: string | undefined;
	readonly subject: string | undefined;
	readonly body: string | undefined;
	readonly dynamic: boolean;
	readonly disableAuto: boolean;
	readonly admin: boolean;
};

type ValueFlag = "body" | "bodyFile" | "subject" | "repo" | "ignore";

const VALUE_FLAGS: Readonly<Record<string, ValueFlag>> = {
	"-b": "body",
	"--body": "body",
	"-F": "bodyFile",
	"--body-file": "bodyFile",
	"-t": "subject",
	"--subject": "subject",
	"-R": "repo",
	"--repo": "repo",
	"-A": "ignore",
	"--author-email": "ignore",
	"--match-head-commit": "ignore",
};

function fileText(
	word: Word,
	command: SimpleCommand,
	dir: string,
): string | undefined {
	if (word.dynamic) return undefined;
	return word.value === "-"
		? command.stdin
		: readOptional(resolve(dir, word.value));
}

type FlagWord = { readonly name: string; readonly value: Word | undefined };

function shortFlags(word: Word): readonly FlagWord[] {
	const flags: FlagWord[] = [];
	for (let at = 1; at < word.value.length; at++) {
		const name = `-${word.value.charAt(at)}`;
		const rest = word.value.slice(at + 1);
		if (rest.length > 1 && rest.startsWith("="))
			return [
				...flags,
				{ name, value: { value: rest.slice(1), dynamic: word.dynamic } },
			];
		if (VALUE_FLAGS[name] === undefined) {
			flags.push({ name, value: undefined });
			continue;
		}
		const value =
			rest === "" ? undefined : { value: rest, dynamic: word.dynamic };
		return [...flags, { name, value }];
	}
	return flags;
}

function flagWords(word: Word): readonly FlagWord[] {
	if (!word.value.startsWith("--")) return shortFlags(word);
	const eq = word.value.indexOf("=");
	return eq > 0
		? [
				{
					name: word.value.slice(0, eq),
					value: { value: word.value.slice(eq + 1), dynamic: word.dynamic },
				},
			]
		: [{ name: word.value, value: undefined }];
}

export function parseMergeCall(
	command: SimpleCommand,
	words: readonly Word[],
	dir: string,
): MergeCall {
	let selector: string | undefined;
	let repo: string | undefined;
	let subject: string | undefined;
	let body: string | undefined;
	let dynamic = false;
	let disableAuto = false;
	let admin = false;
	for (let index = 0; index < words.length; index++) {
		const word = words[index];
		if (!word) continue;
		if (!word.value.startsWith("-")) {
			if (selector === undefined) {
				selector = word.value;
				dynamic ||= word.dynamic;
			}
			continue;
		}
		for (const { name, value: attached } of flagWords(word)) {
			if (name === "--disable-auto") disableAuto = true;
			if (name === "--admin") admin = true;
			const flag = VALUE_FLAGS[name];
			const value =
				flag === undefined ? undefined : (attached ?? words[++index]);
			if (!value || flag === "ignore") continue;
			if (flag === "bodyFile") {
				body = fileText(value, command, dir);
				dynamic ||= value.dynamic;
			} else if (value.dynamic) dynamic = true;
			else if (flag === "body") body = value.value;
			else if (flag === "subject") subject = value.value;
			else repo = value.value;
		}
	}
	return {
		selector,
		repo,
		subject,
		body,
		dynamic,
		disableAuto,
		admin,
	};
}

export type MergeInputs = {
	readonly call: MergeCall;
	readonly chained: boolean;
	readonly setsEnv: boolean;
	readonly grant: MergeGrant;
	readonly unattendedReason: string | undefined;
};

function noTurnGrantText(unattendedReason: string | undefined): string {
	return unattendedReason === undefined
		? "The owner did not say to merge in this turn."
		: `astack records no merge grant from prompts in an unattended session. ${unattendedReason} makes this session unattended.`;
}

function closingInCommitText(call: MergeCall): string[] {
	return [call.subject, call.body].flatMap((text) =>
		text === undefined
			? []
			: closingRefs(text).map(
					(ref) =>
						`The merge commit text has "${ref.phrase}". The tracker closes ${ref.ref} when this commit lands. Write "Part of ${ref.ref}", or leave the ticket out.`,
				),
	);
}

export function preflightReasons(inputs: MergeInputs): readonly string[] {
	const reasons: string[] = [];
	if (inputs.call.admin)
		reasons.push(
			"Do not merge with --admin. It skips the branch protection rules. This is an owner gate, so ask the owner.",
		);
	if (inputs.chained)
		reasons.push(
			"Run gh pr merge as its own Bash call. Do not chain it with other commands, and never with the checks before it.",
		);
	if (inputs.setsEnv)
		reasons.push(
			"Do not put NAME=value words, such as GH_REPO, before gh pr merge. astack reads the PR without them, so it can read a different PR. Use --repo to name a different repo.",
		);
	if (inputs.call.dynamic)
		reasons.push(
			"astack cannot read a PR number or merge text from a shell variable. Name the PR by number, and write the merge text as plain text.",
		);
	reasons.push(...closingInCommitText(inputs.call));
	return reasons;
}

function short(sha: string | undefined): string {
	return sha ? sha.slice(0, 7) : "unknown";
}

function checkReasons(pr: PullRequestState, requireChecks: boolean): string[] {
	if (pr.checkedHead !== pr.head)
		return [
			`The CI state that GitHub gives belongs to ${short(pr.checkedHead)}, not to the PR head ${short(pr.head)}. Wait for CI on the head.`,
		];
	switch (pr.checks) {
		case "success":
			return [];
		case "pending":
			return [
				`CI still runs on head ${short(pr.head)} of #${pr.number}. Wait until it is green, then merge in a new Bash call.`,
			];
		case "failure":
			return [
				`CI failed on head ${short(pr.head)} of #${pr.number}. Fix the failure, push, and wait for green CI.`,
			];
		case "none":
			return requireChecks
				? [
						`GitHub shows no CI check on head ${short(pr.head)} of #${pr.number}. Wait for CI to start. A repo with no CI sets merge.requireChecks to false in ${PROFILE_PATH} on its base branch.`,
					]
				: [];
	}
}

function mergeProfileOf(authority: BaseAuthority): MergeProfile {
	return authority.kind === "committed"
		? authority.profile
		: DEFAULT_MERGE_PROFILE;
}

function baseProfileText(pr: PullRequestState): string {
	const { authority } = pr;
	switch (authority.kind) {
		case "committed": {
			const where = `${PROFILE_PATH} on ${pr.base} at ${short(authority.commit)}`;
			const bases = authority.profile.standingBases;
			return bases.length === 0
				? `${where} gives no standing grant.`
				: `#${pr.number} goes into ${pr.base}, and merge.standingBases in ${where} covers only ${bases.join(", ")}.`;
		}
		case "absent":
			return `${pr.base} at ${short(authority.commit)} has no ${PROFILE_PATH}, so it gives no standing grant.`;
		case "unread":
			return `astack could not read the standing grant of ${pr.base}, because ${authority.reason}.`;
	}
}

function turnGrantText(inputs: MergeInputs, number: number): string {
	const { grant } = inputs;
	return grant.kind === "prs"
		? `The owner's merge grant in this turn names ${grant.numbers.map((granted) => `#${granted}`).join(", ")}, not #${number}.`
		: noTurnGrantText(inputs.unattendedReason);
}

function grantReasons(inputs: MergeInputs, pr: PullRequestState): string[] {
	const profile = mergeProfileOf(pr.authority);
	if (profile.authority === "standing") return [];
	if (profile.standingBases.includes(pr.base)) return [];
	if (grantCovers(inputs.grant, pr.number)) return [];
	return [
		[
			baseProfileText(pr),
			turnGrantText(inputs, pr.number),
			`Ask the owner before you merge #${pr.number}.`,
		].join(" "),
	];
}

export function stateReasons(
	inputs: MergeInputs,
	pr: PullRequestState | undefined,
): readonly string[] {
	if (!pr)
		return [
			"astack could not read the PR with gh, so it cannot see the review threads, the CI state or the standing grant of its base branch. Run gh auth status, or let the owner merge.",
		];
	const reasons = [...grantReasons(inputs, pr)];
	if (pr.openThreads > 0)
		reasons.push(
			`${pr.openThreads} review ${pr.openThreads === 1 ? "thread is" : "threads are"} open on #${pr.number}. Fix or answer each one, and resolve it.`,
		);
	if (!pr.threadsListed)
		reasons.push(
			`#${pr.number} has more than 100 review threads, so astack cannot see that all of them are resolved.`,
		);
	reasons.push(...checkReasons(pr, mergeProfileOf(pr.authority).requireChecks));
	reasons.push(
		...linkFindings(
			{ title: pr.title, body: pr.body },
			{ requirePartOf: false },
		).map((finding) => `#${pr.number}: ${finding}`),
	);
	return reasons;
}

export function mergeDenial(reasons: readonly string[]): string {
	return [
		"astack blocked gh pr merge:",
		...reasons.map((reason) => `- ${reason}`),
	].join("\n");
}
