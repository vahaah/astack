import { err, ok, type Result } from "../result.ts";
import {
	CRITERION,
	type Fields,
	isRepoPath,
	MODEL_KEYS,
	modelProblem,
	NEGATIVE_KEYS,
	readDocument,
	readModel,
	readNegative,
	SYMBOL,
	TLA_NAME,
} from "./contract.ts";
import {
	type CodeMutation,
	type Conformance,
	type ModelRegistry,
	moduleName,
	REGISTRY_PATH,
	type RegistryModel,
	type Unmodelled,
} from "./rung.ts";

const GLOB_SHAPE = "must be a repository path or glob, outside .git";

function globs(fields: Fields, key: string, min: number): readonly string[] {
	return fields.texts(key, min).map((glob, index) => {
		if (glob !== "" && !isRepoPath(glob))
			fields.report(`${fields.at(key)}[${index}]`, GLOB_SHAPE);
		return glob;
	});
}

const ENTRY_KEYS = [
	"name",
	"model",
	"negative",
	"records",
	"covers",
	"text",
	"conformance",
];

function readMutation(mutation: Fields): CodeMutation {
	return {
		file: mutation.path("file", ".ts"),
		symbol: mutation.text("symbol", SYMBOL, "an identifier"),
		original: mutation.text("original"),
		replacement: mutation.string("replacement"),
		defect: mutation.text("defect"),
	};
}

function readConformance(conformance: Fields): Conformance {
	return {
		test: conformance.path("test", ".ts"),
		mutation: conformance.object(
			"mutation",
			["file", "symbol", "original", "replacement", "defect"],
			readMutation,
		),
	};
}

function readEntry(entry: Fields): RegistryModel {
	return {
		name: entry.text("name", TLA_NAME, "a TLA+ name"),
		model: entry.object("model", MODEL_KEYS, readModel),
		negative: entry.object("negative", NEGATIVE_KEYS, readNegative),
		records: entry.paths("records", 1, ".md"),
		covers: globs(entry, "covers", 0),
		text: globs(entry, "text", 0),
		...(entry.value("conformance") === undefined
			? {}
			: {
					conformance: entry.object(
						"conformance",
						["test", "mutation"],
						readConformance,
					),
				}),
	};
}

function readUnmodelled(row: Fields): Unmodelled {
	const path = row.text("path");
	if (path !== "" && !isRepoPath(path)) row.fail("path", GLOB_SHAPE);
	return {
		path,
		reason: row.text("reason"),
		control: row.text("control", CRITERION, "a control ID"),
	};
}

function entryProblem(models: readonly RegistryModel[]): string | undefined {
	for (const [index, entry] of models.entries()) {
		const where = `models[${index}]`;
		if (models.findIndex((other) => other.name === entry.name) < index)
			return `${where}.name repeats the name ${entry.name}`;
		const { module } = entry.model;
		const own = moduleName(module);
		if (entry.name !== own)
			return `${where}.name must be ${own}, the module name of ${module}`;
		const problem = modelProblem(entry.model, entry.negative);
		if (problem !== undefined) return `${where}: ${problem}`;
	}
	return undefined;
}

export function parseRegistry(text: string): Result<ModelRegistry, string> {
	const read = readDocument(
		text,
		REGISTRY_PATH,
		["models", "failClosed", "contractOnly", "unmodelled"],
		(fields) => ({
			models: fields.objects("models", 1, ENTRY_KEYS, readEntry),
			failClosed: globs(fields, "failClosed", 0),
			contractOnly: globs(fields, "contractOnly", 0),
			unmodelled: fields.objects(
				"unmodelled",
				0,
				["path", "reason", "control"],
				readUnmodelled,
			),
		}),
	);
	if (!read.ok) return read;
	const problem = entryProblem(read.value.models);
	return problem === undefined ? ok(read.value) : err(problem);
}
