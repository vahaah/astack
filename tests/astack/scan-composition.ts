import { unitsOf } from "../../src/astack/comments/added.ts";
import {
	type LanguageId,
	type LexResult,
	lex,
} from "../../src/astack/comments/lexer.ts";
import type { CommentUnit } from "../../src/astack/comments/units.ts";
import { type Scan, scan } from "../../src/astack/types/scan.ts";

export const sourceScanArrows = {
	scan: scan satisfies (source: string, jsx: boolean) => Scan | undefined,
	lex: lex satisfies (source: string, language: LanguageId) => LexResult,
	unitsOf: unitsOf satisfies (
		source: string,
		language: LanguageId,
	) => CommentUnit[] | undefined,
};
