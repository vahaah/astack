import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const usage = "Usage: bun scripts/fixture-ids.ts [<fixture dir>]";

const defaultDir = resolve(import.meta.dir, "../tests/fixtures/hook-input");

type IdKind = {
	readonly name: string;
	readonly pattern: RegExp;
	readonly synthetic: (index: number, id: string) => string;
};

type Fixture = { readonly path: string; readonly text: string };

function digits(index: number, width: number): string {
	return String(index).padStart(width, "0");
}

const toolPrefix = "toolu_";

const ID_KINDS: readonly IdKind[] = [
	{
		name: "uuid",
		pattern:
			/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f])/g,
		synthetic: (index) => `00000000-0000-4000-8000-${digits(index, 12)}`,
	},
	{
		name: "tool id",
		pattern: /\btoolu_[A-Za-z0-9]+/g,
		synthetic: (index, id) =>
			`${toolPrefix}${digits(index, id.length - toolPrefix.length)}`,
	},
	{
		name: "agent id",
		pattern: /\ba[0-9a-f]{16}\b/g,
		synthetic: (index) => `a${digits(index, 16)}`,
	},
];

type Replaced = {
	readonly fixtures: readonly Fixture[];
	readonly counts: readonly string[];
};

function syntheticIds(fixtures: readonly Fixture[]): Replaced {
	return ID_KINDS.reduce<Replaced>(
		(current, kind) => {
			const seen = new Map<string, string>();
			const next = current.fixtures.map((fixture) => ({
				path: fixture.path,
				text: fixture.text.replace(kind.pattern, (id) => {
					const known = seen.get(id);
					if (known !== undefined) return known;
					const value = kind.synthetic(seen.size + 1, id);
					seen.set(id, value);
					return value;
				}),
			}));
			return {
				fixtures: next,
				counts: [...current.counts, `${seen.size} ${kind.name}(s)`],
			};
		},
		{ fixtures, counts: [] },
	);
}

async function main(argv: readonly string[]): Promise<number> {
	if (argv.length > 1) {
		console.error(usage);
		return 2;
	}
	const dir = resolve(argv[0] ?? defaultDir);
	const names = (await readdir(dir))
		.filter((name) => name.endsWith(".json"))
		.sort();
	if (names.length === 0) {
		console.error(`fixture-ids: ${dir} holds no .json file. ${usage}`);
		return 1;
	}
	const fixtures = await Promise.all(
		names.map(async (name) => {
			const path = join(dir, name);
			return { path, text: await Bun.file(path).text() };
		}),
	);
	const replaced = syntheticIds(fixtures);
	await Promise.all(
		replaced.fixtures.map((fixture) => Bun.write(fixture.path, fixture.text)),
	);
	console.log(
		`fixture-ids: ${names.length} file(s), ${replaced.counts.join(", ")}`,
	);
	return 0;
}

if (import.meta.main) {
	process.exitCode = await main(Bun.argv.slice(2));
}
