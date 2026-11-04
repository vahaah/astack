import { err, ok, type Result } from "../result.ts";
import { parseMatrix } from "../spec-drift.ts";
import { type FileRead, modelPaths, proofSections } from "./admission.ts";
import type { ChangeProof } from "./contract.ts";

export function ciProofRecords(
	proof: ChangeProof,
	base: string,
	files: ReadonlyMap<string, FileRead>,
): Result<readonly string[], string> {
	if (proof.base !== base)
		return err("the committed proof base does not match the merge base");
	const records = [
		...new Set(
			proof.domain.adrs.flatMap((adr) =>
				adr.ratification === undefined ? [] : [adr.ratification.proofRecord],
			),
		),
	];
	const inputs = new Set([
		proof.domain.glossary,
		proof.domain.aggregate.path,
		proof.domain.controls.matrix,
		proof.category.typedWitness,
		...proof.domain.adrs.flatMap((adr) => [
			adr.file,
			...(adr.ratification === undefined
				? []
				: [adr.ratification.process.file]),
		]),
		...proof.category.objects.map((object) => object.link.path),
		...proof.category.arrows.map((arrow) => arrow.link.path),
		...proof.abstraction.relation.map((row) => row.concrete.path),
		...modelPaths(proof),
		proof.negative.file,
	]);
	const paths = [".astack/proof.json", ...records];
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
	for (const path of records) {
		if (!path.startsWith("formal/") || !path.endsWith(".md"))
			return err(`${path} is not a Markdown proof record under formal/`);
		const checked = proofSections(proof, files, path);
		if (!checked.ok) return checked;
	}
	return ok(paths);
}
