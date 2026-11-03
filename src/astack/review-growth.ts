import { err, ok, type Result } from "./result.ts";

export type Totals = {
	readonly files: number;
	readonly added: number;
	readonly removed: number;
	readonly binary: number;
};

export type Options = {
	readonly base: string;
	readonly firstReviewed: string;
	readonly head: string;
	readonly maxLines: number;
	readonly maxPercent: number;
};

export const DEFAULT_MAX_LINES = 200;
export const DEFAULT_MAX_PERCENT = 50;

const VALUE_FLAGS = [
	"--base",
	"--first-reviewed",
	"--head",
	"--max-growth-lines",
	"--max-growth-percent",
] as const;

type ValueFlag = (typeof VALUE_FLAGS)[number];

const isValueFlag = (arg: string): arg is ValueFlag =>
	VALUE_FLAGS.some((flag) => flag === arg);

const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function commitId(flag: string, value: string): Result<string, string> {
	return COMMIT_ID.test(value)
		? ok(value)
		: err(
				`${flag} needs a full commit SHA of 40 or 64 lowercase hex digits, not ${value}`,
			);
}

function wholeNumber(flag: string, value: string): Result<number, string> {
	const number = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	return Number.isSafeInteger(number)
		? ok(number)
		: err(`${flag} needs a whole number of 0 or more, not ${value}`);
}

function plainNumber(flag: string, value: string): Result<number, string> {
	const number = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
	return Number.isFinite(number)
		? ok(number)
		: err(`${flag} needs a number of 0 or more, not ${value}`);
}

function flagValues(
	args: readonly string[],
): Result<ReadonlyMap<ValueFlag, string>, string> {
	const values = new Map<ValueFlag, string>();
	for (let at = 0; at < args.length; at += 2) {
		const arg = args[at] ?? "";
		if (!isValueFlag(arg)) return err(`unknown argument ${arg}`);
		if (values.has(arg)) return err(`${arg} is given twice`);
		const value = args[at + 1];
		if (value === undefined || value === "" || value.startsWith("--"))
			return err(`${arg} needs a value`);
		values.set(arg, value);
	}
	return ok(values);
}

export function parseOptions(args: readonly string[]): Result<Options, string> {
	const found = flagValues(args);
	if (!found.ok) return found;
	const values = found.value;
	const base = values.get("--base");
	const first = values.get("--first-reviewed");
	if (base === undefined || first === undefined)
		return err(
			"give --base <full commit SHA> and --first-reviewed <full commit SHA>",
		);
	const baseId = commitId("--base", base);
	if (!baseId.ok) return baseId;
	const firstId = commitId("--first-reviewed", first);
	if (!firstId.ok) return firstId;
	const lines = values.has("--max-growth-lines")
		? wholeNumber("--max-growth-lines", values.get("--max-growth-lines") ?? "")
		: ok(DEFAULT_MAX_LINES);
	if (!lines.ok) return lines;
	const percent = values.has("--max-growth-percent")
		? plainNumber(
				"--max-growth-percent",
				values.get("--max-growth-percent") ?? "",
			)
		: ok(DEFAULT_MAX_PERCENT);
	if (!percent.ok) return percent;
	return ok({
		base: baseId.value,
		firstReviewed: firstId.value,
		head: values.get("--head") ?? "HEAD",
		maxLines: lines.value,
		maxPercent: percent.value,
	});
}

const NUMSTAT_RECORD = /^(\d+|-)\t(\d+|-)\t[\s\S]+$/;

export function parseNumstat(raw: string): Result<Totals, string> {
	const records = raw.split("\0");
	if (records.pop() !== "")
		return err("git printed diff statistics that do not end with NUL");
	let totals: Totals = { files: 0, added: 0, removed: 0, binary: 0 };
	for (const record of records) {
		const match = NUMSTAT_RECORD.exec(record);
		const added = match?.[1];
		const removed = match?.[2];
		if (added === undefined || removed === undefined)
			return err(
				"git printed a line of diff statistics that astack cannot read",
			);
		if (added === "-" && removed === "-")
			totals = {
				...totals,
				files: totals.files + 1,
				binary: totals.binary + 1,
			};
		else if (added === "-" || removed === "-")
			return err(
				"git printed a line of diff statistics that astack cannot read",
			);
		else
			totals = {
				...totals,
				files: totals.files + 1,
				added: totals.added + Number(added),
				removed: totals.removed + Number(removed),
			};
	}
	return ok(totals);
}

const churn = (totals: Totals): number => totals.added + totals.removed;

const plural = (count: number, word: string): string =>
	`${count} ${count === 1 ? word : `${word}s`}`;

const shown = (value: number): string =>
	Number.isInteger(value)
		? String(value)
		: String(Math.round(value * 100) / 100);

const signed = (value: number): string =>
	value > 0 ? `+${value}` : `${value}`;

const describe = (totals: Totals): string =>
	`${plural(totals.files, "file")}, +${totals.added} -${totals.removed}, ${plural(totals.binary, "binary file")}`;

export type Shas = {
	readonly base: string;
	readonly firstReviewed: string;
	readonly head: string;
};

export function growthReport(
	shas: Shas,
	baseline: Totals,
	current: Totals,
	limits: Pick<Options, "maxLines" | "maxPercent">,
): readonly string[] {
	const growth = churn(current) - churn(baseline);
	const threshold = Math.max(
		limits.maxLines,
		(churn(baseline) * limits.maxPercent) / 100,
	);
	const moreBinary = current.binary - baseline.binary;
	const warnings = [
		...(growth > threshold
			? [
					`warn: net growth ${signed(growth)} lines exceeds the threshold of ${shown(threshold)} lines`,
				]
			: []),
		...(moreBinary > 0
			? [
					`warn: the current diff holds ${plural(moreBinary, "binary file")} more than the baseline`,
				]
			: []),
	];
	return [
		`base: ${shas.base}`,
		`first-reviewed: ${shas.firstReviewed}`,
		`head: ${shas.head}`,
		`baseline: ${describe(baseline)}`,
		`current: ${describe(current)}`,
		`net growth: ${signed(growth)} lines`,
		`threshold: ${shown(threshold)} lines (the larger of ${limits.maxLines} lines and ${shown(limits.maxPercent)}% of the baseline churn of ${churn(baseline)} lines)`,
		...(baseline.binary > 0 || current.binary > 0
			? [
					`note: the line metric is incomplete, because git gives no line counts for binary files (baseline ${baseline.binary}, current ${current.binary})`,
				]
			: []),
		...(warnings.length > 0
			? warnings
			: [
					`ok: net growth ${signed(growth)} lines does not exceed the threshold`,
				]),
	];
}
