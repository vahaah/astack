import {
	FrontmatterError,
	frontmatterValues,
	parseDocument,
} from "../lib/frontmatter.ts";

export type Values = Readonly<Record<string, unknown>>;

export type Split = { readonly values: Values; readonly body: string };

export function splitFrontmatter(text: string, path: string): Split {
	if (!text.startsWith("---\n")) return { values: {}, body: text };
	const doc = parseDocument(text, path);
	return { values: frontmatterValues(doc, path), body: doc.body };
}

export function tryFrontmatter(text: string, path: string): Split | string {
	try {
		return splitFrontmatter(text, path);
	} catch (error) {
		if (error instanceof FrontmatterError) return error.message;
		throw error;
	}
}

export type FieldValue =
	| string
	| boolean
	| readonly string[]
	| Readonly<Record<string, string>>;

function scalar(value: string | boolean): string {
	return typeof value === "boolean" ? String(value) : JSON.stringify(value);
}

function isStringList(value: FieldValue): value is readonly string[] {
	return Array.isArray(value);
}

function fieldLines(key: string, value: FieldValue): string[] {
	if (typeof value === "string" || typeof value === "boolean")
		return [`${key}: ${scalar(value)}`];
	if (isStringList(value))
		return [`${key}:`, ...value.map((item) => `  - ${scalar(item)}`)];
	return [
		`${key}:`,
		...Object.entries(value).map(
			([name, item]) => `  ${name}: ${scalar(item)}`,
		),
	];
}

export function renderFrontmatter(
	fields: readonly (readonly [string, FieldValue | undefined])[],
	body: string,
): string {
	const lines = fields.flatMap(([key, value]) =>
		value === undefined ? [] : fieldLines(key, value),
	);
	return ["---", ...lines, "---", body].join("\n");
}

export function stringValue(values: Values, key: string): string | undefined {
	const value = values[key];
	return typeof value === "string" ? value : undefined;
}

export function stringList(values: Values, key: string): string[] {
	const value = values[key];
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}
