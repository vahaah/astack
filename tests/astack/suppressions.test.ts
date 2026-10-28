import { describe, expect, test } from "bun:test";
import {
	biomeCategoryVerdict,
	classifySuppression,
	eslintRuleVerdict,
	parseSuppression,
	type SuppressionVerdict,
} from "../../src/astack/comments/suppressions.ts";

describe("classifySuppression", () => {
	const cases: [string, SuppressionVerdict][] = [
		["prettier-ignore", "keep"],
		["dprint-ignore", "keep"],
		["fmt: off", "keep"],
		["@formatter:off", "keep"],
		[
			"biome-ignore lint/style/noNonNullAssertion: the map is filled above",
			"keep",
		],
		["biome-ignore lint/style/useTemplate", "judge"],
		[
			"biome-ignore lint/nursery/useSortedClasses: generated class order",
			"keep",
		],
		["biome-ignore lint/nursery/noFloatingPromises: fire and forget", "judge"],
		["biome-ignore format: aligned matrix", "keep"],
		[
			"biome-ignore assist/source/organizeImports: side-effect import order",
			"keep",
		],
		[
			"biome-ignore-all lint/style/useNamingConvention: wire names from the API",
			"keep",
		],
		["biome-ignore-end lint/style/useNamingConvention", "keep"],
		[
			"biome-ignore lint/correctness/useExhaustiveDependencies: run once",
			"deny",
		],
		[
			"biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until saved",
			"deny",
		],
		[
			"biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized upstream",
			"deny",
		],
		["biome-ignore lint/a11y/useButtonType: native form submit", "judge"],
		["biome-ignore lint/complexity/noForEach: readability", "judge"],
		[
			"biome-ignore lint/performance/noAccumulatingSpread: small arrays",
			"judge",
		],
		["@ts-ignore", "deny"],
		["@ts-nocheck", "deny"],
		["@ts-expect-error the fixture is malformed on purpose", "deny"],
		["eslint-disable-next-line @stylistic/max-len", "keep"],
		[
			"eslint-disable-next-line simple-import-sort/imports, import/order -- grouped by feature",
			"keep",
		],
		["eslint-disable-next-line react-hooks/exhaustive-deps", "judge"],
		["eslint-disable-next-line max-len, no-console", "judge"],
		["eslint-disable", "judge"],
		["eslint-enable", "keep"],
		["noqa: E501", "judge"],
		["type: ignore[attr-defined]", "judge"],
		["istanbul ignore next", "judge"],
		["shellcheck disable=SC2086", "judge"],
		["swiftlint:disable force_cast", "judge"],
		["nolint:errcheck", "judge"],
		["a sentence that mentions prettier", "judge"],
	];
	test.each(cases)("%s -> %s", (text, verdict) => {
		expect(classifySuppression(text)).toBe(verdict);
	});
});

describe("parseSuppression", () => {
	test("returns undefined for prose", () => {
		expect(parseSuppression("the parser ignores blank lines")).toBeUndefined();
	});

	test("reads biome rules and reason", () => {
		expect(
			parseSuppression(
				"biome-ignore lint/style/noParameterAssign: reuse the buffer",
			),
		).toEqual({
			tool: "biome",
			rules: ["lint/style/noParameterAssign"],
			reason: "reuse the buffer",
			verdict: "keep",
		});
	});

	test("reads eslint rules and the -- reason", () => {
		expect(
			parseSuppression("eslint-disable-line quotes -- JSON fixture"),
		).toEqual({
			tool: "eslint",
			rules: ["quotes"],
			reason: "JSON fixture",
			verdict: "keep",
		});
	});
});

describe("rule tables", () => {
	test.each([
		["lint/style/useConst", "keep"],
		["lint/correctness/noUnusedVariables", "deny"],
		["lint/suspicious/noExplicitAny", "deny"],
		["lint/security/noGlobalEval", "deny"],
		["lint/correctness/useExhaustiveDependencies(foo)", "deny"],
		["lint/nursery/useExplicitType", "keep"],
		["lint/plugin", "judge"],
		["lint", "judge"],
		["syntax/correctness/noTypeOnlyImportAttributes", "judge"],
	] as const)("biome %s -> %s", (category, verdict) => {
		const expected: SuppressionVerdict = verdict;
		expect(biomeCategoryVerdict(category)).toBe(expected);
	});

	test.each([
		["@stylistic/indent", "keep"],
		["perfectionist/sort-objects", "keep"],
		["import/order", "keep"],
		["import/no-cycle", "judge"],
		["no-console", "judge"],
		["@typescript-eslint/no-explicit-any", "judge"],
	] as const)("eslint %s -> %s", (rule, verdict) => {
		const expected: SuppressionVerdict = verdict;
		expect(eslintRuleVerdict(rule)).toBe(expected);
	});
});
