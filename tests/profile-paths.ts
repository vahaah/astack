import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import {
	type Companion,
	companionFrom,
	companionPaths,
	PROFILE_SCAN_ENV,
} from "../scripts/lib/companion.ts";
import { repoRoot, reviewProfileName } from "../scripts/lib/projects.ts";

const example = companionFrom(undefined, {});
const scanValue = process.env[PROFILE_SCAN_ENV];
const ownerCompanion =
	scanValue === undefined ||
	scanValue === "" ||
	companionFrom(scanValue, {}).root === example.root
		? undefined
		: companionFrom(scanValue, {});
const scanned: readonly Companion[] =
	ownerCompanion === undefined ? [example] : [example, ownerCompanion];

export const exampleProjects = companionPaths(example).projects;

export const scanProjectDirs = scanned.map(
	(companion) => companionPaths(companion).projects,
);

const profilesUnder = (projects: string): string[] =>
	readdirSync(projects, { recursive: true, encoding: "utf8" })
		.filter((path) => basename(path) === reviewProfileName)
		.map((path) => relative(repoRoot, join(projects, path)))
		.sort();

export const exampleProfilePaths: readonly string[] =
	profilesUnder(exampleProjects);

export const profilePaths: readonly string[] =
	scanProjectDirs.flatMap(profilesUnder);

export function projectOf(path: string): string {
	const absolute = resolve(repoRoot, path);
	const projects = scanProjectDirs.find((dir) =>
		absolute.startsWith(`${dir}${sep}`),
	);
	return projects === undefined
		? ""
		: (relative(projects, absolute).split(sep)[0] ?? "");
}

export function profileOf(name: string): string {
	const path = scanProjectDirs
		.map((dir) => join(dir, name, reviewProfileName))
		.find((candidate) => existsSync(candidate));
	if (path === undefined)
		throw new Error(`no scanned companion holds a profile of ${name}`);
	return path;
}

const ownerTests =
	ownerCompanion === undefined ? "" : companionPaths(ownerCompanion).tests;

export const companionTestTexts: readonly string[] =
	ownerTests !== "" && existsSync(ownerTests)
		? [
				...new Bun.Glob("**/*.test.ts").scanSync({
					cwd: ownerTests,
					absolute: true,
				}),
			].map((path) => readFileSync(path, "utf8"))
		: [];

export type SharedService = {
	readonly profile: string;
	readonly port: string;
	readonly why: string;
};

export type StackRow = {
	readonly profile: string;
	readonly stack: string;
	readonly reset: string | null;
	readonly oneJob: readonly string[];
	readonly watch: readonly string[];
	readonly ports: readonly string[];
	readonly why: string;
};

export type TiedReset = {
	readonly profile: string;
	readonly gate: string;
	readonly check: string;
	readonly proof: string;
};

export type SharedTarget = {
	readonly profile: string;
	readonly gate: string;
	readonly target: string;
	readonly decision: string;
};

export type DescribesOnly = {
	readonly path: string;
	readonly line: string;
	readonly reason: string;
};

export type ScanRows = {
	readonly sharedServices: readonly SharedService[];
	readonly stacks: readonly StackRow[];
	readonly tiedResets: readonly TiedReset[];
	readonly sharedTargets: readonly SharedTarget[];
	readonly describesOnly: readonly DescribesOnly[];
};

type Fields = Readonly<Record<string, unknown>>;

const isFields = (value: unknown): value is Fields =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isStrings = (value: unknown): value is readonly string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

function rowsOf<Row>(
	data: Fields,
	table: keyof ScanRows,
	file: string,
	parse: (row: Fields) => Row | undefined,
): readonly Row[] {
	const rows = data[table] ?? [];
	if (!Array.isArray(rows)) throw new Error(`${file}: ${table} is not a list`);
	return rows.map((row, index) => {
		const parsed = isFields(row) ? parse(row) : undefined;
		if (parsed === undefined)
			throw new Error(`${file}: ${table}[${index}] does not fit its table`);
		return parsed;
	});
}

function text(row: Fields, key: string): string | undefined {
	const value = row[key];
	return typeof value === "string" ? value : undefined;
}

function scanRowsOf(companion: Companion): ScanRows {
	const file = companionPaths(companion).profileScan;
	const data: unknown = existsSync(file)
		? JSON.parse(readFileSync(file, "utf8"))
		: {};
	if (!isFields(data)) throw new Error(`${file} is not a JSON object`);
	return {
		sharedServices: rowsOf(data, "sharedServices", file, (row) => {
			const [profile, port, why] = ["profile", "port", "why"].map((key) =>
				text(row, key),
			);
			return profile === undefined || port === undefined || why === undefined
				? undefined
				: { profile, port, why };
		}),
		stacks: rowsOf(data, "stacks", file, (row) => {
			const [profile, stack, why] = ["profile", "stack", "why"].map((key) =>
				text(row, key),
			);
			const { reset, oneJob, watch, ports } = row;
			return profile === undefined ||
				stack === undefined ||
				why === undefined ||
				(reset !== null && typeof reset !== "string") ||
				!isStrings(oneJob) ||
				!isStrings(watch) ||
				!isStrings(ports)
				? undefined
				: { profile, stack, reset, oneJob, watch, ports, why };
		}),
		tiedResets: rowsOf(data, "tiedResets", file, (row) => {
			const [profile, gate, check, proof] = [
				"profile",
				"gate",
				"check",
				"proof",
			].map((key) => text(row, key));
			return profile === undefined ||
				gate === undefined ||
				check === undefined ||
				proof === undefined
				? undefined
				: { profile, gate, check, proof };
		}),
		sharedTargets: rowsOf(data, "sharedTargets", file, (row) => {
			const [profile, gate, target, decision] = [
				"profile",
				"gate",
				"target",
				"decision",
			].map((key) => text(row, key));
			return profile === undefined ||
				gate === undefined ||
				target === undefined ||
				decision === undefined
				? undefined
				: { profile, gate, target, decision };
		}),
		describesOnly: rowsOf(data, "describesOnly", file, (row) => {
			const [path, line, reason] = ["path", "line", "reason"].map((key) =>
				text(row, key),
			);
			return path === undefined || line === undefined || reason === undefined
				? undefined
				: {
						path: relative(repoRoot, join(companion.root, path)),
						line,
						reason,
					};
		}),
	};
}

const rows = scanned.map(scanRowsOf);

export const scanRows: ScanRows = {
	sharedServices: rows.flatMap((each) => each.sharedServices),
	stacks: rows.flatMap((each) => each.stacks),
	tiedResets: rows.flatMap((each) => each.tiedResets),
	sharedTargets: rows.flatMap((each) => each.sharedTargets),
	describesOnly: rows.flatMap((each) => each.describesOnly),
};
