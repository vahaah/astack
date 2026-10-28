import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { err, ok, type Result } from "../src/astack/result.ts";
import { git, messageOf, run } from "./lib/exec.ts";
import { repoRoot } from "./lib/projects.ts";

export const pinnedGitleaks = {
	version: "8.30.1",
	sha256: {
		"darwin-arm64":
			"b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
		"darwin-x64":
			"dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
		"linux-arm64":
			"e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
		"linux-x64":
			"551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
	},
} as const;

type Target = keyof typeof pinnedGitleaks.sha256;
type Env = Readonly<Record<string, string | undefined>>;
type PinnedArchive = {
	readonly path: string;
	readonly url: string;
	readonly sha256: string;
};
type SecretFinding = {
	readonly file: string;
	readonly line: number;
	readonly rule: string;
};
type Args = { readonly source: string; readonly gitleaks: string | undefined };

const usage =
	"Usage: bun scripts/secrets.ts [--source <dir>] [--gitleaks <bin>]";
const treeDir = "tree";

function isTarget(name: string): name is Target {
	return Object.hasOwn(pinnedGitleaks.sha256, name);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cacheRoot(env: Env): string | undefined {
	if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, "astack");
	return env.HOME ? join(env.HOME, ".cache", "astack") : undefined;
}

export function cachedArchive(env: Env): Result<PinnedArchive, string> {
	const { version } = pinnedGitleaks;
	const target = `${process.platform}-${process.arch}`;
	if (!isTarget(target)) {
		return err(
			`No gitleaks ${version} archive is pinned for ${target}. Pass --gitleaks <bin> with gitleaks ${version}.`,
		);
	}
	const root = cacheRoot(env);
	if (root === undefined) {
		return err("Set HOME or XDG_CACHE_HOME, so the scan can cache gitleaks.");
	}
	const name = `gitleaks_${version}_${target.replace("-", "_")}.tar.gz`;
	return ok({
		path: join(root, "gitleaks", version, name),
		url: `https://github.com/gitleaks/gitleaks/releases/download/v${version}/${name}`,
		sha256: pinnedGitleaks.sha256[target],
	});
}

function sha256Of(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function download(url: string): Promise<Result<Uint8Array, string>> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return err(`Could not download ${url}: HTTP ${response.status}.`);
		}
		return ok(new Uint8Array(await response.arrayBuffer()));
	} catch (error) {
		return err(`Could not download ${url}: ${messageOf(error)}`);
	}
}

async function verifiedArchive(
	archive: PinnedArchive,
): Promise<Result<string, string>> {
	if (existsSync(archive.path)) {
		return sha256Of(readFileSync(archive.path)) === archive.sha256
			? ok(archive.path)
			: err(
					`${archive.path} does not have the published sha256 ${archive.sha256}. Delete it to download it again.`,
				);
	}
	console.error(`downloading ${archive.url}`);
	const fetched = await download(archive.url);
	if (!fetched.ok) return fetched;
	if (sha256Of(fetched.value) !== archive.sha256) {
		return err(
			`${archive.url} does not have the published sha256 ${archive.sha256}.`,
		);
	}
	mkdirSync(dirname(archive.path), { recursive: true });
	const partial = `${archive.path}.${process.pid}`;
	writeFileSync(partial, fetched.value);
	renameSync(partial, archive.path);
	return ok(archive.path);
}

async function gitleaksBinary(
	flag: string | undefined,
	work: string,
): Promise<Result<string, string>> {
	if (flag !== undefined) {
		const binary = resolve(flag);
		return existsSync(binary)
			? ok(binary)
			: err(`The gitleaks binary ${binary} does not exist.`);
	}
	const archive = cachedArchive(process.env);
	if (!archive.ok) return archive;
	const verified = await verifiedArchive(archive.value);
	if (!verified.ok) return verified;
	const extracted = await run(
		["tar", "-xzf", verified.value, "-C", work, "gitleaks"],
		{ cwd: work, timeoutSeconds: 60 },
	);
	return extracted.exitCode === 0
		? ok(join(work, "gitleaks"))
		: err(
				`tar could not extract gitleaks from ${verified.value}: ${extracted.stderr.trim()}`,
			);
}

async function pinnedBinary(
	binary: string,
	work: string,
): Promise<Result<string, string>> {
	const result = await run([binary, "version"], {
		cwd: work,
		timeoutSeconds: 30,
	});
	if (result.exitCode !== 0) {
		return err(`${binary} version failed: ${result.stderr.trim()}`);
	}
	const version = result.stdout.trim();
	return version === pinnedGitleaks.version
		? ok(binary)
		: err(
				`${binary} is gitleaks ${version}, and the scan needs the pinned ${pinnedGitleaks.version}.`,
			);
}

async function listedFiles(
	source: string,
): Promise<Result<readonly string[], string>> {
	const listed = await git(source, [
		"ls-files",
		"-z",
		"-co",
		"--exclude-standard",
	]);
	if (listed.exitCode !== 0) {
		return err(`git ls-files failed in ${source}: ${listed.stderr.trim()}`);
	}
	const paths = [...new Set(listed.stdout.split("\0").filter(Boolean))];
	return ok(
		paths.filter(
			(path) =>
				lstatSync(join(source, path), { throwIfNoEntry: false })?.isFile() ===
				true,
		),
	);
}

function parseReport(text: string): Result<readonly SecretFinding[], string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return err(`The gitleaks report is not JSON: ${messageOf(error)}`);
	}
	if (!Array.isArray(parsed)) {
		return err("The gitleaks report is not a JSON array.");
	}
	const entries: readonly unknown[] = parsed;
	const findings: SecretFinding[] = [];
	for (const entry of entries) {
		if (
			!isRecord(entry) ||
			typeof entry.RuleID !== "string" ||
			typeof entry.File !== "string" ||
			typeof entry.StartLine !== "number"
		) {
			return err("A gitleaks finding has no RuleID, File or StartLine.");
		}
		findings.push({
			file: relative(treeDir, entry.File),
			line: entry.StartLine,
			rule: entry.RuleID,
		});
	}
	return ok(
		findings.sort(
			(left, right) =>
				left.file.localeCompare(right.file) || left.line - right.line,
		),
	);
}

async function scan(
	args: Args,
	files: readonly string[],
	work: string,
): Promise<Result<readonly SecretFinding[], string>> {
	const found = await gitleaksBinary(args.gitleaks, work);
	if (!found.ok) return found;
	const binary = await pinnedBinary(found.value, work);
	if (!binary.ok) return binary;
	for (const path of files) {
		const copy = join(work, treeDir, path);
		mkdirSync(dirname(copy), { recursive: true });
		copyFileSync(join(args.source, path), copy);
	}
	writeFileSync(join(work, "default.toml"), "[extend]\nuseDefault = true\n");
	const result = await run(
		[
			binary.value,
			"dir",
			treeDir,
			"--config",
			"default.toml",
			"--ignore-gitleaks-allow",
			"--redact",
			"--exit-code",
			"0",
			"--no-banner",
			"--log-level",
			"error",
			"--report-format",
			"json",
			"--report-path",
			"report.json",
		],
		{ cwd: work, timeoutSeconds: 300 },
	);
	if (result.exitCode !== 0) {
		return err(`gitleaks exited ${result.exitCode}: ${result.stderr.trim()}`);
	}
	return parseReport(readFileSync(join(work, "report.json"), "utf8"));
}

function parseArgs(argv: readonly string[]): Result<Args, string> {
	let source = repoRoot;
	let gitleaks: string | undefined;
	for (let index = 0; index < argv.length; index += 2) {
		const flag = argv[index];
		const value = argv[index + 1];
		if (value === undefined) return err(usage);
		if (flag === "--source") source = resolve(value);
		else if (flag === "--gitleaks") gitleaks = value;
		else return err(`Unknown argument: ${flag}. ${usage}`);
	}
	return ok({ source, gitleaks });
}

async function main(argv: readonly string[]): Promise<number> {
	const args = parseArgs(argv);
	if (!args.ok) {
		console.error(args.error);
		return 2;
	}
	const files = await listedFiles(args.value.source);
	if (!files.ok) {
		console.error(files.error);
		return 2;
	}
	const allowLists = files.value.filter(
		(path) => basename(path) === ".gitleaksignore",
	);
	for (const path of allowLists) {
		console.error(
			`${path} is a gitleaks allow list. Fix each finding instead.`,
		);
	}
	if (allowLists.length > 0) return 1;
	const work = mkdtempSync(join(tmpdir(), "astack-secrets-"));
	try {
		const findings = await scan(args.value, files.value, work);
		if (!findings.ok) {
			console.error(findings.error);
			return 2;
		}
		for (const finding of findings.value) {
			console.log(`${finding.file}:${finding.line} ${finding.rule}`);
		}
		console.log(
			`secrets: gitleaks ${pinnedGitleaks.version} read ${files.value.length} file(s), ${findings.value.length} finding(s)`,
		);
		return findings.value.length > 0 ? 1 : 0;
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	process.exitCode = await main(Bun.argv.slice(2));
}
