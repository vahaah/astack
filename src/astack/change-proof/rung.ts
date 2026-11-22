import { anyGlob, globMatches } from "../glob.ts";
import { err, ok, type Result } from "../result.ts";
import type { ChangedPath } from "./admission.ts";
import type { ModelContract, NegativeControl } from "./contract.ts";

export const REGISTRY_PATH = "formal/models.json";

export const RUNGS = ["R0", "R1", "R2", "R3", "R4"] as const;
export type Rung = (typeof RUNGS)[number];
const TLC_RUNG: Rung = "R4";

export type RegistryModel = {
	readonly name: string;
	readonly model: ModelContract;
	readonly negative: NegativeControl;
	readonly records: readonly string[];
	readonly covers: readonly string[];
	readonly text: readonly string[];
};

export type Unmodelled = {
	readonly path: string;
	readonly reason: string;
	readonly control: string;
};

export type ModelRegistry = {
	readonly models: readonly RegistryModel[];
	readonly failClosed: readonly string[];
	readonly contractOnly: readonly string[];
	readonly unmodelled: readonly Unmodelled[];
};

export type Side = "base" | "tree";

export type LadderInput = {
	readonly changed: readonly ChangedPath[];
	readonly registry: Readonly<Record<Side, ModelRegistry | undefined>>;
	readonly floor: Readonly<Record<Side, Rung>>;
	readonly manifest: {
		readonly model: ModelContract;
		readonly negative: NegativeControl;
	};
	readonly inTree: (path: string) => boolean;
};

export type LadderRun = {
	readonly name: string;
	readonly model: ModelContract;
	readonly negative: NegativeControl;
};

export type RungCause =
	| { readonly kind: "path"; readonly path: string }
	| { readonly kind: "floor"; readonly side: Side };

export type Ladder =
	| { readonly kind: "legacy" }
	| {
			readonly kind: "ladder";
			readonly rung: Rung;
			readonly cause: RungCause;
			readonly runs: readonly LadderRun[];
	  };

type PathRung =
	| {
			readonly kind: "rung";
			readonly rung: Rung;
			readonly models: readonly string[];
	  }
	| { readonly kind: "stop"; readonly glob: string };

function rungAtLeast(rung: Rung, floor: Rung): boolean {
	return RUNGS.indexOf(rung) >= RUNGS.indexOf(floor);
}

export function modelFiles(model: ModelContract): readonly string[] {
	return [model.module, model.config, ...model.dependencies];
}

function pathRung(registry: ModelRegistry, path: string): PathRung {
	if (path === REGISTRY_PATH)
		return {
			kind: "rung",
			rung: TLC_RUNG,
			models: registry.models.map((entry) => entry.name),
		};
	const models = registry.models
		.filter(
			(entry) =>
				modelFiles(entry.model).includes(path) ||
				anyGlob([...entry.covers, ...entry.text], path),
		)
		.map((entry) => entry.name);
	if (models.length > 0) return { kind: "rung", rung: TLC_RUNG, models };
	const glob = registry.failClosed.find((pattern) =>
		globMatches(pattern, path),
	);
	if (glob !== undefined)
		return registry.unmodelled.some((row) => globMatches(row.path, path))
			? { kind: "rung", rung: "R1", models: [] }
			: { kind: "stop", glob };
	return {
		kind: "rung",
		rung: anyGlob(registry.contractOnly, path) ? "R0" : "R1",
		models: [],
	};
}

export function deriveLadder(input: LadderInput): Result<Ladder, string> {
	const { base, tree } = input.registry;
	if (tree === undefined)
		return base === undefined
			? ok({ kind: "legacy" })
			: err(
					`the diff base holds ${REGISTRY_PATH}, but the tree does not. A model leaves the registry only through an edit of ${REGISTRY_PATH}`,
				);
	const manifest = tree.models.find(
		(entry) => entry.model.module === input.manifest.model.module,
	);
	if (manifest === undefined)
		return err(
			`the manifest model ${input.manifest.model.module} is no model of ${REGISTRY_PATH}`,
		);
	let rung: Rung = "R0";
	let cause: RungCause | undefined;
	const selected = new Set<string>();
	for (const { path, present } of input.changed) {
		const found = pathRung(present ? tree : (base ?? tree), path);
		if (found.kind === "stop")
			return err(
				`the changed path ${path} is under the fail-closed glob ${found.glob} of ${REGISTRY_PATH}, but no model glob and no unmodelled entry names it`,
			);
		for (const name of found.models) selected.add(name);
		if (cause === undefined || !rungAtLeast(rung, found.rung)) {
			rung = found.rung;
			cause = { kind: "path", path };
		}
	}
	if (input.changed.some((entry) => entry.path === REGISTRY_PATH))
		for (const entry of base?.models ?? []) selected.add(entry.name);
	const floorSide: Side = rungAtLeast(input.floor.base, input.floor.tree)
		? "base"
		: "tree";
	const floor = input.floor[floorSide];
	if (cause === undefined || !rungAtLeast(rung, floor)) {
		rung = floor;
		cause = { kind: "floor", side: floorSide };
	}
	if (rung !== TLC_RUNG) return ok({ kind: "ladder", rung, cause, runs: [] });
	const entries = [
		...tree.models,
		...(base?.models ?? []).filter(
			(entry) => !tree.models.some((own) => own.name === entry.name),
		),
	];
	const runs: LadderRun[] = [
		{ name: manifest.name, ...input.manifest },
		...entries
			.filter(
				(entry) => entry.name !== manifest.name && selected.has(entry.name),
			)
			.map(({ name, model, negative }) => ({ name, model, negative })),
	];
	const missing = runs.find((run) => !input.inTree(run.model.module));
	if (missing !== undefined)
		return err(
			`the registry model ${missing.name} names ${missing.model.module}, which the tree does not hold`,
		);
	return ok({ kind: "ladder", rung, cause, runs });
}
