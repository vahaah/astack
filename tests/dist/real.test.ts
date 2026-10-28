import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { lintedPath } from "../../scripts/dist/lint.ts";
import { render } from "../../scripts/dist/render.ts";
import { readSource } from "../../scripts/dist/source.ts";
import {
	type FileTree,
	isText,
	textFile,
	textOf,
} from "../../scripts/dist/tree.ts";
import { staticChecks } from "../../scripts/dist.ts";
import { UPSTREAMS } from "../../scripts/lib/upstreams.ts";
import {
	copiedFrom,
	readUnscannedRuns,
	readUpstreamRuns,
	type ScannedUpstream,
	SHARED_BOILERPLATE,
	UNSCANNED_UPSTREAMS,
	upstreamCopyright,
} from "../upstream-runs.ts";

const ROOT = resolve(import.meta.dir, "../..");
const runs = readUpstreamRuns();

function unlicensedUpstreams(tree: FileTree, target: string): string[] {
	const found = new Map<string, Set<ScannedUpstream>>();
	for (const [path, entry] of tree) {
		const match = /^([^/]+)\/skills\/([^/]+)\/(.+)$/.exec(path);
		const skill = match?.[2];
		if (match?.[1] !== target || skill === undefined) continue;
		if (match[3] === "LICENSE.txt" || !isText(entry)) continue;
		const upstreams = found.get(skill) ?? new Set<ScannedUpstream>();
		for (const upstream of copiedFrom(runs, textOf(entry), SHARED_BOILERPLATE))
			upstreams.add(upstream);
		found.set(skill, upstreams);
	}
	return [...found].flatMap(([skill, upstreams]) => {
		const license = tree.get(`${target}/skills/${skill}/LICENSE.txt`);
		const text = license === undefined ? "" : textOf(license);
		return [...upstreams]
			.filter((upstream) => !text.includes(upstreamCopyright(upstream)))
			.map((upstream) => `${skill}: ${upstream}`);
	});
}

describe("the dist of this repo", () => {
	const result = render(
		readSource({
			marketplace: join(ROOT, "marketplace"),
			rules: join(ROOT, "rules"),
		}),
	);

	test("renders", () => {
		expect(result.ok ? [] : result.error).toEqual([]);
	});

	test("passes every static check", () => {
		if (!result.ok) return;
		const failures = staticChecks(result.value).flatMap((report) =>
			report.errors.map((error) => `${report.id}: ${error}`),
		);
		expect(failures).toEqual([]);
	});

	test("each astack skill with an origin carries the copyright of each origin upstream in its flat licence", () => {
		if (!result.ok) return;
		const text = (path: string) => {
			const entry = result.value.tree.get(path);
			return entry === undefined ? "" : textOf(entry);
		};
		const unnamed = result.value.build.components.astack.skills.flatMap(
			(skill) => {
				const license = text(
					`agentskills/skills/astack-${skill.name}/LICENSE.txt`,
				);
				return skill.origin
					.filter(
						(name) =>
							!license.includes(
								`- ${UPSTREAMS[name].label}, ${UPSTREAMS[name].copyright}`,
							),
					)
					.map((name) => `${skill.name}: ${name}`);
			},
		);
		expect(unnamed).toEqual([]);
		expect(text("agentskills/skills/astack-deslop/SKILL.md")).toContain(
			'source: "astack, adapted from cursor-team-kit"',
		);
	});

	test("the run scan finds the upstream text of a derived skill", () => {
		if (!result.ok) return;
		const tree = result.value.tree;
		const text = (path: string) => {
			const entry = tree.get(path);
			return entry === undefined ? "" : textOf(entry);
		};
		expect(
			copiedFrom(runs, text("agentskills/skills/astack-control-ui/SKILL.md")),
		).toEqual(["cursor-team-kit"]);
		expect(
			copiedFrom(runs, text("agentskills/skills/astack-coding-rules/SKILL.md")),
		).toEqual(["mattpocock-skills", "pstack"]);
		expect(text("grok-bot/skills/astack-coding-rules/LICENSE.txt")).toContain(
			"- pstack, Copyright (c) 2026 Lauren Tan",
		);
	});

	test("a copied upstream shell script in a skill needs the upstream copyright in its licence", () => {
		const script = readFileSync(
			join(
				ROOT,
				"upstream/pstack/skills/poteto-mode/scripts/worktree-audit.sh",
			),
			"utf8",
		);
		const tree = (license: string): FileTree =>
			new Map([
				[
					"agentskills/skills/astack-mode/scripts/worktree-audit.sh",
					textFile(script, true),
				],
				["agentskills/skills/astack-mode/LICENSE.txt", textFile(license)],
			]);
		expect(unlicensedUpstreams(tree("MIT\n"), "agentskills")).toEqual([
			"astack-mode: pstack",
		]);
		expect(
			unlicensedUpstreams(
				tree(`- pstack, ${upstreamCopyright("pstack")}\n`),
				"agentskills",
			),
		).toEqual([]);
	});

	test("no dist file shares a run with an upstream of the unscanned table, so the reason of the table holds", () => {
		if (!result.ok) return;
		const unscanned = readUnscannedRuns();
		expect(Object.keys(UNSCANNED_UPSTREAMS)).toContain("cursor-plugin-schemas");
		expect(
			[...result.value.tree].flatMap(([path, entry]) =>
				isText(entry)
					? copiedFrom(unscanned, textOf(entry)).map(
							(upstream) => `${path}: ${upstream}`,
						)
					: [],
			),
		).toEqual([]);
	});

	test.each(["agentskills", "grok-bot"])(
		"each %s skill licence names every upstream that its text shares a run with",
		(target) => {
			if (!result.ok) return;
			expect(unlicensedUpstreams(result.value.tree, target)).toEqual([]);
		},
	);

	test("the rules skill carries the pstack copyright, because it quotes Comment Sicko", () => {
		if (!result.ok) return;
		const rules = result.value.tree.get(
			"grok-bot/skills/astack-rules/SKILL.md",
		);
		expect(rules ? textOf(rules) : "").toContain("are meat");
		const license = result.value.tree.get(
			"grok-bot/skills/astack-rules/LICENSE.txt",
		);
		expect(license ? textOf(license) : "").toContain(
			"- pstack, Copyright (c) 2026 Lauren Tan",
		);
	});

	test("the astack NOTICE names both rules that hold pstack text", () => {
		const notice = readFileSync(
			join(ROOT, "marketplace/plugins/astack/NOTICE"),
			"utf8",
		);
		expect(notice).toContain("rules/comments.md");
		expect(notice).toContain("rules/coding.md");
	});

	test("lints only the flat targets, and never their licence or bundle files", () => {
		expect(lintedPath("cursor/astack/skills/astack-plan/SKILL.md")).toBe(true);
		expect(lintedPath("grok-bot/README.md")).toBe(true);
		expect(lintedPath("claude-code/astack/skills/plan/SKILL.md")).toBe(false);
		expect(lintedPath("cursor/astack/bin/astack.js")).toBe(false);
		expect(lintedPath("agentskills/skills/tdd/LICENSE.txt")).toBe(false);
		expect(lintedPath("cursor/astack/third_party/flow/NOTICE")).toBe(false);
	});
});
