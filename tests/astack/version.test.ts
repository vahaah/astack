import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { version as release } from "../../dist/package.json" with {
	type: "json",
};
import type { Io } from "../../src/astack/cli/io.ts";
import { main } from "../../src/astack/cli/main.ts";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function bundleWith(files: Readonly<Record<string, unknown>>): string {
	const root = mkdtempSync(join(tmpdir(), "astack-version-"));
	dirs.push(root);
	mkdirSync(join(root, "bin"));
	writeFileSync(
		join(root, "bin", "package.json"),
		JSON.stringify({ type: "module" }),
	);
	for (const [path, body] of Object.entries(files)) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), JSON.stringify(body));
	}
	return join(root, "bin", "astack.js");
}

async function version(scriptPath: string) {
	let out = "";
	let err = "";
	const io: Io = {
		out: (text) => {
			out += text;
		},
		err: (text) => {
			err += text;
		},
		cwd: tmpdir(),
		env: {},
		today: "2026-11-22",
		now: new Date("2026-11-22T00:00:00Z"),
		scriptPath,
	};
	const code = await main(["--version"], io);
	return { code, out, err };
}

test.each([
	[
		"[control:cli-version-claude] a Claude manifest wins over a package.json",
		{
			".claude-plugin/plugin.json": { name: "astack", version: "0.3.0+ab12" },
			".cursor-plugin/plugin.json": { name: "astack", version: "9.9.9" },
			"package.json": { name: "astack", version: "8.8.8" },
		},
		"0.3.0+ab12\n",
	],
	[
		"[control:cli-version-cursor] a Cursor manifest gives the version",
		{ ".cursor-plugin/plugin.json": { name: "astack", version: "0.3.0" } },
		"0.3.0\n",
	],
	[
		"[control:cli-version-package] a package.json above bin gives the version",
		{ "package.json": { name: "astack", version: "0.3.0" } },
		"0.3.0\n",
	],
])("%s", async (_name, files, printed) => {
	expect(await version(bundleWith(files))).toEqual({
		code: 0,
		out: printed,
		err: "",
	});
});

test("[control:cli-version-none] a script with no versioned manifest above it exits 1 with the folder", async () => {
	const script = bundleWith({ "package.json": { name: "astack" } });
	const result = await version(script);
	expect(result.code).toBe(1);
	expect(result.out).toBe("");
	expect(result.err).toBe(
		`astack --version: ${join(script, "..", "..")} holds no .claude-plugin/plugin.json, .cursor-plugin/plugin.json or package.json with a version\n`,
	);
});

test("[control:cli-version-link] node prints the release version through an npm bin link to the package CLI", () => {
	const scratch = mkdtempSync(join(tmpdir(), "astack-version-link-"));
	dirs.push(scratch);
	const bin = join(scratch, "node_modules", ".bin");
	mkdirSync(bin, { recursive: true });
	symlinkSync(
		resolve(import.meta.dir, "../../dist/cli/astack.js"),
		join(bin, "astack"),
	);
	const result = spawnSync("node", [join(bin, "astack"), "--version"], {
		cwd: scratch,
		encoding: "utf8",
	});
	expect({
		code: result.status,
		out: result.stdout,
		err: result.stderr,
	}).toEqual({ code: 0, out: `${release}\n`, err: "" });
});
