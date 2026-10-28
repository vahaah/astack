import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { repoRoot, runGit } from "../../../git.ts";
import { briefLines, daysOld, readPlan } from "../../../plan/brief.ts";
import {
	checkAgainstBase,
	checkPlan,
	isStale,
	readyToDelete,
} from "../../../plan/check.ts";
import {
	envForFile,
	listPlanFiles,
	planProfileFor,
} from "../../../plan/files.ts";
import { parsePlan } from "../../../plan/parse.ts";
import { TEMPLATES } from "../../../plan/template.ts";
import type { Plan, PlanFinding } from "../../../plan/types.ts";
import { positional, valueAfter } from "../../args.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

function planDirFiles(io: Io): { root: string; files: string[] } {
	const root = repoRoot(io.cwd) ?? io.cwd;
	const dir = join(root, planProfileFor(root).dir);
	return {
		root,
		files: listPlanFiles(dir).map((path) => relative(io.cwd, path) || path),
	};
}

function baseFindings(
	io: Io,
	file: string,
	head: Plan,
	base: string,
	root: string,
	env: Parameters<typeof checkAgainstBase>[2],
): PlanFinding[] | "bad-ref" {
	if (
		!runGit(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).ok
	)
		return "bad-ref";
	const rel = relative(root, resolve(io.cwd, file));
	const shown = runGit(root, ["show", `${base}:${rel}`]);
	if (!shown.ok) return [];
	return checkAgainstBase(
		head,
		parsePlan(head.path, shown.stdout.toString("utf8")),
		env,
	);
}

function formatFinding(finding: PlanFinding): string {
	const prefix = finding.severity === "error" ? "" : `${finding.severity}: `;
	return `${finding.file}:${finding.line}: ${prefix}${finding.message}`;
}

const KNOWN_FLAGS = [
	"--as",
	"--base",
	"--all",
	"--brief",
	"--json",
	"--strict",
	"--no-trail",
];

function run(args: readonly string[], io: Io): number {
	const template = args.find((arg) => arg.startsWith("--template"));
	if (template) {
		const tier = template.split("=")[1] ?? "standard";
		if (tier !== "standard" && tier !== "programme" && tier !== "brief")
			return usageError(
				io,
				"astack check-plan: --template takes standard, programme or brief",
			);
		io.out(TEMPLATES[tier]);
		return 0;
	}
	const base = valueAfter(args, "--base");
	if (base === null)
		return usageError(io, "astack check-plan: --base needs a ref");
	const unknown = args.find(
		(arg) => arg.startsWith("--") && !KNOWN_FLAGS.includes(arg),
	);
	if (unknown)
		return usageError(io, `astack check-plan: unknown flag ${unknown}`);
	const as = valueAfter(args, "--as");
	if (as === null)
		return usageError(io, "astack check-plan: --as needs a docs/plans path");
	let files = positional(args, ["--base", "--as"]);
	if (as !== undefined) return checkAs(io, args, as, files);
	if (args.includes("--brief")) {
		const listed = files.length > 0 ? files : planDirFiles(io).files;
		const lines = briefLines(listed, io.today, io.cwd);
		if (lines.length > 0) io.out(`${lines.join("\n")}\n`);
		return 0;
	}
	const all = args.includes("--all");
	if (all) files = [...new Set([...files, ...planDirFiles(io).files])];
	if (files.length === 0)
		return usageError(
			io,
			"astack check-plan: give one or more plan files, or --all",
		);
	const findings: PlanFinding[] = [];
	const housekeeping: string[] = [];
	for (const file of files) {
		const absolute = resolve(io.cwd, file);
		const plan = readPlan(absolute);
		if (!plan) return usageError(io, `astack check-plan: cannot read ${file}`);
		const env = envForFile(absolute, {
			today: io.today,
			trail: !args.includes("--no-trail"),
		});
		const found = checkPlan(plan, env);
		if (base) {
			const fromBase = baseFindings(io, file, plan, base, env.root, env);
			if (fromBase === "bad-ref")
				return usageError(io, `astack check-plan: ${base} is not a commit`);
			found.push(...fromBase);
		}
		findings.push(...found.map((finding) => ({ ...finding, file })));
		if (all && isStale(plan, io.today))
			housekeeping.push(
				`${file}: stale, reviewed ${daysOld(plan, io.today)} days ago`,
			);
		if (all && readyToDelete(plan))
			housekeeping.push(
				`${file}: every session is done or every milestone exited, so delete it in the closing PR`,
			);
	}
	return report(io, args, findings, housekeeping, files.length);
}

function report(
	io: Io,
	args: readonly string[],
	findings: readonly PlanFinding[],
	housekeeping: readonly string[],
	plans: number,
): number {
	const count = (severity: PlanFinding["severity"]): number =>
		findings.filter((finding) => finding.severity === severity).length;
	const errors = count("error");
	const warnings = count("warning");
	const notes = count("note");
	if (args.includes("--json")) {
		io.out(
			`${JSON.stringify({ findings, housekeeping, errors, warnings, notes }, null, 2)}\n`,
		);
	} else {
		for (const finding of findings) io.out(`${formatFinding(finding)}\n`);
		for (const line of housekeeping) io.out(`${line}\n`);
		io.out(
			`${errors} errors, ${warnings} warnings, ${notes} notes in ${plans} plan${plans === 1 ? "" : "s"}\n`,
		);
	}
	return errors > 0 || (args.includes("--strict") && warnings > 0) ? 1 : 0;
}

function checkAs(
	io: Io,
	args: readonly string[],
	as: string,
	files: readonly string[],
): number {
	const [source, ...rest] = files;
	if (source === undefined || rest.length > 0)
		return usageError(
			io,
			"astack check-plan: --as takes one plan text, a file or - for stdin",
		);
	const text =
		source === "-" ? io.input?.() : readPlanText(resolve(io.cwd, source));
	if (text === undefined)
		return usageError(io, `astack check-plan: cannot read ${source}`);
	const root = repoRoot(io.cwd) ?? io.cwd;
	const target = resolve(root, as);
	const plan = parsePlan(relative(root, target), text);
	const env = envForFile(target, {
		today: io.today,
		trail: !args.includes("--no-trail"),
		root,
		text,
	});
	const findings = checkPlan(plan, env).map((finding) => ({
		...finding,
		file: as,
	}));
	return report(io, args, findings, [], 1);
}

function readPlanText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

export const command: Command = {
	name: "plan",
	summary:
		"Checks plan files. Exits 1 on errors, and on warnings under --strict. A size note never fails.",
	usage: [
		"check plan <file...> [--base <ref>] [--all] [--brief] [--json] [--strict] [--no-trail]",
		"check plan --as docs/plans/<slug>.md <file|-> [--strict] [--no-trail]",
		"check plan --template[=programme|brief]",
	].join("\n"),
	run,
};
