import { expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

test("linked and copied YAML dependencies produce the same working CLI bytes", () => {
	const scratch = mkdtempSync(join(tmpdir(), "astack-bundle-"));
	try {
		const source = join(scratch, "source");
		mkdirSync(join(source, "marketplace/plugins/astack/bin"), {
			recursive: true,
		});
		cpSync(join(root, "src"), join(source, "src"), { recursive: true });
		cpSync(join(root, "package.json"), join(source, "package.json"));
		mkdirSync(join(source, "scripts/lib"), { recursive: true });
		for (const path of ["scripts/bundle.ts", "scripts/lib/bundle.ts"])
			cpSync(join(root, path), join(source, path));
		cpSync(
			join(root, "marketplace/.claude-plugin"),
			join(source, "marketplace/.claude-plugin"),
			{ recursive: true },
		);
		const yaml = realpathSync(join(root, "node_modules/yaml"));
		const build = (layout: "linked" | "copied") => {
			const cwd = join(scratch, layout);
			cpSync(source, cwd, { recursive: true });
			mkdirSync(join(cwd, "node_modules"));
			if (layout === "linked")
				symlinkSync(yaml, join(cwd, "node_modules/yaml"), "dir");
			else cpSync(yaml, join(cwd, "node_modules/yaml"), { recursive: true });
			const result = Bun.spawnSync(["bun", "run", "bundle"], { cwd });
			if (result.exitCode !== 0)
				throw new Error(`${layout} bundle failed: ${result.stderr.toString()}`);
			const path = join(cwd, "marketplace/plugins/astack/bin/astack.js");
			const cli = Bun.spawnSync(["node", path, "--help"], { cwd });
			const help = cli.stdout.toString();
			expect({
				code: cli.exitCode,
				error: cli.stderr.toString(),
				hasHookCommand: help.includes("astack hook"),
			}).toEqual({ code: 0, error: "", hasHookCommand: true });
			return { bytes: readFileSync(path), help };
		};
		const linked = build("linked");
		const copied = build("copied");
		expect(Buffer.compare(linked.bytes, copied.bytes)).toBe(0);
		expect(linked.help).toBe(copied.help);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
});
