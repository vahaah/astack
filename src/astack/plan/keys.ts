export type KeyResult = {
	readonly text: string;
	readonly applied: readonly string[];
};

function escapePattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function setFrontmatter(
	text: string,
	key: string,
	value: string,
): string {
	const close = text.indexOf("\n---", 3);
	if (!text.startsWith("---") || close < 0) return text;
	const head = text.slice(0, close);
	const pattern = new RegExp(`^${escapePattern(key)}:.*$`, "m");
	const next = pattern.test(head)
		? head.replace(pattern, `${key}: ${value}`)
		: `${head}\n${key}: ${value}`;
	return `${next}${text.slice(close)}`;
}

function setUnitTicket(lines: string[], handle: string, key: string): boolean {
	const start = lines.findIndex((line) =>
		new RegExp(`^###\\s+${escapePattern(handle)}(\\s|$)`).test(line),
	);
	if (start < 0) return false;
	let end = lines.findIndex((line, i) => i > start && /^#{2,3}\s/.test(line));
	if (end < 0) end = lines.length;
	const ticket = lines.findIndex(
		(line, i) => i > start && i < end && /^Ticket\.(\s|$)/.test(line),
	);
	if (ticket >= 0) {
		lines[ticket] = `Ticket. ${key}`;
		return true;
	}
	const state = lines.findIndex(
		(line, i) => i > start && i < end && /^State\./.test(line),
	);
	lines.splice(state >= 0 ? state + 1 : start + 2, 0, `Ticket. ${key}`);
	return true;
}

function setLineTicket(
	lines: string[],
	pattern: RegExp,
	key: string,
	from = 0,
): boolean {
	const at = lines.findIndex((line, i) => i >= from && pattern.test(line));
	if (at < 0) return false;
	const line = lines[at] ?? "";
	lines[at] = /\sTicket\.\s+\S+/.test(line)
		? line.replace(/\sTicket\.\s+[^\s.]+\.?/, ` Ticket. ${key}.`)
		: `${line.replace(/\s+$/, "")}${/\.$/.test(line.trim()) ? "" : "."} Ticket. ${key}.`;
	return true;
}

export function yamlScalar(value: string): string {
	return /^[#&*!|>'"%@`{[\]},?:-]|:\s|\s#/.test(value)
		? JSON.stringify(value)
		: value;
}

export function writeKeys(
	text: string,
	slug: string,
	keys: ReadonlyMap<string, string>,
	options: { readonly root: boolean } = { root: true },
): KeyResult {
	let next = text;
	const applied: string[] = [];
	const lines = (): string[] => next.split("\n");
	for (const [unit, key] of keys) {
		if (unit === slug) {
			if (!options.root) continue;
			const current = /^tracker:\s*(.*)$/m.exec(next)?.[1]?.trim();
			if (!current || current === "none") {
				next = setFrontmatter(next, "tracker", yamlScalar(key));
				applied.push(unit);
			}
			continue;
		}
		if (!unit.startsWith(`${slug}/`)) continue;
		const handle = unit.slice(slug.length + 1);
		const body = lines();
		const done = /^Q\d+$/.test(handle)
			? setLineTicket(
					body,
					new RegExp(`^${handle.slice(1)}\\.\\s`),
					key,
					Math.max(
						0,
						body.findIndex((line) => /^## Unresolved questions/.test(line)),
					),
				)
			: /^B\d{2,}[a-z]?$/.test(handle)
				? setLineTicket(
						body,
						new RegExp(`^\\s*[-*]\\s+${escapePattern(handle)}\\s`),
						key,
					)
				: setUnitTicket(body, handle, key);
		if (done) {
			next = body.join("\n");
			applied.push(unit);
		}
	}
	return { text: next, applied };
}

export function parseKeys(
	raw: string,
): ReadonlyMap<string, string> | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
			return undefined;
		return new Map(
			Object.entries(parsed).flatMap(([unit, key]) =>
				typeof key === "string" && key !== "" ? [[unit, key] as const] : [],
			),
		);
	} catch {
		return undefined;
	}
}
