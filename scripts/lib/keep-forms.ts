import { unitsOf } from "../../src/astack/comments/added.ts";
import { checkChange, isCheckedPath } from "../../src/astack/comments/check.ts";
import { languageOf } from "../../src/astack/comments/lexer.ts";
import { DEFAULT_LIMITS } from "../../src/astack/comments/limits.ts";
import type { CommentConflict } from "./projects.ts";

export type HookVerdict = "deny" | "advisory" | "allowed";

export const CITATION_GREP = "ADR[- ]?[0-9]+|Source:";

const CITATION = /\bADR[- ]?\d+|^Source:/;

const MAX_SAMPLE = 120;

export function conflictHookVerdict(
	conflict: Pick<CommentConflict, "form" | "sample" | "samplePath">,
	keepPatterns: readonly string[],
): HookVerdict | undefined {
	if (conflict.sample === undefined) return undefined;
	const relPath = conflict.samplePath ?? "sample.ts";
	const after = `${conflict.sample}\nexport const sample = 1;\n`;
	const findings = checkChange(
		{ relPath, before: undefined, after },
		{
			keep: keepPatterns.map((pattern) => new RegExp(pattern)),
			limits: DEFAULT_LIMITS,
		},
	);
	if (!findings || findings.length === 0) return "allowed";
	return findings.some((finding) => finding.verdict === "deny")
		? "deny"
		: "advisory";
}

export type SourceFile = { readonly path: string; readonly text: string };

export function unkeptCitations(
	files: readonly SourceFile[],
	keepPatterns: readonly string[],
): string[] {
	return files.flatMap((file) => {
		const language = languageOf(file.path);
		if (language === undefined || !isCheckedPath(file.path)) return [];
		return (unitsOf(file.text, language) ?? []).flatMap((unit) =>
			unit.lines.flatMap((line) => {
				if (!CITATION.test(line.text)) return [];
				const sample =
					unit.marker === "/*"
						? `/* ${line.text} */`
						: `${unit.marker} ${line.text}`;
				const verdict = conflictHookVerdict(
					{ form: "decision citation", sample, samplePath: file.path },
					keepPatterns,
				);
				if (verdict === "allowed") return [];
				const shown =
					sample.length > MAX_SAMPLE
						? `${sample.slice(0, MAX_SAMPLE - 1)}…`
						: sample;
				return [
					`${file.path}:${line.line} \`${shown}\` cites a decision, and the comment hook gives ${verdict ?? "no verdict"} for it with the keep patterns ${JSON.stringify(keepPatterns)}. Add a keep pattern for this spelling to projects/<name>.json and the profile, or change the comment.`,
				];
			}),
		);
	});
}
