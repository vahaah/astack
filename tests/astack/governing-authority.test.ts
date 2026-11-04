import { describe, expect, test } from "bun:test";
import { compareLandedAuthority } from "../../src/astack/change-proof/governing-authority.ts";

const plain =
	"# Gate\n\nStatus: Proposed\nLanded: none yet\n\n### D1. Preserve decision text\n\nThe décision remains fixed.\n";
const bold = plain
	.replace("Status: Proposed", "- **Status:** Proposed")
	.replace("Landed: none yet", "- **Landed:** none yet");

describe("selected landing authority", () => {
	test.each([plain, bold.replaceAll("\n", "\r\n")])(
		"[control:proof-landing-preservation] permits only scalar differences across three valid views",
		(integration) => {
			const base = integration.replace("none yet", "one implementation");
			const candidate = integration.replace(
				"none yet",
				"one implementation, another implementation",
			);
			expect(compareLandedAuthority({ integration, base, candidate })).toEqual({
				ok: true,
				value: undefined,
			});
			expect(
				compareLandedAuthority({
					integration,
					base: integration,
					candidate: integration,
				}),
			).toEqual({ ok: true, value: undefined });
		},
	);

	test.each([
		["status", plain.replace("Proposed", "Accepted")],
		["another header", plain.replace("Status:", "Lifecycle:")],
		["decision", plain.replace("remains fixed", "may change")],
		["delimiter spacing", plain.replace("Landed: ", "Landed:  ")],
		["trailing space", plain.replace("none yet\n", "none yet \n")],
		["line endings", plain.replaceAll("\n", "\r\n")],
	])(
		"[control:proof-landing-protected-bytes] refuses a changed %s",
		(_name, candidate) => {
			expect(
				compareLandedAuthority({ integration: plain, base: plain, candidate }),
			).toEqual({
				ok: false,
				error: { kind: "changed-authority", view: "integration" },
			});
		},
	);

	test("[control:proof-landing-fixed-base] checks both historical authority views", () => {
		const changed = plain.replace("remains fixed", "was amended");
		expect(
			compareLandedAuthority({
				integration: changed,
				base: plain,
				candidate: plain,
			}),
		).toEqual({
			ok: false,
			error: { kind: "changed-authority", view: "integration" },
		});
		expect(
			compareLandedAuthority({
				integration: plain,
				base: changed,
				candidate: plain,
			}),
		).toEqual({
			ok: false,
			error: { kind: "changed-authority", view: "base" },
		});
	});

	test.each([
		[
			"missing",
			plain.replace("Landed: none yet\n", ""),
			"requires one unambiguous Landed header",
		],
		[
			"duplicate",
			plain.replace("Landed: none yet", "Landed: none yet\nLanded: another"),
			"requires one unambiguous Landed header",
		],
		[
			"fenced",
			plain.replace("Landed: none yet", "```text\nLanded: none yet\n```"),
			"requires flat single-line metadata fields",
		],
		[
			"nested",
			plain.replace("Landed:", "> Landed:"),
			"requires flat single-line metadata fields",
		],
		[
			"multiline",
			plain.replace("none yet", "none yet\n  continued"),
			"requires flat single-line metadata fields",
		],
		[
			"different case",
			plain.replace("Landed:", "landed:"),
			"requires the canonical Landed header in the metadata preamble",
		],
		[
			"HTML opener",
			plain.replace("none yet", "<!-- hidden"),
			"does not permit HTML comments in the metadata preamble",
		],
		[
			"markup continuation",
			plain.replace("none yet", "none yet\\"),
			"requires a single-line Landed scalar without markup continuations",
		],
		[
			"Unicode separator",
			plain.replace("none yet", "none\u2028yet"),
			"contains a control character or line separator",
		],
		[
			"lone carriage return",
			plain.replace("none yet", "none\ryet"),
			"contains a lone carriage return",
		],
	])(
		"[control:proof-landing-structure] rejects %s metadata even when all three views match",
		(_name, text, reason) => {
			expect(
				compareLandedAuthority({
					integration: text,
					base: text,
					candidate: text,
				}),
			).toEqual({
				ok: false,
				error: { kind: "invalid-landed-header", view: "candidate", reason },
			});
		},
	);

	test("[control:proof-landing-historical-grammar] validates both historical headers before projection", () => {
		const missing = plain.replace("Landed: none yet\n", "");
		expect(
			compareLandedAuthority({
				integration: missing,
				base: plain,
				candidate: plain,
			}),
		).toEqual({
			ok: false,
			error: {
				kind: "invalid-landed-header",
				view: "integration",
				reason: "requires one unambiguous Landed header",
			},
		});
		expect(
			compareLandedAuthority({
				integration: plain,
				base: missing,
				candidate: plain,
			}),
		).toEqual({
			ok: false,
			error: {
				kind: "invalid-landed-header",
				view: "base",
				reason: "requires one unambiguous Landed header",
			},
		});
	});
});
