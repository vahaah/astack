import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	evaluate,
	gateFailures,
	parseCorpus,
	precisionTable,
} from "./lib/ste-precision.ts";

export const REPO_ROOT = join(import.meta.dir, "..");
export const CORPUS_PATH = join(REPO_ROOT, "tests/fixtures/ste/labelled.txt");

function precisionGate(): number {
	const { cases, errors } = parseCorpus(readFileSync(CORPUS_PATH, "utf8"));
	for (const error of errors) console.error(`ste corpus: ${error}`);
	const stats = evaluate(cases);
	console.log(precisionTable(stats));
	const failures = gateFailures(stats);
	for (const failure of failures) console.error(`ste precision: ${failure}`);
	return errors.length > 0 || failures.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exitCode = precisionGate();
