import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseMarketplace } from "../src/astack/marketplace.ts";

const root = resolve(import.meta.dir, "..");

describe("the public source checkout", () => {
	test("root marketplaces resolve built plugins and the Codex user-only policy", () => {
		for (const [manifest, target, policy] of [
			[
				".claude-plugin/marketplace.json",
				".claude-plugin/plugin.json",
				"skills/mode/agents/openai.yaml",
			],
			[
				".cursor-plugin/marketplace.json",
				".cursor-plugin/plugin.json",
				"skills/astack-mode/SKILL.md",
			],
		] as const) {
			const parsed = parseMarketplace(
				readFileSync(join(root, manifest), "utf8"),
			);
			if (!parsed.ok) throw new Error(parsed.error);
			expect(parsed.value.plugins.map((plugin) => plugin.name)).toEqual([
				"astack",
			]);
			for (const plugin of parsed.value.plugins) {
				const pluginRoot = resolve(root, plugin.source);
				const json: unknown = JSON.parse(
					readFileSync(join(pluginRoot, target), "utf8"),
				);
				if (typeof json !== "object" || json === null)
					throw new Error("invalid plugin manifest");
				expect(Reflect.get(json, "name")).toBe(plugin.name);
				const text = readFileSync(join(pluginRoot, policy), "utf8");
				expect(text).toContain(
					manifest.startsWith(".claude")
						? "allow_implicit_invocation: false"
						: 'name: "astack-mode"',
				);
			}
		}
	});

	test("npm installs a working CLI from the source checkout without a build step", () => {
		const scratch = mkdtempSync(join(tmpdir(), "astack-source-install-"));
		try {
			const config = join(scratch, "npmrc");
			writeFileSync(config, "ignore-scripts=true\n");
			const install = Bun.spawnSync(
				[
					"npm",
					"install",
					"--offline",
					"--ignore-scripts",
					"--no-audit",
					"--no-fund",
					"--no-save",
					"--package-lock=false",
					"--loglevel=error",
					root,
				],
				{
					cwd: scratch,
					env: {
						...process.env,
						npm_config_userconfig: config,
						npm_config_cache: join(scratch, "npm-cache"),
					},
				},
			);
			expect({
				code: install.exitCode,
				error: install.stderr.toString(),
			}).toEqual({
				code: 0,
				error: "",
			});
			const run = Bun.spawnSync(
				[join(scratch, "node_modules/.bin/astack"), "--help"],
				{ cwd: scratch },
			);
			expect({
				code: run.exitCode,
				error: run.stderr.toString(),
				hasHookCommand: run.stdout.toString().includes("astack hook"),
			}).toEqual({ code: 0, error: "", hasHookCommand: true });
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
});
