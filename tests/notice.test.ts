import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	bundledPackages,
	pluginCredits,
	renderPluginNotice,
} from "../scripts/build.ts";
import {
	AGENT_ORIGINS,
	PATH_ORIGINS,
	SKILL_ORIGINS,
	UPSTREAMS,
	upstreamOrigin,
} from "../scripts/lib/upstreams.ts";
import { err, ok } from "../src/astack/result.ts";
import {
	copiedFrom,
	originFindings,
	pluginItems,
	readUpstreamRuns,
	textsUnder,
} from "./upstream-runs.ts";

const ROOT = join(import.meta.dir, "..");
const runs = readUpstreamRuns();
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function pluginTree(files: Readonly<Record<string, string>>): string {
	const root = mkdtempSync(join(tmpdir(), "astack-notice-"));
	roots.push(root);
	for (const [relpath, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, relpath)), { recursive: true });
		writeFileSync(join(root, relpath), text);
	}
	return root;
}

function skill(name: string, body: string): string {
	return ["---", `name: ${name}`, "description: d", "---", "", body].join("\n");
}

const upstreamText = readFileSync(
	join(ROOT, "upstream/pstack/agents/comment-sicko.md"),
	"utf8",
);
describe("the notice test", () => {
	test("fails on a planted skill or agent that shares a run with an upstream and has no origin, and notes an origin with no shared run", () => {
		const root = pluginTree({
			"skills/copied/SKILL.md": skill("copied", upstreamText),
			"skills/how/SKILL.md": skill("how", upstreamText),
			"skills/reflect/SKILL.md": skill("reflect", "Reply OK."),
			"agents/copied.md": skill("copied", upstreamText),
		});
		expect(originFindings(pluginItems(root), runs)).toEqual({
			gaps: ["skills/copied: pstack", "agents/copied.md: pstack"],
			notes: ["skills/reflect: pstack"],
		});
	});

	const plugins = readdirSync(join(ROOT, "marketplace/plugins")).filter(
		(name) => statSync(join(ROOT, "marketplace/plugins", name)).isDirectory(),
	);

	test.each(plugins)(
		"each item of the %s plugin names in its origin each upstream that it shares a run of 8 words with",
		(plugin) => {
			const { gaps, notes } = originFindings(
				pluginItems(join(ROOT, "marketplace/plugins", plugin)),
				runs,
			);
			for (const note of notes)
				console.log(
					`note: ${plugin}/${note}: the origin names an upstream that the item shares no run with`,
				);
			expect(gaps).toEqual([]);
		},
	);

	test("each rule names in PATH_ORIGINS each upstream that it shares a run of 8 words with", () => {
		const items = readdirSync(join(ROOT, "rules"))
			.filter((name) => name.endsWith(".md"))
			.map((name) => `rules/${name}`)
			.map((path) => ({
				label: path,
				texts: [readFileSync(join(ROOT, path), "utf8")],
				origin: ok(PATH_ORIGINS[path] ?? []),
			}));
		expect(originFindings(items, runs).gaps).toEqual([]);
	});

	test("each module of src/astack names in PATH_ORIGINS each upstream that it shares a run of 24 words with, a length that common code idioms do not reach, and the scan finds pstack in orch and watch-pr", () => {
		const codeRunLength = 24;
		const codeRuns = readUpstreamRuns(codeRunLength);
		const copiedBy = (path: string) =>
			[
				...new Set(
					textsUnder(join(ROOT, path)).flatMap((text) =>
						copiedFrom(codeRuns, text, new Set(), codeRunLength),
					),
				),
			].sort();
		expect(["src/astack/orch", "src/astack/watch-pr"].map(copiedBy)).toEqual([
			["pstack"],
			["pstack"],
		]);
		const gaps = readdirSync(join(ROOT, "src/astack"))
			.map((name) => `src/astack/${name}`)
			.flatMap((path) =>
				copiedBy(path)
					.filter((upstream) => !(PATH_ORIGINS[path] ?? []).includes(upstream))
					.map((upstream) => `${path}: ${upstream}`),
			);
		expect(gaps).toEqual([]);
	});

	test("each origin registry entry names a source path of the repo", () => {
		expect(
			[
				...[...SKILL_ORIGINS.keys()].map(
					(name) => `marketplace/plugins/astack/skills/${name}/SKILL.md`,
				),
				...Object.keys(AGENT_ORIGINS),
				...Object.keys(PATH_ORIGINS),
			].filter((path) => !existsSync(join(ROOT, path))),
		).toEqual([]);
	});
});

describe("the plugin NOTICE", () => {
	test("credits skills from the registry without origin fields in their instructions", () => {
		const root = pluginTree({
			"skills/coding-rules/SKILL.md": skill("coding-rules", "Body."),
			"skills/constructor/SKILL.md": skill("constructor", "Body."),
		});
		expect(pluginCredits(root)).toEqual(
			ok([
				{
					item: "skills/coding-rules",
					upstreams: ["pstack", "mattpocock-skills"],
				},
			]),
		);
	});

	test("refuses a skill whose frontmatter is not closed", () => {
		const root = pluginTree({
			"skills/broken/SKILL.md": "---\nname: broken\n",
		});
		expect(pluginCredits(root)).toEqual(
			err([
				`skills/broken/SKILL.md: ${join(root, "skills/broken/SKILL.md")}: frontmatter is not closed`,
			]),
		);
	});

	test("lists each credit under each upstream that it names, and leaves out an upstream with no credit", () => {
		const notice = renderPluginNotice(
			[
				{ item: "skills/adapted", upstreams: ["pstack"] },
				{ item: "agents/judge.md", upstreams: ["cursor-team-kit", "pstack"] },
			],
			{
				"rules/coding.md": ["pstack"],
				"src/astack/plan": ["pstack"],
			},
		);
		expect(notice).toContain(
			[
				`From pstack, ${upstreamOrigin("pstack")}, MIT License, ${UPSTREAMS.pstack.copyright}:`,
				"",
				"- agents/judge.md",
				"- rules/coding.md in the astack source repo, and its copy in each build",
				"- skills/adapted",
				"- src/astack/plan in the astack source repo, bundled into bin/astack.js",
				"",
			].join("\n"),
		);
		expect(notice).toContain(
			[
				`From cursor-team-kit, ${upstreamOrigin("cursor-team-kit")}, MIT License, ${UPSTREAMS["cursor-team-kit"].copyright}:`,
				"",
				"- agents/judge.md",
				"",
			].join("\n"),
		);
		expect(notice).not.toContain(
			`From ${UPSTREAMS["mattpocock-skills"].label},`,
		);
	});
});

describe("the notice of each bundled package", () => {
	test("gives the licence text of each dependency that the CLI bundle holds, and refuses one that has no LICENSE file", async () => {
		const manifest = (fields: Readonly<Record<string, unknown>>) =>
			JSON.stringify(fields);
		const root = pluginTree({
			"package.json": manifest({ dependencies: { parser: "1.2.3" } }),
			"node_modules/parser/package.json": manifest({
				version: "1.2.3",
				license: "ISC",
			}),
			"node_modules/parser/LICENSE":
				"Copyright Fixture Author\n\nPermission text.\n",
		});
		const bundled = await bundledPackages(root);
		expect(bundled).toEqual(
			ok([
				{
					name: "parser",
					version: "1.2.3",
					license: "ISC",
					notice: "Copyright Fixture Author\n\nPermission text.",
				},
			]),
		);
		expect(
			renderPluginNotice([], {}, bundled.ok ? bundled.value : []),
		).toContain(
			"bin/astack.js bundles the npm package parser 1.2.3, under the ISC License:\n\nCopyright Fixture Author\n\nPermission text.\n",
		);
		rmSync(join(root, "node_modules/parser/LICENSE"));
		expect(await bundledPackages(root)).toEqual(
			err([
				"node_modules/parser has no package.json with a version and a license, or no LICENSE file. Run bun install.",
			]),
		);
	});
});
