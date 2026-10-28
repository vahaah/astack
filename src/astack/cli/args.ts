export function valueAfter(
	args: readonly string[],
	flag: string,
): string | undefined | null {
	const at = args.indexOf(flag);
	if (at < 0) return undefined;
	const value = args[at + 1];
	return value && !value.startsWith("--") ? value : null;
}

export function positional(
	args: readonly string[],
	valueFlags: readonly string[],
): string[] {
	const found: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		if (valueFlags.includes(arg)) i++;
		else if (!arg.startsWith("--")) found.push(arg);
	}
	return found;
}

export function valuesAfter(
	args: readonly string[],
	flag: string,
): string[] | undefined {
	const values: string[] = [];
	for (let at = args.indexOf(flag); at >= 0; at = args.indexOf(flag, at + 1)) {
		const value = args[at + 1];
		if (value === undefined || value.startsWith("--")) return undefined;
		values.push(value);
	}
	return values;
}
