import {
	CURSOR_EVENTS,
	parseCursorEvent,
} from "../../src/astack/hook/decode/cursor.ts";
import {
	DEFAULT_GLOSSARY,
	denied,
	checkText as steCheck,
} from "../../src/astack/ste/check.ts";
import { findingLine } from "../../src/astack/ste/format.ts";
import { type Build, HOOKS_PATH } from "./build.ts";
import { tryFrontmatter, type Values } from "./frontmatter.ts";
import { validateJson } from "./json-schema.ts";
import { ofPlugin } from "./source.ts";
import { AGENTSKILLS_ROOT } from "./targets/agentskills.ts";
import {
	CLAUDE_ROOT,
	CODEX_POLICY,
	claudePlugin,
	codexPolicyPath,
} from "./targets/claude-code.ts";
import { CODEX_ROOT, FRAGMENT_LIMIT } from "./targets/codex.ts";
import { CURSOR_ROOT, cursorHookCommand } from "./targets/cursor.ts";
import { GROK_ROOT } from "./targets/grok-bot.ts";
import { CLI_PATH, SHEBANG } from "./targets/root.ts";
import { type FileTree, isText, sameBytes, textOf } from "./tree.ts";

export const CLAUDE_HOOKS_SHA256 =
	"2f0728aa403abc57c5b5b0ee821e133fe1b6a91ddbc6589cc5c99b12b2afc2bb";

export type CheckReport = {
	readonly id: string;
	readonly errors: readonly string[];
	readonly summary: string;
};

function text(tree: FileTree, path: string): string | undefined {
	const entry = tree.get(path);
	return entry === undefined ? undefined : textOf(entry);
}

function json(tree: FileTree, path: string): unknown {
	const found = text(tree, path);
	if (found === undefined) return undefined;
	try {
		return JSON.parse(found);
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkMirror(tree: FileTree, build: Build): CheckReport {
	const errors: string[] = [];
	let compared = 0;
	for (const { name: plugin } of build.marketplace.plugins) {
		const source = ofPlugin(build.source.plugins, plugin);
		const expected = claudePlugin(build, plugin);
		const prefix = `${CLAUDE_ROOT}/${plugin}/`;
		for (const [path, entry] of expected) {
			compared++;
			const copy = tree.get(`${prefix}${path}`);
			if (copy === undefined || !sameBytes(copy, entry))
				errors.push(
					`${prefix}${path} differs from marketplace/plugins/${plugin}/${path}${source.get(path) === entry ? "" : " with its build stamp"}`,
				);
		}
		const policies = new Set(
			ofPlugin(build.components, plugin).skills.map((skill) =>
				codexPolicyPath(skill.name),
			),
		);
		for (const [path, entry] of tree) {
			if (!path.startsWith(prefix)) continue;
			const relpath = path.slice(prefix.length);
			if (source.has(relpath)) continue;
			if (!policies.has(relpath) || textOf(entry) !== CODEX_POLICY)
				errors.push(`${path} is not in marketplace/plugins/${plugin}`);
		}
	}
	return {
		id: "claude-mirror",
		errors,
		summary: `${compared} files of marketplace/plugins match ${CLAUDE_ROOT}/`,
	};
}

export function checkHooksPin(build: Build, pinned: string): CheckReport {
	const errors =
		build.hooksSha256 === pinned
			? []
			: [
					`marketplace/plugins/astack/${HOOKS_PATH} has sha256 ${build.hooksSha256}, but scripts/dist/checks.ts pins ${pinned}. Codex trusts a hook by its hash, so a change turns the Codex checks off until the owner trusts the hooks again. Change hooks.json only on purpose, then update CLAUDE_HOOKS_SHA256.`,
				];
	return {
		id: "hooks-pin",
		errors,
		summary: `hooks.json sha256 ${build.hooksSha256.slice(0, 12)}`,
	};
}

export function checkCursorManifests(
	tree: FileTree,
	schemas: { readonly plugin: unknown; readonly marketplace: unknown },
): CheckReport {
	const errors: string[] = [];
	const marketplace = json(tree, ".cursor-plugin/marketplace.json");
	errors.push(
		...validateJson(schemas.marketplace, marketplace).map(
			(error) => `.cursor-plugin/marketplace.json${error}`,
		),
	);
	const entries =
		isRecord(marketplace) && Array.isArray(marketplace.plugins)
			? marketplace.plugins
			: [];
	for (const entry of entries) {
		if (!isRecord(entry) || typeof entry.source !== "string") continue;
		const manifestPath = `${entry.source}/.cursor-plugin/plugin.json`;
		const manifest = json(tree, manifestPath);
		if (manifest === undefined) {
			errors.push(`${manifestPath} is missing or not JSON`);
			continue;
		}
		errors.push(
			...validateJson(schemas.plugin, manifest).map(
				(error) => `${manifestPath}${error}`,
			),
		);
		if (isRecord(manifest) && manifest.name !== entry.name)
			errors.push(`${manifestPath} name does not match the marketplace entry`);
		for (const key of ["skills", "agents", "rules", "hooks"]) {
			const target = isRecord(manifest) ? manifest[key] : undefined;
			if (typeof target !== "string") continue;
			const path = `${entry.source}/${target.replace(/^\.\//, "")}`;
			if (![...tree.keys()].some((file) => file.startsWith(path)))
				errors.push(
					`${manifestPath} ${key} points at ${target}, which is empty`,
				);
		}
	}
	return {
		id: "cursor-manifests",
		errors,
		summary: `${entries.length} Cursor plugin(s) checked against the pinned schemas`,
	};
}

export function checkCursorHooks(tree: FileTree): CheckReport {
	const errors: string[] = [];
	const path = `${CURSOR_ROOT}/hooks/hooks.json`;
	const parsed = json(tree, path);
	if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.hooks))
		return {
			id: "cursor-hooks",
			errors: [`${path} is not version 1`],
			summary: "",
		};
	const events = Object.keys(parsed.hooks);
	for (const event of events) {
		const known = parseCursorEvent(event);
		const entries = parsed.hooks[event];
		if (known === undefined) {
			errors.push(`${path}: the CLI does not decode ${event}`);
			continue;
		}
		if (!Array.isArray(entries) || entries.length !== 1) {
			errors.push(`${path}: ${event} needs exactly one entry`);
			continue;
		}
		const [entry] = entries;
		if (!isRecord(entry) || entry.command !== cursorHookCommand(known))
			errors.push(`${path}: ${event} does not run ${cursorHookCommand(known)}`);
		if (known === "stop" && isRecord(entry) && entry.loop_limit !== 1)
			errors.push(`${path}: stop needs loop_limit 1`);
	}
	for (const event of CURSOR_EVENTS)
		if (!events.includes(event)) errors.push(`${path}: no ${event} entry`);
	for (const file of ["bin/astack", "bin/astack.js", "bin/package.json"]) {
		const entry = tree.get(`${CURSOR_ROOT}/${file}`);
		if (entry === undefined) errors.push(`${CURSOR_ROOT}/${file} is missing`);
		else if (file === "bin/astack" && !entry.executable)
			errors.push(`${CURSOR_ROOT}/${file} is not executable`);
	}
	return {
		id: "cursor-hooks",
		errors,
		summary: `${events.length} Cursor hook events, each decoded by the CLI`,
	};
}

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AGENTSKILLS_KEYS = ["name", "description", "license", "metadata"];
const FLAT_KEYS = [
	"name",
	"description",
	"disable-model-invocation",
	"metadata",
];

function skillErrors(
	path: string,
	folder: string,
	values: Values,
	keys: readonly string[],
): string[] {
	const errors: string[] = [];
	const name = values.name;
	const description = values.description;
	if (typeof name !== "string" || name !== folder)
		errors.push(`${path}: name must equal the folder name ${folder}`);
	if (!SKILL_NAME.test(folder) || folder.length > 64)
		errors.push(
			`${path}: ${folder} is not a kebab-case name of 64 characters or fewer`,
		);
	if (typeof description !== "string" || description.trim() === "")
		errors.push(`${path}: description is empty`);
	else if (description.length > 1024)
		errors.push(
			`${path}: description has ${description.length} characters, over 1024`,
		);
	for (const key of Object.keys(values))
		if (!keys.includes(key))
			errors.push(`${path}: key ${key} is not allowed here`);
	const metadata = values.metadata;
	if (
		metadata !== undefined &&
		(!isRecord(metadata) ||
			Object.values(metadata).some((value) => typeof value !== "string"))
	)
		errors.push(`${path}: metadata must map strings to strings`);
	return errors;
}

export function checkFlatSkills(
	tree: FileTree,
	root: string,
	keys: readonly string[] = FLAT_KEYS,
): CheckReport {
	const errors: string[] = [];
	const skill = new RegExp(`^${root}/skills/([^/]+)/SKILL\\.md$`);
	let count = 0;
	for (const [path, entry] of tree) {
		const match = skill.exec(path);
		if (!match?.[1]) continue;
		count++;
		const parsed = tryFrontmatter(textOf(entry), path);
		if (typeof parsed === "string") {
			errors.push(parsed);
			continue;
		}
		errors.push(...skillErrors(path, match[1], parsed.values, keys));
		const lines = parsed.body.split("\n").length;
		if (lines > 500) errors.push(`${path}: body has ${lines} lines, over 500`);
	}
	if (count === 0) errors.push(`${root}/skills holds no skill`);
	return {
		id: `skills ${root}`,
		errors,
		summary: `${count} skills in ${root}/skills`,
	};
}

export function checkAgentSkills(tree: FileTree): CheckReport {
	return checkFlatSkills(tree, AGENTSKILLS_ROOT, AGENTSKILLS_KEYS);
}

export function checkFragments(tree: FileTree): CheckReport {
	const errors: string[] = [];
	const sizes: string[] = [];
	for (const path of [
		`${CODEX_ROOT}/AGENTS.fragment.md`,
		`${AGENTSKILLS_ROOT}/AGENTS.fragment.md`,
	]) {
		const entry = tree.get(path);
		if (entry === undefined) {
			errors.push(`${path} is missing`);
			continue;
		}
		sizes.push(`${path} ${entry.bytes.length} bytes`);
		if (entry.bytes.length > FRAGMENT_LIMIT)
			errors.push(
				`${path} has ${entry.bytes.length} bytes, over ${FRAGMENT_LIMIT}`,
			);
	}
	return { id: "fragments", errors, summary: sizes.join(", ") };
}

export function checkGrokBot(tree: FileTree): CheckReport {
	const errors: string[] = [];
	for (const path of [
		`${GROK_ROOT}/skills/astack-sync/SKILL.md`,
		`${GROK_ROOT}/skills/astack-rules/SKILL.md`,
		`${GROK_ROOT}/VERSION`,
	])
		if (!tree.has(path)) errors.push(`${path} is missing`);
	for (const path of tree.keys())
		if (path.startsWith(`${GROK_ROOT}/`) && /\/hooks\/|\.mdc$/.test(path))
			errors.push(`${path}: the Grok Bot build ships no hooks or rule files`);
	return {
		id: "grok-bot",
		errors,
		summary: "astack-sync, astack-rules and VERSION present",
	};
}

export function checkPackage(tree: FileTree, build: Build): CheckReport {
	const errors: string[] = [];
	const manifest = json(tree, "package.json");
	const bin =
		isRecord(manifest) && isRecord(manifest.bin)
			? manifest.bin.astack
			: undefined;
	if (bin !== CLI_PATH)
		errors.push(`package.json bin.astack must be ${CLI_PATH}`);
	if (isRecord(manifest) && manifest.version !== build.version)
		errors.push(`package.json version must be ${build.version}`);
	const cli = tree.get(CLI_PATH);
	if (cli === undefined || !cli.executable || !textOf(cli).startsWith(SHEBANG))
		errors.push(
			`${CLI_PATH} must be executable and start with ${SHEBANG.trim()}`,
		);
	return {
		id: "package",
		errors,
		summary: `package astack ${build.version}, bin ${CLI_PATH}`,
	};
}

export function checkText(tree: FileTree): CheckReport {
	const errors = [...tree]
		.filter(
			([path, entry]) => /\.(?:md|mdc|json)$/.test(path) && !isText(entry),
		)
		.map(([path]) => `${path} is not text`);
	return { id: "text", errors, summary: `${tree.size} files` };
}

export const OWN_DIST_TEXT = [
	"README.md",
	`${CODEX_ROOT}/README.md`,
	`${CURSOR_ROOT}/README.md`,
	`${GROK_ROOT}/README.md`,
	`${AGENTSKILLS_ROOT}/README.md`,
	`${GROK_ROOT}/skills/astack-sync/SKILL.md`,
];

export function checkOwnText(tree: FileTree): CheckReport {
	const errors = OWN_DIST_TEXT.flatMap((path) => {
		const found = text(tree, path);
		if (found === undefined) return [`${path} is missing`];
		return denied(
			steCheck(found, {
				surface: "doc",
				enforcement: "deny",
				glossary: DEFAULT_GLOSSARY,
			}),
		).map((finding) => `${path}: ${findingLine(finding)}`);
	});
	return {
		id: "ste",
		errors,
		summary: `${OWN_DIST_TEXT.length} files of astack text in dist pass the STE deny rules`,
	};
}
