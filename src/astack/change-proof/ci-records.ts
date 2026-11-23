import { readPlanBlock } from "../plan/domain.ts";
import { err, map, ok, type Result } from "../result.ts";
import { parseMatrix } from "../spec-drift.ts";
import {
	compositionPaths,
	type FileRead,
	modelPaths,
	proofSections,
} from "./admission.ts";
import type { ChangeProof } from "./contract.ts";

function sectionNames(
	proof: ChangeProof,
	files: ReadonlyMap<string, FileRead>,
): Result<readonly string[], string> {
	const { composition } = proof;
	if (composition.kind === "category")
		return ok(composition.category.arrows.map((arrow) => arrow.link.symbol));
	const plan = files.get(composition.plan);
	if (plan?.kind !== "text")
		return err(`${composition.plan} must supply the committed plan record`);
	return map(readPlanBlock(composition.plan, plan.text), (record) =>
		record.block.steps.map((step) => step.name),
	);
}

export function ciProofRecords(
	proof: ChangeProof,
	manifestPath: string,
	files: ReadonlyMap<string, FileRead>,
): Result<readonly string[], string> {
	const cited = proof.domain.adrs.flatMap((adr) =>
		adr.ratification === undefined
			? []
			: [{ path: adr.ratification.proofRecord, decision: adr.decision }],
	);
	const records = [...new Set(cited.map((record) => record.path))];
	const inputs = new Set([
		proof.domain.glossary,
		proof.domain.aggregate.path,
		proof.domain.controls.matrix,
		...compositionPaths(proof),
		...proof.domain.adrs.flatMap((adr) => [
			adr.file,
			...(adr.ratification === undefined
				? []
				: [adr.ratification.process.file]),
		]),
		...proof.abstraction.relation.map((row) => row.concrete.path),
		...modelPaths(proof),
		proof.negative.file,
	]);
	const paths = [manifestPath, ...records];
	for (const path of paths)
		if (inputs.has(path))
			return err(`${path} also supplies another proof input`);
	const matrixPath = proof.domain.controls.matrix;
	const matrixFile = files.get(matrixPath);
	if (matrixFile?.kind !== "text")
		return err(`${matrixPath} must supply the committed control matrix`);
	const matrix = parseMatrix(matrixFile.text);
	if (!matrix.ok) return err(`${matrixPath}: ${matrix.error}`);
	const sources = new Set([...matrix.value.specs, ...matrix.value.tests]);
	for (const path of paths)
		if (sources.has(path)) return err(`${path} also supplies a matrix source`);
	for (const path of records)
		if (!path.startsWith("formal/") || !path.endsWith(".md"))
			return err(`${path} is not a Markdown proof record under formal/`);
	if (cited.length === 0) return ok(paths);
	const names = sectionNames(proof, files);
	if (!names.ok) return names;
	for (const { path, decision } of cited) {
		const checked = proofSections(proof, names.value, files, path, decision);
		if (!checked.ok) return checked;
	}
	return ok(paths);
}
