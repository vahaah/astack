import { err, ok, type Result } from "../result.ts";
import { tierOf } from "./check.ts";
import { frontmatterValue } from "./parse.ts";
import type { PlanSet } from "./planset.ts";
import {
	objectFor,
	type Snapshot,
	type Target,
	type TrackerObject,
} from "./tracker.ts";
import {
	backlink,
	type ExportUnit,
	extractCopy,
	type LabelRef,
	planCopy,
	setHome,
	trackerUnits,
	withoutBacklink,
} from "./units.ts";

export type Call =
	| {
			readonly via: "linear";
			readonly tool: string;
			readonly args: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly via: "gh";
			readonly argv: readonly string[];
			readonly stdin: string | undefined;
	  }
	| {
			readonly via: "repo";
			readonly action: "write" | "delete";
			readonly path: string;
			readonly content: string | undefined;
	  };

export type Write = {
	readonly id: string;
	readonly action: "create" | "update" | "file";
	readonly unit: string;
	readonly summary: string;
	readonly call: Call;
	readonly records: string | undefined;
};

export type WritePlanKind = "export" | "move" | "import";

export type WritePlan = {
	readonly kind: WritePlanKind;
	readonly target: Target;
	readonly plan: string;
	readonly slug: string;
	readonly sha: string;
	readonly writes: readonly Write[];
	readonly keys: readonly string[];
	readonly notes: readonly string[];
};

export type ExportOptions = {
	readonly target: Target;
	readonly sha: string;
	readonly team: string | undefined;
	readonly repo: string | undefined;
	readonly initiative: string | undefined;
	readonly move: boolean;
	readonly edited?: ReadonlySet<string>;
	readonly overwrite?: boolean;
};

const LINEAR_KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const GITHUB_KEY = /^#\d+$/;

export function keyProblems(
	units: readonly { readonly key?: string; readonly parentKey?: string }[],
	target: Target,
): string[] {
	const keys = new Set(
		units
			.flatMap((unit) => [unit.key, unit.parentKey])
			.filter((key): key is string => key !== undefined),
	);
	return [...keys].flatMap((key) => {
		if (target === "github" && LINEAR_KEY.test(key))
			return [
				`${key} is a Linear key, but the export goes to GitHub. Give the plan a #<n> key, or export to Linear`,
			];
		if (target === "linear" && GITHUB_KEY.test(key))
			return [
				`${key} is a GitHub key, but the export goes to Linear. Give the plan a Linear key, or export to GitHub`,
			];
		return [];
	});
}

const PLACEHOLDER = (unit: string) => `<key:${unit}>`;
const NUMBER_PLACEHOLDER = (unit: string) => `<number:${unit}>`;

function normalize(text: string): string {
	return text
		.replace(/^\s*\*\s+/gm, "- ")
		.replace(/\s+/g, " ")
		.trim();
}

function same(a: string | undefined, b: string | undefined): boolean {
	return normalize(a ?? "") === normalize(b ?? "");
}

function labelName(target: Target, label: LabelRef): string {
	return target === "linear"
		? `${label.group}/${label.value}`
		: `${label.group.toLowerCase()}:${label.value}`;
}

function topoOrder(units: readonly ExportUnit[]): Result<ExportUnit[], string> {
	const byId = new Map(units.map((unit) => [unit.id, unit]));
	const placed = new Set<string>();
	const order: ExportUnit[] = [];
	const visiting = new Set<string>();
	const visit = (unit: ExportUnit): string | undefined => {
		if (placed.has(unit.id)) return undefined;
		if (visiting.has(unit.id))
			return `the plan has a dependency cycle through ${unit.handle}`;
		visiting.add(unit.id);
		for (const dep of [
			...(unit.parent ? [unit.parent] : []),
			...unit.blockedBy,
		]) {
			const other = byId.get(dep);
			const problem = other ? visit(other) : undefined;
			if (problem) return problem;
		}
		visiting.delete(unit.id);
		placed.add(unit.id);
		order.push(unit);
		return undefined;
	};
	for (const unit of units) {
		const problem = visit(unit);
		if (problem) return err(problem);
	}
	return ok(order);
}

type Builder = {
	readonly options: ExportOptions;
	readonly snapshot: Snapshot;
	readonly set: PlanSet;
	readonly units: ReadonlyMap<string, ExportUnit>;
	readonly writes: Write[];
	readonly keys: string[];
	readonly notes: string[];
};

function existing(
	builder: Builder,
	unit: ExportUnit,
): TrackerObject | undefined {
	return objectFor(builder.snapshot, unit.id, unit.key);
}

function keyFor(builder: Builder, id: string): string | undefined {
	const unit = builder.units.get(id);
	if (!unit) return undefined;
	return unit.key ?? existing(builder, unit)?.key;
}

function ref(builder: Builder, id: string, number: boolean): string {
	const key = keyFor(builder, id);
	if (key) return number ? key.replace(/^#/, "") : key;
	return number ? NUMBER_PLACEHOLDER(id) : PLACEHOLDER(id);
}

function parentRef(
	builder: Builder,
	unit: ExportUnit,
	number: boolean,
): string | undefined {
	if (unit.parent && builder.units.has(unit.parent)) {
		const parent = builder.units.get(unit.parent);
		if (
			parent?.kind === "root" &&
			tierOf(builder.set.root) === "programme" &&
			builder.options.target === "linear"
		)
			return unit.parentKey;
		return ref(builder, unit.parent, number);
	}
	return unit.parentKey
		? number
			? unit.parentKey.replace(/^#/, "")
			: unit.parentKey
		: undefined;
}

const OVERWRITE_MARK = ", overwrites an edit that a person made in the tracker";

function push(
	builder: Builder,
	unit: string,
	action: Write["action"],
	summary: string,
	call: Call,
	records: boolean,
): void {
	const overwrites =
		action === "update" && builder.options.edited?.has(unit) === true;
	builder.writes.push({
		id: `w${builder.writes.length + 1}`,
		action,
		unit,
		summary: overwrites ? `${summary}${OVERWRITE_MARK}` : summary,
		call,
		records: records ? unit : undefined,
	});
	if (records) builder.keys.push(unit);
}

function withLink(builder: Builder, unit: ExportUnit, body: string): string {
	return `${body.trim()}\n\n${backlink(unit.id, builder.options.sha)}`;
}

function repoFlag(builder: Builder): string[] {
	return builder.options.repo ? ["-R", builder.options.repo] : [];
}

function gh(builder: Builder, argv: readonly string[], stdin?: string): Call {
	if (argv[0] !== "api")
		return { via: "gh", argv: ["gh", ...argv, ...repoFlag(builder)], stdin };
	const repo = builder.options.repo;
	const routed = repo
		? argv.map((arg) => arg.replace("repos/{owner}/{repo}/", `repos/${repo}/`))
		: argv;
	return { via: "gh", argv: ["gh", ...routed], stdin };
}

function linear(tool: string, args: Record<string, unknown>): Call {
	return { via: "linear", tool, args };
}

function copyBody(builder: Builder, unit: ExportUnit): string {
	const home = builder.options.move ? builder.options.target : "repo";
	return planCopy(
		setHome(unit.body, home),
		unit.path ?? "",
		home,
		builder.options.target,
	);
}

function issueType(unit: ExportUnit): string {
	return unit.kind === "session" || unit.kind === "decision"
		? "Task"
		: "Feature";
}

function emitIssue(builder: Builder, unit: ExportUnit): void {
	const { target } = builder.options;
	const object = existing(builder, unit);
	const body = withLink(builder, unit, unit.body);
	const labels = unit.labels.map((label) => labelName(target, label));
	const blockedBy = unit.blockedBy.map((id) =>
		ref(builder, id, target === "github"),
	);
	const parent = parentRef(builder, unit, target === "github");
	const programme = tierOf(builder.set.root) === "programme";
	if (unit.kind === "root" && !programme && unit.key) return;
	if (!object) {
		if (unit.key)
			builder.notes.push(
				`${unit.handle} has key ${unit.key}, which the snapshot does not hold; fetch it so export can compare its fields`,
			);
		if (target === "linear") {
			push(
				builder,
				unit.id,
				"create",
				`create issue ${unit.title}`,
				linear("save_issue", {
					team: builder.options.team,
					title: unit.title,
					description: body,
					...(programme
						? { project: ref(builder, builder.set.slug, false) }
						: {}),
					...(parent ? { parentId: parent } : {}),
					...(unit.milestone ? { milestone: unit.milestone } : {}),
					...(blockedBy.length > 0 ? { blockedBy } : {}),
					...(labels.length > 0 ? { labels } : {}),
				}),
				true,
			);
			return;
		}
		const extra =
			unit.kind === "root" && programme ? ["--label", "kind:programme"] : [];
		push(
			builder,
			unit.id,
			"create",
			`create issue ${unit.title}`,
			gh(
				builder,
				[
					"issue",
					"create",
					"--title",
					unit.title,
					"--type",
					issueType(unit),
					"--body-file",
					"-",
					...(parent ? ["--parent", parent] : []),
					...(unit.milestone ? ["--milestone", unit.milestone] : []),
					...(blockedBy.length > 0
						? ["--blocked-by", blockedBy.join(",")]
						: []),
					...labels.flatMap((label) => ["--label", label]),
					...extra,
				],
				body,
			),
			true,
		);
		return;
	}
	const titleChanged = object.title !== unit.title;
	const bodyChanged = !same(withoutBacklink(object.body), unit.body);
	const have = new Set(object.blockedBy.map((key) => key.replace(/^#/, "")));
	const missingBlockers = blockedBy.filter(
		(key) => !have.has(key.replace(/^#/, "")),
	);
	const missingLabels = labels.filter(
		(label) => !object.labels.includes(label),
	);
	const parentChanged =
		parent !== undefined &&
		object.parent?.replace(/^#/, "") !== parent.replace(/^#/, "");
	const milestoneChanged =
		unit.milestone !== undefined && object.milestone !== unit.milestone;
	if (
		!titleChanged &&
		!bodyChanged &&
		missingBlockers.length === 0 &&
		missingLabels.length === 0 &&
		!parentChanged &&
		!milestoneChanged
	)
		return;
	const changed = [
		titleChanged ? "title" : "",
		bodyChanged ? "body" : "",
		parentChanged ? "parent" : "",
		milestoneChanged ? "milestone" : "",
		missingBlockers.length > 0 ? "blocked-by" : "",
		missingLabels.length > 0 ? "labels" : "",
	].filter(Boolean);
	const summary = `update ${object.key} ${unit.title} (${changed.join(", ")})`;
	if (target === "linear") {
		push(
			builder,
			unit.id,
			"update",
			summary,
			linear("save_issue", {
				id: object.key,
				...(titleChanged ? { title: unit.title } : {}),
				...(bodyChanged ? { description: body } : {}),
				...(parentChanged ? { parentId: parent } : {}),
				...(milestoneChanged ? { milestone: unit.milestone } : {}),
				...(missingBlockers.length > 0 ? { blockedBy: missingBlockers } : {}),
				...(missingLabels.length > 0 ? { addLabels: missingLabels } : {}),
			}),
			false,
		);
		return;
	}
	push(
		builder,
		unit.id,
		"update",
		summary,
		gh(
			builder,
			[
				"issue",
				"edit",
				object.key.replace(/^#/, ""),
				...(titleChanged ? ["--title", unit.title] : []),
				...(bodyChanged ? ["--body-file", "-"] : []),
				...(parentChanged && parent ? ["--parent", parent] : []),
				...(milestoneChanged && unit.milestone
					? ["--milestone", unit.milestone]
					: []),
				...(missingBlockers.length > 0
					? ["--add-blocked-by", missingBlockers.join(",")]
					: []),
				...missingLabels.flatMap((label) => ["--add-label", label]),
			],
			bodyChanged ? body : undefined,
		),
		false,
	);
}

function emitProject(builder: Builder, unit: ExportUnit): void {
	const object = existing(builder, unit);
	const summary = (
		unit.body.split("\n").find((line) => line && !line.startsWith("#")) ??
		unit.title
	).slice(0, 255);
	const description = withLink(builder, unit, unit.body);
	if (!object) {
		push(
			builder,
			unit.id,
			"create",
			`create project ${unit.title}`,
			linear("save_project", {
				name: unit.title,
				summary,
				description,
				addTeams: [builder.options.team],
				...(unit.target ? { targetDate: unit.target } : {}),
				...(builder.options.initiative
					? { addInitiatives: [builder.options.initiative] }
					: {}),
			}),
			true,
		);
		return;
	}
	const titleChanged = object.title !== unit.title;
	const bodyChanged = !same(withoutBacklink(object.body), unit.body);
	const targetChanged =
		unit.target !== undefined &&
		object.targetDate?.slice(0, 10) !== unit.target;
	if (!titleChanged && !bodyChanged && !targetChanged) return;
	push(
		builder,
		unit.id,
		"update",
		`update project ${unit.title}`,
		linear("save_project", {
			id: object.key,
			...(titleChanged ? { name: unit.title } : {}),
			...(bodyChanged ? { description, summary } : {}),
			...(targetChanged ? { targetDate: unit.target } : {}),
		}),
		false,
	);
}

function emitMilestone(builder: Builder, unit: ExportUnit): void {
	const { target } = builder.options;
	const object = existing(builder, unit);
	const description = withLink(builder, unit, unit.body);
	if (!object) {
		if (target === "linear")
			push(
				builder,
				unit.id,
				"create",
				`create milestone ${unit.title}`,
				linear("save_milestone", {
					project: ref(builder, builder.set.slug, false),
					name: unit.title,
					description,
					...(unit.target ? { targetDate: unit.target } : {}),
				}),
				true,
			);
		else
			push(
				builder,
				unit.id,
				"create",
				`create milestone ${unit.title}`,
				gh(builder, [
					"api",
					"repos/{owner}/{repo}/milestones",
					"-f",
					`title=${unit.title}`,
					"-f",
					`description=${description}`,
					...(unit.target ? ["-f", `due_on=${unit.target}T00:00:00Z`] : []),
				]),
				true,
			);
		return;
	}
	const titleChanged = object.title !== unit.title;
	const bodyChanged = !same(withoutBacklink(object.body), unit.body);
	const dateChanged =
		unit.target !== undefined &&
		object.targetDate?.slice(0, 10) !== unit.target;
	if (!titleChanged && !bodyChanged && !dateChanged) return;
	if (target === "linear")
		push(
			builder,
			unit.id,
			"update",
			`update milestone ${unit.title}`,
			linear("save_milestone", {
				project: ref(builder, builder.set.slug, false),
				id: object.key,
				...(titleChanged ? { name: unit.title } : {}),
				...(bodyChanged ? { description } : {}),
				...(dateChanged ? { targetDate: unit.target } : {}),
			}),
			false,
		);
	else
		push(
			builder,
			unit.id,
			"update",
			`update milestone ${unit.title}`,
			gh(builder, [
				"api",
				"-X",
				"PATCH",
				`repos/{owner}/{repo}/milestones/${object.key.replace(/^#/, "")}`,
				...(titleChanged ? ["-f", `title=${unit.title}`] : []),
				...(bodyChanged ? ["-f", `description=${description}`] : []),
				...(dateChanged ? ["-f", `due_on=${unit.target}T00:00:00Z`] : []),
			]),
			false,
		);
}

function emitText(builder: Builder, unit: ExportUnit, text: string): void {
	const { target } = builder.options;
	const object = existing(builder, unit);
	const body = withLink(builder, unit, text);
	const parent = unit.parent
		? ref(builder, unit.parent, target === "github")
		: unit.parentKey;
	const programme = tierOf(builder.set.root) === "programme";
	const asDocument = target === "linear" && unit.kind === "copy";
	if (object && same(withoutBacklink(object.body), text)) return;
	if (asDocument) {
		const owner = programme
			? { project: ref(builder, builder.set.slug, false) }
			: { issue: parent };
		push(
			builder,
			unit.id,
			object ? "update" : "create",
			`${object ? "update" : "create"} document ${unit.title}`,
			linear(
				"save_document",
				object
					? { id: object.key, title: unit.title, content: body }
					: { ...owner, title: unit.title, content: body },
			),
			!object,
		);
		return;
	}
	if (!parent) {
		builder.notes.push(
			`${unit.handle} needs an issue to comment on; give the plan a tracker key first`,
		);
		return;
	}
	if (target === "linear") {
		push(
			builder,
			unit.id,
			object ? "update" : "create",
			`${object ? "update" : "create"} comment ${unit.title}`,
			linear(
				"save_comment",
				object ? { id: object.key, body } : { issueId: parent, body },
			),
			!object,
		);
		return;
	}
	push(
		builder,
		unit.id,
		object ? "update" : "create",
		`${object ? "update" : "create"} comment ${unit.title}`,
		object
			? gh(
					builder,
					[
						"api",
						"-X",
						"PATCH",
						`repos/{owner}/{repo}/issues/comments/${object.key}`,
						"-F",
						"body=@-",
					],
					body,
				)
			: gh(
					builder,
					["issue", "comment", parent.replace(/^#/, ""), "--body-file", "-"],
					body,
				),
		!object,
	);
}

function emitLabels(builder: Builder, units: readonly ExportUnit[]): void {
	const { target } = builder.options;
	const have = new Set(builder.snapshot.labels);
	const wanted = new Map<string, LabelRef>();
	for (const unit of units)
		for (const label of unit.labels)
			wanted.set(labelName(target, label), label);
	if (target === "github" && tierOf(builder.set.root) === "programme")
		wanted.set("kind:programme", { group: "Kind", value: "programme" });
	const groups = new Set<string>();
	for (const [name, label] of wanted) {
		if (have.has(name)) continue;
		if (target === "github") {
			push(
				builder,
				`label:${name}`,
				"create",
				`create label ${name}`,
				gh(builder, ["label", "create", name]),
				false,
			);
			continue;
		}
		if (!groups.has(label.group) && !have.has(label.group)) {
			groups.add(label.group);
			push(
				builder,
				`label:${label.group}`,
				"create",
				`create label group ${label.group}`,
				linear("save_issue_label", {
					name: label.group,
					isGroup: true,
					groupType: "singleSelect",
				}),
				false,
			);
		}
		push(
			builder,
			`label:${name}`,
			"create",
			`create label ${name}`,
			linear("save_issue_label", { name, parent: label.group }),
			false,
		);
	}
}

const KIND_RANK: Readonly<Record<ExportUnit["kind"], number>> = {
	root: 0,
	milestone: 1,
	decision: 2,
	block: 3,
	session: 4,
	copy: 5,
	addendum: 6,
};

export function exportPlan(
	set: PlanSet,
	snapshot: Snapshot,
	options: ExportOptions,
): Result<WritePlan, readonly string[]> {
	const problems: string[] = [];
	const home = frontmatterValue(set.root, "home") ?? "repo";
	if (home !== "repo")
		problems.push(
			`home is ${home}; import the plan before you export it again`,
		);
	const programme = tierOf(set.root) === "programme";
	const units = trackerUnits(set).filter(
		(unit) => unit.kind !== "copy" || programme || options.move,
	);
	const ordered = topoOrder(units);
	if (!ordered.ok) problems.push(ordered.error);
	const creates = units.some(
		(unit) =>
			(unit.kind === "session" ||
				unit.kind === "block" ||
				unit.kind === "decision" ||
				(unit.kind === "root" && !unit.key)) &&
			!objectFor(snapshot, unit.id, unit.key),
	);
	if (options.target === "linear" && !options.team && (creates || programme))
		problems.push(
			"a Linear export that creates issues or a project needs --team <name>",
		);
	problems.push(...keyProblems(units, options.target));
	if (problems.length > 0 || !ordered.ok) return err(problems);
	const builder: Builder = {
		options,
		snapshot,
		set,
		units: new Map(units.map((unit) => [unit.id, unit])),
		writes: [],
		keys: [],
		notes: [],
	};
	emitLabels(builder, units);
	const position = new Map(ordered.value.map((unit, i) => [unit.id, i]));
	const sorted = [...ordered.value].sort(
		(a, b) =>
			KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
			(position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
	);
	for (const unit of sorted) {
		switch (unit.kind) {
			case "root":
				if (programme && options.target === "linear")
					emitProject(builder, unit);
				else emitIssue(builder, unit);
				break;
			case "milestone":
				emitMilestone(builder, unit);
				break;
			case "block":
			case "session":
			case "decision":
				emitIssue(builder, unit);
				break;
			case "copy":
				emitText(builder, unit, copyBody(builder, unit));
				break;
			case "addendum":
				emitText(builder, unit, unit.body);
				break;
		}
	}
	if (options.move)
		for (const path of [
			set.path,
			...[...set.briefs.values()].map((brief) => brief.path),
		])
			builder.writes.push({
				id: `w${builder.writes.length + 1}`,
				action: "file",
				unit: set.slug,
				summary: `delete ${path} in one commit, after every tracker write succeeds`,
				call: { via: "repo", action: "delete", path, content: undefined },
				records: undefined,
			});
	const overwrites = builder.writes.filter((write) =>
		write.summary.endsWith(OVERWRITE_MARK),
	);
	if (overwrites.length > 0 && options.overwrite !== true)
		return err([
			...overwrites.map((write) => `${write.id} ${write.summary}`),
			"run astack plan drift first, pull each edit into the plan, or run export again with --overwrite",
		]);
	return ok({
		kind: options.move ? "move" : "export",
		target: options.target,
		plan: set.path,
		slug: set.slug,
		sha: options.sha,
		writes: builder.writes,
		keys: builder.keys,
		notes: builder.notes,
	});
}

export function importPlan(
	slug: string,
	snapshot: Snapshot,
	target: Target,
	sha: string,
): Result<WritePlan, readonly string[]> {
	const copies = snapshot.objects.filter(
		(object) =>
			object.link === `${slug}/copy` ||
			new RegExp(`^${slug}/B\\d{2,}[a-z]?/copy$`).test(object.link ?? ""),
	);
	const root = copies.find((object) => object.link === `${slug}/copy`);
	if (!root)
		return err([
			`the snapshot holds no plan copy for ${slug}; export or move the plan first`,
		]);
	const writes: Write[] = [];
	const problems: string[] = [];
	for (const object of [root, ...copies.filter((copy) => copy !== root)]) {
		const copy = extractCopy(object.body);
		if (!copy) {
			problems.push(
				`${object.key} does not hold a plan copy that import can read`,
			);
			continue;
		}
		const text = setHome(copy.text, "repo");
		writes.push({
			id: `w${writes.length + 1}`,
			action: "file",
			unit: object.link ?? slug,
			summary: `write ${copy.path} with home repo`,
			call: { via: "repo", action: "write", path: copy.path, content: text },
			records: undefined,
		});
		const body = `${planCopy(text, copy.path, "repo", target)}\n\n${backlink(object.link ?? slug, sha)}`;
		const call: Call =
			object.type === "document"
				? {
						via: "linear",
						tool: "save_document",
						args: { id: object.key, content: body },
					}
				: target === "linear"
					? {
							via: "linear",
							tool: "save_comment",
							args: { id: object.key, body },
						}
					: {
							via: "gh",
							argv: [
								"gh",
								"api",
								"-X",
								"PATCH",
								`repos/{owner}/{repo}/issues/comments/${object.key}`,
								"-F",
								"body=@-",
							],
							stdin: body,
						};
		writes.push({
			id: `w${writes.length + 1}`,
			action: "update",
			unit: object.link ?? slug,
			summary: `mark ${object.key} as a mirror, home repo`,
			call,
			records: undefined,
		});
	}
	if (problems.length > 0) return err(problems);
	return ok({
		kind: "import",
		target,
		plan: extractCopy(root.body)?.path ?? "",
		slug,
		sha,
		writes,
		keys: [],
		notes: [
			"Commit the written files in one commit, then run astack check-plan on them.",
		],
	});
}

export function writePlanText(plan: WritePlan): string {
	const lines = [
		`${plan.kind} ${plan.slug} to ${plan.target}: ${plan.writes.length} write${plan.writes.length === 1 ? "" : "s"} (dry run; nothing ran)`,
		...plan.writes.map(
			(write) =>
				`${write.id} ${write.summary}${write.records ? `, records <key:${write.records}>` : ""}`,
		),
		...plan.notes.map((note) => `note: ${note}`),
	];
	if (plan.keys.length > 0)
		lines.push(
			`After the writes, pipe {"<unit>": "<key>"} for ${plan.keys.length} units into astack plan keys ${plan.plan}.`,
		);
	return `${lines.join("\n")}\n`;
}
