import { laneOf, tierOf } from "./check.ts";
import {
	bullets,
	fieldText,
	frontmatterValue,
	handleList,
	listValue,
	sectionByTitle,
	sectionText,
	stateOf,
	stripPeriod,
} from "./parse.ts";
import type { PlanSet } from "./planset.ts";
import type { BlockLine, Milestone, Plan, Question, Session } from "./types.ts";

export type UnitKind =
	| "root"
	| "copy"
	| "addendum"
	| "milestone"
	| "block"
	| "session"
	| "decision";

export type LabelRef = {
	readonly group: "Lane" | "Kind";
	readonly value: string;
};

export type ExportUnit = {
	readonly id: string;
	readonly kind: UnitKind;
	readonly handle: string;
	readonly title: string;
	readonly body: string;
	readonly key: string | undefined;
	readonly parent: string | undefined;
	readonly parentKey: string | undefined;
	readonly milestone: string | undefined;
	readonly blockedBy: readonly string[];
	readonly labels: readonly LabelRef[];
	readonly target: string | undefined;
	readonly path: string | undefined;
	readonly state: string | undefined;
};

export const CHECKERS =
	"The implementer runs it on the PR head and puts the result in the PR. The reviewer checks that result against the criteria.";

const BACKLINK = /^astack: (\S+) @ (\S+)\s*$/;

export function backlink(id: string, sha: string): string {
	return `astack: ${id} @ ${sha}`;
}

export function parseBacklink(
	body: string | undefined,
): { readonly id: string; readonly sha: string } | undefined {
	const lines = (body ?? "").trimEnd().split(/\r?\n/);
	for (const line of lines.slice(-3).reverse()) {
		const match = BACKLINK.exec(line.trim());
		if (match) return { id: match[1] ?? "", sha: match[2] ?? "" };
	}
	return undefined;
}

export function withoutBacklink(body: string | undefined): string {
	return (body ?? "")
		.split(/\r?\n/)
		.filter((line) => !BACKLINK.test(line.trim()))
		.join("\n")
		.trim();
}

function checkboxes(items: readonly string[]): string {
	return items.map((item) => `- [ ] ${item}`).join("\n");
}

function keyOf(value: string | undefined): string | undefined {
	const key = stripPeriod(value ?? "").replace(/`/g, "");
	return key && !/^none$/i.test(key) ? key : undefined;
}

export function trackerKeys(plan: Plan): string[] {
	return listValue(frontmatterValue(plan, "tracker") ?? "").filter(
		(key) => key !== "none",
	);
}

function goalLines(plan: Plan): string[] {
	const goal = fieldText(plan.goal.get("Goal"));
	const decision = fieldText(plan.goal.get("Decision"));
	return [
		goal,
		decision ? `This work drives one decision. ${decision}` : "",
	].filter(Boolean);
}

function outItems(plan: Plan): string[] {
	return bullets(sectionByTitle(plan, "Scope")).flatMap((item) => {
		const match = /^Out\.\s+(.*)$/.exec(item.text);
		return match ? [`- ${match[1] ?? ""}`] : [];
	});
}

function planLink(path: string): string {
	return `- Plan. \`${path}\`. The last line names the commit of the export.`;
}

function sessionBody(plan: Plan, session: Session, path: string): string {
	const depends = handleList(fieldText(session.fields.get("Depends on")));
	const exit = session.fields.get("Exit");
	const criteria = exit
		? [...(exit.value ? [exit.value] : []), ...exit.bullets.map((b) => b.text)]
		: [];
	const steps = session.steps.map((step) =>
		[
			`- Step ${step.id}. ${stripPeriod(step.title)}.`,
			step.wave ? ` Wave ${step.wave}.` : "",
			step.lane ? ` Lane ${step.lane}.` : "",
		].join(""),
	);
	const siblings = plan.sessions
		.filter((other) => other !== session)
		.map((other) =>
			`- ${other.handle ?? ""} ${stripPeriod(other.title)}.`.trim(),
		);
	const proof = fieldText(session.fields.get("Proof"));
	return [
		"## Problem",
		"",
		...goalLines(plan),
		"",
		depends.length > 0
			? `This session starts after ${depends.join(", ")}.`
			: "This session can start now.",
		"",
		"## Outcome",
		"",
		`${stripPeriod(session.title)}.`,
		"",
		"## Acceptance criteria",
		"",
		checkboxes(
			criteria.length > 0 ? criteria : ["The session Exit in the plan holds."],
		),
		"",
		"## Scope",
		"",
		"In:",
		...(steps.length > 0
			? steps
			: ["- The steps the brief lists for this session."]),
		"",
		"Out:",
		...siblings,
		...outItems(plan),
		"",
		"## Verification",
		"",
		proof ? `Run ${proof}. ${CHECKERS}` : CHECKERS,
		"",
		"## Links",
		"",
		planLink(path),
	].join("\n");
}

function blockBody(
	index: Plan,
	milestone: Milestone,
	block: BlockLine,
	brief: { readonly plan: Plan; readonly path: string } | undefined,
	path: string,
): string {
	const sessions = brief?.plan.sessions ?? [];
	const siblings = milestone.blocks
		.filter((other) => other !== block)
		.map((other) => `- ${other.handle} ${other.outcome}.`);
	const proof =
		fieldText(milestone.fields.get("Proof")) ||
		sectionText(brief ? sectionByTitle(brief.plan, "Proof") : undefined);
	return [
		"## Problem",
		"",
		...goalLines(index),
		"",
		`${block.handle} serves ${milestone.handle ?? ""}. ${fieldText(milestone.fields.get("Demo"))}`.trim(),
		...(block.dependsOn.length > 0
			? ["", `This block starts after ${block.dependsOn.join(", ")}.`]
			: []),
		"",
		"## Outcome",
		"",
		`${stripPeriod(block.outcome)}.`,
		"",
		"## Acceptance criteria",
		"",
		checkboxes(
			sessions.length > 0
				? sessions.map((session) =>
						`${session.handle ?? ""} merges. ${stripPeriod(session.title)}.`.trim(),
					)
				: ["The brief is written and each of its sessions merges."],
		),
		"",
		"## Scope",
		"",
		"In:",
		`- ${block.handle} ${stripPeriod(block.outcome)}.`,
		"",
		"Out:",
		...siblings,
		...outItems(index),
		"",
		"## Verification",
		"",
		proof ? `${proof.replace(/^- /, "")} ${CHECKERS}`.trim() : CHECKERS,
		"",
		"## Links",
		"",
		planLink(brief?.path ?? path),
	].join("\n");
}

function questionParts(question: Question): {
	readonly ask: string;
	readonly recommended: string;
	readonly rejected: string;
} {
	const text = question.text;
	const marker = (name: string) =>
		new RegExp(
			`\\b${name}\\.\\s+(.+?)(?=\\s(?:Recommended|Rejected|Settles|Blocks|Binds|Decide by|Ticket)\\.\\s|$)`,
		)
			.exec(text)?.[1]
			?.trim() ?? "";
	const ask =
		text.split(
			/\s(?:Recommended|Rejected|Settles|Blocks|Binds|Decide by|Ticket)\.\s/,
		)[0] ?? text;
	return {
		ask: ask.trim(),
		recommended: stripPeriod(marker("Recommended")),
		rejected: stripPeriod(marker("Rejected")),
	};
}

function decisionBody(question: Question, path: string): string {
	const parts = questionParts(question);
	return [
		"## Problem",
		"",
		parts.ask,
		"",
		`Binds. ${question.binds.join(", ")}. Decide by. ${question.decideBy ?? "the next milestone exit"}.`,
		"",
		"## Outcome",
		"",
		`Interim default. ${parts.recommended || "None given"}. Sessions build the default, so an answer is needed only to change it.`,
		"",
		"## Acceptance criteria",
		"",
		checkboxes([
			"The answer is posted as a resolution comment.",
			"The plan cites this issue in a D row.",
		]),
		"",
		"## Scope",
		"",
		"In:",
		"- This question.",
		"",
		"Out:",
		"- The build work that the answer unblocks.",
		"",
		"## Verification",
		"",
		`Other answer and cost. ${parts.rejected || "None given"}. The owner answers in a round, or the interim default stands at the decide-by point.`,
		"",
		"## Links",
		"",
		planLink(path),
	].join("\n");
}

function fence(text: string): string {
	const longest = Math.max(
		2,
		...[...text.matchAll(/`+/g)].map((match) => match[0].length),
	);
	return "`".repeat(longest + 1);
}

export function planCopy(
	text: string,
	path: string,
	home: string,
	target: "linear" | "github",
): string {
	const note =
		home === "repo"
			? `The plan file \`${path}\`. Home is repo, so edit the repo file. This copy is a mirror.`
			: `The plan file \`${path}\`. Home is ${home}, so this copy is the plan. Edit it here.`;
	if (target === "linear") return `${note}\n\n${text.trim()}`;
	const marks = fence(text);
	return `${note}\n\n${marks}markdown astack-plan ${path}\n${text.trim()}\n${marks}`;
}

export function extractCopy(
	body: string | undefined,
): { readonly path: string; readonly text: string } | undefined {
	const clean = withoutBacklink(body);
	const fenced = /^(`{3,})markdown astack-plan (\S+)\n([\s\S]*?)\n\1\s*$/m.exec(
		clean,
	);
	if (fenced) return { path: fenced[2] ?? "", text: `${fenced[3] ?? ""}\n` };
	const header = /^The plan file `([^`]+)`[^\n]*\n\n([\s\S]*)$/.exec(clean);
	return header
		? { path: header[1] ?? "", text: `${(header[2] ?? "").trim()}\n` }
		: undefined;
}

export function setHome(text: string, home: string): string {
	return /^home:.*$/m.test(text)
		? text.replace(/^home:.*$/m, `home: ${home}`)
		: text.replace(/^(tier:.*)$/m, `$1\nhome: ${home}`);
}

function addendumBody(plan: Plan, path: string): string {
	const rows = plan.decisions.rows
		.filter((row) => !row.supersededBy && row.handle.startsWith("D"))
		.map(
			(row) =>
				`- ${row.handle}. ${stripPeriod(row.decision)}. Settled by ${row.settled}.`,
		);
	return [
		"Plan addendum. The ticket text stays as written. This comment lists the decisions of the plan.",
		"",
		...goalLines(plan),
		"",
		...(rows.length > 0 ? rows : ["- No decisions yet."]),
		"",
		planLink(path),
	].join("\n");
}

function sessionUnit(
	set: PlanSet,
	plan: Plan,
	path: string,
	session: Session,
	parent: { readonly id?: string; readonly key?: string },
	milestone: string | undefined,
): ExportUnit {
	const handle = session.handle ?? session.title;
	const lane = laneOf(session);
	return {
		id: `${set.slug}/${handle}`,
		kind: "session",
		handle,
		title: `${handle} ${stripPeriod(session.title)}`,
		body: sessionBody(plan, session, path),
		key: keyOf(session.fields.get("Ticket")?.value),
		parent: parent.id,
		parentKey: parent.key,
		milestone,
		blockedBy: handleList(fieldText(session.fields.get("Depends on"))).map(
			(dep) => `${set.slug}/${dep}`,
		),
		labels: lane === "main" ? [] : [{ group: "Lane", value: lane }],
		target: undefined,
		path,
		state: stateOf(session),
	};
}

function base(
	partial: Pick<ExportUnit, "id" | "kind" | "handle" | "title" | "body"> &
		Partial<ExportUnit>,
): ExportUnit {
	return {
		key: undefined,
		parent: undefined,
		parentKey: undefined,
		milestone: undefined,
		blockedBy: [],
		labels: [],
		target: undefined,
		path: undefined,
		state: undefined,
		...partial,
	};
}

function milestoneName(milestone: Milestone): string {
	return `${milestone.handle ?? ""} ${stripPeriod(milestone.title)}`.trim();
}

export function trackerUnits(set: PlanSet): ExportUnit[] {
	const units = collectUnits(set);
	return tierOf(set.root) === "programme"
		? units
		: units.filter((unit) => unit.kind !== "session");
}

export function collectUnits(set: PlanSet): ExportUnit[] {
	const { root, slug, path } = set;
	const title = root.titles[0]?.text ?? slug;
	if (tierOf(root) !== "programme") {
		const keys = trackerKeys(root);
		const rootKey = keys[0];
		const units: ExportUnit[] = [
			base({
				id: slug,
				kind: "root",
				handle: slug,
				title,
				body: sessionlessRoot(root, path),
				key: rootKey,
				path,
			}),
			base({
				id: `${slug}/decisions`,
				kind: "addendum",
				handle: "decisions",
				title: "Plan addendum",
				body: addendumBody(root, path),
				parent: slug,
				parentKey: rootKey,
				path,
			}),
			base({
				id: `${slug}/copy`,
				kind: "copy",
				handle: "copy",
				title: `${title} (plan)`,
				body: root.text,
				parent: slug,
				parentKey: rootKey,
				path,
			}),
		];
		for (const session of root.sessions)
			if (
				stateOf(session) !== "done" &&
				!keys.includes(keyOf(session.fields.get("Ticket")?.value) ?? "")
			)
				units.push(
					sessionUnit(
						set,
						root,
						path,
						session,
						{ id: slug, key: rootKey },
						undefined,
					),
				);
		return units;
	}
	const target = root.milestones
		.map((milestone) =>
			stripPeriod(milestone.fields.get("Target")?.value ?? ""),
		)
		.filter(Boolean)
		.sort()
		.at(-1);
	const units: ExportUnit[] = [
		base({
			id: slug,
			kind: "root",
			handle: slug,
			title,
			body: programmeRoot(root, path),
			key: trackerKeys(root)[0],
			target,
			path,
		}),
		base({
			id: `${slug}/copy`,
			kind: "copy",
			handle: "copy",
			title: `${title} (plan index)`,
			body: root.text,
			parent: slug,
			path,
		}),
	];
	for (const milestone of root.milestones) {
		if (stateOf(milestone) === "exited") continue;
		units.push(
			base({
				id: `${slug}/${milestone.handle ?? ""}`,
				kind: "milestone",
				handle: milestone.handle ?? "",
				title: milestoneName(milestone),
				body: [
					`Demo. ${fieldText(milestone.fields.get("Demo"))}`,
					`Proof. ${fieldText(milestone.fields.get("Proof")) || "Not set yet."}`,
				].join("\n"),
				key: keyOf(milestone.fields.get("Ticket")?.value),
				target:
					stripPeriod(milestone.fields.get("Target")?.value ?? "") || undefined,
				parent: slug,
				path,
			}),
		);
	}
	const bindings = new Map<string, string[]>();
	root.questions.forEach((question) => {
		if (question.binds.length === 0) return;
		const id = `${slug}/Q${question.number}`;
		for (const bound of question.binds)
			bindings.set(bound, [...(bindings.get(bound) ?? []), id]);
		const decideBy = root.milestones.find(
			(m) => m.handle === question.decideBy,
		);
		units.push(
			base({
				id,
				kind: "decision",
				handle: `Q${question.number}`,
				title: stripPeriod(questionParts(question).ask).slice(0, 120),
				body: decisionBody(question, path),
				key: keyOf(question.ticket),
				parent: slug,
				milestone: decideBy ? milestoneName(decideBy) : undefined,
				labels: [{ group: "Kind", value: "decision" }],
				path,
			}),
		);
	});
	for (const milestone of root.milestones) {
		if (stateOf(milestone) === "exited") continue;
		const name = milestoneName(milestone);
		for (const block of milestone.blocks) {
			if (block.brief === "done") continue;
			const brief = set.briefs.get(block.handle);
			const container = trackerKeys(root)[0];
			const spec = brief
				? trackerKeys(brief.plan).find((key) => key !== container)
				: undefined;
			units.push(
				base({
					id: `${slug}/${block.handle}`,
					kind: "block",
					handle: block.handle,
					title: `${block.handle} ${stripPeriod(block.outcome)}`,
					body: blockBody(root, milestone, block, brief, path),
					key: keyOf(block.ticket),
					parent: slug,
					parentKey: spec,
					milestone: name,
					blockedBy: [
						...block.dependsOn.map((dep) => `${slug}/${dep}`),
						...(bindings.get(block.handle) ?? []),
					],
					labels: block.lane ? [{ group: "Lane", value: block.lane }] : [],
					path: brief?.path ?? path,
				}),
			);
			if (!brief) continue;
			units.push(
				base({
					id: `${slug}/${block.handle}/copy`,
					kind: "copy",
					handle: `${block.handle}/copy`,
					title: `${block.handle} brief`,
					body: brief.plan.text,
					parent: `${slug}/${block.handle}`,
					path: brief.path,
				}),
			);
			for (const session of brief.plan.sessions) {
				if (stateOf(session) === "done") continue;
				const unit = sessionUnit(
					set,
					brief.plan,
					brief.path,
					session,
					{ id: `${slug}/${block.handle}` },
					name,
				);
				units.push({
					...unit,
					blockedBy: [
						...unit.blockedBy,
						...(bindings.get(session.handle ?? "") ?? []),
					],
				});
			}
		}
	}
	return units;
}

function sessionlessRoot(plan: Plan, path: string): string {
	return [
		"## Problem",
		"",
		...goalLines(plan),
		"",
		"## Outcome",
		"",
		fieldText(plan.goal.get("Done when")),
		"",
		"## Acceptance criteria",
		"",
		checkboxes(
			plan.sessions.map((session) =>
				`${session.handle ?? ""} merges. ${stripPeriod(session.title)}.`.trim(),
			),
		),
		"",
		"## Scope",
		"",
		sectionText(sectionByTitle(plan, "Scope")),
		"",
		"## Verification",
		"",
		sectionText(sectionByTitle(plan, "Proof")) || CHECKERS,
		"",
		"## Links",
		"",
		planLink(path),
	].join("\n");
}

function programmeRoot(plan: Plan, path: string): string {
	const milestones = plan.milestones
		.filter((milestone) => stateOf(milestone) !== "exited")
		.map(
			(milestone) =>
				`${milestoneName(milestone)}. ${fieldText(milestone.fields.get("Demo"))}`,
		);
	return [
		"## Problem",
		"",
		...goalLines(plan),
		"",
		"## Outcome",
		"",
		fieldText(plan.goal.get("Done when")),
		"",
		"## Acceptance criteria",
		"",
		checkboxes(milestones),
		"",
		"## Scope",
		"",
		sectionText(sectionByTitle(plan, "Scope")),
		"",
		"## Verification",
		"",
		"Each milestone exit runs its Proof command and posts one update.",
		"",
		"## Links",
		"",
		planLink(path),
	].join("\n");
}
