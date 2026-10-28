import { describe, expect, test } from "bun:test";
import {
	formatSettings,
	isGithubRepo,
	mergeMarketplaceWiring,
	parseSettings,
	pendingWiring,
} from "../../scripts/lib/settings.ts";

const allow = [
	"Read(~/.claude/plugins/**)",
	"Bash(astack:*)",
	"Edit(~/.local/state/pstack/**)",
];

const wiring = {
	extraKnownMarketplaces: {
		astack: { source: { source: "github", repo: "acme/astack" } },
	},
	enabledPlugins: {
		"astack@astack": true,
	},
	permissions: { allow },
};

describe("mergeMarketplaceWiring", () => {
	test("creates the wiring when the repo has no settings file", () => {
		const merged = mergeMarketplaceWiring(undefined, "acme/astack");
		expect(merged).toEqual({
			ok: true,
			settings: wiring,
			changed: true,
			notes: [],
		});
	});

	test("keeps existing keys and their order, and appends the wiring", () => {
		const existing = {
			permissions: { allow: ["Bash(bun run *)"] },
			model: "x",
		};
		const merged = mergeMarketplaceWiring(existing, "acme/astack");
		if (!merged.ok) throw new Error(merged.reason);
		expect(Object.keys(merged.settings)).toEqual([
			"permissions",
			"model",
			"extraKnownMarketplaces",
			"enabledPlugins",
		]);
		expect(merged.settings.permissions).toEqual({
			allow: ["Bash(bun run *)", ...allow],
		});
	});

	test("keeps other marketplaces and other enabled plugins", () => {
		const existing = {
			extraKnownMarketplaces: {
				other: { source: { source: "github", repo: "acme/other" } },
			},
			enabledPlugins: { "tool@other": false },
		};
		const merged = mergeMarketplaceWiring(existing, "acme/astack");
		if (!merged.ok) throw new Error(merged.reason);
		expect(merged.settings.extraKnownMarketplaces).toEqual({
			...existing.extraKnownMarketplaces,
			...wiring.extraKnownMarketplaces,
		});
		expect(merged.settings.enabledPlugins).toEqual({
			"tool@other": false,
			...wiring.enabledPlugins,
		});
	});

	test("reports no change when the wiring is already there", () => {
		const merged = mergeMarketplaceWiring(wiring, "acme/astack");
		expect(merged).toEqual({
			ok: true,
			settings: wiring,
			changed: false,
			notes: [],
		});
	});

	test("leaves a plugin the repo turned off as it is, with a note", () => {
		const existing = { enabledPlugins: { "astack@astack": false } };
		const merged = mergeMarketplaceWiring(existing, "acme/astack");
		if (!merged.ok) throw new Error(merged.reason);
		expect(merged.settings.enabledPlugins).toEqual({
			"astack@astack": false,
		});
		expect(merged.notes).toEqual([
			"astack@astack is set to false in the repo; left as it is",
		]);
	});

	test("refuses to replace a marketplace declared with another source", () => {
		const existing = {
			extraKnownMarketplaces: {
				astack: { source: { source: "directory", path: "/tmp/x" } },
			},
		};
		const merged = mergeMarketplaceWiring(existing, "acme/astack");
		expect(merged.ok).toBe(false);
		if (merged.ok) return;
		expect(merged.reason).toContain('"source":"directory"');
	});

	test.each([
		["/Users/someone/agent-stack"],
		["./marketplace"],
		["https://github.com/acme/astack"],
		["<PLACEHOLDER vahaah/astack>"],
		["acme"],
	])("refuses %p as a marketplace source", (repo) => {
		expect(mergeMarketplaceWiring(undefined, repo).ok).toBe(false);
	});

	test.each([
		[[], "not a JSON object"],
		["text", "not a JSON object"],
		[{ extraKnownMarketplaces: [] }, "extraKnownMarketplaces"],
		[{ enabledPlugins: "all" }, "enabledPlugins"],
		[{ permissions: { allow: "Read" } }, "permissions.allow"],
	])("refuses malformed settings %p", (existing, reason) => {
		const merged = mergeMarketplaceWiring(existing, "acme/astack");
		expect(merged.ok).toBe(false);
		if (merged.ok) return;
		expect(merged.reason).toContain(reason);
	});
});

describe("settings text", () => {
	test("formats with two-space indent and a trailing newline", () => {
		expect(formatSettings({ a: { b: 1 } })).toBe(
			'{\n  "a": {\n    "b": 1\n  }\n}\n',
		);
	});

	test("parses a missing file as no settings", () => {
		expect(parseSettings(undefined)).toEqual({ ok: true, value: undefined });
	});

	test("rejects invalid JSON with a reason", () => {
		const parsed = parseSettings("{ nope");
		expect(parsed.ok).toBe(false);
	});

	test("pending wiring carries the allow rules that composition by path needs", () => {
		expect(pendingWiring().permissions).toEqual({ allow });
	});

	test("pending wiring names the placeholder, never a directory", () => {
		expect(JSON.stringify(pendingWiring())).toContain(
			"<PLACEHOLDER vahaah/astack>",
		);
		expect(JSON.stringify(pendingWiring())).not.toContain("directory");
	});

	test("accepts a plain GitHub owner/repo only", () => {
		expect(isGithubRepo("acme-co/agent-stack.v2")).toBe(true);
		expect(isGithubRepo("acme/astack/extra")).toBe(false);
		expect(isGithubRepo("-acme/astack")).toBe(false);
	});
});
