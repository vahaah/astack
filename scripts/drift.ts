import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	type BuildOutcome,
	buildCard,
	buildMigrationDoc,
	buildNotice,
	buildSourceInstall,
	repoCardPaths,
	repoMigrationDocPaths,
	repoNoticePaths,
} from "./build.ts";
import { render } from "./dist/render.ts";
import { readSource } from "./dist/source.ts";
import { type FileEntry, type FileTree, textFile } from "./dist/tree.ts";
import { BUNDLE_PATH, compileBundle } from "./lib/bundle.ts";
import { messageOf } from "./lib/exec.ts";

const ROOT = resolve(import.meta.dir, "..");

function fileAt(path: string, problems: string[]): FileEntry | undefined {
	const absolute = join(ROOT, path);
	const info = lstatSync(absolute, { throwIfNoEntry: false });
	if (info === undefined) {
		problems.push(`${path}: missing`);
		return undefined;
	}
	if (info.isSymbolicLink()) {
		problems.push(`${path}: symbolic link`);
		return undefined;
	}
	if (!info.isFile()) {
		problems.push(`${path}: not a regular file`);
		return undefined;
	}
	return {
		bytes: new Uint8Array(readFileSync(absolute)),
		executable: (info.mode & 0o111) !== 0,
	};
}

function distFiles(problems: string[]): FileTree {
	const files = new Map<string, FileEntry>();
	const visit = (path: string) => {
		const absolute = join(ROOT, path);
		const info = lstatSync(absolute, { throwIfNoEntry: false });
		if (info?.isDirectory()) {
			for (const name of readdirSync(absolute).sort()) visit(`${path}/${name}`);
			return;
		}
		const entry = fileAt(path, problems);
		if (entry !== undefined) files.set(relative("dist", path), entry);
	};
	visit("dist");
	return files;
}

function compare(
	path: string,
	expected: FileEntry,
	actual: FileEntry,
	problems: string[],
): void {
	if (
		expected.bytes.length !== actual.bytes.length ||
		!expected.bytes.every((byte, index) => byte === actual.bytes[index])
	)
		problems.push(`${path}: stale bytes`);
	if (expected.executable !== actual.executable)
		problems.push(`${path}: wrong executable bit`);
}

function generatedFile(
	path: string,
	outcome: BuildOutcome,
	problems: string[],
): void {
	const actual = fileAt(path, problems);
	if (actual?.executable) problems.push(`${path}: wrong executable bit`);
	if (outcome === "stale")
		problems.push(`${path}: stale generated file. Run bun run build.`);
}

async function prerequisites(problems: string[]): Promise<void> {
	generatedFile(
		relative(ROOT, repoCardPaths.target),
		await buildCard(repoCardPaths, "check"),
		problems,
	);
	const migration = await buildMigrationDoc(repoMigrationDocPaths, "check");
	if (migration.ok)
		generatedFile(
			relative(ROOT, repoMigrationDocPaths.target),
			migration.value,
			problems,
		);
	else problems.push(migration.error);
	const notice = await buildNotice(repoNoticePaths, "check");
	if (notice.ok)
		generatedFile(
			relative(ROOT, repoNoticePaths.target),
			notice.value,
			problems,
		);
	else problems.push(...notice.error);
	const sourceInstall = await buildSourceInstall(ROOT, "check");
	if (sourceInstall.ok)
		for (const { file, outcome } of sourceInstall.value)
			generatedFile(file, outcome, problems);
	else problems.push(...sourceInstall.error);
}

async function main(): Promise<number> {
	if (Bun.argv.length > 2) {
		console.error("Usage: bun scripts/drift.ts");
		return 2;
	}
	const problems: string[] = [];
	await prerequisites(problems);
	const bundle = await compileBundle(ROOT);
	if (!bundle.ok) problems.push(...bundle.error);
	else {
		const expected = { bytes: bundle.value, executable: false };
		const actual = fileAt(BUNDLE_PATH, problems);
		if (actual !== undefined) compare(BUNDLE_PATH, expected, actual, problems);
		const text = new TextDecoder().decode(bundle.value);
		const source = readSource({
			marketplace: join(ROOT, "marketplace"),
			rules: join(ROOT, "rules"),
		});
		const rendered = render({
			...source,
			bundle: text,
			plugins: {
				...source.plugins,
				astack: new Map([
					...source.plugins.astack,
					["bin/astack.js", textFile(text)],
				]),
			},
		});
		if (!rendered.ok) problems.push(...rendered.error);
		else {
			const actualFiles = distFiles(problems);
			const expectedFiles = rendered.value.tree;
			const paths = new Set([...actualFiles.keys(), ...expectedFiles.keys()]);
			for (const path of [...paths].sort()) {
				const actualFile = actualFiles.get(path);
				const expectedFile = expectedFiles.get(path);
				if (expectedFile === undefined) problems.push(`dist/${path}: extra`);
				else if (actualFile === undefined)
					problems.push(`dist/${path}: missing`);
				else compare(`dist/${path}`, expectedFile, actualFile, problems);
			}
		}
	}
	for (const problem of problems) console.error(problem);
	console.log(`drift: ${problems.length} differences`);
	return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) {
	try {
		process.exitCode = await main();
	} catch (error) {
		console.error(`drift: ${messageOf(error)}`);
		process.exitCode = 1;
	}
}
