import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unitsOf } from "../../src/astack/comments/added.ts";
import {
	type Classification,
	classify,
	restates,
} from "../../src/astack/comments/classify.ts";
import { languageOf } from "../../src/astack/comments/lexer.ts";
import {
	type CommentLimits,
	DEFAULT_LIMITS,
	limitsFor,
} from "../../src/astack/comments/limits.ts";

function classifyAll(
	path: string,
	source: string,
	keep: RegExp[] = [],
	limits: CommentLimits = DEFAULT_LIMITS,
): Classification[] {
	const language = languageOf(path);
	if (!language) throw new Error(`no language for ${path}`);
	const units = unitsOf(source, language);
	if (!units) throw new Error("lexing failed");
	return units.map((unit) =>
		classify(unit, { language, relPath: path, keep, limits }),
	);
}

function only(path: string, source: string, keep: RegExp[] = []): string {
	const results = classifyAll(path, source, keep);
	expect(results).toHaveLength(1);
	const [result] = results;
	return `${result?.verdict}:${result?.rule}`;
}

function above(comment: string, code = "const value = compute();"): string {
	return `${comment}\n${code}\n`;
}

describe("deny: narration and history", () => {
	test.each([
		"// Billing and tax are now configured from the Integrations page, so they no longer get their own sidebar entries.",
		"// This layout no longer prefetches that key, and nothing below it loses a hydrated value.",
		"// now uses the new cache",
		"// It used to call the legacy endpoint directly.",
		"// The flag used to be a string.",
		"// Previously, the editor dropped every comma.",
		"// The old implementation read each day's job with its own query.",
		"// Before this change the export issued three extra selects.",
		"// Before PRJ-343 this path issued three extra SELECTs.",
		"// Red-first: the preview read each linked day separately.",
		"// We switched to the batch endpoint to cut round trips.",
		"// This PR adds the retry wrapper around the client.",
		"// Now we compute the totals.",
		"// Added retry logic",
		"// Added a retry around the client.",
		"// Changed to use the shared client",
		"// Refactored from the old helper",
		"// Moved from utils.ts",
		"// Updated to handle nulls",
		"// Fix: handle null user",
		"// New implementation using streams",
		"// 2026-10-16: switched to streams",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).toMatch(
			/^deny:(?:narration|provenance)$/,
		);
	});
});

describe("not narration", () => {
	test.each([
		"// Retries stop once the token is no longer valid.",
		"// The presigned URL no longer works after fifteen minutes, so refresh it first.",
		"// The key used to sign requests rotates daily.",
		"// Previously selected rows are cleared on reset.",
		"// Removed entries are skipped.",
		"// Updated rows are returned in id order.",
		"// If we removed the row, the count is stale.",
		"// The reader now uses the cache once the first miss resolves.",
		"// Return the new token to the caller.",
		"// First we must call init, because the SDK requires it before any request.",
		"// Stripe no longer sends source on these webhooks; see https://docs.stripe.com/upgrades.",
		"// Added rows keep their insertion order.",
		"// Moved rows keep their original position.",
		"// New rows start in the draft state.",
		"// 2026-10-16 is the cutover date the vendor announced.",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).not.toMatch(/^deny/);
	});
});

describe("deny: provenance tags", () => {
	test.each([
		"// Support tickets (ABC-139, ADR-0060)",
		"// B14: the per-key token the delta check reads.",
		"// G6 (D11, H3) — consume a day link's claim and compare-and-set the state.",
		"// Placeholder until B06 lands the design system; B04/S2 adds sign-in.",
		"// B38 adds the foreign key.",
		"// Past B33's seven-day lookback.",
		"// Reviewer on PR #334: the nested pages inherited the layout's cards.",
		"// Codex flagged this carrier in the second pass.",
		"// Found in review round 3.",
		"// Addressed review feedback on the parser.",
		"// Hardening finding CX3-P2: lock the verdict row.",
		"// Measured 2026-10-05: zone any answers with zero retention.",
		"// Stated once (P11, 2026-10-02).",
		"// Rule from §9 row 325.",
		"// Mirrors DS-308's fix.",
		"// Copied from acme/lib parser.ts",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).toBe("deny:provenance");
	});
});

describe("not provenance", () => {
	test.each([
		"// Encode as UTF-8 before hashing with SHA-256.",
		"// Dates follow ISO-8601; offsets use RFC-3339.",
		"// S3: bucket names must be lowercase.",
		"// H1 headings get an anchor id.",
		"// Ship p95 latency below 200 ms (P50, P95).",
		"// Invoices issued before 2020-01-01 use the legacy tax rule.",
		"// The vendor sunsets v1 on 2027-01-01.",
		"// Works around KAFKA-12345 in the client library.",
		"// Upstream bug: vercel/next.js#4567 drops the header.",
		"// TODO(ABC-12): drop once the vendor ships v2.",
		"// Regions such as EU-WEST-1 need the regional endpoint.",
		"// Cache entries expire after 30 days (see https://example.com/issues/PRJ-12).",
		"// Use Cloudflare R2: the bucket is S3-compatible.",
		"// The buffer is copied from the input, so the caller keeps its array.",
		"// Adapted from https://stackoverflow.com/a/12345 under CC BY-SA 4.0.",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).not.toBe("deny:provenance");
	});
});

describe("deny: file:line references and the file's own path", () => {
	test.each([
		"// The composer moved to (`note-composer.tsx:162`).",
		"// Matches the check in sync-write-service.ts:826.",
		"// See packages/db/src/queries/docs.ts:L2830-2840.",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).toBe("deny:file-line");
	});

	test.each([
		"// localhost:3000 serves the dev build.",
		"// Redis listens on cache.internal:6379.",
		"// Spec: https://github.com/org/repo/blob/main/src/a.ts#L12",
		"// Uses Node.js streams.",
	])("not a file:line reference: %s", (comment) => {
		expect(only("a.ts", above(comment))).not.toBe("deny:file-line");
	});

	test("denies a header that repeats the path", () => {
		const source =
			"/**\n * Repo path: `apps/web/src/lib/compare.ts`\n */\nexport const compare = 1;\n";
		expect(only("apps/web/src/lib/compare.ts", source)).toBe("deny:own-path");
		expect(
			only(
				"src/lib/compare.ts",
				"// src/lib/compare.ts\nexport const compare = 1;\n",
			),
		).toBe("deny:own-path");
	});

	test("keeps a mention of another file", () => {
		expect(
			only(
				"src/lib/compare.ts",
				"// The parser lives in src/lib/parse.ts.\nconst a = 1;\n",
			),
		).not.toBe("deny:own-path");
	});

	test.each([
		"//   bun tooling/metrics.ts [--root <dir>]",
		"// Standalone: `bun tooling/metrics.ts` prints one line per hit.",
	])("keeps a usage line that runs the file itself: %s", (comment) => {
		expect(only("tooling/metrics.ts", above(comment))).not.toBe(
			"deny:own-path",
		);
	});

	test.each([
		"// tooling/metrics.ts — counts suppressions per PR",
		"/** @file tooling/metrics.ts */",
		"// File: metrics.ts",
	])("denies a path header: %s", (comment) => {
		expect(only("tooling/metrics.ts", above(comment))).toBe("deny:own-path");
	});
});

describe("deny: banners", () => {
	test.each([
		["a.ts", "// ─── Reads ───"],
		["a.ts", "// ───────────────"],
		["a.ts", "/* ========== */"],
		["a.ts", "// -------- helpers --------"],
		["q.sql", "-- ── jobs ──"],
		["q.sql", "-- ── background_jobs ──────────"],
		["a.ts", "// ── a graph read back from JSON ──────────"],
		["q.sql", "------------------------"],
		["a.py", "# ----------"],
		["a.py", "##########"],
	])("%s %s", (path, comment) => {
		expect(only(path, `${comment}\nx = 1\n`)).toBe("deny:banner");
	});

	test.each([
		"// Retry -- but only once.",
		"// a - b - c",
		"// | Column | Meaning |",
		"// MARK: - Helpers",
	])("not a banner: %s", (comment) => {
		expect(only("a.ts", above(comment))).not.toBe("deny:banner");
	});

	test("a markdown underline inside a doc comment is not judged as a banner", () => {
		const source =
			"/**\n * Options\n * -------\n * Retries default to three.\n */\nexport const options = {};\n";
		expect(only("a.ts", source)).not.toBe("deny:banner");
	});
});

describe("deny: commented-out code", () => {
	test.each([
		["a.ts", "// const total = sum(rows);"],
		["a.ts", "// await client.flush()"],
		["a.ts", "// if (cached) {\n//   return cached;\n// }"],
		["a.ts", '// import { legacy } from "./legacy";'],
		["a.ts", "// setTimeout(refresh, 0)"],
		["a.tsx", "{/* <LegacyBanner /> */}"],
		["q.sql", "-- delete from jobs where id = 1;"],
		["a.py", "# import os\n# print(os.environ)"],
		["x.kt", "// val legacy = loadLegacy()\n// legacy.flush()"],
		["x.kt", "// var count: Int = 0"],
		["x.kt", "// fun legacy(): Int {"],
		["cc.go", "// x := load()\n// x.Flush()"],
		["cc.go", "// defer conn.Close()"],
		["cc.go", "// func legacy() error {"],
		["a.swift", "// let cache: [String: Int] = [:]"],
		["a.rs", "// let mut total: u32 = 0;"],
	])("%s %s", (path, comment) => {
		expect(only(path, `${comment}\nconst after = 1;\n`)).toBe(
			"deny:commented-out-code",
		);
	});

	test.each([
		"// Return early when the list is empty.",
		"// See useEffect() for the cleanup order.",
		"// Usage:\n//   const client = createClient();",
		"// e.g. parse(input)",
		"// Note: compact,",
		"// TODO(ABC-1): flush()",
		"// val is the immutable binding here.",
	])("not code: %s", (comment) => {
		expect(only("a.ts", above(comment))).not.toBe("deny:commented-out-code");
	});

	test("a doc comment with an example is not commented-out code", () => {
		const source =
			"/**\n * const x = parse(input);\n */\nexport function parse(input: string) {}\n";
		expect(only("a.ts", source)).not.toBe("deny:commented-out-code");
	});

	test("a delete statement described in prose is not code", () => {
		expect(
			only("q.sql", "-- Delete expired sessions nightly\nselect 1;\n"),
		).not.toBe("deny:commented-out-code");
	});
});

describe("deny: restating", () => {
	test("a doc comment that only paraphrases an exported interface name", () => {
		expect(
			only(
				"a.ts",
				"/** Table of contents configuration. */\nexport interface ExportTableOfContentsConfig {}\n",
			),
		).toBe("deny:restating");
	});

	test("a trailing comment that repeats the literals on its line", () => {
		expect(
			only(
				"a.ts",
				'row({ status: "blocked", blockedFromStatus: "in_progress" }), // in progress, blocked\n',
			),
		).toBe("deny:restating");
	});

	test("a label above a barrel export", () => {
		expect(
			only(
				"a.ts",
				'// Worksheet mapping types\nexport * from "./worksheet-mapping";\n',
			),
		).toBe("deny:restating");
	});

	test("a SQL caption above the assertion it describes", () => {
		expect(
			only(
				"q.sql",
				"-- The rows.\nselect is(count(*), 250::bigint, '250 rows in the table');\n",
			),
		).toBe("deny:restating");
	});

	test.each([
		[
			"/** Whether a pointer event started over one of the hero's own controls. */",
			"function overHeroControl(event: PointerSample): boolean {}",
		],
		["// Still rotated to the back.", "expect(stamps).toHaveLength(3);"],
		[
			"// Must stay sorted for the binary search.",
			"const sorted = items.sort();",
		],
		["// ms", "const timeout = 30_000;"],
		[
			"/** @deprecated Use parseStrict. */",
			"export function parse(input: string) {}",
		],
		["/** Config. @default 3 */", "export const config = 3;"],
	])("not restating: %s", (comment, code) => {
		expect(only("a.ts", `${comment}\n${code}\n`)).not.toBe("deny:restating");
	});

	test("restates compares word stems and known abbreviations", () => {
		expect(
			restates(
				"Table of contents configuration.",
				"export interface ExportTableOfContentsConfig {}",
			),
		).toBe(true);
		expect(restates("The parsed retries", "const retries = parse(raw);")).toBe(
			true,
		);
		expect(restates("The", "const retries = 1;")).toBe(false);
		expect(restates("Retries in seconds", "const retries = 1;")).toBe(false);
	});
});

describe("deny: correctness suppressions", () => {
	test.each([
		"// @ts-ignore",
		"// @ts-expect-error wrong argument type on purpose",
		"/* @ts-nocheck */",
		"// biome-ignore lint/correctness/useExhaustiveDependencies: run once",
		"// biome-ignore lint/suspicious/noExplicitAny: legacy payload",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).toBe("deny:suppression");
	});
});

describe("keep", () => {
	test.each([
		["// SPDX-License-Identifier: MIT", "license"],
		["// Copyright (c) 2025 Example Corp.", "license"],
		[
			"/*\n * Permission is hereby granted, free of charge, to any person obtaining a copy\n */",
			"license",
		],
		["// http://www.apache.org/licenses/LICENSE-2.0", "license"],
		[
			"// Redistribution and use in source and binary forms, with or without",
			"license",
		],
		[
			"// This program is free software: you can redistribute it and/or modify",
			"license",
		],
		["// prettier-ignore", "suppression"],
		[
			"// biome-ignore lint/style/noNonNullAssertion: the map is filled above",
			"suppression",
		],
		["// biome-ignore format: aligned matrix", "suppression"],
		["// eslint-disable-next-line @stylistic/max-len", "suppression"],
		['/// <reference types="vite/client" />', "directive"],
		["// @ts-check", "directive"],
		["/** @jsxImportSource @emotion/react */", "directive"],
		['/* webpackChunkName: "editor" */', "directive"],
		["/** @type {import('vite').UserConfig} */", "directive"],
		[
			"// Safari drops the body on 307 redirects, so we must resend it. https://bugs.webkit.org/show_bug.cgi?id=1",
			"linked-constraint",
		],
	])("%s", (comment, rule) => {
		expect(only("a.ts", above(comment))).toBe(`keep:${rule}`);
	});

	test("a contract doc comment on an exported declaration", () => {
		const source =
			"/** Returns `[]` when no source came from a connector; sorted by id. */\nexport function connectorSources(kb: Kb): Source[] {}\n";
		expect(only("a.ts", source)).toBe("keep:doc-contract");
	});

	test("Go directives and doc comments on exported functions", () => {
		expect(only("main.go", "//go:build linux\npackage main\n")).toBe(
			"keep:directive",
		);
		expect(
			only(
				"main.go",
				"// Parse reads a config and rejects unknown keys.\nfunc Parse(raw []byte) error {}\n",
			),
		).toBe("keep:doc-contract");
	});

	test("project keep patterns override the deny classes", () => {
		const keep = [
			/^\/\/ BOUNDARY-CAST:/,
			/^-- stack lane:/,
			/TODO\(B\d+\/S\d+\)/,
		];
		expect(
			only(
				"a.ts",
				above("// BOUNDARY-CAST: the SDK types this as unknown"),
				keep,
			),
		).toBe("keep:project-keep");
		expect(only("q.sql", "-- stack lane: billing\nselect 1;\n", keep)).toBe(
			"keep:project-keep",
		);
		expect(only("a.ts", above("// TODO(B06/S2): wire sign-in"), keep)).toBe(
			"keep:project-keep",
		);
	});
});

describe("a license word in prose keeps no comment", () => {
	test.each([
		[
			"a title that is no license name",
			"// Driver License\n// Each field of the scanned card maps to one column,\n// and the expiry date maps to the end of the term.",
			"deny:long-comment",
		],
		[
			"a link to a page that is no license",
			"// The grid needs a key from https://docs.vendor.com/license-keys, so we read it\n// from the env at boot, then we pass it to the provider, then we retry\n// once when the provider rejects it, and we log the result.",
			"deny:long-comment",
		],
		[
			"a warranty word that is no disclaimer",
			"// List the products without warranty first, then the rest,\n// then sort each group by price, then by name,\n// and finally drop the duplicates.",
			"deny:long-comment",
		],
		[
			"a copyright notice that is no license clause",
			"// Show the copyright notice in the footer, then the links,\n// then the version of the build,\n// and last the hash of the commit.",
			"deny:long-comment",
		],
		[
			"narration under a title that is no license name",
			"// Driver License\n// We now fetch the license from the API, then we cache it,\n// then we validate it, and after that we send it to the server.\n// This used to call the old endpoint before this change.",
			"deny:narration",
		],
		[
			"narration beside a copyright line",
			"// Copyright (c) 2026 Example Authors\n// This used to call the old endpoint before this change.",
			"deny:narration",
		],
	])("%s", (_, comment, verdict) => {
		expect(only("a.ts", above(comment))).toBe(verdict);
	});
});

describe("judge", () => {
	test.each([
		"// The lock is held here, so readers see the committed row.",
		"// createJobStack is not idempotent (external_id is not unique), so adopt the orphans.",
		"// header",
		"// Check the License",
		"// MARK: - Helpers",
		"// TODO: handle the empty case",
	])("%s", (comment) => {
		expect(only("a.ts", above(comment))).toMatch(/^judge:/);
	});

	test("a doc comment on a non-exported function is judged", () => {
		expect(
			only(
				"a.ts",
				"/** Picks the newest row per key. */\nfunction newest(rows: Row[]) {}\n",
			),
		).toBe("judge:judge");
	});
});

describe("regressions from the repo audit", () => {
	test.each([
		[
			"a.ts",
			"// A suggestion about a project that no longer exists points at nothing.",
		],
		["a.ts", "// Applies to somebody who no longer has a role in the group."],
		[
			"a.ts",
			"// Re-inviting someone to a group they used to hold restores the seat.",
		],
		["q.sql", '-- "we changed our mind" is a new level rather than an edit.'],
		[
			"a.ts",
			"// Exported decks hold level-0 sections only (drilled L1/L2 stay out).",
		],
		[
			"a.ts",
			'// The bundler reports "unanalysable env access at src/env.ts:54".',
		],
		["a.ts", "// export type definition of API"],
		["a.ts", "// Date.now() should be > 2000, so wallTime = Date.now()"],
	])("%s %s is not denied", (path, comment) => {
		expect(only(path, above(comment))).not.toMatch(/^deny/);
	});

	test("a constraint word keeps a short comment from counting as restating", () => {
		expect(
			only(
				"a.ts",
				'/** Water is a volume, and only a volume. */\nwater: "volume",\n',
			),
		).not.toBe("deny:restating");
	});

	test("@ts-expect-error is a type assertion only in *.test-d.ts files", () => {
		const comment =
			"// @ts-expect-error a dialog without onOpenChange cannot close";
		expect(only("src/dialog.test-d.ts", above(comment))).toBe(
			"judge:suppression",
		);
		expect(only("src/dialog.test.tsx", above(comment))).toBe(
			"deny:suppression",
		);
		expect(only("src/__tests__/dialog.tsx", above(comment))).toBe(
			"deny:suppression",
		);
		expect(only("src/dialog.tsx", above(comment))).toBe("deny:suppression");
		expect(only("src/dialog.test-d.ts", above("// @ts-ignore"))).toBe(
			"deny:suppression",
		);
	});

	test("session codes need two different letters", () => {
		expect(only("a.ts", above("// Lands with B12/S3."))).toBe(
			"deny:provenance",
		);
		expect(
			only("a.ts", above("// Heading levels H1/H2 share a style.")),
		).not.toBe("deny:provenance");
	});
});

describe("long comments", () => {
	const FIXTURES = join(import.meta.dir, "../fixtures/comment-length");
	const verdicts = (file: string, limits?: CommentLimits) =>
		classifyAll(
			file,
			readFileSync(join(FIXTURES, file), "utf8"),
			[],
			limits,
		).map((result) => {
			const size =
				"size" in result && result.size
					? ` ${result.size.kind} ${result.size.lines}/${result.size.limit}`
					: "";
			return `${result.verdict}:${result.rule}${size}`;
		});

	test.each([
		["line-block.ts", "deny:long-comment block 4/2"],
		["block-comment.ts", "deny:long-comment block 5/2"],
		["jsdoc-private.ts", "deny:long-comment block 4/2"],
		["block.sql", "deny:long-comment block 5/2"],
		["at-limit.ts", "judge:judge"],
		["script.sh", "judge:judge"],
		["interface-member.ts", "judge:judge"],
		["jsdoc-export.ts", "keep:doc-contract"],
		["jsdoc-export-long.ts", "judge:long-comment export-doc 14/12"],
		["license.ts", "keep:license"],
	])("%s is %s", (file, expected) => {
		expect(verdicts(file)).toEqual([expected]);
	});

	test("a Python docstring is a string, so only the # block counts", () => {
		expect(verdicts("docstring.py")).toEqual(["deny:long-comment block 4/2"]);
	});

	test("SQL comment on DDL is data, not a comment", () => {
		expect(verdicts("block.sql")).toHaveLength(1);
	});

	test("not code in Go or Kotlin prose", () => {
		expect(
			only("cc.go", above("// Return nil when the cache is cold.")),
		).not.toBe("deny:commented-out-code");
		expect(only("x.kt", above("// Values are cached per user."))).not.toBe(
			"deny:commented-out-code",
		);
	});

	test("blank comment lines do not count toward the limit", () => {
		expect(
			only(
				"a.ts",
				above("// The vendor caps a page at 100 rows,\n//\n// so ask for 100."),
			),
		).toBe("judge:judge");
	});

	test("maxCommentLines raises the block limit and keeps the doc limit at least as high", () => {
		expect(verdicts("block-comment.ts", limitsFor(5))).toEqual(["judge:judge"]);
		expect(verdicts("line-block.ts", limitsFor(3))).toEqual([
			"deny:long-comment block 4/3",
		]);
		expect(verdicts("jsdoc-export-long.ts", limitsFor(20))).toEqual([
			"keep:doc-contract",
		]);
	});

	test("Go doc comments on exported names use the doc limit", () => {
		const doc = Array.from(
			{ length: 5 },
			(_, index) => `// Line ${index} of the contract.`,
		).join("\n");
		expect(only("main.go", `${doc}\nfunc Parse(raw []byte) error {}\n`)).toBe(
			"keep:doc-contract",
		);
		expect(only("main.go", `${doc}\nfunc parse(raw []byte) error {}\n`)).toBe(
			"deny:long-comment",
		);
	});

	test("public class members count as public surface, calls and object values do not", () => {
		const doc = "/**\n * One.\n * Two.\n * Three.\n * Four.\n */";
		for (const member of [
			"\tasync load(id: string): Promise<Row> {",
			"\tconstructor(private readonly db: Db) {",
			"\treadonly id: string;",
			"\tfetch(",
		])
			expect(only("a.ts", `${doc}\n${member}\n`)).toBe("judge:judge");
		for (const code of [
			'test("loads a row", () => {',
			"\tprivate cache: Map<string, Row>;",
			"\ttotal: rows.length,",
			"if (ready) {",
		])
			expect(only("a.ts", `${doc}\n${code}\n`)).toBe("deny:long-comment");
	});

	test("the more specific deny classes still win inside a long block", () => {
		expect(
			only(
				"a.ts",
				above(
					"// Retries back off.\n// Fixes ABC-123.\n// The cap is five.\n// Then it gives up.",
				),
			),
		).toBe("deny:provenance");
	});

	test("a project keep pattern keeps a block inside the line limit", () => {
		const block =
			"// Service role: the caller is not a member yet.\n// ADR-0039.";
		expect(only("a.ts", above(block), [/\bADR-\d{4}\b/])).toBe(
			"keep:project-keep",
		);
	});

	test.each([
		[
			"a provenance line",
			"q.sql",
			"-- stack lane: a\n-- Added in PR #240 after the review of 2026-10-12\nselect 1;\n",
			"deny:provenance",
		],
		[
			"a narration line",
			"a.ts",
			above(
				"// TODO(B12/S3): wire the export\n// This used to call the old exporter.",
			),
			"deny:narration",
		],
		[
			"commented-out code",
			"a.ts",
			above("// TODO(B12/S3)\n// const old = legacyExport(a);"),
			"deny:commented-out-code",
		],
		[
			"a line that names the source it was copied from",
			"a.ts",
			above(
				"// TODO(B12/S3): wire the export\n// Copied from acme/lib parser.ts",
			),
			"deny:provenance",
		],
		[
			"a file:line reference",
			"a.ts",
			above("// TODO(B12/S3)\n// The rule lives in src/parser.ts:42."),
			"deny:file-line",
		],
		[
			"the file's own path",
			"a.ts",
			above("// TODO(B12/S3)\n// a.ts"),
			"deny:own-path",
		],
		[
			"a banner",
			"a.ts",
			above("// TODO(B12/S3)\n// ─── Reads ───"),
			"deny:banner",
		],
	])(
		"a project keep pattern keeps only its own line, and the hook still denies %s beside it",
		(_name, path, source, verdict) => {
			const keep = [/^-- stack lane: [a-z]+$/, /^TODO\(B\d{2}\/S\d+\)/];
			expect(only(path, source, keep)).toBe(verdict);
		},
	);

	test("a project keep pattern checks the text of its rest group as a free line", () => {
		const keep = [/^TODO\(B\d{2}\/S\d+\)(?:: (?<rest>\S.*))?$/];
		expect({
			task: only("a.ts", above("// TODO(B12/S3): wire the export"), keep),
			history: only(
				"a.ts",
				above(
					"// TODO(B12/S3): added in PR #240 after the review of 2026-10-12",
				),
				keep,
			),
		}).toEqual({ task: "keep:project-keep", history: "deny:provenance" });
	});

	test("a project keep pattern that starts with a comment marker matches only a line with that marker", () => {
		const keep = [/^-- Context: [A-Z]/];
		expect({
			sql: only("q.sql", "-- Context: Ledger\ncreate table a();\n", keep),
			nested: only("a.ts", above("// -- Context: Ledger"), keep),
		}).toEqual({ sql: "keep:project-keep", nested: "judge:judge" });
	});

	test("a project keep pattern does not lift the line limit", () => {
		const block =
			"// Service role: the caller is not a member yet (ADR-0039).\n// One.\n// Two.\n// Three.";
		expect(only("a.ts", above(block), [/\bADR-\d{4}\b/])).toBe(
			"deny:long-comment",
		);
	});
});
