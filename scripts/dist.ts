import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	type CheckReport,
	CLAUDE_HOOKS_SHA256,
	checkAgentSkills,
	checkCursorHooks,
	checkCursorManifests,
	checkFlatSkills,
	checkFragments,
	checkGrokBot,
	checkHooksPin,
	checkMirror,
	checkOwnText,
	checkPackage,
	checkText,
} from "./dist/checks.ts";
import { claudeValidate, cliSmoke, codexProbe } from "./dist/external.ts";
import { lintClaudeTerms } from "./dist/lint.ts";
import { type Rendered, render } from "./dist/render.ts";
import { ofPlugin, readSource } from "./dist/source.ts";
import { CURSOR_ROOT } from "./dist/targets/cursor.ts";
import { GROK_ROOT } from "./dist/targets/grok-bot.ts";
import { writeTree } from "./dist/tree.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
export const ALLOW_FILE = join(REPO_ROOT, "scripts/dist/claude-terms.allow");
const SCHEMAS = join(REPO_ROOT, "upstream/cursor-plugin-schemas/schemas");

const USAGE = `usage: bun scripts/dist.ts [--out <dir>] [--no-external]

Builds dist/ from marketplace/ and rules/: the Claude Code marketplace, the Cursor
plugin, the Codex files, the Grok Bot skills, the Agent Skills bundle and the CLI
package. Then it checks each target. --no-external skips the checks that run
claude, codex and node.`;

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8"));
}

function claudeTermsReport(rendered: Rendered): CheckReport {
	const result = lintClaudeTerms(
		rendered.tree,
		readFileSync(ALLOW_FILE, "utf8"),
	);
	return {
		id: "claude-terms",
		errors: [
			...result.errors,
			...result.unallowed.map(
				(residual) =>
					`${residual.relpath}:${residual.line}: ${residual.patternId}: ${residual.text.trim().slice(0, 160)}`,
			),
			...result.unused.map(
				(entry) =>
					`claude-terms.allow:${entry.lineNumber}: ${entry.glob}:${entry.regex.source} matches nothing`,
			),
		],
		summary: `${result.allowed} allowed Claude terms in the flat targets`,
	};
}

export function staticChecks(rendered: Rendered): CheckReport[] {
	const { tree, build } = rendered;
	return [
		checkMirror(tree, build),
		checkHooksPin(build, CLAUDE_HOOKS_SHA256),
		checkCursorManifests(tree, {
			plugin: readJson(join(SCHEMAS, "plugin.schema.json")),
			marketplace: readJson(join(SCHEMAS, "marketplace.schema.json")),
		}),
		checkCursorHooks(tree),
		checkFlatSkills(tree, CURSOR_ROOT),
		checkFlatSkills(tree, GROK_ROOT),
		checkAgentSkills(tree),
		checkFragments(tree),
		checkGrokBot(tree),
		checkPackage(tree, build),
		checkText(tree),
		checkOwnText(tree),
		claudeTermsReport(rendered),
	];
}

function externalChecks(out: string, rendered: Rendered): CheckReport[] {
	const { components, marketplace } = rendered.build;
	const plugins = marketplace.plugins.map((plugin) => plugin.name);
	return [
		claudeValidate(out, plugins),
		codexProbe(
			out,
			plugins.map((plugin) => ({
				plugin,
				skills: ofPlugin(components, plugin).skills,
			})),
		),
		cliSmoke(out),
	];
}

function print(reports: readonly CheckReport[]): number {
	let errors = 0;
	for (const report of reports) {
		errors += report.errors.length;
		console.log(
			`${report.errors.length > 0 ? "FAIL" : "PASS"} ${report.id}${report.summary ? `: ${report.summary}` : ""}`,
		);
		for (const error of report.errors)
			console.log(`  ${error.replaceAll("\n", "\n    ")}`);
	}
	return errors;
}

function main(): number {
	const { values } = parseArgs({
		options: {
			out: { type: "string" },
			"no-external": { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		console.log(USAGE);
		return 0;
	}
	const out = resolve(values.out ?? join(REPO_ROOT, "dist"));
	const rendered = render(
		readSource({
			marketplace: join(REPO_ROOT, "marketplace"),
			rules: join(REPO_ROOT, "rules"),
		}),
	);
	if (!rendered.ok) {
		for (const error of rendered.error) console.error(error);
		return 1;
	}
	writeTree(out, rendered.value.tree);
	console.log(`dist: ${rendered.value.tree.size} files in ${out}`);
	for (const line of rendered.value.report) console.log(`  ${line}`);
	const errors = print([
		...staticChecks(rendered.value),
		...(values["no-external"] ? [] : externalChecks(out, rendered.value)),
	]);
	console.log(`dist: ${errors} errors`);
	return errors > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main());
