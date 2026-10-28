import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatJson, type Json } from "../../src/astack/json-format.ts";
import { MANAGED_PATHS, mirroredStubPath } from "../../src/astack/managed.ts";
import {
	mergesWithoutCi,
	missingFallbackKeys,
	parseProfile,
	unreadFallbackKeys,
} from "../../src/astack/pr-review-profile.ts";
import { ASTACK_RULES } from "../../src/astack/rules.ts";
import { renderFlowConfig } from "./flow-config.ts";
import {
	renderNotice,
	type UpstreamUse,
	upstreamUses,
	withNoticeReference,
} from "./notices.ts";
import type { ProjectConfig } from "./projects.ts";
import {
	profileDirFor,
	repoRoot,
	reviewProfileLabel,
	reviewProfileName,
} from "./projects.ts";

export type RuleSource = { name: string; content: string };

export type ArtifactKind =
	| "rule"
	| "review-stub"
	| "review-profile"
	| "flow-config"
	| "settings"
	| "astack-profile"
	| "notice";

export type Artifact = {
	path: string;
	kind: ArtifactKind;
	content: string;
	sources?: readonly UpstreamUse[];
};

export type Rendered = { artifacts: Artifact[]; problems: string[] };

export const reviewStubPath = MANAGED_PATHS.reviewStub;
export const astackProfilePath = MANAGED_PATHS.profile;
export const reviewProfilePath = MANAGED_PATHS.reviewProfile;
export const noticePath = MANAGED_PATHS.notice;

export const reviewStubSource = join(
	repoRoot,
	"templates",
	"pr-review-hardening.stub.SKILL.md",
);

export function readRuleSources(root = repoRoot): RuleSource[] {
	const dir = join(root, "rules");
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	return names
		.filter((name) => name.endsWith(".md"))
		.sort()
		.map((name) => ({
			name,
			content: readFileSync(join(dir, name), "utf8"),
		}));
}

function keepPatternSection(patterns: readonly string[]): string[] {
	if (patterns.length === 0) return [];
	return [
		"",
		"## Keep patterns for this repo",
		"",
		"A comment that matches one of these patterns also stays, if it fits the line limit of the coding rule.",
		"",
		...patterns.map((pattern) => `- \`${pattern}\``),
		"",
	];
}

export const userOnlyRules: readonly string[] = ASTACK_RULES.filter(
	(rule) => !rule.repo,
).map(({ name }) => `${name}.md`);

const ruleUpstream: Readonly<Record<string, readonly UpstreamUse[]>> = {
	"coding.md": [upstreamUses.principles],
	"comments.md": [upstreamUses.sicko],
};

export function renderRuleCopies(
	project: ProjectConfig,
	sources: readonly RuleSource[],
): Artifact[] {
	const shared = sources.filter(
		(source) => !userOnlyRules.includes(source.name),
	);
	return shared.map((source) => {
		const extra =
			source.name === "comments.md"
				? keepPatternSection(project.keepPatterns)
				: [];
		const body = source.content.endsWith("\n")
			? source.content
			: `${source.content}\n`;
		const upstream = ruleUpstream[source.name];
		return {
			path: `${project.rulesDir}/${source.name}`,
			kind: "rule",
			content: extra.length === 0 ? body : `${body}${extra.join("\n")}`,
			...(upstream === undefined ? {} : { sources: upstream }),
		};
	});
}

function readOptional(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function profileKeepPatterns(profile: string): string[] | undefined {
	const { data } = parseProfile(profile);
	const comments = isRecord(data) ? data.comments : undefined;
	const patterns = isRecord(comments) ? comments.keep_patterns : undefined;
	return Array.isArray(patterns) &&
		patterns.every((pattern) => typeof pattern === "string")
		? patterns
		: undefined;
}

export function keepPatternMismatch(
	configured: readonly string[],
	inProfile: readonly string[] | undefined,
): string | undefined {
	if (inProfile === undefined) {
		return "the profile has no readable comments.keep_patterns list";
	}
	const same =
		configured.length === inProfile.length &&
		configured.every((pattern, index) => pattern === inProfile[index]);
	return same
		? undefined
		: `keepPatterns in projects/<name>.json (${JSON.stringify(configured)}) differ from comments.keep_patterns in the profile (${JSON.stringify(inProfile)})`;
}

export function stubPaths(project: ProjectConfig): string[] {
	return [
		reviewStubPath,
		...(project.skillMirrors ?? []).map((dir) => mirroredStubPath(dir)),
	];
}

export function renderReviewCopies(
	project: ProjectConfig,
	dir: string,
	stubSource = reviewStubSource,
	branch?: string,
): Rendered {
	const stub = readOptional(stubSource);
	const profile = readOptional(
		join(profileDirFor(dir, branch), reviewProfileName),
	);
	const profileLabel = reviewProfileLabel(project.name, branch);
	const problems: string[] = [];
	const artifacts: Artifact[] = [];
	if (stub === undefined) {
		problems.push(`${stubSource} is missing`);
	} else {
		for (const path of stubPaths(project))
			artifacts.push({
				path,
				kind: "review-stub",
				content: stub,
				sources: [upstreamUses.keepList],
			});
	}
	if (profile === undefined) {
		problems.push(`${profileLabel} is missing`);
	} else {
		artifacts.push({
			path: reviewProfilePath,
			kind: "review-profile",
			content: profile,
		});
		const mismatch = keepPatternMismatch(
			project.keepPatterns,
			profileKeepPatterns(profile),
		);
		if (mismatch !== undefined) {
			problems.push(`${profileLabel}: ${mismatch}`);
		}
		const data = parseProfile(profile).data;
		const missing = missingFallbackKeys(data);
		if (missing.length > 0) {
			problems.push(
				`${profileLabel}: the stub fallback reads ${missing.join(", ")}, which the profile does not define`,
			);
		}
		if (mergesWithoutCi(data))
			problems.push(
				`${profileLabel}: the profile merges after a clean stop, but no line of merge.conditions checks CI on the head. A local version note is advisory only when CI gates the merge. Add a condition that checks CI on the head SHA, or set merge.after_clean_stop to report`,
			);
		const unread = unreadFallbackKeys(data);
		if (unread.length > 0) {
			problems.push(
				`${profileLabel}: the profile sets ${unread.join(", ")} away from the default, but the stub fallback does not follow them. Keep each at its default, or teach the stub to follow it`,
			);
		}
	}
	return { artifacts, problems };
}

function trackerProfile(project: ProjectConfig): Json {
	const { tracker } = project;
	switch (tracker.kind) {
		case "linear":
			return {
				kind: "linear",
				team: tracker.team,
				requirePartOf: tracker.requirePartOf,
			};
		case "github":
			return { kind: "github", requirePartOf: tracker.requirePartOf };
		case "none":
			return { kind: "none", requirePartOf: false };
	}
}

function steProfile(project: ProjectConfig): Json | undefined {
	const { ste } = project;
	if (!ste) return undefined;
	return {
		mode: ste.mode,
		technicalNouns: ste.technicalNouns,
		...(ste.technicalVerbs ? { technicalVerbs: ste.technicalVerbs } : {}),
		...(ste.exclude ? { exclude: ste.exclude } : {}),
		...(ste.headerFields ? { headerFields: ste.headerFields } : {}),
	};
}

export function renderAstackProfile(
	project: ProjectConfig,
	managed?: readonly string[],
): Artifact {
	const ste = steProfile(project);
	const profile: Json = {
		tracker: trackerProfile(project),
		merge: {
			authority: project.merge?.authority ?? "turn",
			...(project.merge?.requireChecks === false
				? { requireChecks: false }
				: {}),
			...(project.merge?.standingBases === undefined
				? {}
				: { standingBases: project.merge.standingBases }),
		},
		...(ste === undefined ? {} : { ste }),
		...(project.hooks === undefined ? {} : { hooks: project.hooks }),
		plan: { glossary: project.domain.glossary, adr: project.domain.adrDir },
		...(project.keepPatterns.length > 0
			? { commentKeep: project.keepPatterns }
			: {}),
		...(managed === undefined ? {} : { managed: [...managed] }),
		...(project.neutralCommit === undefined
			? {}
			: { neutral: { deny: project.lint.denySubstrings } }),
	};
	return {
		path: astackProfilePath,
		kind: "astack-profile",
		content: formatJson(profile),
	};
}

type ArtifactFlags = ProjectConfig["artifacts"];

function renderSet(
	project: ProjectConfig,
	sources: readonly RuleSource[],
	flags: ArtifactFlags,
	reviewDir: string,
	branch?: string,
): Rendered {
	const review = flags.reviewStub
		? renderReviewCopies(project, reviewDir, reviewStubSource, branch)
		: { artifacts: [], problems: [] };
	const copies: Artifact[] = [
		...(flags.rules ? renderRuleCopies(project, sources) : []),
		...(flags.agentDocs
			? renderFlowConfig(project).map(
					(artifact): Artifact => ({
						...artifact,
						sources: [upstreamUses.setup],
					}),
				)
			: []),
		...review.artifacts,
	].map(withNoticeReference);
	const noticeText = renderNotice(copies);
	const notice: Artifact[] =
		noticeText === undefined
			? []
			: [{ path: noticePath, kind: "notice", content: noticeText }];
	const managed = flags.profile
		? [...copies, ...notice]
				.map((artifact) => artifact.path)
				.concat(astackProfilePath)
				.sort()
		: undefined;
	return {
		artifacts: [
			...copies,
			...notice,
			...(flags.profile ? [renderAstackProfile(project, managed)] : []),
		],
		problems: review.problems,
	};
}

export function renderRepoArtifacts(
	project: ProjectConfig,
	sources: readonly RuleSource[],
	reviewDir: string,
	branch?: string,
): Rendered {
	return renderSet(project, sources, project.artifacts, reviewDir, branch);
}

const allArtifacts: ArtifactFlags = {
	rules: true,
	settings: true,
	reviewStub: true,
	agentDocs: true,
	profile: true,
};

export function renderWouldBeArtifacts(
	project: ProjectConfig,
	sources: readonly RuleSource[],
	reviewDir: string,
): Rendered {
	return renderSet(project, sources, allArtifacts, reviewDir);
}
