import type { Plan } from "./plan.ts";

const KEYS = ["a", "b"] as const;
const word = "throw";

export function read(value: unknown): Plan {
	if (value === undefined) throw new Error(`no ${word} ${KEYS[0]}`);
	return value as Plan;
}
