import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	companionFrom,
	exampleCompanionRoot,
} from "../../../scripts/lib/companion.ts";
import { repoRoot } from "../../../scripts/lib/projects.ts";

test("a test reads the example companion, and a deny add with no flag refuses it", () => {
	const add = spawnSync(
		process.execPath,
		["scripts/deny.ts", "add", "probetoken"],
		{ cwd: repoRoot, encoding: "utf8" },
	);
	expect({
		companion: companionFrom(undefined, process.env),
		add: add.status,
	}).toEqual({
		companion: { source: "example", root: exampleCompanionRoot },
		add: 1,
	});
});
