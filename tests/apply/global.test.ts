import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { exampleCompanion, writable } from "../../scripts/lib/companion.ts";
import {
	canonicalConfigDir,
	type GlobalInputs,
	installedIn,
	type LinkProbe,
	planGlobal,
	pluginBuildRefusals,
	readMachinePaths,
	tildePath,
} from "../../scripts/lib/global.ts";
import { repoRoot } from "../../scripts/lib/projects.ts";
import { envWithoutCompanion } from "../child-env.ts";

const home = "/home/dev";
const root = "/home/dev/Projects/agent-stack";

function inputs(overrides: Partial<GlobalInputs> = {}): GlobalInputs {
	return {
		root,
		home,
		configDir: "/home/dev/.claude",
		knownMarketplaces: {},
		installedPlugins: { version: 2, plugins: {} },
		probe: () => ({ kind: "missing" }),
		ruleNames: [
			"astack.md",
			"coding.md",
			"comments.md",
			"typescript.md",
			"postgres.md",
		],
		repoRulesDirs: [],
		duplicateSkills: [],
		flowBuilt: true,
		...overrides,
	};
}

function stepTitled(steps: ReturnType<typeof planGlobal>, prefix: string) {
	const step = steps.find((candidate) => candidate.title.startsWith(prefix));
	if (step === undefined) throw new Error(`no step titled ${prefix}`);
	return step;
}

describe("planGlobal", () => {
	test("plans every step on a fresh machine", () => {
		const steps = planGlobal(inputs());
		expect(
			steps.map((step) => ("action" in step ? step.action : step.kind)),
		).toEqual([
			"run",
			"run",
			"create",
			"create",
			"create",
			"create",
			"create",
			"settings",
			"report",
		]);
		expect(stepTitled(steps, "Add the astack marketplace")).toMatchObject({
			argv: [
				"env",
				"-u",
				"CLAUDE_CONFIG_DIR",
				"claude",
				"plugin",
				"marketplace",
				"add",
				`${root}/dist`,
				"--scope",
				"user",
			],
			env: {},
		});
	});

	test("skips the marketplace when it is known with the same path", () => {
		const steps = planGlobal(
			inputs({
				knownMarketplaces: {
					astack: {
						source: { source: "directory", path: `${root}/dist` },
					},
				},
			}),
		);
		expect(stepTitled(steps, "Add the astack marketplace")).toMatchObject({
			action: "skip",
		});
	});

	test("refuses the marketplace and every install when it has another source", () => {
		const steps = planGlobal(
			inputs({
				knownMarketplaces: {
					astack: { source: { source: "github", repo: "acme/x" } },
				},
			}),
		);
		expect(
			steps
				.filter((step) => step.kind === "command")
				.map((step) => step.action),
		).toEqual(["refuse", "refuse"]);
	});

	test("skips an install that already exists at user scope", () => {
		const steps = planGlobal(
			inputs({
				installedPlugins: {
					plugins: { "astack@astack": [{ scope: "user" }] },
				},
			}),
		);
		expect(stepTitled(steps, "Install astack@astack")).toMatchObject({
			action: "skip",
		});
	});

	test("refuses to overwrite a rule file that is not a symlink", () => {
		const probe: LinkProbe = (path) =>
			path.endsWith("astack-coding.md")
				? { kind: "file" }
				: { kind: "missing" };
		const steps = planGlobal(inputs({ probe }));
		expect(stepTitled(steps, "Link rules/coding.md")).toMatchObject({
			action: "refuse",
		});
		expect(stepTitled(steps, "Link rules/comments.md")).toMatchObject({
			action: "create",
		});
	});

	test("replaces a symlink that points elsewhere and skips a correct one", () => {
		const probe: LinkProbe = (path) =>
			path.endsWith("astack-coding.md")
				? { kind: "symlink", target: "/old/coding.md" }
				: { kind: "symlink", target: `${root}/rules/comments.md` };
		const steps = planGlobal(inputs({ probe }));
		expect(stepTitled(steps, "Link rules/coding.md")).toMatchObject({
			action: "replace",
		});
		expect(stepTitled(steps, "Link rules/comments.md")).toMatchObject({
			action: "skip",
		});
	});

	test("refuses to link a rule that has not been built", () => {
		const steps = planGlobal(inputs({ ruleNames: ["coding.md"] }));
		expect(stepTitled(steps, "Link rules/comments.md")).toMatchObject({
			action: "refuse",
		});
	});

	test("links into CLAUDE_CONFIG_DIR when it is set", () => {
		const steps = planGlobal(inputs({ configDir: "/home/dev/.claude-a" }));
		expect(stepTitled(steps, "Link rules/coding.md")).toMatchObject({
			target: "/home/dev/.claude-a/rules/astack-coding.md",
		});
	});

	test("links the rule card as astack.md", () => {
		const steps = planGlobal(inputs());
		expect(stepTitled(steps, "Link rules/astack.md")).toMatchObject({
			source: `${root}/rules/astack.md`,
			target: "/home/dev/.claude/rules/astack.md",
			action: "create",
		});
	});

	test("prints the settings change instead of editing settings", () => {
		const steps = planGlobal(
			inputs({
				repoRulesDirs: [".claude/rules/standards", ".claude/rules/standards"],
				dotfilesSettings: "/home/dev/config/claude/settings.py",
			}),
		);
		const settings = steps.find((step) => step.kind === "settings");
		expect(settings?.json).toEqual({
			permissions: {
				allow: [
					"Read(~/Projects/agent-stack/dist/**)",
					"Read(~/.claude/plugins/**)",
					"Bash(astack:*)",
					"Edit(~/.local/state/pstack/**)",
				],
			},
			enabledPlugins: {
				"astack@astack": true,
			},
			claudeMdExcludes: [
				"**/.claude/rules/standards/coding.md",
				"**/.claude/rules/standards/comments.md",
				"**/.claude/rules/standards/typescript.md",
				"**/.claude/rules/standards/postgres.md",
			],
		});
		expect(settings?.instructions.join("\n")).toContain(
			"Only extraKnownMarketplaces.astack",
		);
		expect(settings?.instructions.join("\n")).toContain(
			"~/config/claude/settings.json",
		);
	});
});

describe("profiles", () => {
	test("adds a plugin Read rule for each extra profile directory", () => {
		const steps = planGlobal(
			inputs({
				profileDirs: [
					"/home/dev/.claude",
					"/home/dev/.claude-a",
					"/home/dev/.claude-b",
				],
			}),
		);
		const settings = steps.find((step) => step.kind === "settings");
		if (settings?.kind !== "settings") throw new Error("no settings step");
		const permissions: unknown = settings.json.permissions;
		const allow: unknown =
			typeof permissions === "object" && permissions !== null
				? Reflect.get(permissions, "allow")
				: undefined;
		if (!Array.isArray(allow)) throw new Error("no allow list");
		expect(allow).toContain("Read(~/.claude-a/plugins/**)");
		expect(allow).toContain("Read(~/.claude-b/plugins/**)");
		expect(
			allow.filter((rule) => rule === "Read(~/.claude/plugins/**)"),
		).toHaveLength(1);
	});

	test("the default profile unsets CLAUDE_CONFIG_DIR, and another profile sets it", () => {
		for (const step of planGlobal(inputs()))
			if (step.kind === "command") {
				expect(step.argv.slice(0, 4)).toEqual([
					"env",
					"-u",
					"CLAUDE_CONFIG_DIR",
					"claude",
				]);
				expect(step.env).toEqual({});
			}
		for (const step of planGlobal(inputs({ configDir: "/home/dev/.claude-a" })))
			if (step.kind === "command") {
				expect(step.argv[0]).toBe("claude");
				expect(step.env).toEqual({
					CLAUDE_CONFIG_DIR: "/home/dev/.claude-a",
				});
			}
	});

	test("a profile whose plugins dir is a symlink resolves to the shared dir", () => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-cfg-")));
		try {
			mkdirSync(join(dir, "canon/plugins"), { recursive: true });
			mkdirSync(join(dir, "jw"));
			symlinkSync(join(dir, "canon/plugins"), join(dir, "jw/plugins"));
			expect(canonicalConfigDir(join(dir, "jw"))).toBe(join(dir, "canon"));
			expect(canonicalConfigDir(join(dir, "canon"))).toBe(join(dir, "canon"));
			expect(canonicalConfigDir(join(dir, "missing"))).toBe(
				join(dir, "missing"),
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("apply --global with no companion", () => {
	function applyGlobal(...flags: string[]) {
		const freshHome = realpathSync(mkdtempSync(join(tmpdir(), "astack-home-")));
		const { CLAUDE_CONFIG_DIR: _unset, ...env } = envWithoutCompanion();
		try {
			mkdirSync(join(freshHome, "config/claude"), { recursive: true });
			writeFileSync(join(freshHome, "config/claude/settings.py"), "");
			return spawnSync("bun", ["scripts/apply.ts", "--global", ...flags], {
				cwd: repoRoot,
				encoding: "utf8",
				env: {
					...env,
					HOME: freshHome,
					PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
				},
			});
		} finally {
			rmSync(freshHome, { recursive: true, force: true });
		}
	}

	test("a dry run prints the profiles and the dotfiles dir of the example machine", () => {
		const lines = applyGlobal("--dry-run").stdout.split("\n");
		const verify = lines.indexOf("## Verify (read-only in a dry run)") + 2;
		expect({
			profiles: lines.slice(verify, lines.indexOf("", verify)),
			profileLists: lines.filter((line) =>
				/^ {4}\$ CLAUDE_CONFIG_DIR=\S+ claude plugin list$/.test(line),
			),
			cd: lines.filter((line) => line.startsWith("    $ cd ~/")),
			generated: lines.filter((line) => line.includes(" is generated by ")),
		}).toEqual({
			profiles: [
				"- ~/.claude: missing",
				"- ~/.claude-a: missing",
				"- ~/.claude-b: missing",
			],
			profileLists: [
				"    $ CLAUDE_CONFIG_DIR=~/.claude-a claude plugin list",
				"    $ CLAUDE_CONFIG_DIR=~/.claude-b claude plugin list",
			],
			cd: ["    $ cd ~/Projects/agent-stack", "    $ cd ~/config/claude"],
			generated: [
				"    - ~/.claude/settings.json is generated by ~/config/claude/settings.py. Do not edit the live file.",
			],
		});
	});

	test("a write refuses the example companion before it reads the machine", () => {
		const run = applyGlobal();
		expect({
			code: run.status,
			stdout: run.stdout,
			refusal: writable(exampleCompanion(repoRoot)),
		}).toEqual({
			code: 1,
			stdout: "",
			refusal: { ok: false, error: run.stderr.replace(/\n$/, "") },
		});
	});
});

describe("readMachinePaths", () => {
	test.each([
		[
			"no file",
			undefined,
			" does not exist. Write the config dir, the dotfiles dir and the profile dirs of the machine in it.",
		],
		[
			"one profile dir in place of a list",
			{
				config: "~/.claude",
				dotfiles: "~/config/claude",
				profiles: "~/.claude-a",
			},
			": profiles must be a list of profile dirs",
		],
		[
			"no config dir",
			{ dotfiles: "~/config/claude", profiles: [] },
			": config must be the path of the Claude config dir",
		],
	])(
		"a machine.json with %s gives an error",
		async (_name, machine, message) => {
			const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-machine-")));
			const path = join(dir, "machine.json");
			try {
				if (machine !== undefined) writeFileSync(path, JSON.stringify(machine));
				expect(await readMachinePaths(path)).toEqual({
					ok: false,
					error: `${path}${message}`,
				});
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		},
	);
});

describe("the duplicate skills report", () => {
	test("is the last step and never runs or links anything", () => {
		const steps = planGlobal(
			inputs({
				duplicateSkills: [
					{
						name: "tdd",
						path: "/home/dev/.claude/skills/tdd",
						kind: "symlink",
						target: "/home/dev/.agents/skills/tdd",
						source: "mattpocock/skills",
						flowSkill: "astack:tdd",
						verdict: "superseded",
						skillsTxt: [{ line: 9, text: "mattpocock/skills tdd" }],
					},
				],
				skillsTxtPath: "/home/dev/config/claude/skills.txt",
			}),
		);
		const report = steps.at(-1);
		expect(report?.kind).toBe("report");
		if (report?.kind !== "report") throw new Error("no report step");
		const text = report.lines.join("\n");
		expect(text).toContain("~/.claude/skills/tdd -> ~/.agents/skills/tdd");
		expect(text).toContain("$ npx skills remove --global -y tdd");
		expect(text).toContain(
			"delete these lines from ~/config/claude/skills.txt",
		);
		expect(text).toContain("  9: mattpocock/skills tdd");
	});
});

describe("pluginBuildRefusals", () => {
	const manifest = {
		plugins: [{ name: "astack" }],
	};

	test("passes when every plugin is listed and built", () => {
		expect(pluginBuildRefusals(manifest, () => true)).toEqual([]);
	});

	test("names a plugin the marketplace does not list and one that is not built", () => {
		expect(pluginBuildRefusals({ plugins: [] }, () => false)).toEqual([
			"dist/.claude-plugin/marketplace.json does not list astack",
			"dist/claude-code/astack/.claude-plugin/plugin.json is missing. Run `bun run dist` first",
		]);
	});

	test("refuses a missing marketplace manifest", () => {
		expect(pluginBuildRefusals(undefined, () => true)).toEqual([
			"dist/.claude-plugin/marketplace.json is missing",
		]);
	});
});

describe("helpers", () => {
	test("tildePath shortens paths under home only", () => {
		expect(tildePath("/home/dev/x/y", home)).toBe("~/x/y");
		expect(tildePath("/opt/x", home)).toBe("/opt/x");
	});

	test("installedIn reports user-scope installs", () => {
		expect(
			installedIn({
				plugins: {
					"astack@astack": [{ scope: "project" }],
				},
			}),
		).toEqual({
			present: [],
			missing: ["astack@astack"],
		});
	});
});
