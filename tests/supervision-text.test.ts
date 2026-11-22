import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODE = join(import.meta.dir, "../marketplace/plugins/astack/skills/mode");
const read = (path: string) => readFileSync(join(MODE, path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");
const sentences = (text: string) =>
	text
		.split(/\n+|(?<=[.?!])\s+/)
		.map((sentence) => flat(sentence).trim())
		.filter((sentence) => sentence !== "");

const STORE_GREP =
	/preferences\.md|units\.tsv|ledger\.tsv|frontier\.json|status\.md|overview\.md|gates\.md|decisions\.tsv|inbox\/|standing.order|pstack store/i;
const ORCHESTRATE_WORD_CAP = 400;

describe("Orchestrate supervises through the plan, the board and the tracker", () => {
	const orchestrate = read("playbooks/orchestrate.md");

	test("[control:or-no-store] Orchestrate names no store file and stays within its word cap, and paths-and-wakeups keeps no programme state in the store", () => {
		expect(
			orchestrate.split("\n").filter((line) => STORE_GREP.test(line)),
		).toEqual([]);
		expect(
			orchestrate.split(/\s+/).filter((word) => word !== "").length,
		).toBeLessThanOrEqual(ORCHESTRATE_WORD_CAP);
		const state = sentences(read("references/paths-and-wakeups.md")).filter(
			(sentence) => /programme state/i.test(sentence),
		);
		expect(
			state.filter((sentence) => /store|local\/state/i.test(sentence)),
		).toEqual([]);
		expect(
			state.some(
				(sentence) =>
					/\bplan\b/.test(sentence) &&
					/astack board/.test(sentence) &&
					/tracker/.test(sentence),
			),
		).toBe(true);
	});

	test.each([
		["reads the state with astack board", /astack board <index>/],
		["drains the open PRs first", /open PRs first/i],
		["starts at most 5 sessions", /at most 5 sessions/i],
		["starts each session with astack session start", /astack session start/],
		["writes each brief that the board names", /brief that the board names/i],
		["treats a completion as a queue event", /completion as a queue event/i],
		["keeps one writer for each branch", /one writer for each branch/i],
		["never resumes an agent to probe it", /never resume an agent to probe/i],
		["abandons a unit after two retries", /after two retries/i],
		["keeps the escalation list", /#### Escalation/],
		["sends a finding outside the frontier to the drafts", /astack plan draft/],
		["holds a verdict for one PR head", /verdict holds for one PR head/i],
		["takes green CI only as input", /green CI is only input/i],
	])("[control:or-kept-rules] Orchestrate %s", (_, rule) => {
		expect(flat(orchestrate)).toMatch(rule);
	});
});
