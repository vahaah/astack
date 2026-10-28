import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHashList, sha256 } from "../../scripts/lib/neutrality.ts";
import {
	loadProject,
	projectNames,
	repoRoot,
} from "../../scripts/lib/projects.ts";
import { renderReviewCopies } from "../../scripts/lib/render.ts";

const example = join(repoRoot, "examples/companion");
const projects = join(example, "projects");

const backwards = (text: string): string => [...text].reverse().join("");
const listedToken = backwards("xarfolliuq");
const listedWords = [backwards("xenrav"), backwards("nirtlod")] as const;
const joinedNames = [listedToken, listedWords.join("")];

const holdsListedName = (text: string): boolean => {
	const squeezed = text.toLowerCase().replace(/[^a-z0-9]/g, "");
	return joinedNames.some((name) => squeezed.includes(name));
};

describe("the example companion", () => {
	test("holds the one synthetic project acme, and it loads with no error", async () => {
		expect(projectNames(projects)).toEqual(["acme"]);
		const acme = await loadProject("acme", projects);
		expect({
			tracker: acme.tracker,
			branchTemplate: acme.branchTemplate,
		}).toEqual({
			tracker: {
				kind: "linear",
				team: "ABC",
				requirePartOf: true,
				categoryLabels: { bug: "Bug", enhancement: "Feature" },
			},
			branchTemplate: "dev/agent-tooling-{date}",
		});
	});

	test("renders the review copies of acme with no problem", async () => {
		const acme = await loadProject("acme", projects);
		expect(renderReviewCopies(acme, join(projects, "acme")).problems).toEqual(
			[],
		);
	});

	test("denies exactly one synthetic token and one synthetic two-word name", () => {
		expect(
			parseHashList(readFileSync(join(example, "deny/names.sha256"), "utf8")),
		).toEqual({ hashes: new Set(joinedNames.map(sha256)), errors: [] });
	});

	test("the name check finds a listed name in another case and spelling, but not one word of it", () => {
		expect([
			holdsListedName(`${listedToken.toUpperCase()}.md`),
			holdsListedName(`${listedWords[0]}-${listedWords[1]}`),
			holdsListedName(`${listedWords[1]}Api`),
		]).toEqual([true, true, false]);
	});

	test("no tracked path or file holds a listed name in any spelling", () => {
		const tracked = spawnSync("git", ["ls-files", "-z"], {
			cwd: repoRoot,
			encoding: "utf8",
		})
			.stdout.split("\0")
			.filter((path) => path !== "");
		expect(tracked).toContain("AGENTS.md");
		expect(
			tracked.filter(
				(path) =>
					holdsListedName(path) ||
					holdsListedName(readFileSync(join(repoRoot, path), "utf8")),
			),
		).toEqual([]);
	});
});
