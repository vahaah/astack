import type { FileReport, Rise, Severity } from "./check.ts";
import type { HatchKind } from "./syntax.ts";

export const LABELS: Readonly<Record<HatchKind, string>> = {
	any: "`any` type",
	cast: "unsafe cast",
	"non-null": "non-null assertion `!`",
	"ts-ignore": "`@ts-ignore`",
	"ts-nocheck": "`@ts-nocheck`",
	"ts-expect-error": "`@ts-expect-error`",
	"banned-type": "`Function`, `Object` or `{}` type",
	enum: "`enum`",
	extends: "class inheritance",
};

const FIXES: Readonly<Record<HatchKind, string>> = {
	any: "Use `unknown` for data that you did not parse. Then narrow it with a schema or a type guard.",
	cast: [
		"Parse the value where it enters the system, with the schema that owns the shape.",
		"Narrow a value with a type guard, such as `isRecord(value)`.",
		"To pick a variant of a union, switch on its tag and end the switch with `const unhandled: never = value`.",
		"Use `satisfies` to check a literal against a type. `as const` is allowed.",
	].join(" "),
	"non-null":
		"Handle the case where the value is absent. Return `T | undefined` or a `Result`, and let the caller handle it. In Effect code, use `Option`. Give a list that must have an item the type `NonEmpty<T>`. Set a class field in the constructor, or give it the type `T | undefined`.",
	"ts-ignore": "Fix the type error. Do not tell the compiler to ignore it.",
	"ts-nocheck":
		"Fix the type errors. Do not turn off type checks for the file.",
	"ts-expect-error":
		"Fix the type error. A negative type test goes in a `*.test-d.ts` file, where `@ts-expect-error` is allowed.",
	"banned-type":
		"Use a precise type. Write a function type such as `(input: Input) => Output` for `Function`. Write `Record<string, unknown>` or `object` for `Object` and `{}`.",
	enum: 'Use a union of string literals: `const ROLES = ["admin", "member"] as const` and `type Role = (typeof ROLES)[number]`.',
	extends:
		"Model variants as a discriminated union, and share behavior with functions. astack allows `Error` subclasses, React components and the Effect class helpers as a base.",
};

const SHAPE_FIXES: Readonly<Record<string, string>> = {
	"json-parse":
		"`JSON.parse` returns `any`, so parse its result with the schema.",
	"response-json":
		"`response.json()` returns data that nobody checked, so parse it with the schema.",
	double:
		"A double cast through `unknown` hides the error on both sides. Fix the types instead.",
	angle: "An angle-bracket cast `<T>value` is a cast too.",
};

const MAX_LISTED = 12;

function shapeNote(rise: Rise): string {
	if (rise.kind !== "cast") return "";
	const shapes = new Set(rise.found.map((found) => found.detail));
	return [...shapes]
		.flatMap((shape) => {
			const fix = SHAPE_FIXES[shape];
			return fix ? [fix] : [];
		})
		.join(" ");
}

function riseLines(
	reports: readonly FileReport[],
	severity: Severity,
): { lines: string[]; kinds: Set<HatchKind>; notes: Set<string> } {
	const lines: string[] = [];
	const kinds = new Set<HatchKind>();
	const notes = new Set<string>();
	let listed = 0;
	let hidden = 0;
	for (const report of reports)
		for (const rise of report.rises) {
			if (rise.severity !== severity) continue;
			kinds.add(rise.kind);
			const note = shapeNote(rise);
			if (note) notes.add(note);
			lines.push(
				`- ${report.relPath}: ${LABELS[rise.kind]}, ${rise.after} now and ${rise.before} before.`,
			);
			for (const found of rise.found) {
				if (listed >= MAX_LISTED) {
					hidden++;
					continue;
				}
				listed++;
				lines.push(`  - line ${found.line}: ${found.quote}`);
			}
		}
	if (hidden > 0) lines.push(`- ${hidden} more lines are not shown.`);
	return { lines, kinds, notes };
}

function fixLines(
	kinds: ReadonlySet<HatchKind>,
	notes: ReadonlySet<string>,
): string[] {
	return [
		...[...kinds].map((kind) => `${LABELS[kind]}: ${FIXES[kind]}`),
		...notes,
	];
}

const COUNT_RULE =
	"astack compares the count of each pattern in the file before and after the change. An old line that you move or touch does not count.";

const EXEMPTIONS =
	"A generated file is exempt. A repo can exempt a kernel file with a `types.allow` entry in `.astack/profile.json` that gives the paths, the kinds and a reason. The `astack:types` skill gives each rule with an example.";

export function typeDenyMessage(
	subject: string,
	reports: readonly FileReport[],
): string {
	const denied = riseLines(reports, "deny");
	const advised = riseLines(reports, "advise");
	return [
		`astack blocked ${subject}. It adds code that hides type errors from the compiler.`,
		...denied.lines,
		"How to fix it:",
		...fixLines(denied.kinds, denied.notes),
		...(advised.lines.length > 0
			? [
					"Also review these:",
					...advised.lines,
					...fixLines(advised.kinds, advised.notes),
				]
			: []),
		COUNT_RULE,
		EXEMPTIONS,
	].join("\n");
}

export function typeAdviceMessage(reports: readonly FileReport[]): string {
	const advised = riseLines(reports, "advise");
	return [
		"astack: this change adds type code to review.",
		...advised.lines,
		...fixLines(advised.kinds, advised.notes),
		"A repo can allow a base class with `types.extendsAllow` in `.astack/profile.json`.",
	].join("\n");
}
