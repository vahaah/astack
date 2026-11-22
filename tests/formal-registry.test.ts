import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseRegistry } from "../src/astack/change-proof/registry.ts";
import {
	deriveLadder,
	type ModelRegistry,
	modelFiles,
	REGISTRY_PATH,
} from "../src/astack/change-proof/rung.ts";
import { planModel } from "../src/astack/change-proof/tla.ts";
import { anyGlob, globMatches } from "../src/astack/glob.ts";

const ROOT = resolve(import.meta.dir, "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const TRACKED = spawnSync("git", ["ls-files", "-z"], {
	cwd: ROOT,
	encoding: "utf8",
})
	.stdout.split("\0")
	.filter(Boolean);
const TRACKED_SET = new Set(TRACKED);

function loadRegistry(): ModelRegistry {
	const parsed = parseRegistry(read(REGISTRY_PATH));
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed.value;
}
const REGISTRY = loadRegistry();

function section(text: string, title: string): string {
	const heading = new RegExp(`^#{3,6} ${title}[ \\t]*$`, "m").exec(text);
	if (heading === null) return "";
	const rest = text.slice(heading.index + heading[0].length);
	const next = rest.search(/^#{1,6}[ \t]+/m);
	return next < 0 ? rest : rest.slice(0, next);
}

const PROOF_RECORDS = TRACKED.filter((path) =>
	/^(?:docs\/adr|formal)\/[^/]+\.md$/.test(path),
);

const SOURCES = TRACKED.filter(
	(path) => path.startsWith("src/") && path.endsWith(".ts"),
);
const SKILL_ROOT = "marketplace/plugins/astack/skills/";
const SKILL_FILES = TRACKED.filter((path) => path.startsWith(SKILL_ROOT));
const SKILLS = new Set(
	SKILL_FILES.map((path) => path.slice(SKILL_ROOT.length).split("/")[0]),
);
const NAME_COLLISIONS = new Set([
	"writeEvents src/astack/hook/decode/claude-code.ts",
	"sumSteEvents src/astack/doctor.ts",
	"changedPaths src/astack/hook/handlers/destructive.ts",
	"stop src/astack/cli/bin.ts",
	"stop src/astack/hook/encode/cursor.ts",
	"failed src/astack/doctor.ts",
]);

function declares(path: string, name: string): boolean {
	return new RegExp(
		`^(?:export\\s+)?(?:async\\s+)?(?:function\\*?|const|let|class|type|interface|enum)\\s+${name}\\b`,
		"m",
	).test(read(path));
}

function mappedFiles(module: string, record: string): readonly string[] {
	const text = section(read(record), "Implementation correspondence");
	const model = read(module);
	const quoted = [...text.matchAll(/(?:\b[a-z][a-z-]* )?`[^`\n]+`/g)].map(
		(match) => {
			const tick = match[0].indexOf("`");
			const owner = match[0].slice(0, tick).trim();
			return {
				name: match[0].slice(tick + 1, -1),
				root: SKILLS.has(owner) ? `${SKILL_ROOT}${owner}/` : "",
			};
		},
	);
	const ticked = quoted.map((tick) => tick.name);
	const symbols = ticked
		.filter((name) => /^[A-Za-z_]\w*$/.test(name))
		.filter((name) => !new RegExp(`\\b${name}\\b`).test(model))
		.flatMap((name) =>
			SOURCES.filter((path) => declares(path, name)).map(
				(path) => `${name} ${path}`,
			),
		);
	const files = quoted
		.filter(({ name }) => /^[\w./-]+\.\w+$/.test(name))
		.flatMap(({ name, root }) =>
			[...SOURCES, ...SKILL_FILES]
				.filter(
					(path) =>
						path.startsWith(root) &&
						(path === name || path.endsWith(`/${name}`)),
				)
				.map((path) => `${name} ${path}`),
		);
	const skills = [
		...text.matchAll(/\b[a-z][a-z-]*(?: and [a-z][a-z-]*)?(?= skills?\b)/g),
	]
		.flatMap((match) => match[0].split(" and "))
		.filter((name) => SKILLS.has(name))
		.map((name) => `${name} ${SKILL_ROOT}${name}/SKILL.md`);
	return [...symbols, ...files, ...skills];
}

describe("the model registry of astack", () => {
	test("[control:rl-registry-negatives] each registry negative passes the static model plan", () => {
		expect(
			REGISTRY.models.flatMap((entry) => {
				const { model, negative } = entry;
				const plan = planModel(model, negative, {
					module: read(model.module),
					config: read(model.config),
					dependencies: new Map(
						model.dependencies.map((path) => [path, read(path)]),
					),
				});
				return plan.ok ? [] : [`${entry.name}: ${plan.error}`];
			}),
		).toEqual([]);
	});

	test("[control:rl-records] records lists each file whose Formal claim names the model, and only those files", () => {
		const names = (path: string, module: string): boolean =>
			PROOF_RECORDS.includes(path) &&
			section(read(path), "Formal claim").includes(module);
		expect(
			REGISTRY.models.flatMap((entry) => [
				...PROOF_RECORDS.filter(
					(path) =>
						names(path, entry.model.module) && !entry.records.includes(path),
				).map((path) => `${entry.name} misses ${path}`),
				...entry.records
					.filter((path) => !names(path, entry.model.module))
					.map((path) => `${entry.name} lists ${path}`),
			]),
		).toEqual([]);
	});

	test("[control:rl-covers] each src path of a record, and each src file or skill that its correspondence maps, matches a covers or text glob of its model", () => {
		const mapped = REGISTRY.models.flatMap((entry) =>
			entry.records.flatMap((path) =>
				mappedFiles(entry.model.module, path).map((pair) => ({
					entry,
					path,
					pair,
				})),
			),
		);
		expect({
			cited: REGISTRY.models.flatMap((entry) =>
				entry.records.flatMap((path) =>
					[...read(path).matchAll(/\bsrc\/[\w./-]*\w/g)]
						.map((match) => match[0])
						.filter((cited) => !anyGlob(entry.covers, cited))
						.map((cited) => `${entry.name}: ${path} cites ${cited}`),
				),
			),
			mapped: mapped
				.filter(
					({ entry, pair }) =>
						!NAME_COLLISIONS.has(pair) &&
						!anyGlob(
							[...entry.covers, ...entry.text],
							pair.slice(pair.indexOf(" ") + 1),
						),
				)
				.map(({ entry, path, pair }) => `${entry.name}: ${path} maps ${pair}`),
			staleCollisions: [...NAME_COLLISIONS].filter(
				(pair) => !mapped.some((row) => row.pair === pair),
			),
		}).toEqual({ cited: [], mapped: [], staleCollisions: [] });
	});

	test.each(["src/astack/hook/handlers/merge-guard.ts", "src/astack/paths.ts"])(
		"[control:rl-covers-guard] a diff of %s with a PlanBoundary manifest runs PlanBoundary and then SessionGuards at R4",
		(path) => {
			const manifest = REGISTRY.models.find(
				(entry) => entry.name === "PlanBoundary",
			);
			if (manifest === undefined) throw new Error("no PlanBoundary model");
			const ladder = deriveLadder({
				changed: [{ path, present: true }],
				registry: { base: REGISTRY, tree: REGISTRY },
				floor: { base: "R0", tree: "R0" },
				manifest,
				inTree: (file) => TRACKED_SET.has(file),
			});
			expect(
				ladder.ok && ladder.value.kind === "ladder"
					? [ladder.value.rung, ...ladder.value.runs.map((run) => run.name)]
					: ladder,
			).toEqual(["R4", "PlanBoundary", "SessionGuards"]);
		},
	);

	test("[control:rl-fail-closed-new] a new file under a fail-closed folder of astack stops, also next to the unmodelled encoders", () => {
		const [manifest] = REGISTRY.models;
		if (manifest === undefined) throw new Error("the registry has no model");
		const ladder = deriveLadder({
			changed: [{ path: "src/astack/hook/encode/codex.ts", present: true }],
			registry: { base: REGISTRY, tree: REGISTRY },
			floor: { base: "R0", tree: "R0" },
			manifest,
			inTree: (file) => TRACKED_SET.has(file),
		});
		expect(ladder).toEqual({
			ok: false,
			error:
				"the changed path src/astack/hook/encode/codex.ts is under the fail-closed glob src/astack/hook/** of formal/models.json, but no model glob and no unmodelled entry names it",
		});
	});

	test("[control:rl-fail-closed-tree] each tracked file under a fail-closed glob has a model glob or an unmodelled entry", () => {
		const [manifest] = REGISTRY.models;
		if (manifest === undefined) throw new Error("the registry has no model");
		expect(
			TRACKED.filter((path) => anyGlob(REGISTRY.failClosed, path)).flatMap(
				(path) => {
					const ladder = deriveLadder({
						changed: [{ path, present: true }],
						registry: { base: REGISTRY, tree: REGISTRY },
						floor: { base: "R0", tree: "R0" },
						manifest,
						inTree: (file) => TRACKED_SET.has(file),
					});
					return ladder.ok ? [] : [ladder.error];
				},
			),
		).toEqual([]);
	});

	test("[control:rl-stale-glob] each glob and model file of the registry matches a tracked file", () => {
		const globs = [
			...REGISTRY.models.flatMap((entry) => [
				...entry.covers,
				...entry.text,
				...modelFiles(entry.model),
			]),
			...REGISTRY.failClosed,
			...REGISTRY.contractOnly,
			...REGISTRY.unmodelled.map((row) => row.path),
		];
		expect(
			globs.filter((glob) => !TRACKED.some((path) => globMatches(glob, path))),
		).toEqual([]);
	});

	test("[control:rl-unmodelled-control] each unmodelled entry names a control marker of a test", () => {
		const markers = new Set(
			TRACKED.filter((path) => path.startsWith("tests/")).flatMap((path) =>
				[...read(path).matchAll(/\[(?:control):([A-Za-z0-9._-]+)\]/g)].map(
					(match) => match[1],
				),
			),
		);
		expect(
			REGISTRY.unmodelled
				.filter((row) => !markers.has(row.control))
				.map((row) => `${row.path} names ${row.control}`),
		).toEqual([]);
	});
});
