import type { BodyReader } from "../gh.ts";
import type { FilePorts } from "../ports.ts";
import { type ShellStep, stagedText } from "../shell.ts";

export function stagedReader(
	steps: readonly ShellStep[],
	at: number,
	files: FilePorts,
): BodyReader {
	return (path) => stagedText(steps, at, path, files.readText(path));
}
