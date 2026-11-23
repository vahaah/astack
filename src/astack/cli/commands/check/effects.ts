import { relative, resolve } from "node:path";
import {
	countLine,
	type EffectPlan,
	effectReport,
	findingLine,
} from "../../../domain/report.ts";
import { repoRoot, runGit } from "../../../git.ts";
import { canonical, readOptional } from "../../../paths.ts";
import { readPlanBlock } from "../../../plan/domain.ts";
import { loadDomainEnv, planProfileFor } from "../../../plan/files.ts";
import { processPorts } from "../../../ports.ts";
import { err, ok, type Result } from "../../../result.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check effects";

type Options = {
	readonly plan: string | undefined;
	readonly base: string | undefined;
	readonly json: boolean;
};

function options(args: readonly string[]): Result<Options, string> {
	let plan: string | undefined;
	let base: string | undefined;
	let json = false;
	for (let at = 0; at < args.length; at++) {
		const arg = args[at] ?? "";
		const value = args[at + 1];
		if (arg === "--json") json = true;
		else if (arg === "--plan" || arg === "--base") {
			if (value === undefined || value === "" || value.startsWith("-"))
				return err(`${arg} needs a value`);
			if ((arg === "--plan" ? plan : base) !== undefined)
				return err(`give ${arg} once`);
			if (arg === "--plan") plan = value;
			else base = value;
			at++;
		} else return err(`unknown argument ${arg}`);
	}
	return ok({ plan, base, json });
}

function mergeBase(root: string, ref: string): Result<string, string> {
	const merged = runGit(root, ["merge-base", `${ref}^{commit}`, "HEAD"]);
	return merged.ok
		? ok(merged.stdout.toString("utf8").trim())
		: err(`${ref} has no merge base with HEAD`);
}

function readPlan(
	root: string,
	io: Io,
	file: string,
): Result<EffectPlan, string> {
	const absolute = resolve(canonical(io.cwd), file);
	const text = readOptional(absolute);
	if (text === undefined) return err(`cannot read the plan ${file}`);
	const path = relative(root, absolute);
	const block = readPlanBlock(path, text);
	return block.ok ? ok({ path, ...block.value }) : block;
}

function run(args: readonly string[], io: Io): number {
	const parsed = options(args);
	if (!parsed.ok) return usageError(io, `${NAME}: ${parsed.error}`);
	const top = repoRoot(io.cwd);
	if (top === undefined)
		return usageError(io, `${NAME}: not inside a git repository`);
	const root = canonical(top);
	const { plan, base, json } = parsed.value;
	const ports = processPorts();
	const domain = loadDomainEnv(
		ports,
		root,
		planProfileFor(ports, root).glossary,
	);
	if (!domain.card.ok)
		return usageError(
			io,
			`${NAME}: ${domain.card.error.map((problem) => problem.message).join("; ")}`,
		);
	const read = plan === undefined ? ok(undefined) : readPlan(root, io, plan);
	if (!read.ok) return usageError(io, `${NAME}: ${read.error}`);
	const commit = base === undefined ? ok(undefined) : mergeBase(root, base);
	if (!commit.ok) return usageError(io, `${NAME}: ${commit.error}`);
	const card = domain.card.value;
	if (card.kind === "none") {
		io.out(
			"effects: no contexts card, the domain fence under ## Contexts of the glossary, so no rule applies\n",
		);
		return 0;
	}
	const report = effectReport({
		root,
		codeRoots: domain.codeRoots,
		card,
		plan: read.value,
		base: commit.value,
		totality: true,
	});
	if (!report.ok) {
		io.err(`${NAME}: ${report.error.message}\n`);
		return 1;
	}
	if (json) io.out(`${JSON.stringify(report.value, null, "\t")}\n`);
	else
		io.out(
			[...report.value.findings.map(findingLine), countLine(report.value)]
				.map((line) => `${line}\n`)
				.join(""),
		);
	return 0;
}

export const command: Command = {
	name: "effects",
	summary:
		"Compares the effect classes of each tracked module under the code roots with the contexts card and a plan domain block. It reads the classes from the value imports and the named globals in the tokens of the types scanner: fs-read, fs-write, spawn, network, env, clock and random. A module gets its own classes and the classes of each module that it imports by value. A module under a pure line has no class, no throw statement and no unsafe cast. A cap port has only the classes of its caps and exports each op. With --plan, a linked step has only the classes of its row, and each abs line names the direct value importers. With --base, a module whose own classes changed since the merge base needs a step link or a cap port of the block. Each rule finding prints as advice, and an unowned module, a cross-context import and an unresolved import print as a report. --json prints the same findings. Exits 0 with findings, 1 when git cannot list the modules, and 2 for a wrong argument, a bad --base, an unreadable --plan or a block or card that does not parse.",
	usage: "check effects [--plan <file>] [--base <ref>] [--json]",
	run,
};
