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

function formalClaim(text: string): string {
	const heading = /^#{3,6} Formal claim[ \t]*$/m.exec(text);
	if (heading === null) return "";
	const rest = text.slice(heading.index + heading[0].length);
	const next = rest.search(/^#{1,6}[ \t]+/m);
	return next < 0 ? rest : rest.slice(0, next);
}

const PROOF_RECORDS = TRACKED.filter((path) =>
	/^(?:docs\/adr|formal)\/[^/]+\.md$/.test(path),
);

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

	test("[control:rl-records] records lists each file whose Formal claim names the model", () => {
		expect(
			REGISTRY.models.flatMap((entry) =>
				PROOF_RECORDS.filter(
					(path) =>
						formalClaim(read(path)).includes(entry.model.module) &&
						!entry.records.includes(path),
				).map((path) => `${entry.name} misses ${path}`),
			),
		).toEqual([]);
	});

	test("[control:rl-covers] each src path of a record matches a covers glob of its model", () => {
		expect(
			REGISTRY.models.flatMap((entry) =>
				entry.records
					.filter((path) => TRACKED_SET.has(path))
					.flatMap((path) =>
						[...read(path).matchAll(/\bsrc\/[\w./-]*\w/g)]
							.map((match) => match[0])
							.filter((cited) => !anyGlob(entry.covers, cited))
							.map((cited) => `${entry.name}: ${path} cites ${cited}`),
					),
			),
		).toEqual([]);
	});

	test("[control:rl-fail-closed] each tracked file under a fail-closed glob has a model glob or an unmodelled entry", () => {
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
				[...read(path).matchAll(/\[control:([A-Za-z0-9._-]+)\]/g)].map(
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
