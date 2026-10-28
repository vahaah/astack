import { MANAGED_PATHS } from "../../src/astack/managed.ts";
import {
	UPSTREAM_NAMES,
	UPSTREAMS,
	type UpstreamName,
	upstreamLicense,
	upstreamOrigin,
} from "./upstreams.ts";

export type UpstreamUse = {
	readonly upstream: UpstreamName;
	readonly use: string;
};

export const upstreamUses = {
	principles: {
		upstream: "pstack",
		use: "a short form of its principle skills",
	},
	sicko: {
		upstream: "pstack",
		use: "four sections that it quotes verbatim from agents/comment-sicko.md",
	},
	keepList: {
		upstream: "pstack",
		use: "the comment keep list of its fallback, adapted from agents/comment-sicko.md",
	},
	setup: {
		upstream: "mattpocock-skills",
		use: "text adapted from skills/engineering/setup-matt-pocock-skills",
	},
} as const satisfies Record<string, UpstreamUse>;

export type Sourced = {
	readonly path: string;
	readonly content: string;
	readonly sources?: readonly UpstreamUse[];
};

export function noticeReference(sources: readonly UpstreamUse[]): string {
	const names = [
		...new Set(sources.map((source) => UPSTREAMS[source.upstream].label)),
	];
	return `This file holds text from ${names.join(" and ")} under the MIT License. \`${MANAGED_PATHS.notice}\` holds the copyright notice and the permission notice.`;
}

export function withNoticeReference<T extends Sourced>(artifact: T): T {
	if (artifact.sources === undefined || artifact.sources.length === 0)
		return artifact;
	const body = artifact.content.endsWith("\n")
		? artifact.content
		: `${artifact.content}\n`;
	return {
		...artifact,
		content: `${body}\n${noticeReference(artifact.sources)}\n`,
	};
}

export function renderNotice(
	artifacts: readonly Sourced[],
): string | undefined {
	const sections = UPSTREAM_NAMES.flatMap((upstream) => {
		const uses = artifacts.flatMap((artifact) =>
			(artifact.sources ?? [])
				.filter((source) => source.upstream === upstream)
				.map((source) => `- ${artifact.path}: ${source.use}`),
		);
		if (uses.length === 0) return [];
		return [
			`${UPSTREAMS[upstream].label}, from ${upstreamOrigin(upstream)}:`,
			"",
			...uses,
			"",
			upstreamLicense(upstream).trimEnd(),
			"",
		];
	});
	if (sections.length === 0) return undefined;
	return [
		"Third-party notices",
		"",
		"astack apply writes the files listed below into this repo. They hold text from other projects under the MIT License. The copyright notice and the permission notice of each project follow its list.",
		"",
		...sections,
	].join("\n");
}
