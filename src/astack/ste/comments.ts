import { addedUnits } from "../comments/added.ts";
import { isCheckedPath, type SourceChange } from "../comments/check.ts";
import {
	type Classification,
	type CommentPolicy,
	classify,
} from "../comments/classify.ts";
import { languageOf } from "../comments/lexer.ts";
import type { CommentLine } from "../comments/units.ts";
import { checkText } from "./check.ts";
import type { Finding, Glossary } from "./types.ts";

const JSDOC_TAG = /^@[A-Za-z]/;

function kept(classification: Classification): boolean {
	switch (classification.verdict) {
		case "deny":
			return false;
		case "keep":
			return (
				classification.rule === "doc-contract" ||
				classification.rule === "linked-constraint"
			);
		case "judge":
			return classification.rule === "judge" || classification.rule === "todo";
	}
}

export function keptCommentFindings(
	change: SourceChange,
	policy: CommentPolicy,
	glossary: Glossary,
): readonly Finding[] | undefined {
	const language = languageOf(change.relPath);
	if (!language || !isCheckedPath(change.relPath)) return [];
	const added = addedUnits(change.before, change.after, language, change);
	if (!added) return undefined;
	const context = { language, relPath: change.relPath, ...policy };
	return added.flatMap(({ unit, newLines }) => {
		if (!kept(classify(unit, context))) return [];
		const lines = newLines
			.map((index) => unit.lines[index])
			.filter(
				(line): line is CommentLine =>
					line !== undefined && !JSDOC_TAG.test(line.text),
			);
		if (lines.length === 0) return [];
		const report = checkText(lines.map((line) => line.text).join("\n"), {
			surface: "comment",
			enforcement: "deny",
			glossary,
		});
		return report.findings.map((finding) => ({
			...finding,
			line: lines[finding.line - 1]?.line ?? unit.startLine,
		}));
	});
}
