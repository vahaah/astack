import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/release.ts");
const VERSION = "1.2.3";
const TAG = `v${VERSION}`;
const TAG_SHA = "a".repeat(40);
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture(version = VERSION) {
	const tagName = `v${version}`;
	const root = realpathSync(mkdtempSync(join(tmpdir(), "astack-release-")));
	dirs.push(root);
	const bin = join(root, "bin");
	mkdirSync(bin);
	const env = {
		PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
		HOME: root,
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_TERMINAL_PROMPT: "0",
		GH_CONFIG_DIR: join(root, "gh-config"),
		GITHUB_REPOSITORY: "example/astack",
		GITHUB_REF: `refs/tags/${tagName}`,
		FAKE_GH_RESPONSES: join(root, "responses.json"),
		FAKE_GH_LOG: join(root, "requests.jsonl"),
	} satisfies Record<string, string>;
	const git = (args: readonly string[]) => {
		const result = spawnSync(
			"git",
			[
				"-c",
				"core.hooksPath=/dev/null",
				"-c",
				"commit.gpgsign=false",
				"-c",
				"user.name=Fixture Author",
				"-c",
				"user.email=fixture@example.test",
				...args,
			],
			{ cwd: root, env, encoding: "utf8" },
		);
		if (result.status !== 0) throw new Error(result.stderr);
		return result.stdout.trim();
	};
	git(["init", "-q"]);
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ version: version }),
	);
	git(["add", "package.json"]);
	git(["commit", "-qm", "Fixture commit"]);
	const head = git(["rev-parse", "HEAD"]);
	const reference = {
		ref: `refs/tags/${tagName}`,
		object: { type: "tag", sha: TAG_SHA },
	};
	const tag = {
		sha: TAG_SHA,
		tag: tagName,
		object: { type: "commit", sha: head },
		verification: { verified: true, reason: "valid" },
	};
	const responses = (input: {
		reference?: unknown;
		tag?: unknown;
		referenceBody?: string;
		tagBody?: string;
		referenceCode?: number;
		tagCode?: number;
	}) => {
		writeFileSync(
			env.FAKE_GH_RESPONSES,
			JSON.stringify({
				reference: {
					body:
						input.referenceBody ?? JSON.stringify(input.reference ?? reference),
					code: input.referenceCode ?? 0,
				},
				tag: {
					body: input.tagBody ?? JSON.stringify(input.tag ?? tag),
					code: input.tagCode ?? 0,
				},
			}),
		);
		writeFileSync(env.FAKE_GH_LOG, "");
	};
	responses({});
	const binary = join(bin, "gh");
	writeFileSync(
		binary,
		`#!${process.execPath}
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const log = process.env.FAKE_GH_LOG;
const source = process.env.FAKE_GH_RESPONSES;
if (!log || !source) process.exit(97);
appendFileSync(log, JSON.stringify(args) + "\\n");
if (args[0] !== "api" || args[args.indexOf("--method") + 1] !== "GET" || args[args.indexOf("--hostname") + 1] !== "github.com") process.exit(98);
const endpoint = args.at(-1);
const kind = endpoint === "repos/example/astack/git/ref/tags/${encodeURIComponent(tagName)}" ? "reference" : endpoint === "repos/example/astack/git/tags/${TAG_SHA}" ? "tag" : undefined;
if (!kind) process.exit(98);
const data = JSON.parse(readFileSync(source, "utf8"));
const reply = typeof data === "object" && data !== null ? data[kind] : undefined;
if (typeof reply !== "object" || reply === null || typeof reply.body !== "string" || !Number.isInteger(reply.code)) process.exit(99);
process.stdout.write(reply.body);
process.exit(reply.code);
`,
	);
	chmodSync(binary, 0o755);
	return {
		root,
		head,
		reference,
		tag,
		responses,
		run: (overrides: Record<string, string> = {}) => {
			const result = spawnSync(process.execPath, [SCRIPT], {
				cwd: root,
				env: { ...env, ...overrides },
				encoding: "utf8",
			});
			return {
				code: result.status,
				stdout: result.stdout,
				stderr: result.stderr,
			};
		},
		requests: (): readonly unknown[] =>
			readFileSync(env.FAKE_GH_LOG, "utf8")
				.split("\n")
				.filter(Boolean)
				.map((line): unknown => JSON.parse(line)),
	};
}

test("accepts only the verified annotated version tag for the exact checkout through GET reads", () => {
	const repo = fixture();
	expect(repo.run()).toEqual({
		code: 0,
		stdout: `release: verified ${TAG} at ${repo.head}\n`,
		stderr: "",
	});
	const endpoints = repo
		.requests()
		.map((value) => (Array.isArray(value) ? value.at(-1) : undefined));
	expect(endpoints).toEqual([
		`repos/example/astack/git/ref/tags/${TAG}`,
		`repos/example/astack/git/tags/${TAG_SHA}`,
	]);
});

test("rejects unsigned, lightweight and mismatched remote tag identities", () => {
	const repo = fixture();
	const cases = [
		{
			reference: { ...repo.reference, ref: `refs/heads/${TAG}` },
			need: "remote ref",
		},
		{
			reference: {
				...repo.reference,
				object: { type: "commit", sha: repo.head },
			},
			need: "annotated tag",
		},
		{
			reference: {
				...repo.reference,
				object: { type: "tag", sha: "not-a-sha" },
			},
			need: "tag object SHA",
		},
		{ tag: { ...repo.tag, sha: "b".repeat(40) }, need: "tag object SHA" },
		{ tag: { ...repo.tag, tag: "v9.9.9" }, need: "tag name" },
		{
			tag: { ...repo.tag, object: { type: "tag", sha: repo.head } },
			need: "target must be a commit",
		},
		{
			tag: { ...repo.tag, object: { type: "commit", sha: "b".repeat(40) } },
			need: "checkout HEAD",
		},
		{
			tag: {
				...repo.tag,
				verification: { verified: false, reason: "unsigned" },
			},
			need: "verified signature",
		},
		{
			tag: { ...repo.tag, verification: { verified: true, reason: "invalid" } },
			need: "verified signature",
		},
		{
			tag: { ...repo.tag, verification: { verified: "true", reason: "valid" } },
			need: "verified signature",
		},
	];
	for (const scenario of cases) {
		repo.responses(scenario);
		const result = repo.run();
		expect({ code: result.code, stdout: result.stdout }).toEqual({
			code: 1,
			stdout: "",
		});
		expect(result.stderr).toContain(scenario.need);
	}
});

test("rejects unreadable or malformed API responses without claiming a release", () => {
	const repo = fixture();
	const cases = [
		{ referenceCode: 1, need: "read the remote tag reference" },
		{ tagCode: 1, need: "read the annotated tag" },
		{ referenceBody: "not JSON", need: "reference response is not JSON" },
		{ tagBody: "not JSON", need: "tag response is not JSON" },
		{ reference: [], need: "remote ref" },
		{ tag: [], need: "tag object SHA" },
	];
	for (const scenario of cases) {
		repo.responses(scenario);
		const result = repo.run();
		expect({ code: result.code, stdout: result.stdout }).toEqual({
			code: 1,
			stdout: "",
		});
		expect(result.stderr).toContain(scenario.need);
	}
});

test("rejects another requested version or malformed local inputs before any API read", () => {
	const repo = fixture();
	const scenarios: readonly {
		readonly env?: Record<string, string>;
		readonly package?: string;
		readonly need: string;
	}[] = [
		{ env: { GITHUB_REF: "refs/tags/v9.9.9" }, need: "package version" },
		{ env: { GITHUB_REF: "refs/heads/main" }, need: "refs/tags/" },
		{
			env: { GITHUB_REPOSITORY: "bad/repository/name" },
			need: "GITHUB_REPOSITORY",
		},
		{ package: '{"version":false}', need: "package.json version" },
		{ package: "not JSON", need: "package.json is not JSON" },
	];
	for (const scenario of scenarios) {
		writeFileSync(
			join(repo.root, "package.json"),
			scenario.package ?? JSON.stringify({ version: VERSION }),
		);
		repo.responses({});
		const result = repo.run(scenario.env);
		expect({ code: result.code, stdout: result.stdout }).toEqual({
			code: 1,
			stdout: "",
		});
		expect(result.stderr).toContain(scenario.need);
		expect(repo.requests()).toEqual([]);
	}
});

test("rejects noncanonical versions before requesting remote tag data", () => {
	for (const version of [
		"01.2.3",
		"1.2.3-01",
		"1.2.3-alpha..1",
		"1.2.3+build..1",
		"1.2.3\n",
	]) {
		const repo = fixture(version);
		expect(repo.run()).toEqual({
			code: 1,
			stdout: "",
			stderr: "package.json version must be a release version such as 0.1.0.\n",
		});
		expect(repo.requests()).toEqual([]);
	}
});

test("accepts zero versions and valid prerelease and build identifiers", () => {
	for (const version of ["0.0.0-0", "1.2.3-01a+001"]) {
		const repo = fixture(version);
		expect(repo.run()).toEqual({
			code: 0,
			stdout: `release: verified v${version} at ${repo.head}\n`,
			stderr: "",
		});
	}
});
