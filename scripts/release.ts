import { readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "../src/astack/result.ts";
import { git, messageOf, run } from "./lib/exec.ts";

const SHA = /^[a-f0-9]{40}$/;
const VERSION =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReleaseVersion(value: string): boolean {
	const match = VERSION.exec(value);
	if (match === null || match[0] !== value) return false;
	const prerelease = match.groups?.prerelease;
	return (
		prerelease === undefined ||
		!prerelease.split(".").some((part) => /^0\d+$/.test(part))
	);
}

function packageVersion(root: string): Result<string, string> {
	let text: string;
	try {
		text = readFileSync(join(root, "package.json"), "utf8");
	} catch {
		return err("Could not read package.json.");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return err("package.json is not JSON.");
	}
	return isRecord(parsed) &&
		typeof parsed.version === "string" &&
		isReleaseVersion(parsed.version)
		? ok(parsed.version)
		: err("package.json version must be a release version such as 0.1.0.");
}

async function api(
	root: string,
	endpoint: string,
	label: string,
): Promise<Result<unknown, string>> {
	const result = await run(
		[
			"gh",
			"api",
			"--method",
			"GET",
			"--hostname",
			"github.com",
			"--header",
			"Accept: application/vnd.github+json",
			"--header",
			"X-GitHub-Api-Version: 2026-03-10",
			endpoint,
		],
		{ cwd: root, timeoutSeconds: 30 },
	);
	if (result.exitCode !== 0) return err(`Could not read the ${label}.`);
	try {
		const parsed: unknown = JSON.parse(result.stdout);
		return ok(parsed);
	} catch {
		return err(`The ${label} response is not JSON.`);
	}
}

function tagObjectSha(value: unknown, ref: string): Result<string, string> {
	if (!isRecord(value) || value.ref !== ref)
		return err(`The remote ref must equal ${ref}.`);
	if (!isRecord(value.object) || value.object.type !== "tag")
		return err("The release ref must point to an annotated tag.");
	return typeof value.object.sha === "string" && SHA.test(value.object.sha)
		? ok(value.object.sha)
		: err("The release ref has no valid tag object SHA.");
}

function tagProblem(
	value: unknown,
	expected: {
		readonly sha: string;
		readonly tag: string;
		readonly head: string;
	},
): string | undefined {
	if (!isRecord(value) || value.sha !== expected.sha)
		return "The annotated tag object SHA does not match its remote ref.";
	if (value.tag !== expected.tag)
		return "The annotated tag name does not match the package version.";
	if (!isRecord(value.object) || value.object.type !== "commit")
		return "The annotated tag target must be a commit.";
	if (value.object.sha !== expected.head)
		return "The annotated tag target does not match checkout HEAD.";
	if (
		!isRecord(value.verification) ||
		value.verification.verified !== true ||
		value.verification.reason !== "valid"
	)
		return "The annotated tag must have a GitHub verified signature with reason valid.";
	return undefined;
}

async function main(): Promise<number> {
	if (Bun.argv.length > 2) {
		console.error("Usage: bun scripts/release.ts");
		return 2;
	}
	const root = process.cwd();
	const repository = process.env.GITHUB_REPOSITORY;
	if (
		repository === undefined ||
		!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
		[".", ".."].includes(repository.split("/")[1] ?? "")
	) {
		console.error("GITHUB_REPOSITORY must name owner/repo on GitHub.");
		return 1;
	}
	const ref = process.env.GITHUB_REF;
	if (ref === undefined || !ref.startsWith("refs/tags/")) {
		console.error("GITHUB_REF must start with refs/tags/.");
		return 1;
	}
	const version = packageVersion(root);
	if (!version.ok) {
		console.error(version.error);
		return 1;
	}
	const tag = `v${version.value}`;
	if (ref !== `refs/tags/${tag}`) {
		console.error(
			`The requested tag must match package version ${version.value}.`,
		);
		return 1;
	}
	const checkout = await git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
	const head = checkout.stdout.trim();
	if (checkout.exitCode !== 0 || !SHA.test(head)) {
		console.error("Could not read checkout HEAD as a commit SHA.");
		return 1;
	}
	const reference = await api(
		root,
		`repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
		"remote tag reference",
	);
	if (!reference.ok) {
		console.error(reference.error);
		return 1;
	}
	const sha = tagObjectSha(reference.value, ref);
	if (!sha.ok) {
		console.error(sha.error);
		return 1;
	}
	const object = await api(
		root,
		`repos/${repository}/git/tags/${sha.value}`,
		"annotated tag",
	);
	if (!object.ok) {
		console.error(object.error);
		return 1;
	}
	const problem = tagProblem(object.value, { sha: sha.value, tag, head });
	if (problem !== undefined) {
		console.error(problem);
		return 1;
	}
	console.log(`release: verified ${tag} at ${head}`);
	return 0;
}

if (import.meta.main) {
	try {
		process.exitCode = await main();
	} catch (error) {
		console.error(`release: ${messageOf(error)}`);
		process.exitCode = 1;
	}
}
