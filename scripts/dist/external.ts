import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CODEX_HOOK_EVENTS,
	CODEX_HOOK_HASHES,
} from "../../src/astack/codex-trust.ts";
import { codexTrustKey } from "../../src/astack/doctor.ts";
import type { CheckReport } from "./checks.ts";
import type { Plugin } from "./codemods.ts";
import { isUserOnly, type Skill } from "./skills.ts";
import { CLAUDE_ROOT } from "./targets/claude-code.ts";
import { CURSOR_ROOT } from "./targets/cursor.ts";
import { CLI_PATH } from "./targets/root.ts";

type Run = {
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
};

function run(
	argv: readonly string[],
	cwd: string,
	env: Record<string, string | undefined> = {},
	stdin?: string,
): Run {
	try {
		const result = Bun.spawnSync([...argv], {
			cwd,
			env: { ...process.env, ...env },
			stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
			stdout: "pipe",
			stderr: "pipe",
			timeout: 120_000,
		});
		return {
			exitCode: result.exitCode,
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
		};
	} catch (error) {
		return { exitCode: null, stdout: "", stderr: String(error) };
	}
}

export function onPath(command: string): boolean {
	return Bun.which(command) !== null;
}

export function claudeValidate(
	distRoot: string,
	plugins: readonly Plugin[],
): CheckReport {
	if (!onPath("claude"))
		return {
			id: "claude-validate",
			errors: [],
			summary: "skipped, no claude on PATH",
		};
	const dirs = [
		distRoot,
		...plugins.map((plugin) => join(distRoot, CLAUDE_ROOT, plugin)),
	];
	const errors = dirs.flatMap((dir) => {
		const result = run(
			["claude", "plugin", "validate", dir, "--strict"],
			distRoot,
		);
		return result.exitCode === 0
			? []
			: [
					`claude plugin validate ${dir} --strict failed:\n${`${result.stdout}${result.stderr}`.trim()}`,
				];
	});
	return {
		id: "claude-validate",
		errors,
		summary: `claude plugin validate --strict on the marketplace and ${dirs.length - 1} plugins`,
	};
}

const SKILL_LINE = /^- ([a-z0-9-]+):([a-z0-9-]+): /;

export function listedSkills(promptInput: string): Set<string> {
	const found = new Set<string>();
	let parsed: unknown;
	try {
		parsed = JSON.parse(promptInput);
	} catch {
		return found;
	}
	const texts: string[] = [];
	const collect = (value: unknown): void => {
		if (typeof value === "string") texts.push(value);
		else if (Array.isArray(value)) value.forEach(collect);
		else if (typeof value === "object" && value !== null)
			Object.values(value).forEach(collect);
	};
	collect(parsed);
	for (const text of texts)
		for (const line of text.split("\n")) {
			const match = SKILL_LINE.exec(line);
			if (match?.[1] && match[2]) found.add(`${match[1]}:${match[2]}`);
		}
	return found;
}

export type CodexExpectation = {
	readonly plugin: Plugin;
	readonly skills: readonly Skill[];
};

export function codexFindings(
	listed: ReadonlySet<string>,
	expected: readonly CodexExpectation[],
): string[] {
	return expected.flatMap(({ plugin, skills }) =>
		skills.flatMap((skill) => {
			const name = `${plugin}:${skill.name}`;
			const userOnly = isUserOnly(skill.values);
			if (userOnly && listed.has(name))
				return [`Codex lists ${name}, but it sets disable-model-invocation`];
			if (!userOnly && !listed.has(name))
				return [`Codex does not list ${name}`];
			return [];
		}),
	);
}

export function codexHashFindings(listing: string | undefined): string[] {
	if (listing === undefined)
		return ["codex app-server hooks/list gave no reply"];
	let parsed: unknown;
	try {
		parsed = JSON.parse(listing);
	} catch {
		return ["codex app-server hooks/list gave no JSON"];
	}
	const hashes =
		typeof parsed === "object" && parsed !== null ? parsed : undefined;
	return CODEX_HOOK_EVENTS.flatMap((event) => {
		const key = codexTrustKey("astack@astack", event);
		const actual = hashes === undefined ? undefined : Reflect.get(hashes, key);
		return actual === CODEX_HOOK_HASHES[event]
			? []
			: [
					`Codex shows ${String(actual)} for ${key}, but src/astack/codex-trust.ts pins ${CODEX_HOOK_HASHES[event]}. Update the pin when hooks.json changes on purpose.`,
				];
	});
}

export function codexProbe(
	distRoot: string,
	expected: readonly CodexExpectation[],
): CheckReport {
	if (!onPath("codex"))
		return { id: "codex", errors: [], summary: "skipped, no codex on PATH" };
	const scratch = mkdtempSync(join(tmpdir(), "astack-codex-"));
	try {
		const home = join(scratch, "home");
		const workspace = join(scratch, "workspace");
		mkdirSync(home);
		mkdirSync(workspace);
		writeFileSync(join(workspace, "README.md"), "probe\n");
		const env = { HOME: home, CODEX_HOME: join(scratch, "codex") };
		mkdirSync(env.CODEX_HOME);
		const steps = [
			["codex", "plugin", "marketplace", "add", distRoot],
			...expected.map(({ plugin }) => [
				"codex",
				"plugin",
				"add",
				`${plugin}@astack`,
			]),
		];
		for (const step of steps) {
			const result = run(step, workspace, env);
			if (result.exitCode !== 0)
				return {
					id: "codex",
					errors: [
						`${step.join(" ")} failed:\n${`${result.stdout}${result.stderr}`.trim()}`,
					],
					summary: "",
				};
		}
		const prompt = run(["codex", "debug", "prompt-input"], workspace, env);
		if (prompt.exitCode !== 0)
			return {
				id: "codex",
				errors: [`codex debug prompt-input failed:\n${prompt.stderr.trim()}`],
				summary: "",
			};
		const listed = listedSkills(prompt.stdout);
		const hooks = run(
			["bun", join(import.meta.dir, "codex-hooks.ts"), workspace],
			workspace,
			env,
		);
		return {
			id: "codex",
			errors: [
				...codexFindings(listed, expected),
				...codexHashFindings(hooks.exitCode === 0 ? hooks.stdout : undefined),
			],
			summary: `codex debug prompt-input in a temporary CODEX_HOME and HOME lists ${listed.size} plugin skills, and codex app-server hooks/list shows the pinned hook hashes`,
		};
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

export function cliSmoke(distRoot: string): CheckReport {
	const errors: string[] = [];
	if (onPath("node")) {
		const help = run(["node", join(distRoot, CLI_PATH), "--help"], distRoot);
		if (help.exitCode !== 0 || !help.stdout.includes("astack hook"))
			errors.push(`node ${CLI_PATH} --help failed: ${help.stderr.trim()}`);
	}
	const launcher = join(distRoot, CURSOR_ROOT, "bin", "astack");
	const bare = mkdtempSync(join(tmpdir(), "astack-launcher-"));
	try {
		for (const event of [
			"preToolUse",
			"beforeShellExecution",
			"beforeMCPExecution",
			"beforeSubmitPrompt",
			"stop",
		]) {
			const result = run(
				["/bin/sh", launcher, "hook", "cursor", event],
				bare,
				{ PATH: bare, HOME: bare, ASTACK_RUNTIME: "" },
				"{}",
			);
			let parsed: unknown;
			try {
				parsed = JSON.parse(result.stdout);
			} catch {
				parsed = undefined;
			}
			if (typeof parsed !== "object" || parsed === null)
				errors.push(
					`the Cursor launcher with no PATH printed ${JSON.stringify(result.stdout.trim())} for ${event}, not JSON`,
				);
		}
		const copy = join(bare, "copy", "bin");
		mkdirSync(copy, { recursive: true });
		for (const file of ["astack", "astack.js", "package.json"])
			writeFileSync(
				join(copy, file),
				readFileSync(join(distRoot, CURSOR_ROOT, "bin", file)),
			);
		if (onPath("node")) {
			const loaded = run(
				[
					"node",
					"--no-experimental-detect-module",
					join(copy, "astack.js"),
					"--help",
				],
				bare,
			);
			if (!loaded.stdout.includes("astack hook"))
				errors.push(
					`a copy of bin/ outside the repository does not load as an ES module: ${loaded.stderr.trim().split("\n")[0] ?? ""}`,
				);
		}
	} finally {
		rmSync(bare, { recursive: true, force: true });
	}
	const shell = run(
		["sh", launcher, "hook", "cursor", "beforeShellExecution"],
		distRoot,
		{},
		JSON.stringify({ command: "echo probe", cwd: distRoot }),
	);
	if (shell.exitCode !== 0 || shell.stdout.trim() !== '{"permission":"allow"}')
		errors.push(
			`the Cursor launcher gave exit ${shell.exitCode} and ${JSON.stringify(shell.stdout.trim())} for a plain shell command`,
		);
	return {
		id: "cli",
		errors,
		summary:
			"node runs the package CLI, a copy of bin/ outside the repository loads, and the Cursor launcher prints valid JSON with no PATH and allows a plain command",
	};
}
