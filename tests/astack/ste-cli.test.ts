import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Io } from "../../src/astack/cli/io.ts";
import { main } from "../../src/astack/cli/main.ts";

let repo = "";

function capture(cwd: string): {
	io: Io;
	out: () => string;
	err: () => string;
} {
	let out = "";
	let err = "";
	return {
		io: {
			out: (text) => {
				out += text;
			},
			err: (text) => {
				err += text;
			},
			cwd,
			env: {},
			today: "2026-10-16",
			now: new Date("2026-10-16T09:30:00Z"),
			scriptPath: undefined,
		},
		out: () => out,
		err: () => err,
	};
}

beforeAll(() => {
	repo = mkdtempSync(join(tmpdir(), "astack-ste-cli-"));
	mkdirSync(join(repo, ".git"));
	mkdirSync(join(repo, ".astack"));
	mkdirSync(join(repo, "docs"));
	writeFileSync(
		join(repo, ".astack/profile.json"),
		JSON.stringify({ ste: { mode: "deny", technicalVerbs: ["check"] } }),
	);
	writeFileSync(
		join(repo, "docs/bad.md"),
		"# Notes\n\nIt doesn't run; the cache is cold.\n",
	);
	writeFileSync(
		join(repo, "docs/good.md"),
		"# Notes\n\nCheck the logs before you merge.\n",
	);
	writeFileSync(join(repo, "LICENSE.md"), "It doesn't matter here.\n");
	writeFileSync(join(repo, "old.md"), "It doesn't run.\n");
	writeFileSync(join(repo, "new.md"), "It doesn't run. It is fast.\n");
	writeFileSync(
		join(repo, "other.json"),
		JSON.stringify({ ste: { technicalNouns: ["Ensure Plus"] } }),
	);
	writeFileSync(join(repo, "plan.md"), "Ensure Plus is the name.\n");
	mkdirSync(join(repo, "records/adr"), { recursive: true });
	writeFileSync(
		join(repo, "fields.json"),
		JSON.stringify({
			ste: { mode: "deny", headerFields: ["records/adr/*.md"] },
		}),
	);
	const header =
		"# 0001 — A record\n\n- **Amends:** 0002 — its D1, for one path; 0003 — its D2.\n";
	writeFileSync(join(repo, "records/adr/0001-a.md"), header);
	writeFileSync(join(repo, "records/notes.md"), header);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("astack check-ste", () => {
	test("a deny finding exits 1 and names the line, rule and fix", () => {
		const run = capture(repo);
		expect(main(["check-ste", "docs/bad.md"], run.io)).toBe(1);
		expect(run.out()).toContain(
			'deny L3 contraction: Write "does not", not "doesn\'t".',
		);
		expect(run.out()).toContain("deny L3 semicolon:");
		expect(run.out()).toContain("2 deny, 0 advise, 2 sentences");
	});

	test("the repo profile gives technical verbs, and check ste is the same command", () => {
		const run = capture(repo);
		expect(main(["check", "ste", "docs/good.md"], run.io)).toBe(0);
		expect(run.out()).toContain("0 deny, 0 advise");
	});

	test("--mode advise never exits 1, and --json prints the findings", () => {
		const advise = capture(repo);
		expect(
			main(["check-ste", "docs/bad.md", "--mode", "advise"], advise.io),
		).toBe(0);
		expect(advise.out()).toContain("advise L3 contraction");
		const json = capture(repo);
		expect(main(["check-ste", "docs/bad.md", "--json"], json.io)).toBe(1);
		const parsed: unknown = JSON.parse(json.out());
		expect(parsed).toMatchObject({
			deny: 2,
			advise: 0,
			sentences: 2,
			skipped: "none",
		});
	});

	test("an excluded file is skipped, and --old drops old sentences", () => {
		const skipped = capture(repo);
		expect(main(["check-ste", "LICENSE.md"], skipped.io)).toBe(0);
		expect(skipped.out()).toContain(
			"skipped: the STE excludes cover LICENSE.md",
		);
		const diff = capture(repo);
		expect(main(["check-ste", "new.md", "--old", "old.md"], diff.io)).toBe(0);
		expect(diff.out()).toContain("0 deny");
	});

	test("--profile reads another profile, and --surface commit strips the prefix", () => {
		const profile = capture(repo);
		expect(
			main(["check-ste", "plan.md", "--profile", "other.json"], profile.io),
		).toBe(0);
		const plain = capture(repo);
		expect(main(["check-ste", "plan.md"], plain.io)).toBe(1);
		writeFileSync(
			join(repo, "msg.txt"),
			"fix: the cache\n\nThe cache isn't warm.\n\nCo-Authored-By: A <a@example.com>\n",
		);
		const commit = capture(repo);
		expect(
			main(["check-ste", "msg.txt", "--surface", "commit"], commit.io),
		).toBe(1);
		expect(commit.out()).toContain("deny L3 contraction");
		writeFileSync(join(repo, "merge.txt"), "Merge branch 'main'\n");
		const merge = capture(repo);
		expect(
			main(["check-ste", "merge.txt", "--surface", "commit"], merge.io),
		).toBe(0);
		expect(merge.out()).toContain("skipped: git makes this commit message");
	});

	test("the profile's headerFields globs let the header field lines of a record take a long dash", () => {
		const record = capture(repo);
		const other = capture(repo);
		expect({
			record: main(
				["check-ste", "records/adr/0001-a.md", "--profile", "fields.json"],
				record.io,
			),
			other: main(
				["check-ste", "records/notes.md", "--profile", "fields.json"],
				other.io,
			),
		}).toEqual({ record: 0, other: 1 });
		expect(other.out()).toContain("dash");
	});

	test("usage errors exit 2", () => {
		for (const args of [
			["check-ste"],
			["check-ste", "a.md", "b.md"],
			["check-ste", "a.md", "--mode", "strict"],
			["check-ste", "a.md", "--surface", "email"],
			["check-ste", "a.md", "--wat"],
			["check-ste", "missing.md"],
			["check-ste", "docs/bad.md", "--profile", "missing.json"],
		]) {
			const run = capture(repo);
			expect(main(args, run.io)).toBe(2);
			expect(run.err()).toContain("astack check-ste:");
		}
	});
});
