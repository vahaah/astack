import {
	type Blob,
	changesTool,
	checkCiPins,
	ciSetups,
	compareSetups,
	type PinCheck,
	type PlaceChange,
	type Reader,
	type Row,
	type Side,
	stopsRun,
	type VersionRef,
} from "../../../ci-pins.ts";
import { readBlobs, repoRoot, runGit } from "../../../git.ts";
import { valueAfter } from "../../args.ts";
import type { Command } from "../../command.ts";
import { type Io, usageError } from "../../io.ts";

const NAME = "astack check ci-pins";

function gitLines(root: string, args: string[]): string[] | undefined {
	const result = runGit(root, args);
	return result.ok
		? result.stdout.toString("utf8").split("\0").filter(Boolean)
		: undefined;
}

class GitReadError extends Error {}

function readerAt(root: string, commit: string): Reader {
	return (path): Blob => {
		const listed = runGit(root, ["ls-tree", "-z", commit, "--", path]);
		if (!listed.ok)
			throw new GitReadError(`git cannot list ${path} at ${commit}`);
		const entry = listed.stdout.toString("utf8").split("\0")[0] ?? "";
		if (entry === "") return { kind: "missing" };
		const [mode, type] = entry.split(/\s/);
		if (type !== "blob" || (mode !== "100644" && mode !== "100755"))
			return { kind: "other" };
		const text = readBlobs(root, [`${commit}:${path}`]).get(
			`${commit}:${path}`,
		);
		if (text === undefined)
			throw new GitReadError(`git cannot read ${path} at ${commit}`);
		return { kind: "file", text };
	};
}

function isCiFile(path: string): boolean {
	return (
		(path.startsWith(".github/workflows/") && /\.ya?ml$/i.test(path)) ||
		(path.startsWith(".github/actions/") && /(?:^|\/)action\.ya?ml$/.test(path))
	);
}

const inputOf = (ref: VersionRef) =>
	`the ${ref.input}${ref.action === undefined ? "" : ` of ${ref.action}`}`;

const at = (ref: VersionRef) =>
	`${ref.source}${ref.via === undefined ? "" : `, given at ${ref.via}`}`;

const of = (ref: VersionRef) => `${inputOf(ref)} at ${at(ref)}`;

function unresolved(check: Extract<PinCheck, { kind: "no-path" }>): string {
	const { ref } = check;
	const start = `${at(ref)}: ${inputOf(ref)} is ${ref.given}, which`;
	if (check.reason === "outside")
		return `${start} is not a file path in the repo.`;
	const why =
		ref.tool === undefined
			? "astack cannot tell which files the action reads."
			: check.changes.length === 0
				? "The PR changes no file that the action can read a version from."
				: `The PR changes ${check.changes.join(", ")}, which the action can read a version from.`;
	return `${start} astack cannot resolve to a file. ${why}`;
}

const fileState = (changed: boolean) =>
	changed ? "The PR changes the file." : "The PR does not change the file.";

function conclusion(check: Extract<PinCheck, { kind: "version" }>): string {
	if (check.base.problem !== undefined || check.head.problem !== undefined)
		return "astack cannot read the file that CI reads.";
	if (!check.changed) return fileState(false);
	if (!check.required && !check.base.read && !check.head.read)
		return `${check.ref.action} reads no version on each side, so it gets the latest ${check.tool} on each side.`;
	if (check.base.version === undefined || check.head.version === undefined)
		return "astack cannot read an exact version on each side.";
	return check.base.version === check.head.version
		? "The version is the same."
		: "The version changes.";
}

function lineOf(check: PinCheck): string {
	switch (check.kind) {
		case "ci-file":
			return `${check.path}: the PR changes this CI file.`;
		case "unreadable":
			return `${check.source}: astack cannot read this line, which names a version-file input or a local action.`;
		case "form":
			return `${check.source}: astack does not read this YAML form, so it cannot tell what CI reads.`;
		case "no-action":
			return `${check.source}: astack cannot read ${check.uses}, because the repo has no file there that the runner reads.`;
		case "not-a-file":
			return `${check.path}: astack cannot read this CI file, because it is not a regular file.`;
		case "no-path":
			return unresolved(check);
		case "unknown":
			return `${check.file}: astack reads no version from ${of(check.ref)}. ${fileState(check.changed)}`;
		case "version": {
			const shown = ({ version, from, problem }: Side) => {
				const value =
					problem === "missing"
						? "no file"
						: problem === "not a regular file"
							? "no regular file"
							: problem === "another file"
								? `${check.tool} from another file`
								: version === undefined
									? `no exact ${check.tool} version`
									: `${check.tool} ${version}`;
				return `${value}${from === check.file ? "" : ` in ${from}`}`;
			};
			return `${check.file}: ${shown(check.base)} at the base, ${shown(check.head)} at the head, from ${of(check.ref)}. ${conclusion(check)}`;
		}
		default: {
			const unhandled: never = check;
			return unhandled;
		}
	}
}

const listed = (pins: readonly string[]) =>
	pins.length === 0 ? "no tool" : pins.join(", ");

function placeLine(change: PlaceChange): string {
	const start = `${change.place}: CI sets up`;
	switch (change.kind) {
		case "same":
			return `${start} ${listed(change.pins)} at the base and at the head.`;
		case "changed":
			return `${start} ${listed(change.base)} at the base and ${listed(change.head)} at the head, so the PR changes a tool version.`;
		case "added":
			return change.missing.length > 0
				? `${start} ${listed(change.pins)} at the head only, and CI at the base sets up ${listed(change.missing)} in no job or action, so the PR changes a tool version.`
				: change.removed.length > 0
					? `${start} ${listed(change.pins)} at the head only, and the PR also removes ${change.removed.join(", ")}, so a tool version can move from one job to another.`
					: `${start} ${listed(change.pins)} at the head only, and CI at the base sets up each of them in another job or action.`;
		case "removed":
			return `${start} ${listed(change.pins)} at the base only.`;
		default: {
			const unhandled: never = change;
			return unhandled;
		}
	}
}

type Setups =
	| { readonly kind: "read"; readonly rows: readonly Row[] }
	| { readonly kind: "unread"; readonly lines: readonly string[] };

function ciFilesAt(root: string, commit: string): string[] {
	const tracked = gitLines(root, [
		"ls-tree",
		"-r",
		"--name-only",
		"-z",
		commit,
		"--",
		".github/workflows",
		".github/actions",
	]);
	if (tracked === undefined)
		throw new GitReadError(`git cannot list the CI files of ${commit}`);
	return tracked.filter(isCiFile);
}

function setupsAt(root: string, commit: string, side: string): Setups {
	const ciFiles = ciFilesAt(root, commit);
	const read = readerAt(root, commit);
	const stops = checkCiPins({
		changed: [],
		ciFiles,
		readBase: read,
		readHead: read,
	})
		.filter(stopsRun)
		.map(lineOf);
	const setups = ciSetups({ ciFiles, read });
	const unread = setups.flatMap((setup) =>
		setup.kind === "unread"
			? [
					`${setup.source}: astack cannot read the tool version that this step gets, so it cannot tell whether the PR changes it.`,
				]
			: [],
	);
	const lines = [...stops, ...unread].map(
		(line) => `CI at the ${side}: ${line}`,
	);
	return lines.length > 0
		? { kind: "unread", lines }
		: {
				kind: "read",
				rows: setups.flatMap((setup) =>
					setup.kind === "unread" ? [] : [setup],
				),
			};
}

function run(args: readonly string[], io: Io): number {
	const base = valueAfter(args, "--base");
	if (typeof base !== "string")
		return usageError(io, `${NAME}: give --base <ref>`);
	const top = repoRoot(io.cwd);
	if (top === undefined)
		return usageError(io, `${NAME}: not inside a git repository`);
	const found = runGit(top, ["merge-base", base, "HEAD"]);
	const baseCommit = found.stdout.toString("utf8").trim();
	if (!found.ok || baseCommit === "")
		return usageError(
			io,
			`${NAME}: git finds no merge base of ${base} and HEAD`,
		);
	const tip = runGit(top, ["rev-parse", "--verify", `${base}^{commit}`]);
	const tipCommit = tip.stdout.toString("utf8").trim();
	if (!tip.ok || tipCommit === "")
		return usageError(io, `${NAME}: git cannot find the commit of ${base}`);
	const changedBetween = (from: string, to: string): string[] => {
		const changed = gitLines(top, [
			"diff",
			"--name-only",
			"--no-renames",
			"-z",
			from,
			to,
		]);
		if (changed === undefined)
			throw new GitReadError(
				`git cannot list the files that change between ${from} and ${to}`,
			);
		return changed;
	};
	const checksBetween = (
		from: string,
		to: string,
		changed: readonly string[] = changedBetween(from, to),
	): PinCheck[] =>
		checkCiPins({
			changed,
			ciFiles: ciFilesAt(top, to),
			readBase: readerAt(top, from),
			readHead: readerAt(top, to),
		});
	let checks: PinCheck[];
	let moved: PinCheck[];
	let tools: readonly string[] = [];
	let proof = false;
	try {
		const changed = changedBetween(baseCommit, "HEAD");
		checks = checksBetween(baseCommit, "HEAD", changed);
		moved =
			tipCommit === baseCommit
				? []
				: checksBetween(baseCommit, tipCommit).filter(stopsRun);
		const stops = checks.filter(stopsRun);
		const ciPaths = new Set(
			checks.flatMap((check) => (check.kind === "ci-file" ? [check.path] : [])),
		);
		const outside = changed.filter((path) => !ciPaths.has(path));
		const ciChangeOnly =
			stops.length > 0 &&
			moved.length === 0 &&
			stops.every((check) => check.kind === "ci-file");
		if (ciChangeOnly && outside.length > 0)
			tools = outside.map(
				(path) =>
					`${path}: the PR also changes this file, which is not a CI file, so the run cannot go on in mode ci_proof.`,
			);
		else if (ciChangeOnly) {
			const before = setupsAt(top, baseCommit, "base");
			const after = setupsAt(top, "HEAD", "head");
			if (before.kind === "read" && after.kind === "read") {
				const changes = compareSetups(before.rows, after.rows);
				tools = changes
					.filter(
						(change) =>
							!(
								(change.kind === "same" || change.kind === "removed") &&
								change.pins.length === 0
							),
					)
					.map(placeLine);
				proof = !changes.some(changesTool);
			} else
				tools = [before, after].flatMap((side) =>
					side.kind === "unread" ? side.lines : [],
				);
		}
	} catch (error) {
		if (error instanceof GitReadError)
			return usageError(io, `${NAME}: ${error.message}`);
		throw error;
	}
	for (const check of checks) io.out(`${lineOf(check)}\n`);
	for (const check of moved)
		io.out(
			`${base} moves after the merge base, and a pull_request run tests the merge: ${lineOf(check)}\n`,
		);
	for (const line of tools) io.out(`${line}\n`);
	if (proof) {
		io.out(
			"ci_proof: the PR changes CI and no tool version that CI sets up, so only CI on the head of the PR can prove it\n",
		);
		return 3;
	}
	if (checks.some(stopsRun) || moved.length > 0) {
		io.out(
			"stop: only CI can prove this PR, for the reason in each line above\n",
		);
		return 1;
	}
	io.out(
		"ok: the PR changes no CI file and no tool version that CI reads from a file\n",
	);
	return 0;
}

export const command: Command = {
	name: "ci-pins",
	summary:
		"Compares what CI reads between the merge base of <ref> and HEAD. It reads each workflow, each action under .github/actions and each local action that they use, at HEAD. Exits 1 when the diff changes a file that a -version-file input names and the version that the setup action reads from it changes. Exits 1 too when it cannot read an exact version from such a file on each side, or cannot read the input. When the PR changes only CI files, it reads the tool versions that each job or action of CI sets up at the merge base and at HEAD. A tool version is the version that setup-bun, setup-cli or setup-node gets, or the value of an input named version or toolchain, also with a prefix and a -file suffix, each with - or _. The pin of such a step also holds its uses value with the ref, each other input and its if. Each job also holds its runner, its container and service images and the ref of a remote reusable workflow that it calls. A remote action whose name looks like a setup action holds its ref, also with no version input. It does not read a tool that a run step or a script installs. The tool versions of a local action or a local reusable workflow count in the job that calls it, in step order and with the inputs of that call only. Exits 3 with a last line that starts with ci_proof: when each job that both sides hold sets up the same versions in the same order, and a new job sets up only versions that the merge base sets up. A job that loses its last setup step changes. When the PR also removes a job that sets up a tool, a new job with a tool is a change. Exits 1 when a tool version changes, or when it cannot read one on each side. A PR that also changes a file outside CI exits 1, because a red gate can then come from that file. It also exits 1 on each YAML form that it does not read with certainty. A local action that the repo does not hold stops it too. It resolves an input of a local action to the value that each caller gives, or to its default. In a workflow an input can also be empty, because a pull_request run gives no inputs. An input that it cannot resolve to a file stops only when the PR changes a file that the action can read. It prints each version file with its tool and both versions. When <ref> moves after the merge base, it compares the merge base with <ref> in the same way, because a pull_request run tests the merge. A stop there stops the check too.",
	usage: "check ci-pins --base <ref>",
	run,
};
