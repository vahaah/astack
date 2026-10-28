import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	codexState,
	command,
	gather,
	tomlTables,
} from "../../src/astack/cli/commands/doctor.ts";
import {
	CODEX_HOOK_EVENTS,
	CODEX_HOOK_HASHES,
} from "../../src/astack/codex-trust.ts";
import {
	type ClaudeProfile,
	codexTrustKey,
	diagnose,
	type Finding,
	failed,
	type Install,
	type Snapshot,
} from "../../src/astack/doctor.ts";
import { withFragment } from "../../src/astack/print.ts";
import { ASTACK_RULES, ruleLinkName } from "../../src/astack/rules.ts";

function install(
	plugin: string,
	marketplace = "astack",
	extra: Partial<Install> = {},
): Install {
	return {
		plugin,
		marketplace,
		path: `/cache/${plugin}`,
		skills: [],
		stopHook: false,
		...extra,
	};
}

function profile(extra: Partial<ClaudeProfile> = {}): ClaudeProfile {
	return {
		dir: "/home/.claude",
		installs: [install("astack")],
		enabled: [],
		ruleCard: 5000,
		ruleNames: ["astack.md", "astack-models.md"],
		readableRules: ASTACK_RULES.map(({ name }) => ruleLinkName(name)),
		...extra,
	};
}

function snapshot(extra: Partial<Snapshot> = {}): Snapshot {
	return {
		runtime: { current: "node v24", found: "/opt/homebrew/bin/node" },
		claude: [profile()],
		codex: undefined,
		cursor: undefined,
		agentsSkills: [],
		profile: { kind: "present", repo: "/repo", keys: ["ste", "tracker"] },
		...extra,
	};
}

function fails(findings: readonly Finding[]): string[] {
	return findings
		.filter((item) => item.level === "fail")
		.map((item) => item.text);
}

function warnings(findings: readonly Finding[]): Finding[] {
	return findings.filter((item) => item.level === "warn");
}

describe("astack doctor", () => {
	test("a clean install has no failure", () => {
		const findings = diagnose(snapshot());
		expect(fails(findings)).toEqual([]);
		expect(warnings(findings)).toEqual([]);
		expect(failed(findings)).toBe(false);
		expect(findings.map((item) => item.text)).toContain(
			".astack/profile.json sets ste, tracker",
		);
	});

	test("fails with no runtime for a GUI app", () => {
		expect(
			fails(
				diagnose(snapshot({ runtime: { current: "bun", found: undefined } })),
			),
		).toHaveLength(1);
	});

	test("fails on two copies of one plugin and on a legacy copy beside astack", () => {
		const findings = diagnose(
			snapshot({
				claude: [
					profile({
						installs: [
							install("astack"),
							install("astack", "other"),
							install("craft", "agent-stack"),
						],
					}),
				],
			}),
		);
		expect(fails(findings)).toEqual([
			"astack is installed 2 times: astack@astack, astack@other. Keep one copy.",
			"craft@agent-stack is the old name of astack. Uninstall it when astack is installed, or each check runs twice.",
		]);
	});

	test("warns about retired plugins, native pstack and the old model rule", () => {
		const findings = diagnose(
			snapshot({
				claude: [
					profile({
						installs: [
							install("astack"),
							install("pstack"),
							install("flow"),
							install("pstack", "native"),
						],
						ruleNames: ["astack.md", "pstack-models.md"],
					}),
				],
			}),
		);
		expect(warnings(findings)).toEqual([
			{
				area: "claude-code /home/.claude",
				level: "warn",
				text: "pstack@astack is retired. The astack plugin holds its skills. Remove the old plugin.",
			},
			{
				area: "claude-code /home/.claude",
				level: "warn",
				text: "flow@astack is retired. The astack plugin holds its skills. Remove the old plugin.",
			},
			{
				area: "claude-code /home/.claude",
				level: "warn",
				text: "pstack@native is a separate pstack install. The astack plugin holds its skills. Keep one plugin for these skills.",
			},
			{
				area: "claude-code /home/.claude",
				level: "warn",
				text: "rules/pstack-models.md uses the old name. Use astack:setup-models to replace it with rules/astack-models.md.",
			},
		]);
		expect(fails(findings)).toEqual([]);
		expect(failed(findings)).toBe(false);
	});

	test("warns about old plugins enabled in Codex or imported by Cursor", () => {
		const findings = diagnose(
			snapshot({
				codex: {
					home: "/c",
					enabled: ["flow@astack"],
					trusted: {},
					fragment: "0.1.0",
				},
				cursor: { local: "0.1.0", imported: ["pstack@native"] },
			}),
		);
		expect(warnings(findings)).toEqual([
			{
				area: "codex /c",
				level: "warn",
				text: "flow@astack is retired. The astack plugin holds its skills. Remove the old plugin.",
			},
			{
				area: "cursor",
				level: "warn",
				text: "pstack@native is a separate pstack install. The astack plugin holds its skills. Keep one plugin for these skills.",
			},
		]);
		expect(fails(findings)).toEqual([]);
	});

	test("the command reads old model rule names from an isolated profile", async () => {
		const home = mkdtempSync(join(tmpdir(), "astack-doctor-"));
		try {
			const dir = join(home, ".claude");
			mkdirSync(join(dir, "plugins"), { recursive: true });
			mkdirSync(join(dir, "rules"));
			writeFileSync(
				join(dir, "plugins/installed_plugins.json"),
				'{"plugins":{}}\n',
			);
			writeFileSync(join(dir, "rules/pstack-models.md"), "# Models\n");
			let output = "";
			const status = await command.run([], {
				out: (text) => {
					output += text;
				},
				err: (text) => {
					throw new Error(text);
				},
				cwd: home,
				env: { HOME: home, ASTACK_RUNTIME: process.execPath },
				today: "2026-01-01",
				now: new Date("2026-01-01T00:00:00Z"),
				scriptPath: undefined,
			});
			expect(status).toBe(0);
			expect(
				output.split("\n").filter((line) => line.startsWith("WARN")),
			).toEqual([
				`WARN claude-code ${dir}: rules/pstack-models.md uses the old name. Use astack:setup-models to replace it with rules/astack-models.md.`,
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("reads missing and broken pack links from an isolated profile", () => {
		const home = mkdtempSync(join(tmpdir(), "astack-doctor-packs-"));
		try {
			const dir = join(home, ".claude");
			const rules = join(dir, "rules");
			mkdirSync(join(dir, "plugins"), { recursive: true });
			mkdirSync(rules);
			writeFileSync(
				join(dir, "plugins/installed_plugins.json"),
				JSON.stringify({
					plugins: { "astack@astack": [{ installPath: join(home, "plugin") }] },
				}),
			);
			for (const { name } of ASTACK_RULES)
				writeFileSync(join(rules, ruleLinkName(name)), `# ${name}\n`);
			const io = {
				out: () => {},
				err: () => {},
				cwd: home,
				env: { HOME: home, ASTACK_RUNTIME: process.execPath },
				today: "2026-01-01",
				now: new Date("2026-01-01T00:00:00Z"),
				scriptPath: undefined,
			};
			expect(fails(diagnose(gather(io)))).toEqual([]);
			unlinkSync(join(rules, "astack-typescript.md"));
			unlinkSync(join(rules, "astack-postgres.md"));
			symlinkSync(join(home, "absent.md"), join(rules, "astack-postgres.md"));
			expect(fails(diagnose(gather(io)))).toEqual([
				"rules/astack-typescript.md is missing or unreadable. Add the rule link from the install steps.",
				"rules/astack-postgres.md is missing or unreadable. Add the rule link from the install steps.",
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("fails on an output-style plugin in any tool", () => {
		const findings = diagnose(
			snapshot({
				claude: [profile({ enabled: ["learning-output-style@official"] })],
				codex: {
					home: "/home/.codex",
					enabled: ["explanatory-output-style@official"],
					trusted: {},
					fragment: undefined,
				},
				cursor: {
					local: undefined,
					imported: ["learning-output-style@official"],
				},
			}),
		);
		expect(fails(findings)).toHaveLength(3);
	});

	test("fails on untrusted or modified Codex hooks and passes when all four match", () => {
		const codex = (trusted: Record<string, string>) =>
			snapshot({
				codex: {
					home: "/c",
					enabled: ["astack@astack"],
					trusted,
					fragment: "1.0.0",
				},
			});
		const pinned = Object.fromEntries(
			CODEX_HOOK_EVENTS.map((event) => [
				codexTrustKey("astack@astack", event),
				CODEX_HOOK_HASHES[event],
			]),
		);
		expect(
			fails(
				diagnose(
					codex({
						[codexTrustKey("astack@astack", "stop")]: CODEX_HOOK_HASHES.stop,
					}),
				),
			),
		).toEqual([
			"astack@astack is on, but Codex does not trust its hooks for session_start, user_prompt_submit, pre_tool_use. Open /hooks in Codex and trust them.",
		]);
		expect(
			fails(
				diagnose(
					codex({
						...pinned,
						[codexTrustKey("astack@astack", "stop")]:
							`sha256:${"0".repeat(64)}`,
					}),
				),
			),
		).toEqual([
			"astack@astack is on, but the trusted hash of stop is not the hash of this release, so Codex marks the hooks modified and skips them. Open /hooks in Codex and trust them again.",
		]);
		expect(fails(diagnose(codex(pinned)))).toEqual([]);
	});

	test("fails with no rule card where astack is installed, and names the effect of other Stop hooks", () => {
		const findings = diagnose(
			snapshot({
				claude: [
					profile({
						ruleCard: undefined,
						installs: [
							install("astack"),
							install("warp", "claude-code-warp", { stopHook: true }),
						],
					}),
				],
			}),
		);
		expect(fails(findings)).toEqual([
			expect.stringContaining("this profile has no rules/astack.md link"),
		]);
		expect(findings.map((item) => item.text)).toContain(
			"other plugins with a Stop hook: warp. Warp notifies on the first reply, before an STE rewrite exists.",
		);
	});

	test("counts legacy craft as rung 1", () => {
		const findings = diagnose(
			snapshot({
				claude: [
					profile({
						installs: [install("craft", "agent-stack"), install("pstack")],
					}),
				],
			}),
		);
		expect(findings.map((item) => item.text)).toContain(
			"lowest enforcement rung: 1, from the legacy craft hooks",
		);
	});

	test("counts a user record and a home project record of one path as one copy", () => {
		const findings = diagnose(
			snapshot({
				claude: [
					profile({
						installs: [install("astack"), install("astack")],
					}),
				],
			}),
		);
		expect(fails(findings)).toEqual([]);
		expect(findings.map((item) => item.text)).toContain(
			"astack@astack is installed",
		);
	});

	test("fails on a node runtime below the floor", () => {
		expect(
			fails(
				diagnose(
					snapshot({
						runtime: {
							current: "node v24",
							found: undefined,
							old: "/usr/local/bin/node",
						},
					}),
				),
			),
		).toEqual([
			"bin/astack finds only /usr/local/bin/node, which is older than node 22, so the hooks do not run. Install node 22 or later, or bun, and run astack doctor --save-runtime with it.",
		]);
	});

	test("fails when ~/.agents/skills repeats a plugin skill in either name form", () => {
		const findings = diagnose(
			snapshot({
				claude: [
					profile({
						installs: [
							install("astack", "astack", { skills: ["plan", "grilling"] }),
						],
					}),
				],
				agentsSkills: ["grilling", "astack-plan", "unrelated"],
			}),
		);
		expect(fails(findings)).toEqual([
			"~/.agents/skills repeats 2 plugin skill(s): grilling, astack-plan. Claude Code reads that folder through the links in each skills folder of a profile, and Codex and Grok Build read it too, so each one shows twice. Remove them, and the links to them in each skills folder of a profile, with: rm -r ~/.agents/skills/grilling ~/.agents/skills/astack-plan",
		]);
		const own = diagnose(
			snapshot({
				claude: [
					profile({
						installs: [install("astack", "astack", { skills: ["grilling"] })],
					}),
				],
				claudeSkills: [{ path: "/home/.claude/skills", names: ["grilling"] }],
			}),
		);
		expect(fails(own)).toEqual([
			"/home/.claude/skills repeats 1 plugin skill(s): grilling. Claude Code reads that folder, so each one shows twice. Remove them with: rm -r /home/.claude/skills/grilling",
		]);
	});

	test("fails on a local Cursor plugin beside an imported Claude copy", () => {
		const findings = diagnose(
			snapshot({ cursor: { local: "0.1.0", imported: ["astack@astack"] } }),
		);
		expect(fails(findings)).toHaveLength(1);
	});

	test("reports an invalid profile", () => {
		expect(
			fails(diagnose(snapshot({ profile: { kind: "invalid", repo: "/r" } }))),
		).toEqual([".astack/profile.json is not a JSON object"]);
	});
});

describe("the Codex config reader", () => {
	const config = [
		'model = "x"',
		'[plugins."astack@astack"]',
		"enabled = true",
		'[plugins."flow@astack"]',
		"enabled = false",
		'[hooks.state."astack@astack:hooks/hooks.json:stop:0:0"]',
		'trusted_hash = "sha256:abc"',
	].join("\n");

	test("reads the tables it needs", () => {
		expect(tomlTables(config).get('plugins."astack@astack"')).toEqual({
			enabled: "true",
		});
	});

	test("lists enabled plugins, trusted hooks and the fragment version", () => {
		expect(
			codexState(
				"/c",
				config,
				"x\n<!-- astack 0.1.0 -->\nrules\n<!-- /astack 0.1.0 -->\n",
			),
		).toEqual({
			home: "/c",
			enabled: ["astack@astack"],
			trusted: { "astack@astack:hooks/hooks.json:stop:0:0": "sha256:abc" },
			fragment: "0.1.0",
		});
	});
});

describe("astack print", () => {
	test("codex-agents replaces an old astack block and keeps the rest", () => {
		const old =
			"# Mine\n\n<!-- astack 0.1.0 -->\nold\n<!-- /astack 0.1.0 -->\n\n## After\n";
		const next = "<!-- astack 0.2.0 -->\nnew\n<!-- /astack 0.2.0 -->\n";
		expect(withFragment(old, next)).toBe(
			"# Mine\n\n<!-- astack 0.2.0 -->\nnew\n<!-- /astack 0.2.0 -->\n\n## After\n",
		);
		expect(withFragment("# Mine\n", next)).toBe(`# Mine\n\n${next}`);
		expect(withFragment("", next)).toBe(next);
	});
});
