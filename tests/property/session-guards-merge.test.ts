import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { runHook } from "../../src/astack/hook/dispatch.ts";
import type { Env, Handler } from "../../src/astack/hook/events.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";
import { processPorts } from "../../src/astack/ports.ts";
import {
	AUTHORITY,
	loadSessionGuards,
	MERGE_START,
	type MergeState,
	merge,
	oneOf,
	orderedPrompts,
	PR_OF,
	prompt,
	promptPayload,
	pullRequest,
	toolPayload,
} from "../astack/session-guards-model.ts";

const MODEL = loadSessionGuards(join(import.meta.dir, "../.."));
const TEMP = mkdtempSync(join(tmpdir(), "astack-model-merge-"));
afterAll(() => rmSync(TEMP, { recursive: true, force: true }));

const WORKING_PROFILE: Readonly<Record<string, object>> = {
	turn: { authority: "turn" },
	standing: { authority: "standing" },
	base: { standingBases: ["main"] },
};

type Model = {
	state: MergeState;
	readonly attended: boolean;
	readonly authority: string;
};

type Real = {
	readonly session: string;
	readonly project: string;
	readonly env: Env;
	readonly guard: Handler;
};

function hook(
	real: Real,
	event: "UserPromptSubmit" | "PreToolUse",
	payload: string,
) {
	return runHook("claude-code", event, payload, real.env, {
		cwd: real.project,
		today: "2026-11-22",
		ports: processPorts,
		handlers: [real.guard],
	});
}

class Prompt implements fc.Command<Model, Real> {
	constructor(
		readonly clauses: readonly string[],
		readonly source: string,
	) {}
	check(): boolean {
		return true;
	}
	run(model: Model, real: Real): void {
		hook(
			real,
			"UserPromptSubmit",
			promptPayload(real.session, real.project, this.clauses, this.source),
		);
		model.state = prompt(
			MODEL,
			model.state,
			this.clauses,
			this.source,
			model.attended,
		);
	}
	toString(): string {
		return `prompt(${this.clauses.join("+")}, ${this.source})`;
	}
}

class EditProfile implements fc.Command<Model, Real> {
	constructor(readonly working: string) {}
	check(): boolean {
		return true;
	}
	run(_model: Model, real: Real): void {
		mkdirSync(join(real.project, ".astack"), { recursive: true });
		writeFileSync(
			join(real.project, ".astack/profile.json"),
			JSON.stringify({ merge: oneOf(WORKING_PROFILE, this.working) }),
		);
	}
	toString(): string {
		return `editProfile(${this.working})`;
	}
}

class Merge implements fc.Command<Model, Real> {
	constructor(readonly n: number) {}
	check(): boolean {
		return true;
	}
	run(model: Model, real: Real): void {
		const { number } = oneOf(PR_OF, String(this.n));
		const passed =
			hook(
				real,
				"PreToolUse",
				toolPayload(real.session, real.project, "Bash", {
					command: `gh pr merge ${number}`,
				}),
			).exit === 0;
		expect(passed).toBe(
			merge(model.state, model.authority, this.n, "gh", false),
		);
	}
	toString(): string {
		return `merge(${this.n})`;
	}
}

const PROMPTS = orderedPrompts(MODEL);

const commands = [
	fc
		.tuple(
			fc.oneof(
				fc.constantFrom(...PROMPTS.filter((clauses) => clauses.length === 1)),
				fc.constantFrom(...PROMPTS.filter((clauses) => clauses.length > 1)),
			),
			fc.constantFrom(...MODEL.sources),
		)
		.map(([clauses, source]) => new Prompt(clauses, source)),
	fc
		.constantFrom(...Object.keys(WORKING_PROFILE))
		.map((working) => new EditProfile(working)),
	fc.constantFrom(...MODEL.prs).map((n) => new Merge(n)),
];

let runs = 0;

describe("the merge guard beside the SessionGuards model", () => {
	test("[control:sg-model-merge] each merge after generated prompts and profile edits gives the verdict of the model", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.constantFrom(...MODEL.baseAuthorities),
				fc.commands(commands, { maxCommands: 6 }),
				(attended, authority, steps) => {
					const id = runs++;
					const project = join(TEMP, `project-${id}`);
					mkdirSync(project, { recursive: true });
					const env: Env = attended
						? { ASTACK_STATE_DIR: join(TEMP, "state") }
						: {
								ASTACK_STATE_DIR: join(TEMP, "state"),
								CLAUDE_CODE_SESSION_ATTENDED: "0",
							};
					const base = oneOf(AUTHORITY, authority);
					const guard = mergeGuard(({ selector }) => {
						const n = MODEL.prs.find(
							(pr) => String(oneOf(PR_OF, String(pr)).number) === selector,
						);
						return n === undefined ? undefined : pullRequest(n, base);
					});
					fc.modelRun(
						() => ({
							model: { state: MERGE_START, attended, authority },
							real: { session: `model-merge-${id}`, project, env, guard },
						}),
						steps,
					);
				},
			),
			{ numRuns: 3000 },
		);
		expect(runs).toBeGreaterThanOrEqual(3000);
	});
});
