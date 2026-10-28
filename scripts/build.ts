import { dirname, relative, resolve } from "node:path";
import { NODE_FLOOR } from "../src/astack/cli/commands/doctor.ts";
import { parseMarketplace } from "../src/astack/marketplace.ts";
import { err, ok, type Result } from "../src/astack/result.ts";
import { companionPaths, exampleCompanion } from "./lib/companion.ts";
import {
	FrontmatterError,
	listComponents,
	type PluginComponent,
	readComponentValues,
} from "./lib/frontmatter.ts";
import { readMachinePaths } from "./lib/global.ts";
import { migrationPaths, renderMigrationDoc } from "./lib/migration.ts";
import {
	AGENT_ORIGINS,
	MIT_PERMISSION,
	PATH_ORIGINS,
	SKILL_ORIGINS,
	STATIC_NOTICE,
	UPSTREAM_NAMES,
	UPSTREAMS,
	type UpstreamName,
	upstreamOrigin,
} from "./lib/upstreams.ts";

const repoRoot = resolve(import.meta.dir, "..");

export type BuildOutcome = "written" | "fresh" | "stale";

export type CardPaths = { source: string; target: string };

export const repoCardPaths: CardPaths = {
	source: resolve(
		repoRoot,
		"marketplace/plugins/astack/skills/mode/references/card.md",
	),
	target: resolve(repoRoot, "rules/astack.md"),
};

export const CARD_MAX_CHARS = 6000;
export const CARD_MAX_LINES = 40;

export class CardSizeError extends Error {
	override name = "CardSizeError";
}

export function renderCard(source: string): string {
	const card = source.endsWith("\n") ? source : `${source}\n`;
	const lines = card.split("\n").length - 1;
	if (card.length > CARD_MAX_CHARS || lines > CARD_MAX_LINES)
		throw new CardSizeError(
			`the rule card has ${card.length} characters and ${lines} lines. The limits are ${CARD_MAX_CHARS} characters and ${CARD_MAX_LINES} lines`,
		);
	return card;
}

async function writeOrCompare(
	target: string,
	expected: string,
	mode: "write" | "check",
): Promise<BuildOutcome> {
	if (mode === "write") {
		await Bun.write(target, expected);
		return "written";
	}
	const file = Bun.file(target);
	const current = (await file.exists()) ? await file.text() : undefined;
	return current === expected ? "fresh" : "stale";
}

export async function buildCard(
	paths: CardPaths,
	mode: "write" | "check",
): Promise<BuildOutcome> {
	return writeOrCompare(
		paths.target,
		renderCard(await Bun.file(paths.source).text()),
		mode,
	);
}

export type MigrationDocPaths = { machine: string; target: string };

export const repoMigrationDocPaths: MigrationDocPaths = {
	machine: companionPaths(exampleCompanion(repoRoot)).machine,
	target: resolve(repoRoot, "docs/migration.md"),
};

export async function buildMigrationDoc(
	paths: MigrationDocPaths,
	mode: "write" | "check",
): Promise<Result<BuildOutcome, string>> {
	const machine = await readMachinePaths(paths.machine);
	if (!machine.ok) return machine;
	return ok(
		await writeOrCompare(
			paths.target,
			renderMigrationDoc(migrationPaths(machine.value)),
			mode,
		),
	);
}

export type NoticePaths = { plugin: string; target: string; packages: string };

export const repoNoticePaths: NoticePaths = {
	plugin: resolve(repoRoot, "marketplace/plugins/astack"),
	target: resolve(repoRoot, "marketplace/plugins/astack/NOTICE"),
	packages: repoRoot,
};

export type BundledPackage = {
	readonly name: string;
	readonly version: string;
	readonly license: string;
	readonly notice: string;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function jsonAt(path: string): Promise<unknown> {
	const file = Bun.file(path);
	return (await file.exists()) ? file.json() : undefined;
}

export async function bundledPackages(
	root: string,
): Promise<Result<readonly BundledPackage[], readonly string[]>> {
	const manifest = await jsonAt(resolve(root, "package.json"));
	const dependencies =
		isRecord(manifest) && isRecord(manifest.dependencies)
			? Object.keys(manifest.dependencies)
			: [];
	const found: BundledPackage[] = [];
	const errors: string[] = [];
	for (const name of dependencies) {
		const folder = resolve(root, "node_modules", name);
		const installed = await jsonAt(resolve(folder, "package.json"));
		const license = Bun.file(resolve(folder, "LICENSE"));
		const version = isRecord(installed) ? installed.version : undefined;
		const kind = isRecord(installed) ? installed.license : undefined;
		if (
			typeof version !== "string" ||
			typeof kind !== "string" ||
			!(await license.exists())
		)
			errors.push(
				`node_modules/${name} has no package.json with a version and a license, or no LICENSE file. Run bun install.`,
			);
		else
			found.push({
				name,
				version,
				license: kind,
				notice: (await license.text()).trim(),
			});
	}
	return errors.length > 0 ? err(errors) : ok(found);
}

export type Credit = {
	readonly item: string;
	readonly upstreams: readonly UpstreamName[];
};

export function componentPath(component: PluginComponent): string {
	return component.kind === "skill" ? dirname(component.file) : component.file;
}

export function componentOrigin(
	component: PluginComponent,
): Result<readonly UpstreamName[], string> {
	if (component.kind === "agent")
		return ok(AGENT_ORIGINS[relative(repoRoot, component.file)] ?? []);
	try {
		readComponentValues(component);
		return ok(SKILL_ORIGINS.get(component.name) ?? []);
	} catch (error) {
		if (error instanceof FrontmatterError) return err(error.message);
		throw error;
	}
}

export function pluginCredits(
	pluginRoot: string,
): Result<readonly Credit[], readonly string[]> {
	const credits: Credit[] = [];
	const errors: string[] = [];
	for (const component of listComponents(pluginRoot)) {
		const origin = componentOrigin(component);
		if (!origin.ok)
			errors.push(`${relative(pluginRoot, component.file)}: ${origin.error}`);
		else if (origin.value.length > 0)
			credits.push({
				item: relative(pluginRoot, componentPath(component)),
				upstreams: origin.value,
			});
	}
	return errors.length > 0 ? err(errors) : ok(credits);
}

function pathCredit(path: string): string {
	return path.startsWith("src/")
		? `${path} in the astack source repo, bundled into bin/astack.js`
		: `${path} in the astack source repo, and its copy in each build`;
}

export function renderPluginNotice(
	credits: readonly Credit[],
	paths: Readonly<Record<string, readonly UpstreamName[]>> = PATH_ORIGINS,
	bundled: readonly BundledPackage[] = [],
): string {
	const all = [
		...credits,
		...Object.entries(paths).map(([path, upstreams]) => ({
			item: pathCredit(path),
			upstreams,
		})),
	];
	const sections = UPSTREAM_NAMES.flatMap((name) => {
		const items = all
			.filter((credit) => credit.upstreams.includes(name))
			.map((credit) => `- ${credit.item}`)
			.sort();
		const { label, copyright } = UPSTREAMS[name];
		return items.length === 0
			? []
			: [
					`From ${label}, ${upstreamOrigin(name)}, MIT License, ${copyright}:`,
					"",
					...items,
					"",
				];
	});
	return [
		"astack includes material adapted from the projects below. Each list names",
		"the astack files that hold material of one project.",
		"",
		...sections,
		"Each project above is distributed under this license:",
		"",
		"MIT License",
		"",
		MIT_PERMISSION,
		...bundled.map(
			({ name, version, license, notice }) =>
				`bin/astack.js bundles the npm package ${name} ${version}, under the ${license} License:\n\n${notice}\n`,
		),
		STATIC_NOTICE.join("\n\n"),
		"",
	].join("\n");
}

export async function buildNotice(
	paths: NoticePaths,
	mode: "write" | "check",
): Promise<Result<BuildOutcome, readonly string[]>> {
	const credits = pluginCredits(paths.plugin);
	if (!credits.ok) return credits;
	const bundled = await bundledPackages(paths.packages);
	if (!bundled.ok) return bundled;
	return ok(
		await writeOrCompare(
			paths.target,
			renderPluginNotice(credits.value, PATH_ORIGINS, bundled.value),
			mode,
		),
	);
}

export async function buildSourceInstall(
	root: string,
	mode: "write" | "check",
): Promise<
	Result<
		readonly { readonly file: string; readonly outcome: BuildOutcome }[],
		readonly string[]
	>
> {
	const packagePath = resolve(root, "package.json");
	const pluginRoot = resolve(root, "marketplace/plugins/astack");
	const packageJson = await jsonAt(packagePath);
	const plugin = await jsonAt(
		resolve(pluginRoot, ".claude-plugin/plugin.json"),
	);
	if (
		!isRecord(packageJson) ||
		!isRecord(plugin) ||
		typeof plugin.name !== "string" ||
		typeof plugin.version !== "string" ||
		typeof plugin.license !== "string" ||
		!isRecord(plugin.author) ||
		typeof plugin.author.name !== "string"
	)
		return err([
			"package.json must be an object, and the astack plugin manifest needs name, version, license and author.name",
		]);
	const marketplacePath = resolve(
		root,
		"marketplace/.claude-plugin/marketplace.json",
	);
	const source = await jsonAt(marketplacePath);
	if (!isRecord(source))
		return err([
			"marketplace/.claude-plugin/marketplace.json must be an object",
		]);
	const marketplace = parseMarketplace(JSON.stringify(source));
	if (!marketplace.ok) return err([marketplace.error]);
	if (
		marketplace.value.plugins.length !== 1 ||
		marketplace.value.plugins[0]?.name !== plugin.name
	)
		return err(["the source marketplace must list only the astack plugin"]);
	const engines = packageJson.engines ?? {};
	if (!isRecord(engines))
		return err(["package.json engines must be an object"]);
	const json = (value: unknown): string =>
		`${JSON.stringify(value, null, "\t")}\n`;
	const contents: Readonly<Record<string, string>> = {
		".claude-plugin/marketplace.json": json({
			...source,
			plugins: marketplace.value.plugins.map(({ name }) => ({
				name,
				source: `./dist/claude-code/${name}`,
			})),
		}),
		".cursor-plugin/marketplace.json": json({
			name: marketplace.value.name,
			owner: { name: plugin.author.name },
			plugins: [{ name: plugin.name, source: "./dist/cursor/astack" }],
		}),
		"package.json": json({
			...packageJson,
			name: plugin.name,
			version: plugin.version,
			private: true,
			author: { name: plugin.author.name },
			license: plugin.license,
			bin: { [plugin.name]: "dist/cli/astack.js" },
			engines: { ...engines, node: `>=${NODE_FLOOR}` },
		}),
		LICENSE: await Bun.file(resolve(pluginRoot, "LICENSE")).text(),
		NOTICE: await Bun.file(resolve(pluginRoot, "NOTICE")).text(),
	};
	const outcomes: { file: string; outcome: BuildOutcome }[] = [];
	for (const [file, expected] of Object.entries(contents))
		outcomes.push({
			file,
			outcome: await writeOrCompare(resolve(root, file), expected, mode),
		});
	return ok(outcomes);
}

async function main(args: readonly string[]): Promise<number> {
	const unknownArgs = args.filter((arg) => arg !== "--check");
	if (unknownArgs.length > 0) {
		console.error(
			`Unknown argument: ${unknownArgs.join(" ")}. Usage: bun scripts/build.ts [--check]`,
		);
		return 2;
	}
	const mode = args.includes("--check") ? "check" : "write";
	const notice = await buildNotice(repoNoticePaths, mode);
	if (!notice.ok) {
		for (const error of notice.error) console.error(error);
		return 1;
	}
	const migration = await buildMigrationDoc(repoMigrationDocPaths, mode);
	if (!migration.ok) {
		console.error(migration.error);
		return 1;
	}
	const sourceInstall = await buildSourceInstall(repoRoot, mode);
	if (!sourceInstall.ok) {
		for (const error of sourceInstall.error) console.error(error);
		return 1;
	}
	const outcomes = [
		{ file: "rules/astack.md", outcome: await buildCard(repoCardPaths, mode) },
		{ file: "docs/migration.md", outcome: migration.value },
		{ file: "marketplace/plugins/astack/NOTICE", outcome: notice.value },
		...sourceInstall.value,
	];
	for (const { file, outcome } of outcomes) {
		if (outcome === "stale")
			console.error(`${file} is stale. Run \`bun run build\`.`);
		else console.log(`${file} ${outcome}`);
	}
	return outcomes.some(({ outcome }) => outcome === "stale") ? 1 : 0;
}

if (import.meta.main) {
	try {
		process.exitCode = await main(Bun.argv.slice(2));
	} catch (error) {
		if (error instanceof CardSizeError) {
			console.error(`${error.message}. Shorten the card source.`);
			process.exitCode = 1;
		} else throw error;
	}
}
