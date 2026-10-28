import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCard,
	buildSourceInstall,
	CARD_MAX_CHARS,
	CardSizeError,
	renderCard,
	repoCardPaths,
} from "../scripts/build.ts";
import { quotedSections } from "../scripts/lib/ste-own.ts";
import { EXTENSIONS } from "../src/astack/comments/lexer.ts";
import { ok } from "../src/astack/result.ts";

const repoRoot = join(import.meta.dir, "..");

function repoText(path: string): Promise<string> {
	return Bun.file(join(repoRoot, path)).text();
}

function paragraphsOf(markdown: string): readonly string[] {
	return markdown
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
}

describe("rules/comments.md", () => {
	test("each quoted section is a whole paragraph of the frozen Comment Sicko agent, in the agent's order", async () => {
		const agent = paragraphsOf(
			await repoText("upstream/pstack/agents/comment-sicko.md"),
		);
		expect(quotedSections(await repoText("rules/comments.md"))).toEqual(
			ok(agent.filter((_, index) => [6, 8, 9, 10].includes(index))),
		);
	});

	test("holds the copyright line of the frozen pstack licence as its own line", async () => {
		const copyright = (await repoText("upstream/pstack/LICENSE"))
			.split("\n")
			.filter((line) => line.startsWith("Copyright"));
		expect(copyright).toHaveLength(1);
		const lines = (await repoText("rules/comments.md")).split("\n");
		expect(lines.filter((line) => copyright.includes(line))).toEqual(copyright);
	});

	test("its paths name each extension of the comment lexer", async () => {
		expect(await repoText("rules/comments.md")).toStartWith(
			[
				"---",
				"paths:",
				...Object.keys(EXTENSIONS).map((extension) => `  - "**/*${extension}"`),
				"---",
				"",
			].join("\n"),
		);
	});
});

describe("bun run build", () => {
	test("checks each generated source file and install bridge, and each is fresh", () => {
		const run = Bun.spawnSync(["bun", "scripts/build.ts", "--check"], {
			cwd: repoRoot,
		});
		expect(run.stderr.toString()).toBe("");
		expect(run.stdout.toString()).toBe(
			"rules/astack.md fresh\ndocs/migration.md fresh\nmarketplace/plugins/astack/NOTICE fresh\n.claude-plugin/marketplace.json fresh\n.cursor-plugin/marketplace.json fresh\npackage.json fresh\nLICENSE fresh\nNOTICE fresh\n",
		);
		expect(run.exitCode).toBe(0);
	});

	test("takes source package metadata from the plugin and detects a later version change", async () => {
		const dir = await mkdtemp(join(tmpdir(), "astack-source-metadata-"));
		const pluginPath = join(
			dir,
			"marketplace/plugins/astack/.claude-plugin/plugin.json",
		);
		const plugin = {
			name: "astack",
			version: "2.3.4",
			license: "MIT",
			author: { name: "Example Owner" },
		};
		try {
			await Bun.write(
				join(dir, "package.json"),
				JSON.stringify({
					name: "old-name",
					private: false,
					scripts: { test: "bun test" },
					engines: { bun: ">=1" },
				}),
			);
			await Bun.write(pluginPath, JSON.stringify(plugin));
			await Bun.write(
				join(dir, "marketplace/.claude-plugin/marketplace.json"),
				JSON.stringify({
					name: "astack",
					plugins: [{ name: "astack", source: "./plugins/astack" }],
				}),
			);
			await Bun.write(join(dir, "marketplace/plugins/astack/LICENSE"), "MIT\n");
			await Bun.write(
				join(dir, "marketplace/plugins/astack/NOTICE"),
				"Credits\n",
			);
			const written = await buildSourceInstall(dir, "write");
			if (!written.ok) throw new Error(written.error.join("\n"));
			expect(await Bun.file(join(dir, "package.json")).json()).toEqual({
				name: "astack",
				version: "2.3.4",
				private: true,
				author: { name: "Example Owner" },
				license: "MIT",
				bin: { astack: "dist/cli/astack.js" },
				engines: { bun: ">=1", node: ">=22" },
				scripts: { test: "bun test" },
			});
			await Bun.write(
				pluginPath,
				JSON.stringify({ ...plugin, version: "2.3.5" }),
			);
			const checked = await buildSourceInstall(dir, "check");
			if (!checked.ok) throw new Error(checked.error.join("\n"));
			expect(
				checked.value.filter(({ outcome }) => outcome === "stale"),
			).toEqual([{ file: "package.json", outcome: "stale" }]);
			expect(await Bun.file(join(dir, "LICENSE")).text()).toBe("MIT\n");
			expect(await Bun.file(join(dir, "NOTICE")).text()).toBe("Credits\n");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("the rule card", () => {
	test("is copied from the mode reference and refused past its size limits", async () => {
		expect(renderCard("# Card")).toBe("# Card\n");
		expect(() => renderCard("x".repeat(CARD_MAX_CHARS + 1))).toThrow(
			CardSizeError,
		);
		expect(() => renderCard("- x\n".repeat(41))).toThrow(CardSizeError);
		const dir = await mkdtemp(join(tmpdir(), "astack-card-"));
		const paths = {
			source: join(dir, "card.md"),
			target: join(dir, "astack.md"),
		};
		await writeFile(paths.source, "# Card\n");
		expect(await buildCard(paths, "check")).toBe("stale");
		expect(await buildCard(paths, "write")).toBe("written");
		expect(await buildCard(paths, "check")).toBe("fresh");
	});

	test("the card and rules/coding.md stay in their context budget", async () => {
		const card = await Bun.file(repoCardPaths.target).text();
		const coding = await Bun.file(
			join(import.meta.dir, "../rules/coding.md"),
		).text();
		expect(card.length).toBeLessThanOrEqual(6000);
		expect(card.length + coding.length).toBeLessThanOrEqual(10000);
	});
});
