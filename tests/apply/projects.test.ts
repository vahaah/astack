import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../../scripts/apply.ts";
import { conflictHookVerdict } from "../../scripts/lib/keep-forms.ts";
import { checkDecision } from "../../scripts/lib/project-apply.ts";
import {
	expandHome,
	loadAllProjects,
	loadProject,
	type ProjectConfig,
	ProjectConfigError,
	reviewProfileName,
	validateProjectConfig,
} from "../../scripts/lib/projects.ts";
import { parseProfile } from "../../src/astack/pr-review-profile.ts";
import { scanProjectDirs } from "../profile-paths.ts";

const valid = {
	name: "acme",
	path: "~/Projects/acme",
	mode: "write",
	rulesDir: ".claude/rules/standards",
	artifacts: {
		rules: true,
		settings: true,
		reviewStub: false,
		agentDocs: true,
		profile: true,
	},
	tracker: {
		kind: "linear",
		team: "ABC",
		requirePartOf: true,
		categoryLabels: { bug: "Bug", enhancement: "Feature" },
	},
	domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
	keepPatterns: [],
	lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
	gates: [{ name: "docs", run: ["bun", "run", "docs"] }],
	ciOnlyGates: [],
	commentConflicts: [],
	adrNeeded: [],
};

function errorsOf(value: unknown, stem = "acme"): string {
	try {
		validateProjectConfig(value, stem);
		return "";
	} catch (error) {
		if (!(error instanceof ProjectConfigError)) throw error;
		return error.message;
	}
}

describe("validateProjectConfig", () => {
	test("accepts a complete config", () => {
		expect(errorsOf(valid)).toBe("");
	});

	test.each([["branch"], ["head"], ["dirtyCount"]])(
		"rejects the live-state key %p",
		(key) => {
			expect(errorsOf({ ...valid, [key]: "x" })).toContain(
				"live repo state is read at run time",
			);
		},
	);

	test("accepts a branch template and a commit subject, and rejects bad ones", () => {
		expect(
			errorsOf({
				...valid,
				branchTemplate: "astack/setup-{date}",
				commitSubject: "chore: add astack",
			}),
		).toBe("");
		expect(errorsOf({ ...valid, branchTemplate: "astack setup" })).toContain(
			'branchTemplate: "astack setup" has a space',
		);
		expect(errorsOf({ ...valid, commitSubject: "one\ntwo" })).toContain(
			"commitSubject must be one line of text",
		);
	});

	test("accepts a neutral commit text with a provenance key, and refuses a key or a subject that holds a denied substring", () => {
		const neutral = (extra: Record<string, unknown>) =>
			errorsOf({
				...valid,
				lint: { ...valid.lint, denySubstrings: ["astack", "flow:"] },
				...extra,
			});
		expect(
			neutral({
				neutralCommit: { provenanceKey: "Tooling-Commit" },
				commitSubject: "S0 — the repo carries the agent tooling files",
			}),
		).toBe("");
		const refused = neutral({
			neutralCommit: { provenanceKey: "Astack-Commit" },
			commitSubject: "S0 — the repo carries the Astack files",
		});
		expect(refused).toContain(
			'neutralCommit.provenanceKey holds the denied substring "astack"',
		);
		expect(refused).toContain(
			'commitSubject holds the denied substring "astack", and neutralCommit asks for a commit text with none',
		);
		expect(
			neutral({ neutralCommit: { provenanceKey: "Tooling Commit" } }),
		).toContain(
			"neutralCommit.provenanceKey must be a trailer key, such as Tooling-Commit",
		);
		expect(neutral({ neutralCommit: true })).toContain(
			"neutralCommit is not an object",
		);
		expect(
			errorsOf({
				...valid,
				lint: { ...valid.lint, denySubstrings: ["astack"] },
				commitSubject: "chore: add the astack files",
			}),
		).toBe("");
	});

	test("rejects a name that differs from the file name", () => {
		expect(errorsOf(valid, "other")).toContain(
			'name must equal the file name "other"',
		);
	});

	test("rejects a report-only project that renders artifacts", () => {
		expect(errorsOf({ ...valid, mode: "report-only" })).toContain(
			"a report-only project renders no artifacts",
		);
	});

	test("rejects a rules dir outside .claude/rules or one that names a tool", () => {
		expect(errorsOf({ ...valid, rulesDir: "rules" })).toContain("rulesDir");
		expect(
			errorsOf({ ...valid, rulesDir: ".claude/rules/Standards" }),
		).toContain("rulesDir");
	});

	test("rejects a keep pattern that is not a valid RegExp", () => {
		expect(errorsOf({ ...valid, keepPatterns: ["("] })).toContain(
			"not a valid RegExp",
		);
	});

	test("rejects a gate with an empty command or an unknown files mode", () => {
		expect(errorsOf({ ...valid, gates: [{ name: "g", run: [] }] })).toContain(
			"gates[0].run is empty",
		);
		expect(
			errorsOf({ ...valid, gates: [{ name: "g", run: ["x"], files: "all" }] }),
		).toContain('gates[0].files must be "written-json"');
	});

	test("accepts a CI parity block, and rejects an entry without a reason or a job id, or with an empty differs reason", () => {
		const ciParity = {
			setup: [{ command: "bun install --frozen-lockfile", reason: "r" }],
			map: [
				{ job: "ci.yml#smoke", gates: ["e2e"], reason: "r" },
				{
					job: "ci.yml#lint",
					step: "Lint",
					gates: ["lint"],
					reason: "r",
					differs: "d",
				},
			],
			exclude: [
				{ job: "ci.yml#nightly", reason: "r" },
				{ job: "ci.yml#static", step: "Schema drift", reason: "r" },
			],
			narrow: [{ job: "ci.yml#smoke", gates: ["e2e"], reason: "r" }],
		};
		expect(errorsOf({ ...valid, ciParity })).toBe("");
		const errors = errorsOf({
			...valid,
			ciParity: {
				setup: [{ command: "bun install" }],
				map: [
					{ job: "smoke", gates: [], reason: "r" },
					{ job: "ci.yml#lint", gates: ["lint"], reason: "r", differs: "" },
					{ job: "ci.yml#test", gates: ["test"], reason: "r", differs: 1 },
				],
				exclude: [{ job: "ci.yml#nightly", reason: "" }],
				narrow: [{ job: "ci.yml#smoke", gates: ["e2e"] }],
			},
		});
		expect(errors).toContain("ciParity.map[1].differs is empty");
		expect(errors).toContain("ciParity.map[2].differs is not a string");
		expect(errors).toContain("ciParity.setup[0].reason is not a string");
		expect(errors).toContain(
			'ciParity.map[0].job must be "<workflow file>#<job id>"',
		);
		expect(errors).toContain("ciParity.map[0].gates is empty");
		expect(errors).toContain("ciParity.exclude[0].reason is empty");
		expect(errors).toContain("ciParity.narrow[0].reason is not a string");
		expect(errorsOf({ ...valid, ciParity: { map: [] } })).toContain(
			"ciParity.setup is not an array",
		);
	});

	test("accepts a branch overlay of gates, CI-only gates and CI parity", () => {
		expect(
			errorsOf({
				...valid,
				branches: {
					v2: {
						gates: [{ name: "docs", run: ["bun", "run", "docs"] }],
						ciOnlyGates: [{ name: "smoke", source: "ci.yml:1", reason: "r" }],
						ciParity: { setup: [], map: [], exclude: [] },
					},
				},
			}),
		).toBe("");
	});

	test.each([
		[
			"a key with a space",
			{ "v2 beta": {} },
			'branches."v2 beta": "v2 beta" has a space',
		],
		[
			"a key that ends in /",
			{ "release/": {} },
			'branches."release/": "release/" starts with - or /',
		],
		[
			"a key that only the top sets",
			{ v2: { merge: { authority: "turn" } } },
			"branches.v2.merge is not a key",
		],
		[
			"an overlay that is not an object",
			{ v2: [] },
			"branches.v2 is not an object",
		],
		[
			"a gate with no command",
			{ v2: { gates: [{ name: "g", run: [] }] } },
			"branches.v2.gates[0].run is empty",
		],
		[
			"an unknown CI parity key",
			{ v2: { ciParity: { setup: [], map: [], exclude: [], extra: [] } } },
			"branches.v2.ciParity.extra is not a known key",
		],
	])("rejects an overlay with %s", (_case, branches, error) => {
		expect(errorsOf({ ...valid, branches })).toContain(error);
	});

	test("accepts exempt paths for the denied substrings, and refuses one that covers .claude/settings.json or leaves the repo", () => {
		const withExempt = (denySubstringsExempt: unknown) =>
			errorsOf({
				...valid,
				lint: { ...valid.lint, denySubstringsExempt },
			});
		expect(
			withExempt([
				".astack/",
				"docs/agents/",
				".claude/pr-review-hardening.profile.md",
			]),
		).toBe("");
		const refused = withExempt([".claude/", "../x", ".claude/settings.json"]);
		expect(refused).toContain(
			"lint.denySubstringsExempt[0] covers .claude/settings.json, which apply merges into a file of the repo",
		);
		expect(refused).toContain(
			"lint.denySubstringsExempt[1] is not a relative path inside the repo",
		);
		expect(refused).toContain(
			"lint.denySubstringsExempt[2] covers .claude/settings.json, which apply merges into a file of the repo",
		);
		expect(withExempt(".astack/")).toContain(
			"lint.denySubstringsExempt is not a string array",
		);
	});

	test("rejects a conflict citation without an integer line", () => {
		expect(
			errorsOf({
				...valid,
				commentConflicts: [
					{
						form: "f",
						file: "x",
						line: "3",
						match: "m",
						requires: "r",
						conflict: "c",
					},
				],
			}),
		).toContain("commentConflicts[0].line is not an integer");
	});
});

describe("merge and STE settings", () => {
	test("accepts a standing merge grant and an STE block", () => {
		expect(
			errorsOf({
				...valid,
				merge: { authority: "standing", requireChecks: false },
				ste: {
					mode: "advise",
					technicalNouns: ["Hotel"],
					exclude: ["x/**"],
					headerFields: ["docs/adr/*.md"],
				},
			}),
		).toBe("");
		expect(
			errorsOf({
				...valid,
				ste: { mode: "deny", technicalNouns: [], headerFields: "docs/adr" },
			}),
		).toContain("ste.headerFields is not a string array");
	});

	test("rejects an unknown merge authority and STE mode", () => {
		const errors = errorsOf({
			...valid,
			merge: { authority: "always" },
			ste: { mode: "strict", technicalNouns: "Hotel" },
		});
		expect(errors).toContain('merge.authority must be "standing" or "turn"');
		expect(errors).toContain('ste.mode must be "deny" or "advise"');
		expect(errors).toContain("ste.technicalNouns is not a string array");
	});

	test("refuses standing bases with a standing merge grant", () => {
		expect(
			errorsOf({
				...valid,
				merge: { authority: "standing", standingBases: ["v2"] },
			}),
		).toContain(
			'merge.standingBases needs merge.authority "turn", because "standing" already covers each base',
		);
	});
});

describe("tracker and domain", () => {
	test("accepts each tracker kind", () => {
		expect(
			errorsOf({
				...valid,
				tracker: {
					kind: "github",
					requirePartOf: false,
					categoryLabels: { bug: "bug", enhancement: "enhancement" },
				},
			}),
		).toBe("");
		expect(
			errorsOf({ ...valid, tracker: { kind: "none", dir: ".scratch" } }),
		).toBe("");
	});

	test("rejects an unknown tracker kind", () => {
		expect(errorsOf({ ...valid, tracker: { kind: "jira" } })).toContain(
			'tracker.kind must be "linear", "github" or "none"',
		);
	});

	test("rejects a Linear team that is not a team key", () => {
		expect(
			errorsOf({ ...valid, tracker: { ...valid.tracker, team: "abc" } }),
		).toContain("tracker.team must be a Linear team key");
	});

	test("accepts a bug label without the word bug, such as the defect label of a repo register", () => {
		expect(
			errorsOf({
				...valid,
				tracker: {
					...valid.tracker,
					categoryLabels: { bug: "Defect", enhancement: "Feature" },
				},
			}),
		).toBe("");
	});

	test("accepts the research claim comment and the other claims of a GitHub tracker, and refuses an empty or a broken line", () => {
		const github = {
			kind: "github",
			requirePartOf: true,
			categoryLabels: { bug: "defect", enhancement: "enhancement" },
		};
		expect(
			errorsOf({
				...valid,
				tracker: {
					...github,
					researchClaimComment: "AFK research started",
					otherClaims: [{ work: "A session issue", claim: "Run the script." }],
				},
			}),
		).toBe("");
		const refused = errorsOf({
			...valid,
			tracker: {
				...github,
				researchClaimComment: "AFK `research`",
				otherClaims: [
					{ work: " ", claim: "Run the script." },
					{ work: "A session issue", claim: "one\ntwo" },
					{ work: "A decision issue" },
				],
			},
		});
		expect(refused).toContain(
			"tracker.researchClaimComment must be one line of text with no backtick",
		);
		expect(refused).toContain(
			"tracker.otherClaims[0].work must be one line of text",
		);
		expect(refused).toContain(
			"tracker.otherClaims[1].claim must be one line of text",
		);
		expect(refused).toContain("tracker.otherClaims[2].claim is not a string");
	});

	test("accepts the skipped frontier labels of a GitHub tracker and the other labels of a bug, and refuses an empty or a broken label", () => {
		const github = {
			kind: "github",
			requirePartOf: true,
			categoryLabels: {
				bug: "defect",
				enhancement: "enhancement",
				bugAlso: ["block:B<nn>"],
			},
			frontierSkipLabels: ["decision"],
		};
		expect(errorsOf({ ...valid, tracker: github })).toBe("");
		const refused = errorsOf({
			...valid,
			tracker: {
				...github,
				categoryLabels: { ...github.categoryLabels, bugAlso: [" "] },
				frontierSkipLabels: ["de`cision"],
			},
		});
		expect(refused).toContain(
			"tracker.categoryLabels.bugAlso[0] must be one line of text with no backtick",
		);
		expect(refused).toContain(
			"tracker.frontierSkipLabels[0] must be one line of text with no backtick",
		);
	});

	test("rejects domain and local tracker paths that leave the repo", () => {
		expect(
			errorsOf({ ...valid, tracker: { kind: "none", dir: "../x" } }),
		).toContain("tracker.dir is not a relative path inside the repo");
		expect(
			errorsOf({
				...valid,
				domain: { glossary: "/CONTEXT.md", adrDir: "docs/adr" },
			}),
		).toContain("domain.glossary is not a relative path inside the repo");
		expect(
			errorsOf({
				...valid,
				domain: {
					glossary: "CONTEXT.md",
					adrDir: "docs/adr",
					readFirst: ["docs/./map.md"],
				},
			}),
		).toContain("domain.readFirst[0] is not a relative path inside the repo");
		expect(
			errorsOf({
				...valid,
				domain: {
					glossary: "CONTEXT.md",
					contextMap: "../CONTEXT-MAP.md",
					adrDir: "docs/adr",
				},
			}),
		).toContain("domain.contextMap is not a relative path inside the repo");
	});

	test("rejects a report-only project that renders the agent docs", () => {
		expect(
			errorsOf({
				...valid,
				mode: "report-only",
				artifacts: {
					rules: false,
					settings: false,
					reviewStub: false,
					agentDocs: true,
					profile: false,
				},
			}),
		).toContain("a report-only project renders no artifacts");
	});
});

describe("loadProject with a branch overlay", () => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-projects-")));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));
	writeFileSync(
		join(dir, "acme.json"),
		JSON.stringify({ ...valid, branches: { v2: {} } }),
	);

	test("refuses an overlay with no profile file, and loads it once the file exists", async () => {
		await expect(loadProject("acme", dir)).rejects.toThrow(
			"branches.v2 has no projects/acme/branches/v2/pr-review-hardening.profile.md",
		);
		mkdirSync(join(dir, "acme/branches/v2"), { recursive: true });
		writeFileSync(
			join(dir, "acme/branches/v2/pr-review-hardening.profile.md"),
			"# Profile\n",
		);
		expect((await loadProject("acme", dir)).branches).toEqual({ v2: {} });
	});
});

describe("the project configs of each scanned companion", () => {
	const scanned = async () =>
		(
			await Promise.all(
				scanProjectDirs.map(async (dir) =>
					(
						await loadAllProjects(dir)
					).map((project) => ({
						project,
						profile: join(dir, project.name, reviewProfileName),
					})),
				),
			)
		).flat();
	const projects = async () => (await scanned()).map((entry) => entry.project);

	test("all load, and only report-only projects need an ADR", async () => {
		const configs = await projects();
		expect(configs.length).toBeGreaterThan(0);
		for (const project of configs)
			expect(project.adrNeeded.length > 0).toBe(project.mode === "report-only");
	});

	test("each hardening profile keeps the same patterns as its project config", async () => {
		const entries = await scanned();
		const withProfile = entries.filter((entry) => existsSync(entry.profile));
		expect(withProfile.map((entry) => entry.project.name)).toEqual(
			entries.map((entry) => entry.project.name),
		);
		for (const { project, profile } of withProfile)
			expect({
				name: project.name,
				profile: parseProfile(readFileSync(profile, "utf8")).data,
			}).toMatchObject({
				name: project.name,
				profile: { comments: { keep_patterns: project.keepPatterns } },
			});
	});

	test("a decided keep form passes the hook only through the repo's keep patterns", async () => {
		const rows = (await projects()).flatMap((project) =>
			(project.commentDecisions ?? [])
				.filter((decision) => decision.decision === "keep")
				.map((decision) => ({
					name: `${project.name}: ${decision.form}`,
					kept: conflictHookVerdict(decision, project.keepPatterns),
					without: conflictHookVerdict(decision, []),
				})),
		);
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect({ name: row.name, verdict: row.kept }).toEqual({
				name: row.name,
				verdict: "allowed",
			});
			expect(["deny", "advisory"]).toContain(row.without ?? "");
		}
	});

	test("every repo keeps ADR citations and drops the BOUNDARY-CAST form", async () => {
		for (const project of await projects()) {
			const decisions = project.commentDecisions ?? [];
			expect(
				decisions.some(
					(decision) =>
						decision.decision === "keep" && /ADR/.test(decision.sample ?? ""),
				),
			).toBe(true);
			expect(
				decisions.some(
					(decision) =>
						decision.decision === "obsolete" &&
						decision.match === "// BOUNDARY-CAST:",
				),
			).toBe(true);
			expect(
				project.commentConflicts.filter((conflict) =>
					conflict.form.startsWith("BOUNDARY-CAST"),
				),
			).toEqual([]);
		}
	});

	test("a decided form leaves the open list", async () => {
		for (const project of await projects()) {
			const open = project.commentConflicts.map((conflict) => conflict.form);
			for (const decision of project.commentDecisions ?? [])
				expect(open).not.toContain(decision.form);
		}
	});

	test("every recorded conflict with a sample gets a hook verdict", async () => {
		for (const project of await projects())
			for (const conflict of project.commentConflicts)
				if (conflict.sample !== undefined)
					expect(["deny", "advisory", "allowed"]).toContain(
						conflictHookVerdict(conflict, project.keepPatterns) ?? "",
					);
	});

	test("every project that writes renders the agent docs", async () => {
		for (const project of await projects()) {
			expect(project.artifacts.agentDocs).toBe(project.mode === "write");
		}
	});

	const isRecord = (
		value: unknown,
	): value is Readonly<Record<string, unknown>> =>
		typeof value === "object" && value !== null && !Array.isArray(value);
	const squashFlags =
		/ --subject "<pr-title> \(#<pr>\)" --body-file <squash-body>(?: |$)/;
	const unsquashedMerges = (
		entries: readonly {
			readonly project: ProjectConfig;
			readonly data: unknown;
		}[],
	): string[] =>
		entries
			.filter(({ project }) => project.neutralCommit !== undefined)
			.flatMap(({ project, data }) => {
				const merge = isRecord(data) ? data.merge : undefined;
				if (!isRecord(merge) || merge.after_clean_stop !== "merge") return [];
				return [merge.command, merge.fallback]
					.filter((command) => command !== undefined)
					.filter(
						(command) =>
							typeof command !== "string" || !squashFlags.test(command),
					)
					.map(() => project.name);
			});

	test("the squash check finds a merge with no subject and body of a project with a neutral commit text", () => {
		const neutral = validateProjectConfig(
			{ ...valid, neutralCommit: { provenanceKey: "Tooling-Commit" } },
			"acme",
		);
		const plain = validateProjectConfig(valid, "acme");
		const mergeWith = (command: string) => ({
			merge: { after_clean_stop: "merge", command },
		});
		expect(
			[
				{ project: neutral, data: mergeWith("gh pr merge <pr> --squash") },
				{
					project: neutral,
					data: mergeWith(
						'gh pr merge <pr> --squash --subject "<pr-title> (#<pr>)" --body-file <squash-body>',
					),
				},
				{ project: plain, data: mergeWith("gh pr merge <pr> --squash") },
			].map((entry) => unsquashedMerges([entry])),
		).toEqual([["acme"], [], []]);
	});

	test("a project with a neutral commit text sets the subject and the body of the squash commit, so the commit on main names no tool", async () => {
		const entries = (await scanned()).map(({ project, profile }) => ({
			project,
			data: parseProfile(readFileSync(profile, "utf8")).data,
		}));
		expect(unsquashedMerges(entries)).toEqual([]);
	});
});

describe("comment decisions and skill mirrors", () => {
	const decision = {
		form: "ADR citation",
		decision: "keep",
		reason: "The owner keeps it.",
		sample: "// See ADR-0001.",
	};
	const config = (extra: Record<string, unknown>) => ({ ...valid, ...extra });

	test("accepts a keep decision with a sample and an obsolete one with its citation", () => {
		expect(() =>
			validateProjectConfig(
				config({
					commentDecisions: [
						decision,
						{
							form: "cast comment",
							decision: "obsolete",
							reason: "The stub replaces the file.",
							file: "x.md",
							line: 3,
							match: "// BOUNDARY-CAST:",
						},
					],
					skillMirrors: [".agents/skills"],
				}),
				"acme",
			),
		).not.toThrow();
	});

	test.each([
		[{ ...decision, sample: undefined }, "needs a sample"],
		[{ ...decision, decision: "maybe" }, 'must be "keep" or "obsolete"'],
		[{ ...decision, file: "x.md" }, "file, line and match together"],
	])("rejects a decision %#", (bad, message) => {
		expect(() =>
			validateProjectConfig(config({ commentDecisions: [bad] }), "acme"),
		).toThrow(message);
	});

	test("rejects a skill mirror that is not a skills folder inside the repo", () => {
		for (const dir of ["../skills", ".agents/commands", "/abs/skills"])
			expect(() =>
				validateProjectConfig(config({ skillMirrors: [dir] }), "acme"),
			).toThrow("skillMirrors[0]");
	});
});

describe("checkDecision", () => {
	const keep = {
		form: "ADR citation",
		decision: "keep" as const,
		reason: "r",
		sample: "// The gate runs first (ADR-0055).",
	};
	const obsolete = {
		form: "cast comment",
		decision: "obsolete" as const,
		reason: "r",
		file: "skill.md",
		line: 2,
		match: "// BOUNDARY-CAST:",
	};

	test("a keep decision holds only when a keep pattern allows its sample", () => {
		expect(checkDecision(keep, ["\\bADR-\\d{4}\\b"], () => "").problem).toBe(
			undefined,
		);
		expect(checkDecision(keep, [], () => "").problem).toContain(
			"so a keep pattern is missing",
		);
	});

	test("an obsolete decision holds only when the file no longer asks for the form", () => {
		expect(checkDecision(obsolete, [], () => "# Stub\n").problem).toBe(
			undefined,
		);
		expect(
			checkDecision(obsolete, [], () => "a\n// BOUNDARY-CAST: why\n").problem,
		).toBe('skill.md:2 still requires "// BOUNDARY-CAST:"');
	});
});

describe("conflictHookVerdict", () => {
	const conflict = {
		form: "f",
		file: "x.md",
		line: 1,
		match: "m",
		requires: "r",
		conflict: "c",
	};

	test.each([
		["// Source: ABC-9 §3", undefined, "deny"],
		["// @ts-expect-error three's types lag", undefined, "deny"],
		[
			"// BOUNDARY-CAST: the driver returns rows as unknown",
			undefined,
			"advisory",
		],
		["-- stack lane: d", "migration.sql", "advisory"],
	])("%p is %p", (sample, samplePath, verdict) => {
		expect(
			String(
				conflictHookVerdict(
					{ ...conflict, sample, ...(samplePath ? { samplePath } : {}) },
					[],
				),
			),
		).toBe(verdict);
	});

	test("a keep pattern allows the form, and a row without a sample has no verdict", () => {
		expect(
			conflictHookVerdict(
				{ ...conflict, sample: "// BOUNDARY-CAST: unknown rows" },
				["^// BOUNDARY-CAST:"],
			),
		).toBe("allowed");
		expect(conflictHookVerdict(conflict, [])).toBeUndefined();
	});
});

describe("parseArgs", () => {
	test("accepts the global dry run", () => {
		expect(parseArgs(["--global", "--dry-run"])).toEqual({
			mode: "global",
			dryRun: true,
		});
	});

	test("refuses a project run without --dry-run or --worktree, or with both", () => {
		expect(parseArgs(["--project", "acme"])).toBe(
			"Pass exactly one of --dry-run or --worktree with --project <name>",
		);
		expect(parseArgs(["--project", "acme", "--dry-run", "--worktree"])).toBe(
			"Pass exactly one of --dry-run or --worktree with --project <name>",
		);
	});

	test("reads the worktree flags, with the default worktrees folder", () => {
		expect(
			parseArgs([
				"--project",
				"acme",
				"--worktree",
				"--branch",
				"astack/try",
				"--base",
				"origin/develop",
				"--worktrees",
				"/tmp/wt",
				"--trailer",
				"Co-Authored-By: A <a@example.com>",
				"--trailer",
				"Reviewed-By: B",
			]),
		).toEqual({
			mode: "worktree",
			name: "acme",
			keep: false,
			worktrees: "/tmp/wt",
			trailers: ["Co-Authored-By: A <a@example.com>", "Reviewed-By: B"],
			branch: "astack/try",
			base: "origin/develop",
		});
		expect(parseArgs(["--project", "acme", "--worktree"])).toEqual({
			mode: "worktree",
			name: "acme",
			keep: false,
			worktrees: expandHome("~/.local/state/astack/worktrees"),
			trailers: [],
		});
	});

	test("keeps the worktree flags and the dry-run flags apart", () => {
		expect(parseArgs(["--project", "acme", "--dry-run", "--branch", "x"])).toBe(
			"--branch apply to --worktree only",
		);
		expect(
			parseArgs(["--project", "acme", "--worktree", "--scratch", "/tmp/s"]),
		).toBe("--scratch applies to --dry-run only");
		expect(parseArgs(["--global", "--worktree"])).toBe(
			"--global takes only --dry-run",
		);
		expect(parseArgs(["--project", "acme", "--worktree", "--branch"])).toBe(
			"--branch needs a value",
		);
	});

	test("reads --update for a worktree run, and refuses it elsewhere", () => {
		expect(parseArgs(["--project", "acme", "--worktree", "--update"])).toEqual({
			mode: "worktree",
			name: "acme",
			keep: false,
			worktrees: expandHome("~/.local/state/astack/worktrees"),
			trailers: [],
			update: true,
		});
		expect(parseArgs(["--project", "acme", "--dry-run", "--update"])).toBe(
			"--update applies to --worktree only",
		);
		expect(
			parseArgs([
				"--project",
				"acme",
				"--worktree",
				"--update",
				"--base",
				"origin/main",
			]),
		).toBe(
			"--base does not apply to --update, because the branch keeps its base",
		);
		expect(parseArgs(["--global", "--update"])).toBe(
			"--global takes only --dry-run",
		);
	});

	test("reads --overlay for a worktree run and an update, and refuses it in a dry run", () => {
		expect(
			parseArgs([
				"--project",
				"acme",
				"--worktree",
				"--update",
				"--overlay",
				"v2",
			]),
		).toEqual({
			mode: "worktree",
			name: "acme",
			keep: false,
			worktrees: expandHome("~/.local/state/astack/worktrees"),
			trailers: [],
			update: true,
			overlay: "v2",
		});
		expect(
			parseArgs(["--project", "acme", "--dry-run", "--overlay", "v2"]),
		).toBe("--overlay apply to --worktree only");
	});

	test("refuses a trailer that is not one Key: value line", () => {
		expect(
			parseArgs(["--project", "acme", "--worktree", "--trailer", "no colon"]),
		).toBe('--trailer takes one "Key: value" line, not "no colon"');
	});

	test("refuses both modes at once and neither", () => {
		expect(parseArgs(["--global", "--project", "acme", "--dry-run"])).toContain(
			"exactly one",
		);
		expect(parseArgs(["--dry-run"])).toContain("exactly one");
	});

	test("passes the marketplace repo and keep flag through", () => {
		expect(
			parseArgs([
				"--project",
				"acme",
				"--dry-run",
				"--keep",
				"--marketplace-repo",
				"acme/astack",
				"--scratch",
				"/tmp/s",
			]),
		).toEqual({
			mode: "project",
			name: "acme",
			dryRun: true,
			keep: true,
			marketplaceRepo: "acme/astack",
			scratch: "/tmp/s",
		});
	});

	test("expands ~ in paths", () => {
		expect(expandHome("~/x", "/home/dev")).toBe("/home/dev/x");
		expect(expandHome("/abs", "/home/dev")).toBe("/abs");
	});
});
