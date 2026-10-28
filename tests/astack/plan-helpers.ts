import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Io } from "../../src/astack/cli/io.ts";
import type { Call, WritePlan } from "../../src/astack/plan/export.ts";
import { checkEnv } from "../../src/astack/plan/files.ts";
import {
	type PlanSet,
	planSetFromText,
} from "../../src/astack/plan/planset.ts";
import type { Snapshot, TrackerObject } from "../../src/astack/plan/tracker.ts";
import type { CheckEnv } from "../../src/astack/plan/types.ts";
import { parseBacklink } from "../../src/astack/plan/units.ts";
import { DEFAULT_PLAN_PROFILE } from "../../src/astack/profile.ts";

export const FIXTURES = resolve(import.meta.dir, "../fixtures/plans");
export const REPO = join(FIXTURES, "repo");
export const PRINCIPLES_REFS = resolve(
	import.meta.dir,
	"../../marketplace/plugins/astack/skills/principles/references",
);

export function principles(): ReadonlySet<string> {
	return new Set(
		readdirSync(PRINCIPLES_REFS)
			.filter((name) => name.endsWith(".md"))
			.map((name) => name.slice(0, -".md".length)),
	);
}

export function fixture(path: string): string {
	return readFileSync(join(FIXTURES, path), "utf8");
}

export function fixtureEnv(root: string = REPO): CheckEnv {
	return checkEnv({
		root,
		config: DEFAULT_PLAN_PROFILE,
		slug: "fixture",
		today: "2026-10-16",
		trail: false,
		principles: principles(),
	});
}

export function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

export function commitAll(cwd: string, message: string): void {
	git(cwd, "add", "-A");
	git(
		cwd,
		"-c",
		"user.email=test@example.com",
		"-c",
		"user.name=Test Owner",
		"commit",
		"-qm",
		message,
	);
}

export function freshRepo(dirs: string[]): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-plan-")));
	dirs.push(dir);
	cpSync(REPO, dir, { recursive: true });
	git(dir, "init", "-q");
	git(dir, "config", "user.name", "Test Owner");
	git(dir, "config", "user.email", "test@example.com");
	commitAll(dir, "init");
	return dir;
}

export type Run = { code: number; out: string; err: string };

export function run(
	command: (args: readonly string[], io: Io) => number,
	args: readonly string[],
	cwd: string,
	options: { input?: string; env?: Record<string, string | undefined> } = {},
): Run {
	let out = "";
	let err = "";
	const io: Io = {
		out: (text) => {
			out += text;
		},
		err: (text) => {
			err += text;
		},
		cwd,
		env: options.env ?? {},
		today: "2026-10-16",
		now: new Date("2026-10-16T12:00:00Z"),
		scriptPath: undefined,
		input: () => options.input ?? "",
	};
	const code = command(args, io);
	return { code, out, err };
}

export function setFromRepo(root: string, path: string): PlanSet {
	return planSetFromText(
		path,
		readFileSync(join(root, path), "utf8"),
		(brief) => {
			const file = join(root, brief);
			return existsSync(file) ? readFileSync(file, "utf8") : undefined;
		},
	);
}

function flag(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name);
	return at >= 0 ? argv[at + 1] : undefined;
}

function flags(argv: readonly string[], name: string): string[] {
	return argv.flatMap((arg, i) =>
		arg === name && argv[i + 1] ? [argv[i + 1] ?? ""] : [],
	);
}

function field(argv: readonly string[], name: string): string | undefined {
	const prefix = `${name}=`;
	return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function list(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

export function applyWrites(plan: WritePlan, start: Snapshot): Snapshot {
	const objects = new Map<string, TrackerObject>(
		start.objects.map((object) => [object.key, object]),
	);
	const labels = new Set(start.labels);
	const keys = new Map<string, string>();
	let counter = 900;
	const resolveText = (value: string): string =>
		value.replace(
			/<(key|number):([^>]+)>/g,
			(_, kind: string, unit: string) => {
				const key = keys.get(unit) ?? "";
				return kind === "number" ? key.replace(/^#/, "") : key;
			},
		);
	const resolveAll = (values: readonly string[]) => values.map(resolveText);
	const blank = (key: string, type: TrackerObject["type"]): TrackerObject => ({
		key,
		type,
		title: "",
		body: undefined,
		state: "todo",
		parent: undefined,
		milestone: undefined,
		blockedBy: [],
		labels: [],
		assignee: undefined,
		claimedAt: undefined,
		targetDate: undefined,
		on: undefined,
		pr: undefined,
		link: undefined,
	});
	const save = (object: TrackerObject): void => {
		objects.set(object.key, {
			...object,
			link: parseBacklink(object.body)?.id,
		});
	};
	for (const write of plan.writes) {
		const call: Call = write.call;
		if (call.via === "repo") continue;
		const github = call.via === "gh";
		const newKey = (prefix: string) => `${prefix}${++counter}`;
		if (call.via === "linear") {
			const args = call.args;
			const id = text(args.id);
			const current = id ? objects.get(id) : undefined;
			const type: TrackerObject["type"] =
				call.tool === "save_project"
					? "project"
					: call.tool === "save_milestone"
						? "milestone"
						: call.tool === "save_document"
							? "document"
							: call.tool === "save_comment"
								? "comment"
								: "issue";
			if (call.tool === "save_issue_label") {
				labels.add(text(args.name) ?? "");
				continue;
			}
			const key =
				current?.key ?? newKey(type === "issue" ? "ABC-" : `${type}-`);
			const base = current ?? blank(key, type);
			save({
				...base,
				title: text(args.title) ?? text(args.name) ?? base.title,
				body:
					text(args.description) ??
					text(args.content) ??
					text(args.body) ??
					base.body,
				parent:
					args.parentId !== undefined
						? resolveText(text(args.parentId) ?? "")
						: base.parent,
				milestone: text(args.milestone) ?? base.milestone,
				blockedBy: [...base.blockedBy, ...resolveAll(list(args.blockedBy))],
				labels: [...base.labels, ...list(args.labels), ...list(args.addLabels)],
				targetDate: text(args.targetDate) ?? base.targetDate,
				on: text(args.issueId)
					? resolveText(text(args.issueId) ?? "")
					: base.on,
			});
			if (write.records) keys.set(write.records, key);
			continue;
		}
		const argv = resolveAll(call.argv);
		const [, noun, verb] = argv;
		if (noun === "label") {
			labels.add(argv[3] ?? "");
			continue;
		}
		if (noun === "api") {
			const patch = argv.includes("PATCH");
			const path = argv.find((arg) => arg.startsWith("repos/")) ?? "";
			const number = /\/(\d+)$/.exec(path)?.[1];
			const comment = path.includes("/issues/comments/");
			const key = patch ? (number ?? "") : newKey("");
			const current = objects.get(patch ? key : "");
			const base = current ?? blank(key, comment ? "comment" : "milestone");
			save({
				...base,
				title: field(argv, "title") ?? base.title,
				body: comment
					? (call.stdin ?? base.body)
					: (field(argv, "description") ?? base.body),
				targetDate: field(argv, "due_on")?.slice(0, 10) ?? base.targetDate,
			});
			if (write.records) keys.set(write.records, key);
			continue;
		}
		if (noun === "issue" && verb === "create") {
			const key = newKey("#");
			save({
				...blank(key, "issue"),
				title: flag(argv, "--title") ?? "",
				body: call.stdin,
				parent: flag(argv, "--parent")
					? `#${flag(argv, "--parent")}`
					: undefined,
				milestone: flag(argv, "--milestone"),
				blockedBy: (flag(argv, "--blocked-by") ?? "")
					.split(",")
					.filter(Boolean)
					.map((n) => `#${n}`),
				labels: flags(argv, "--label"),
			});
			if (write.records) keys.set(write.records, key);
			continue;
		}
		if (noun === "issue" && verb === "edit") {
			const key = `#${argv[3]}`;
			const base = objects.get(key) ?? blank(key, "issue");
			save({
				...base,
				title: flag(argv, "--title") ?? base.title,
				body: argv.includes("--body-file") ? call.stdin : base.body,
				parent: flag(argv, "--parent")
					? `#${flag(argv, "--parent")}`
					: base.parent,
				milestone: flag(argv, "--milestone") ?? base.milestone,
				blockedBy: [
					...base.blockedBy,
					...(flag(argv, "--add-blocked-by") ?? "")
						.split(",")
						.filter(Boolean)
						.map((n) => `#${n}`),
				],
				labels: [...base.labels, ...flags(argv, "--add-label")],
			});
			continue;
		}
		if (noun === "issue" && verb === "comment") {
			const key = newKey("");
			save({ ...blank(key, "comment"), body: call.stdin, on: `#${argv[3]}` });
			if (write.records) keys.set(write.records, key);
		}
		if (github && write.records && !keys.has(write.records))
			keys.set(write.records, "");
	}
	return {
		target: plan.target,
		objects: [...objects.values()],
		labels: [...labels],
		prs: start.prs,
	};
}
