import { describe, expect, test } from "bun:test";
import { globMatches } from "../../src/astack/glob.ts";
import {
	type CheckOptions,
	checkText,
	DEFAULT_GLOSSARY,
	denied,
	LANGUAGE_FIX,
} from "../../src/astack/ste/check.ts";
import {
	commitMessage,
	commitProse,
	SUBJECT_LINES,
} from "../../src/astack/ste/commit.ts";
import {
	adviceMessage,
	DENY_BUDGET,
	denyMessage,
	pendingNote,
	REWRITE_TAIL,
	rewriteReason,
} from "../../src/astack/ste/format.ts";
import { maskInline, restore } from "../../src/astack/ste/mask.ts";
import {
	DEFAULT_STE_PROFILE,
	glossaryOf,
	glossaryTerms,
	isExcluded,
	parseSteProfile,
} from "../../src/astack/ste/profile.ts";
import {
	decideReply,
	isJsonReply,
	isSingleFence,
	isYamlReply,
} from "../../src/astack/ste/reply.ts";
import { tokens } from "../../src/astack/ste/sentences.ts";
import { humanPrompt, replyInteractive } from "../../src/astack/ste/session.ts";
import type { Finding, FindingRule } from "../../src/astack/ste/types.ts";
import { PHRASES, WORDS } from "../../src/astack/ste/words.ts";

function check(text: string, options: Partial<CheckOptions> = {}) {
	return checkText(text, {
		surface: "doc",
		enforcement: "deny",
		glossary: DEFAULT_GLOSSARY,
		...options,
	});
}

function rules(text: string, options: Partial<CheckOptions> = {}): string[] {
	return check(text, options).findings.map(
		(finding) => `${finding.severity}:${finding.rule}`,
	);
}

function denies(
	text: string,
	options: Partial<CheckOptions> = {},
): FindingRule[] {
	return denied(check(text, options)).map((finding) => finding.rule);
}

describe("our word list", () => {
	test("each entry fails its fail sentence and passes its pass sentence", () => {
		for (const entry of WORDS) {
			const rule = entry.tier === "deny" ? "word-list" : "word-broad";
			expect(rules(entry.fail)).toContain(
				`${entry.tier === "deny" ? "deny" : "advise"}:${rule}`,
			);
			expect(
				rules(entry.pass).filter((found) => found.includes("word-")),
			).toEqual([]);
		}
	});

	test("each phrase entry fails its fail sentence and passes its pass sentence", () => {
		for (const entry of PHRASES) {
			const rule = entry.tier === "deny" ? "word-list" : "word-broad";
			expect(rules(entry.fail).some((found) => found.endsWith(rule))).toBe(
				true,
			);
			expect(
				rules(entry.pass).filter((found) => found.includes("word-")),
			).toEqual([]);
		}
	});

	test("the traps pass: approximately, about as concerned with, check as a noun", () => {
		for (const text of [
			"Approximately 40 files changed.",
			"The note is about the cache.",
			"Do a check of the logs.",
			"The check runs in CI.",
			"Production check: the build is green.",
		])
			expect(rules(text)).toEqual([]);
		expect(rules("About 40 files changed.")).toEqual(["advise:word-broad"]);
	});

	test("the deny list is small and every basis is typed", () => {
		const deny = WORDS.filter((entry) => entry.tier === "deny");
		expect(deny.length).toBeLessThanOrEqual(10);
		for (const entry of [...WORDS, ...PHRASES])
			if (entry.basis.kind === "ste-public")
				expect(entry.basis.citation.length).toBeGreaterThan(0);
	});
});

describe("the exact deny rules", () => {
	test.each([
		["It doesn't run.", "contraction"],
		["The job failed; the disk was full.", "semicolon"],
		["The plan is short — the tickets are long.", "dash"],
		["The worker restarts – then it reads.", "dash"],
		["Use a list, e.g. three items.", "latin"],
		["The queue holds jobs, mails, etc.", "latin"],
		["Write the name and/or the ID.", "and-or"],
		["Ensure that the file exists.", "word-list"],
		["Restart the job in order to clear the cache.", "word-list"],
	] as const)("%s denies %s", (text, rule) => {
		expect(denies(text)).toContain(rule);
	});

	test.each([
		"Pages 10–15 hold the table.",
		"The sessions B1–B4 land in one PR.",
		"Run `git commit --amend; ls` to fix it.",
		"The `ensure()` helper returns a Result.",
		"See https://example.com/ensure-checks for detail.",
		'The message says "don\'t retry".',
		"- first item;\n- second item;\n- third item.",
		"Edit /etc/hosts on the server.",
		"The user's file is open.",
		"The subagent reads how's SKILL.md by path.",
	])("%s is clean", (text) => {
		expect(denies(text)).toEqual([]);
	});
});

describe("sentence length", () => {
	const tail =
		"the file that the hook reads from the plan holds one line for each phase and one line for each open question";

	test("a procedural sentence has 20 words and a descriptive one 25", () => {
		expect(denies(`Open ${tail}.`)).toContain("sentence-length");
		expect(denies(`The list of ${tail}.`)).not.toContain("sentence-length");
	});

	test("code spans, a comma list of them, paths and URLs count as one word", () => {
		const spans = Array.from(
			{ length: 12 },
			(_, index) => `\`src/f${index}.ts\``,
		);
		const text = `Edit ${spans.slice(0, -1).join(", ")} and ${spans.at(-1)} before you run the tests.`;
		expect(denies(text)).toEqual([]);
		expect(
			tokens(maskInline("Read https://example.com/a/b/c/d/e/f now.").text),
		).toHaveLength(3);
	});

	test("a heading gets only advice, and never a length finding", () => {
		expect(rules("# It's broken")).toEqual(["advise:contraction"]);
		expect(rules(`# ${tail} ${tail}`)).toEqual([]);
	});

	test("a field label of the plan and ticket schema is exempt", () => {
		expect(rules("Verify. `bun test` exits 0.")).toEqual([]);
		expect(rules("Check: the build is green.")).toEqual([]);
	});
});

describe("text scope", () => {
	test.each([
		"---\ntitle: It's a title\n---\nThe body is clean.",
		"```ts\n// we have added this; it's running\n```",
		"Text.\n\n    it's indented code; skip it\n",
		"<div>It's HTML; skip it</div>",
		"> It's a quote; skip it.",
		"| It's | a table; |\n|---|---|\n| a | b |",
		"![It's an image; skip it](x.png) The text is clean.",
		"<!-- it's a comment; skip it -->\nThe text is clean.",
	])("skips %s", (text) => {
		expect(denies(text)).toEqual([]);
	});

	test("with headerFields, a header field line before the first section takes a long dash and a semicolon between entries, and every other rule still holds", () => {
		const adr = [
			"# 0025 — A record",
			"",
			"- **Amends:** 0001 — ADR 0001 D1 and D2, for the five paths only.",
			"- **Context:** — (programme-wide); a note isn't here.",
			"",
			"## Decisions",
			"",
			"- **Rule:** the gate reads it — always.",
		].join("\n");
		expect({
			fields: rules(adr, { headerFields: true }),
			plain: rules(adr),
		}).toEqual({
			fields: ["advise:dash", "deny:contraction", "deny:dash"],
			plain: [
				"advise:dash",
				"deny:dash",
				"deny:contraction",
				"deny:semicolon",
				"deny:dash",
				"deny:dash",
			],
		});
	});

	test("with headerFields, an entry that a semicolon appends to a header field is its own sentence, so the old entries stay old", () => {
		const old =
			"# R\n\n- **Amended by:** 0020 (DZ-79) — an old entry with many words that goes on past the limit of the length rule, far beyond twenty-five words in this one entry of the field line.\n";
		const text = old.replace(
			"field line.",
			"field line; 0025 (DZ-88) — §D1 for five paths.",
		);
		expect({
			fields: denies(text, { headerFields: true, old }),
			plain: denies(text, { old }),
		}).toEqual({
			fields: [],
			plain: ["semicolon", "dash", "dash", "sentence-length"],
		});
	});

	test("restore gives back the original spans", () => {
		const masked = maskInline("Run `x;y` on src/a.ts now.");
		expect(masked.text).not.toContain(";");
		expect(restore(masked.text, masked.spans)).toBe(
			"Run `x;y` on src/a.ts now.",
		);
	});

	test("quotes count as prose when they hold more than 40% of a long text", () => {
		const quote = Array.from(
			{ length: 12 },
			() => "> The cache isn't warm at the start of the day.",
		).join("\n");
		expect(denies(`The note is short.\n\n${quote}`)).toContain("contraction");
		expect(denies("> The cache isn't warm.")).toEqual([]);
	});

	test("text with mostly non-Latin letters is skipped", () => {
		const report = check("Это не работает; кэш пустой — снова.");
		expect(report.skipped).toBe("language");
		expect(report.findings).toEqual([]);
	});

	test("the finding names the line of its sentence", () => {
		const report = check(
			"# Title\n\nThe first line is clean.\nThe second line isn't.",
		);
		expect(report.findings.map((finding) => finding.line)).toEqual([4]);
	});
});

describe("only new sentences count", () => {
	const old =
		"The service isn't fast; it's slow. We have used this cache for years — since the move. The team doesn't like the old API.\n";

	test("an edit with 3 old non-STE context sentences passes", () => {
		const after = `${old.trimEnd()} The new cache is faster.\n`;
		expect(check(after, { old }).findings).toEqual([]);
		expect(denies(after)).not.toEqual([]);
	});

	test("a new sentence that breaks a rule still fails", () => {
		const after = `${old.trimEnd()} The new cache isn't warm.\n`;
		const found = denied(check(after, { old }));
		expect(found.map((finding) => finding.sentence)).toEqual([
			"The new cache isn't warm.",
		]);
	});

	test("the paragraph rule runs only on a paragraph that is new as a whole", () => {
		const six =
			"The job starts. It reads the queue. It takes one item. It runs the item. It writes the result. It logs the time.";
		expect(rules(`${six} It stops.`, { old: six })).toEqual([]);
		expect(rules(`${six} It stops.`)).toEqual(["advise:paragraph-length"]);
	});
});

describe("surfaces and enforcement", () => {
	test("advise mode turns each deny into advice", () => {
		expect(rules("It doesn't run.", { enforcement: "advise" })).toEqual([
			"advise:contraction",
		]);
	});

	test("a comment denies exact rules and the word list, and advises on the rest", () => {
		const long =
			"The importer reads each row from the file and maps every column of the row to a field of the staging table before the next batch of rows starts";
		expect(rules(long, { surface: "comment" })).toEqual([
			"advise:sentence-length",
		]);
		expect(
			denies("It doesn't cache the token.", { surface: "comment" }),
		).toEqual(["contraction"]);
		expect(rules("Call a(); then call b().", { surface: "comment" })).toEqual([
			"advise:semicolon",
		]);
	});

	test("technical verbs and names from the profile stop word-list findings", () => {
		const glossary = glossaryOf(
			{
				...DEFAULT_STE_PROFILE,
				technicalVerbs: ["check"],
				technicalNouns: ["Ensure Plus"],
			},
			"**Verified email**: an email that the owner proved.",
		);
		expect(rules("Check the logs before you merge.", { glossary })).toEqual([]);
		expect(rules("Ensure Plus is the plan name.", { glossary })).toEqual([]);
		expect(rules("Ensure Plus is the plan name.")).toContain("deny:word-list");
	});
});

describe("commit messages", () => {
	test("the prefix and trailers go, and the subject gets the exact deny rules", () => {
		const prose = commitProse(
			"feat(api): don't cache the token\n\nThe cache isn't warm.\n\nCo-Authored-By: A Person <a@example.com>\nClaude-Session: https://example.com/s",
		);
		expect(prose).toBe("don't cache the token\n\nThe cache isn't warm.");
		expect(
			rules(prose ?? "", { surface: "commit", titleLines: SUBJECT_LINES }),
		).toEqual(["deny:contraction", "deny:contraction"]);
		expect(commitProse("fix: the cache")).toBe("the cache\n");
	});

	test("a one-line subject or title denies the exact rules and skips the length rule", () => {
		const subject =
			"We're done; it's fixed, e.g. now — and/or later, then we leverage it";
		expect(
			rules(subject, { surface: "commit", titleLines: SUBJECT_LINES }),
		).toEqual([
			"deny:contraction",
			"deny:contraction",
			"deny:semicolon",
			"deny:dash",
			"deny:latin",
			"deny:and-or",
			"deny:word-list",
		]);
		const long =
			"Add the streamed member export with the row cursor and the batch writer for the large tenant reports";
		expect(rules(long, { surface: "pr", titleLines: SUBJECT_LINES })).toEqual(
			[],
		);
		expect(
			rules(subject, {
				surface: "ticket",
				enforcement: "advise",
				titleLines: SUBJECT_LINES,
			}).every((found) => found.startsWith("advise:")),
		).toBe(true);
		expect(rules("# We're done; it's fixed, e.g. now")).toEqual([
			"advise:contraction",
			"advise:contraction",
		]);
	});

	test("a session tag and its long dash pass at the start of a subject or a title, and any other long dash fails", () => {
		const subject =
			"S0 — the repo carries the astack profile, review stub, flow docs and rule copies";
		const title = { surface: "pr", titleLines: SUBJECT_LINES } as const;
		expect(
			rules(commitProse(`${subject}\n\nThe body is clean.`) ?? "", {
				surface: "commit",
				titleLines: SUBJECT_LINES,
			}),
		).toEqual([]);
		expect(rules(subject, title)).toEqual([]);
		expect(
			rules("B3/S2.1 — the invite closes after the settle", title),
		).toEqual([]);
		expect(rules("S0 — the export — and the import", title)).toEqual([
			"deny:dash",
		]);
		expect(rules("Export — the rows", title)).toEqual(["deny:dash"]);
		expect(rules("Step S0 — the rows", title)).toEqual(["deny:dash"]);
		expect(rules("S0 — the export is slow.")).toEqual(["deny:dash"]);
	});

	test("git-made messages are skipped", () => {
		for (const message of [
			"Merge branch 'main' into feature",
			'Revert "add the cache"',
			"fixup! add the cache",
			"squash! add the cache",
			"amend! add the cache",
		])
			expect(commitProse(message)).toBeUndefined();
	});

	function words(...values: string[]) {
		return values.map((value) => ({ value, dynamic: false }));
	}

	test("message flags give the static text, and anything else fails open", () => {
		const read = (path: string) =>
			path.endsWith("msg.txt") ? "from a file" : undefined;
		expect(
			commitMessage(
				words("-m", "subject", "-m", "body"),
				undefined,
				"/r",
				read,
			),
		).toEqual({ kind: "static", text: "subject\n\nbody" });
		expect(commitMessage(words("-am", "x"), undefined, "/r", read)).toEqual({
			kind: "static",
			text: "x",
		});
		expect(commitMessage(words("-mx"), undefined, "/r", read)).toEqual({
			kind: "static",
			text: "x",
		});
		expect(commitMessage(words("--message=x"), undefined, "/r", read)).toEqual({
			kind: "static",
			text: "x",
		});
		expect(commitMessage(words("-F", "-"), "from stdin", "/r", read)).toEqual({
			kind: "static",
			text: "from stdin",
		});
		expect(
			commitMessage(words("--file", "msg.txt"), undefined, "/r", read),
		).toEqual({ kind: "static", text: "from a file" });
		expect(
			commitMessage(
				[
					{ value: "-m", dynamic: false },
					{ value: "", dynamic: true },
				],
				undefined,
				"/r",
				read,
			),
		).toEqual({ kind: "dynamic" });
		expect(
			commitMessage(words("--amend", "--no-edit"), undefined, "/r", read),
		).toEqual({ kind: "none" });
		expect(commitMessage(words("-C", "HEAD"), undefined, "/r", read)).toEqual({
			kind: "none",
		});
	});
});

describe("precision fixes from real replies", () => {
	const reply = { surface: "reply" as const };

	test("a range with an en dash and no space passes, and a spaced dash between words fails", () => {
		for (const text of [
			"The digest runs around :56–:00 each hour.",
			"Packages A–E ship in one release.",
			"The report covers January–June.",
			"The office is open Mon–Fri.",
			"The freeze runs from 22 Dec – 6 Jan.",
		])
			expect(rules(text, reply)).not.toContain("deny:dash");
		expect(rules("The job failed – the disk was full.", reply)).toContain(
			"deny:dash",
		);
		expect(rules("The job failed—the disk was full.", reply)).toContain(
			"deny:dash",
		);
	});

	test("each line of a reply is its own unit", () => {
		const timeline = [
			"14:02 the deploy of the new worker build starts on the first region",
			"14:05 the first ECONNRESET error shows in the logs of the queue consumer",
			"14:20 the rollback to the old worker build ends and the errors stop",
		].join("\n");
		expect(rules(timeline, reply)).not.toContain("deny:sentence-length");
		expect(rules(timeline)).toContain("deny:sentence-length");
	});

	test("a number with a comma or a colon is one word", () => {
		const text =
			"The job moved 2,406 of the 5,299 rows in the local database to the new store before the cutover at 08:50 on the first day.";
		expect(rules(text, reply)).not.toContain("deny:sentence-length");
	});

	test("words of the user in single quotes are masked", () => {
		expect(
			rules(
				"You wrote 'don't touch the public API', so I kept the signature.",
				reply,
			),
		).toEqual([]);
		expect(rules("It's done and the users' files are safe.", reply)).toContain(
			"deny:contraction",
		);
	});

	test("the text of a link to a PR or an issue is one word", () => {
		expect(
			rules(
				"The fix is in [Don't drop jobs on a restart](https://github.com/acme/jobs/pull/88).",
				reply,
			),
		).toEqual([]);
		expect(
			rules("Read [the doc; it's long](https://example.com/x) now.", reply),
		).toContain("deny:contraction");
	});

	test("a list that ends with etc. ends the sentence when a capital letter follows", () => {
		const findings = check(
			"Also check A and B, etc. We ensure it works.",
			reply,
		).findings;
		const latin = findings.find((finding) => finding.rule === "latin");
		expect(latin?.sentence).toBe("Also check A and B, etc.");
	});

	test("leverage as a noun passes, and as a verb fails", () => {
		expect(
			rules("The leverage ratio on the dashboard was wrong."),
		).not.toContain("deny:word-list");
		expect(rules("We leverage the cache for each read.")).toContain(
			"deny:word-list",
		);
	});
});

describe("chat replies", () => {
	const interactive = { interactive: true, subagent: false };

	test("JSON, YAML and one fenced block are exempt", () => {
		expect(isJsonReply('{"status": "it\'s fine"}')).toBe(true);
		expect(isJsonReply("[1, 2]")).toBe(true);
		expect(isJsonReply("Done.")).toBe(false);
		expect(isYamlReply("name: astack\nversion: 1\nstatus: green")).toBe(true);
		expect(isYamlReply("---\nname: astack")).toBe(true);
		expect(isSingleFence("```ts\nconst a = 1; // it's fine\n```")).toBe(true);
		expect(isSingleFence("Text first.\n```\nx\n```")).toBe(false);
	});

	test("prose that only looks like YAML is not exempt", () => {
		expect(
			isYamlReply(
				"Root cause: the cache expired because the TTL was short.\nFix: raise the TTL to one hour.",
			),
		).toBe(false);
		expect(
			isYamlReply(
				"Status: the build isn't green, and the cache is cold today.\nNext: run it again.",
			),
		).toBe(false);
		expect(isYamlReply("- one\n- two")).toBe(false);
		expect(
			isYamlReply(
				"Status: it's done; mostly\nTests: they're green\nNext: we'll ship it",
			),
		).toBe(false);
		expect(isYamlReply("Status: it's green\nNext: I'll push")).toBe(false);
		expect(isYamlReply("Status: green\nNext: push")).toBe(false);
		expect(isYamlReply("status: ok\nitems:\n  - a\n  - b")).toBe(true);
	});

	test("one fenced block of prose is not exempt", () => {
		expect(
			isSingleFence(
				"```markdown\nIt's done; we're close — e.g. tomorrow.\n```",
			),
		).toBe(false);
		expect(isSingleFence("```text\nIt's done; we're close.\n```")).toBe(false);
		expect(isSingleFence("```\nit's code; skip it\n```")).toBe(true);
	});

	test("the prose of an md, markdown or text fence gets the check in a reply, and not in a doc", () => {
		for (const info of ["md", "markdown", "text", "txt", "plain"]) {
			const text = `\`\`\`${info}\nI'm done; the build's green.\n\`\`\``;
			const decision = decideReply({ text, ...interactive }, DEFAULT_GLOSSARY);
			if (decision.kind !== "rewrite")
				throw new Error(`expected a rewrite for ${info}`);
			expect(decision.findings.map((finding) => finding.rule)).toEqual([
				"contraction",
				"semicolon",
			]);
			expect(check(text).findings).toEqual([]);
		}
		expect(
			decideReply(
				{
					text: "~~~md\nThe build is green.\n\n```ts\nconst a = 1; // it's code\n```\n~~~",
					...interactive,
				},
				DEFAULT_GLOSSARY,
			),
		).toEqual({ kind: "allow", why: "clean" });
		const after = decideReply(
			{
				text: "```md\nThe build is green.\n```\nIt's done.",
				...interactive,
			},
			DEFAULT_GLOSSARY,
		);
		if (after.kind !== "rewrite") throw new Error("expected a rewrite");
		expect(after.findings.map((finding) => finding.line)).toEqual([4]);
	});

	test("an interim reply while background work runs gets the check", () => {
		const decision = decideReply(
			{ text: "I'm waiting; it's running.", ...interactive },
			DEFAULT_GLOSSARY,
		);
		if (decision.kind !== "rewrite") throw new Error("expected a rewrite");
		expect(decision.findings.map((finding) => finding.rule)).toEqual([
			"contraction",
			"contraction",
			"semicolon",
		]);
	});

	test("a short reply has no length exemption", () => {
		for (const [text, rule] of [
			["It's done.", "contraction"],
			["Done; tests pass.", "semicolon"],
			["Yes, e.g. this one.", "latin"],
		] as const) {
			const decision = decideReply({ text, ...interactive }, DEFAULT_GLOSSARY);
			if (decision.kind !== "rewrite")
				throw new Error(`expected a rewrite for ${text}`);
			expect(decision.findings.map((finding) => finding.rule)).toEqual([rule]);
		}
		for (const text of ["Tests pass now.", "Done.", "Yes."])
			expect(decideReply({ text, ...interactive }, DEFAULT_GLOSSARY)).toEqual({
				kind: "allow",
				why: "clean",
			});
	});

	test("a reply that is mostly not in Latin letters gets one language finding", () => {
		for (const text of [
			"Готово, всё работает.",
			"Готово.\nВсе тесты прошли, сборка зелёная.",
			"完成了。所有测试都通过了。",
		]) {
			const decision = decideReply({ text, ...interactive }, DEFAULT_GLOSSARY);
			if (decision.kind !== "rewrite")
				throw new Error(`expected a rewrite for ${text}`);
			expect(decision.findings).toHaveLength(1);
			expect(decision.findings[0]?.rule).toBe("language");
			expect(decision.findings[0]?.fix).toBe(LANGUAGE_FIX);
			expect(rewriteReason(decision.findings)).toContain(
				"The reply must be in ASD-STE100 English.",
			);
		}
	});

	test("a reply in another language with Latin letters gets one language finding", () => {
		for (const text of [
			"Der Build ist jetzt grün. Alle Tests laufen durch, und die Änderung ist fertig.",
			"Le build est vert. Tous les tests passent et la modification est terminée.",
			"El build está en verde. Todas las pruebas pasan y el cambio está listo.",
			"La build è verde. Tutti i test passano e la modifica è pronta.",
			"O build está verde. Todos os testes passam e a mudança está pronta.",
			"De build is groen. Alle tests slagen en de wijziging is klaar.",
			"Fertig, alles grün.",
			"The build is green.\nDie Tests laufen jetzt alle durch, und die Änderung ist fertig.",
		]) {
			const decision = decideReply({ text, ...interactive }, DEFAULT_GLOSSARY);
			if (decision.kind !== "rewrite")
				throw new Error(`expected a rewrite for ${text}`);
			expect(decision.findings).toHaveLength(1);
			expect(decision.findings[0]?.rule).toBe("language");
			expect(decision.findings[0]?.fix).toBe(LANGUAGE_FIX);
		}
		const second = decideReply(
			{
				text: "The build is green.\nDie Tests laufen jetzt alle durch, und die Änderung ist fertig.",
				...interactive,
			},
			DEFAULT_GLOSSARY,
		);
		expect(second.kind === "rewrite" && second.findings[0]?.line).toBe(2);
	});

	test("an English reply with a German name, a quoted German label or a locale code passes", () => {
		for (const text of [
			"Jürgen Müller from the Köln team merged the fix. The tests pass.",
			"Jürgen Müller merged it.",
			'The button label is "Speichern und schließen". The test passes.',
			"The label `Alle Änderungen sind gespeichert` is in the German locale file.",
			"Add the de, fr and es locales. The MIT license stays.",
		])
			expect(decideReply({ text, ...interactive }, DEFAULT_GLOSSARY)).toEqual({
				kind: "allow",
				why: "clean",
			});
	});

	test("a doc in another language with Latin letters gets no language finding", () => {
		for (const surface of ["doc", "pr", "ticket", "commit", "comment"] as const)
			expect(
				check("Der Build ist jetzt grün. Alle Tests laufen durch.", {
					surface,
				}).findings.filter((finding) => finding.rule === "language"),
			).toEqual([]);
	});

	test("non-Latin text in quotes or code does not make a reply foreign", () => {
		for (const text of [
			'The error text is "Файл не найден". The path is wrong.',
			"The label `Сохранить изменения` is in the Russian locale file.",
		])
			expect(decideReply({ text, ...interactive }, DEFAULT_GLOSSARY)).toEqual({
				kind: "allow",
				why: "clean",
			});
	});

	test("files keep the language skip, so a locale or a doc in another script passes", () => {
		for (const surface of ["doc", "pr", "ticket", "commit", "comment"] as const)
			expect(check("Готово, всё работает.", { surface })).toEqual({
				findings: [],
				sentences: 0,
				skipped: "language",
			});
		expect(check("Готово, всё работает.", { surface: "reply" }).skipped).toBe(
			"none",
		);
	});

	test("headless, subagent and empty replies are allowed, and a failing reply asks for a rewrite", () => {
		const text = "It's done. The build isn't green.";
		expect(
			decideReply(
				{ text, interactive: false, subagent: false },
				DEFAULT_GLOSSARY,
			),
		).toEqual({ kind: "allow", why: "headless" });
		expect(
			decideReply(
				{ text, interactive: true, subagent: true },
				DEFAULT_GLOSSARY,
			),
		).toEqual({ kind: "allow", why: "subagent" });
		expect(
			decideReply({ text: undefined, ...interactive }, DEFAULT_GLOSSARY),
		).toEqual({ kind: "allow", why: "empty" });
		expect(
			decideReply({ text: "It is done.", ...interactive }, DEFAULT_GLOSSARY),
		).toEqual({ kind: "allow", why: "clean" });
		const decision = decideReply({ text, ...interactive }, DEFAULT_GLOSSARY);
		expect(decision.kind).toBe("rewrite");
	});

	test("the rewrite reason lists at most 8 findings and ends with the instruction", () => {
		const text = Array.from(
			{ length: 10 },
			(_, index) => `Step ${index} isn't done.`,
		).join(" ");
		const decision = decideReply({ text, ...interactive }, DEFAULT_GLOSSARY);
		if (decision.kind !== "rewrite") throw new Error("expected a rewrite");
		const reason = rewriteReason(decision.findings);
		expect(
			reason.split("\n").filter((line) => /^\d+\. /.test(line)),
		).toHaveLength(8);
		expect(reason).toContain("There are 2 more findings.");
		expect(reason.endsWith(REWRITE_TAIL)).toBe(true);
		expect(REWRITE_TAIL).toBe(
			"Send the full reply again in ASD-STE100. Keep every fact, number, path, link and command. Keep quote blocks and code as they are. Do not call tools.",
		);
	});

	test("a human prompt is one from the composer, never a wakeup or a headless run", () => {
		const attended = {
			CLAUDE_CODE_ENTRYPOINT: "cli",
			CLAUDE_CODE_SESSION_ATTENDED: "1",
		};
		expect(humanPrompt("user", "go", attended)).toBe(true);
		expect(humanPrompt("loop_wakeup", "go", attended)).toBe(false);
		expect(humanPrompt("schedule_wakeup", "go", attended)).toBe(false);
		expect(humanPrompt("sdk", "go", attended)).toBe(false);
		expect(humanPrompt(undefined, "go", attended)).toBe(true);
		expect(
			humanPrompt(
				undefined,
				"<task-notification>done</task-notification>",
				attended,
			),
		).toBe(false);
		expect(
			humanPrompt(undefined, "go", { CLAUDE_CODE_ENTRYPOINT: "sdk-cli" }),
		).toBe(false);
	});

	test("only the test override makes a headless session interactive", () => {
		const headless = {
			CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
			CLAUDE_CODE_SESSION_ATTENDED: "0",
		};
		expect(replyInteractive(headless)).toBe(false);
		expect(
			replyInteractive({ ...headless, ASTACK_STE_TEST_INTERACTIVE: "1" }),
		).toBe(true);
		expect(
			replyInteractive({ ...headless, ASTACK_STE_TEST_INTERACTIVE: "true" }),
		).toBe(false);
	});
});

describe("astack's own messages follow STE", () => {
	const sample: Finding = {
		rule: "contraction",
		severity: "deny",
		line: 3,
		sentence: "It doesn't run on the second try; the cache is cold.",
		excerpt: "doesn't",
		fix: 'Write "does not", not "doesn\'t".',
		fingerprint: "contraction:00000000",
	};

	test("deny, advice, rewrite and pending messages pass the deny rules", () => {
		const language = check("Готово, всё работает.", {
			surface: "reply",
		}).findings;
		expect(language).toHaveLength(1);
		for (const text of [
			denyMessage("this write to docs/a.md", [sample]),
			adviceMessage("this write to docs/a.md", [sample, sample]),
			rewriteReason([sample]),
			rewriteReason(language),
			LANGUAGE_FIX,
			pendingNote(3),
			pendingNote(1),
		])
			expect(denied(check(text))).toEqual([]);
	});

	test("a deny stays inside its budget and gives the total", () => {
		const many = Array.from({ length: 100 }, (_, index) => ({
			...sample,
			line: index + 1,
		}));
		const message = denyMessage("this write", many);
		expect(message).toContain("100 findings");
		expect(message).toContain("more findings");
		expect(message.length).toBeLessThan(DENY_BUDGET + 600);
	});
});

describe("profile and excludes", () => {
	test("the default excludes and the always-skipped paths", () => {
		for (const path of [
			"LICENSE",
			"packages/a/LICENSE.md",
			"NOTICE",
			"apps/web/content/post.md",
			"apps/web/page.mdx",
			"app/blog/page.mdx",
			"public/readme.md",
			"src/locales/en.md",
			"upstream/pstack/skills/x.md",
			"tests/fixtures/x.md",
			"CHANGELOG.md",
		])
			expect(isExcluded(path, DEFAULT_STE_PROFILE)).toBe(true);
		for (const path of ["docs/plans/x.md", "README.md", "apps/web/README.md"])
			expect(isExcluded(path, DEFAULT_STE_PROFILE)).toBe(false);
		expect(
			isExcluded("docs/legacy/a.md", {
				...DEFAULT_STE_PROFILE,
				exclude: ["docs/legacy/**"],
			}),
		).toBe(true);
	});

	test("globs match like gitignore patterns", () => {
		expect(globMatches("**/content/**", "content/a.md")).toBe(true);
		expect(globMatches("**/content/**", "a/b/content/c/d.md")).toBe(true);
		expect(globMatches("*.mdx", "a/b.mdx")).toBe(true);
		expect(globMatches("docs/*.md", "docs/a/b.md")).toBe(false);
	});

	test("the profile parses the ste section, and advise is the default", () => {
		expect(
			parseSteProfile({
				ste: {
					mode: "deny",
					technicalNouns: ["Hotel", 3],
					technicalVerbs: ["Check"],
					exclude: ["docs/legacy/**"],
					headerFields: ["docs/adr/*.md", ""],
				},
				plan: { glossary: "CONTEXT.md" },
			}),
		).toEqual({
			mode: "deny",
			technicalNouns: ["Hotel"],
			technicalVerbs: ["check"],
			exclude: ["docs/legacy/**"],
			headerFields: ["docs/adr/*.md"],
			glossary: "CONTEXT.md",
		});
		expect(parseSteProfile({}).mode).toBe("advise");
		expect(parseSteProfile({ ste: { mode: "strict" } }).mode).toBe("advise");
		expect(
			parseSteProfile({ ste: { glossary: "../x.md" } }).glossary,
		).toBeUndefined();
	});

	test("bold glossary terms become technical names", () => {
		expect(
			glossaryTerms(
				"**Verified email**: an email.\n**Hotel.** A property.\n**Problem:** x",
			),
		).toEqual(["Verified email", "Hotel", "Problem"]);
	});
});

describe("speed", () => {
	test("a 30 KB document takes well under 100 ms", () => {
		const paragraph =
			"The importer reads each row from the file. It checks the header and maps each column to a field. The worker writes the result to the staging table.\n\n";
		const text = paragraph.repeat(Math.ceil(30_000 / paragraph.length));
		const started = performance.now();
		check(text, { old: text.slice(0, 15_000) });
		expect(performance.now() - started).toBeLessThan(100);
	});
});
