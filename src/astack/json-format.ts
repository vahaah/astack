export type Json =
	| string
	| number
	| boolean
	| null
	| readonly Json[]
	| { readonly [key: string]: Json };

const WIDTH = 80;

type JsonArray = readonly Json[];
type JsonObject = { readonly [key: string]: Json };

type Layout = { readonly indent: string; readonly width: number };

function isScalar(value: Json): value is string | number | boolean | null {
	return value === null || typeof value !== "object";
}

function isArray(value: Json): value is JsonArray {
	return Array.isArray(value);
}

function print(
	value: Json,
	layout: Layout,
	depth: number,
	prefix: number,
	tail: number,
): string {
	if (isScalar(value)) return JSON.stringify(value);
	return isArray(value)
		? printArray(value, layout, depth, prefix, tail)
		: printObject(value, layout, depth);
}

function printArray(
	value: JsonArray,
	layout: Layout,
	depth: number,
	prefix: number,
	tail: number,
): string {
	const pad = layout.indent.repeat(depth + 1);
	const close = layout.indent.repeat(depth);
	if (value.length === 0) return "[]";
	if (value.every(isScalar)) {
		const inline = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
		if (prefix + inline.length + tail <= layout.width) return inline;
	}
	const items = value.map(
		(item, index) =>
			`${pad}${print(item, layout, depth + 1, pad.length, index < value.length - 1 ? 1 : 0)}`,
	);
	return `[\n${items.join(",\n")}\n${close}]`;
}

function printObject(value: JsonObject, layout: Layout, depth: number): string {
	const pad = layout.indent.repeat(depth + 1);
	const close = layout.indent.repeat(depth);
	const entries = Object.entries(value);
	if (entries.length === 0) return "{}";
	const lines = entries.map(([key, item], index) => {
		const head = `${pad}${JSON.stringify(key)}: `;
		const comma = index < entries.length - 1 ? 1 : 0;
		return `${head}${print(item, layout, depth + 1, head.length, comma)}`;
	});
	return `{\n${lines.join(",\n")}\n${close}}`;
}

export function formatJson(value: Json, indent = "  "): string {
	return `${print(value, { indent, width: WIDTH }, 0, 0, 0)}\n`;
}
