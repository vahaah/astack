import { join } from "node:path";
import {
	type AdrProblem,
	amendProblems,
	type TemplateFacts,
	templateProblems,
	treeProblems,
} from "../../../adr.ts";
import { glossaryTerms } from "../../../change-proof/admission.ts";
import { repoRoot, runGit } from "../../../git.ts";
import { canonical, readOptional } from "../../../paths.ts";
import {
	loadDomainEnv,
	loadGlossary,
	planProfileFor,
} from "../../../plan/files.ts";
import { processPorts } from "../../../ports.ts";
import { andThen, err, ok, type Result } from "../../../result.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";
import { mergeBase, readBaseFolder, readTreeFolder } from "./adr-base.ts";

const NAME = "astack check adr";
const CONTROL = /\[control:([A-Za-z][A-Za-z0-9._-]*)\]/g;

function options(
	args: readonly string[],
): Result<{ readonly base: string | undefined }, string> {
	let base: string | undefined;
	for (let at = 0; at < args.length; at++) {
		const arg = args[at] ?? "";
		const value = args[at + 1];
		if (arg !== "--base") return err(`unknown argument ${arg}`);
		if (value === undefined || value === "" || value.startsWith("-"))
			return err("--base needs a value");
		if (base !== undefined) return err("give --base once");
		base = value;
		at++;
	}
	return ok({ base });
}

function testControls(root: string): ReadonlySet<string> {
	const listed = runGit(root, ["ls-files", "-z", "--", "tests"]);
	const controls = new Set<string>();
	if (!listed.ok) return controls;
	for (const path of listed.stdout.toString("utf8").split("\0")) {
		if (path === "") continue;
		const text = readOptional(join(root, path)) ?? "";
		for (const match of text.matchAll(CONTROL)) controls.add(match[1] ?? "");
	}
	return controls;
}

function templateFacts(root: string): TemplateFacts {
	const ports = processPorts();
	const configured = planProfileFor(ports, root).glossary;
	const domain = loadDomainEnv(ports, root, configured);
	const card =
		domain.card.ok && domain.card.value.kind === "card"
			? domain.card.value
			: undefined;
	const glossary = loadGlossary(ports.files, root, configured);
	return {
		card,
		registry: domain.registry.ok ? domain.registry.value : undefined,
		glossary:
			glossary === undefined
				? undefined
				: {
						path: glossary.paths.join(", "),
						terms: new Set(
							glossary.paths.flatMap((path) => [
								...glossaryTerms(readOptional(join(root, path)) ?? ""),
							]),
						),
					},
		controls: testControls(root),
	};
}

function count(problems: readonly AdrProblem[], files: number): string {
	return `adr: ${problems.length} ${problems.length === 1 ? "problem" : "problems"} in ${files} ADR ${files === 1 ? "file" : "files"}`;
}

function run(args: readonly string[], io: Io): number {
	const parsed = options(args);
	if (!parsed.ok) return usageError(io, `${NAME}: ${parsed.error}`);
	const top = repoRoot(io.cwd);
	if (top === undefined)
		return usageError(io, `${NAME}: not inside a git repository`);
	const root = canonical(top);
	const dir = planProfileFor(processPorts(), root).adr;
	const head = readTreeFolder(root, dir);
	const { base } = parsed.value;
	const lines = (problems: readonly AdrProblem[]) =>
		problems.map((one) => `${one.file}:${one.line}: ${one.message}\n`).join("");
	if (base === undefined) {
		const problems = treeProblems(head);
		io.out(
			`${lines(problems)}${count(problems, head.files.length)}; with no --base, the amend-only and template rules did not run\n`,
		);
		return problems.length === 0 ? 0 : 1;
	}
	const read = andThen(mergeBase(root, base), (commit) =>
		andThen(readBaseFolder(root, dir, commit), (folder) =>
			ok({ commit, folder }),
		),
	);
	if (!read.ok) {
		io.err(`${NAME}: ${read.error.message}\n`);
		return 1;
	}
	const { commit, folder } = read.value;
	const problems = [
		...amendProblems(folder, head),
		...treeProblems(head),
		...templateProblems(folder, head, templateFacts(root)),
	];
	io.out(
		`${lines(problems)}${count(problems, head.files.length)}, from the merge base ${commit.slice(0, 12)} of ${base}\n`,
	);
	return problems.length === 0 ? 0 : 1;
}

export const command: Command = {
	name: "adr",
	summary:
		"Checks the ADR folder of the plan profile, docs/adr by default. Each ADR file needs one Status line with a known status, and one index row in README.md with its link, title and status, and each row needs one file. A Supersedes, Amends or Amended by: relation needs a back link in the other ADR, and each cited decision needs its heading. With --base, it reads the folder at the merge base of the ref and HEAD. An ADR past Proposed at that base then changes only by a dated > Note or > Amended block, a status move to Superseded by or Deprecated in the header, or its Amended by: line. Its proof subsections and its Domain and effects and Invariant audit parts can change. A new ADR needs the header lines and the five parts of the template, a Terms. line that the glossary resolves, and one domain fence or None. with a reason. Its block passes the card, cap and law rules, and each prop law needs a control under tests/. It prints file:line: message lines and a count line. Exits 0 with no problem, 1 with problems or a base that git cannot read, and 2 for a wrong argument.",
	usage: "check adr [--base <ref>]",
	run,
};
