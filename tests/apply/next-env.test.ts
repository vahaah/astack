import { describe, expect, test } from "bun:test";
import {
	commandWrites,
	rewriteGaps,
	untrackedRewrites,
	WRITERS,
	writerPackage,
} from "../../scripts/lib/next-env.ts";
import { profileGates } from "../../src/astack/pr-review-profile.ts";

const portal = JSON.stringify({
	name: "@acme/app",
	scripts: {
		dev: "next dev -p 3300",
		build: "next build --turbopack",
		start: "next start",
	},
});

const database = JSON.stringify({
	name: "@acme/supabase",
	scripts: {
		generate:
			"mkdir -p src/types && supabase gen types typescript --local --schema public > src/types/db.generated.ts",
		start: "supabase start > /dev/null 2>&1",
	},
});

const restore = {
	path: "apps/app/next-env.d.ts",
	why: "next build and next dev write the import of their route types.",
};

const types = "packages/supabase/src/types/db.generated.ts";

function gates(
	...entries: {
		name: string;
		command: string;
		setup?: string[];
		rewrites?: { path: string; why: string }[];
	}[]
) {
	return profileGates({ version: 1, gates: entries });
}

function found<T>(value: T | undefined): T[] {
	return value === undefined ? [] : [value];
}

const gap = (gate: string) =>
	`The gate ${gate} runs next build or next dev in apps/app, and git tracks apps/app/next-env.d.ts. next writes that file again when its text is not the text of the command. Add apps/app/next-env.d.ts to the rewrites of the gate, with the reason, so the run restores the file after the gate.`;

const redirectGap = (gate: string, where: string) =>
	`The gate ${gate} redirects the output of a command, such as supabase gen types, into a file in ${where}, and git tracks ${types}. The redirect writes the output of the command over that file each time the gate runs. Add ${types} to the rewrites of the gate, with the reason, so the run restores the file after the gate.`;

describe("the table of writers", () => {
	test("holds next, the output redirect, tee and an output flag, and each row has a test below", () => {
		expect(Object.keys(WRITERS)).toEqual(["next", "redirect", "tee", "output"]);
	});
});

describe("writerPackage", () => {
	test("reads the folder, the package name and the scripts that write next-env.d.ts", () => {
		expect(writerPackage("apps/app/package.json", portal)).toEqual({
			dir: "apps/app",
			name: "@acme/app",
			writes: [
				{ script: "dev", writer: "next", path: "apps/app/next-env.d.ts" },
				{ script: "build", writer: "next", path: "apps/app/next-env.d.ts" },
			],
		});
	});

	test("a script that redirects supabase gen types writes the target, from the folder of the package", () => {
		expect(writerPackage("packages/supabase/package.json", database)).toEqual({
			dir: "packages/supabase",
			name: "@acme/supabase",
			writes: [{ script: "generate", writer: "redirect", path: types }],
		});
		const app = JSON.stringify({
			scripts: {
				generate: `supabase gen types --lang=typescript --local > ../../${types}`,
			},
		});
		expect(writerPackage("apps/base/package.json", app)?.writes).toEqual([
			{ script: "generate", writer: "redirect", path: types },
		]);
	});

	test("a folder with no script that writes a repo file is not a writer package", () => {
		const root = JSON.stringify({ scripts: { build: "turbo build" } });
		const served = JSON.stringify({ scripts: { start: "next start" } });
		expect(writerPackage("package.json", root)).toBeUndefined();
		expect(writerPackage("package.json", served)).toBeUndefined();
		expect(writerPackage("package.json", undefined)).toBeUndefined();
		expect(writerPackage("package.json", "{")).toBeUndefined();
	});
});

describe("commandWrites", () => {
	test("next build writes the next-env.d.ts of the folder that a cd moves to", () => {
		expect(commandWrites("cd apps/app && next build", ".")).toEqual([
			{ writer: "next", where: "apps/app", path: "apps/app/next-env.d.ts" },
		]);
	});

	test("an output redirect writes its target, from the folder that a cd moves to", () => {
		expect(
			commandWrites(
				"(cd packages/supabase && supabase gen types typescript --local > src/types/db.generated.ts)",
				".",
			),
		).toEqual([
			{ writer: "redirect", where: "packages/supabase", path: types },
		]);
		expect(commandWrites("bun run report >> docs/report.md", ".")).toEqual([
			{ writer: "redirect", where: ".", path: "docs/report.md" },
		]);
	});

	test("tee writes each file that it names, from the folder that a cd moves to", () => {
		expect(
			commandWrites(
				`supabase gen types typescript --local | tee ${types} >/dev/null`,
				".",
			),
		).toEqual([{ writer: "tee", where: ".", path: types }]);
		expect(
			commandWrites("cd docs && bun run report | tee -a a.md 'b c.md'", "."),
		).toEqual([
			{ writer: "tee", where: "docs", path: "docs/a.md" },
			{ writer: "tee", where: "docs", path: "docs/b c.md" },
		]);
	});

	test("an output flag writes its file, and an output to /dev/null or a flag with no file writes no repo file", () => {
		expect(
			commandWrites(
				"cd packages/supabase && supabase gen types typescript --local -o src/types/db.generated.ts",
				".",
			),
		).toEqual([{ writer: "output", where: "packages/supabase", path: types }]);
		expect(
			commandWrites(
				"bunx openapi-typescript spec.yaml --output=src/api.ts",
				".",
			),
		).toEqual([{ writer: "output", where: ".", path: "src/api.ts" }]);
		expect(
			[
				"curl -fsS -o /dev/null http://localhost:3300/login",
				"git ls-files -z -o --exclude-standard",
			].flatMap((command) => commandWrites(command, ".")),
		).toEqual([]);
	});

	test("a redirect to a stream, a variable, /dev/null or a path outside the repo writes no repo file", () => {
		const commands = [
			"bun run test 2>&1",
			"echo failed >&2",
			"supabase start >/dev/null",
			'turbo run test --dry=json > "$RUNNER_TEMP/test-tasks.json"',
			'bun src/serve.ts > "$TMPDIR/smoke-api.log" 2>&1',
			"cd /work; echo tree > tree.txt",
			"echo x > ../outside.txt",
		];
		expect(commands.flatMap((command) => commandWrites(command, "."))).toEqual(
			[],
		);
	});
});

describe("rewriteGaps", () => {
	const packages = [
		...found(writerPackage("apps/app/package.json", portal)),
		...found(writerPackage("packages/supabase/package.json", database)),
	];
	const tracked = new Set(["apps/app/next-env.d.ts", types]);

	test("a gate that builds or serves the app with next dev, and has no rewrites entry, is a gap", () => {
		expect(
			rewriteGaps(
				packages,
				gates(
					{ name: "by-folder", command: "cd apps/app && bun run build" },
					{ name: "by-package", command: "bun run --filter=@acme/app build" },
					{ name: "root", command: "bun run build" },
					{ name: "dev-server", command: "bun run --filter=@acme/app dev" },
					{ name: "by-cwd", command: "bun run --cwd apps/app dev" },
					{
						name: "in-setup",
						command: "bun run e2e",
						setup: ["cd apps/app && next build"],
					},
				),
				tracked,
			),
		).toEqual([
			gap("by-folder"),
			gap("by-package"),
			gap("root"),
			gap("dev-server"),
			gap("by-cwd"),
			gap("in-setup"),
		]);
	});

	test("a gate that runs supabase gen types with an output redirect into a tracked file, and has no rewrites entry, is a gap", () => {
		expect(
			rewriteGaps(
				packages,
				gates(
					{
						name: "by-package",
						command: "bun run --filter=@acme/supabase generate",
					},
					{
						name: "by-folder",
						command: "cd packages/supabase && bun run generate",
					},
					{
						name: "direct",
						command: `supabase gen types typescript --local > ${types}`,
					},
				),
				tracked,
			),
		).toEqual([
			redirectGap("by-package", "packages/supabase"),
			redirectGap("by-folder", "packages/supabase"),
			redirectGap("direct", "the repo root"),
		]);
	});

	test("a gate that writes a tracked file with tee or with an output flag, and has no rewrites entry, is a gap", () => {
		const teeGap = `The gate tee sends the output of a command into a file with tee in the repo root, and git tracks ${types}. tee writes the output of the command over that file each time the gate runs. Add ${types} to the rewrites of the gate, with the reason, so the run restores the file after the gate.`;
		const outputGap = `The gate output gives a command an output file with -o or --output in packages/supabase, and git tracks ${types}. The command writes its output over that file each time the gate runs. Add ${types} to the rewrites of the gate, with the reason, so the run restores the file after the gate.`;
		expect(
			rewriteGaps(
				[],
				gates(
					{
						name: "tee",
						command: `supabase gen types typescript --local | tee ${types} >/dev/null`,
					},
					{
						name: "output",
						command:
							"cd packages/supabase && supabase gen types typescript --local -o src/types/db.generated.ts",
					},
				),
				tracked,
			),
		).toEqual([teeGap, outputGap]);
	});

	test("a gate that restores the file after it has no gap", () => {
		expect(
			rewriteGaps(
				packages,
				gates(
					{
						name: "portal-build",
						command: "bun run --filter=@acme/app build",
						rewrites: [restore],
					},
					{
						name: "types",
						command: "bun run --filter=@acme/supabase generate",
						rewrites: [{ path: types, why: "supabase gen types writes it." }],
					},
				),
				tracked,
			),
		).toEqual([]);
	});

	test("a gate that writes a file that git does not track has no gap", () => {
		expect(
			rewriteGaps(
				packages,
				gates(
					{ name: "portal-build", command: "bun run --filter=@acme/app build" },
					{
						name: "types",
						command: "bun run --filter=@acme/supabase generate",
					},
					{ name: "report", command: "bun run report > coverage/report.txt" },
				),
				new Set(),
			),
		).toEqual([]);
	});

	test("a gate that builds another package, serves the built app, or runs no build has no gap", () => {
		expect(
			rewriteGaps(
				packages,
				gates(
					{ name: "other", command: "bun run --filter=@acme/app-docs build" },
					{ name: "sibling", command: "cd apps/application && bun run build" },
					{ name: "bundler", command: "bun build ./src/index.ts" },
					{ name: "root-next", command: "next build" },
					{ name: "start", command: "bun run --filter=@acme/app start" },
					{ name: "env-file", command: "test -f apps/app/.env.local" },
					{ name: "docs-build", command: "bun run build:docs" },
					{
						name: "stack",
						command: "bun run --filter=@acme/supabase start",
					},
				),
				tracked,
			),
		).toEqual([]);
	});

	test("an app at the repo root takes a build that names no other folder", () => {
		expect(
			rewriteGaps(
				found(writerPackage("package.json", portal)),
				gates(
					{ name: "build", command: "bun run build" },
					{ name: "scoped", command: "bun run --filter=@acme/api build" },
				),
				new Set(["next-env.d.ts"]),
			),
		).toEqual([
			"The gate build runs next build or next dev in the repo root, and git tracks next-env.d.ts. next writes that file again when its text is not the text of the command. Add next-env.d.ts to the rewrites of the gate, with the reason, so the run restores the file after the gate.",
		]);
	});
});

describe("untrackedRewrites", () => {
	test("a rewrites path that git does not track is a problem, because git checkout cannot restore it", () => {
		expect(
			untrackedRewrites(
				gates(
					{ name: "tracked", command: "bun run build", rewrites: [restore] },
					{
						name: "stale",
						command: "bun run build",
						rewrites: [{ path: "apps/web/next-env.d.ts", why: "x" }],
					},
				),
				new Set(["apps/app/next-env.d.ts"]),
			),
		).toEqual([
			"The gate stale names apps/web/next-env.d.ts in rewrites, but git does not track that file, so the run cannot restore it.",
		]);
	});
});
