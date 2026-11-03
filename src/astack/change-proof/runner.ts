import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { err, ok, type Result } from "../result.ts";
import { isInside } from "./candidate.ts";
import type { ModelFile } from "./tla.ts";
import type { RunEnd } from "./tlc.ts";

export const TLC_PIN = {
	version: "1.7.4",
	url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
	sourceCommit: "5a47802b5c391f59ecdd44117981f4ff8c0656ba",
	sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
} as const;

export const DEADLINE_CAP_MS = 60_000;
const OUTPUT_CAP_BYTES = 16 * 1024 * 1024;
const MINIMUM_JAVA = 17;

type Env = Readonly<Record<string, string | undefined>>;

export type Checker = {
	readonly jar: Uint8Array;
	readonly java: string;
	readonly javaVersion: string;
};

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function pinned(path: string, bytes: Uint8Array): Result<Uint8Array, string> {
	return sha256(bytes) === TLC_PIN.sha256
		? ok(bytes)
		: err(
				`${path} does not have the pinned sha256 ${TLC_PIN.sha256} of tla2tools.jar ${TLC_PIN.version}`,
			);
}

function readJar(path: string): Result<Uint8Array, string> {
	try {
		const stat = lstatSync(path);
		if (!stat.isFile()) return err(`${path} is not a regular file`);
		return ok(readFileSync(path));
	} catch {
		return err(`${path} cannot be read`);
	}
}

function cachedJarPath(env: Env): string | undefined {
	const root = env.XDG_CACHE_HOME
		? join(env.XDG_CACHE_HOME, "astack")
		: env.HOME
			? join(env.HOME, ".cache", "astack")
			: undefined;
	return root === undefined
		? undefined
		: join(root, "tla2tools", TLC_PIN.version, "tla2tools.jar");
}

async function download(path: string): Promise<Result<Uint8Array, string>> {
	let bytes: Uint8Array;
	try {
		const response = await fetch(TLC_PIN.url);
		if (!response.ok)
			return err(`could not download ${TLC_PIN.url}: HTTP ${response.status}`);
		bytes = new Uint8Array(await response.arrayBuffer());
	} catch (error) {
		return err(
			`could not download ${TLC_PIN.url}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const verified = pinned(TLC_PIN.url, bytes);
	if (!verified.ok) return verified;
	mkdirSync(dirname(path), { recursive: true });
	const partial = `${path}.${process.pid}.partial`;
	writeFileSync(partial, bytes);
	renameSync(partial, path);
	return verified;
}

export async function pinnedJar(
	env: Env,
	root: string,
): Promise<Result<Uint8Array, string>> {
	const explicit = env.ASTACK_TLC_JAR;
	if (explicit !== undefined && explicit !== "") {
		if (!isAbsolute(explicit))
			return err(`ASTACK_TLC_JAR must be an absolute path, not ${explicit}`);
		let real: string;
		try {
			real = realpathSync(explicit);
		} catch {
			return err(`${explicit} cannot be read`);
		}
		if (isInside(root, real) || real === root)
			return err(`ASTACK_TLC_JAR must be outside the repository: ${explicit}`);
		const bytes = readJar(real);
		return bytes.ok ? pinned(explicit, bytes.value) : bytes;
	}
	const cached = cachedJarPath(env);
	if (cached === undefined)
		return err(
			"set HOME, XDG_CACHE_HOME or ASTACK_TLC_JAR, so the proof can find tla2tools.jar",
		);
	if (!existsSync(cached)) return download(cached);
	const bytes = readJar(cached);
	if (!bytes.ok) return bytes;
	const verified = pinned(cached, bytes.value);
	return verified.ok
		? verified
		: err(`${verified.error}. Delete it to download the pinned jar again`);
}

export function childEnv(env: Env): Record<string, string> {
	const child: Record<string, string> = {
		PATH: env.PATH ?? "",
		LC_ALL: "C",
		TZ: "UTC",
	};
	if (env.JAVA_HOME) child.JAVA_HOME = env.JAVA_HOME;
	return child;
}

export function javaRuntime(
	env: Env,
): Result<{ readonly java: string; readonly version: string }, string> {
	const java = env.JAVA_HOME ? join(env.JAVA_HOME, "bin", "java") : "java";
	const probe = spawnSync(java, ["-version"], {
		env: childEnv(env),
		encoding: "utf8",
		timeout: 20_000,
	});
	if (probe.error !== undefined || probe.status !== 0)
		return err(
			`Java ${MINIMUM_JAVA} or later is required, and ${java} -version failed`,
		);
	const version = /version "([^"]+)"/.exec(
		`${probe.stderr}${probe.stdout}`,
	)?.[1];
	const major = Number((version ?? "").replace(/^1\./, "").split(/[.+_-]/)[0]);
	if (version === undefined || !(major >= MINIMUM_JAVA))
		return err(
			`Java ${MINIMUM_JAVA} or later is required, but ${java} reports ${version ?? "no version"}`,
		);
	return ok({ java, version });
}

export function deadlineMs(env: Env): Result<number, string> {
	const raw = env.ASTACK_PROOF_TIMEOUT_MS;
	if (raw === undefined || raw === "") return ok(DEADLINE_CAP_MS);
	const value = Number(raw);
	return Number.isInteger(value) && value > 0 && value <= DEADLINE_CAP_MS
		? ok(value)
		: err(
				`ASTACK_PROOF_TIMEOUT_MS must be a whole number from 1 to ${DEADLINE_CAP_MS}, not ${raw}`,
			);
}

export type ModelRun = {
	readonly end: RunEnd;
	readonly cleanup: Result<undefined, string>;
};

function waitForExit(
	command: string,
	args: readonly string[],
	cwd: string,
	env: Record<string, string>,
	timeoutMs: number,
): Promise<RunEnd> {
	return new Promise((settle) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let bytes = 0;
		let stop: RunEnd | undefined;
		const halt = (reason: RunEnd): void => {
			stop ??= reason;
			child.kill("SIGKILL");
		};
		const timer = setTimeout(
			() => halt({ kind: "timeout", ms: timeoutMs }),
			timeoutMs,
		);
		const collect = (into: Buffer[]) => (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > OUTPUT_CAP_BYTES)
				halt({ kind: "output-cap", bytes: OUTPUT_CAP_BYTES });
			else into.push(chunk);
		};
		child.stdout.on("data", collect(stdout));
		child.stderr.on("data", collect(stderr));
		child.on("error", (error) => {
			stop ??= { kind: "failed", message: error.message };
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			if (stop !== undefined) settle(stop);
			else if (code === null)
				settle({ kind: "signalled", signal: signal ?? "unknown" });
			else
				settle({
					kind: "exited",
					code,
					stdout: Buffer.concat(stdout).toString("utf8"),
					stderr: Buffer.concat(stderr).toString("utf8"),
				});
		});
	});
}

function removeRoot(root: string): Result<undefined, string> {
	try {
		rmSync(root, { recursive: true, force: true });
	} catch (error) {
		return err(
			`could not remove ${root}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return existsSync(root) ? err(`could not remove ${root}`) : ok(undefined);
}

export async function runModel(
	env: Env,
	checker: Checker,
	files: readonly ModelFile[],
	module: string,
	config: string,
	timeoutMs: number,
): Promise<ModelRun> {
	let root: string;
	try {
		root = mkdtempSync(join(env.TMPDIR || tmpdir(), "astack-proof-"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { end: { kind: "failed", message }, cleanup: ok(undefined) };
	}
	let end: RunEnd;
	try {
		const model = join(root, "model");
		const javaTmp = join(root, "java-tmp");
		const jar = join(root, "tla2tools.jar");
		mkdirSync(model);
		mkdirSync(javaTmp);
		writeFileSync(jar, checker.jar);
		for (const file of files)
			writeFileSync(join(model, file.fileName), file.text);
		end = await waitForExit(
			checker.java,
			[
				"-Xms512m",
				"-Xmx512m",
				"-XX:+UseParallelGC",
				`-Djava.io.tmpdir=${javaTmp}`,
				"-cp",
				jar,
				"tlc2.TLC",
				"-tool",
				"-modelcheck",
				"-workers",
				"1",
				"-seed",
				"1",
				"-lncheck",
				"final",
				"-metadir",
				join(root, "meta"),
				"-config",
				config,
				module,
			],
			model,
			childEnv(env),
			timeoutMs,
		);
	} catch (error) {
		end = {
			kind: "failed",
			message: error instanceof Error ? error.message : String(error),
		};
	}
	return { end, cleanup: removeRoot(root) };
}
