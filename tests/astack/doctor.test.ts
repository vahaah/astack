import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
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
	type CodexHooksRead,
	parseHookList,
} from "../../src/astack/codex-hooks.ts";
import {
	CODEX_HOOK_EVENTS,
	CODEX_HOOK_HASHES,
} from "../../src/astack/codex-trust.ts";
import {
	type BaseReport,
	type ClaudeProfile,
	codexTrustKey,
	diagnose,
	type Finding,
	failed,
	type GhRead,
	type Install,
	readBases,
	type Snapshot,
} from "../../src/astack/doctor.ts";
import { withFragment } from "../../src/astack/print.ts";
import { ASTACK_RULES, ruleLinkName } from "../../src/astack/rules.ts";
import {
	fakeCodex,
	type RecordedReply,
	recordedReply,
	withHook,
} from "./codex-fake.ts";

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
		unattendedReason: undefined,
		skipped: { file: "/state/skip-profiles", dirs: [] },
		reviewProfile: {
			kind: "checked",
			path: ".claude/pr-review-hardening.profile.md",
			problems: [],
		},
		bases: undefined,
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
					hooks: undefined,
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

	test.each([
		[
			{},
			"OK   session: attended. A prompt that a person types can give a merge grant.",
		],
		[
			{ CLAUDE_CODE_ENTRYPOINT: "sdk-ts" },
			"NOTE session: unattended, because CLAUDE_CODE_ENTRYPOINT=sdk-ts. astack records no merge grant from prompts, and /astack:plan asks no questions. A standing grant comes only from merge.authority or merge.standingBases in .astack/profile.json on the PR base branch.",
		],
	])(
		"[control:sg-doctor-unattended] the command names the setting that makes the session unattended (%p)",
		async (env, line) => {
			const home = mkdtempSync(join(tmpdir(), "astack-doctor-session-"));
			try {
				let output = "";
				await command.run([], {
					out: (text) => {
						output += text;
					},
					err: (text) => {
						throw new Error(text);
					},
					cwd: home,
					env: { HOME: home, ASTACK_RUNTIME: process.execPath, ...env },
					today: "2026-01-01",
					now: new Date("2026-01-01T00:00:00Z"),
					scriptPath: undefined,
				});
				expect(
					output.split("\n").filter((text) => text.includes(" session: ")),
				).toEqual([line]);
			} finally {
				rmSync(home, { recursive: true, force: true });
			}
		},
	);

	describe("the Codex trust read of the command", () => {
		const homes: string[] = [];
		afterAll(() => {
			for (const home of homes) rmSync(home, { recursive: true, force: true });
		});
		const pinnedHome = () => {
			const home = mkdtempSync(join(tmpdir(), "astack-doctor-codex-"));
			homes.push(home);
			mkdirSync(join(home, ".codex"));
			mkdirSync(join(home, "bin"));
			writeFileSync(
				join(home, ".codex", "config.toml"),
				[
					'[plugins."astack@astack"]',
					"enabled = true",
					...CODEX_HOOK_EVENTS.flatMap((event) => [
						`[hooks.state."${codexTrustKey("astack@astack", event)}"]`,
						`trusted_hash = "${CODEX_HOOK_HASHES[event]}"`,
					]),
				].join("\n"),
			);
			return home;
		};
		const doctor = async (home: string) => {
			let output = "";
			const status = await command.run([], {
				out: (text) => {
					output += text;
				},
				err: (text) => {
					throw new Error(text);
				},
				cwd: home,
				env: {
					HOME: home,
					ASTACK_RUNTIME: process.execPath,
					PATH: join(home, "bin"),
				},
				today: "2026-01-01",
				now: new Date("2026-01-01T00:00:00Z"),
				scriptPath: undefined,
			});
			return {
				status,
				codex: output
					.split("\n")
					.filter((line) => line.includes(` codex ${home}/.codex: `))
					.map((line) => line.replace(` codex ${home}/.codex:`, "")),
			};
		};

		test("[control:dt-trust-command] a hooks/list reply with one modified astack hook makes doctor fail with its name", async () => {
			const home = pinnedHome();
			fakeCodex(join(home, "bin"), {
				kind: "reply",
				reply: withHook(codexTrustKey("astack@astack", "stop"), {
					trustStatus: "modified",
				}),
			});
			expect(await doctor(home)).toEqual({
				status: 1,
				codex: [
					"FAIL astack@astack is on, but Codex marks its hooks for stop modified and skips them. Open /hooks in Codex and trust them again.",
					"NOTE lowest enforcement rung: 5, text only",
					"NOTE ~/.codex/AGENTS.md holds no astack fragment",
				],
			});
		});

		test("[control:dt-fallback-command] with no codex on PATH, pinned hashes give a WARN and no ok line for the hooks", async () => {
			const home = pinnedHome();
			expect(await doctor(home)).toEqual({
				status: 0,
				codex: [
					"WARN astack cannot read the Codex trust of the astack@astack hooks, because no codex on PATH. A trusted hash that matches its pin proves no trust, because Codex also checks a content hash.",
					"NOTE lowest enforcement rung: 5, text only",
					"NOTE ~/.codex/AGENTS.md holds no astack fragment",
				],
			});
		});
	});

	describe("doctor --skip-profile", () => {
		const homes: string[] = [];
		afterAll(() => {
			for (const home of homes) rmSync(home, { recursive: true, force: true });
		});
		const twoProfiles = () => {
			const home = mkdtempSync(join(tmpdir(), "astack-doctor-skip-"));
			homes.push(home);
			for (const [name, plugins] of [
				[".claude", {}],
				[
					".claude-extra",
					{ "astack@astack": [{ installPath: join(home, "p") }] },
				],
			] as const) {
				mkdirSync(join(home, name, "plugins"), { recursive: true });
				writeFileSync(
					join(home, name, "plugins", "installed_plugins.json"),
					JSON.stringify({ plugins }),
				);
			}
			return home;
		};
		const doctor = async (home: string, args: readonly string[] = []) => {
			let out = "";
			let err = "";
			const status = await command.run(args, {
				out: (text) => {
					out += text;
				},
				err: (text) => {
					err += text;
				},
				cwd: home,
				env: { HOME: home, ASTACK_RUNTIME: process.execPath },
				today: "2026-01-01",
				now: new Date("2026-01-01T00:00:00Z"),
				scriptPath: undefined,
			});
			return { status, out, err };
		};
		const extraLines = (home: string, out: string) =>
			out
				.split("\n")
				.filter((line) => line.includes(` ${join(home, ".claude-extra")}`));

		test("[control:dt-skip] a skipped folder gives one NOTE with the skip file, and its failures no longer fail doctor", async () => {
			const home = twoProfiles();
			const extra = join(home, ".claude-extra");
			const file = join(home, ".local", "state", "astack", "skip-profiles");
			expect((await doctor(home)).status).toBe(1);
			expect(await doctor(home, ["--skip-profile", extra])).toEqual({
				status: 0,
				out: `doctor skips ${extra}, because ${file} lists it\n`,
				err: "",
			});
			expect(await doctor(home, ["--skip-profile", extra])).toEqual({
				status: 0,
				out: `${file} already lists ${extra}\n`,
				err: "",
			});
			expect(readFileSync(file, "utf8")).toBe(`${extra}\n`);
			const after = await doctor(home);
			expect(after.status).toBe(0);
			expect(extraLines(home, after.out)).toEqual([
				`NOTE claude-code ${extra}: doctor skips this folder, because ${file} lists it. Remove that line to check the folder again.`,
			]);
		});

		test("[control:dt-skip-unlisted] a folder that doctor does not check exits 1 with the path", async () => {
			const home = twoProfiles();
			const other = join(home, "elsewhere");
			const result = await doctor(home, ["--skip-profile", other]);
			expect(result.status).toBe(1);
			expect(result.err).toBe(
				`astack doctor: ${other} is not a Claude config folder that doctor checks: ${join(home, ".claude")}, ${join(home, ".claude-extra")}\n`,
			);
		});

		test("[control:dt-skip-write] a failed write exits 1 with the skip file path", async () => {
			const home = twoProfiles();
			mkdirSync(join(home, ".local", "state"), { recursive: true });
			writeFileSync(join(home, ".local", "state", "astack"), "not a folder\n");
			const result = await doctor(home, [
				"--skip-profile",
				join(home, ".claude-extra"),
			]);
			expect(result.status).toBe(1);
			expect(
				result.err.startsWith(
					`astack doctor: cannot write ${join(home, ".local", "state", "astack", "skip-profiles")}: `,
				),
			).toBe(true);
		});
	});

	test("[control:tel-sum] the command sums the events of the last 7 days by rule, surface and outcome, skips a broken line and an older event, and notes a missing log", async () => {
		const home = mkdtempSync(join(tmpdir(), "astack-doctor-events-"));
		const now = new Date("2026-11-20T12:00:00Z");
		const at = (days: number) =>
			new Date(now.getTime() - days * 86_400_000).toISOString();
		const line = (
			days: number,
			rule: string,
			surface: string,
			outcome: string,
		) =>
			JSON.stringify({
				time: at(days),
				turn: 1,
				release: "0.3.0",
				pid: 7,
				handler: "ste-artifact",
				check: "ste",
				event: "write",
				surface,
				rule,
				outcome,
				fingerprint: `${rule}:0000000${days}`,
			});
		const doctor = async (env: Record<string, string>) => {
			let output = "";
			await command.run(["--json"], {
				out: (text) => {
					output += text;
				},
				err: (text) => {
					throw new Error(text);
				},
				cwd: home,
				env: { HOME: home, ASTACK_RUNTIME: process.execPath, ...env },
				today: "2026-11-20",
				now,
				scriptPath: undefined,
			});
			const findings: readonly Finding[] = JSON.parse(output);
			return findings
				.filter((item) => item.area === "ste-events")
				.map((item) => `${item.level} ${item.text}`);
		};
		try {
			const state = join(home, "state");
			expect(await doctor({ ASTACK_STATE_DIR: state })).toEqual([
				"note no events.jsonl in the state folder, so no hook finding is in the log",
			]);
			for (const [session, lines] of [
				[
					"one",
					[
						line(0.5, "contraction", "doc", "deny"),
						line(3, "contraction", "doc", "deny"),
						"{broken",
						line(8, "contraction", "doc", "deny"),
					],
				],
				[
					"two",
					[
						line(1, "word-broad", "commit", "masked"),
						line(6.9, "contraction", "doc", "deny"),
						line(2, "judge", "comment", "advise"),
					],
				],
			] as const) {
				mkdirSync(join(state, "ste", session), { recursive: true });
				writeFileSync(
					join(state, "ste", session, "events.jsonl"),
					`${lines.join("\n")}\n`,
				);
			}
			expect(await doctor({ ASTACK_STATE_DIR: state })).toEqual([
				"note 5 events of the last 7 days in 2 session logs. 1 broken line skipped.",
				"note contraction, doc, deny: 3",
				"note judge, comment, advise: 1",
				"note word-broad, commit, masked: 1",
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("reads missing and broken pack links from an isolated profile", async () => {
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
			expect(fails(diagnose(await gather(io)))).toEqual([]);
			unlinkSync(join(rules, "astack-typescript.md"));
			unlinkSync(join(rules, "astack-postgres.md"));
			symlinkSync(join(home, "absent.md"), join(rules, "astack-postgres.md"));
			expect(fails(diagnose(await gather(io)))).toEqual([
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
					hooks: undefined,
				},
				cursor: {
					local: undefined,
					imported: ["learning-output-style@official"],
				},
			}),
		);
		expect(fails(findings)).toHaveLength(3);
	});

	const pinned = Object.fromEntries(
		CODEX_HOOK_EVENTS.map((event) => [
			codexTrustKey("astack@astack", event),
			CODEX_HOOK_HASHES[event],
		]),
	);
	const stopKey = codexTrustKey("astack@astack", "stop");
	const listed = (reply: RecordedReply): CodexHooksRead => {
		const list = parseHookList(reply.result);
		if (list === undefined) throw new Error("the reply does not parse");
		return { kind: "listed", list };
	};
	const withCodex = (
		hooks: CodexHooksRead,
		trusted: Record<string, string> = pinned,
	) =>
		diagnose(
			snapshot({
				codex: {
					home: "/c",
					enabled: ["astack@astack"],
					trusted,
					fragment: "1.0.0",
					hooks,
				},
			}),
		);
	const codexLines = (findings: readonly Finding[]) =>
		findings
			.filter((item) => item.area === "codex /c")
			.map((item) => `${item.level} ${item.text}`);
	const missingStop = () => {
		const reply = recordedReply();
		for (const entry of reply.result.data)
			entry.hooks = entry.hooks.filter((hook) => hook.key !== stopKey);
		return reply;
	};

	test.each([
		[
			"[control:dt-trust-modified] modified",
			withHook(stopKey, { trustStatus: "modified" }),
			"astack@astack is on, but Codex marks its hooks for stop modified and skips them. Open /hooks in Codex and trust them again.",
		],
		[
			"[control:dt-trust-untrusted] untrusted",
			withHook(stopKey, { trustStatus: "untrusted" }),
			"astack@astack is on, but Codex does not trust its hooks for stop. Open /hooks in Codex and trust them.",
		],
		[
			"[control:dt-trust-disabled] disabled",
			withHook(stopKey, { enabled: false }),
			"astack@astack is on, but its hooks for stop are off in Codex. Turn them on in /hooks in Codex.",
		],
		[
			"[control:dt-trust-missing] missing",
			missingStop(),
			"astack@astack is on, but Codex lists no hook for stop. Add the plugin again with codex plugin add astack@astack.",
		],
	])(
		"a %s astack hook in the hooks/list reply fails with its name",
		(_name, reply, text) => {
			const findings = withCodex(listed(reply));
			expect(fails(findings)).toEqual([text]);
			expect(codexLines(findings)).toContain(
				"note lowest enforcement rung: 5, text only",
			);
		},
	);

	test("[control:dt-trust-ok] 4 trusted hooks pass, and a managed hook passes with a note", () => {
		expect(codexLines(withCodex(listed(recordedReply())))).toEqual([
			"ok astack@astack is on, and Codex trusts its 4 hooks",
			"note lowest enforcement rung: 1",
			"ok ~/.codex/AGENTS.md holds the astack 1.0.0 fragment",
		]);
		expect(
			codexLines(
				withCodex(listed(withHook(stopKey, { trustStatus: "managed" }))),
			).slice(0, 2),
		).toEqual([
			"ok astack@astack is on, and Codex trusts its 4 hooks",
			"note astack@astack: a managed Codex config sets the trust of its hooks for stop",
		]);
	});

	test("[control:dt-trust-entry-error] each error of a hooks/list entry gives a WARN", () => {
		const reply = recordedReply();
		for (const entry of reply.result.data)
			Object.assign(entry, {
				errors: [{ path: "/codex-home/hooks.json", message: "bad matcher" }],
			});
		expect(warnings(withCodex(listed(reply)))).toEqual([
			{
				area: "codex /c",
				level: "warn",
				text: "Codex hooks/list reports an error in /codex-home/hooks.json: bad matcher",
			},
		]);
	});

	test.each([
		["[control:dt-fallback-pinned] pinned hashes", pinned, []],
		[
			"[control:dt-fallback-modified] a hash that is not the pin",
			{ ...pinned, [stopKey]: `sha256:${"0".repeat(64)}` },
			[
				"astack@astack is on, but the trusted hash of stop is not the hash of this release, so Codex marks the hooks modified and skips them. Open /hooks in Codex and trust them again.",
			],
		],
	])(
		"with no hooks/list reply, %s give a WARN with the cause and no ok line",
		(_name, trusted, failures) => {
			const findings = withCodex(
				{ kind: "failed", cause: "no codex on PATH" },
				trusted,
			);
			expect(fails(findings)).toEqual(failures);
			expect(warnings(findings)).toEqual([
				{
					area: "codex /c",
					level: "warn",
					text: "astack cannot read the Codex trust of the astack@astack hooks, because no codex on PATH. A trusted hash that matches its pin proves no trust, because Codex also checks a content hash.",
				},
			]);
			expect(
				codexLines(findings).filter((line) => line.startsWith("ok astack")),
			).toEqual([]);
			expect(codexLines(findings)).toContain(
				"note lowest enforcement rung: 5, text only",
			);
		},
	);

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

	test("fails when the first runtime of bin/astack is a node below the floor, though a newer node comes later", async () => {
		const home = mkdtempSync(join(tmpdir(), "astack-doctor-floor-"));
		try {
			const old = join(home, "node");
			writeFileSync(old, "#!/bin/sh\necho v21.7.3\n");
			chmodSync(old, 0o755);
			const newer = join(home, ".volta", "bin", "node");
			mkdirSync(join(home, ".volta", "bin"), { recursive: true });
			writeFileSync(newer, "#!/bin/sh\necho v24.13.1\n");
			chmodSync(newer, 0o755);
			const io = {
				out: () => {},
				err: () => {},
				cwd: home,
				env: { HOME: home, ASTACK_RUNTIME: old },
				today: "2026-01-01",
				now: new Date("2026-01-01T00:00:00Z"),
				scriptPath: undefined,
			};
			expect(
				fails(diagnose(await gather(io))).filter((text) =>
					text.startsWith("bin/astack"),
				),
			).toEqual([
				`bin/astack picks ${old} first, which is older than node 22, so the hooks do not run. Install node 22 or later, or bun, and run astack doctor --save-runtime with it.`,
			]);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
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

	test.each<[string, Snapshot["reviewProfile"], string]>([
		[
			"[control:dt-review-missing] a repo with no review profile gives a note",
			{ kind: "missing", path: ".claude/pr-review-hardening.profile.md" },
			"note no .claude/pr-review-hardening.profile.md, so /astack:pr-review-hardening stops at load. Draft a profile as the Draft a profile section of references/profile.md of the pr-review-hardening skill says",
		],
		[
			"[control:dt-review-drift] a drifted review profile fails with the problem and its repair",
			{
				kind: "checked",
				path: ".claude/pr-review-hardening.profile.md",
				problems: [
					{
						path: "gates",
						message:
							"needs one gate named change-proof that runs astack check proof",
						repair: "Copy the change-proof gate",
					},
				],
			},
			"fail .claude/pr-review-hardening.profile.md: gates: needs one gate named change-proof that runs astack check proof. Copy the change-proof gate",
		],
		[
			"a review profile that passes each rule is ok",
			{
				kind: "checked",
				path: ".claude/pr-review-hardening.profile.md",
				problems: [],
			},
			"ok .claude/pr-review-hardening.profile.md passes the hardening profile rules",
		],
	])("%s", (_name, reviewProfile, line) => {
		expect(
			diagnose(snapshot({ reviewProfile }))
				.filter((item) => item.area === "review profile /repo")
				.map((item) => `${item.level} ${item.text}`),
		).toEqual([line]);
	});

	test("reports an invalid profile", () => {
		expect(
			fails(diagnose(snapshot({ profile: { kind: "invalid", repo: "/r" } }))),
		).toEqual([".astack/profile.json is not a JSON object"]);
	});
});

describe("base protection", () => {
	const branch = (
		isProtected: boolean,
		enforcement: string,
	): Readonly<Record<string, unknown>> => ({
		name: "main",
		protected: isProtected,
		protection: {
			enabled: isProtected,
			required_status_checks: {
				enforcement_level: enforcement,
				contexts: [],
				checks: [],
			},
		},
	});
	const area = "base protection owner/repo";
	const linesFor = (report: BaseReport) =>
		diagnose(snapshot({ bases: report }))
			.filter((item) => item.area === area)
			.map((item) => `${item.level} ${item.text}`);
	const reader = (
		replies: Readonly<Record<string, unknown>>,
	): { read: GhRead; calls: string[] } => {
		const calls: string[] = [];
		return {
			calls,
			read: (args) => {
				const path = args.at(-1) ?? "";
				calls.push(path);
				return replies[path];
			},
		};
	};

	test.each([
		[
			"[control:dt-base-open] protected false and no ruleset rule",
			branch(false, "off"),
			[],
			"note main has no branch protection and no ruleset rule that blocks a push, so a pushed edit of .claude/pr-review-hardening.profile.md needs no review. Add a ruleset with a pull_request rule on main.",
		],
		[
			"[control:dt-base-classic] classic protection with check enforcement off",
			branch(true, "off"),
			[{ type: "deletion" }],
			"note main has classic protection with required checks off. Only an admin can see a required review, so doctor cannot tell whether a pushed edit of .claude/pr-review-hardening.profile.md needs review.",
		],
		[
			"classic protection with required checks on",
			branch(true, "non_admins"),
			[],
			"ok main has protection that blocks an unreviewed push",
		],
		[
			"a pull_request ruleset rule",
			branch(false, "off"),
			[{ type: "pull_request" }],
			"ok main has protection that blocks an unreviewed push",
		],
	])(
		"%s gives one line and no FAIL",
		(_name, branchReply, rulesReply, line) => {
			const { read } = reader({
				"repos/owner/repo": { default_branch: "main" },
				"repos/owner/repo/branches/main": branchReply,
				"repos/owner/repo/rules/branches/main": rulesReply,
			});
			expect(linesFor(readBases(read, "owner/repo", []))).toEqual([line]);
		},
	);

	test("[control:dt-base-cap] reads the default branch and at most 3 bases, and notes each base past the cap", () => {
		const replies: Record<string, unknown> = {
			"repos/owner/repo": { default_branch: "main" },
		};
		for (const base of ["main", "v2", "v3"]) {
			replies[`repos/owner/repo/branches/${base}`] = branch(true, "everyone");
			replies[`repos/owner/repo/rules/branches/${base}`] = [];
		}
		const { read, calls } = reader(replies);
		const report = readBases(read, "owner/repo", ["v2", "main", "v3", "v4"]);
		expect(calls).toEqual([
			"repos/owner/repo",
			"repos/owner/repo/branches/main",
			"repos/owner/repo/rules/branches/main",
			"repos/owner/repo/branches/v2",
			"repos/owner/repo/rules/branches/v2",
			"repos/owner/repo/branches/v3",
			"repos/owner/repo/rules/branches/v3",
		]);
		expect(linesFor(report).slice(-1)).toEqual([
			"note doctor reads at most 3 bases, so it did not read v4",
		]);
	});

	test("[control:dt-base-gh-fail] the first gh failure gives one note and ends the reads", () => {
		const { read, calls } = reader({
			"repos/owner/repo": { default_branch: "main" },
		});
		const report = readBases(read, "owner/repo", ["v2"]);
		expect(calls).toEqual([
			"repos/owner/repo",
			"repos/owner/repo/branches/main",
		]);
		expect(linesFor(report)).toEqual([
			"note gh could not read the branch main, so doctor reads no more bases",
		]);
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
			hooks: undefined,
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
