import { readFileSync } from "node:fs";
import { join } from "node:path";
import { companionPaths, openCompanion } from "./lib/companion.ts";
import { git } from "./lib/exec.ts";
import { isFrozen, LEAK_RULES, readLeakScan } from "./lib/leak-rules.ts";
import {
	type FileScan,
	type Finding,
	formatFinding,
	HASH_RULES,
	HashMatcher,
	lintFiles,
	type TextFile,
} from "./lib/neutrality.ts";
import {
	loadAllProjects,
	type ProjectConfig,
	ProjectConfigError,
	repoRoot,
} from "./lib/projects.ts";
import {
	type Rendered,
	readRuleSources,
	renderRepoArtifacts,
	renderWouldBeArtifacts,
} from "./lib/render.ts";
import {
	lintTarget,
	loadHashLists,
	readTargetDeny,
	type TargetDeny,
} from "./lib/target-lint.ts";

const reportRules = [...HASH_RULES, ...LEAK_RULES].sort((left, right) =>
	left.localeCompare(right),
);

export type TreeFile =
	| { readonly kind: "text"; readonly file: TextFile }
	| { readonly kind: "binary"; readonly path: string }
	| { readonly kind: "unread"; readonly path: string };

export function treeFileOf(path: string, bytes: Buffer): TreeFile {
	return bytes.includes(0)
		? { kind: "binary", path }
		: { kind: "text", file: { path, content: bytes.toString("utf8") } };
}

function readTreeFile(root: string, path: string): TreeFile {
	let bytes: Buffer;
	try {
		bytes = readFileSync(join(root, path));
	} catch {
		return { kind: "unread", path };
	}
	return treeFileOf(path, bytes);
}

function textsOf(files: readonly TreeFile[]): TextFile[] {
	return files.flatMap((read) => (read.kind === "text" ? [read.file] : []));
}

async function lintTexts(
	files: readonly TextFile[],
	deny: TargetDeny,
	leaks: FileScan,
): Promise<{ findings: Finding[]; warnings: string[] }> {
	const hashLists = await loadHashLists(deny.projects, deny.hashes);
	const findings = lintFiles(files, {
		matcher: new HashMatcher(hashLists.hashes),
		adrCitation: false,
		conflictMarkers: false,
		denySubstrings: [],
		denySubstringsExempt: [],
		leaks,
	});
	return { findings, warnings: hashLists.warnings };
}

export type TreeReport = {
	readonly code: 0 | 1 | 2;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
};

export async function scanTree(
	root: string,
	deny: TargetDeny,
	leaks: FileScan,
): Promise<TreeReport> {
	const listed = await git(root, ["ls-files", "-z"]);
	if (listed.exitCode !== 0) {
		return {
			code: 2,
			stdout: [],
			stderr: [`git ls-files failed in ${root}: ${listed.stderr.trim()}`],
		};
	}
	const paths = listed.stdout.split("\0").filter(Boolean);
	return scanFiles(
		paths.map((path) => readTreeFile(root, path)),
		deny,
		leaks,
	);
}

export async function scanFiles(
	files: readonly TreeFile[],
	deny: TargetDeny,
	leaks: FileScan,
): Promise<TreeReport> {
	const binaries = files.flatMap((read) =>
		read.kind === "binary" ? [read.path] : [],
	);
	const unread = files.flatMap((read) =>
		read.kind === "unread" ? [read.path] : [],
	);
	const unlisted = binaries.filter((path) => !isFrozen(path));
	const texts = textsOf(files);
	const { findings, warnings } = await lintTexts(texts, deny, leaks);
	const byRule = Map.groupBy(findings, (finding) => finding.rule);
	const counts = reportRules.map(
		(rule) => `${rule}: ${byRule.get(rule)?.length ?? 0} finding(s)`,
	);
	return {
		code:
			findings.length > 0 || unlisted.length > 0 || unread.length > 0 ? 1 : 0,
		stdout: [
			`neutral: read ${texts.length + binaries.length} of ${files.length} tracked file(s), ${binaries.length} binary`,
			...binaries.map((path) => `binary ${path}`),
			...counts,
			`neutral: ${findings.length} finding(s)`,
		],
		stderr: [
			...warnings.map((warning) => `warning: ${warning}`),
			...findings.map(formatFinding),
			...unlisted.map(
				(path) =>
					`${path}: binary, and only a frozen upstream snapshot can hold a binary file`,
			),
			...unread.map((path) => `${path}: tracked, but the scan cannot read it`),
		],
	};
}

export function targetFiles(
	project: ProjectConfig,
	companionProjects: string,
): Rendered {
	const sources = readRuleSources();
	const reviewDir = join(companionProjects, project.name);
	return project.mode === "report-only"
		? renderWouldBeArtifacts(project, sources, reviewDir)
		: renderRepoArtifacts(project, sources, reviewDir);
}

function usage(): string {
	return "Usage: bun scripts/neutral.ts [--target <project>] [--companion <dir>]";
}

async function main(args: readonly string[]): Promise<number> {
	let target: string | undefined;
	let companionFlag: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg !== "--target" && arg !== "--companion") {
			console.error(`Unknown argument: ${arg}. ${usage()}`);
			return 2;
		}
		const value = args[index + 1];
		index++;
		if (value === undefined) {
			console.error(usage());
			return 2;
		}
		if (arg === "--target") target = value;
		else companionFlag = value;
	}
	const companion = openCompanion(companionFlag, process.env);
	if (!companion.ok) {
		console.error(companion.error);
		return 2;
	}
	const companionProjects = companionPaths(companion.value).projects;
	const projects = await loadAllProjects(companionProjects);
	const deny = await readTargetDeny(companion.value, projects);
	if (!deny.ok) {
		console.error(deny.error);
		return 1;
	}
	let failed = false;
	if (target === undefined) {
		const leaks = await readLeakScan(companion.value, projects);
		if (!leaks.ok) {
			console.error(leaks.error);
			return 1;
		}
		const tree = await scanTree(repoRoot, deny.value, leaks.value);
		for (const line of tree.stderr) console.error(line);
		for (const line of tree.stdout) console.log(line);
		if (tree.code === 2) return 2;
		failed ||= tree.code === 1;
	}
	const targets =
		target === undefined
			? projects
			: projects.filter((project) => project.name === target);
	if (target !== undefined && targets.length === 0) {
		console.error(
			`Unknown project "${target}". Known: ${projects.map((project) => project.name).join(", ")}`,
		);
		return 2;
	}
	for (const project of targets) {
		const { artifacts: files, problems } = targetFiles(
			project,
			companionProjects,
		);
		const result = await lintTarget(project, files, deny.value);
		for (const warning of result.warnings) {
			console.error(`warning: ${warning}`);
		}
		for (const problem of problems) {
			console.error(`${project.name}: ${problem}`);
		}
		for (const finding of result.findings) {
			console.error(`${project.name}: ${formatFinding(finding)}`);
		}
		const label =
			project.mode === "report-only"
				? "would-be file(s), report-only"
				: "file(s)";
		console.log(
			`neutral --target ${project.name}: ${files.length} ${label}, ${result.findings.length} finding(s)`,
		);
		if (project.mode === "write") {
			failed ||= result.findings.length > 0 || problems.length > 0;
		}
	}
	return failed ? 1 : 0;
}

if (import.meta.main) {
	try {
		process.exitCode = await main(Bun.argv.slice(2));
	} catch (error) {
		if (!(error instanceof ProjectConfigError)) throw error;
		console.error(error.message);
		process.exitCode = 2;
	}
}
