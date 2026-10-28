import { parseInvite } from "./invite.ts";

export function readInvite(body: string) {
	const parsed = JSON.parse(body) as Record<string, unknown>;
	return parseInvite(parsed);
}

export function firstRow(records: readonly { id: string }[]) {
	return records[0]!.id;
}

export function legacy(input: any) {
	return input;
}

export function widen(text: string) {
	return text as unknown as number;
}
