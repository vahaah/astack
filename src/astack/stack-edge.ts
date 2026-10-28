import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Io } from "./cli/io.ts";
import { err, ok, type Result } from "./result.ts";
import {
	parseStackRecord,
	projectIdOf,
	type StackRecord,
	type StoredRecord,
	stackRecordText,
	type WatchedFile,
} from "./stack-config.ts";

const PROJECT_LABEL = "com.supabase.cli.project";

export type Checkout = {
	readonly root: string;
	readonly commonDir: string;
};

function spawnText(
	io: Io,
	program: string,
	args: readonly string[],
): Result<string, string> {
	const result = spawnSync(program, args, {
		cwd: io.cwd,
		env: io.env,
		encoding: "utf8",
	});
	if (result.error !== undefined) return err(result.error.message);
	if (result.status !== 0) return err(result.stderr.trim());
	return ok(result.stdout);
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function stackProject(io: Io, folder: string): Result<string, string> {
	let configToml: string;
	try {
		configToml = readFileSync(
			join(resolve(io.cwd, folder), "config.toml"),
			"utf8",
		);
	} catch {
		return err(`cannot read ${folder}/config.toml`);
	}
	const project = projectIdOf(configToml);
	return project === undefined
		? err(`${folder}/config.toml names no project_id`)
		: ok(project);
}

export function checkoutOf(io: Io): Result<Checkout, string> {
	const root = spawnText(io, "git", ["rev-parse", "--show-toplevel"]);
	const common = spawnText(io, "git", ["rev-parse", "--git-common-dir"]);
	if (!root.ok || !common.ok) return err("not inside a git repository");
	return ok({
		root: root.value.trim(),
		commonDir: resolve(io.cwd, common.value.trim()),
	});
}

function fileAt(path: string, name: string): Result<WatchedFile, string> {
	try {
		return ok({ path: name, content: readFileSync(path) });
	} catch (error) {
		return isMissing(error)
			? ok({ path: name, content: undefined })
			: err(`cannot read ${name}: ${messageOf(error)}`);
	}
}

export function watchedFiles(
	io: Io,
	checkout: Checkout,
	watched: readonly string[],
): Result<readonly WatchedFile[], string> {
	const files = new Map<string, WatchedFile>();
	for (const path of watched) {
		const listed = spawnText(io, "git", [
			"ls-files",
			"-z",
			"--cached",
			"--others",
			"--exclude-standard",
			"--full-name",
			"--",
			path,
		]);
		if (!listed.ok) return err(`git ls-files failed: ${listed.error}`);
		const names = listed.value.split("\0").filter((name) => name !== "");
		if (names.length === 0)
			return err(`no file of this checkout is at ${path}`);
		for (const name of names) {
			const file = fileAt(join(checkout.root, name), name);
			if (!file.ok) return file;
			files.set(name, file.value);
		}
	}
	return ok([...files.values()]);
}

export function runningContainers(
	io: Io,
	project?: string,
): Result<readonly string[], string> {
	const filter =
		project === undefined
			? []
			: ["--filter", `label=${PROJECT_LABEL}=${project}`];
	const ids = spawnText(io, "docker", ["ps", "-q", "--no-trunc", ...filter]);
	if (!ids.ok) return err(`docker cannot list the containers: ${ids.error}`);
	return ok(
		ids.value
			.split("\n")
			.map((id) => id.trim())
			.filter((id) => id !== ""),
	);
}

export function recordPath(checkout: Checkout, project: string): string {
	return join(
		checkout.commonDir,
		"astack",
		"stack-config",
		`${encodeURIComponent(project)}.json`,
	);
}

export function readStackRecord(path: string): StoredRecord {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		return isMissing(error)
			? { kind: "missing" }
			: { kind: "unreadable", path };
	}
	const record = parseStackRecord(text);
	return record === undefined
		? { kind: "unreadable", path }
		: { kind: "found", record };
}

export function writeStackRecord(
	path: string,
	record: StackRecord,
): Result<string, string> {
	const temporary = `${path}.${process.pid}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(temporary, stackRecordText(record));
		renameSync(temporary, path);
		return ok(path);
	} catch (error) {
		return err(`cannot write ${path}: ${messageOf(error)}`);
	}
}
