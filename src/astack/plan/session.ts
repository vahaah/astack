import { err, ok, type Result } from "../result.ts";
import { nowSessions, PLAN_CAPS, tierOf } from "./check.ts";
import { fieldText, frontmatterValue, stateOf, stripPeriod } from "./parse.ts";
import { slugOf } from "./planset.ts";
import {
	DEFAULT_OWNER_GATES,
	type Plan,
	type Session,
	type Step,
} from "./types.ts";
import { trackerKeys } from "./units.ts";

const ULTRACODE = "Use ultracode.";

export type Checkpoint = {
	readonly at: string;
	readonly steps: readonly string[];
	readonly wave: string | undefined;
	readonly head: string | undefined;
};

export type SessionRecord = {
	readonly plan: string;
	readonly session: string;
	readonly branch: string;
	readonly base: string | undefined;
	readonly started: string;
	readonly ultracode: boolean;
	readonly pr: number | undefined;
	readonly checkpoints: readonly Checkpoint[];
};

export type GitFacts = {
	readonly branch: string | undefined;
	readonly head: string | undefined;
	readonly diffstat: string;
	readonly commits: readonly string[];
};

export type TrackerWrite = {
	readonly summary: string;
	readonly via: "linear" | "gh";
	readonly tool: string | undefined;
	readonly args: Readonly<Record<string, unknown>> | undefined;
	readonly argv: readonly string[] | undefined;
	readonly stdin: string | undefined;
};

export type SessionOutput = {
	readonly text: string;
	readonly writes: readonly TrackerWrite[];
	readonly record: SessionRecord;
};

export function pickSession(
	plan: Plan,
	handle: string | undefined,
): Result<Session, string> {
	if (handle) {
		const session = plan.sessions.find(
			(candidate) => candidate.handle === handle,
		);
		if (!session)
			return err(
				`no session ${handle}; the sessions are ${plan.sessions.map((s) => s.handle).join(", ")}`,
			);
		if (stateOf(session) === "done") return err(`${handle} is done`);
		return ok(session);
	}
	const now = nowSessions(plan);
	if (now.length === 1 && now[0]) return ok(now[0]);
	return err(
		now.length === 0
			? "the plan has no now session; name one, or run /astack:plan first"
			: `the plan has ${now.length} now sessions, one per lane; name one of ${now.map((s) => s.handle).join(", ")}`,
	);
}

export function slugPart(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export function sessionKeys(plan: Plan, session: Session): string[] {
	const own = stripPeriod(session.fields.get("Ticket")?.value ?? "");
	return own && own !== "none" ? [own] : trackerKeys(plan);
}

export function branchName(
	plan: Plan,
	session: Session,
	path: string,
	prefix: string,
): string {
	const named = stripPeriod(session.fields.get("Branch")?.value ?? "").replace(
		/`/g,
		"",
	);
	if (named) return named;
	const key = sessionKeys(plan, session)[0];
	const slug = slugOf(plan, path);
	const tail =
		tierOf(plan) === "brief"
			? `${slugPart(session.handle ?? "")}-${slugPart(frontmatterValue(plan, "programme") ?? slug)}`
			: slugPart(slug);
	return [
		slugPart(prefix) || "work",
		key ? slugPart(key) : "",
		tail.slice(0, 60),
	]
		.filter(Boolean)
		.join("/");
}

export function waves(session: Session): string[] {
	return [...new Set(session.steps.map((step) => step.wave || "W1"))];
}

export function perWave(session: Session): boolean {
	return session.steps.length > PLAN_CAPS.stepsPerCheckpoint;
}

function stepLine(step: Step): string {
	return `${step.id} ${stripPeriod(step.title)}`;
}

function done(record: SessionRecord): Set<string> {
	return new Set(record.checkpoints.flatMap((checkpoint) => checkpoint.steps));
}

export function pendingSteps(session: Session, record: SessionRecord): Step[] {
	const finished = done(record);
	return session.steps.filter((step) => !finished.has(step.id));
}

export function nextScope(
	session: Session,
	record: SessionRecord,
): { readonly steps: Step[]; readonly wave: string | undefined } {
	const pending = pendingSteps(session, record);
	const first = pending[0];
	if (!first) return { steps: [], wave: undefined };
	if (!perWave(session))
		return { steps: [first], wave: first.wave || undefined };
	const wave = first.wave || "W1";
	return {
		steps: pending.filter((step) => (step.wave || "W1") === wave),
		wave,
	};
}

function targetOf(key: string): "linear" | "gh" {
	return key.startsWith("#") ? "gh" : "linear";
}

function comment(key: string, body: string, summary: string): TrackerWrite {
	return targetOf(key) === "gh"
		? {
				summary,
				via: "gh",
				tool: undefined,
				args: undefined,
				argv: ["gh", "issue", "comment", key.slice(1), "--body-file", "-"],
				stdin: body,
			}
		: {
				summary,
				via: "linear",
				tool: "save_comment",
				args: { issueId: key, body },
				argv: undefined,
				stdin: undefined,
			};
}

function claim(key: string): TrackerWrite {
	return targetOf(key) === "gh"
		? {
				summary: `assign ${key} to you`,
				via: "gh",
				tool: undefined,
				args: undefined,
				argv: ["gh", "issue", "edit", key.slice(1), "--add-assignee", "@me"],
				stdin: undefined,
			}
		: {
				summary: `move ${key} to In Progress and assign it to you`,
				via: "linear",
				tool: "save_issue",
				args: { id: key, state: "In Progress", assignee: "me" },
				argv: undefined,
				stdin: undefined,
			};
}

function delegation(plan: Plan): string {
	return frontmatterValue(plan, "delegate") === "on"
		? "Delegation is on. Decide agent calls and human calls with a clear best option, record each as delegated, and continue."
		: "Delegation is off. Ask the owner the human calls in one round.";
}

function gates(plan: Plan): string {
	const listed = frontmatterValue(plan, "owner-gates")?.replace(/^\[|\]$/g, "");
	return `Stop at the owner gates (${listed || DEFAULT_OWNER_GATES.join(", ")}).`;
}

export function startSession(
	plan: Plan,
	path: string,
	session: Session,
	options: {
		readonly prefix: string;
		readonly ultracode: boolean;
		readonly now: Date;
		readonly base: string | undefined;
	},
): SessionOutput {
	const branch = branchName(plan, session, path, options.prefix);
	const programme = tierOf(plan) === "brief";
	const keys = sessionKeys(plan, session);
	const record: SessionRecord = {
		plan: path,
		session: session.handle ?? session.title,
		branch,
		base: options.base,
		started: options.now.toISOString(),
		ultracode: options.ultracode,
		pr: undefined,
		checkpoints: [],
	};
	const own = Boolean(stripPeriod(session.fields.get("Ticket")?.value ?? ""));
	const writes: TrackerWrite[] = keys.flatMap((key) => [
		claim(key),
		...(programme && own
			? [
					comment(
						key,
						`Claimed. Branch \`${branch}\`.`,
						`post a claim comment on ${key}`,
					),
				]
			: []),
	]);
	const byWave = session.steps.map(
		(step) =>
			`- ${step.wave || "W1"}, step ${step.id}. ${stripPeriod(step.title)}${step.lane ? `, lane ${step.lane}` : ""}.`,
	);
	const text = [
		`Session ${record.session} of ${path}. ${stripPeriod(session.title)}.`,
		`Branch. ${branch}. Work in a worktree from the default branch, never on it.`,
		`Checkpoints. ${perWave(session) ? "One per wave" : "One per step"}, mode ${frontmatterValue(plan, "checkpoints") ?? "report"}. The package goes to the PR, and chat gets 6 lines or fewer.`,
		"Waves. Step workers run in parallel worktrees. The integrator lands their commits on the session branch in step order.",
		...byWave,
		delegation(plan),
		gates(plan),
		...(writes.length > 0
			? [
					"Tracker writes, run them now.",
					...writes.map((write) => `- ${write.summary}`),
				]
			: ["Tracker writes. None, because the plan names no ticket."]),
	].join("\n");
	return { text: `${text}\n`, writes, record };
}

export type ProofLog =
	| { readonly kind: "none" }
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "log"; readonly tail: string };

const STEP_SUBJECT = /\b(?:B\d+\/)?S(\d+) step (\d+[a-z]?)\b/i;

export function committedSteps(
	sessionHandle: string,
	commits: readonly string[],
): ReadonlySet<string> {
	const own = /S(\d+)$/i.exec(sessionHandle)?.[1];
	return new Set(
		commits.flatMap((commit) => {
			const match = STEP_SUBJECT.exec(commit);
			return match && match[1] === own && match[2] ? [match[2]] : [];
		}),
	);
}

function proofLines(proof: ProofLog): readonly string[] {
	switch (proof.kind) {
		case "none":
			return ["Red-green-red. Not given."];
		case "text":
			return [`Red-green-red. ${stripPeriod(proof.text)}.`];
		case "log":
			return [
				"Red-green-red. The tail of the log:",
				"",
				"```text",
				proof.tail,
				"```",
				"",
			];
	}
}

function prComment(
	selector: string,
	body: string,
	summary: string,
): TrackerWrite {
	return {
		summary,
		via: "gh",
		tool: undefined,
		args: undefined,
		argv: ["gh", "pr", "comment", selector, "--body-file", "-"],
		stdin: body,
	};
}

export function checkpointPackage(
	plan: Plan,
	session: Session,
	record: SessionRecord,
	scope: { readonly steps: readonly Step[]; readonly wave: string | undefined },
	facts: GitFacts,
	inputs: {
		readonly gates: string | undefined;
		readonly summary: string | undefined;
		readonly proof: ProofLog;
		readonly screenshots: readonly string[];
		readonly now: Date;
	},
): SessionOutput {
	const covered = [...new Set(scope.steps.flatMap((step) => step.covers))];
	const after: SessionRecord = {
		...record,
		checkpoints: [
			...record.checkpoints,
			{
				at: inputs.now.toISOString(),
				steps: scope.steps.map((step) => step.id),
				wave: scope.wave,
				head: facts.head,
			},
		],
	};
	const pending = pendingSteps(session, after);
	const next = pending[0];
	const approve =
		frontmatterValue(plan, "checkpoints") === "approve" ||
		scope.steps.some((step) => step.checkpoint.startsWith("approve"));
	const number = after.checkpoints.length;
	const total = perWave(session) ? waves(session).length : session.steps.length;
	const summary = (inputs.summary ?? "")
		.split("\n")
		.map((line) => line.trimEnd())
		.filter(Boolean)
		.slice(0, 10);
	const what = `${scope.wave ? `${scope.wave}, ` : ""}${scope.steps.length === 1 ? "step" : "steps"} ${scope.steps.map((step) => step.id).join(", ")}`;
	const committed = committedSteps(record.session, facts.commits);
	const uncommitted = scope.steps
		.map((step) => step.id)
		.filter((id) => !committed.has(id));
	const diffstat = facts.diffstat.replace(/^\n+/, "").trimEnd();
	const body = [
		`Checkpoint ${number} of ${total} for ${record.session} (${what}).`,
		"",
		...summary,
		"",
		`Decisions covered. ${covered.length > 0 ? covered.join(", ") : "None named"}.`,
		`Gates. ${inputs.gates ?? "Not given"}.`,
		...proofLines(inputs.proof),
		...(inputs.screenshots.length > 0
			? [`Screenshots. ${inputs.screenshots.join(", ")}.`]
			: []),
		...(facts.commits.length > 0
			? ["Commits.", ...facts.commits.map((commit) => `- ${commit}`)]
			: ["Commits. None since the last checkpoint."]),
		"",
		"```text",
		diffstat || "no diff",
		"```",
		"",
		next
			? `Next. Step ${stepLine(next)}${next.wave ? ` in ${next.wave}` : ""}.`
			: "Next. Every step is done, so run the whole-work proof and mark the PR ready.",
		approve
			? "Mode. approve. The session waits for the owner."
			: "Mode. report. The session continues.",
	].join("\n");
	const opened = after.pr !== undefined || record.checkpoints.length > 0;
	const selector = after.pr !== undefined ? String(after.pr) : record.branch;
	const writes: TrackerWrite[] = opened
		? [
				prComment(
					selector,
					body,
					`post the package on ${after.pr !== undefined ? `PR #${after.pr}` : `the PR of ${record.branch}`}`,
				),
			]
		: [
				{
					summary: "open a draft PR",
					via: "gh",
					tool: undefined,
					args: undefined,
					argv: [
						"gh",
						"pr",
						"create",
						"--draft",
						"--head",
						record.branch,
						"--title",
						prTitle(plan, session),
						"--body-file",
						"-",
					],
					stdin: prBody(plan, session, record),
				},
				prComment(
					record.branch,
					body,
					`post the package on the PR of ${record.branch}`,
				),
			];
	const chat = [
		`${record.session} checkpoint ${number} of ${total}. ${what} done.`,
		`Gates. ${inputs.gates ?? "not given"}.`,
		`Decisions covered. ${covered.length > 0 ? covered.join(", ") : "none named"}.`,
		`Package. ${after.pr !== undefined ? `PR #${after.pr} comment` : `a comment on the PR of ${record.branch}`}.`,
		next ? `Next. Step ${stepLine(next)}.` : "Next. The whole-work proof.",
		approve ? "Waiting for your approve." : "Continuing in report mode.",
	];
	const warning =
		uncommitted.length > 0
			? `\nWarning. ${uncommitted.length === 1 ? "Step" : "Steps"} ${uncommitted.join(", ")} of ${record.session} ${uncommitted.length === 1 ? "has" : "have"} no commit whose subject says "${record.session} step <n>" since the last checkpoint.\n`
			: "";
	return {
		text: `${chat.join("\n")}\n${warning}\n--- package for the PR ---\n${body}\n`,
		writes,
		record: after,
	};
}

export function prTitle(plan: Plan, session: Session): string {
	const handle = tierOf(plan) === "brief" ? `${session.handle ?? ""} ` : "";
	return `${handle}${stripPeriod(session.title)}`.trim();
}

export function prBody(
	plan: Plan,
	session: Session,
	record?: SessionRecord,
): string {
	const keys = sessionKeys(plan, session);
	const steps = session.steps.map((step) => `- ${stepLine(step)}.`);
	const goal = fieldText(plan.goal.get("Goal"));
	return [
		...(keys.length > 0 ? [`Part of ${keys.join(", ")}`, ""] : []),
		"## Why",
		"",
		goal || stripPeriod(session.title),
		"",
		"## What changes",
		"",
		...steps,
		"",
		"## Verification",
		"",
		`Run ${fieldText(session.fields.get("Proof")) || "the session proof"}. Each checkpoint comment holds its gate counts.`,
		"",
		"## Risk and rollback",
		"",
		"Revert the PR. Each step is its own commit, so a revert of one step is also possible.",
		...(record === undefined
			? []
			: [
					"",
					`Session. ${record.session} of ${record.plan}.${record.ultracode ? ` ${ULTRACODE}` : ""}`,
				]),
	].join("\n");
}

export function handoff(
	plan: Plan,
	session: Session,
	record: SessionRecord,
	resume: string,
): SessionOutput {
	const finished = done(record);
	const steps = session.steps
		.filter((step) => finished.has(step.id))
		.map((step) => step.id);
	const next = pendingSteps(session, record)[0];
	const open = plan.questions.length;
	const last = record.checkpoints.at(-1);
	const lines = [
		`Hand-off for ${record.session} on branch ${record.branch}${record.pr ? `, PR #${record.pr}` : ""}.`,
		`Done. ${steps.length > 0 ? `Steps ${steps.join(", ")}` : "No step yet"}${last?.head ? `, last checkpoint at ${last.head}` : ""}.`,
		next
			? `Next. Step ${stepLine(next)}${next.wave ? ` in ${next.wave}` : ""}.`
			: "Next. The whole-work proof, then mark the PR ready.",
		`Open. ${open} unresolved question${open === 1 ? "" : "s"} in the plan.`,
		`Resume. astack session resume ${record.plan}.${record.ultracode ? ` ${ULTRACODE}` : ""}`,
	];
	const body = lines.join("\n");
	const keys = sessionKeys(plan, session);
	const writes: TrackerWrite[] = [
		...keys.map((key) => comment(key, body, `post the hand-off on ${key}`)),
		...(record.pr !== undefined || record.checkpoints.length > 0
			? [
					prComment(
						record.pr !== undefined ? String(record.pr) : record.branch,
						body,
						`post the hand-off on ${record.pr !== undefined ? `PR #${record.pr}` : `the PR of ${record.branch}`}`,
					),
				]
			: []),
	];
	return {
		text: `${body}\n\n--- resume prompt ---\n${resume}\n`,
		writes,
		record,
	};
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prTexts(json: string | undefined): {
	readonly number: number | undefined;
	readonly texts: readonly string[];
} {
	if (json === undefined) return { number: undefined, texts: [] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return { number: undefined, texts: [] };
	}
	if (!isFields(parsed)) return { number: undefined, texts: [] };
	const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
	const bodies = comments.flatMap((comment: unknown) =>
		isFields(comment) && typeof comment.body === "string" ? [comment.body] : [],
	);
	return {
		number: typeof parsed.number === "number" ? parsed.number : undefined,
		texts: [
			...(typeof parsed.body === "string" ? [parsed.body] : []),
			...bodies,
		],
	};
}

const CHECKPOINT_STEPS =
	/^Checkpoint \d+ of \d+ for (\S+) \((?:W\w+, )?steps? ([^)]+)\)/m;

export function recordFromHistory(
	path: string,
	session: Session,
	history: {
		readonly branch: string;
		readonly base: string | undefined;
		readonly subjects: readonly string[];
		readonly pr: string | undefined;
		readonly now: Date;
	},
): SessionRecord {
	const handle = session.handle ?? session.title;
	const pr = prTexts(history.pr);
	const fromComments = pr.texts.flatMap((text) => {
		const match = CHECKPOINT_STEPS.exec(text);
		return match && match[1] === handle
			? (match[2] ?? "").split(/,\s*/).map((id) => id.trim())
			: [];
	});
	const ids = session.steps.map((step) => step.id);
	const done = new Set([
		...committedSteps(handle, history.subjects),
		...fromComments,
	]);
	const steps = ids.filter((id) => done.has(id));
	return {
		plan: path,
		session: handle,
		branch: history.branch,
		base: history.base,
		started: history.now.toISOString(),
		ultracode: pr.texts.some((text) => text.includes(ULTRACODE)),
		pr: pr.number,
		checkpoints:
			steps.length > 0
				? [
						{
							at: history.now.toISOString(),
							steps,
							wave: undefined,
							head: undefined,
						},
					]
				: [],
	};
}

export function resumePrompt(
	plan: Plan,
	session: Session,
	record: SessionRecord,
): string {
	const next = pendingSteps(session, record)[0];
	const slug = frontmatterValue(plan, "programme") ?? slugOf(plan, record.plan);
	return [
		`Resume ${record.plan}, session ${record.session}, on branch ${record.branch}${record.pr ? ` (PR #${record.pr})` : record.checkpoints.length > 0 ? " (its open PR)" : ""}.`,
		`Read the plan, the trail (astack plan trail ${slug}) and the checkpoint comments on the PR first.`,
		next
			? `The next step is ${stepLine(next)}${next.wave ? ` in ${next.wave}` : ""}.`
			: "Every step is done. Run the whole-work proof and mark the PR ready.",
		delegation(plan),
		gates(plan),
		`Run /astack:plan ${slug} when the plan needs a change.`,
		...(record.ultracode ? [ULTRACODE] : []),
	].join(" ");
}
