import { cleanEnv, run } from "./exec.ts";
import type { Gate } from "./projects.ts";

export type GateRun =
	| { status: "skipped"; reason: string }
	| {
			status: "ran";
			argv: string[];
			exitCode: number | null;
			timedOut: boolean;
			output: string;
	  };

export type GateVerdict = {
	name: string;
	verdict: "pass" | "fixed" | "new-failure" | "still-failing" | "skipped";
	detail: string;
	newLines: string[];
};

export function gateArgv(
	gate: Gate,
	writtenJson: readonly string[],
): string[] | undefined {
	if (gate.files !== "written-json") return [...gate.run];
	if (writtenJson.length === 0) return undefined;
	return [...gate.run, ...writtenJson];
}

export async function runGate(
	gate: Gate,
	cwd: string,
	writtenJson: readonly string[],
): Promise<GateRun> {
	const argv = gateArgv(gate, writtenJson);
	if (argv === undefined) {
		return { status: "skipped", reason: "no JSON file to check" };
	}
	const result = await run(argv, {
		cwd,
		timeoutSeconds: gate.timeoutSeconds ?? 900,
		env: cleanEnv({ NO_COLOR: "1", FORCE_COLOR: "0" }),
	});
	return {
		status: "ran",
		argv,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		output: `${result.stdout}\n${result.stderr}`,
	};
}

const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");
const duration = /\b\d+(?:\.\d+)?\s?(?:ms|µs|s|m)\b/g;

export function normalizedLines(output: string): string[] {
	return output
		.replace(ansi, "")
		.split("\n")
		.map((line) => line.replace(duration, "<t>").trim())
		.filter((line) => line !== "");
}

function passed(runResult: GateRun): boolean {
	return runResult.status === "ran" && runResult.exitCode === 0;
}

function tail(lines: readonly string[], count = 30): string[] {
	return lines.slice(Math.max(0, lines.length - count));
}

export function compareGateRuns(
	name: string,
	baseline: GateRun,
	candidate: GateRun,
): GateVerdict {
	if (candidate.status === "skipped") {
		return { name, verdict: "skipped", detail: candidate.reason, newLines: [] };
	}
	const exit = candidate.timedOut
		? "timed out"
		: `exit ${candidate.exitCode ?? "none"}`;
	if (passed(candidate)) {
		const summary = normalizedLines(candidate.output).at(-1);
		return passed(baseline) || baseline.status === "skipped"
			? {
					name,
					verdict: "pass",
					detail: summary === undefined ? exit : `${exit}; ${summary}`,
					newLines: [],
				}
			: {
					name,
					verdict: "fixed",
					detail: `${exit}; failed at baseline`,
					newLines: [],
				};
	}
	const candidateLines = normalizedLines(candidate.output);
	const seen = new Set(
		baseline.status === "ran" ? normalizedLines(baseline.output) : [],
	);
	const added = candidateLines.filter((line) => !seen.has(line));
	if (baseline.status === "skipped" || passed(baseline)) {
		return {
			name,
			verdict: "new-failure",
			detail: `${exit}; passed or did not apply at baseline`,
			newLines: tail(added.length > 0 ? added : candidateLines),
		};
	}
	if (added.length === 0) {
		return {
			name,
			verdict: "still-failing",
			detail: `${exit}; same failure output as baseline, so not caused by apply`,
			newLines: [],
		};
	}
	return {
		name,
		verdict: "new-failure",
		detail: `${exit}; failed at baseline too, and gained ${added.length} output line(s)`,
		newLines: tail(added),
	};
}
