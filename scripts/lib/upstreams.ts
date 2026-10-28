import { err, ok, type Result } from "../../src/astack/result.ts";

export type Upstream = {
	readonly label: string;
	readonly copyright: string;
	readonly repo: string;
	readonly path: string;
	readonly commit: string;
};

export const UPSTREAMS = {
	pstack: {
		label: "pstack",
		copyright: "Copyright (c) 2026 Lauren Tan",
		repo: "https://github.com/cursor/plugins",
		path: "pstack",
		commit: "1e5c90a4b6f249917bd21fe361b3a2a7deb741b8",
	},
	"mattpocock-skills": {
		label: "mattpocock/skills",
		copyright: "Copyright (c) 2026 Matt Pocock",
		repo: "https://github.com/mattpocock/skills",
		path: ".",
		commit: "49dd158d1076134a641b33efb035946536778336",
	},
	"cursor-team-kit": {
		label: "cursor-team-kit",
		copyright: "Copyright (c) 2026 Cursor",
		repo: "https://github.com/cursor/plugins",
		path: "cursor-team-kit",
		commit: "1e5c90a4b6f249917bd21fe361b3a2a7deb741b8",
	},
} as const satisfies Readonly<Record<string, Upstream>>;

export type UpstreamName = keyof typeof UPSTREAMS;

function isUpstreamName(name: string): name is UpstreamName {
	return Object.hasOwn(UPSTREAMS, name);
}

export const UPSTREAM_NAMES: readonly UpstreamName[] =
	Object.keys(UPSTREAMS).filter(isUpstreamName);

export const MIT_PERMISSION = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export function upstreamLicense(name: UpstreamName): string {
	return `MIT License\n\n${UPSTREAMS[name].copyright}\n\n${MIT_PERMISSION}`;
}

export function upstreamOrigin(name: UpstreamName): string {
	const { repo, path, commit } = UPSTREAMS[name];
	const place = path === "." ? "" : `, path ${path}`;
	return `${repo}${place}, commit ${commit}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function originOf(
	values: Readonly<Record<string, unknown>>,
): Result<readonly UpstreamName[], string> {
	const metadata = values.metadata;
	if (metadata === undefined) return ok([]);
	if (!isRecord(metadata)) return err("metadata must be a map");
	const origin = metadata.origin;
	if (origin === undefined) return ok([]);
	if (typeof origin !== "string")
		return err(
			"metadata.origin must be a string of upstream names with a space between them",
		);
	const names = origin.split(" ").filter((name) => name !== "");
	if (names.length === 0) return err("metadata.origin names no upstream");
	const unknown = names.find((name) => !isUpstreamName(name));
	if (unknown !== undefined)
		return err(
			`metadata.origin names "${unknown}", which is not one of ${UPSTREAM_NAMES.join(", ")}`,
		);
	return ok(names.filter(isUpstreamName));
}

export const AGENT_ORIGINS: Readonly<Record<string, readonly UpstreamName[]>> =
	{
		"marketplace/plugins/astack/agents/comment-judge.md": ["pstack"],
		"marketplace/plugins/astack/agents/delegate.md": ["pstack"],
		"marketplace/plugins/astack/agents/researcher.md": ["mattpocock-skills"],
	};

export const PATH_ORIGINS: Readonly<Record<string, readonly UpstreamName[]>> = {
	"rules/coding.md": ["pstack"],
	"rules/comments.md": ["pstack"],
	"src/astack/orch": ["pstack"],
	"src/astack/plan": ["pstack"],
	"src/astack/watch-pr": ["pstack"],
};

export const STATIC_NOTICE: readonly string[] = [
	`The PR evidence guidance in skills/write-docs is adapted from
skills/engineering/pr/SKILL.md of mattpocock/skills, which credits the show-me
skill by Dex Horthy (Humanlayer).`,
	"ASD-STE100 Simplified Technical English:",
	`astack examines prose with STE rules based on ASD-STE100. astack is not
affiliated with or endorsed by ASD. ASD owns the copyright of the standard.
"ASD-STE100" and "Simplified Technical English" are EU trade mark
No. 017966390.`,
	`astack ships no text from the standard: no dictionary entries, no
definitions, no examples and no word list taken from the dictionary. The
word list of astack (src/astack/ste/words.ts in the astack source repo,
bundled into bin/astack.js) is its own work. Each entry names its basis:
a public statement about STE, the agreement of two public checkers, or a
house rule. astack wrote each example sentence in it. astack never says
that a text is compliant with, or certified to, ASD-STE100.`,
	`The astack build examines astack's own skill, rule, README and doc text
with the STE deny rules, and fails on a finding. It does not examine
third-party text, and astack does not rewrite it. That is the pstack and
flow plugins, and the four sections of the comments rule that quote
pstack's Comment Sicko verbatim.`,
];
