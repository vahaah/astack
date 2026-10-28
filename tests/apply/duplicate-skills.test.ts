import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { builtFlowSkills } from "../../scripts/apply.ts";
import {
	duplicateReportLines,
	findDuplicateSkills,
	flowSupersedes,
	parseSkillsTxt,
	removalCommands,
	type UserSkillEntry,
} from "../../scripts/lib/duplicate-skills.ts";

const root = join(import.meta.dir, "../..");
const home = "/home/dev";
const skills = `${home}/.claude/skills`;
const agents = `${home}/.agents/skills`;
const shown = (path: string) =>
	path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;

function link(name: string): UserSkillEntry {
	return {
		name,
		path: `${skills}/${name}`,
		kind: "symlink",
		target: `${agents}/${name}`,
	};
}

const lock = {
	version: 3,
	skills: {
		grilling: { source: "mattpocock/skills" },
		tdd: { source: "mattpocock/skills" },
		prototype: { source: "someone/skills" },
		"setup-matt-pocock-skills": { source: "mattpocock/skills" },
	},
};

const skillsTxt = [
	"# header line that mentions mattpocock/skills grilling",
	"mattpocock/skills grilling",
	"mattpocock/skills setup-matt-pocock-skills",
	"mattpocock/skills tdd",
	"other/skills tdd",
	"someone/skills#v2 prototype",
	"anthropics/claude-code Agent Development",
	"",
].join("\n");

describe("flowSupersedes", () => {
	test("covers every flow-origin skill that the marketplace ships", () => {
		const shipped = builtFlowSkills(join(root, "marketplace"));
		if (!shipped.ok) throw new Error(shipped.error);
		const candidates = new Set(Object.values(flowSupersedes).flat());
		for (const name of shipped.value) {
			expect(candidates.has(name)).toBe(true);
		}
	});
});

describe("parseSkillsTxt", () => {
	test("skips comments and blanks, strips refs, and keeps names with spaces", () => {
		expect(parseSkillsTxt(skillsTxt)).toEqual([
			{
				line: 2,
				text: "mattpocock/skills grilling",
				source: "mattpocock/skills",
				name: "grilling",
			},
			{
				line: 3,
				text: "mattpocock/skills setup-matt-pocock-skills",
				source: "mattpocock/skills",
				name: "setup-matt-pocock-skills",
			},
			{
				line: 4,
				text: "mattpocock/skills tdd",
				source: "mattpocock/skills",
				name: "tdd",
			},
			{
				line: 5,
				text: "other/skills tdd",
				source: "other/skills",
				name: "tdd",
			},
			{
				line: 6,
				text: "someone/skills#v2 prototype",
				source: "someone/skills",
				name: "prototype",
			},
			{
				line: 7,
				text: "anthropics/claude-code Agent Development",
				source: "anthropics/claude-code",
				name: "Agent Development",
			},
		]);
	});
});

describe("findDuplicateSkills", () => {
	test("ignores user skills that astack does not ship", () => {
		expect(
			findDuplicateSkills({
				entries: [link("frontend-design")],
				lock,
				skillsTxt,
			}),
		).toEqual([]);
	});

	test("marks a same-upstream skill as superseded and matches its skills.txt line by source", () => {
		const [tdd] = findDuplicateSkills({
			entries: [link("tdd")],
			lock,
			skillsTxt,
		});
		expect(tdd).toMatchObject({
			name: "tdd",
			source: "mattpocock/skills",
			flowSkill: "astack:tdd",
			verdict: "superseded",
			skillsTxt: [{ line: 4, text: "mattpocock/skills tdd" }],
		});
	});

	test("marks a different skill with an astack name as a name collision only", () => {
		const [prototype] = findDuplicateSkills({
			entries: [link("prototype")],
			lock,
			skillsTxt,
		});
		expect(prototype?.verdict).toBe("name-only");
		expect(prototype?.skillsTxt).toEqual([
			{ line: 6, text: "someone/skills#v2 prototype" },
		]);
	});

	test("a skill with no lock entry is never called superseded", () => {
		const [research] = findDuplicateSkills({
			entries: [
				{ name: "research", path: `${skills}/research`, kind: "directory" },
			],
			lock,
		});
		expect(research?.verdict).toBe("name-only");
		expect(research?.source).toBeUndefined();
	});

	test("maps setup-matt-pocock-skills to the name the built astack plugin ships", () => {
		const legacy = "setup-matt-pocock-skills";
		const entries = [link(legacy)];
		expect(findDuplicateSkills({ entries, lock })[0]?.flowSkill).toBe(
			"astack:setup",
		);
		expect(
			findDuplicateSkills({
				entries,
				lock,
				flowSkills: [legacy],
			})[0]?.flowSkill,
		).toBe(`astack:${legacy}`);
	});

	test("maps a folded grilling skill to the kept astack name", () => {
		const [folded] = findDuplicateSkills({
			entries: [link("grill-me")],
			lock: { skills: { "grill-me": { source: "mattpocock/skills" } } },
		});
		expect(folded).toMatchObject({
			flowSkill: "astack:grilling",
			verdict: "superseded",
		});
	});

	test("a skill the built astack plugin lacks is not superseded", () => {
		const [grilling] = findDuplicateSkills({
			entries: [link("grilling")],
			lock,
			flowSkills: ["tdd"],
		});
		expect(grilling?.verdict).toBe("not-in-flow");
	});
});

describe("removalCommands", () => {
	test("removes managed skills through the skills CLI and links with rm", () => {
		const found = findDuplicateSkills({
			entries: [link("grilling"), link("tdd")],
			lock,
		});
		expect(removalCommands(found, shown)).toEqual({
			everywhere: ["npx skills remove --global -y grilling tdd"],
			claudeOnly: ["rm ~/.claude/skills/grilling ~/.claude/skills/tdd"],
		});
	});

	test("removes an unmanaged directory by path and quotes odd paths", () => {
		const found = findDuplicateSkills({
			entries: [{ name: "teach", path: "/odd dir/teach", kind: "directory" }],
			lock,
		});
		expect(removalCommands(found, shown)).toEqual({
			everywhere: ["rm -r '/odd dir/teach'"],
			claudeOnly: [],
		});
	});
});

describe("removalCommands quoting", () => {
	test("keeps ~ outside the quotes so the shell still expands it", () => {
		const found = findDuplicateSkills({
			entries: [
				{ name: "teach", path: `${home}/odd dir/teach`, kind: "symlink" },
			],
			lock,
		});
		expect(removalCommands(found, shown).claudeOnly).toEqual([
			"rm ~/'odd dir/teach'",
		]);
	});
});

describe("duplicateReportLines", () => {
	test("says it removes nothing, groups by verdict and lists skills.txt lines", () => {
		const found = findDuplicateSkills({
			entries: [link("grilling"), link("prototype")],
			lock,
			skillsTxt,
		});
		const lines = duplicateReportLines({
			skills: found,
			shown,
			skillsTxtPath: "~/config/claude/skills.txt",
			flowBuilt: false,
		});
		const text = lines.join("\n");
		expect(lines[0]).toBe("Report only. Apply never removes a user skill.");
		expect(text).toContain("The astack plugin is not built yet");
		expect(text).toContain(
			"- ~/.claude/skills/grilling -> ~/.agents/skills/grilling, from mattpocock/skills; astack ships /astack:grilling",
		);
		expect(text).toContain("  $ npx skills remove --global -y grilling\n");
		expect(text).toContain("  $ npx skills remove --global -y prototype\n");
		expect(text).toContain(
			"Either way, delete these lines from ~/config/claude/skills.txt, or its bootstrap installs them again:",
		);
		expect(text).toContain("  2: mattpocock/skills grilling");
		expect(text).toContain("  6: someone/skills#v2 prototype");
		expect(text.indexOf("grilling")).toBeLessThan(
			text.indexOf("from another or an unknown source"),
		);
		expect(lines.at(-1)).not.toBe("");
	});

	test("deduplicates managed skill names and skills.txt lines across profiles", () => {
		const found = findDuplicateSkills({
			entries: [
				link("grilling"),
				{
					name: "grilling",
					path: `${home}/.claude-b/skills/grilling`,
					kind: "symlink",
					target: `${agents}/grilling`,
				},
			],
			lock,
			skillsTxt,
		});
		const lines = duplicateReportLines({
			skills: found,
			shown,
			skillsTxtPath: "~/config/claude/skills.txt",
			flowBuilt: true,
		});
		expect(lines.filter((line) => line.includes("npx skills remove"))).toEqual([
			"  $ npx skills remove --global -y grilling",
		]);
		expect(
			lines.filter((line) => line.includes("2: mattpocock/skills grilling")),
		).toEqual(["  2: mattpocock/skills grilling"]);
	});

	test("reports none found when nothing collides", () => {
		expect(
			duplicateReportLines({ skills: [], shown, flowBuilt: true }),
		).toEqual([
			"None found. No flat user skill shares a name with an astack skill.",
		]);
	});
});
