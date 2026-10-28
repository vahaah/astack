import { daysBetween, tierOf } from "./check.ts";
import { frontmatterValue, stateOf, stripPeriod } from "./parse.ts";
import type { PlanSet } from "./planset.ts";
import {
	objectFor,
	type Snapshot,
	type Target,
	type TrackerObject,
} from "./tracker.ts";
import {
	collectUnits,
	type ExportUnit,
	parseBacklink,
	planCopy,
	setHome,
	trackerUnits,
	withoutBacklink,
} from "./units.ts";

export const DRIFT_KINDS = [
	"not-exported",
	"not-in-snapshot",
	"stale-export",
	"edited-in-tracker",
	"changed",
	"orphan",
	"unmapped-child",
	"edge-mismatch",
	"milestone-mismatch",
	"done-with-open-pr",
	"block-not-in-review",
	"past-target",
	"stale-claim",
] as const;
export type DriftKind = (typeof DRIFT_KINDS)[number];

export type Drift = {
	readonly kind: DriftKind;
	readonly unit: string;
	readonly key: string | undefined;
	readonly message: string;
};

export type DriftOptions = {
	readonly target: Target;
	readonly today: string;
	readonly now: Date;
	readonly renderAt: (sha: string) => PlanSet | undefined;
};

const CLAIM_HOURS = 24;

function normalize(text: string): string {
	return text
		.replace(/^\s*\*\s+/gm, "- ")
		.replace(/\s+/g, " ")
		.trim();
}

function expectedText(unit: ExportUnit, target: Target, home: string): string {
	return unit.kind === "copy"
		? planCopy(setHome(unit.body, home), unit.path ?? "", home, target)
		: unit.body;
}

function textDrift(
	unit: ExportUnit,
	object: TrackerObject,
	options: DriftOptions,
	home: string,
): Drift | undefined {
	if (unit.kind === "root" && unit.key && object.type === "issue")
		return undefined;
	const now = expectedText(unit, options.target, home);
	const titled = unit.kind !== "copy" && unit.kind !== "addendum";
	const same =
		normalize(withoutBacklink(object.body)) === normalize(now) &&
		(!titled || object.title === unit.title);
	if (same) return undefined;
	const sha = parseBacklink(object.body)?.sha;
	const old = sha ? options.renderAt(sha) : undefined;
	const before = old
		? collectUnits(old).find((other) => other.id === unit.id)
		: undefined;
	if (!before)
		return {
			kind: "changed",
			unit: unit.id,
			key: object.key,
			message: `${unit.handle} differs from the plan, and the export commit ${sha ?? "is unknown"} cannot be read; compare both by hand`,
		};
	const matchesOld =
		normalize(withoutBacklink(object.body)) ===
			normalize(expectedText(before, options.target, home)) &&
		(!titled || object.title === before.title);
	return matchesOld
		? {
				kind: "stale-export",
				unit: unit.id,
				key: object.key,
				message: `${unit.handle}: the plan changed since export ${sha}; run astack plan export again`,
			}
		: {
				kind: "edited-in-tracker",
				unit: unit.id,
				key: object.key,
				message: `${unit.handle}: a person edited ${object.key} in the tracker; ask the owner to pull the edit into the plan as a superseding decision, or to overwrite it with export`,
			};
}

function keyOf(
	snapshot: Snapshot,
	units: ReadonlyMap<string, ExportUnit>,
	id: string,
): string | undefined {
	const unit = units.get(id);
	return unit
		? (unit.key ?? objectFor(snapshot, unit.id, unit.key)?.key)
		: undefined;
}

function bare(key: string): string {
	return key.replace(/^#/, "");
}

export function driftReport(
	set: PlanSet,
	snapshot: Snapshot,
	options: DriftOptions,
): Drift[] {
	const drifts: Drift[] = [];
	const programme = tierOf(set.root) === "programme";
	const home = frontmatterValue(set.root, "home") ?? "repo";
	const units = trackerUnits(set).filter(
		(unit) =>
			unit.kind !== "copy" ||
			programme ||
			snapshot.objects.some((object) => object.link === unit.id),
	);
	const byId = new Map(units.map((unit) => [unit.id, unit]));
	const mapped = new Map<string, TrackerObject>();
	for (const unit of units) {
		const object = objectFor(snapshot, unit.id, unit.key);
		if (!object) {
			if (unit.kind === "root" && unit.key && !programme) continue;
			drifts.push(
				unit.key
					? {
							kind: "not-in-snapshot",
							unit: unit.id,
							key: unit.key,
							message: `${unit.handle} has key ${unit.key}, which the snapshot does not hold; fetch it`,
						}
					: {
							kind: "not-exported",
							unit: unit.id,
							key: undefined,
							message: `${unit.handle} has no tracker object; run astack plan export`,
						},
			);
			continue;
		}
		mapped.set(unit.id, object);
		const text = textDrift(unit, object, options, home);
		if (text) drifts.push(text);
		const expected = unit.blockedBy
			.flatMap((id) => keyOf(snapshot, byId, id) ?? [])
			.map(bare);
		const actual = object.blockedBy.map(bare);
		const missing = expected.filter((key) => !actual.includes(key));
		const extra = actual.filter((key) => !expected.includes(key));
		if (
			unit.kind !== "copy" &&
			unit.kind !== "addendum" &&
			(missing.length > 0 || extra.length > 0)
		)
			drifts.push({
				kind: "edge-mismatch",
				unit: unit.id,
				key: object.key,
				message: `${unit.handle}: blocked-by differs from Depends on${missing.length > 0 ? `, missing ${missing.join(", ")}` : ""}${extra.length > 0 ? `, extra ${extra.join(", ")}` : ""}`,
			});
		if (
			unit.milestone &&
			object.milestone &&
			object.milestone !== unit.milestone
		)
			drifts.push({
				kind: "milestone-mismatch",
				unit: unit.id,
				key: object.key,
				message: `${unit.handle}: the tracker milestone is ${object.milestone}, the plan says ${unit.milestone}`,
			});
		if (
			object.state === "done" &&
			(object.pr?.state === "open" || object.pr?.state === "draft")
		)
			drifts.push({
				kind: "done-with-open-pr",
				unit: unit.id,
				key: object.key,
				message: `${object.key} is done while PR #${object.pr.number} is still open`,
			});
		if (
			unit.kind === "session" &&
			object.state === "in-progress" &&
			!object.pr &&
			object.claimedAt &&
			(options.now.getTime() - Date.parse(object.claimedAt)) / 3_600_000 >
				CLAIM_HOURS
		)
			drifts.push({
				kind: "stale-claim",
				unit: unit.id,
				key: object.key,
				message: `${object.key} was claimed more than ${CLAIM_HOURS} hours ago and has no PR; ask the owner before a takeover`,
			});
	}
	for (const unit of units) {
		if (unit.kind !== "block") continue;
		const sessions = units.filter(
			(other) => other.kind === "session" && other.parent === unit.id,
		);
		const block = mapped.get(unit.id);
		const merged =
			sessions.length > 0 &&
			sessions.every((session) => {
				const state = mapped.get(session.id)?.state;
				return state === "done" || session.state === "done";
			});
		if (
			merged &&
			block &&
			block.state !== "in-review" &&
			block.state !== "done"
		)
			drifts.push({
				kind: "block-not-in-review",
				unit: unit.id,
				key: block.key,
				message: `every session of ${unit.handle} merged, but ${block.key} is not In Review`,
			});
	}
	for (const milestone of set.root.milestones) {
		const target = stripPeriod(milestone.fields.get("Target")?.value ?? "");
		const age = target ? daysBetween(target, options.today) : undefined;
		if (stateOf(milestone) !== "exited" && age !== undefined && age > 0)
			drifts.push({
				kind: "past-target",
				unit: `${set.slug}/${milestone.handle ?? ""}`,
				key: undefined,
				message: `${milestone.handle ?? milestone.title} passed its target ${target} ${age} days ago; move the date or cut scope in a round`,
			});
	}
	const ids = new Set(units.map((unit) => unit.id));
	const parents = new Set(
		[...mapped.entries()]
			.filter(([id]) => {
				const kind = byId.get(id)?.kind;
				return kind === "block" || kind === "root";
			})
			.map(([, object]) => bare(object.key)),
	);
	const rootKey = byId.get(set.slug)?.key;
	if (rootKey) parents.add(bare(rootKey));
	for (const object of snapshot.objects) {
		const link = object.link;
		if (
			link &&
			(link === set.slug || link.startsWith(`${set.slug}/`)) &&
			!ids.has(link)
		)
			drifts.push({
				kind: "orphan",
				unit: link,
				key: object.key,
				message: `${object.key} points at ${link}, which the plan no longer holds; propose to close it as superseded`,
			});
		if (
			!link &&
			object.type === "issue" &&
			object.parent &&
			parents.has(bare(object.parent))
		)
			drifts.push({
				kind: "unmapped-child",
				unit: object.parent,
				key: object.key,
				message: `${object.key} "${object.title}" sits under ${object.parent} with no plan unit; ask whether it is hidden work in the same PR or a session amendment`,
			});
	}
	return drifts;
}

export function driftText(slug: string, drifts: readonly Drift[]): string {
	if (drifts.length === 0)
		return `${slug}: no drift between the plan and the tracker\n`;
	return `${drifts.map((drift) => `${drift.kind} ${drift.key ?? "-"} ${drift.message}`).join("\n")}\n${drifts.length} drift finding${drifts.length === 1 ? "" : "s"} for ${slug}. Drift never resolves text a person wrote.\n`;
}
