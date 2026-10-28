import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GATE_TOOLS,
	type ProfileGate,
	parseProfile,
	profileGates,
	runsTool as runs,
} from "../src/astack/pr-review-profile.ts";
import {
	companionTestTexts,
	profileOf,
	profilePaths,
	projectOf,
	type StackRow,
	scanRows,
} from "./profile-paths.ts";

const astackRoot = join(import.meta.dir, "..");
const profiles = profilePaths.map((path) => join(astackRoot, path));

function gatesOf(path: string): ProfileGate[] {
	return profileGates(parseProfile(readFileSync(path, "utf8")).data);
}

const gatesFrom = (
	...entries: readonly Readonly<Record<string, unknown>>[]
): ProfileGate[] => profileGates({ version: 1, gates: entries });

const smoke: Pick<ProfileGate, "command" | "checks"> = {
	command: `( set -m; (cd apps/api && exec bun src/serve.ts) > "\${TMPDIR:-/tmp}/smoke-api.log" 2>&1 & api=$!; PORT=3300 bun run start > "\${TMPDIR:-/tmp}/smoke-app.log" 2>&1 & app=$!; set +m; trap 'kill -TERM -- "-$api" "-$app" 2>/dev/null; wait' EXIT; up=1; for _ in $(seq 1 60); do if curl -fsS -o /dev/null http://localhost:3300/login && curl -fsS -o /dev/null http://localhost:8787/health; then up=0; break; fi; sleep 2; done; if [ "$up" -ne 0 ]; then tail -n 50 "\${TMPDIR:-/tmp}/smoke-app.log" "\${TMPDIR:-/tmp}/smoke-api.log"; exit 1; fi; bun run e2e )`,
	checks: [
		"command -v lsof >/dev/null && command -v curl >/dev/null && (for port in 3300 8787; do if lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null; then exit 1; fi; done)",
	],
};

const bashShells = [...new Set([Bun.which("bash"), "/bin/bash"])].filter(
	(shell): shell is string => shell !== null,
);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

type GateText = {
	readonly name: string;
	readonly setup: readonly string[];
	readonly sideEffects: string;
};

function gateTextsOf(path: string): GateText[] {
	const data = parseProfile(readFileSync(path, "utf8")).data;
	if (!isRecord(data)) return [];
	const gates = Array.isArray(data.gates) ? data.gates : [];
	return [...gates, data.test].filter(isRecord).flatMap((entry): GateText[] =>
		typeof entry.name === "string"
			? [
					{
						name: entry.name,
						setup: Array.isArray(entry.setup)
							? entry.setup.filter(
									(item): item is string => typeof item === "string",
								)
							: [],
						sideEffects:
							typeof entry.side_effects === "string" ? entry.side_effects : "",
					},
				]
			: [],
	);
}

const shellWords = new Set(
	bashShells.flatMap((shell) =>
		Bun.spawnSync([shell, "-c", "compgen -b; compgen -k"], {
			stdout: "pipe",
		})
			.stdout.toString()
			.split("\n")
			.filter((word) => word !== ""),
	),
);

type GateEntries = {
	readonly name: string;
	readonly setup: readonly string[];
	readonly starts: readonly string[];
};

function gateEntriesOf(path: string): GateEntries[] {
	const data = parseProfile(readFileSync(path, "utf8")).data;
	if (!isRecord(data)) return [];
	const gates = Array.isArray(data.gates) ? data.gates : [];
	const texts = (value: unknown): string[] =>
		Array.isArray(value)
			? value.filter((item): item is string => typeof item === "string")
			: [];
	return [...gates, data.test]
		.filter(isRecord)
		.flatMap((entry): GateEntries[] =>
			typeof entry.name === "string"
				? [
						{
							name: entry.name,
							setup: texts(entry.setup),
							starts: (Array.isArray(entry.requires) ? entry.requires : [])
								.filter(isRecord)
								.flatMap((item) =>
									typeof item.start === "string" ? [item.start] : [],
								),
						},
					]
				: [],
		);
}

const folders: string[] = [];

function folder(): string {
	const path = mkdtempSync(join(tmpdir(), "astack-profile-shell-"));
	folders.push(path);
	return path;
}

afterEach(() => {
	for (const path of folders.splice(0)) rmSync(path, { recursive: true });
});

function passesWithNothingReady(check: string): boolean {
	const root = folder();
	const noTools = join(root, "no-tools");
	mkdirSync(noTools);
	const result = Bun.spawnSync(
		["/bin/bash", "-c", `( cd '${root}' && ${check} )`],
		{ env: { PATH: noTools, HOME: root }, stdout: "ignore", stderr: "ignore" },
	);
	return result.exitCode === 0;
}

describe("a prerequisite check of a profile", () => {
	const portCheckBeforeTheFix =
		"(for port in 3300 8787; do if lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null; then exit 1; fi; done)";

	test("the probe finds a check that passes when its tool is missing, because a missing command is false in an if", () => {
		expect(passesWithNothingReady(portCheckBeforeTheFix)).toBe(true);
		expect(
			passesWithNothingReady(
				`command -v lsof >/dev/null && ${portCheckBeforeTheFix}`,
			),
		).toBe(false);
	});

	test.each(profiles)(
		"%s has no check that passes in an empty folder with no tool on the PATH",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					gate.checks
						.filter(passesWithNothingReady)
						.map((check) => `${gate.name}: ${check}`),
				),
			).toEqual([]);
		},
	);
});

describe("a prerequisite check without one of its tools", () => {
	type FakeRun = {
		readonly exitCode: number | null;
		readonly ran: readonly string[];
	};

	function runWithFakes(
		check: string,
		fakeExit: 0 | 1,
		missing?: string,
	): FakeRun {
		const root = folder();
		const bin = join(root, "fake-bin");
		const log = join(root, "ran.log");
		mkdirSync(bin);
		for (const word of new Set(check.match(/[A-Za-z_][\w.-]*/g) ?? []))
			if (!shellWords.has(word) && word !== missing)
				writeTool(
					bin,
					word,
					`#!/bin/bash\necho "\${0##*/}" >> "$FAKE_LOG"\nexit ${fakeExit}\n`,
				);
		const result = Bun.spawnSync(
			["/bin/bash", "-c", `cd() { :; }; ( ${check} )`],
			{
				cwd: root,
				env: { PATH: bin, HOME: root, FAKE_LOG: log },
				stdout: "ignore",
				stderr: "ignore",
			},
		);
		const ran = existsSync(log)
			? readFileSync(log, "utf8")
					.split("\n")
					.filter((line) => line !== "")
			: [];
		return { exitCode: result.exitCode, ran };
	}

	const toolsOf = (check: string): string[] => [
		...new Set([
			...runWithFakes(check, 0).ran,
			...runWithFakes(check, 1).ran,
			...[...check.matchAll(/\bcommand -v ([\w.-]+)/g)].map(
				(match) => match[1] ?? "",
			),
		]),
	];

	const passesWithout = (check: string): string[] =>
		toolsOf(check).flatMap((tool) =>
			([0, 1] as const)
				.filter(
					(fakeExit) => runWithFakes(check, fakeExit, tool).exitCode === 0,
				)
				.map((fakeExit) => `${tool} missing, other tools exit ${fakeExit}`),
		);

	test("the probe finds the port check that tested curl first and lsof in an if, because a missing lsof is false there", () => {
		const ports =
			"(for port in 3300 8787; do if lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null; then exit 1; fi; done)";
		expect(passesWithout(`command -v curl >/dev/null && ${ports}`)).toContain(
			"lsof missing, other tools exit 0",
		);
		expect(
			passesWithout(
				`command -v lsof >/dev/null && command -v curl >/dev/null && ${ports}`,
			),
		).toEqual([]);
		expect(
			passesWithout("(cd apps/base && supabase status >/dev/null)"),
		).toEqual([]);
		expect(toolsOf("(cd apps/base && supabase status >/dev/null)")).toEqual([
			"supabase",
		]);
	});

	test.each(profiles)(
		"%s has no check that passes when one tool that it runs is missing and every other tool exits 0 or 1",
		(path) => {
			const checks = [...new Set(gatesOf(path).flatMap((gate) => gate.checks))];
			expect(
				checks.flatMap((check) =>
					passesWithout(check).map((missing) => `${missing}: ${check}`),
				),
			).toEqual([]);
		},
	);
});

describe("a prerequisite never checks a build output", () => {
	const buildFolders = new Set([".next", "dist", "build", "out"]);
	const checkedPaths = (check: string): string[] => {
		const dir = /^\(?\s*cd\s+([^\s&;)]+)\s*&&/.exec(check)?.[1];
		const words = check.split(/[\s()'"`;|&<>]+/).filter((word) => word !== "");
		return words.flatMap((word, index) =>
			/^-[defrsx]$/.test(words[index - 1] ?? "") ||
			word.includes("/") ||
			word.startsWith(".")
				? [dir === undefined || word.startsWith("/") ? word : `${dir}/${word}`]
				: [],
		);
	};
	const checksBuildOutput = (check: string): boolean =>
		/\bBUILD_ID\b/.test(check) ||
		checkedPaths(check).some((path) =>
			path.split("/").some((segment) => buildFolders.has(segment)),
		);

	test("the pattern finds the BUILD_ID check that stopped a new worktree before the build gate ran", () => {
		for (const check of [
			"test -f apps/app/.next/BUILD_ID",
			"test -d packages/ui/dist",
			"test -f dist/index.js",
			"(cd apps/app && test -d .next)",
			"cd apps/web && test -d build",
			"test -d .next",
			"test -d out",
		])
			expect([check, checksBuildOutput(check)]).toEqual([check, true]);
		for (const check of [
			"test -f apps/app/.env.local",
			"test -x node_modules/.bin/biome",
			"command -v lsof >/dev/null",
			"command -v bun >/dev/null && bun run build --dry",
			`test -f "\${TMPDIR:-/tmp}/out.log"`,
		])
			expect([check, checksBuildOutput(check)]).toEqual([check, false]);
	});

	test.each(profiles)(
		"%s checks no file that an earlier gate builds, because the preflight runs before every gate, so the gate names the build gate in after",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					gate.checks
						.filter(checksBuildOutput)
						.map((check) => `${gate.name}: ${check}`),
				),
			).toEqual([]);
		},
	);
});

describe("an entry of a profile prints no secret", () => {
	const keyPrinters = ["supabase status", "supabase start", "stack:new"];
	const discardsStdout = /(?:^|\s)[1&]?>\s*\/dev\/null/;
	const printsKeys = (entry: string): boolean =>
		keyPrinters.some((printer) =>
			entry
				.split(printer)
				.slice(1)
				.some(
					(rest) =>
						!discardsStdout.test(rest.split(/&&|\|\||[;|"')]/)[0] ?? ""),
				),
		);
	const printsEnvironment =
		/(?:^|[;&|({\n]|\bthen\b|\bdo\b)\s*(?:env(?:\s+-[\w-]+)*|set|export|(?:declare|typeset)\s+-[a-zA-Z]*[px][a-zA-Z]*)\s*(?=$|[|;&)>\n])/m;
	const dotenv =
		/(?:^|[\s/'"=])(?:\.env(?!\.example)(?:\.[\w-]+)?|\.envrc|\.dev\.vars)(?![\w/-])/;
	const captures = /\$\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|`[^`]*`/g;
	const quietUses = [
		/^\s*!?\s*(?:test|\[)\s+-[efrs]\s/,
		/^\s*!?\s*grep\b[^\n]*\s-[A-Za-z]*[qlcL]/,
		/^\s*(?:source|\.)\s/,
		/(?:^|[^2&>])>{1,2}\s*(?!\/dev\/(?:stderr|tty|fd\/2)\b)[^\s&]/,
	];
	const readsDotenv = (entry: string): boolean =>
		entry
			.replace(captures, " ")
			.split(/;|&&|\|\||\||\n/)
			.some(
				(part) =>
					dotenv.test(part) && !quietUses.some((quiet) => quiet.test(part)),
			);
	const traces =
		/\b(?:set|bash|sh|zsh)\s+(?:-[a-zA-Z]*x[a-zA-Z]*\b|-o\s+xtrace\b)/;
	const harmlessNames = new Set(["CI", "HOME", "PATH", "PWD", "TMPDIR"]);
	const echoesSessionValue = (entry: string): boolean => {
		const assigned = new Set(
			[
				...entry.matchAll(
					/(?:^|[\s;&|(])([A-Za-z_]\w*)=|\bfor\s+([A-Za-z_]\w*)\s+in\b|\bread\s+(?:-\w+\s+)*([A-Za-z_]\w*)/gm,
				),
			].map((match) => match[1] ?? match[2] ?? match[3] ?? ""),
		);
		return [...entry.matchAll(/\b(?:echo|printf)\b([^;&|\n]*)/g)].some(
			(match) =>
				[...(match[1] ?? "").matchAll(/\$\{?([A-Za-z_]\w*)/g)].some(
					(variable) =>
						!assigned.has(variable[1] ?? "") &&
						!harmlessNames.has(variable[1] ?? ""),
				),
		);
	};
	const printsSecrets = (entry: string): boolean =>
		traces.test(entry) ||
		/\bprintenv\b|\bexport -p\b/.test(entry) ||
		printsEnvironment.test(entry) ||
		readsDotenv(entry) ||
		echoesSessionValue(entry) ||
		printsKeys(entry);

	test("the pattern finds each form that prints the environment, a .env file or a value of the session", () => {
		for (const entry of [
			"env",
			"env | grep SUPABASE",
			"bun run lint; env -0 > /dev/stderr",
			"set",
			"declare -px",
			"cat apps/api/.env",
			"head -n 3 apps/app/.env.local",
			"tail .env",
			"grep SUPABASE apps/api/.env",
			"sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' apps/api/.env",
			"awk -F= '/KEY/ {print $2}' .env.local",
			"cut -d= -f2 apps/api/.env",
			"cat .envrc",
			"cat apps/api/.dev.vars",
			"set -euxo pipefail; bun run test",
			"set -ex",
			"bash -ex scripts/check.sh",
			"set -o xtrace; bun run test",
			'echo "$SUPABASE_SERVICE_ROLE_KEY"',
			`printf '%s' "\${DATABASE_PRIMARY_URL}"`,
			"cd packages/supabase && supabase status -o env",
		])
			expect([entry, printsSecrets(entry)]).toEqual([entry, true]);
	});

	test("the pattern passes a form that prints nothing of the session or of a file", () => {
		for (const entry of [
			"env CI=true bun run test",
			"( set -m; bun run e2e ); set +m",
			"test -f apps/api/.env",
			"grep -q '^DATABASE_PRIMARY_URL=' .env",
			"grep -Eq '^ACME_SUPABASE_WORKDIR=.+' .env",
			"cat .env.example",
			"wd=$(sed -n 's/^ACME_SUPABASE_WORKDIR=//p' .env) && test -d \"$wd\"",
			`sed -n 's/^PORT=//p' .env > "\${TMPDIR:-/tmp}/port"`,
			"set -a; . ./.env; set +a",
			"set -eo pipefail",
			"bash -c 'set -e -o pipefail; bun run test'",
			"lane=$(bun tooling/stack/lane.ts) && printf '%s\\n' \"$lane\"",
			'while IFS= read -r file; do echo "$file"; done < list',
			`echo "log in \${TMPDIR:-/tmp}"`,
		])
			expect([entry, printsSecrets(entry)]).toEqual([entry, false]);
	});

	test("the pattern finds a check that prints the keys of the stack, and passes one that discards them", () => {
		expect(printsSecrets("(cd packages/supabase && supabase status)")).toBe(
			true,
		);
		expect(
			printsSecrets("(cd packages/supabase && supabase status >/dev/null)"),
		).toBe(false);
		expect(printsSecrets("set -x; bun run test")).toBe(true);
	});

	test("the pattern finds a start that prints the keys of the stack, also inside a quoted restart command", () => {
		expect(printsSecrets("cd packages/supabase && supabase start")).toBe(true);
		expect(
			printsSecrets(
				"cd apps/base && supabase start -x studio,inbucket 2>/dev/null",
			),
		).toBe(true);
		expect(
			printsSecrets(
				'astack check stack-config supabase --watch supabase/config.toml --restart "cd supabase && supabase stop && supabase start"',
			),
		).toBe(true);
		expect(printsSecrets("bun run stack:new b --force")).toBe(true);
		expect(
			printsSecrets("cd packages/supabase && supabase start >/dev/null"),
		).toBe(false);
		expect(
			printsSecrets(
				'astack stack start supabase --watch supabase/config.toml --run "cd supabase && supabase start -x studio >/dev/null"',
			),
		).toBe(false);
		expect(printsSecrets("bun run stack:new b --force >/dev/null")).toBe(false);
	});

	test.each(profiles)(
		"%s has no command, setup or check that prints the keys of a stack, the environment, a .env file or a value of the session",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					[gate.command, ...gate.preparation].filter(printsSecrets),
				),
			).toEqual([]);
		},
	);
});

describe("a gate that runs an external tool", () => {
	const externalTools = [
		"curl",
		"wget",
		"lsof",
		"psql",
		"docker",
		"jq",
		"nc",
		"pg_isready",
	];

	test("the pattern finds a tool that a command runs, and not a longer word that holds its name", () => {
		expect(runs("curl -fsS -o /dev/null http://localhost:3300", "curl")).toBe(
			true,
		);
		expect(runs('for dir in $(jq -r ".tasks[]" f); do :; done', "jq")).toBe(
			true,
		);
		expect(runs("bun run typecheck --concurrency=3", "nc")).toBe(false);
		expect(runs("command -v curl >/dev/null", "curl")).toBe(true);
	});

	test.each(profiles)(
		"%s has a check that names each external tool that a gate command runs, because a missing tool makes the gate red for a reason that is not in the PR",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					externalTools
						.filter((tool) => runs(gate.command, tool))
						.filter((tool) => !gate.checks.some((check) => runs(check, tool)))
						.map((tool) => `${gate.name}: ${tool}`),
				),
			).toEqual([]);
		},
	);
});

describe("a gate that runs a pinned tool", () => {
	test("the pattern finds supabase in a prerequisite and in a quoted run command, and not in a path", () => {
		expect(
			runs("(cd packages/supabase && supabase status >/dev/null)", "supabase"),
		).toBe(true);
		expect(
			runs(
				'astack stack start db --run "cd db && supabase start >/dev/null"',
				"supabase",
			),
		).toBe(true);
		expect(
			runs(
				"astack check stack-config packages/supabase/supabase --watch packages/supabase/supabase/config.toml",
				"supabase",
			),
		).toBe(false);
	});

	test.each(profiles)(
		"%s records in the tools of each gate every tool that the profile pins and that the gate or its prerequisites run, because the run puts only the tools of the gate on the PATH",
		(path) => {
			const gates = gatesOf(path);
			const pinned = GATE_TOOLS.filter((tool) =>
				gates.some((gate) => gate.tools.some((entry) => entry.tool === tool)),
			);
			expect(
				gates.flatMap((gate) =>
					pinned
						.filter((tool) =>
							[gate.command, ...gate.preparation].some((text) =>
								runs(text, tool),
							),
						)
						.filter((tool) => !gate.tools.some((entry) => entry.tool === tool))
						.map((tool) => `${gate.name}: ${tool}`),
				),
			).toEqual([]);
		},
	);
});

describe("a smoke gate that starts two servers in their own process groups", () => {
	const fakeBun = `#!/bin/bash
case "\${!#}" in
  src/serve.ts|start)
    sleep 300 &
    echo "$$ $!" >> "$FAKE_STATE/started"
    wait ;;
  e2e)
    echo suite >> "$FAKE_STATE/suite" ;;
  *)
    exit 2 ;;
esac
`;
	const fakeCurl = `#!/bin/bash
for _ in $(seq 1 100); do
  if [ -f "$FAKE_STATE/started" ] && [ "$(wc -l < "$FAKE_STATE/started")" -ge 2 ]; then exit 0; fi
  sleep 0.05
done
exit 7
`;

	test.each(bashShells)(
		"with %s it stops each process that it started and their children, with no lsof on the PATH",
		async (shell) => {
			const root = folder();
			const bin = join(root, "bin");
			const state = join(root, "state");
			for (const dir of [bin, state, join(root, "apps", "api")])
				mkdirSync(dir, { recursive: true });
			writeTool(bin, "bun", fakeBun);
			writeTool(bin, "curl", fakeCurl);
			linkTools(bin, ["seq", "sleep", "tail", "wc"]);
			const result = Bun.spawnSync(
				[shell, "-c", `( cd '${root}' && ${smoke.command} )`],
				{
					env: { PATH: bin, HOME: root, TMPDIR: root, FAKE_STATE: state },
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const started = readFileSync(join(state, "started"), "utf8")
				.split(/\s+/)
				.filter((word) => word !== "")
				.map(Number);
			const left = await stillRunning(started);
			for (const pid of left) process.kill(pid, "SIGKILL");
			expect(result.exitCode).toBe(0);
			expect(readFileSync(join(state, "suite"), "utf8")).toBe("suite\n");
			expect(started).toHaveLength(4);
			expect(left).toEqual([]);
		},
	);
});

function linkTools(bin: string, tools: readonly string[]): void {
	for (const tool of tools) {
		const real = Bun.which(tool);
		if (real === null) throw new Error(`${tool} is not on the PATH`);
		symlinkSync(real, join(bin, tool));
	}
}

function writeTool(bin: string, name: string, body: string): void {
	writeFileSync(join(bin, name), body);
	chmodSync(join(bin, name), 0o755);
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function stillRunning(pids: readonly number[]): Promise<number[]> {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		if (!pids.some(isRunning)) return [];
		await Bun.sleep(50);
	}
	return pids.filter(isRunning);
}

describe("the node_modules delete of the preflight", () => {
	const skill = readFileSync(
		join(
			import.meta.dir,
			"..",
			"marketplace/plugins/astack/skills/pr-review-hardening/SKILL.md",
		),
		"utf8",
	);
	const command =
		/First delete the `node_modules` folder next to each `package\.json` that git tracks, with `(.+?)`\. A frozen install/.exec(
			skill,
		)?.[1];

	const shells = [
		...new Set([Bun.which("bash"), "/bin/bash", Bun.which("zsh")]),
	].filter((shell): shell is string => shell !== null);

	test.each(shells)(
		"with %s it deletes each node_modules of a tracked package and keeps the node_modules of a tree that git does not track",
		(shell) => {
			if (command === undefined)
				throw new Error("SKILL.md has no delete command");
			const root = folder();
			const packages = ["", "packages/a", "packages/b c"];
			for (const dir of packages) {
				mkdirSync(join(root, dir, "node_modules", "dep"), { recursive: true });
				writeFileSync(join(root, dir, "package.json"), "{}\n");
			}
			const nested = join(root, ".claude/worktrees/other");
			mkdirSync(join(nested, "node_modules", "dep"), { recursive: true });
			writeFileSync(join(nested, "package.json"), "{}\n");
			const git = (args: readonly string[]) =>
				Bun.spawnSync(["git", "-C", root, ...args], {
					stdout: "ignore",
					stderr: "ignore",
				}).exitCode;
			expect(git(["init", "-q"])).toBe(0);
			expect(
				git([
					"add",
					"package.json",
					"packages/a/package.json",
					"packages/b c/package.json",
				]),
			).toBe(0);
			const result = Bun.spawnSync(
				[shell, "-c", command.replace("<WORKTREE>", `'${root}'`)],
				{ stdout: "pipe", stderr: "pipe" },
			);
			expect(result.exitCode).toBe(0);
			expect(
				packages.filter((dir) => existsSync(join(root, dir, "node_modules"))),
			).toEqual([]);
			expect(existsSync(join(nested, "node_modules", "dep"))).toBe(true);
		},
	);
});

describe("a gate never copies a file that the commit does not hold", () => {
	const copiesUntracked = (text: string): boolean =>
		/\bgit ls-files\b[^|]*(?:--others\b|\s-(?!-)[a-zA-Z]*o)/.test(text);

	test("the pattern finds the copy of untracked files that the visual gate made, with a long or a short flag", () => {
		for (const text of [
			"git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf -",
			"git ls-files -z -co --exclude-standard | tar --null -T - -cf -",
			"git ls-files -o -z | tar --null -T - -cf -",
			"git ls-files -zo | tar --null -T - -cf -",
		])
			expect([text, copiesUntracked(text)]).toEqual([text, true]);
		for (const text of [
			"git ls-files -z --cached | tar --null -T - -cf -",
			"git ls-files -z -c --exclude-standard | tar --null -T - -cf -",
			"git ls-files -z | tar -o -cf -",
		])
			expect([text, copiesUntracked(text)]).toEqual([text, false]);
	});

	test.each(profiles)("%s has no gate that copies untracked files", (path) => {
		expect(
			gatesOf(path).flatMap((gate) =>
				[gate.command, ...gate.preparation].filter(copiesUntracked),
			),
		).toEqual([]);
	});
});

describe("a check never trusts a server that already runs", () => {
	const loopValues = (check: string, name: string): string[] =>
		new RegExp(String.raw`\bfor\s+${name}\s+in\s+([^;]*);`)
			.exec(check)?.[1]
			?.trim()
			.split(/\s+/) ?? [`$${name}`];
	const lsofListens = (check: string): string[] =>
		[
			...check.matchAll(
				/(\bif\s+)?(!\s*)?(?<![\w.-])lsof\b([^;&|\n)]*-sTCP:LISTEN[^;&|\n)]*)/g,
			),
		].flatMap((match) => {
			const [all, opens = "", negated = "", args = ""] = match;
			const after = check.slice((match.index ?? 0) + all.length);
			const freeCheck =
				negated !== "" ||
				(opens !== "" && /^[^;]*;\s*then\s+exit\s+[1-9]/.test(after));
			if (freeCheck) return [];
			const port = /-i(?:TCP)?:(?:\$\{?(\w+)\}?|(\d+))/.exec(args);
			if (port === null) return ["lsof"];
			return port[2] !== undefined
				? [port[2]]
				: loopValues(check, port[1] ?? "");
		});
	const probedPorts = (check: string): string[] => [
		...new Set([
			...[...check.matchAll(/\bhttps?:\/\/[\w.-]+(?::(\d+))?/g)].map(
				(match) => match[1] ?? "http",
			),
			...[...check.matchAll(/\b(?:curl|wget)\b[^;&|\n]*/g)].flatMap((call) =>
				[
					...call[0].matchAll(
						/(?<![\w./:@-])(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[a-z][\w-]*(?:\.[\w-]+)+):(\d+)\b/g,
					),
				].map((match) => match[1] ?? ""),
			),
			...[
				...check.matchAll(
					/\bnc\s+(?:-\w+\s+)*-\w*z\w*\s+(?:-\w+\s+)*[\w.:-]+\s+(\d+)/g,
				),
			].map((match) => match[1] ?? ""),
			...[...check.matchAll(/\/dev\/tcp\/[\w.-]+\/(\d+)/g)].map(
				(match) => match[1] ?? "",
			),
			...[
				...check.matchAll(
					/\bpg_isready\b[^;&|\n]*?(?:\s-p\s*|\s--port[= ])"?(\$\(\([^)]*\)\)|\$\{?\w+\}?|\d+)/g,
				),
			].map((match) => match[1] ?? ""),
			...[
				...check.matchAll(/\bwait-on\b[^;&|\n]*?\btcp:(?:[\w.-]+:)?(\d+)/g),
			].map((match) => match[1] ?? ""),
			...lsofListens(check),
		]),
	];

	const { sharedServices } = scanRows;

	const trustedProbes = (path: string): string[] =>
		gatesOf(path).flatMap((gate) =>
			gate.checks.flatMap((check) =>
				probedPorts(check)
					.filter(
						(port) =>
							!sharedServices.some(
								(service) =>
									service.profile === projectOf(path) && service.port === port,
							),
					)
					.map((port) => `${gate.name}: port ${port}: ${check}`),
			),
		);

	test("the probe finds the sim check that trusted a server of another tree, and a TCP probe of a port", () => {
		expect(
			probedPorts(
				`test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4310/api/data/v9.2/WhoAmI)" = 401`,
			),
		).toEqual(["4310"]);
		expect(probedPorts("nc -z 127.0.0.1 8787")).toEqual(["8787"]);
		expect(probedPorts("nc -vz localhost 3300")).toEqual(["3300"]);
		expect(probedPorts("exec 3<>/dev/tcp/127.0.0.1/3300")).toEqual(["3300"]);
		expect(probedPorts("command -v curl >/dev/null")).toEqual([]);
		expect(
			probedPorts(
				"command -v lsof >/dev/null && (for port in 3300 8787; do if lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null; then exit 1; fi; done)",
			),
		).toEqual([]);
		expect(probedPorts("! lsof -t -iTCP:3300 -sTCP:LISTEN >/dev/null")).toEqual(
			[],
		);
	});

	test("the probe finds a server probe with no URL scheme, an lsof that passes on a listener, pg_isready and wait-on", () => {
		expect(probedPorts("curl -fsS -o /dev/null localhost:8787/health")).toEqual(
			["8787"],
		);
		expect(probedPorts("wget -q -O /dev/null 127.0.0.1:3300/login")).toEqual([
			"3300",
		]);
		expect(
			probedPorts(
				"(for port in 3300 8787; do lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null || exit 1; done)",
			),
		).toEqual(["3300", "8787"]);
		expect(probedPorts("lsof -t -iTCP:4310 -sTCP:LISTEN >/dev/null")).toEqual([
			"4310",
		]);
		expect(probedPorts("pg_isready -q -h 127.0.0.1 -p 54822")).toEqual([
			"54822",
		]);
		expect(
			probedPorts('pg_isready -q -h 127.0.0.1 -p "$(( base + 2 ))"'),
		).toEqual(["$(( base + 2 ))"]);
		expect(probedPorts("bunx wait-on tcp:127.0.0.1:4311")).toEqual(["4311"]);
		expect(probedPorts("bunx wait-on tcp:4311")).toEqual(["4311"]);
	});

	test.each(profiles)(
		"%s asks no server whether it runs, other than a shared service of the table that runs no code of the tree",
		(path) => {
			expect(trustedProbes(path)).toEqual([]);
		},
	);

	test("each shared service of the table is still a probe of its profile", () => {
		expect(
			sharedServices.filter(
				(service) =>
					!gatesOf(profileOf(service.profile)).some((gate) =>
						gate.checks.some((check) =>
							probedPorts(check).includes(service.port),
						),
					),
			),
		).toEqual([]);
	});
});

describe("a gate that starts a server", () => {
	const background = /(?<![&>|<])&(?![&>])/g;
	const killsByPort =
		/\bkill\b[^;]*\$\(\s*lsof\b|\blsof\b[^;]*\|\s*xargs\b[^;]*\bkill\b|\bpkill\b|\bkillall\b|\bfuser\b[^;]*\s-k\b/;

	const takenPortTool = `#!/bin/bash
for arg in "$@"; do case "$arg" in *":$TAKEN") echo 4242; exit 0 ;; esac; done
exit 1
`;

	function portCheckHolds(check: string, port: string): boolean {
		const root = folder();
		const bin = join(root, "bin");
		mkdirSync(bin);
		for (const word of new Set(check.match(/[A-Za-z_][\w.-]*/g) ?? []))
			if (!shellWords.has(word) && word !== "lsof")
				writeTool(bin, word, "#!/bin/bash\nexit 0\n");
		writeTool(bin, "lsof", takenPortTool);
		const exitWith = (taken: string) =>
			Bun.spawnSync(["/bin/bash", "-c", `cd() { :; }; ( ${check} )`], {
				cwd: root,
				env: { PATH: bin, HOME: root, TAKEN: taken },
				stdout: "ignore",
				stderr: "ignore",
			}).exitCode;
		return exitWith(port) !== 0 && exitWith("none") === 0;
	}

	const portCheckBeforeTheFix =
		"command -v lsof >/dev/null && (for port in 3300 8787; do if lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null; then exit 1; fi; done)";

	test("the port check fails when a process holds a port that it checks, and passes when each port is free", () => {
		expect(portCheckHolds(portCheckBeforeTheFix, "3300")).toBe(true);
		expect(portCheckHolds(portCheckBeforeTheFix, "8787")).toBe(true);
		expect(
			portCheckHolds(
				"command -v lsof >/dev/null && (for port in 3300 8787; do lsof -t -iTCP:$port -sTCP:LISTEN >/dev/null || exit 1; done)",
				"3300",
			),
		).toBe(false);
		expect(portCheckHolds(portCheckBeforeTheFix, "4310")).toBe(false);
	});

	const allowedStarts = [
		{
			form: /^astack stack start /,
			why: "It runs the start command of the stack, which starts the containers of the stack under Docker. It returns when the stack is up, and it leaves no process of the shell behind.",
		},
	];

	function setupIssues(gate: GateEntries): string[] {
		return [...gate.setup, ...gate.starts]
			.filter((entry) => entry.search(background) !== -1)
			.filter((entry) => !allowedStarts.some(({ form }) => form.test(entry)))
			.map(
				(entry) =>
					`starts a background process in a setup or start entry, which no trap of the gate stops: ${entry}`,
			);
	}

	test("the rule finds a server that a setup entry starts in the background, and passes the start of a stack", () => {
		expect(
			setupIssues({
				name: "suite",
				setup: [
					`(cd apps/api && bun run dev > "\${TMPDIR:-/tmp}/acme-api.log" 2>&1 &)`,
					"bun run db:test:setup 2>&1",
				],
				starts: [
					'astack stack start supabase --watch supabase/config.toml --run "supabase start >/dev/null"',
				],
			}),
		).toEqual([
			`starts a background process in a setup or start entry, which no trap of the gate stops: (cd apps/api && bun run dev > "\${TMPDIR:-/tmp}/acme-api.log" 2>&1 &)`,
		]);
	});

	function serverIssues(
		gate: Pick<ProfileGate, "command" | "checks">,
	): string[] {
		const { command } = gate;
		const starts = command.match(background)?.length ?? 0;
		const names = [...command.matchAll(/&\s*(\w+)=\$!/g)].map(
			(match) => match[1] ?? "",
		);
		const trap = /\btrap '([^']*)' EXIT\b/.exec(command)?.[1] ?? "";
		const ports = [
			...new Set(
				[
					...command.matchAll(
						/\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/g,
					),
				].map((match) => match[1] ?? ""),
			),
		];
		const issues: string[] = [];
		if (killsByPort.test(command))
			issues.push("stops a process that it finds by its port");
		if (starts > 0 && names.length !== starts)
			issues.push("keeps no $! of each process that it starts");
		if (
			starts > 0 &&
			!/\bset -m\b/.test(command.slice(0, command.search(background)))
		)
			issues.push("starts a process with no process group of its own");
		for (const name of names)
			if (!trap.includes("kill -TERM --") || !trap.includes(`-$${name}`))
				issues.push(`stops no process group of $${name} in its EXIT trap`);
		for (const port of ports)
			if (
				!gate.checks.some(
					(check) =>
						/\blsof\b/.test(check) &&
						new RegExp(String.raw`\b${port}\b`).test(check) &&
						portCheckHolds(check, port),
				)
			)
				issues.push(`polls port ${port} with no check that it is free`);
		return issues;
	}

	test("the rule finds the smoke that stopped each process on its ports and trusted a server that already ran", () => {
		expect(
			serverIssues({
				command:
					"(cd apps/api && bun src/serve.ts) & PORT=3300 bun run start & trap 'kill $(lsof -t -iTCP:3300 -iTCP:8787 -sTCP:LISTEN)' EXIT; curl -fsS http://localhost:3300/login && bun run e2e",
				checks: [],
			}),
		).toEqual([
			"stops a process that it finds by its port",
			"keeps no $! of each process that it starts",
			"starts a process with no process group of its own",
			"polls port 3300 with no check that it is free",
		]);
	});

	test("the rule passes a smoke that starts each server in its own group and stops only those groups", () => {
		expect(serverIssues(smoke)).toEqual([]);
		expect(serverIssues({ command: smoke.command, checks: [] })).toEqual([
			"polls port 3300 with no check that it is free",
			"polls port 8787 with no check that it is free",
		]);
	});

	test.each(profiles)(
		"%s starts each server from this tree in its own process group, stops only those groups, and checks with lsof that each port it polls is free",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					serverIssues(gate).map((issue) => `${gate.name}: ${issue}`),
				),
			).toEqual([]);
		},
	);

	test.each(profiles)(
		"%s starts no server in a setup or start entry, other than a start form of the table",
		(path) => {
			expect(
				gateEntriesOf(path).flatMap((gate) =>
					setupIssues(gate).map((issue) => `${gate.name}: ${issue}`),
				),
			).toEqual([]);
		},
	);
});

const { stacks } = scanRows;

const rowsOf = (path: string): readonly StackRow[] =>
	stacks.filter((row) => row.profile === projectOf(path));

const stackOf = (gate: ProfileGate): string | undefined =>
	gate.checks
		.map((check) => /\bastack check stack-config (\S+)/.exec(check)?.[1])
		.find((stack) => stack !== undefined);

const watchOf = (entry: string): string =>
	[...entry.matchAll(/--watch (\S+)/g)].map((match) => match[1]).join(" ");

const startsOrAsksStack = /\bsupabase (?:db )?start\b|\bsupabase status\b/;

const namesStackPort = (entry: string, port: string): boolean =>
	new RegExp(
		String.raw`:${port}(?![\w])|(?:\s-p\s*|\s--port[= ])["']?${port}(?![\w])`,
	).test(entry);

const usesLongLivedStack =
	(ports: readonly string[]) =>
	(gate: ProfileGate): boolean => {
		const entries = [gate.command, ...gate.preparation];
		return (
			entries.some((entry) => startsOrAsksStack.test(entry)) ||
			gate.checks.some((check) => /\bpg_isready\b[^;&|]*\s-p\s/.test(check)) ||
			entries.some((entry) => ports.some((port) => namesStackPort(entry, port)))
		);
	};

describe("the config of a long-lived local stack", () => {
	const checksConfig = (gate: ProfileGate): boolean =>
		gate.checks.some((check) => /\bastack check stack-config\b/.test(check));

	test("the detection finds a stack gate from a start, a status, a pg_isready probe or a stack port of the table", () => {
		const gates = gatesFrom(
			{
				name: "start",
				command: "bun run e2e",
				setup: ["(cd db && supabase start >/dev/null)"],
			},
			{
				name: "status",
				command: "bun run e2e",
				requires: [
					{ name: "stack", check: "(cd db && supabase status >/dev/null)" },
				],
			},
			{
				name: "probe",
				command: "bun run e2e",
				requires: [
					{ name: "db", check: "pg_isready -q -h 127.0.0.1 -p 54322" },
				],
			},
			{
				name: "port",
				command:
					'psql "postgresql://postgres:postgres@127.0.0.1:54329/postgres" -f t.sql',
			},
			{ name: "lint", command: "bun run lint" },
		);
		expect(
			[["54329"], []].map((ports) =>
				gates.filter(usesLongLivedStack(ports)).map((gate) => gate.name),
			),
		).toEqual([
			["start", "status", "probe", "port"],
			["start", "status", "probe"],
		]);
	});

	test("the detection takes an entry that names a stack port in a URL, with -p or with --port as a stack gate", () => {
		expect(
			namesStackPort(
				'psql "postgresql://postgres:postgres@127.0.0.1:54822/postgres" -X -q',
				"54822",
			),
		).toBe(true);
		expect(
			namesStackPort("psql -h 127.0.0.1 -p 54822 -U postgres", "54822"),
		).toBe(true);
		expect(namesStackPort("bun run db --port=54822", "54822")).toBe(true);
		expect(namesStackPort("psql -p 548221", "54822")).toBe(false);
		expect(namesStackPort("curl http://localhost:3300/login", "54822")).toBe(
			false,
		);
	});

	test("each stack port of the table is named by an entry of its profile", () => {
		expect(
			stacks.flatMap((row) =>
				row.ports
					.filter(
						(port) =>
							!gatesOf(profileOf(row.profile)).some((gate) =>
								[gate.command, ...gate.preparation].some((entry) =>
									namesStackPort(entry, port),
								),
							),
					)
					.map((port) => `${row.profile}: ${port}`),
			),
		).toEqual([]);
	});

	test.each(profiles)(
		"%s compares the files that each long-lived stack read at its start with the files of the checkout",
		(path) => {
			expect(
				gatesOf(path)
					.filter(usesLongLivedStack(rowsOf(path).flatMap((row) => row.ports)))
					.filter((gate) => !checksConfig(gate))
					.map((gate) => gate.name),
			).toEqual([]);
		},
	);

	test.each(profiles)(
		"%s watches the files of the table for each long-lived stack, so the config check sees each file that the stack reads",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					gate.preparation
						.filter((entry) =>
							/\bastack (?:check stack-config|stack start) /.test(entry),
						)
						.flatMap((entry) => {
							const stack =
								/\bastack (?:check stack-config|stack start) (\S+)/.exec(
									entry,
								)?.[1];
							const row = stacks.find(
								(item) =>
									item.profile === projectOf(path) && item.stack === stack,
							);
							const watched = watchOf(entry);
							return row !== undefined && watched === row.watch.join(" ")
								? []
								: [`${gate.name}: ${stack} watches ${watched}`];
						}),
				),
			).toEqual([]);
		},
	);

	test.each(profiles)(
		"%s starts each long-lived stack through astack stack start with the paths that its config check watches, so the check finds a record",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) => {
					const watch = gate.checks
						.filter((check) => /\bastack check stack-config\b/.test(check))
						.map(watchOf);
					return gate.preparation
						.filter((entry) => /\bsupabase (?:db )?start\b/.test(entry))
						.filter((entry) => !/\bastack check stack-config\b/.test(entry))
						.filter(
							(entry) =>
								!entry.startsWith("astack stack start ") ||
								!watch.includes(watchOf(entry)),
						)
						.map((entry) => `${gate.name}: ${entry}`);
				}),
			).toEqual([]);
		},
	);

	const databaseOnlyStart =
		/^astack stack start (\S+) .*--run "[^"]*\bsupabase db start\b[^"]*"$/;

	function unrecordedResets(gates: readonly ProfileGate[]): string[] {
		const databaseOnly = new Set(
			gates.flatMap((gate) =>
				gate.preparation.flatMap(
					(entry) => databaseOnlyStart.exec(entry)?.[1] ?? [],
				),
			),
		);
		return gates.flatMap((gate, index) => {
			const stack = stackOf(gate);
			if (stack === undefined || !databaseOnly.has(stack)) return [];
			if (!/\bsupabase db reset\b/.test(gate.command)) return [];
			if (!gates.slice(index + 1).some((later) => stackOf(later) === stack))
				return [];
			const watch = gate.checks
				.filter((check) => /\bastack check stack-config\b/.test(check))
				.map(watchOf);
			const recorded =
				gate.command.startsWith(`astack stack start ${stack} `) &&
				watch.includes(watchOf(gate.command));
			return recorded ? [] : [`${gate.name}: ${gate.command}`];
		});
	}

	test("the reset check finds a plain reset of a stack that runs only its database, when a later gate checks the config of that stack", () => {
		const stack = {
			name: "stack",
			check:
				"astack check stack-config db/supabase --watch db/supabase/config.toml",
			start:
				'astack stack start db/supabase --watch db/supabase/config.toml --run "cd db && supabase db start"',
		};
		const withReset = (command: string) =>
			gatesFrom(
				{ name: "db-reset", command, requires: [stack] },
				{ name: "suite", command: "bun run test:db", requires: [stack] },
			);
		const plain = withReset("cd db && supabase db reset");
		expect(unrecordedResets(plain)).toEqual([
			"db-reset: cd db && supabase db reset",
		]);
		expect(
			unrecordedResets(
				withReset(
					'astack stack start db/supabase --watch db/supabase/config.toml --run "cd db && supabase db reset"',
				),
			),
		).toEqual([]);
		expect(unrecordedResets(plain.slice(0, 1))).toEqual([]);
	});

	test.each(profiles)(
		"%s resets a stack that runs only its database through astack stack start, because the reset replaces its one container and each later gate of the stack then needs a new record",
		(path) => {
			expect(unrecordedResets(gatesOf(path))).toEqual([]);
		},
	);
});

describe("the migrations of each gate on a long-lived stack", () => {
	const migrates = /\bsupabase(?::|\s+)migrat/;
	const checksAll = (entry: string): boolean =>
		/^astack check migrations /.test(entry) &&
		!entry.includes("--allow-pending");

	function provesMigrations(path: string, gate: ProfileGate): boolean {
		const entries = [gate.command, ...gate.preparation];
		const last = entries.findLastIndex((entry) => migrates.test(entry));
		if (entries.slice(last + 1).some(checksAll)) return true;
		const row = stacks.find(
			(item) =>
				item.profile === projectOf(path) && item.stack === stackOf(gate),
		);
		if (row === undefined) return false;
		return (
			(row.reset !== null && entries.includes(row.reset)) ||
			row.oneJob.includes(gate.name)
		);
	}

	test.each(profiles)(
		"%s proves that each long-lived stack holds the migrations of the checkout, with a migration check after the last migrate step or a reset of the table",
		(path) => {
			expect(
				gatesOf(path)
					.filter(usesLongLivedStack(rowsOf(path).flatMap((row) => row.ports)))
					.filter((gate) => !provesMigrations(path, gate))
					.map((gate) => gate.name),
			).toEqual([]);
		},
	);

	test("the pattern finds a migrate step of the CLI and of a package script, and not another script of the database", () => {
		expect(
			[
				"(cd db && supabase migration up)",
				"bun run supabase:migrate",
				"bun run db:migrate",
			].map((entry) => migrates.test(entry)),
		).toEqual([true, true, false]);
	});
});

const ownerHints = /\s--(?:reset|restart) "[^"]*"/g;

const withoutOwnerHints = (entry: string): string =>
	entry.replace(ownerHints, "");

describe("a gate that resets a stack or a database", () => {
	const reset =
		/\bsupabase db reset\b|\bsupabase:reset\b|\b(?:bun|npm|pnpm|yarn) run reset\b|\bdb:(?:test:setup|reset)\b|\bdropdb\b|\bdrop database\b/i;
	const runsReset = (entry: string): boolean =>
		reset.test(withoutOwnerHints(entry));
	const { tiedResets, sharedTargets } = scanRows;
	const tiedByTest = (path: string, gate: ProfileGate): boolean =>
		tiedResets.some(
			(row) =>
				row.profile === projectOf(path) &&
				row.gate === gate.name &&
				gate.checks.some((check) => check.startsWith(row.check)),
		);

	const untiedResets = (path: string): string[] =>
		gatesOf(path)
			.filter((gate) => [gate.command, ...gate.preparation].some(runsReset))
			.filter((gate) => !tiedByTest(path, gate))
			.map((gate) => gate.name);

	test("each tied reset of the table has the check that its behaviour test runs, and the behaviour test exists", () => {
		const proofs = [
			readFileSync(import.meta.path, "utf8"),
			...companionTestTexts,
		];
		expect(
			tiedResets
				.filter(
					(row) =>
						!gatesOf(profileOf(row.profile)).some(
							(gate) =>
								gate.name === row.gate &&
								gate.checks.some((check) => check.startsWith(row.check)),
						) ||
						!proofs.some((text) => text.includes(`describe("${row.proof}"`)),
				)
				.map((row) => `${row.profile}: ${row.gate}`),
		).toEqual([]);
	});

	const openDecisions = (path: string): string => {
		const text = readFileSync(path, "utf8");
		return text.slice(text.indexOf("## Open decisions"));
	};

	test("the pattern finds a reset that a gate runs, and not the reset command that a check prints for the owner", () => {
		expect(runsReset("bun run reset")).toBe(true);
		expect(runsReset("cd packages/supabase && supabase db reset")).toBe(true);
		expect(runsReset("bun run db:test:setup")).toBe(true);
		expect(runsReset('psql "$URL" -c "DROP DATABASE acme_test"')).toBe(true);
		expect(
			runsReset(
				'astack check migrations m --db "$URL" --reset "cd apps/base && supabase db reset"',
			),
		).toBe(false);
		expect(runsReset("bun run seed:demo")).toBe(false);
	});

	test.each(profiles)(
		"%s ties each reset of a stack or a database to this worktree with a check, or names the shared target in an open decision of the profile",
		(path) => {
			const shared = sharedTargets.filter(
				(row) =>
					row.profile === projectOf(path) &&
					openDecisions(path).includes(row.decision),
			);
			expect(
				untiedResets(path).filter(
					(gate) => !shared.some((row) => row.gate === gate),
				),
			).toEqual([]);
		},
	);
	test("each shared target of the table is a gate that resets it with no check of the worktree", () => {
		expect(
			sharedTargets
				.filter(
					(row) => !untiedResets(profileOf(row.profile)).includes(row.gate),
				)
				.map((row) => `${row.profile}: ${row.gate}`),
		).toEqual([]);
	});
});

describe("a gate never deletes in the checkout of the run", () => {
	const deletes =
		/(?<![\w-])rm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b|\bgit\s+clean\b|\bfind\b[^;&|\n]*\s-delete\b/;
	const allowedDeletes: readonly {
		readonly profile: string;
		readonly entry: string;
		readonly why: string;
	}[] = [];

	test("the pattern finds a recursive delete, git clean and find -delete, and not the --rm flag of docker", () => {
		for (const entry of [
			"rm -rf apps/app/.next",
			"rm -r dist",
			"git clean -fdx",
			"find . -name '*.log' -delete",
		])
			expect([entry, deletes.test(entry)]).toEqual([entry, true]);
		for (const entry of [
			"docker run --rm -i image",
			"rm -f /tmp/report.txt",
			"bun run clean:check",
		])
			expect([entry, deletes.test(entry)]).toEqual([entry, false]);
	});

	test.each(profiles)(
		"%s has no command, setup, check or start that deletes files, other than an entry of the table, because a dev server of the owner can use the checkout of the run",
		(path) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					[gate.command, ...gate.preparation]
						.filter((entry) => deletes.test(entry))
						.filter(
							(entry) =>
								!allowedDeletes.some(
									(row) =>
										row.profile === projectOf(path) && row.entry === entry,
								),
						)
						.map((entry) => `${gate.name}: ${entry}`),
				),
			).toEqual([]);
		},
	);
});

describe("each entry of a profile is valid bash", () => {
	const parses = (shell: string, entry: string): boolean =>
		Bun.spawnSync([shell, "-n", "-c", `( cd '/worktree' && ${entry} )`], {
			stdout: "ignore",
			stderr: "ignore",
		}).exitCode === 0;

	test.each(bashShells)(
		"with %s the parse finds an entry in a form that only zsh reads, and an open quote",
		(shell) => {
			expect(parses(shell, "for port in 3300 8787; do echo $port; done")).toBe(
				true,
			);
			expect(parses(shell, "for port (3300 8787) { echo $port; }")).toBe(false);
			expect(parses(shell, 'test -f "apps/app/.env.local')).toBe(false);
		},
	);

	const commandKeys = [
		["metrics", "command"],
		["metrics", "fallback"],
		["type_coverage", "command"],
		["merge", "command"],
		["merge", "fallback"],
	] as const;
	const placeholder = /<[a-z][\w-]*>/g;
	const profileCommands = (data: unknown): string[] => {
		if (!isRecord(data)) return [];
		return commandKeys.flatMap(([block, key]) => {
			const section = data[block];
			const value = isRecord(section) ? section[key] : undefined;
			return typeof value === "string" ? [value] : [];
		});
	};

	test.each(bashShells)(
		"with %s a merge command of a profile parses only after the fill of each placeholder",
		(shell) => {
			const merge =
				'gh pr merge <pr> --squash --match-head-commit <head-sha> --subject "<pr-title> (#<pr>)" --body-file <squash-body>';
			expect(
				profileCommands({
					metrics: { command: "bun tooling/pr-metrics.ts" },
					merge: { command: merge },
				}),
			).toEqual(["bun tooling/pr-metrics.ts", merge]);
			expect([
				parses(shell, merge),
				parses(shell, merge.replace(placeholder, "value")),
			]).toEqual([false, true]);
		},
	);

	test.each(
		profiles.flatMap((path) => bashShells.map((shell) => [path, shell])),
	)(
		"%s parses metrics.command, metrics.fallback, type_coverage.command, merge.command and merge.fallback with %s, after it fills each placeholder",
		(path, shell) => {
			expect(
				profileCommands(parseProfile(readFileSync(path, "utf8")).data).filter(
					(command) => !parses(shell, command.replace(placeholder, "value")),
				),
			).toEqual([]);
		},
	);

	test.each(
		profiles.flatMap((path) => bashShells.map((shell) => [path, shell])),
	)(
		"%s parses each command, setup, check and start with %s, because the run starts each entry with bash",
		(path, shell) => {
			expect(
				gatesOf(path).flatMap((gate) =>
					[gate.command, ...gate.preparation]
						.filter((entry) => !parses(shell, entry))
						.map((entry) => `${gate.name}: ${entry}`),
				),
			).toEqual([]);
		},
	);
});

describe("a gate on a stack that an earlier gate seeded", () => {
	const writes = /\bseed(?:[:.][\w-]+)?\b|\breset\b/;
	const seedsOrResets = /\b(?:seeds|resets)\b/i;

	type StackGate = {
		readonly name: string;
		readonly stack: string;
		readonly command: string;
		readonly setup: readonly string[];
		readonly sideEffects: string;
	};

	function stackGatesOf(path: string): StackGate[] {
		const texts = gateTextsOf(path);
		return gatesOf(path).flatMap((gate): StackGate[] => {
			const stack = stackOf(gate);
			const text = texts.find((entry) => entry.name === gate.name);
			return stack === undefined || text === undefined
				? []
				: [{ ...text, stack, command: gate.command }];
		});
	}

	const writesData = (gate: StackGate): boolean =>
		[gate.command, ...gate.setup].some((entry) =>
			writes.test(withoutOwnerHints(entry)),
		) || seedsOrResets.test(gate.sideEffects);

	function unresetGates(
		gates: readonly StackGate[],
		rows: readonly StackRow[],
	): string[] {
		return gates.flatMap((gate, index): string[] => {
			const row = rows.find((entry) => entry.stack === gate.stack);
			if (row === undefined)
				return [`${gate.name}: the table names no reset of ${gate.stack}`];
			const writers = gates
				.slice(0, index)
				.filter((earlier) => earlier.stack === gate.stack)
				.filter(writesData)
				.filter(
					(earlier) =>
						!row.oneJob.includes(earlier.name) ||
						!row.oneJob.includes(gate.name),
				)
				.map((earlier) => earlier.name);
			if (writers.length === 0 || gate.setup[0] === row.reset) return [];
			return [
				`${gate.name}: ${writers.join(", ")} wrote data first, and its setup does not start with ${row.reset ?? "a reset"}`,
			];
		});
	}

	test("the rule finds a gate on a stack that an earlier gate seeded when its setup does not start with the reset of the table", () => {
		const row: StackRow = {
			profile: "acme",
			stack: "db/supabase",
			reset: "bun run reset",
			oneJob: [],
			watch: [],
			ports: [],
			why: "The reset makes the database again from the migrations.",
		};
		const e2e: StackGate = {
			name: "e2e",
			stack: "db/supabase",
			command: "bun run e2e",
			setup: ["bun run seed:demo"],
			sideEffects: "",
		};
		const suite: StackGate = {
			name: "test",
			stack: "db/supabase",
			command: "bun run test",
			setup: ["bun run reset", "bun run seed:demo"],
			sideEffects: "",
		};
		expect(unresetGates([e2e, suite], [row])).toEqual([]);
		expect(
			unresetGates(
				[e2e, { ...suite, setup: ["bun run seed:demo", "bun run reset"] }],
				[row],
			),
		).toEqual([
			"test: e2e wrote data first, and its setup does not start with bun run reset",
		]);
		expect(unresetGates([e2e], [])).toEqual([
			"e2e: the table names no reset of db/supabase",
		]);
	});

	test.each(profiles)(
		"%s starts the setup of each gate on a stack with its reset when an earlier gate seeded that stack, unless CI runs both in one job",
		(path) => {
			expect(unresetGates(stackGatesOf(path), rowsOf(path))).toEqual([]);
		},
	);

	test("the first gate of each job of the table resets the stack, and each row names a stack of its profile", () => {
		expect(
			stacks.flatMap((row) => {
				const gates = stackGatesOf(profileOf(row.profile)).filter(
					(gate) => gate.stack === row.stack,
				);
				const first = gates.find((gate) => gate.name === row.oneJob[0]);
				if (gates.length === 0) return [`${row.profile}: ${row.stack}`];
				if (row.oneJob.length === 0) return [];
				return first !== undefined &&
					(first.command === row.reset || first.setup[0] === row.reset)
					? []
					: [`${row.profile}: ${row.oneJob[0]}`];
			}),
		).toEqual([]);
	});
});
