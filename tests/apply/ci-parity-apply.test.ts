import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CiParityConfig } from "../../scripts/lib/ci-parity.ts";
import {
	dryRunProject,
	worktreeProject,
} from "../../scripts/lib/project-apply.ts";
import { validateProjectConfig } from "../../scripts/lib/projects.ts";
import { astackTree, companionTree, emptyDeny } from "./astack-tree.ts";
import { fixtureConfig, fixtureProfile, repo } from "./ci-parity-fixtures.ts";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	dirs.push(dir);
	return dir;
}

function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

function write(root: string, path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function seed(extra: Readonly<Record<string, string>> = {}): {
	main: string;
	worktrees: string;
	scratch: string;
} {
	const root = tempDir("astack-parity-");
	const origin = join(root, "origin.git");
	const first = join(root, "seed");
	const main = join(root, "main");
	git(root, "init", "-q", "--bare", "-b", "main", origin);
	git(root, "clone", "-q", origin, first);
	git(first, "config", "user.name", "Test Owner");
	git(first, "config", "user.email", "owner@example.com");
	write(first, ".gitignore", "node_modules/\n");
	write(first, "CONTEXT.md", "# Context\n");
	write(first, "docs/adr/0001-start.md", "# Start\n");
	write(first, "CLAUDE.md", "# Acme\n\nRun `bun run test` before a PR.\n");
	cpSync(join(repo, ".github"), join(first, ".github"), { recursive: true });
	cpSync(join(repo, ".bun-version"), join(first, ".bun-version"));
	for (const [path, text] of Object.entries(extra)) write(first, path, text);
	git(first, "add", "-A");
	git(first, "commit", "-qm", "feat(core): start the repo");
	git(first, "push", "-q", "origin", "main");
	git(root, "clone", "-q", origin, main);
	git(main, "config", "user.name", "Test Owner");
	git(main, "config", "user.email", "owner@example.com");
	return {
		main,
		worktrees: join(root, "worktrees"),
		scratch: join(root, "scratch"),
	};
}

function profileDir(gates: "before" | "after", text = fixtureProfile(gates)) {
	const dir = tempDir("astack-parity-profile-");
	write(dir, "pr-review-hardening.profile.md", text);
	return dir;
}

function acme(
	main: string,
	ciParity: CiParityConfig,
	mode: "write" | "report-only" = "write",
) {
	const renders = mode === "write";
	return validateProjectConfig(
		{
			name: "acme",
			path: main,
			mode,
			rulesDir: ".claude/rules/standards",
			artifacts: {
				rules: false,
				settings: false,
				reviewStub: renders,
				agentDocs: false,
				profile: renders,
			},
			tracker: { kind: "none", dir: "docs/tickets" },
			domain: { glossary: "CONTEXT.md", adrDir: "docs/adr" },
			keepPatterns: [],
			lint: { adrCitation: false, conflictMarkers: true, denySubstrings: [] },
			gates: [],
			ciOnlyGates: [],
			ciParity,
			commentConflicts: [],
			adrNeeded: renders ? [] : [{ rule: "r", source: "s", need: "n" }],
		},
		"acme",
	);
}

const none: CiParityConfig = { setup: [], map: [], exclude: [] };
const parityHeading = "## CI parity of the hardening profile";
const unmappedValidate =
	"- UNMAPPED check.yml#validate. No gate runs: `bun install --frozen-lockfile`, `bun run lint`, `bun run db:test:setup`, `cd apps/tasks && bunx worker-cli@1.2.3 deploy --dry-run`";

describe("apply --worktree checks CI parity before it commits", () => {
	const { main, worktrees } = seed();
	const worktree = join(worktrees, "acme", "astack-setup");
	const runWith = async (gates: "before" | "after", config: CiParityConfig) => {
		const lines: string[] = [];
		const code = await worktreeProject(acme(main, config), {
			astackRoot: astackTree(tempDir("astack-src-"), "committed"),
			companionRoot: companionTree(tempDir("companion-src-"), "committed"),
			worktrees,
			trailers: [],
			keep: false,
			today: "2026-10-16",
			deny: emptyDeny,
			profileDir: profileDir(gates),
			log: (line = "") => lines.push(line),
		});
		return { code, lines };
	};

	test("a profile with a CI gap is refused, and the worktree is removed", async () => {
		const { code, lines } = await runWith("before", none);
		expect(code).toBe(1);
		expect(lines).toContain(parityHeading);
		expect(lines).toContain(unmappedValidate);
		expect(lines).toContain("FAIL: 5 CI parity failure(s).");
		expect(existsSync(worktree)).toBe(false);
	});

	test("a profile that mirrors CI is committed with its parity report", async () => {
		const { code, lines } = await runWith("after", fixtureConfig);
		expect(code).toBe(0);
		expect(lines).toContain(
			"- check.yml#validate: mapped by command to lint, typecheck, test, worker-bundle",
		);
		expect(
			git(worktree, "show", "--name-only", "--format=", "HEAD").split("\n"),
		).toContain(".claude/pr-review-hardening.profile.md");
	});
});

describe("apply takes the overlay of the base branch", () => {
	const { main, worktrees } = seed();
	git(main, "switch", "-qc", "v2");
	write(main, "V2.md", "# Meta 2\n");
	git(main, "add", "V2.md");
	git(main, "commit", "-qm", "feat(core): start v2");
	git(main, "push", "-q", "origin", "v2");
	git(main, "switch", "-q", "main");
	const worktree = join(worktrees, "acme", "astack-setup");
	const profiles = profileDir("before");
	write(
		profiles,
		"branches/v2/pr-review-hardening.profile.md",
		fixtureProfile("after"),
	);
	const config = {
		...acme(main, none),
		branches: {
			v2: {
				gates: [{ name: "overlay gate", run: ["true"] }],
				ciOnlyGates: [
					{ name: "v2 smoke", source: "check.yml:1", reason: "Needs a stack." },
				],
				ciParity: fixtureConfig,
			},
		},
	};
	const runWith = async (extra: {
		base?: string;
		branch?: string;
		update?: true;
		overlay?: string;
	}) => {
		const lines: string[] = [];
		const code = await worktreeProject(config, {
			astackRoot: astackTree(tempDir("astack-src-"), "committed"),
			companionRoot: companionTree(tempDir("companion-src-"), "committed"),
			worktrees,
			trailers: [],
			keep: false,
			today: "2026-10-16",
			deny: emptyDeny,
			profileDir: profiles,
			log: (line = "") => lines.push(line),
			...extra,
		});
		return { code, lines };
	};
	const first = runWith({ base: "origin/v2" });

	test("a base with an overlay takes its gates, CI-only gates, CI parity and profile", async () => {
		const { code, lines } = await first;
		expect(code).toBe(0);
		expect(lines).toContain(
			"Overlay: v2, from branches.v2 of projects/acme.json and projects/acme/branches/v2/pr-review-hardening.profile.md",
		);
		expect(lines.some((line) => line.startsWith("- overlay gate: pass"))).toBe(
			true,
		);
		expect(lines).toContain("- v2 smoke (check.yml:1): Needs a stack.");
		expect(lines).toContain("Open the pull request against v2.");
		expect(
			readFileSync(
				join(worktree, ".claude/pr-review-hardening.profile.md"),
				"utf8",
			),
		).toBe(fixtureProfile("after"));
	});

	test("a local base with an overlay opens the pull request against that branch, not the default branch", async () => {
		await first;
		const { code, lines } = await runWith({
			base: "v2",
			branch: "astack/local-v2-setup",
		});
		expect(code).toBe(0);
		expect(lines).toContain(
			"Overlay: v2, from branches.v2 of projects/acme.json and projects/acme/branches/v2/pr-review-hardening.profile.md",
		);
		expect(lines).toContain("Open the pull request against v2.");
	});

	test("a base with no overlay takes the top of the config, as before", async () => {
		await first;
		const { code, lines } = await runWith({ branch: "astack/main-setup" });
		expect(code).toBe(1);
		expect(lines.some((line) => line.startsWith("Overlay:"))).toBe(false);
		expect(lines).toContain(unmappedValidate);
		expect(lines).toContain("FAIL: 5 CI parity failure(s).");
	});

	test("an update of a branch on an overlay base needs --overlay, and then writes the overlay profile", async () => {
		await first;
		const before = git(worktree, "rev-parse", "HEAD");
		const changed = `${fixtureProfile("after")}\nThe v2 CI has no deploy job.\n`;
		write(profiles, "branches/v2/pr-review-hardening.profile.md", changed);
		const missing = await runWith({ update: true });
		expect(missing.code).toBe(1);
		expect(missing.lines).toContain(
			"Refused: astack/setup holds commits of origin/v2 that origin/main does not hold, so the v2 overlay applies to it. Pass --overlay v2.",
		);
		expect(git(worktree, "rev-parse", "HEAD")).toBe(before);
		const updated = await runWith({ update: true, overlay: "v2" });
		expect(updated.code).toBe(0);
		expect(git(worktree, "rev-parse", "HEAD~1")).toBe(before);
		expect(
			readFileSync(
				join(worktree, ".claude/pr-review-hardening.profile.md"),
				"utf8",
			),
		).toBe(changed);
		expect(git(worktree, "log", "-1", "--format=%b")).toContain(
			"Written by `bun run apply --project acme --worktree --update --overlay v2` in the astack repo.",
		);
	});
});

describe("apply --dry-run checks CI parity", () => {
	const { main, scratch } = seed();
	const runWith = async (
		gates: "before" | "after",
		config: CiParityConfig,
		mode: "write" | "report-only" = "write",
	) => {
		const lines: string[] = [];
		const code = await dryRunProject(acme(main, config, mode), {
			scratch,
			keep: false,
			deny: emptyDeny,
			profileDir: profileDir(gates),
			log: (line = "") => lines.push(line),
		});
		return { code, lines };
	};

	test("a profile with a CI gap fails the dry run", async () => {
		const { code, lines } = await runWith("before", none);
		expect(code).toBe(1);
		expect(lines).toContain(unmappedValidate);
		expect(lines).toContain("FAIL: 5 CI parity failure(s).");
	});

	test("a profile that mirrors CI passes the dry run", async () => {
		const { code, lines } = await runWith("after", fixtureConfig);
		expect(code).toBe(0);
		expect(lines).toContain(
			"Not run on a pull request: deploy.yaml (push, workflow_dispatch)",
		);
	});

	const buildGate = (
		rewrites: string,
		name = "portal-build",
		command = "bun run --filter=@acme/app build",
	) =>
		[
			`  - name: ${name}`,
			`    command: ${command}`,
			"    env: []",
			"    requires: []",
			"    setup: []",
			"    when_changed: []",
			"    ci_env: []",
			"    after: []",
			"    tools: {}",
			`    rewrites: ${rewrites}`,
			"  - name: manifest-lint",
			"",
		].join("\n");

	async function runTracked(rewrites: string, gate = buildGate(rewrites)) {
		const tracked = seed({
			"apps/app/package.json": JSON.stringify({
				name: "@acme/app",
				scripts: { build: "next build", dev: "next dev" },
			}),
			"apps/app/next-env.d.ts": 'import "./.next/dev/types/routes.d.ts";\n',
			"packages/supabase/package.json": JSON.stringify({
				name: "@acme/supabase",
				scripts: {
					generate:
						"supabase gen types typescript --local > src/types/db.generated.ts",
				},
			}),
			"packages/supabase/src/types/db.generated.ts":
				"export type Database = {};\n",
		});
		const lines: string[] = [];
		const code = await dryRunProject(acme(tracked.main, fixtureConfig), {
			scratch: tracked.scratch,
			keep: false,
			deny: emptyDeny,
			profileDir: profileDir(
				"after",
				fixtureProfile("after").replace("  - name: manifest-lint\n", gate),
			),
			log: (line = "") => lines.push(line),
		});
		return { code, lines };
	}

	test("a build gate of an app that tracks next-env.d.ts fails the dry run until the gate names the file in rewrites", async () => {
		const { code, lines } = await runTracked("[]");
		expect(code).toBe(1);
		expect(lines).toContain("## Tracked files that a gate writes");
		expect(lines).toContain(
			"- PROBLEM The gate portal-build runs next build or next dev in apps/app, and git tracks apps/app/next-env.d.ts. next writes that file again when its text is not the text of the command. Add apps/app/next-env.d.ts to the rewrites of the gate, with the reason, so the run restores the file after the gate.",
		);
		expect(lines).toContain("FAIL: 1 rewrites problem(s).");
	});

	test("a build gate that restores next-env.d.ts passes the dry run, and a rewrites path that git does not track fails it", async () => {
		const restored = await runTracked(
			"[{path: apps/app/next-env.d.ts, why: next build writes the import of its route types.}]",
		);
		expect(restored.code).toBe(0);
		expect(restored.lines).toContain(
			"- portal-build rewrites apps/app/next-env.d.ts, and the run restores it after the gate.",
		);
		const stale = await runTracked(
			"[{path: apps/app/next-env.d.ts, why: next build writes it.}, {path: apps/web/next-env.d.ts, why: next build writes it.}]",
		);
		expect(stale.code).toBe(1);
		expect(stale.lines).toContain(
			"- PROBLEM The gate portal-build names apps/web/next-env.d.ts in rewrites, but git does not track that file, so the run cannot restore it.",
		);
	});

	test("a gate that runs supabase gen types into a tracked file fails the dry run until the gate names the file in rewrites", async () => {
		const types = "packages/supabase/src/types/db.generated.ts";
		const typesGate = (rewrites: string) =>
			buildGate(
				rewrites,
				"db-types",
				"bun run --filter=@acme/supabase generate",
			);
		const open = await runTracked("[]", typesGate("[]"));
		expect(open.code).toBe(1);
		expect(open.lines).toContain(
			`- PROBLEM The gate db-types redirects the output of a command, such as supabase gen types, into a file in packages/supabase, and git tracks ${types}. The redirect writes the output of the command over that file each time the gate runs. Add ${types} to the rewrites of the gate, with the reason, so the run restores the file after the gate.`,
		);
		expect(open.lines).toContain("FAIL: 1 rewrites problem(s).");
		const restored = await runTracked(
			"[]",
			typesGate(`[{path: ${types}, why: supabase gen types writes it.}]`),
		);
		expect(restored.code).toBe(0);
	});

	test("a report-only project fails on a CI gap in its profile, and passes without one", async () => {
		const gap = await runWith("before", none, "report-only");
		expect(gap.code).toBe(1);
		expect(gap.lines).toContain(unmappedValidate);
		const mirrored = await runWith("after", fixtureConfig, "report-only");
		expect(mirrored.code).toBe(0);
		expect(mirrored.lines).toContain(parityHeading);
	});
});

describe("apply --dry-run checks what each gate reads from the tree", () => {
	async function dryRun(
		extra: Readonly<Record<string, string>>,
		profile: string,
		keepPatterns: readonly string[] = [],
		mode: "write" | "report-only" = "write",
	) {
		const tree = seed(extra);
		const lines: string[] = [];
		const code = await dryRunProject(
			{
				...acme(tree.main, fixtureConfig, mode),
				keepPatterns: [...keepPatterns],
			},
			{
				scratch: tree.scratch,
				keep: false,
				deny: emptyDeny,
				profileDir: profileDir("after", profile),
				log: (line = "") => lines.push(line),
			},
		);
		return { code, lines };
	}

	const portal = {
		".gitignore": "node_modules/\n.env*\n!.env.example\n",
		"apps/app/package.json": JSON.stringify({
			name: "@acme/app",
			scripts: { build: "next build" },
		}),
		"apps/app/.env.example": "NEXT_PUBLIC_SUPABASE_URL=\n",
	};
	const withPortalGate = (requires: string) =>
		fixtureProfile("after").replace(
			"  - name: manifest-lint\n",
			[
				"  - name: portal-build",
				"    command: bun run --filter=@acme/app build",
				"    env: []",
				`    requires: ${requires}`,
				"    setup: []",
				"    when_changed: []",
				"    ci_env: []",
				"    after: []",
				"    tools: {}",
				"    rewrites: []",
				"  - name: manifest-lint",
				"",
			].join("\n"),
		);

	test("a gate that builds an app with an ignored env file fails the dry run until a prerequisite checks the file", async () => {
		const missing = await dryRun(portal, withPortalGate("[]"));
		expect(missing.code).toBe(1);
		expect(missing.lines).toContain("## Env files that a gate reads");
		expect(missing.lines).toContain(
			"- PROBLEM The gate portal-build runs apps/app, and git tracks apps/app/.env.example there. The app reads an env file that git ignores, so a new worktree does not have it, and the gate fails on the base too. Add a prerequisite whose check names that file, such as `test -f apps/app/.env`.",
		);
		expect(missing.lines).toContain("FAIL: 1 env file problem(s).");
		const checked = await dryRun(
			portal,
			withPortalGate(
				"[{name: apps/app/.env of this worktree, check: test -f apps/app/.env, on_missing: stop}]",
			),
		);
		expect(checked.code).toBe(0);
	});

	const turboScripts = {
		"package.json": JSON.stringify({
			name: "acme",
			scripts: { typecheck: "turbo run typecheck" },
		}),
	};
	const typecheckGate =
		"    command: bun run typecheck\n    env: []\n    requires: []\n    setup: []\n    when_changed: []\n    ci_env: []\n";

	test("a gate that runs a cached turbo task fails the dry run until it sets TURBO_FORCE", async () => {
		const cached = await dryRun(turboScripts, fixtureProfile("after"));
		expect(cached.code).toBe(1);
		expect(cached.lines).toContain(
			'- PROBLEM The gate typecheck runs `turbo run typecheck` with no --force, so turbo can replay a cached green over a red tree. CI has no turbo cache. Set TURBO_FORCE to "true" in the ci_env of the gate, with a why.',
		);
		expect(cached.lines).toContain("FAIL: 1 task cache problem(s).");
		const profile = fixtureProfile("after");
		expect(profile).toContain(typecheckGate);
		const forced = await dryRun(
			turboScripts,
			profile.replace(
				typecheckGate,
				typecheckGate.replace(
					"    ci_env: []\n",
					'    ci_env:\n      - name: TURBO_FORCE\n        value: "true"\n        why: CI has no turbo cache.\n',
				),
			),
		);
		expect(forced.code).toBe(0);
	});

	const lockScripts = {
		"package.json": JSON.stringify({
			name: "acme",
			scripts: { "e2e:full": "bun tooling/e2e-lock.ts" },
		}),
		"tooling/e2e-lock.ts": 'Bun.spawn(["lockf", "-k", "/tmp/e2e.lock"]);\n',
	};
	const withE2eGate = (requires: string) =>
		fixtureProfile("after").replace(
			"  - name: manifest-lint\n",
			[
				"  - name: e2e",
				"    command: bun run e2e:full",
				"    env: []",
				`    requires: ${requires}`,
				"    setup: []",
				"    when_changed: []",
				"    ci_env: []",
				"    after: []",
				"    tools: {}",
				"    rewrites: []",
				"  - name: manifest-lint",
				"",
			].join("\n"),
		);

	test("a gate whose script runs lockf fails the dry run until a prerequisite tests for lockf", async () => {
		const missing = await dryRun(lockScripts, withE2eGate("[]"));
		expect(missing.code).toBe(1);
		expect(missing.lines).toContain("## Tools that only one platform ships");
		expect(missing.lines).toContain(
			"- PROBLEM The gate e2e needs lockf in the e2e:full script of the repo root, through tooling/e2e-lock.ts. lockf ships only on macOS and BSD, so the gate cannot start on another host. Add a prerequisite whose check tests for lockf, such as `command -v lockf`. Or make the gate command an if that tests for lockf, and run a portable form with no lockf in its else branch.",
		);
		expect(missing.lines).toContain("FAIL: 1 platform tool problem(s).");
		const tested = await dryRun(
			lockScripts,
			withE2eGate(
				"[{name: lockf on this host, check: command -v lockf >/dev/null, on_missing: stop}]",
			),
		);
		expect(tested.code).toBe(0);
	});

	const money = {
		"packages/db/src/schema.ts":
			"// Money convention (ADR-0006): integer minor units.\nexport const money = 1;\n",
	};
	const keeping = (pattern: string) =>
		fixtureProfile("after").replace(
			"  keep_patterns: []\n",
			`  keep_patterns:\n    - '${pattern}'\n`,
		);

	test("a decision citation in the repo fails the dry run until a keep pattern of the repo keeps its spelling", async () => {
		const spaced = "\\bADR \\d{4}\\b";
		const unkept = await dryRun(money, keeping(spaced), [spaced]);
		expect(unkept.code).toBe(1);
		expect(unkept.lines).toContain("## Decision citations in the repo");
		expect(
			unkept.lines.filter((line) =>
				line.startsWith(
					"- PROBLEM packages/db/src/schema.ts:1 `// Money convention (ADR-0006): integer minor units.` cites a decision",
				),
			),
		).toHaveLength(1);
		expect(unkept.lines).toContain(
			"FAIL: 1 decision citation(s) that the comment hook does not keep.",
		);
		const both = "\\bADR[- ]\\d{4}\\b";
		const kept = await dryRun(money, keeping(both), [both]);
		expect(kept.code).toBe(0);
	});

	test("a doc that cites a line of a file that apply writes fails the dry run until it cites the file with no line", async () => {
		const profile = ".claude/pr-review-hardening.profile.md";
		const cited = await dryRun(
			{ "docs/stack.md": `Start the stack as \`${profile}:12\` says.\n` },
			fixtureProfile("after"),
		);
		expect(cited.code).toBe(1);
		expect(cited.lines).toContain(
			"## Line citations of the files that apply writes",
		);
		expect(cited.lines).toContain(
			`- PROBLEM docs/stack.md:1 cites ${profile}:12, a line of a file that apply writes. Each apply update can move that line, so the citation goes stale. Cite the file with no line number, and quote its words or name its heading.`,
		);
		expect(cited.lines).toContain(
			"FAIL: 1 line citation(s) of a file that apply writes.",
		);
		const named = await dryRun(
			{ "docs/stack.md": `Start the stack as \`${profile}\` says.\n` },
			fixtureProfile("after"),
		);
		expect(named.code).toBe(0);
	});

	test("a context map that is no file of the repo fails the dry run until it names a tracked file", async () => {
		async function withContextMap(contextMap: string) {
			const tree = seed({
				"docs/context/billing.md": "# Billing\n",
				"docs/context-map.md": "# Context map\n",
			});
			const project = acme(tree.main, fixtureConfig);
			const lines: string[] = [];
			const code = await dryRunProject(
				{
					...project,
					artifacts: { ...project.artifacts, agentDocs: true },
					domain: { ...project.domain, contextMap },
				},
				{
					scratch: tree.scratch,
					keep: false,
					deny: emptyDeny,
					profileDir: profileDir("after"),
					log: (line = "") => lines.push(line),
				},
			);
			return { code, lines };
		}
		const wrongMaps: readonly (readonly [string, string])[] = [
			["docs/context", "directory"],
			["docs/missing.md", "missing"],
		];
		for (const [path, kind] of wrongMaps) {
			const wrong = await withContextMap(path);
			expect(wrong.code).toBe(1);
			expect(wrong.lines).toContain(
				`Problem: domain points at ${path}, which is ${kind}, not a file`,
			);
			expect(wrong.lines).toContain("FAIL: 1 flow config problem(s).");
		}
		const tracked = await withContextMap("docs/context-map.md");
		expect(tracked.lines).toContain(
			"Domain docs found: CONTEXT.md, docs/context-map.md, docs/adr.",
		);
		expect(tracked.code).toBe(0);
	});

	test("a doc that cites a line of a rule that apply writes fails the report-only dry run too", async () => {
		const rule = ".claude/rules/standards/coding.md";
		const cited = await dryRun(
			{ "docs/adr/0002-comments.md": `The rule \`${rule}:39\` holds.\n` },
			fixtureProfile("after"),
			[],
			"report-only",
		);
		expect(cited.code).toBe(1);
		expect(cited.lines).toContain(
			`- PROBLEM docs/adr/0002-comments.md:1 cites ${rule}:39, a line of a file that apply writes. Each apply update can move that line, so the citation goes stale. Cite the file with no line number, and quote its words or name its heading.`,
		);
		expect(cited.lines).toContain(
			"FAIL: 1 line citation(s) of a file that apply writes.",
		);
		const named = await dryRun(
			{ "docs/adr/0002-comments.md": `The rule \`${rule}\` holds.\n` },
			fixtureProfile("after"),
			[],
			"report-only",
		);
		expect(named.code).toBe(0);
	});

	test("a decision citation fails the report-only dry run too", async () => {
		const spaced = "\\bADR \\d{4}\\b";
		const unkept = await dryRun(
			money,
			keeping(spaced),
			[spaced],
			"report-only",
		);
		expect(unkept.code).toBe(1);
		expect(unkept.lines).toContain(
			"FAIL: 1 decision citation(s) that the comment hook does not keep.",
		);
		const both = "\\bADR[- ]\\d{4}\\b";
		const kept = await dryRun(money, keeping(both), [both], "report-only");
		expect(kept.code).toBe(0);
	});
});

describe("apply --dry-run copies the repo for its checks", () => {
	test("the copy preserves tracked and ignored files, modes, and links, skips nested worktrees, and isolates writes", async () => {
		const tree = seed({ ".gitignore": "node_modules/\n.claude/worktrees/\n" });
		write(tree.main, "node_modules/left-pad/index.js", "module.exports = 1;\n");
		write(tree.main, "run.sh", "#!/bin/sh\nexit 0\n");
		chmodSync(join(tree.main, "run.sh"), 0o755);
		symlinkSync(
			"node_modules/left-pad/index.js",
			join(tree.main, "dependency-link"),
		);
		git(
			tree.main,
			"worktree",
			"add",
			"-q",
			"-b",
			"side",
			".claude/worktrees/side",
		);
		const code = await dryRunProject(acme(tree.main, fixtureConfig), {
			scratch: tree.scratch,
			keep: true,
			deny: emptyDeny,
			profileDir: profileDir("after"),
			log: () => {},
		});
		expect(code).toBe(0);
		const copies = readdirSync(tree.scratch).map((name) =>
			join(tree.scratch, name),
		);
		expect(
			copies.flatMap((copy) =>
				[
					"CLAUDE.md",
					"node_modules/left-pad/index.js",
					".claude/worktrees/side/CLAUDE.md",
				].filter((path) => existsSync(join(copy, path))),
			),
		).toEqual(["CLAUDE.md", "node_modules/left-pad/index.js"]);
		for (const copy of copies) {
			expect(lstatSync(join(copy, "run.sh")).mode & 0o777).toBe(0o755);
			expect(readlinkSync(join(copy, "dependency-link"))).toBe(
				"node_modules/left-pad/index.js",
			);
			write(copy, "node_modules/left-pad/index.js", "module.exports = 2;\n");
			expect(
				readFileSync(join(tree.main, "node_modules/left-pad/index.js"), "utf8"),
			).toBe("module.exports = 1;\n");
		}
	});
});
