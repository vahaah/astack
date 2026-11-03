import { err, ok, type Result } from "./result.ts";

export type Link = {
	readonly criterion: string;
	readonly controls: readonly string[];
};

export type Exemption = {
	readonly control: string;
	readonly kind: "shared" | "regression";
	readonly reason: string;
};

export type Matrix = {
	readonly specs: readonly string[];
	readonly tests: readonly string[];
	readonly links: readonly Link[];
	readonly exemptions: readonly Exemption[];
};

export type FileProblem = "missing" | "not-a-file" | "outside" | "unreadable";

export type Source =
	| { readonly file: string; readonly text: string }
	| { readonly file: string; readonly problem: FileProblem };

export type Drift = {
	readonly findings: readonly string[];
	readonly criteria: number;
	readonly controls: number;
};

const ID = /^[A-Za-z][A-Za-z0-9._-]*$/;
const TOP_KEYS = ["version", "specs", "tests", "links", "exemptions"];
const LINK_KEYS = ["criterion", "controls"];
const EXEMPTION_KEYS = ["control", "kind", "reason"];

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKey(
	record: Readonly<Record<string, unknown>>,
	allowed: readonly string[],
	where: string,
): string | undefined {
	const key = Object.keys(record).find((name) => !allowed.includes(name));
	return key === undefined
		? undefined
		: `${where} has the unknown key ${JSON.stringify(key)}`;
}

function isRepositoryPath(path: string): boolean {
	return (
		!path.startsWith("/") &&
		!/^[A-Za-z]:/.test(path) &&
		!path.includes("\\") &&
		!path.includes("\0") &&
		path
			.split("/")
			.every((part) => part !== "" && part !== "." && part !== "..")
	);
}

function pathList(
	field: string,
	value: unknown,
): Result<readonly string[], string> {
	if (!Array.isArray(value) || value.length === 0)
		return err(`${field} must be a nonempty array of paths`);
	const paths: string[] = [];
	for (const [at, path] of value.entries()) {
		if (typeof path !== "string")
			return err(`${field}[${at}] must be a string`);
		if (!isRepositoryPath(path))
			return err(
				`${field}[${at}] ${JSON.stringify(path)} is not a path inside the repository`,
			);
		if (paths.includes(path))
			return err(`${field} holds ${JSON.stringify(path)} twice`);
		paths.push(path);
	}
	return ok(paths);
}

function idField(where: string, value: unknown): Result<string, string> {
	if (typeof value !== "string") return err(`${where} must be a string`);
	return ID.test(value)
		? ok(value)
		: err(`${where} ${JSON.stringify(value)} is not a valid ID`);
}

function parseLink(value: unknown, at: number): Result<Link, string> {
	const where = `links[${at}]`;
	if (!isRecord(value)) return err(`${where} must be an object`);
	const extra = unknownKey(value, LINK_KEYS, where);
	if (extra !== undefined) return err(extra);
	const criterion = idField(`${where}.criterion`, value.criterion);
	if (!criterion.ok) return criterion;
	const listed = value.controls;
	if (!Array.isArray(listed))
		return err(`${where}.controls must be an array of IDs`);
	const controls: string[] = [];
	for (const [index, item] of listed.entries()) {
		const control = idField(`${where}.controls[${index}]`, item);
		if (!control.ok) return control;
		controls.push(control.value);
	}
	return ok({ criterion: criterion.value, controls });
}

function parseExemption(value: unknown, at: number): Result<Exemption, string> {
	const where = `exemptions[${at}]`;
	if (!isRecord(value)) return err(`${where} must be an object`);
	const extra = unknownKey(value, EXEMPTION_KEYS, where);
	if (extra !== undefined) return err(extra);
	const control = idField(`${where}.control`, value.control);
	if (!control.ok) return control;
	const kind = value.kind;
	if (kind !== "shared" && kind !== "regression")
		return err(`${where}.kind must be "shared" or "regression"`);
	const reason = value.reason;
	if (typeof reason !== "string")
		return err(`${where}.reason must be a string`);
	return ok({ control: control.value, kind, reason });
}

export function parseMatrix(text: string): Result<Matrix, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return err("the matrix is not valid JSON");
	}
	if (!isRecord(parsed)) return err("the matrix must be a JSON object");
	const extra = unknownKey(parsed, TOP_KEYS, "the matrix");
	if (extra !== undefined) return err(extra);
	if (parsed.version !== 1) return err("version must be 1");
	const specs = pathList("specs", parsed.specs);
	if (!specs.ok) return specs;
	const tests = pathList("tests", parsed.tests);
	if (!tests.ok) return tests;
	if (!Array.isArray(parsed.links)) return err("links must be an array");
	const links: Link[] = [];
	for (const [at, item] of parsed.links.entries()) {
		const link = parseLink(item, at);
		if (!link.ok) return link;
		links.push(link.value);
	}
	const rawExemptions = parsed.exemptions;
	if (rawExemptions !== undefined && !Array.isArray(rawExemptions))
		return err("exemptions must be an array");
	const exemptions: Exemption[] = [];
	for (const [at, item] of (rawExemptions ?? []).entries()) {
		const exemption = parseExemption(item, at);
		if (!exemption.ok) return exemption;
		exemptions.push(exemption.value);
	}
	return ok({
		specs: specs.value,
		tests: tests.value,
		links,
		exemptions,
	});
}

type Declared = ReadonlyMap<string, readonly string[]>;

type Scan = {
	readonly declared: Declared;
	readonly malformed: readonly string[];
	readonly problems: readonly string[];
};

const PROBLEM_TEXT: Record<FileProblem, string> = {
	missing: "the file is missing",
	"not-a-file": "the path is not a regular file",
	outside: "the path resolves outside the repository",
	unreadable: "the file cannot be read",
};

function scan(kind: "criterion" | "control", sources: readonly Source[]): Scan {
	const declared = new Map<string, string[]>();
	const malformed: string[] = [];
	const problems: string[] = [];
	const marker = new RegExp(`\\[${kind}:([^\\]\\n]*)\\]`, "g");
	for (const source of sources) {
		if ("problem" in source) {
			problems.push(`${source.file}: ${PROBLEM_TEXT[source.problem]}`);
			continue;
		}
		for (const match of source.text.matchAll(marker)) {
			const id = match[1] ?? "";
			if (!ID.test(id)) {
				malformed.push(`${source.file}: malformed marker ${match[0]}`);
				continue;
			}
			declared.set(id, [...(declared.get(id) ?? []), source.file]);
		}
	}
	return { declared, malformed, problems };
}

function duplicateLines(kind: string, declared: Declared): string[] {
	return [...declared].flatMap(([id, files]) =>
		files.length > 1
			? [`${kind} ${id} is declared more than once: ${files.join(", ")}`]
			: [],
	);
}

function linkLines(
	link: Link,
	seen: ReadonlySet<string>,
	criteria: Declared,
	controls: Declared,
): string[] {
	const where = `links row for criterion ${link.criterion}`;
	const lines = [
		...(seen.has(link.criterion)
			? [`criterion ${link.criterion} has more than one links row`]
			: []),
		...(criteria.has(link.criterion)
			? []
			: [`${where}: no listed spec declares this criterion`]),
		...(link.controls.length === 0 ? [`${where} lists no control`] : []),
	];
	for (const [at, control] of link.controls.entries()) {
		if (link.controls.indexOf(control) < at)
			lines.push(`${where} lists control ${control} twice`);
		else if (!controls.has(control))
			lines.push(
				`${where} lists control ${control}, which no listed test declares`,
			);
	}
	return lines;
}

function exemptionLines(
	matrix: Matrix,
	controls: Declared,
	linked: ReadonlySet<string>,
): string[] {
	const lines: string[] = [];
	const seen = new Set<string>();
	for (const { control, reason } of matrix.exemptions) {
		if (seen.has(control)) {
			lines.push(`control ${control} has more than one exemption`);
			continue;
		}
		seen.add(control);
		if (!controls.has(control))
			lines.push(
				`exemption for control ${control}: no listed test declares this control`,
			);
		else if (linked.has(control))
			lines.push(`control ${control} is both linked by a criterion and exempt`);
		else if (reason.trim() === "")
			lines.push(`exemption for control ${control} has a blank reason`);
	}
	return lines;
}

export function checkDrift(
	matrix: Matrix,
	specs: readonly Source[],
	tests: readonly Source[],
): Drift {
	const criteria = scan("criterion", specs);
	const controls = scan("control", tests);
	const linked = new Set(matrix.links.flatMap((link) => link.controls));
	const exempt = new Set(
		matrix.exemptions.flatMap((exemption) =>
			exemption.reason.trim() === "" ? [] : [exemption.control],
		),
	);
	const rows = new Set<string>();
	const rowLines = matrix.links.flatMap((link) => {
		const lines = linkLines(link, rows, criteria.declared, controls.declared);
		rows.add(link.criterion);
		return lines;
	});
	const findings = [
		...criteria.problems,
		...controls.problems,
		...criteria.malformed,
		...controls.malformed,
		...duplicateLines("criterion", criteria.declared),
		...duplicateLines("control", controls.declared),
		...(criteria.declared.size === 0
			? ["the listed spec files hold no [criterion:ID] marker"]
			: []),
		...(controls.declared.size === 0
			? ["the listed test files hold no [control:ID] marker"]
			: []),
		...[...criteria.declared].flatMap(([id, files]) =>
			matrix.links.some((link) => link.criterion === id)
				? []
				: [`criterion ${id} (${files[0] ?? ""}) has no links row`],
		),
		...rowLines,
		...[...controls.declared].flatMap(([id, files]) =>
			linked.has(id) || exempt.has(id)
				? []
				: [
						`control ${id} (${files[0] ?? ""}) is linked by no criterion and has no exemption`,
					],
		),
		...exemptionLines(matrix, controls.declared, linked),
	];
	return {
		findings,
		criteria: criteria.declared.size,
		controls: controls.declared.size,
	};
}

const count = (value: number, one: string, many: string): string =>
	`${value} ${value === 1 ? one : many}`;

export function driftSummary(matrix: Matrix, drift: Drift): string {
	const counts = [
		count(drift.criteria, "criterion", "criteria"),
		count(drift.controls, "control", "controls"),
		count(matrix.links.length, "link", "links"),
		count(matrix.exemptions.length, "exemption", "exemptions"),
		count(drift.findings.length, "finding", "findings"),
	];
	return `${drift.findings.length === 0 ? "ok" : "stop"}: ${counts.join(", ")}`;
}
