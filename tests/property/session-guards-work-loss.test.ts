import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import type { Context } from "../../src/astack/hook/events.ts";
import { handler as destructive } from "../../src/astack/hook/handlers/destructive.ts";
import {
	after,
	type Change,
	type Command,
	codeLost,
	loadSessionGuards,
} from "../astack/session-guards-model.ts";

const MODEL = loadSessionGuards(join(import.meta.dir, "../.."));
const TEMP = mkdtempSync(join(tmpdir(), "astack-model-work-loss-"));
afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

const GIT_ENV = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};

function git(dir: string, ...args: string[]) {
	return spawnSync("git", args, { cwd: dir, encoding: "utf8", env: GIT_ENV });
}

function pathOf({ kind, place }: Change): string {
	if (place === "named") return "notes.txt";
	return place === "folder" ? `src/${kind}.txt` : `${kind}.txt`;
}

function placeOf(path: string): string {
	if (path === "notes.txt") return "named";
	return path.startsWith("src/") ? "folder" : "other";
}

function kindOf(index: string, worktree: string): string {
	if (index === "?") return "untracked";
	if (worktree === " ") return "staged";
	return index === " " ? "unstaged" : "both";
}

function template(withNotes: boolean): string {
	const dir = join(TEMP, withNotes ? "template-notes" : "template");
	mkdirSync(join(dir, "src"), { recursive: true });
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "T");
	const tracked = MODEL.kinds.filter((kind) => kind !== "untracked");
	const files = [
		"keep.txt",
		"src/keep.txt",
		...(withNotes ? ["notes.txt"] : []),
		...tracked.flatMap((kind) => [`${kind}.txt`, `src/${kind}.txt`]),
	];
	for (const file of files) writeFileSync(join(dir, file), "base\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "base");
	return dir;
}

const TEMPLATES = { notes: template(true), plain: template(false) };

function startRepo(tree: readonly Change[], id: number): string {
	const untrackedNotes = tree.some(
		(change) => change.place === "named" && change.kind === "untracked",
	);
	const dir = join(TEMP, `repo-${id}`);
	cpSync(untrackedNotes ? TEMPLATES.plain : TEMPLATES.notes, dir, {
		recursive: true,
	});
	for (const change of tree) {
		const path = pathOf(change);
		writeFileSync(join(dir, path), "staged\n");
		if (change.kind === "staged" || change.kind === "both")
			git(dir, "add", path);
		if (change.kind === "both") writeFileSync(join(dir, path), "work\n");
	}
	return dir;
}

function statusTree(dir: string): readonly Change[] {
	const status = git(dir, "status", "--porcelain=v1", "-uall", "-z");
	return status.stdout
		.split("\0")
		.filter((entry) => entry.length > 3)
		.map((entry) => ({
			kind: kindOf(entry.charAt(0), entry.charAt(1)),
			place: placeOf(entry.slice(3)),
		}));
}

function sorted(tree: readonly Change[]): readonly string[] {
	return tree.map(({ kind, place }) => `${place}:${kind}`).sort();
}

type Model = { tree: readonly Change[] };
type Real = { readonly dir: string; readonly context: Context };

class GitRun implements fc.Command<Model, Real> {
	constructor(readonly command: Command) {}
	check(): boolean {
		return true;
	}
	run(model: Model, real: Real): void {
		const denied =
			destructive.run(
				{
					kind: "shell",
					command: `git ${this.command.name}`,
					cwd: real.dir,
				},
				real.context,
			).kind === "deny";
		expect(denied).toBe(codeLost(this.command, model.tree).length > 0);
		if (denied) return;
		git(real.dir, ...this.command.name.split(" "));
		model.tree = after(this.command, model.tree);
		expect(sorted(statusTree(real.dir))).toEqual(sorted(model.tree));
	}
	toString(): string {
		return `git ${this.command.name}`;
	}
}

const startTree: fc.Arbitrary<readonly Change[]> = fc
	.record({
		named: fc.option(fc.constantFrom(...MODEL.kinds), { nil: undefined }),
		folder: fc.subarray([...MODEL.kinds]),
		other: fc.subarray([...MODEL.kinds]),
	})
	.map(({ named, folder, other }) => [
		...(named === undefined ? [] : [{ kind: named, place: "named" }]),
		...folder.map((kind) => ({ kind, place: "folder" })),
		...other.map((kind) => ({ kind, place: "other" })),
	]);

let runs = 0;

describe("the destructive guard and real git beside the SessionGuards model", () => {
	test("[control:sg-model-work-loss] each verdict equals CodeLost, and each tree after an allowed command equals After", () => {
		expect([...MODEL.places].sort()).toEqual(["folder", "named", "other"]);
		fc.assert(
			fc.property(
				startTree,
				fc.commands(
					[fc.constantFrom(...MODEL.commands).map((cmd) => new GitRun(cmd))],
					{ maxCommands: 4 },
				),
				(tree, steps) => {
					const id = runs++;
					const dir = startRepo(tree, id);
					expect(sorted(statusTree(dir))).toEqual(sorted(tree));
					const context: Context = {
						tool: "claude-code",
						event: "PreToolUse",
						cwd: dir,
						projectDir: dir,
						env: { ASTACK_STATE_DIR: join(TEMP, "state") },
						today: "2026-11-22",
						session: `model-work-loss-${id}`,
					};
					fc.modelRun(
						() => ({ model: { tree }, real: { dir, context } }),
						steps,
					);
				},
			),
			{ numRuns: 40 },
		);
		expect(runs).toBeGreaterThanOrEqual(40);
	});
});
