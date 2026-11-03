import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { repoRoot } from "../../../git.ts";
import { err, type Result } from "../../../result.ts";
import {
	checkDrift,
	driftSummary,
	type Matrix,
	parseMatrix,
	type Source,
} from "../../../spec-drift.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check spec-drift";

function isInside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function readSource(root: string, file: string): Source {
	let real: string;
	try {
		real = realpathSync(join(root, file));
	} catch {
		return { file, problem: "missing" };
	}
	if (!isInside(root, real) || real === root)
		return { file, problem: "outside" };
	try {
		if (!statSync(real).isFile()) return { file, problem: "not-a-file" };
		return { file, text: readFileSync(real, "utf8") };
	} catch {
		return { file, problem: "unreadable" };
	}
}

function readMatrix(root: string, io: Io, arg: string): Result<Matrix, string> {
	let real: string;
	try {
		real = realpathSync(resolve(io.cwd, arg));
	} catch {
		return err(`cannot read the matrix ${arg}`);
	}
	if (!isInside(root, real)) return err(`${arg} is not inside the repository`);
	let text: string;
	try {
		text = readFileSync(real, "utf8");
	} catch {
		return err(`cannot read the matrix ${arg}`);
	}
	return parseMatrix(text);
}

function run(args: readonly string[], io: Io): number {
	const [arg, ...rest] = args;
	if (arg === undefined || rest.length > 0)
		return usageError(io, `${NAME}: give exactly one matrix path`);
	const top = repoRoot(io.cwd);
	if (top === undefined)
		return usageError(io, `${NAME}: not inside a git repository`);
	const root = realpathSync(top);
	const matrix = readMatrix(root, io, arg);
	if (!matrix.ok) return usageError(io, `${NAME}: ${matrix.error}`);
	const drift = checkDrift(
		matrix.value,
		matrix.value.specs.map((file) => readSource(root, file)),
		matrix.value.tests.map((file) => readSource(root, file)),
	);
	for (const finding of drift.findings) io.out(`finding: ${finding}\n`);
	io.out(`${driftSummary(matrix.value, drift)}\n`);
	return drift.findings.length === 0 ? 0 : 1;
}

export const command: Command = {
	name: "spec-drift",
	summary:
		'Checks that the criteria of the listed spec files and the controls of the listed test files are linked in a matrix file. The matrix is JSON with the keys version (1), specs, tests, links and exemptions. Each links row is {"criterion": ID, "controls": [ID]}. Each exemption is {"control": ID, "kind": "shared" or "regression", "reason": text}. All paths are repository-relative regular files, with no glob. It reads each [criterion:ID] marker of a spec file and each [control:ID] marker of a test file as plain text. It fails when a criterion has no links row, a row or an exemption names an ID that no file declares, an ID repeats, a control has no row and no exemption with a reason, or an inventory is empty. It never runs a test, never reads a test framework and never judges whether a control really covers a criterion, so a pass shows traceability and not coverage. It reads no file outside the repository. Exits 0 with no finding, 1 with findings, and 2 for wrong arguments or a matrix that the schema refuses.',
	usage: "check spec-drift <matrix.json>",
	run,
};
