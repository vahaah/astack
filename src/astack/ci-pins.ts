import { basename, posix } from "node:path";
import {
	Composer,
	isAlias,
	isMap,
	isNode,
	isScalar,
	isSeq,
	LineCounter,
	Parser,
	parseAllDocuments,
	visit,
} from "yaml";

export type Tool = "bun" | "supabase" | "node";

type SetupAction = {
	readonly tool: Tool;
	readonly version: string;
	readonly file?: string;
	readonly defaults: readonly string[];
};

export const TOOL_ACTIONS: Readonly<Record<string, SetupAction>> = {
	"actions/setup-node": {
		tool: "node",
		version: "node-version",
		file: "node-version-file",
		defaults: [],
	},
	"oven-sh/setup-bun": {
		tool: "bun",
		version: "bun-version",
		file: "bun-version-file",
		defaults: ["package.json"],
	},
	"supabase/setup-cli": {
		tool: "supabase",
		version: "version",
		defaults: ["bun.lock", "pnpm-lock.yaml", "package-lock.json"],
	},
};

export const EXACT_VERSION = /^v?\d+\.\d+\.\d+$/;

const RENAMED_REPOS: Readonly<Record<string, string>> = {
	"xhyrom/setup-bun": "oven-sh/setup-bun",
};

export function actionName(uses: string): string {
	const name = uses.split("@")[0] ?? uses;
	if (name.startsWith("./")) return name;
	const [owner = "", repo = "", ...rest] = name
		.split(/[\\/]/)
		.filter((part) => part !== "");
	const repository = `${owner}/${repo}`.toLowerCase();
	const path = posix.normalize(rest.join("/")).toLowerCase();
	return [
		RENAMED_REPOS[repository] ?? repository,
		...(path === "." ? [] : [path]),
	].join("/");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

type FileRead =
	| { readonly kind: "none" }
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "unread" }
	| { readonly kind: "elsewhere" };

const NONE: FileRead = { kind: "none" };
const UNREAD: FileRead = { kind: "unread" };

const field = (value: unknown, key: string): unknown =>
	isRecord(value) ? value[key] : undefined;

const textOrUnread = (value: unknown): FileRead =>
	typeof value === "string" ? { kind: "text", text: value } : UNREAD;

function packageBun(text: string): FileRead {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return NONE;
	}
	const manager = field(parsed, "packageManager");
	if (manager !== undefined && manager !== null && typeof manager !== "string")
		return NONE;
	const version =
		(typeof manager === "string" ? manager.split("bun@")[1] : undefined) ??
		field(field(parsed, "engines"), "bun");
	return typeof version === "string" ? { kind: "text", text: version } : NONE;
}

function bunVersionIn(file: string, text: string): FileRead {
	switch (basename(file)) {
		case "package.json":
			return packageBun(text);
		case ".tool-versions": {
			const version = /^bun\s*(?<version>.*?)$/m.exec(text)?.groups?.version;
			return version === undefined ? NONE : { kind: "text", text: version };
		}
		case ".bumrc":
		case ".bun-version":
			return { kind: "text", text };
		default:
			return NONE;
	}
}

function manifestNode(manifest: object): FileRead | "thrown" {
	const volta = field(manifest, "volta");
	const pinned = field(volta, "node");
	if (pinned) return textOrUnread(pinned);
	const runtime = field(field(manifest, "devEngines"), "runtime");
	if (runtime)
		for (const entry of Array.isArray(runtime) ? runtime : [runtime]) {
			if (entry === null || entry === undefined) return "thrown";
			const name = field(entry, "name");
			if (name === null || name === undefined) continue;
			if (typeof name !== "string") return "thrown";
			const version = field(entry, "version");
			if (name.toLowerCase() === "node" && version)
				return textOrUnread(version);
		}
	const engines = field(field(manifest, "engines"), "node");
	if (engines) return textOrUnread(engines);
	const extended = field(volta, "extends");
	if (extended)
		return typeof extended === "string" ? { kind: "elsewhere" } : "thrown";
	return NONE;
}

function textNode(text: string): FileRead {
	if (text.includes("tools") || text.includes("\\")) return UNREAD;
	const found = /^(?:node(?:js)?\s+)?v?(?<version>\S+)$/m.exec(text);
	return { kind: "text", text: found?.groups?.version ?? text.trim() };
}

function nodeVersionIn(text: string): FileRead {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return textNode(text);
	}
	if (typeof parsed !== "object" || parsed === null) return textNode(text);
	const read = manifestNode(parsed);
	return read === "thrown" ? textNode(text) : read;
}

const CONCRETE_VERSION =
	/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/;

function concrete(raw: unknown): FileRead | "thrown" {
	if (!raw) return NONE;
	if (typeof raw !== "string") return "thrown";
	const found = CONCRETE_VERSION.exec(raw)?.[0];
	return found === undefined ? NONE : { kind: "text", text: found };
}

const settled = (read: FileRead | "thrown") =>
	read === "thrown" ? NONE : read;

function jsonOf(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function bunLockSupabase(text: string): FileRead {
	const lock = jsonOf(text.replace(/,\s*([}\]])/g, "$1"));
	const root = field(field(lock, "workspaces"), "");
	const declared =
		field(field(root, "dependencies"), "supabase") ??
		field(field(root, "devDependencies"), "supabase");
	if (!declared) return NONE;
	const resolved = field(field(lock, "packages"), "supabase");
	return settled(
		concrete(
			Array.isArray(resolved) && typeof resolved[0] === "string"
				? resolved[0]
				: declared,
		),
	);
}

function pnpmSupabase(text: string): FileRead {
	const documents = parseAllDocuments(text, COMPOSE_OPTIONS);
	const [document] = documents;
	let aliased = false;
	if (document !== undefined)
		visit(document, {
			Alias() {
				aliased = true;
				return visit.BREAK;
			},
		});
	if (
		aliased ||
		documents.length > 1 ||
		(document !== undefined &&
			document.errors.length + document.warnings.length > 0)
	)
		return UNREAD;
	const lock: unknown = document?.toJS();
	const root = field(field(lock, "importers"), ".");
	const dependency =
		field(field(root, "dependencies"), "supabase") ??
		field(field(root, "devDependencies"), "supabase");
	const read = settled(
		concrete(
			typeof dependency === "string"
				? dependency
				: field(dependency, "version"),
		),
	);
	if (read.kind !== "text") return read;
	const packages = field(lock, "packages");
	const entry = (isRecord(packages) ? Object.entries(packages) : []).find(
		([key]) =>
			key === `supabase@${read.text}` ||
			key.startsWith(`/supabase@${read.text}`),
	);
	return entry !== undefined && entry[1] == null ? NONE : read;
}

function packageLockSupabase(text: string): FileRead {
	const lock = jsonOf(text);
	const installed = concrete(
		field(field(field(lock, "packages"), "node_modules/supabase"), "version"),
	);
	if (installed === "thrown") return NONE;
	if (installed.kind === "text") return installed;
	return settled(
		concrete(field(field(field(lock, "dependencies"), "supabase"), "version")),
	);
}

function supabaseVersionIn(file: string, text: string): FileRead {
	switch (basename(file)) {
		case "bun.lock":
			return bunLockSupabase(text);
		case "pnpm-lock.yaml":
			return pnpmSupabase(text);
		case "package-lock.json":
			return packageLockSupabase(text);
		default:
			return NONE;
	}
}

function versionInFile(tool: Tool, file: string, text: string): FileRead {
	switch (tool) {
		case "bun":
			return bunVersionIn(file, text);
		case "node":
			return nodeVersionIn(text);
		case "supabase":
			return supabaseVersionIn(file, text);
		default: {
			const unhandled: never = tool;
			return unhandled;
		}
	}
}

export function readsVersion(
	tool: Tool,
	file: string,
	text: string | undefined,
): boolean {
	if (text === undefined) return false;
	const read = versionInFile(tool, file, text);
	return read.kind === "text" ? read.text.trim() !== "" : read.kind !== "none";
}

export function exactVersionInFile(
	tool: Tool,
	file: string,
	text: string | undefined,
): string | undefined {
	if (text === undefined) return undefined;
	const read = versionInFile(tool, file, text);
	const version = read.kind === "text" ? read.text.trim() : "";
	return EXACT_VERSION.test(version) ? version : undefined;
}

const readsElsewhere = (tool: Tool, file: string, text: string | undefined) =>
	text !== undefined && versionInFile(tool, file, text).kind === "elsewhere";

type Given = {
	readonly value: string | undefined;
	readonly file: string;
	readonly line: number;
};

const sourceOf = (given: Given) => `${given.file}:${given.line}`;

type Step = {
	readonly uses: string;
	readonly local: string | undefined;
	readonly given: Given;
	readonly inputs: ReadonlyMap<string, Given> | undefined;
	readonly condition: Given | undefined;
	readonly job: string | undefined;
	readonly reusable: boolean;
};

type Job = {
	readonly name: string;
	readonly entries: readonly {
		readonly label: string;
		readonly given: Given;
	}[];
};

type Declared = Given | "none" | "unreadable";

type FileScan = {
	readonly path: string;
	readonly steps: readonly Step[];
	readonly strays: readonly { readonly input: string; readonly given: Given }[];
	readonly declared: ReadonlyMap<string, readonly Declared[]>;
	readonly unreadable: readonly string[];
	readonly forms: readonly string[];
	readonly jobs: readonly Job[];
};

const VERSION_FILE_INPUT = /version-file$/i;
const ODD_CHARACTER = /\r(?!\n)|[\u0085\u2028\u2029\uFEFF]/g;
const TAB_INDENT = /^(?:[ \t]|[-?:](?=[ \t]))*\t/;
const ANCHOR_NAME = /^[\w-]+$/;
const EXACT_ROOT_KEYS: ReadonlySet<string> = new Set(["inputs", "runs"]);
const COMPOSE_OPTIONS = {
	version: "1.2",
	schema: "core",
	merge: false,
	strict: true,
	uniqueKeys: true,
} as const;

type Entry = {
	readonly key: string;
	readonly line: number;
	readonly value: unknown;
};

type Parsed = {
	readonly root: unknown;
	readonly maps: ReadonlyMap<unknown, readonly Entry[]>;
	readonly forms: readonly number[];
};

function keyText(key: unknown): string | undefined {
	if (!isScalar(key) || key.value === null || key.value === undefined)
		return undefined;
	return typeof key.value === "string" ? key.value : String(key.value);
}

function parseYaml(text: string): Parsed {
	const counter = new LineCounter();
	const tokens = [...new Parser(counter.addNewLine).parse(text)];
	const lineAt = (offset: number) => counter.linePos(offset).line;
	const lineOf = (node: unknown) =>
		isNode(node) && node.range ? lineAt(node.range[0]) : 1;
	const forms: number[] = [];
	for (const found of text.matchAll(ODD_CHARACTER))
		if (found.index !== 0 || found[0] !== "\uFEFF")
			forms.push(lineAt(found.index));
	for (const token of tokens)
		if (token.type === "directive") forms.push(lineAt(token.offset));
	const documents = [...new Composer(COMPOSE_OPTIONS).compose(tokens)];
	for (const document of documents.slice(1))
		forms.push(lineAt(document.range[0]));
	const blockLines = new Set<number>();
	const maps = new Map<unknown, readonly Entry[]>();
	const walk = (node: unknown): void => {
		if (isAlias(node)) {
			forms.push(lineOf(node));
			return;
		}
		if (!isNode(node)) return;
		if (
			node.tag !== undefined ||
			(node.anchor !== undefined && !ANCHOR_NAME.test(node.anchor))
		)
			forms.push(lineOf(node));
		if (isScalar(node)) {
			const block =
				node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED";
			if (block && node.range) {
				const last = lineAt(Math.max(node.range[1] - 1, node.range[0]));
				for (let line = lineOf(node) + 1; line <= last; line++)
					blockLines.add(line);
			}
			return;
		}
		if (isSeq(node)) {
			for (const item of node.items) walk(item);
			return;
		}
		if (!isMap(node)) return;
		const entries: Entry[] = [];
		const seen = new Set<string>();
		for (const pair of node.items) {
			walk(pair.key);
			walk(pair.value);
			const key = keyText(pair.key);
			const line = lineOf(pair.key ?? pair.value);
			if (key === undefined) {
				forms.push(line);
				continue;
			}
			const folded = key.toLowerCase();
			if (key === "<<" || key.includes("${{") || seen.has(folded))
				forms.push(line);
			seen.add(folded);
			entries.push({ key, line, value: pair.value });
		}
		maps.set(node, entries);
	};
	for (const document of documents) {
		for (const problem of [...document.errors, ...document.warnings])
			forms.push(lineAt(problem.pos[0]));
		walk(document.contents);
	}
	text.split("\n").forEach((raw, index) => {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		if (
			!blockLines.has(index + 1) &&
			line.trim() !== "" &&
			TAB_INDENT.test(line)
		)
			forms.push(index + 1);
	});
	return { root: documents[0]?.contents, maps, forms };
}

const isNull = (value: unknown) =>
	value === null || (isScalar(value) && value.value === null);

function scalarText(value: unknown): string | undefined {
	if (isNull(value)) return "";
	if (!isScalar(value)) return undefined;
	if (typeof value.value === "string") return value.value;
	return value.source ?? "";
}

function localUses(uses: string): string | undefined {
	if (uses.startsWith("./")) return uses;
	if (uses.startsWith(".\\")) return `./${uses.slice(2).replaceAll("\\", "/")}`;
	if (!uses.startsWith("$/")) return undefined;
	const path = uses.slice(2).replace(/^\/+/, "");
	return path.includes("@") ? undefined : `./${path}`;
}

const lastOf = (entries: readonly Entry[], key: string) =>
	entries.findLast((entry) => entry.key.toLowerCase() === key);

function scanFile(path: string, text: string): FileScan {
	const parsed = parseYaml(text);
	const forms = [...parsed.forms];
	const unreadable: number[] = [];
	const entriesOf = (node: unknown) => parsed.maps.get(node) ?? [];
	const given = (entry: Entry): Given => ({
		value: scalarText(entry.value),
		file: path,
		line: entry.line,
	});
	const inputsOf = (entry: Entry | undefined) => {
		if (entry === undefined || isNull(entry.value))
			return new Map<string, Given>();
		if (!isMap(entry.value)) {
			forms.push(entry.line);
			return undefined;
		}
		return new Map(
			entriesOf(entry.value).map((input) => [
				input.key.toLowerCase(),
				given(input),
			]),
		);
	};
	const top = entriesOf(parsed.root);
	const workflow = path.startsWith(`${WORKFLOWS}/`);
	const jobOf = new Map<unknown, string>();
	const jobs: Job[] = [];
	const jobNodes = new Set<unknown>();
	const shown = (entry: Entry, value: unknown): Given => ({
		value:
			isScalar(value) || isNull(value)
				? scalarText(value)
				: isNode(value)
					? JSON.stringify(value.toJSON())
					: undefined,
		file: path,
		line: entry.line,
	});
	const imageOf = (entry: Entry): Given => {
		if (!isMap(entry.value)) return shown(entry, entry.value);
		const image = lastOf(entriesOf(entry.value), "image");
		return image === undefined ? shown(entry, entry.value) : given(image);
	};
	if (workflow)
		for (const job of entriesOf(lastOf(top, "jobs")?.value)) {
			const fields = entriesOf(job.value);
			const runner = lastOf(fields, "runs-on");
			const container = lastOf(fields, "container");
			const services = lastOf(fields, "services");
			jobs.push({
				name: job.key,
				entries: [
					...(runner === undefined
						? []
						: [{ label: "runner", given: shown(runner, runner.value) }]),
					...(container === undefined
						? []
						: [{ label: "container", given: imageOf(container) }]),
					...(services === undefined
						? []
						: isMap(services.value)
							? entriesOf(services.value).map((service) => ({
									label: `service ${service.key}`,
									given: imageOf(service),
								}))
							: [
									{
										label: "services",
										given: shown(services, services.value),
									},
								]),
				],
			});
			jobNodes.add(job.value);
			jobOf.set(job.value, job.key);
			const list = lastOf(entriesOf(job.value), "steps")?.value;
			if (isSeq(list)) for (const item of list.items) jobOf.set(item, job.key);
		}
	const steps: Step[] = [];
	const strays: { input: string; given: Given }[] = [];
	for (const [node, entries] of parsed.maps) {
		const usesEntry = lastOf(entries, "uses");
		const withEntry = lastOf(entries, "with");
		const ifEntry = lastOf(entries, "if");
		if (usesEntry === undefined) {
			for (const input of entriesOf(withEntry?.value))
				if (VERSION_FILE_INPUT.test(input.key))
					strays.push({ input: input.key.toLowerCase(), given: given(input) });
			continue;
		}
		const uses = given(usesEntry);
		if (
			uses.value === undefined ||
			uses.value === "" ||
			uses.value.trim() !== uses.value
		) {
			unreadable.push(usesEntry.line);
			continue;
		}
		steps.push({
			uses: uses.value,
			local: localUses(uses.value),
			given: uses,
			inputs: inputsOf(withEntry),
			condition: ifEntry === undefined ? undefined : given(ifEntry),
			job: jobOf.get(node),
			reusable: jobNodes.has(node),
		});
	}
	const declared = new Map<string, Declared[]>();
	const declare = (block: Entry | undefined) => {
		if (block === undefined || isNull(block.value)) return;
		if (!isMap(block.value)) {
			forms.push(block.line);
			return;
		}
		for (const input of entriesOf(block.value)) {
			const name = input.key.toLowerCase();
			const fallback = lastOf(entriesOf(input.value), "default");
			const entry: Declared =
				fallback !== undefined
					? given(fallback)
					: isNull(input.value) || isMap(input.value)
						? "none"
						: "unreadable";
			declared.set(name, [...(declared.get(name) ?? []), entry]);
		}
	};
	if (workflow)
		for (const event of entriesOf(lastOf(top, "on")?.value))
			declare(lastOf(entriesOf(event.value), "inputs"));
	else {
		for (const { key, line } of top)
			if (EXACT_ROOT_KEYS.has(key.toLowerCase()) && !EXACT_ROOT_KEYS.has(key))
				forms.push(line);
		declare(top.findLast((entry) => entry.key === "inputs"));
	}
	const at = (lines: readonly number[]) =>
		[...new Set(lines)].map((line) => `${path}:${line}`);
	return {
		path,
		steps,
		strays,
		declared,
		unreadable: at(unreadable),
		forms: at(forms),
		jobs,
	};
}

export type VersionRef = {
	readonly given: string;
	readonly input: string;
	readonly action: string | undefined;
	readonly tool: Tool | undefined;
	readonly source: string;
	readonly via: string | undefined;
};

export type PinCheck =
	| { readonly kind: "ci-file"; readonly path: string }
	| { readonly kind: "unreadable"; readonly source: string }
	| { readonly kind: "form"; readonly source: string }
	| {
			readonly kind: "no-action";
			readonly source: string;
			readonly uses: string;
	  }
	| { readonly kind: "not-a-file"; readonly path: string }
	| {
			readonly kind: "no-path";
			readonly ref: VersionRef;
			readonly reason: "expression" | "outside";
			readonly changes: readonly string[];
	  }
	| {
			readonly kind: "unknown";
			readonly ref: VersionRef;
			readonly file: string;
			readonly changed: boolean;
	  }
	| {
			readonly kind: "version";
			readonly ref: VersionRef;
			readonly file: string;
			readonly tool: Tool;
			readonly changed: boolean;
			readonly base: Side;
			readonly head: Side;
			readonly required: boolean;
	  };

export type Side = {
	readonly version: string | undefined;
	readonly text: string | undefined;
	readonly read: boolean;
	readonly from: string;
	readonly problem:
		| "missing"
		| "not a regular file"
		| "another file"
		| undefined;
};

export type Blob =
	| { readonly kind: "file"; readonly text: string }
	| { readonly kind: "missing" }
	| { readonly kind: "other" };

export type Reader = (path: string) => Blob;

const textOf = (blob: Blob) => (blob.kind === "file" ? blob.text : undefined);

function actionFolder(uses: string): string | undefined {
	if (/\.ya?ml$/.test(uses)) return undefined;
	const folder = posix.normalize(uses).replace(/\/+$/, "");
	return folder === "." ? "" : folder.replace(/^\.\//, "");
}

function targetsOf(uses: string): string[] {
	const folder = actionFolder(uses);
	if (folder === undefined) {
		const path = repoPath(uses);
		return path === undefined ? [] : [path];
	}
	return ["action.yml", "action.yaml"].map((name) =>
		folder === "" ? name : `${folder}/${name}`,
	);
}

const targetsOfStep = (step: Step) =>
	step.local === undefined ? [] : targetsOf(step.local);

function underFolder(path: string, folder: string): boolean {
	return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

const WORKFLOWS = ".github/workflows";
const CI_FOLDERS: readonly string[] = [WORKFLOWS, ".github/actions"];

const READABLE: readonly string[] = [
	"package.json",
	".bun-version",
	".bumrc",
	".tool-versions",
	".nvmrc",
	".node-version",
];

function repoPath(value: string): string | undefined {
	const path = posix.normalize(value).replace(/^\.\//, "");
	return path === "." || path.startsWith("../") || path.startsWith("/")
		? undefined
		: path;
}

const INPUT_EXPRESSION = /^\$\{\{\s*inputs\.([A-Za-z_][\w-]*)\s*\}\}$/;

type Candidate =
	| {
			readonly kind: "file";
			readonly file: string;
			readonly text: string;
			readonly given: Given;
	  }
	| { readonly kind: "empty" }
	| {
			readonly kind: "expression" | "outside";
			readonly text: string;
			readonly given: Given;
	  }
	| { readonly kind: "unreadable"; readonly given: Given };

const EMPTY_INPUT: Candidate = { kind: "empty" };

function textIn(tool: Tool, file: string, text: string | undefined) {
	if (text === undefined) return undefined;
	const read = versionInFile(tool, file, text);
	return read.kind === "text" ? read.text.trim() : undefined;
}

function sideOf(
	read: Reader,
	tool: Tool,
	file: string,
	fallbacks: readonly string[],
	required: boolean,
	written: string,
): Side {
	const readerOf = (path: string) => (path === file ? written : path);
	const named = read(file);
	let from = file;
	let blob = named;
	if (named.kind !== "other" && !readsVersion(tool, written, textOf(named)))
		for (const next of fallbacks) {
			from = next;
			blob = read(next);
			if (blob.kind === "other" || readsVersion(tool, next, textOf(blob)))
				break;
		}
	const text = textOf(blob);
	return {
		version: exactVersionInFile(tool, readerOf(from), text),
		text: textIn(tool, readerOf(from), text),
		read: readsVersion(tool, readerOf(from), text),
		from,
		problem:
			named.kind === "other" || blob.kind === "other"
				? "not a regular file"
				: required && named.kind === "missing"
					? "missing"
					: readsElsewhere(tool, readerOf(from), text)
						? "another file"
						: undefined,
	};
}

type Tree = {
	readonly scans: readonly FileScan[];
	readonly steps: readonly Step[];
	readonly folders: ReadonlySet<string>;
	readonly found: ReadonlySet<string>;
	readonly notFiles: ReadonlySet<string>;
	readonly resolve: (given: Given, depth: number) => Candidate[];
	readonly declared: ReadonlyMap<
		string,
		ReadonlyMap<string, readonly Declared[]>
	>;
};

function scanTree(ciFiles: readonly string[], readHead: Reader): Tree {
	const scans: FileScan[] = [];
	const scanned = new Set<string>();
	const folders = new Set<string>(CI_FOLDERS);
	const found = new Set<string>();
	const notFiles = new Set<string>();
	const queue = [...ciFiles];
	for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
		if (scanned.has(path)) continue;
		scanned.add(path);
		const blob = readHead(path);
		if (blob.kind === "missing") continue;
		found.add(path);
		if (blob.kind === "other") {
			notFiles.add(path);
			continue;
		}
		const scan = scanFile(path, blob.text);
		scans.push(scan);
		for (const step of scan.steps) {
			if (step.local === undefined) continue;
			const folder = actionFolder(step.local);
			if (folder !== undefined) folders.add(folder);
			queue.push(...targetsOf(step.local));
		}
	}
	const steps = scans.flatMap((scan) => scan.steps);
	const declared = new Map(scans.map((scan) => [scan.path, scan.declared]));
	const callersOf = (file: string) =>
		steps.filter((step) => targetsOfStep(step).includes(file));

	function resolve(given: Given, depth: number): Candidate[] {
		const value = given.value?.trim();
		if (value === undefined) return [{ kind: "unreadable", given }];
		if (value === "") return [{ kind: "empty" }];
		const name = INPUT_EXPRESSION.exec(value)?.[1]?.toLowerCase();
		if (name !== undefined && depth < 5) {
			const fromCallers = fromInput(given.file, name, depth);
			if (fromCallers !== undefined) return fromCallers;
		}
		if (value.includes("${{"))
			return [{ kind: "expression", text: value, given }];
		const file = repoPath(value);
		return file === undefined
			? [{ kind: "outside", text: value, given }]
			: [{ kind: "file", file, text: value, given }];
	}

	function fromInput(
		file: string,
		name: string,
		depth: number,
	): Candidate[] | undefined {
		const callers = callersOf(file);
		const values: Given[] = [];
		const workflow = file.startsWith(`${WORKFLOWS}/`);
		let usesDefault = callers.length === 0 || workflow;
		for (const caller of callers) {
			if (caller.inputs === undefined) return undefined;
			const given = [...caller.inputs].find(
				([key]) => key.toLowerCase() === name,
			)?.[1];
			if (given === undefined) usesDefault = true;
			else values.push(given);
		}
		let empty = workflow;
		if (usesDefault)
			for (const fallback of declared.get(file)?.get(name) ?? ["none"]) {
				if (fallback === "unreadable") return undefined;
				if (fallback === "none") empty = true;
				else values.push(fallback);
			}
		return [
			...values.flatMap((given) => resolve(given, depth + 1)),
			...(empty ? [EMPTY_INPUT] : []),
		];
	}

	return { scans, steps, folders, found, notFiles, resolve, declared };
}

export function checkCiPins(input: {
	readonly changed: readonly string[];
	readonly ciFiles: readonly string[];
	readonly readBase: Reader;
	readonly readHead: Reader;
}): PinCheck[] {
	const { scans, steps, folders, found, notFiles, resolve } = scanTree(
		input.ciFiles,
		input.readHead,
	);
	const changed = new Set(input.changed);
	const changes = input.changed.filter((path) =>
		READABLE.includes(posix.basename(path)),
	);
	const versionCheck = (
		ref: VersionRef,
		tool: Tool,
		file: string,
		fallbacks: readonly string[],
		required: boolean,
		written: string = file,
	): PinCheck => {
		const side = (read: Reader) =>
			sideOf(read, tool, file, fallbacks, required, written);
		const base = side(input.readBase);
		const head = side(input.readHead);
		return {
			kind: "version",
			ref,
			file,
			tool,
			changed: [base.from, head.from, file].some((path) => changed.has(path)),
			base,
			head,
			required,
		};
	};
	const checkOf = (
		candidate: Candidate,
		ref: Omit<VersionRef, "given" | "via">,
		start: Given,
		fallbacks: readonly string[],
	): PinCheck[] => {
		if (candidate.kind === "empty") {
			const [first, ...rest] = fallbacks;
			return ref.tool === undefined || first === undefined
				? []
				: [
						versionCheck(
							{
								...ref,
								input: `${first} default`,
								given: "",
								via: undefined,
							},
							ref.tool,
							first,
							rest,
							false,
						),
					];
		}
		if (candidate.kind === "unreadable")
			return [{ kind: "unreadable", source: sourceOf(candidate.given) }];
		const via =
			sourceOf(candidate.given) === sourceOf(start)
				? undefined
				: sourceOf(candidate.given);
		const full: VersionRef = { ...ref, given: candidate.text, via };
		switch (candidate.kind) {
			case "expression":
			case "outside":
				return [
					{
						kind: "no-path",
						ref: full,
						reason: candidate.kind,
						changes:
							candidate.kind !== "expression"
								? []
								: ref.tool === "node"
									? input.changed
									: changes,
					},
				];
			case "file": {
				const { file } = candidate;
				if (ref.tool === undefined)
					return [
						{ kind: "unknown", ref: full, file, changed: changed.has(file) },
					];
				return [
					versionCheck(full, ref.tool, file, fallbacks, true, candidate.text),
				];
			}
			default: {
				const unhandled: never = candidate;
				return unhandled;
			}
		}
	};
	const refsOf = (
		action: string | undefined,
		entries: readonly (readonly [string, Given])[],
		fallbacks: readonly string[] = [],
	): PinCheck[] =>
		entries.flatMap(([key, given]) => {
			const known = action === undefined ? undefined : TOOL_ACTIONS[action];
			const ref = {
				input: key,
				action,
				tool: known?.file === key ? known.tool : undefined,
				source: sourceOf(given),
			};
			return resolve(given, 0).flatMap((candidate) =>
				checkOf(candidate, ref, given, fallbacks),
			);
		});
	const pins = scans.flatMap((scan) => [
		...scan.steps.flatMap((step) => {
			if (step.inputs === undefined) return [];
			if (targetsOfStep(step).some((path) => found.has(path))) return [];
			const entries = [...step.inputs].filter(([key]) =>
				VERSION_FILE_INPUT.test(key),
			);
			const action =
				step.local === undefined ? actionName(step.uses) : step.uses;
			const known = TOOL_ACTIONS[action];
			const version =
				known === undefined ? undefined : step.inputs.get(known.version);
			const outcomes = version === undefined ? [] : resolve(version, 0);
			const setsVersion =
				outcomes.length > 0 &&
				outcomes.every(
					(outcome) => outcome.kind === "file" || outcome.kind === "outside",
				);
			const fallbacks =
				known !== undefined && !setsVersion ? known.defaults : [];
			const defaults =
				known !== undefined &&
				fallbacks.length > 0 &&
				(known.file === undefined || !step.inputs.has(known.file))
					? checkOf(
							EMPTY_INPUT,
							{
								input: known.file ?? known.version,
								action,
								tool: known.tool,
								source: sourceOf(step.given),
							},
							step.given,
							fallbacks,
						)
					: [];
			const unread = outcomes.flatMap((outcome): PinCheck[] =>
				outcome.kind === "unreadable"
					? [{ kind: "unreadable", source: sourceOf(outcome.given) }]
					: [],
			);
			return [...unread, ...refsOf(action, entries, fallbacks), ...defaults];
		}),
		...scan.strays.flatMap((stray) =>
			refsOf(undefined, [[stray.input, stray.given]]),
		),
	]);
	const ciChanges = input.changed
		.filter((path) => [...folders].some((folder) => underFolder(path, folder)))
		.map((path): PinCheck => ({ kind: "ci-file", path }));
	const lineOf = ({ source }: Unread) =>
		Number(source.slice(source.lastIndexOf(":") + 1));
	const unreadable = scans.flatMap((scan) =>
		[
			...scan.unreadable.map(
				(source): Unread => ({ kind: "unreadable", source }),
			),
			...scan.forms.map((source): Unread => ({ kind: "form", source })),
		].sort((a, b) => lineOf(a) - lineOf(b)),
	);
	const missing = steps
		.filter(
			(step) =>
				step.local !== undefined &&
				!targetsOfStep(step).some((path) => found.has(path)),
		)
		.map(
			(step): PinCheck => ({
				kind: "no-action",
				source: sourceOf(step.given),
				uses: step.uses,
			}),
		);
	const printed = new Set<string>();
	return [
		...ciChanges,
		...[...notFiles].map((path): PinCheck => ({ kind: "not-a-file", path })),
		...missing,
		...unreadable,
		...pins,
	].filter((check) => {
		if (check.kind !== "unreadable" && check.kind !== "form") return true;
		if (printed.has(check.source)) return false;
		printed.add(check.source);
		return true;
	});
}

type Unread = Extract<PinCheck, { readonly kind: "unreadable" | "form" }>;

export type Pin = { readonly place: string; readonly pin: string };

export type Setup =
	| ({ readonly kind: "set" } & Pin)
	| { readonly kind: "job"; readonly place: string }
	| { readonly kind: "unread"; readonly source: string };

export type Row = Extract<Setup, { readonly kind: "set" | "job" }>;

type Found = { readonly pin: string } | { readonly unread: Given };

const TOOL_INPUT = /^(?:.+[-_])?(?:version|toolchain)(?:[-_]file)?$/i;

const sortedText = (values: Iterable<string>) =>
	[...values].sort().join(" or ");

const byKey = (
	[a]: readonly [string, unknown],
	[b]: readonly [string, unknown],
) => (a < b ? -1 : a > b ? 1 : 0);

const pinOf = (side: Side): string | undefined => {
	if (side.problem !== undefined) return undefined;
	if (side.version !== undefined) return side.version;
	if (side.text !== undefined && side.text !== "") return side.text;
	return side.read ? undefined : "latest";
};

type Caller = {
	readonly file: string;
	readonly step: Step;
	readonly parent: Caller | undefined;
};

const MAX_DEPTH = 5;
const SETUP_LIKE = /^setup-|-setup$|toolchain/;

export function ciSetups(input: {
	readonly ciFiles: readonly string[];
	readonly read: Reader;
}): Setup[] {
	const { scans, resolve, declared } = scanTree(input.ciFiles, input.read);
	const scanOf = new Map(scans.map((scan) => [scan.path, scan]));

	function resolveIn(
		given: Given,
		caller: Caller | undefined,
		depth: number,
	): Candidate[] {
		const value = given.value?.trim();
		const name =
			value === undefined
				? undefined
				: INPUT_EXPRESSION.exec(value)?.[1]?.toLowerCase();
		if (
			caller === undefined ||
			name === undefined ||
			given.file !== caller.file
		)
			return resolve(given, depth);
		const inputs = caller.step.inputs;
		if (depth >= MAX_DEPTH || inputs === undefined)
			return [{ kind: "unreadable", given }];
		const passed = inputs.get(name);
		if (passed !== undefined)
			return resolveIn(passed, caller.parent, depth + 1);
		return (declared.get(caller.file)?.get(name) ?? ["none"]).flatMap(
			(fallback): Candidate[] =>
				fallback === "unreadable"
					? [{ kind: "unreadable", given }]
					: fallback === "none"
						? [EMPTY_INPUT]
						: resolveIn(fallback, caller, depth + 1),
		);
	}

	function textIn(given: Given, caller: Caller | undefined): Found {
		const texts = new Set<string>();
		for (const candidate of resolveIn(given, caller, 0))
			if (candidate.kind === "unreadable") return { unread: candidate.given };
			else texts.add(candidate.kind === "empty" ? "" : candidate.text);
		return { pin: sortedText(texts) };
	}

	function withDetails(
		step: Step,
		caller: Caller | undefined,
		tool: string,
		shown: (key: string) => boolean,
	): Found {
		const details = [step.uses];
		for (const [key, given] of [...(step.inputs ?? [])].sort(byKey)) {
			if (shown(key)) continue;
			const text = textIn(given, caller);
			if ("unread" in text) return text;
			details.push(`${key} ${text.pin}`);
		}
		for (let at: Caller | undefined = caller, own = step; ; ) {
			const condition = own.condition;
			if (condition !== undefined) {
				if (condition.value === undefined) return { unread: condition };
				details.push(`if ${condition.value}`);
				if (at !== undefined && /\binputs\./i.test(condition.value)) {
					const given = [...(at.step.inputs ?? [])].sort(byKey);
					for (const [key, value] of given) {
						const text = textIn(value, at.parent);
						if ("unread" in text) return text;
						details.push(`${key} ${text.pin}`);
					}
				}
			}
			if (at === undefined) break;
			own = at.step;
			at = at.parent;
		}
		return { pin: `${tool} (${details.join(", ")})` };
	}

	function fromFile(known: SetupAction, candidate: Candidate) {
		if (candidate.kind === "empty") {
			const [first, ...rest] = known.defaults;
			if (first === undefined) return "of the runner";
			return pinOf(sideOf(input.read, known.tool, first, rest, false, first));
		}
		if (candidate.kind !== "file") return undefined;
		return pinOf(
			sideOf(
				input.read,
				known.tool,
				candidate.file,
				known.defaults,
				true,
				candidate.text,
			),
		);
	}

	function knownPin(
		step: Step,
		caller: Caller | undefined,
		inputs: ReadonlyMap<string, Given>,
		known: SetupAction,
	): Found {
		const values = new Set<string>();
		const version = inputs.get(known.version);
		let empty = version === undefined;
		for (const outcome of version === undefined
			? []
			: resolveIn(version, caller, 0))
			if (outcome.kind === "file" || outcome.kind === "outside")
				values.add(outcome.text);
			else if (outcome.kind === "empty") empty = true;
			else return { unread: outcome.given };
		const file = known.file === undefined ? undefined : inputs.get(known.file);
		if (empty)
			for (const candidate of file === undefined
				? [EMPTY_INPUT]
				: resolveIn(file, caller, 0)) {
				const pin = fromFile(known, candidate);
				if (pin === undefined)
					return {
						unread:
							"given" in candidate ? candidate.given : (file ?? step.given),
					};
				values.add(pin);
			}
		return values.size === 0
			? { unread: step.given }
			: withDetails(
					step,
					caller,
					`${known.tool} ${sortedText(values)}`,
					(key) => key === known.version || key === known.file,
				);
	}

	function otherPin(
		step: Step,
		caller: Caller | undefined,
		inputs: ReadonlyMap<string, Given>,
	): Found | undefined {
		const parts: string[] = [];
		const named = [...inputs]
			.filter(([key]) => TOOL_INPUT.test(key))
			.sort(byKey);
		for (const [key, given] of named) {
			const texts = new Set<string>();
			for (const candidate of resolveIn(given, caller, 0))
				if (candidate.kind === "empty") texts.add("empty");
				else if (candidate.kind === "file" || candidate.kind === "outside")
					texts.add(candidate.text);
				else return { unread: candidate.given };
			parts.push(`${key} ${sortedText(texts)}`);
		}
		return parts.length === 0
			? undefined
			: withDetails(step, caller, parts.join(", "), (key) =>
					TOOL_INPUT.test(key),
				);
	}

	function entryPin(
		label: string,
		given: Given,
		caller: Caller | undefined,
	): Found {
		const text = textIn(given, caller);
		if ("unread" in text) return text;
		return text.pin.includes("${{")
			? { unread: given }
			: { pin: `${label} ${text.pin}` };
	}

	function jobPins(
		scan: FileScan,
		job: Job | undefined,
		caller: Caller | undefined,
		depth: number,
	): Found[] {
		return [
			...(job?.entries ?? []).map(({ label, given }) =>
				entryPin(label, given, caller),
			),
			...scan.steps
				.filter((step) => step.job === job?.name)
				.flatMap((step) => pinsOf(step, caller, depth)),
		];
	}

	function pinsOf(
		step: Step,
		caller: Caller | undefined,
		depth: number,
	): Found[] {
		if (step.local !== undefined) {
			const called = targetsOfStep(step)
				.map((path) => scanOf.get(path))
				.find((scan) => scan !== undefined);
			if (called === undefined) return [];
			if (depth >= MAX_DEPTH) return [{ unread: step.given }];
			const next: Caller = { file: called.path, step, parent: caller };
			return called.path.startsWith(`${WORKFLOWS}/`)
				? called.jobs.flatMap((job) => jobPins(called, job, next, depth + 1))
				: called.steps.flatMap((inner) => pinsOf(inner, next, depth + 1));
		}
		if (step.reusable)
			return [withDetails(step, caller, "workflow", () => false)];
		const action = actionName(step.uses);
		const known = TOOL_ACTIONS[action];
		const found =
			step.inputs === undefined
				? { unread: step.given }
				: known !== undefined
					? knownPin(step, caller, step.inputs, known)
					: (otherPin(step, caller, step.inputs) ??
						(SETUP_LIKE.test(action.split("/")[1] ?? "")
							? withDetails(step, caller, "default version", () => false)
							: undefined));
		return found === undefined ? [] : [found];
	}

	const rowsOf = (place: string, found: readonly Found[]) =>
		found.map(
			(item): Setup =>
				"unread" in item
					? { kind: "unread", source: sourceOf(item.unread) }
					: { kind: "set", place, pin: item.pin },
		);

	return scans
		.filter((scan) => scan.path.startsWith(`${WORKFLOWS}/`))
		.flatMap((scan) => [
			...scan.jobs.flatMap((job): Setup[] => {
				const place = `${scan.path}#${job.name}`;
				return [
					{ kind: "job", place },
					...rowsOf(place, jobPins(scan, job, undefined, 0)),
				];
			}),
			...rowsOf(scan.path, jobPins(scan, undefined, undefined, 0)),
		]);
}

type Pins = readonly string[];

export type PlaceChange =
	| { readonly kind: "same"; readonly place: string; readonly pins: Pins }
	| {
			readonly kind: "changed";
			readonly place: string;
			readonly base: Pins;
			readonly head: Pins;
	  }
	| {
			readonly kind: "added";
			readonly place: string;
			readonly pins: Pins;
			readonly missing: Pins;
			readonly removed: readonly string[];
	  }
	| { readonly kind: "removed"; readonly place: string; readonly pins: Pins };

function byPlace(rows: readonly Row[]): Map<string, string[]> {
	const places = new Map<string, string[]>();
	for (const row of rows)
		places.set(row.place, [
			...(places.get(row.place) ?? []),
			...(row.kind === "set" ? [row.pin] : []),
		]);
	return places;
}

export function compareSetups(
	base: readonly Row[],
	head: readonly Row[],
): PlaceChange[] {
	const before = byPlace(base);
	const after = byPlace(head);
	const known = new Set(
		base.flatMap((row) => (row.kind === "set" ? [row.pin] : [])),
	);
	const removed = [...before]
		.filter(([place, pins]) => pins.length > 0 && !after.has(place))
		.map(([place]) => place)
		.sort();
	return [...new Set([...before.keys(), ...after.keys()])]
		.sort()
		.map((place): PlaceChange => {
			const was = before.get(place);
			const now = after.get(place);
			if (now === undefined) return { kind: "removed", place, pins: was ?? [] };
			if (was === undefined)
				return {
					kind: "added",
					place,
					pins: now,
					missing: [...new Set(now.filter((pin) => !known.has(pin)))],
					removed: now.length === 0 ? [] : removed,
				};
			return was.length === now.length &&
				was.every((pin, index) => pin === now[index])
				? { kind: "same", place, pins: now }
				: { kind: "changed", place, base: was, head: now };
		});
}

export function changesTool(change: PlaceChange): boolean {
	switch (change.kind) {
		case "same":
		case "removed":
			return false;
		case "changed":
			return true;
		case "added":
			return change.missing.length > 0 || change.removed.length > 0;
		default: {
			const unhandled: never = change;
			return unhandled;
		}
	}
}

export function stopsRun(check: PinCheck): boolean {
	switch (check.kind) {
		case "ci-file":
		case "unreadable":
		case "form":
		case "no-action":
		case "not-a-file":
			return true;
		case "no-path":
			return (
				check.reason === "outside" ||
				check.ref.tool === undefined ||
				check.changes.length > 0
			);
		case "unknown":
			return check.changed;
		case "version":
			if (check.base.problem !== undefined || check.head.problem !== undefined)
				return true;
			if (!check.required && !check.base.read && !check.head.read) return false;
			return (
				check.changed &&
				(check.base.version === undefined ||
					check.head.version === undefined ||
					check.base.version !== check.head.version)
			);
		default: {
			const unhandled: never = check;
			return unhandled;
		}
	}
}
