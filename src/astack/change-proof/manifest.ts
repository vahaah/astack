import { join } from "node:path";
import { err, ok, type Result } from "../result.ts";
import type { ProofBase } from "./admission.ts";
import {
	changedPaths,
	type DiffTarget,
	gitLines,
	lstatOrUndefined,
} from "./candidate.ts";
import {
	isFolderManifest,
	isManifestPath,
	LEGACY_PROOF_MANIFEST,
	PROOF_MANIFEST_FOLDER,
} from "./contract.ts";

export type ManifestSearch =
	| { readonly kind: "manifest-base" }
	| {
			readonly kind: "merge-base";
			readonly ref: string;
			readonly commit: string;
			readonly changed: readonly string[];
			readonly atMergeBase: readonly string[];
	  };

export type ManifestView =
	| {
			readonly kind: "named";
			readonly path: string;
			readonly legacy: boolean;
	  }
	| {
			readonly kind: "search";
			readonly present: readonly string[];
			readonly search: ManifestSearch;
			readonly legacy: boolean;
	  };

export type ManifestChoice =
	| { readonly route: "found"; readonly path: string; readonly legacy: boolean }
	| { readonly route: "named"; readonly path: string; readonly legacy: boolean }
	| { readonly route: "fallback"; readonly path: string };

export type HeldManifests = {
	readonly at: string;
	readonly paths: readonly string[];
};

export function manifestCandidates(
	root: string,
	target: DiffTarget,
	named: string | undefined,
): Result<ManifestView, string> {
	const legacy =
		lstatOrUndefined(join(root, LEGACY_PROOF_MANIFEST)) !== undefined;
	if (named !== undefined) return ok({ kind: "named", path: named, legacy });
	const listed = gitLines(root, [
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
		"--",
		PROOF_MANIFEST_FOLDER,
	]);
	if (!listed.ok) return listed;
	const present = [...new Set(listed.value)]
		.filter(
			(path) =>
				isFolderManifest(path) &&
				lstatOrUndefined(join(root, path))?.isFile() === true,
		)
		.sort();
	if (target.kind === "manifest-base")
		return ok({ kind: "search", present, search: target, legacy });
	const changed = changedPaths(root, target.commit);
	if (!changed.ok) return changed;
	const atMergeBase = manifestsAt(root, target.commit);
	if (!atMergeBase.ok) return atMergeBase;
	return ok({
		kind: "search",
		present,
		search: {
			kind: "merge-base",
			ref: target.ref,
			commit: target.commit,
			changed: changed.value.map((entry) => entry.path),
			atMergeBase: atMergeBase.value,
		},
		legacy,
	});
}

export function chooseManifest(
	view: ManifestView,
): Result<ManifestChoice, string> {
	if (view.kind === "named")
		return ok({ route: "named", path: view.path, legacy: view.legacy });
	if (view.present.length === 0)
		return ok({ route: "fallback", path: LEGACY_PROOF_MANIFEST });
	const { search } = view;
	const candidates =
		search.kind === "manifest-base"
			? view.present
			: view.present.filter((path) => search.changed.includes(path));
	const [path, ...others] = candidates;
	if (path !== undefined && others.length === 0)
		return search.kind === "merge-base" && search.atMergeBase.includes(path)
			? err(
					`the merge base ${search.commit} of ${search.ref} holds ${path}. Add a new manifest under ${PROOF_MANIFEST_FOLDER}`,
				)
			: ok({ route: "found", path, legacy: view.legacy });
	const where =
		search.kind === "manifest-base"
			? "the tree holds"
			: `the diff from the merge base ${search.commit} of ${search.ref} and HEAD changes`;
	if (path === undefined)
		return err(`${where} no manifest under ${PROOF_MANIFEST_FOLDER}`);
	const ask =
		search.kind === "manifest-base"
			? "Pass --base <ref> or a manifest path"
			: "Pass a manifest path";
	return err(
		`${where} more than one manifest under ${PROOF_MANIFEST_FOLDER}: ${candidates.join(", ")}. ${ask}`,
	);
}

export function manifestsAt(
	root: string,
	commit: string,
): Result<readonly string[], string> {
	const listed = gitLines(root, [
		"ls-tree",
		"-r",
		"-z",
		"--name-only",
		commit,
		"--",
		PROOF_MANIFEST_FOLDER,
		LEGACY_PROOF_MANIFEST,
	]);
	return listed.ok ? ok(listed.value.filter(isManifestPath)) : listed;
}

export function manifestsHeldAt(
	root: string,
	base: ProofBase,
): Result<HeldManifests, string> {
	const listed = manifestsAt(root, base.manifest);
	if (!listed.ok) return listed;
	return ok({
		at: base.manifest,
		paths: listed.value.filter(
			(path) => lstatOrUndefined(join(root, path)) !== undefined,
		),
	});
}

export function staleManifests(
	choice: ManifestChoice,
	held: HeldManifests,
): Result<ManifestChoice, string> {
	if (choice.route === "fallback") return ok(choice);
	if (choice.route === "named" && !isFolderManifest(choice.path))
		return ok(choice);
	const stops = held.paths.map(
		(path) => `delete ${path}, which the manifest base ${held.at} holds`,
	);
	if (choice.legacy && !held.paths.includes(LEGACY_PROOF_MANIFEST))
		stops.push(
			`delete ${LEGACY_PROOF_MANIFEST} beside the manifest ${choice.path}`,
		);
	return stops.length === 0 ? ok(choice) : err(stops.join("; "));
}
