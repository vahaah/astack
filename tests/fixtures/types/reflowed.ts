import { parseInvite } from "./invite.ts";

export function readInvite(text: string) {
	const raw = JSON.parse(
		text,
	) as Record<
		string,
		unknown
	>;
	return parseInvite(raw);
}

export function firstRow(rows: readonly { id: string }[]) {
	return rows[0]!
		.id;
}

export function legacy(
	value: any,
) {
	return value;
}

export function widen(input: string) {
	return (
		input as unknown as number
	);
}
