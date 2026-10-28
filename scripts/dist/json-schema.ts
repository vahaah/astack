type Schema = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeOf(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (typeof value === "number")
		return Number.isInteger(value) ? "integer" : "number";
	return typeof value;
}

function typeMatches(expected: unknown, value: unknown): boolean {
	const actual = typeOf(value);
	const types = Array.isArray(expected) ? expected : [expected];
	return types.some(
		(type) => type === actual || (type === "number" && actual === "integer"),
	);
}

function formatMatches(format: unknown, value: string): boolean {
	switch (format) {
		case "uri":
			try {
				new URL(value);
				return true;
			} catch {
				return false;
			}
		case "email":
			return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
		default:
			return true;
	}
}

function resolveRef(root: Schema, ref: string): Schema | undefined {
	if (!ref.startsWith("#/")) return undefined;
	let current: unknown = root;
	for (const part of ref.slice(2).split("/"))
		current = isRecord(current) ? current[part] : undefined;
	return isRecord(current) ? current : undefined;
}

function check(
	root: Schema,
	schema: Schema,
	value: unknown,
	path: string,
): string[] {
	if (typeof schema.$ref === "string") {
		const target = resolveRef(root, schema.$ref);
		return target === undefined
			? [`${path}: unresolved $ref ${schema.$ref}`]
			: check(root, target, value, path);
	}
	const errors: string[] = [];
	if (schema.type !== undefined && !typeMatches(schema.type, value))
		return [`${path}: expected ${String(schema.type)}, got ${typeOf(value)}`];
	if ("const" in schema && schema.const !== value)
		errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
	if (Array.isArray(schema.enum) && !schema.enum.includes(value))
		errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
	if (Array.isArray(schema.oneOf)) {
		const passing = schema.oneOf.filter(
			(option) =>
				isRecord(option) && check(root, option, value, path).length === 0,
		).length;
		if (passing !== 1)
			errors.push(`${path}: matches ${passing} oneOf options, needs 1`);
	}
	if (typeof value === "string") {
		if (typeof schema.minLength === "number" && value.length < schema.minLength)
			errors.push(`${path}: shorter than ${schema.minLength}`);
		if (
			typeof schema.pattern === "string" &&
			!new RegExp(schema.pattern).test(value)
		)
			errors.push(`${path}: does not match ${schema.pattern}`);
		if (!formatMatches(schema.format, value))
			errors.push(`${path}: not a valid ${String(schema.format)}`);
	}
	if (Array.isArray(value) && isRecord(schema.items)) {
		const items = schema.items;
		value.forEach((item, index) => {
			errors.push(...check(root, items, item, `${path}/${index}`));
		});
	}
	if (isRecord(value)) {
		const properties = isRecord(schema.properties) ? schema.properties : {};
		for (const key of Array.isArray(schema.required) ? schema.required : [])
			if (typeof key === "string" && !(key in value))
				errors.push(`${path}: missing ${key}`);
		if (
			typeof schema.minProperties === "number" &&
			Object.keys(value).length < schema.minProperties
		)
			errors.push(`${path}: needs ${schema.minProperties} properties`);
		for (const [key, item] of Object.entries(value)) {
			const property = properties[key];
			if (isRecord(property)) {
				errors.push(...check(root, property, item, `${path}/${key}`));
			} else if (schema.additionalProperties === false) {
				errors.push(`${path}: unknown property ${key}`);
			} else if (isRecord(schema.additionalProperties)) {
				errors.push(
					...check(root, schema.additionalProperties, item, `${path}/${key}`),
				);
			}
		}
	}
	return errors;
}

export function validateJson(schema: unknown, value: unknown): string[] {
	if (!isRecord(schema)) return ["the schema is not an object"];
	return check(schema, schema, value, "");
}
