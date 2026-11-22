import { describe, expect, test } from "bun:test";
import type { ChangedPath } from "../../src/astack/change-proof/admission.ts";
import type {
	ModelContract,
	NegativeControl,
} from "../../src/astack/change-proof/contract.ts";
import {
	deriveLadder,
	type LadderInput,
	type ModelRegistry,
	REGISTRY_PATH,
	type RegistryModel,
	type Rung,
} from "../../src/astack/change-proof/rung.ts";

function contract(name: string): ModelContract {
	return {
		module: `formal/${name}.tla`,
		config: `formal/${name}.cfg`,
		dependencies: [],
		bounds: ["two steps"],
		fairness: [],
		invariants: ["TypeOK"],
		properties: [],
	};
}

function negative(name: string, action: string): NegativeControl {
	return {
		file: `formal/${name}.tla`,
		action,
		original: "/\\ guard",
		replacement: "",
		defect: `${action} skips its guard`,
		expect: { kind: "invariant", name: "TypeOK" },
	};
}

function entry(
	name: string,
	covers: readonly string[],
	text: readonly string[] = [],
): RegistryModel {
	return {
		name,
		model: contract(name),
		negative: negative(name, "Step"),
		records: [`docs/adr/${name}.md`],
		covers,
		text,
	};
}

const GUARDS = entry(
	"Guards",
	["src/hook/guard.ts", "src/pr/**"],
	["skills/stop/**"],
);
const ADMISSION = entry("Admission", ["src/proof/**"]);
const REGISTRY: ModelRegistry = {
	models: [GUARDS, ADMISSION],
	failClosed: ["src/hook/**", "src/proof/**", "formal/**"],
	contractOnly: ["**/*.md", "dist/**"],
	unmodelled: [
		{ path: "src/hook/telemetry.ts", reason: "it writes a log", control: "c1" },
	],
};
const MANIFEST = {
	model: contract("Admission"),
	negative: negative("Admission", "Admit"),
};
const TREE = new Set(REGISTRY.models.map((model) => model.model.module));

function input(
	paths: readonly (string | ChangedPath)[],
	edit: Partial<LadderInput> = {},
): LadderInput {
	return {
		changed: paths.map((path) =>
			typeof path === "string" ? { path, present: true } : path,
		),
		registry: { base: REGISTRY, tree: REGISTRY },
		floor: { base: "R0", tree: "R0" },
		manifest: MANIFEST,
		inTree: (path) => TREE.has(path),
		...edit,
	};
}

type Row = {
	readonly rung: Rung;
	readonly by: string;
	readonly runs: readonly string[];
};

function summary(ladder: ReturnType<typeof deriveLadder>): Row | string {
	if (!ladder.ok) return ladder.error;
	if (ladder.value.kind === "legacy") return "legacy";
	const { rung, cause, runs } = ladder.value;
	return {
		rung,
		by: cause.kind === "path" ? cause.path : `floor ${cause.side}`,
		runs: runs.map((run) => `${run.name} ${run.negative.action}`),
	};
}

describe("deriveLadder", () => {
	test.each<[string, LadderInput, Row | string]>([
		[
			"a docs-only diff gives R0 and runs nothing",
			input(["docs/design.md", "dist/skills/a.md"]),
			{ rung: "R0", by: "docs/design.md", runs: [] },
		],
		[
			"an unlisted path outside the fail-closed globs gives R1",
			input(["docs/design.md", "scripts/build.ts"]),
			{ rung: "R1", by: "scripts/build.ts", runs: [] },
		],
		[
			"a covered path runs the manifest model first and then its own model",
			input(["src/hook/guard.ts", "docs/design.md"]),
			{
				rung: "R4",
				by: "src/hook/guard.ts",
				runs: ["Admission Admit", "Guards Step"],
			},
		],
		[
			"a model file selects its model",
			input(["formal/Guards.cfg"]),
			{
				rung: "R4",
				by: "formal/Guards.cfg",
				runs: ["Admission Admit", "Guards Step"],
			},
		],
		[
			"a text glob selects its model, also for Markdown",
			input(["skills/stop/SKILL.md"]),
			{
				rung: "R4",
				by: "skills/stop/SKILL.md",
				runs: ["Admission Admit", "Guards Step"],
			},
		],
		[
			"a path of the manifest model runs one triple with the manifest negative",
			input(["src/proof/admission.ts"]),
			{ rung: "R4", by: "src/proof/admission.ts", runs: ["Admission Admit"] },
		],
		[
			"an unmodelled fail-closed file gives R1",
			input(["src/hook/telemetry.ts"]),
			{ rung: "R1", by: "src/hook/telemetry.ts", runs: [] },
		],
		[
			"a base floor of R4 raises a docs-only diff and runs the manifest model",
			input(["docs/design.md"], { floor: { base: "R4", tree: "R0" } }),
			{ rung: "R4", by: "floor base", runs: ["Admission Admit"] },
		],
		[
			"a tree floor of R1 raises R0",
			input(["docs/design.md"], { floor: { base: "R0", tree: "R1" } }),
			{ rung: "R1", by: "floor tree", runs: [] },
		],
		[
			"a floor below the path rung leaves the path rung",
			input(["scripts/build.ts"], { floor: { base: "R1", tree: "R0" } }),
			{ rung: "R1", by: "scripts/build.ts", runs: [] },
		],
		[
			"an uncovered fail-closed file stops and names the path",
			input(["docs/design.md", "src/hook/new.ts"]),
			"the changed path src/hook/new.ts is under the fail-closed glob src/hook/** of formal/models.json, but no model glob and no unmodelled entry names it",
		],
		[
			"a lost tree registry stops",
			input(["docs/design.md"], {
				registry: { base: REGISTRY, tree: undefined },
			}),
			"the diff base holds formal/models.json, but the tree does not. A model leaves the registry only through an edit of formal/models.json",
		],
		[
			"no registry on either side keeps the legacy run",
			input(["docs/design.md"], {
				registry: { base: undefined, tree: undefined },
			}),
			"legacy",
		],
		[
			"an unregistered manifest model stops",
			input(["docs/design.md"], {
				manifest: { model: contract("Other"), negative: MANIFEST.negative },
			}),
			"the manifest model formal/Other.tla is no model of formal/models.json",
		],
	])("[control:rl-rung] %s", (_name, given, expected) => {
		expect(summary(deriveLadder(given))).toEqual(expected);
	});

	test("[control:rl-registry-diff] a registry diff runs each model of both sides once, the manifest model first", () => {
		const gone = entry("Gone", ["src/gone.ts"]);
		const added = entry("Added", ["src/added.ts"]);
		const base: ModelRegistry = {
			...REGISTRY,
			models: [GUARDS, gone, ADMISSION],
		};
		const tree: ModelRegistry = {
			...REGISTRY,
			models: [ADMISSION, added, GUARDS],
		};
		const modules = new Set([...TREE, gone.model.module, added.model.module]);
		expect(
			summary(
				deriveLadder(
					input([REGISTRY_PATH], {
						registry: { base, tree },
						inTree: (path) => modules.has(path),
					}),
				),
			),
		).toEqual({
			rung: "R4",
			by: REGISTRY_PATH,
			runs: ["Admission Admit", "Added Step", "Guards Step", "Gone Step"],
		});
		expect(
			summary(
				deriveLadder(
					input([REGISTRY_PATH], {
						registry: { base, tree },
						inTree: (path) => TREE.has(path) || path === added.model.module,
					}),
				),
			),
		).toBe(
			"the registry model Gone names formal/Gone.tla, which the tree does not hold",
		);
	});

	test("[control:rl-deleted-path] a deleted path takes its rung from the base registry, so a file that leaves with its unmodelled entry does not stop", () => {
		const tree: ModelRegistry = { ...REGISTRY, unmodelled: [] };
		expect(
			summary(
				deriveLadder(
					input([{ path: "src/hook/telemetry.ts", present: false }], {
						registry: { base: REGISTRY, tree },
					}),
				),
			),
		).toEqual({
			rung: "R4",
			by: REGISTRY_PATH,
			runs: ["Admission Admit", "Guards Step"],
		});
	});
});
