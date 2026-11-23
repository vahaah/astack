import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseCard } from "../src/astack/domain/notation.ts";
import { globMatches } from "../src/astack/glob.ts";

const ROOT = resolve(import.meta.dir, "..");
const TRACKED = spawnSync("git", ["ls-files", "-z"], {
	cwd: ROOT,
	encoding: "utf8",
})
	.stdout.split("\0")
	.filter(Boolean);
const SOURCES = TRACKED.filter((path) => path.startsWith("src/"));

function card() {
	const parsed = parseCard([
		{
			path: "CONTEXT.md",
			text: readFileSync(join(ROOT, "CONTEXT.md"), "utf8"),
		},
	]);
	if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
	if (parsed.value.kind === "none") throw new Error("CONTEXT.md has no card");
	return parsed.value;
}

describe("the contexts card of astack", () => {
	test("[control:domain-card] the card holds 7 contexts, each tracked src file falls under one glob, and each glob matches a file", () => {
		const { contexts, pures } = card();
		const globs = contexts.flatMap((context) =>
			context.globs.map((glob) => ({ context: context.name, glob })),
		);
		expect({
			contexts: contexts.map((context) => context.name),
			unowned: SOURCES.filter(
				(path) =>
					globs.filter(({ glob }) => globMatches(glob, path)).length !== 1,
			).map(
				(path) =>
					`${path}: ${
						globs
							.filter(({ glob }) => globMatches(glob, path))
							.map(({ context, glob }) => `${context} ${glob}`)
							.join(", ") || "no glob"
					}`,
			),
			idle: [
				...globs.map(({ glob }) => glob),
				...pures.map((pure) => pure.glob),
			].filter((glob) => !TRACKED.some((path) => globMatches(glob, path))),
		}).toEqual({
			contexts: [
				"Kernel",
				"Proof",
				"Guards",
				"Writing",
				"Plan",
				"Delivery",
				"Install",
			],
			unowned: [],
			idle: [],
		});
	});
});
