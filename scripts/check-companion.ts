import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseProfile } from "../src/astack/pr-review-profile.ts";
import { profileProblems } from "../src/astack/profile.ts";
import { findingLine } from "../src/astack/ste/format.ts";
import { loadSettings } from "../src/astack/ste/profile.ts";
import {
	type Companion,
	companionPaths,
	openCompanion,
	PROFILE_SCAN_ENV,
} from "./lib/companion.ts";
import {
	loadAllProjects,
	type ProjectConfig,
	ProjectConfigError,
	profileDirFor,
	repoRoot,
	reviewProfileName,
} from "./lib/projects.ts";
import {
	renderAstackProfile,
	renderReviewCopies,
	reviewStubSource,
} from "./lib/render.ts";
import {
	type OwnSource,
	ownTextReport,
	renderedTextReport,
} from "./lib/ste-own.ts";

const usage = "Usage: bun scripts/check-companion.ts [--companion <dir>]";

type ProjectCheck = {
	readonly profiles: readonly OwnSource[];
	readonly problems: readonly string[];
};

function checkProject(
	companion: Companion,
	project: ProjectConfig,
): ProjectCheck {
	const dir = join(companionPaths(companion).projects, project.name);
	const branches = [undefined, ...Object.keys(project.branches ?? {})];
	const profiles = branches.flatMap((branch): OwnSource[] => {
		const path = join(profileDirFor(dir, branch), reviewProfileName);
		return existsSync(path)
			? [
					{
						path: relative(companion.root, path),
						text: readFileSync(path, "utf8"),
					},
				]
			: [];
	});
	const problems = [
		...branches.flatMap(
			(branch) =>
				renderReviewCopies(project, dir, reviewStubSource, branch).problems,
		),
		...profiles.flatMap((profile) =>
			parseProfile(profile.text).issues.map(
				(issue) => `${profile.path}: ${issue.path}: ${issue.message}`,
			),
		),
		...profileProblems(JSON.parse(renderAstackProfile(project).content)).map(
			(problem) => `.astack/profile.json: ${problem}`,
		),
	];
	return {
		profiles,
		problems: problems.map((problem) => `${project.name}: ${problem}`),
	};
}

function steProblems(
	companion: Companion,
	profiles: readonly OwnSource[],
): string[] {
	const own = ownTextReport(profiles, loadSettings(repoRoot).glossary);
	const rendered = renderedTextReport(
		repoRoot,
		companionPaths(companion).projects,
	);
	return [
		...[...own.errors, ...rendered.errors].map(
			({ path, message }) => `${path}: ${message}`,
		),
		...[...own.findings, ...rendered.findings].map(
			({ path, finding }) => `${path}: ${findingLine(finding)}`,
		),
	];
}

async function profileScanFiles(companion: Companion): Promise<string[]> {
	const testsDir = join(repoRoot, "tests");
	const own = (
		await Array.fromAsync(new Bun.Glob("**/*.test.ts").scan({ cwd: testsDir }))
	).filter((file) => {
		const text = readFileSync(join(testsDir, file), "utf8");
		return (
			text.includes("profile-paths.ts") &&
			/\b(?:profilePaths|scanProjectDirs)\b/.test(text)
		);
	});
	const companionTests = companionPaths(companion).tests;
	const extra = existsSync(companionTests)
		? await Array.fromAsync(
				new Bun.Glob("**/*.test.ts").scan({
					cwd: companionTests,
					absolute: true,
				}),
			)
		: [];
	return [...own.map((file) => `./tests/${file}`).sort(), ...extra.sort()];
}

async function profileScanProblems(companion: Companion): Promise<string[]> {
	const run = spawnSync(
		"bun",
		["test", ...(await profileScanFiles(companion))],
		{
			cwd: repoRoot,
			encoding: "utf8",
			env: { ...process.env, [PROFILE_SCAN_ENV]: companion.root },
		},
	);
	if (run.status === 0) return [];
	const failed = new Set(
		`${run.stdout}\n${run.stderr}`.split("\n").flatMap((line) => {
			const name = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line)?.[1];
			return name === undefined ? [] : [`profile scan: ${name}`];
		}),
	);
	return failed.size > 0
		? [...failed]
		: [`profile scan: bun test exited ${run.status ?? "on a signal"}`];
}

async function main(args: readonly string[]): Promise<number> {
	const [flag, value, ...rest] = args;
	if (
		rest.length > 0 ||
		(flag !== undefined && (flag !== "--companion" || value === undefined))
	) {
		console.error(usage);
		return 2;
	}
	const opened = openCompanion(value, process.env);
	if (!opened.ok) {
		console.error(opened.error);
		return 2;
	}
	const companion = opened.value;
	const projects = await loadAllProjects(companionPaths(companion).projects);
	const checks = projects.map((project) => checkProject(companion, project));
	const profiles = checks.flatMap((check) => check.profiles);
	const problems = [
		...checks.flatMap((check) => check.problems),
		...steProblems(companion, profiles),
		...(await profileScanProblems(companion)),
	];
	for (const problem of problems) console.error(problem);
	console.log(
		`check:companion: ${projects.length} config(s) and ${profiles.length} profile(s) in ${companion.root}, ${problems.length} problem(s)`,
	);
	return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) {
	try {
		process.exitCode = await main(Bun.argv.slice(2));
	} catch (error) {
		if (!(error instanceof ProjectConfigError)) throw error;
		console.error(error.message);
		process.exitCode = 1;
	}
}
