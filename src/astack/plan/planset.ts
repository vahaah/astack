import { dirname, join, relative, resolve } from "node:path";
import { err, ok, type Result } from "../result.ts";
import { tierOf } from "./check.ts";
import { frontmatterValue, parsePlan } from "./parse.ts";
import type { Plan } from "./types.ts";

export type Brief = { readonly plan: Plan; readonly path: string };

export type PlanSet = {
	readonly root: Plan;
	readonly path: string;
	readonly slug: string;
	readonly briefs: ReadonlyMap<string, Brief>;
};

export type ReadText = (path: string) => string | undefined;

export function slugOf(plan: Plan, path: string): string {
	const named = frontmatterValue(plan, "plan");
	if (named) return named;
	const file = path.split("/").at(-1)?.replace(/\.md$/, "") ?? path;
	return file === "index" ? (path.split("/").at(-2) ?? file) : file;
}

export function planSetFromText(
	path: string,
	text: string,
	readBrief: (relativePath: string) => string | undefined,
): PlanSet {
	const root = parsePlan(path, text);
	const briefs = new Map<string, Brief>();
	if (tierOf(root) === "programme")
		for (const milestone of root.milestones)
			for (const block of milestone.blocks) {
				const file = block.brief?.replace(/`/g, "");
				if (!file || file === "stub" || file === "done") continue;
				const briefPath = join(dirname(path), file);
				const briefText = readBrief(briefPath);
				if (briefText !== undefined)
					briefs.set(block.handle, {
						plan: parsePlan(briefPath, briefText),
						path: briefPath,
					});
			}
	return { root, path, slug: slugOf(root, path), briefs };
}

export function loadPlanSet(
	root: string,
	file: string,
	read: ReadText,
): Result<PlanSet, string> {
	const absolute = resolve(root, file);
	const path = relative(root, absolute);
	const text = read(absolute);
	if (text === undefined) return err(`cannot read ${file}`);
	const set = planSetFromText(path, text, (briefPath) =>
		read(resolve(root, briefPath)),
	);
	const tier = tierOf(set.root);
	if (tier === "brief") {
		const index = join(dirname(path), "index.md");
		const indexText = read(resolve(root, index));
		if (indexText === undefined)
			return err(`${file} is a brief, and ${index} is missing`);
		return ok(
			planSetFromText(index, indexText, (briefPath) =>
				read(resolve(root, briefPath)),
			),
		);
	}
	return ok(set);
}
