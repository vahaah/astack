import { HashMatcher } from "../../deny-list.ts";
import { denyStore, readDenyList } from "../../deny-store.ts";
import { bodyText } from "../../gh.ts";
import { githubSlug, runGit } from "../../git.ts";
import {
	type BodyFile,
	type OutboundCall,
	type OutboundTarget,
	type OutboundWrite,
	outboundWrites,
} from "../../outbound.ts";
import {
	type ReadVisibility,
	type Visibility,
	visibilityWithGh,
} from "../../pr/github.ts";
import { PUBLIC_REPO } from "../../public-repo.ts";
import { shellSteps } from "../../shell.ts";
import { stagedReader } from "../body-reader.ts";
import {
	ALLOW,
	type Context,
	combineAll,
	defineHandler,
	deny,
	type Env,
	type EventOf,
	type Handler,
	projectDirOf,
	type Verdict,
} from "../events.ts";

type OutboundEvent = EventOf<"shell" | "mcp">;

const PASSES: ReadonlySet<Visibility> = new Set(["private", "internal"]);

type ReadBody = (file: BodyFile) => string | undefined;

function callOf(event: OutboundEvent, env: Env, dir: string): OutboundCall {
	switch (event.kind) {
		case "shell":
			return { kind: "shell", command: event.command, cwd: event.cwd, env };
		case "mcp":
			return {
				kind: "mcp",
				server: event.server,
				tool: event.tool,
				input: event.input,
				dir,
			};
	}
}

function remoteSlugs(dir: string): string[] {
	const result = runGit(dir, [
		"config",
		"--get-regexp",
		"^remote\\..*\\.(push)?url$",
	]);
	const lines = result.ok ? result.stdout.toString("utf8").split("\n") : [];
	const slugs = lines.flatMap((line) => {
		const slug = githubSlug(line.slice(line.indexOf(" ") + 1));
		return slug === undefined ? [] : [slug];
	});
	return [...new Set(slugs)];
}

function targetSlugs(target: OutboundTarget): readonly string[] | undefined {
	switch (target.kind) {
		case "named":
			return [target.slug];
		case "remotes": {
			const slugs = remoteSlugs(target.dir);
			return slugs.length === 0 ? undefined : slugs;
		}
		case "unknown":
			return undefined;
	}
}

function exposed(
	target: OutboundTarget,
	dir: string,
	visibility: ReadVisibility,
): readonly string[] {
	const slugs = targetSlugs(target);
	if (slugs === undefined) return ["an unknown repo (unknown)"];
	return slugs.flatMap((slug) => {
		const seen =
			slug === PUBLIC_REPO.toLowerCase() ? "public" : visibility(slug, dir);
		return PASSES.has(seen) ? [] : [`${slug} (${seen})`];
	});
}

function bodyReader(event: OutboundEvent): ReadBody {
	switch (event.kind) {
		case "shell": {
			const steps = shellSteps(event.command, event.cwd);
			return ({ path, step }) => bodyText(stagedReader(steps, step)(path));
		}
		case "mcp":
			return () => undefined;
	}
}

function writeVerdict(
	write: OutboundWrite,
	matcher: HashMatcher,
	dir: string,
	visibility: ReadVisibility,
	read: ReadBody,
): Verdict {
	if (write.unread) {
		const targets = exposed(write.target, dir, visibility);
		if (targets.length > 0)
			return deny(
				[
					`astack blocked ${write.subject}, because astack cannot read its body from piped stdin or a variable file.`,
					`- Public or unknown targets: ${targets.join(", ")}`,
					"Write the body in the command or in a file, or let the owner post it.",
				].join("\n"),
			);
	}
	const texts = [
		...write.texts,
		...write.bodyFiles.flatMap((file) => {
			const text = read(file);
			return text === undefined ? [] : [text];
		}),
	];
	const prefixes = [
		...new Set(texts.flatMap((text) => matcher.listedPrefixes(text))),
	];
	if (prefixes.length === 0) return ALLOW;
	const targets = exposed(write.target, dir, visibility);
	if (targets.length === 0) return ALLOW;
	return deny(
		[
			`astack blocked ${write.subject}, because its text holds a name of the outbound deny list.`,
			`- Hash prefixes: ${prefixes.join(", ")}`,
			`- Public or unknown targets: ${targets.join(", ")}`,
			"Take the name out of the text, or let the owner post it.",
		].join("\n"),
	);
}

function run(
	event: OutboundEvent,
	context: Context,
	visibility: ReadVisibility,
): Verdict {
	const dir = projectDirOf(context);
	const writes = outboundWrites(callOf(event, context.env, dir));
	if (writes.length === 0) return ALLOW;
	const list = readDenyList(denyStore(context.env));
	if (!list.ok)
		return combineAll(
			writes.map((write) =>
				deny(
					`astack blocked ${write.subject}, because it cannot read the outbound deny list at ${list.error.path}: ${list.error.message}. Run bun run deny sync.`,
				),
			),
		);
	if (list.value.kind === "none") return ALLOW;
	const matcher = new HashMatcher(list.value.hashes);
	const read = bodyReader(event);
	return combineAll(
		writes.map((write) => writeVerdict(write, matcher, dir, visibility, read)),
	);
}

function failedVerdict(event: OutboundEvent, error: unknown): Verdict {
	const cause = error instanceof Error ? error.message : String(error);
	return combineAll(
		outboundWrites(callOf(event, {}, "")).map((write) =>
			deny(
				`astack blocked ${write.subject}, because the outbound guard failed with "${cause}", so astack cannot examine its text. Let the owner post it.`,
			),
		),
	);
}

export function outbound(visibility: ReadVisibility): Handler {
	return defineHandler({
		id: "outbound",
		on: ["shell", "mcp"],
		failed: failedVerdict,
		run: (event, context) => run(event, context, visibility),
	});
}

export const handler = outbound(visibilityWithGh);
