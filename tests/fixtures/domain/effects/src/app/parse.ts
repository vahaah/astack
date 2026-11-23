import { load } from "./port.ts";

export function parse(path: string): number {
	return load(path).length;
}
