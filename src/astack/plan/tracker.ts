import { err, ok, type Result } from "../result.ts";
import { parseBacklink } from "./units.ts";

export const TARGETS = ["linear", "github"] as const;
export type Target = (typeof TARGETS)[number];

export const OBJECT_TYPES = [
	"project",
	"document",
	"milestone",
	"issue",
	"comment",
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const TRACKER_STATES = [
	"todo",
	"in-progress",
	"in-review",
	"done",
	"canceled",
] as const;
export type TrackerState = (typeof TRACKER_STATES)[number];

export type PrState = "draft" | "open" | "merged" | "closed";

export type PullRequest = {
	readonly number: number;
	readonly state: PrState;
	readonly url: string | undefined;
	readonly branch: string | undefined;
};

export type TrackerObject = {
	readonly key: string;
	readonly type: ObjectType;
	readonly title: string;
	readonly body: string | undefined;
	readonly state: TrackerState | undefined;
	readonly parent: string | undefined;
	readonly milestone: string | undefined;
	readonly blockedBy: readonly string[];
	readonly labels: readonly string[];
	readonly assignee: string | undefined;
	readonly claimedAt: string | undefined;
	readonly targetDate: string | undefined;
	readonly on: string | undefined;
	readonly pr: PullRequest | undefined;
	readonly link: string | undefined;
};

export type Snapshot = {
	readonly target: Target | undefined;
	readonly objects: readonly TrackerObject[];
	readonly labels: readonly string[];
	readonly prs: readonly PullRequest[];
};

export const EMPTY_SNAPSHOT: Snapshot = {
	target: undefined,
	objects: [],
	labels: [],
	prs: [],
};

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

function keyText(value: unknown): string | undefined {
	return typeof value === "number" ? `#${value}` : text(value);
}

function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.flatMap((item) => {
				const key = keyText(item);
				return key ? [key] : [];
			})
		: [];
}

function oneOf<T extends string>(
	values: readonly T[],
	value: unknown,
): T | undefined {
	return values.find((candidate) => candidate === value);
}

const STATE_WORDS: ReadonlyMap<string, TrackerState> = new Map([
	["backlog", "todo"],
	["todo", "todo"],
	["open", "todo"],
	["unstarted", "todo"],
	["triage", "todo"],
	["in progress", "in-progress"],
	["in-progress", "in-progress"],
	["started", "in-progress"],
	["in review", "in-review"],
	["in-review", "in-review"],
	["done", "done"],
	["completed", "done"],
	["closed", "done"],
	["canceled", "canceled"],
	["cancelled", "canceled"],
	["duplicate", "canceled"],
	["not_planned", "canceled"],
]);

export function trackerState(value: unknown): TrackerState | undefined {
	const word = text(value)?.toLowerCase().replace(/_/g, " ");
	return word
		? (STATE_WORDS.get(word) ?? STATE_WORDS.get(word.replace(/ /g, "_")))
		: undefined;
}

function pullRequest(value: unknown): PullRequest | undefined {
	if (!isFields(value) || typeof value.number !== "number") return undefined;
	const raw = text(value.state)?.toLowerCase();
	const state =
		value.isDraft === true || value.draft === true
			? "draft"
			: (oneOf(["draft", "open", "merged", "closed"] as const, raw) ?? "open");
	return {
		number: value.number,
		state,
		url: text(value.url),
		branch: text(value.branch) ?? text(value.headRefName),
	};
}

function trackerObject(
	value: unknown,
	at: number,
): Result<TrackerObject, string> {
	if (!isFields(value)) return err(`objects[${at}] is not an object`);
	const key =
		keyText(value.key) ??
		keyText(value.identifier) ??
		keyText(value.number) ??
		keyText(value.id);
	if (!key) return err(`objects[${at}] has no key`);
	const type = oneOf(OBJECT_TYPES, value.type) ?? "issue";
	const body =
		text(value.body) ?? text(value.description) ?? text(value.content);
	return ok({
		key,
		type,
		title: text(value.title) ?? text(value.name) ?? "",
		body,
		state: trackerState(value.state ?? value.status),
		parent: keyText(value.parent) ?? keyText(value.parentId),
		milestone: text(value.milestone),
		blockedBy: strings(value.blockedBy),
		labels: strings(value.labels),
		assignee: text(value.assignee),
		claimedAt: text(value.claimedAt) ?? text(value.startedAt),
		targetDate:
			text(value.targetDate) ?? text(value.dueOn) ?? text(value.due_on),
		on: keyText(value.on) ?? keyText(value.issueId),
		pr: pullRequest(value.pr),
		link: text(value.link) ?? parseBacklink(body)?.id,
	});
}

export function parseSnapshot(
	raw: string,
): Result<Snapshot, readonly string[]> {
	if (raw.trim() === "") return ok(EMPTY_SNAPSHOT);
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		return err([`tracker JSON does not parse: ${String(error)}`]);
	}
	const root = Array.isArray(parsed) ? { objects: parsed } : parsed;
	if (!isFields(root)) return err(["tracker JSON is an object or an array"]);
	const problems: string[] = [];
	const objects: TrackerObject[] = [];
	const list = Array.isArray(root.objects) ? root.objects : [];
	list.forEach((item, at) => {
		const result = trackerObject(item, at);
		if (result.ok) objects.push(result.value);
		else problems.push(result.error);
	});
	if (problems.length > 0) return err(problems);
	return ok({
		target: oneOf(TARGETS, root.target),
		objects,
		labels: strings(root.labels),
		prs: Array.isArray(root.prs)
			? root.prs.flatMap((item) => pullRequest(item) ?? [])
			: [],
	});
}

export function objectFor(
	snapshot: Snapshot,
	unitId: string,
	key: string | undefined,
): TrackerObject | undefined {
	return (
		snapshot.objects.find((object) => object.link === unitId) ??
		(key ? snapshot.objects.find((object) => object.key === key) : undefined)
	);
}
