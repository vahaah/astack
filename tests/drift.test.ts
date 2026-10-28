import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	appendFileSync,
	chmodSync,
	cpSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const fixtures: string[] = [];
const GENERATED = [
	"dist",
	"rules/astack.md",
	"docs/migration.md",
	"marketplace/plugins/astack/NOTICE",
	"marketplace/plugins/astack/bin/astack.js",
	".claude-plugin/marketplace.json",
	".cursor-plugin/marketplace.json",
	"package.json",
	"LICENSE",
	"NOTICE",
];

afterAll(() => {
	for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function fixture(): string {
	const dir = mkdtempSync(join(tmpdir(), "astack-drift-"));
	fixtures.push(dir);
	for (const path of [
		"src",
		"scripts",
		"marketplace",
		"rules",
		"examples",
		"dist",
		".claude-plugin",
		".cursor-plugin",
		"package.json",
		"LICENSE",
		"NOTICE",
		"docs/migration.md",
	]) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		cpSync(join(ROOT, path), join(dir, path), { recursive: true });
	}
	mkdirSync(join(dir, "node_modules"));
	cpSync(
		realpathSync(join(ROOT, "node_modules/yaml")),
		join(dir, "node_modules/yaml"),
		{ recursive: true },
	);
	return dir;
}

function run(dir: string) {
	const result = Bun.spawnSync([process.execPath, "scripts/drift.ts"], {
		cwd: dir,
	});
	return {
		code: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function snapshot(dir: string): ReadonlyMap<string, string> {
	const entries = new Map<string, string>();
	const visit = (path: string) => {
		const absolute = join(dir, path);
		const info = lstatSync(absolute, { bigint: true });
		const hash = info.isFile()
			? createHash("sha256").update(readFileSync(absolute)).digest("hex")
			: "directory";
		entries.set(path, `${info.mode}:${info.mtimeNs}:${hash}`);
		if (info.isDirectory())
			for (const name of readdirSync(absolute).sort()) visit(`${path}/${name}`);
	};
	for (const path of GENERATED) visit(path);
	return entries;
}

test("fresh generated artifacts pass without changes to bytes, modes or mtimes", () => {
	const dir = fixture();
	const before = snapshot(dir);
	expect(run(dir)).toEqual({ code: 0, output: "drift: 0 differences\n" });
	expect(snapshot(dir)).toEqual(before);
});

test("fresh source rejects a stale CLI even when its dist copies match it", () => {
	const dir = fixture();
	appendFileSync(
		join(dir, "src/astack/cli/bin.ts"),
		'\nprocess.stderr.write("new source behavior\\n");\n',
	);
	const before = snapshot(dir);
	const result = run(dir);
	expect(result.code).toBe(1);
	for (const path of [
		"marketplace/plugins/astack/bin/astack.js",
		"dist/cli/astack.js",
		"dist/claude-code/astack/bin/astack.js",
	])
		expect(result.output).toContain(`${path}: stale bytes`);
	expect(snapshot(dir)).toEqual(before);
});

test("missing, extra, executable and linked outputs fail with their paths", () => {
	const cases = [
		{
			path: "dist/README.md",
			change: (path: string) => rmSync(path),
			problem: "missing",
		},
		{
			path: "dist/unexpected.txt",
			change: (path: string) => writeFileSync(path, "unexpected\n"),
			problem: "extra",
		},
		{
			path: "dist/cli/astack.js",
			change: (path: string) => chmodSync(path, 0o644),
			problem: "wrong executable bit",
		},
		{
			path: "dist/README.md",
			change: (path: string) => {
				rmSync(path);
				symlinkSync("../README.md", path);
			},
			problem: "symbolic link",
		},
	];
	for (const scenario of cases) {
		const dir = fixture();
		scenario.change(join(dir, scenario.path));
		const result = run(dir);
		expect(result.code).toBe(1);
		expect(result.output).toContain(`${scenario.path}: ${scenario.problem}`);
	}
});

test("stale root metadata and executable source outputs fail as prerequisites", () => {
	const dir = fixture();
	appendFileSync(join(dir, "NOTICE"), "stale notice\n");
	chmodSync(join(dir, "rules/astack.md"), 0o755);
	const before = snapshot(dir);
	const result = run(dir);
	expect(result.code).toBe(1);
	expect(result.output).toContain("NOTICE: stale generated file");
	expect(result.output).toContain("rules/astack.md: wrong executable bit");
	expect(snapshot(dir)).toEqual(before);
});
