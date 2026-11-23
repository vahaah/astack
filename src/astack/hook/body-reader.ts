import type { BodyReader } from "../gh.ts";
import { readOptional } from "../paths.ts";
import { type ShellStep, stagedText } from "../shell.ts";

export function stagedReader(
	steps: readonly ShellStep[],
	at: number,
): BodyReader {
	return (path) => stagedText(steps, at, path, readOptional(path));
}
