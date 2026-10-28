import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { repoRoot } from "../git.ts";
import { loadProfile, type PlanProfile } from "../profile.ts";
import { defaultSkillPathEnv, principleSkills } from "../skill-path.ts";
import { parseGlossary, planSlug } from "./check.ts";
import { hasPlanFrontmatter } from "./parse.ts";
import { readTrail, trailPath } from "./trail.ts";
import type { CheckEnv, Glossary } from "./types.ts";

export function todayIso(at = new Date()): string {
	return at.toISOString().slice(0, 10);
}

function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function listDir(path: string): string[] {
	try {
		return readdirSync(path).sort();
	} catch {
		return [];
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export function rootFor(path: string): string {
	const dir = isDirectory(path) ? path : dirname(resolve(path));
	return repoRoot(dir) ?? dir;
}

export function planProfileFor(root: string): PlanProfile {
	return loadProfile(root).plan;
}

const GLOSSARY_FILES = ["CONTEXT.md", "GLOSSARY.md"];
const GLOSSARY_MAPS = ["CONTEXT-MAP.md", "GLOSSARY-MAP.md"];

export function loadGlossary(
	root: string,
	configured: string | undefined,
): Glossary | undefined {
	const paths: string[] = [];
	const single = (configured ? [configured] : GLOSSARY_FILES)
		.map((name) => join(root, name))
		.find((path) => existsSync(path));
	if (single) paths.push(single);
	if (!configured) {
		for (const map of GLOSSARY_MAPS) {
			const mapPath = join(root, map);
			const text = readText(mapPath);
			if (text === undefined) continue;
			for (const match of text.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
				const linked = resolve(root, match[1] ?? "");
				if (existsSync(linked) && !paths.includes(linked)) paths.push(linked);
			}
		}
	}
	if (paths.length === 0) return undefined;
	const terms = new Set<string>();
	const avoid = new Map<string, string>();
	for (const path of paths) {
		const parsed = parseGlossary(readText(path) ?? "");
		for (const term of parsed.terms) terms.add(term.toLowerCase());
		for (const [word, term] of parsed.avoid) avoid.set(word, term);
	}
	return {
		paths: paths.map((path) => path.slice(root.length + 1)),
		terms,
		avoid,
	};
}

export interface EnvOptions {
	root: string;
	config: PlanProfile;
	slug: string;
	today: string;
	trail: boolean;
	principles?: ReadonlySet<string>;
}

export function checkEnv(options: EnvOptions): CheckEnv {
	return {
		root: options.root,
		today: options.today,
		adrDir: options.config.adr,
		glossary: loadGlossary(options.root, options.config.glossary),
		trail: options.trail
			? readTrail(trailPath(options.root, options.slug))
			: undefined,
		...(options.principles ? { principles: options.principles } : {}),
		exists: existsSync,
		listDir,
		readFile: readText,
	};
}

export function trailSlug(file: string, text: string | undefined): string {
	const head = text?.slice(0, 4096) ?? "";
	const programme = /^---\n[\s\S]*?^programme:\s*([^\s#]+)\s*$/m.exec(
		head,
	)?.[1];
	return (programme ?? planSlug(file)).toLowerCase();
}

export function envForFile(
	file: string,
	options: { today: string; trail: boolean; root?: string; text?: string },
): CheckEnv {
	const root = options.root ?? rootFor(file);
	const principles = principleSkills(
		defaultSkillPathEnv(process.env, process.argv[1], root),
	);
	return checkEnv({
		root,
		config: planProfileFor(root),
		slug: trailSlug(file, options.text ?? readText(file)),
		today: options.today,
		trail: options.trail,
		...(principles ? { principles } : {}),
	});
}

export function listPlanFiles(planDir: string): string[] {
	const found: string[] = [];
	const visit = (dir: string, depth: number): void => {
		for (const name of listDir(dir)) {
			const path = join(dir, name);
			if (isDirectory(path)) {
				if (depth < 2) visit(path, depth + 1);
			} else if (name.endsWith(".md")) {
				const head = readText(path)?.slice(0, 4096) ?? "";
				if (hasPlanFrontmatter(head)) found.push(path);
			}
		}
	};
	visit(planDir, 0);
	return found;
}
