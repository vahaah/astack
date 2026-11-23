import { pong } from "./pong.ts";

export function ping(n: number): number {
	return n > 0 ? pong(n - 1) : Date.now();
}
