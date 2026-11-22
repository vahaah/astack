import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { upstreamUses } from "../../scripts/lib/notices.ts";
import { locateConflict } from "../../scripts/lib/project-apply.ts";
import {
	loadAllProjects,
	type ProjectConfig,
} from "../../scripts/lib/projects.ts";
import {
	keepPatternMismatch,
	profileKeepPatterns,
	renderAstackProfile,
	renderRepoArtifacts,
	renderReviewCopies,
	renderRuleCopies,
} from "../../scripts/lib/render.ts";
import { profileProblems } from "../../src/astack/profile.ts";
import { exampleProjects } from "../profile-paths.ts";

const astackRoot = resolve(import.meta.dir, "../..");

function project(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
	return {
		name: "acme",
		path: "~/Projects/acme",
		mode: "write",
		rulesDir: ".claude/rules/standards",
		artifacts: {
			rules: true,
			settings: true,
			reviewStub: true,
			agentDocs: true,
			profile: true,
		},
		tracker: { kind: "none", dir: ".scratch" },
		domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
		keepPatterns: [],
		lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
		gates: [],
		ciOnlyGates: [],
		commentConflicts: [],
		adrNeeded: [],
		...overrides,
	};
}

const complete = (patterns: string, extra: readonly string[] = []) =>
	[
		"```yaml",
		"version: 1",
		"base: {default: main, from_pr: false, sync: none}",
		"iterations: {min: 1, max: 2}",
		"push: never",
		"guardrails: []",
		"gates: [{name: change-proof, command: astack check proof, env: [], requires: [], setup: [], when_changed: [], ci_env: [], after: [], tools: {}, rewrites: []}]",
		"test: {name: test, command: bun run test, env: [], requires: [], setup: [], when_changed: [], ci_env: [], after: [], tools: {}, rewrites: []}",
		"metrics: null",
		"typescript: null",
		"reviewers: {select: applicable, agents: [code-reviewer], checklists: [], notes: []}",
		"test_adequacy: changed-behaviour",
		"ledger: {carry_over: false}",
		"prepasses: []",
		`comments: {keep_patterns: ${patterns}}`,
		"forbidden: {commands: [], paths: []}",
		"conventions: {branch: {create: r/<x>, pattern: null}, commit: {subject: <id>, trailers: []}}",
		"proof: {pr_comment: null, on_unclean: null}",
		"threads: {answer: false}",
		"merge: {after_clean_stop: report, conditions: []}",
		...extra,
		"```",
		"",
	].join("\n");

const profileWith = (patterns: string) =>
	[
		"# Profile",
		"",
		"```yaml",
		"version: 1",
		"gates: [{name: change-proof, command: astack check proof}]",
		`comments: {keep_patterns: ${patterns}}`,
		"```",
		"",
	].join("\n");

describe("renderRuleCopies", () => {
	test("copies each rule into the neutral rules dir unchanged", () => {
		const copies = renderRuleCopies(project(), [
			{ name: "coding.md", content: "# Coding\n" },
			{ name: "comments.md", content: "# Comments" },
			{ name: "typescript.md", content: "# TypeScript\n" },
			{ name: "postgres.md", content: "# PostgreSQL\n" },
		]);
		expect(copies).toEqual([
			{
				path: ".claude/rules/standards/coding.md",
				kind: "rule",
				content: "# Coding\n",
				sources: [upstreamUses.principles],
			},
			{
				path: ".claude/rules/standards/comments.md",
				kind: "rule",
				content: "# Comments\n",
				sources: [upstreamUses.sicko],
			},
			{
				path: ".claude/rules/standards/typescript.md",
				kind: "rule",
				content: "# TypeScript\n",
			},
			{
				path: ".claude/rules/standards/postgres.md",
				kind: "rule",
				content: "# PostgreSQL\n",
			},
		]);
	});

	test("appends the repo's keep patterns to the comments rule only", () => {
		const copies = renderRuleCopies(project({ keepPatterns: ["^Source: "] }), [
			{ name: "coding.md", content: "# Coding\n" },
			{ name: "comments.md", content: "# Comments\n" },
		]);
		expect(copies[0]?.content).toBe("# Coding\n");
		expect(copies[1]?.content).toContain("## Keep patterns for this repo");
		expect(copies[1]?.content).toContain("- `^Source: `");
	});
});

describe("review stub and profile copies", () => {
	const dir = mkdtempSync(join(tmpdir(), "render-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	const stub = join(dir, "stub.SKILL.md");
	const fallback = join(dir, "stub.FALLBACK.md");
	const sources = { stub, fallback };
	writeFileSync(stub, "stub [FALLBACK.md](FALLBACK.md)\n");
	writeFileSync(fallback, "fallback\n");

	test("copies the stub and profile to their repo paths", () => {
		writeFileSync(join(dir, "pr-review-hardening.profile.md"), complete("[]"));
		const rendered = renderReviewCopies(project(), dir, sources);
		expect(rendered.problems).toEqual([]);
		expect(rendered.artifacts.map((artifact) => artifact.path)).toEqual([
			".claude/skills/pr-review-hardening/SKILL.md",
			".astack/pr-review-hardening/FALLBACK.md",
			".claude/pr-review-hardening.profile.md",
		]);
	});

	test("renders the one review stub and its fallback from templates/", () => {
		writeFileSync(join(dir, "pr-review-hardening.profile.md"), complete("[]"));
		const rendered = renderReviewCopies(project(), dir);
		expect(rendered.problems).toEqual([]);
		expect(
			rendered.artifacts
				.filter((artifact) => artifact.kind === "review-stub")
				.map((artifact) => artifact.content),
		).toEqual([
			readFileSync(
				join(astackRoot, "templates/pr-review-hardening.stub.SKILL.md"),
				"utf8",
			).replace(
				"](FALLBACK.md)",
				"](../../../.astack/pr-review-hardening/FALLBACK.md)",
			),
			readFileSync(
				join(astackRoot, "templates/pr-review-hardening.stub.FALLBACK.md"),
				"utf8",
			),
		]);
	});

	test("the credit for the keep list sits on the fallback, which holds its text", () => {
		writeFileSync(join(dir, "pr-review-hardening.profile.md"), complete("[]"));
		const rendered = renderReviewCopies(project(), dir, sources);
		expect(
			rendered.artifacts.map((artifact) => [
				artifact.path,
				artifact.sources?.map((source) => source.use),
			]),
		).toEqual([
			[".claude/skills/pr-review-hardening/SKILL.md", undefined],
			[".astack/pr-review-hardening/FALLBACK.md", [upstreamUses.keepList.use]],
			[".claude/pr-review-hardening.profile.md", undefined],
		]);
	});

	test("reports a stub with no link to its fallback, so the fallback cannot be reached", () => {
		writeFileSync(join(dir, "pr-review-hardening.profile.md"), complete("[]"));
		const unlinked = join(dir, "unlinked.SKILL.md");
		writeFileSync(unlinked, "stub\n");
		const rendered = renderReviewCopies(project(), dir, {
			stub: unlinked,
			fallback,
		});
		expect(rendered.problems).toEqual([
			`${unlinked} has no link to FALLBACK.md, so a repo without the plugin cannot reach the fallback`,
		]);
	});

	test("reports a missing fallback and writes no stub without it", () => {
		writeFileSync(join(dir, "pr-review-hardening.profile.md"), complete("[]"));
		const gone = join(dir, "gone.FALLBACK.md");
		const rendered = renderReviewCopies(project(), dir, {
			stub,
			fallback: gone,
		});
		expect(rendered.problems).toEqual([`${gone} is missing`]);
		expect(rendered.artifacts.map((artifact) => artifact.path)).toEqual([
			".claude/pr-review-hardening.profile.md",
		]);
	});

	test("each mirrored stub links to the shared fallback", () => {
		writeFileSync(join(dir, "pr-review-hardening.profile.md"), complete("[]"));
		const rendered = renderReviewCopies(
			project({ skillMirrors: [".agents/skills"] }),
			dir,
			sources,
		);
		expect(
			rendered.artifacts
				.filter((artifact) => artifact.kind === "review-stub")
				.map((artifact) => [artifact.path, artifact.content]),
		).toEqual([
			[
				".claude/skills/pr-review-hardening/SKILL.md",
				"stub [FALLBACK.md](../../../.astack/pr-review-hardening/FALLBACK.md)\n",
			],
			[
				".agents/skills/pr-review-hardening/SKILL.md",
				"stub [FALLBACK.md](../../../.astack/pr-review-hardening/FALLBACK.md)\n",
			],
			[".astack/pr-review-hardening/FALLBACK.md", "fallback\n"],
		]);
	});

	test("reports a profile whose keep patterns differ from the config", () => {
		writeFileSync(
			join(dir, "pr-review-hardening.profile.md"),
			complete('["^TODO"]'),
		);
		const rendered = renderReviewCopies(project(), dir, sources);
		expect(rendered.problems).toHaveLength(1);
		expect(rendered.problems[0]).toContain("differ");
	});

	const gateOf = (name: string) => ({
		name,
		command: `bun run ${name}`,
		env: [],
		requires: [],
		setup: [],
		when_changed: [],
		ci_env: [],
		after: [],
		tools: {},
		rewrites: [],
	});
	const completeData = () => ({
		version: 1,
		base: { default: "main", from_pr: false, sync: "none" },
		iterations: { min: 1, max: 2 },
		push: "never",
		guardrails: [],
		gates: [
			gateOf("lint"),
			{ ...gateOf("change-proof"), command: "astack check proof" },
		],
		test: gateOf("test"),
		metrics: { command: "bun run metrics", never_increase: [] },
		typescript: { rules: true },
		reviewers: {
			select: "applicable",
			agents: ["code-reviewer"],
			checklists: [],
			notes: [],
		},
		test_adequacy: "control-per-clause",
		ledger: { carry_over: false },
		prepasses: [
			{
				name: "contract-coverage",
				when: "always",
				sources: ["docs/spec.md"],
			},
		],
		comments: { keep_patterns: [] },
		forbidden: { commands: [], paths: [] },
		conventions: {
			branch: { create: "r/<x>", pattern: null },
			commit: { subject: "<id>", trailers: ["Session"] },
		},
		proof: { pr_comment: null, on_unclean: null },
		threads: { answer: true },
		merge: { after_clean_stop: "report", conditions: [] },
	});
	const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
		typeof value === "object" && value !== null && !Array.isArray(value);
	function setAt(data: unknown, key: string, value: unknown): void {
		const [head = "", ...rest] = key.split(".");
		if (head.endsWith("[]")) {
			const items = isPlainRecord(data) ? data[head.slice(0, -2)] : undefined;
			if (Array.isArray(items))
				for (const item of items) setAt(item, rest.join("."), value);
			return;
		}
		if (!isPlainRecord(data)) return;
		if (rest.length === 0) data[head] = value;
		else setAt(data[head], rest.join("."), value);
	}

	test("reports a profile that merges after a clean stop with no condition that checks CI on the head", () => {
		const merging = (conditions: readonly string[]) => {
			const data = completeData();
			setAt(data, "merge", {
				after_clean_stop: "merge",
				command: "gh pr merge <pr> --squash",
				conditions,
			});
			writeFileSync(
				join(dir, "pr-review-hardening.profile.md"),
				`\`\`\`yaml\n${JSON.stringify(data)}\n\`\`\`\n`,
			);
			return renderReviewCopies(project(), dir, sources).problems;
		};
		expect(merging([])).toEqual([
			"projects/acme/pr-review-hardening.profile.md: merge.conditions: needs a condition that checks CI on the head when after_clean_stop is merge, because a local version note is advisory only when CI gates the merge. Add a condition that checks CI on the head SHA, or set merge.after_clean_stop to report",
		]);
		expect(
			merging(["The check job of CI is green on the exact head SHA."]),
		).toEqual([]);
	});

	test("reports missing sources instead of inventing them", () => {
		const rendered = renderReviewCopies(project(), join(dir, "nowhere"), {
			stub: join(dir, "nowhere.md"),
			fallback: join(dir, "nowhere.FALLBACK.md"),
		});
		expect(rendered.artifacts).toEqual([]);
		expect(rendered.problems).toHaveLength(3);
	});

	test("reads keep patterns from the profile's YAML block", () => {
		expect(profileKeepPatterns(profileWith('["a", "b"]'))).toEqual(["a", "b"]);
		expect(profileKeepPatterns("no block")).toBeUndefined();
		expect(keepPatternMismatch(["a"], ["a"])).toBeUndefined();
		expect(keepPatternMismatch([], undefined)).toContain("no readable");
	});
});

describe("locateConflict", () => {
	const conflict = {
		form: "cast comment",
		file: "x.md",
		line: 2,
		match: "BOUNDARY-CAST",
		requires: "",
		conflict: "",
	};

	test("confirms a citation at its recorded line", () => {
		expect(locateConflict(conflict, "a\n// BOUNDARY-CAST: x\n").found).toBe(
			"at-line",
		);
	});

	test("finds a citation that moved", () => {
		expect(
			locateConflict(conflict, "a\nb\nc\n// BOUNDARY-CAST: x\n"),
		).toMatchObject({
			found: "moved",
			foundLine: 4,
		});
	});

	test("marks a citation that no longer exists", () => {
		expect(locateConflict(conflict, "a\nb\n").found).toBe("missing");
		expect(locateConflict(conflict, undefined).found).toBe("missing");
	});
});

describe("renderAstackProfile", () => {
	const nouns = [
		"Portfolio",
		"Hotel",
		"Membership",
		"Hotel access",
		"Super Admin",
		"Primary PHI data contact",
	];
	const linear = project({
		tracker: {
			kind: "linear",
			team: "ABC",
			requirePartOf: true,
			categoryLabels: { bug: "Bug", enhancement: "Feature" },
		},
		merge: { authority: "standing" },
		ste: { mode: "deny", technicalNouns: nouns },
		keepPatterns: ["^-- lane:"],
	});

	test("writes the tracker, merge, STE, plan and keep settings", () => {
		const artifact = renderAstackProfile(linear);
		expect(artifact.path).toBe(".astack/profile.json");
		expect(JSON.parse(artifact.content)).toEqual({
			tracker: { kind: "linear", team: "ABC", requirePartOf: true },
			merge: { authority: "standing" },
			ste: { mode: "deny", technicalNouns: nouns },
			plan: { glossary: "CONTEXT.md", adr: "docs/adr" },
			commentKeep: ["^-- lane:"],
		});
	});

	test("[control:rl-floor-render] writes the proof floor of the project config, and profile.ts accepts it", () => {
		const content = JSON.parse(
			renderAstackProfile({ ...linear, proof: { minRung: "R4" } }).content,
		);
		expect({
			proof: content.proof,
			problems: profileProblems(content),
			plain: "proof" in JSON.parse(renderAstackProfile(linear).content),
		}).toEqual({ proof: { minRung: "R4" }, problems: [], plain: false });
	});

	test("writes the header field globs of the STE settings, and profile.ts accepts them", () => {
		const content = JSON.parse(
			renderAstackProfile({
				...linear,
				ste: {
					mode: "deny",
					technicalNouns: nouns,
					headerFields: ["docs/adr/*.md"],
				},
			}).content,
		);
		expect({
			ste: content.ste,
			problems: profileProblems(content),
		}).toEqual({
			ste: {
				mode: "deny",
				technicalNouns: nouns,
				headerFields: ["docs/adr/*.md"],
			},
			problems: [],
		});
	});

	test("a project with a neutral commit text writes its denied substrings, so a check in the repo reads the same list, and profile.ts accepts them", () => {
		const content = JSON.parse(
			renderAstackProfile({
				...linear,
				lint: { ...linear.lint, denySubstrings: ["acme-tool", "acme:"] },
				neutralCommit: { provenanceKey: "Tooling-Commit" },
			}).content,
		);
		expect({
			neutral: content.neutral,
			problems: profileProblems(content),
			plain: JSON.parse(renderAstackProfile(linear).content).neutral,
		}).toEqual({
			neutral: { deny: ["acme-tool", "acme:"] },
			problems: [],
			plain: undefined,
		});
	});

	test("defaults to a merge grant per turn and no Part of line", () => {
		expect(JSON.parse(renderAstackProfile(project()).content)).toEqual({
			tracker: { kind: "none", requirePartOf: false },
			merge: { authority: "turn" },
			plan: { glossary: "CONTEXT.md", adr: "docs/adr" },
		});
	});

	test("writes the standing bases of a merge grant per turn", () => {
		const content = renderAstackProfile(
			project({ merge: { authority: "turn", standingBases: ["v2"] } }),
		).content;
		expect(JSON.parse(content).merge).toEqual({
			authority: "turn",
			standingBases: ["v2"],
		});
	});

	test("each project config renders a profile that profile.ts accepts", async () => {
		const projects = await loadAllProjects(exampleProjects);
		expect(projects.length).toBeGreaterThan(0);
		for (const config of projects)
			expect({
				name: config.name,
				problems: profileProblems(
					JSON.parse(renderAstackProfile(config).content),
				),
			}).toEqual({ name: config.name, problems: [] });
	});

	test("renders only when artifacts.profile is set", () => {
		const paths = (value: ProjectConfig) =>
			renderRepoArtifacts(
				value,
				[],
				join(exampleProjects, value.name),
			).artifacts.map((artifact) => artifact.path);
		expect(paths(linear)).toContain(".astack/profile.json");
		expect(
			paths({ ...linear, artifacts: { ...linear.artifacts, profile: false } }),
		).not.toContain(".astack/profile.json");
	});

	test("prints JSON that Biome leaves as it is", () => {
		const dir = mkdtempSync(join(tmpdir(), "astack-profile-json-"));
		mkdirSync(join(dir, ".astack"));
		writeFileSync(
			join(dir, "biome.json"),
			JSON.stringify({ formatter: { indentStyle: "space" } }),
		);
		const long = {
			...linear,
			ste: {
				mode: "deny" as const,
				technicalNouns: [...nouns, ...nouns.map((noun) => `${noun} id`)],
			},
		};
		writeFileSync(
			join(dir, ".astack/profile.json"),
			renderAstackProfile(long).content,
		);
		const biome = resolve(import.meta.dir, "../../node_modules/.bin/biome");
		const result = spawnSync(biome, ["format", ".astack/profile.json"], {
			cwd: dir,
			encoding: "utf8",
		});
		rmSync(dir, { recursive: true, force: true });
		expect(`${result.stdout}${result.stderr}`).not.toContain(
			"would have printed",
		);
		expect(result.status).toBe(0);
	});
});

describe("user-only rules", () => {
	test("the rule card stays out of the repo copies", () => {
		const copies = renderRuleCopies(project(), [
			{ name: "astack.md", content: "# Card\n" },
			{ name: "coding.md", content: "# Coding\n" },
		]);
		expect(copies.map((copy) => copy.path)).toEqual([
			".claude/rules/standards/coding.md",
		]);
	});
});
