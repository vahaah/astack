import { isStandaloneComment } from "./classify.ts";
import { type LanguageId, lex } from "./lexer.ts";
import {
	type CommentUnit,
	commentUnits,
	normalizeCommentText,
} from "./units.ts";

export interface Region {
	start: number;
	end: number;
}

export interface EditResult {
	content: string;
	regions: Region[];
}

export function applyEdit(
	current: string | undefined,
	oldString: string,
	newString: string,
	replaceAll: boolean,
): EditResult | undefined {
	if (current === undefined) {
		return oldString === ""
			? { content: newString, regions: [{ start: 0, end: newString.length }] }
			: undefined;
	}
	if (oldString === "") return undefined;
	const positions: number[] = [];
	for (
		let at = current.indexOf(oldString);
		at >= 0;
		at = current.indexOf(oldString, at + oldString.length)
	) {
		positions.push(at);
		if (!replaceAll && positions.length > 1) return undefined;
	}
	if (positions.length === 0) return undefined;
	const regions: Region[] = [];
	let content = "";
	let cursor = 0;
	for (const at of positions) {
		content += current.slice(cursor, at);
		regions.push({
			start: content.length,
			end: content.length + newString.length,
		});
		content += newString;
		cursor = at + oldString.length;
	}
	content += current.slice(cursor);
	return { content, regions };
}

export function unitsOf(
	source: string,
	language: LanguageId,
): CommentUnit[] | undefined {
	const result = lex(source, language);
	if (!result.complete) return undefined;
	return commentUnits(source, result.comments, isStandaloneComment);
}

export interface AddedUnit {
	unit: CommentUnit;
	newLines: number[];
}

export interface ChangeScope {
	regions?: Region[];
	addedLines?: Set<number>;
}

function inScope(unit: CommentUnit, scope: ChangeScope): boolean {
	if (scope.regions) {
		return scope.regions.some((region) =>
			region.start === region.end
				? false
				: unit.start < region.end && unit.end > region.start,
		);
	}
	if (scope.addedLines) {
		for (let line = unit.startLine; line <= unit.endLine; line++)
			if (scope.addedLines.has(line)) return true;
		return false;
	}
	return true;
}

export function addedUnits(
	before: string | undefined,
	after: string,
	language: LanguageId,
	scope: ChangeScope,
): AddedUnit[] | undefined {
	const afterUnits = unitsOf(after, language);
	if (!afterUnits) return undefined;
	const known = new Set<string>();
	if (before !== undefined) {
		const beforeUnits = unitsOf(before, language);
		if (!beforeUnits) return undefined;
		for (const unit of beforeUnits)
			for (const line of unit.lines)
				if (line.text) known.add(normalizeCommentText(line.text));
	}
	const added: AddedUnit[] = [];
	for (const unit of afterUnits) {
		if (!inScope(unit, scope)) continue;
		const newLines = unit.lines.flatMap((line, index) => {
			if (!line.text || known.has(normalizeCommentText(line.text))) return [];
			if (
				scope.addedLines &&
				!scope.regions &&
				!scope.addedLines.has(line.line)
			)
				return [];
			return [index];
		});
		if (newLines.length > 0) added.push({ unit, newLines });
	}
	return added;
}

export interface DiffFile {
	path: string;
	oldPath: string | undefined;
	added: Set<number>;
}

function diffPath(header: string, prefix: string): string | undefined {
	const value = header.replace(/\t.*$/, "");
	if (value === "/dev/null") return undefined;
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
	const files: DiffFile[] = [];
	let current: DiffFile | undefined;
	let oldPath: string | undefined;
	let deleted = false;
	let nextLine = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("diff --git ")) {
			current = undefined;
			oldPath = undefined;
			deleted = false;
			continue;
		}
		if (line.startsWith("--- ")) {
			oldPath = diffPath(line.slice(4), "a/");
			continue;
		}
		if (line.startsWith("+++ ")) {
			const path = diffPath(line.slice(4), "b/");
			deleted = path === undefined;
			if (path !== undefined) {
				current = { path, oldPath, added: new Set() };
				files.push(current);
			}
			continue;
		}
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			nextLine = Number(hunk[1]);
			continue;
		}
		if (!current || deleted) continue;
		if (line.startsWith("+")) {
			current.added.add(nextLine);
			nextLine++;
		} else if (line.startsWith(" ")) {
			nextLine++;
		}
	}
	return files;
}
