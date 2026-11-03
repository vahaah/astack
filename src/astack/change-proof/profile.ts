import type { ProfileIssue } from "../pr-review-profile.ts";
import { PUBLIC_REPO } from "../public-repo.ts";
import { ENV_ASSIGNMENT, parseShell } from "../shell.ts";

export const PROOF_GATE = "change-proof";

type Raw = Readonly<Record<string, unknown>>;

function isRaw(value: unknown): value is Raw {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pinnedPackage(value: string): boolean {
	const prefix = `github:${PUBLIC_REPO}#`;
	if (!value.startsWith(prefix)) return false;
	return /^(?:v\d+\.\d+\.\d+|[a-f0-9]{40}|[a-f0-9]{64})$/.test(
		value.slice(prefix.length),
	);
}

function cliArgs(values: readonly string[]): readonly string[] | undefined {
	const [launcher = "", script = ""] = values;
	if (launcher === "astack" || launcher.endsWith("/astack"))
		return values.slice(1);
	if (
		(launcher === "bun" || launcher === "node") &&
		/(?:^|\/)(?:astack\.js|astack\/cli\/bin\.ts)$/.test(script)
	)
		return values.slice(2);
	if (launcher === "bunx" || launcher === "npx") {
		const at = values.findIndex(
			(value, index) => index > 0 && !["--bun", "--yes", "-y"].includes(value),
		);
		return at > 0 && pinnedPackage(values[at] ?? "")
			? values.slice(at + 1)
			: undefined;
	}
	return undefined;
}

function proofArgsProblem(args: readonly string[]): string | undefined {
	const rest =
		args[0] === "check-proof"
			? args.slice(1)
			: args[0] === "check" && args[1] === "proof"
				? args.slice(2)
				: undefined;
	if (rest === undefined) return "must run astack check proof";
	let manifests = 0;
	let bases = 0;
	for (let at = 0; at < rest.length; at++) {
		const arg = rest[at] ?? "";
		if (arg === "--base") {
			bases++;
			if (rest[at + 1] === undefined || (rest[at + 1] ?? "").startsWith("-"))
				return "gives --base with no ref";
			at++;
		} else if (arg.startsWith("-"))
			return `passes ${arg}, which the proof gate does not allow`;
		else manifests++;
	}
	if (manifests > 1 || bases > 1)
		return "passes more than one manifest or --base";
	return undefined;
}

function commandProblem(command: unknown): string | undefined {
	if (typeof command !== "string") return "must be a string";
	const simple = parseShell(command);
	const [only] = simple;
	if (simple.length !== 1 || only === undefined)
		return "must be one direct astack check proof command, with no &&, ||, ;, pipe or second command";
	if (only.background === true)
		return "must run the proof command in the foreground";
	if (
		only.redirects.length > 0 ||
		only.stdin !== undefined ||
		only.piped === true
	)
		return "must not redirect or pipe the proof command";
	if (only.words.some((word) => word.dynamic))
		return "must not use a variable or a command substitution";
	const values = only.words.map((word) => word.value);
	if (ENV_ASSIGNMENT.test(values[0] ?? ""))
		return "must not set environment variables before the proof command";
	const args = cliArgs(values);
	if (args === undefined)
		return "must start with astack, a path to its launcher, bun or node with its CLI, or bunx or npx with a pinned GitHub astack release or commit";
	return proofArgsProblem(args);
}

export function proofGateIssues(data: unknown): readonly ProfileIssue[] {
	const gates = isRaw(data) && Array.isArray(data.gates) ? data.gates : [];
	const found = gates.flatMap((gate, index) =>
		isRaw(gate) && gate.name === PROOF_GATE
			? [{ gate, path: `gates[${index}]` }]
			: [],
	);
	const [entry] = found;
	if (found.length === 0 || entry === undefined)
		return [
			{
				path: "gates",
				message: `needs one gate named ${PROOF_GATE} that runs astack check proof`,
			},
		];
	if (found.length > 1)
		return [
			{ path: "gates", message: `names ${PROOF_GATE} ${found.length} times` },
		];
	const { gate, path } = entry;
	const issues: ProfileIssue[] = [];
	if (gate.optional !== undefined && gate.optional !== false)
		issues.push({
			path: `${path}.optional`,
			message: "must be false, because every change needs a checked proof",
		});
	if (
		gate.when_changed !== undefined &&
		!(Array.isArray(gate.when_changed) && gate.when_changed.length === 0)
	)
		issues.push({
			path: `${path}.when_changed`,
			message:
				"must be absent or empty, because the proof gate covers every path",
		});
	const problem = commandProblem(gate.command);
	if (problem !== undefined)
		issues.push({ path: `${path}.command`, message: problem });
	return issues;
}
