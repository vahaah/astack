import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "../scripts/lib/projects.ts";
import { cachedArchive, pinnedGitleaks } from "../scripts/secrets.ts";
import { envWithoutCompanion } from "./child-env.ts";

const realScanTimeout = 120_000;
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "astack-secrets-")));
	dirs.push(dir);
	return dir;
}

function plantedGithubPat(): string {
	const body = Array.from({ length: 36 }, (_, index) =>
		((index * 7) % 36).toString(36),
	).join("");
	return `${["gh", "p_"].join("")}${body}`;
}

function gitFolder(files: Readonly<Record<string, string>>): string {
	const root = tempDir();
	spawnSync("git", ["init", "-q", root]);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

function secrets(
	args: readonly string[],
	env: Record<string, string | undefined> = envWithoutCompanion(),
) {
	const result = spawnSync(
		process.execPath,
		[join(repoRoot, "scripts", "secrets.ts"), ...args],
		{ cwd: repoRoot, encoding: "utf8", env },
	);
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

const summary = (files: number, findings: number) =>
	`secrets: gitleaks ${pinnedGitleaks.version} read ${files} file(s), ${findings} finding(s)\n`;

describe("bun run secrets", () => {
	test(
		"names the gitleaks rule of a key planted at runtime and never prints the key",
		() => {
			const key = plantedGithubPat();
			const source = gitFolder({ "config.env": `export GH=${key}\n` });
			const result = secrets(["--source", source]);
			expect(result.stdout).toBe(`config.env:1 github-pat\n${summary(1, 1)}`);
			expect(result.status).toBe(1);
			expect(`${result.stdout}${result.stderr}`).not.toContain(key);
		},
		realScanTimeout,
	);

	test(
		"a gitleaks:allow comment and a .gitleaks.toml allowlist do not hide the key",
		() => {
			const source = gitFolder({
				"config.env": `export GH=${plantedGithubPat()} # gitleaks:allow\n`,
				".gitleaks.toml": `[extend]\nuseDefault = true\n[allowlist]\npaths = ['''config\\.env''']\n`,
			});
			const result = secrets(["--source", source]);
			expect(result.stdout).toBe(`config.env:1 github-pat\n${summary(2, 1)}`);
			expect(result.status).toBe(1);
		},
		realScanTimeout,
	);

	test("a tracked .gitleaksignore fails, because D23 allows no allow list", () => {
		const source = gitFolder({
			"config.env": "export NAME=value\n",
			"sub/.gitleaksignore": "config.env:github-pat:1\n",
		});
		const result = secrets(["--source", source]);
		expect(result.stderr).toBe(
			"sub/.gitleaksignore is a gitleaks allow list. Fix each finding instead.\n",
		);
		expect(result.stdout).toBe("");
		expect(result.status).toBe(1);
	});

	test(
		"the tree of this repo gives 0 findings",
		() => {
			const result = secrets([]);
			expect(result.stdout).toMatch(
				new RegExp(
					`^secrets: gitleaks ${pinnedGitleaks.version.replaceAll(".", "\\.")} read [1-9]\\d+ file\\(s\\), 0 finding\\(s\\)\\n$`,
				),
			);
			expect(result.status).toBe(0);
		},
		realScanTimeout,
	);

	test("a missing gitleaks binary exits 2", () => {
		const missing = join(tempDir(), "gitleaks");
		const result = secrets(["--gitleaks", missing]);
		expect(result.stderr).toBe(
			`The gitleaks binary ${missing} does not exist.\n`,
		);
		expect(result.stdout).toBe("");
		expect(result.status).toBe(2);
	});

	test("another gitleaks version exits 2", () => {
		const other = join(tempDir(), "gitleaks");
		writeFileSync(other, "#!/bin/sh\necho 8.29.1\n");
		chmodSync(other, 0o755);
		const result = secrets(["--gitleaks", other]);
		expect(result.stderr).toBe(
			`${other} is gitleaks 8.29.1, and the scan needs the pinned ${pinnedGitleaks.version}.\n`,
		);
		expect(result.stdout).toBe("");
		expect(result.status).toBe(2);
	});

	test("a cached archive that fails the published sha256 exits 2", () => {
		const env = { ...envWithoutCompanion(), XDG_CACHE_HOME: tempDir() };
		const archive = cachedArchive(env);
		if (!archive.ok) throw new Error(archive.error);
		mkdirSync(dirname(archive.value.path), { recursive: true });
		writeFileSync(archive.value.path, "not the published archive\n");
		const result = secrets([], env);
		expect(result.stderr).toBe(
			`${archive.value.path} does not have the published sha256 ${archive.value.sha256}. Delete it to download it again.\n`,
		);
		expect(result.stdout).toBe("");
		expect(result.status).toBe(2);
	});
});
