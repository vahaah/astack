import { err, ok, type Result } from "../../src/astack/result.ts";
import { type Build, prepare } from "./build.ts";
import { capabilityReport } from "./capability.ts";
import type { FlatBuild, FlatTarget } from "./flat.ts";
import type { Source } from "./source.ts";
import { agentSkillsTarget } from "./targets/agentskills.ts";
import { claudeCodeTarget } from "./targets/claude-code.ts";
import { codexTarget } from "./targets/codex.ts";
import { cursorTarget } from "./targets/cursor.ts";
import { grokBotTarget } from "./targets/grok-bot.ts";
import { rootTarget } from "./targets/root.ts";
import { collisions, type FileTree, union } from "./tree.ts";

export type Rendered = {
	readonly build: Build;
	readonly tree: FileTree;
	readonly report: readonly string[];
};

function flatBuild(build: Build, target: FlatTarget): FlatBuild {
	return {
		target,
		version: build.version,
		astackSkills: build.astackSkills,
		licenses: build.licenses,
	};
}

export function renderBuild(build: Build): Result<Rendered, readonly string[]> {
	const trees = [
		rootTarget(build),
		claudeCodeTarget(build),
		cursorTarget(build, flatBuild(build, "cursor")),
		codexTarget(build),
		grokBotTarget(build, flatBuild(build, "grok-bot")),
		agentSkillsTarget(build, flatBuild(build, "agentskills")),
	];
	const repeated = collisions(trees);
	if (repeated.length > 0)
		return err(repeated.map((path) => `two targets write ${path}`));
	return ok({ build, tree: union(trees), report: capabilityReport() });
}

export function render(source: Source): Result<Rendered, readonly string[]> {
	const prepared = prepare(source);
	return prepared.ok ? renderBuild(prepared.value) : prepared;
}
