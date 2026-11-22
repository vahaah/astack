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

const section = (text: string, heading: string) => {
	const start = text.indexOf(`\n## ${heading}\n`);
	if (start === -1) return "";
	const end = text.indexOf("\n## ", start + 1);
	return flat(text.slice(start, end === -1 ? undefined : end));
};
const rowFor = (text: string, words: string) =>
	text
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.find((line) => (line.split("|")[1] ?? "").includes(words)) ?? "";
const STATUS_WORDS = ["status", "what waits on me"];
const STARTS_NO_WORK = /only reads?\b.*starts no work/i;

describe("a status ask lists each waiting item and starts no work", () => {
	test("[control:cu-list] the card row, the routes row and the Catch up part send the status words to Catch up, which only reads and starts no work", () => {
		const card = rowFor(
			readFileSync(join(import.meta.dir, "../rules/astack.md"), "utf8"),
			"what waits on me",
		);
		const route = rowFor(read("references/routes.md"), "what waits on me");
		for (const row of [card, route]) {
			for (const words of STATUS_WORDS) expect(row).toContain(`"${words}"`);
			expect(row).toMatch(/resume\.md/);
			expect(row).toMatch(/Catch up/);
			expect(row).toMatch(STARTS_NO_WORK);
		}
		const catchUp = section(read("references/resume.md"), "Catch up");
		for (const words of [...STATUS_WORDS, "where are we"])
			expect(catchUp).toContain(`"${words}"`);
		expect(catchUp).toMatch(STARTS_NO_WORK);
		expect(catchUp).toMatch(/astack board <index>/);
		expect(catchUp).toMatch(/each waiting item one line/i);
		expect(catchUp).toMatch(/failed read .* its own line/i);
		expect(catchUp).toMatch(/\bunknown\b/);
		expect(catchUp).toMatch(/nothing waits/i);
	});

	test("[control:cu-checkpoint] a checkpoint reply names each waiting item up to 3, and past 3 gives their count and the status pointer, also in Orchestrate", () => {
		const orchestrate = read("playbooks/orchestrate.md");
		const reply = sentences(
			orchestrate.slice(orchestrate.indexOf("\n#### Reply\n")),
		);
		expect(
			reply.some(
				(sentence) =>
					/checkpoint/i.test(sentence) && /`SKILL\.md`/.test(sentence),
			),
		).toBe(true);
		expect(
			reply.filter(
				(sentence) =>
					/each waiting item/i.test(sentence) && !/status ask/i.test(sentence),
			),
		).toEqual([]);
		expect(
			reply.some(
				(sentence) => /status ask/i.test(sentence) && /Catch up/.test(sentence),
			),
		).toBe(true);
		const skill = read("SKILL.md");
		const replies = skill.slice(skill.indexOf("\n## Replies\n"));
		const checkpoint = flat(
			replies.split(/\n\s*\n/).find((part) => /checkpoint/i.test(part)) ?? "",
		);
		expect(checkpoint).not.toMatch(/count of open questions/i);
		expect(checkpoint).toMatch(/each waiting item/i);
		expect(
			sentences(checkpoint).some(
				(sentence) =>
					/past 3/i.test(sentence) &&
					/count/i.test(sentence) &&
					/"status"/.test(sentence),
			),
		).toBe(true);
	});
});
