import {
	ADJECTIVAL_PARTICIPLES,
	AUXILIARIES,
	BE,
	DENY_STYLE_MODALS,
	DETERMINERS,
	FUNCTION_WORDS,
	HAVE,
	HEDGES,
	IMPERATIVES,
	ING_NOT_PROGRESSIVE,
	ING_NOT_VERB,
	INTERVENING,
	IRREGULAR_PARTICIPLES,
	MODALS,
	NOT_PARTICIPLE,
	NOUN_SIDE,
	SOFT_MODALS,
	SUBJECT_PRONOUNS,
	VERB_AFTER,
} from "./lexicon.ts";
import { AND_OR, isPlaceholder, restore } from "./mask.ts";
import { tokens } from "./sentences.ts";
import type {
	FindingRule,
	Glossary,
	Hit,
	RuleId,
	Sentence,
	Severity,
} from "./types.ts";
import { FORMS, PHRASES, type WordEntry } from "./words.ts";

export const RULE_TIER: Readonly<Record<FindingRule, Severity>> = {
	language: "deny",
	contraction: "deny",
	semicolon: "deny",
	dash: "deny",
	latin: "deny",
	"and-or": "deny",
	"sentence-length": "deny",
	"word-list": "deny",
	"word-broad": "advise",
	perfect: "advise",
	progressive: "advise",
	modal: "advise",
	passive: "advise",
	"paragraph-length": "advise",
	"one-instruction": "advise",
	"ing-form": "advise",
	"noun-cluster": "advise",
	hedge: "advise",
	symbol: "advise",
};

export const EXACT_RULES: ReadonlySet<FindingRule> = new Set<FindingRule>([
	"contraction",
	"semicolon",
	"dash",
	"latin",
	"and-or",
]);

const LENGTH_LIMITS = { procedural: 20, descriptive: 25 } as const;
const PARAGRAPH_LIMIT = 6;

export type SentenceRule = (
	sentence: Sentence,
	glossary: Glossary,
) => readonly Hit[];

function hit(
	rule: RuleId,
	sentence: Sentence,
	excerpt: string,
	fix: string,
): Hit {
	return {
		rule,
		sentence,
		excerpt: restore(excerpt, sentence.unit.spans),
		fix,
	};
}

function lower(word: string | undefined): string {
	return (word ?? "").toLowerCase();
}

function window(
	words: readonly string[],
	index: number,
	before = 2,
	after = 3,
): string {
	return words.slice(Math.max(0, index - before), index + after + 1).join(" ");
}

function around(text: string, index: number, length: number): string {
	const start = text.lastIndexOf(" ", Math.max(0, index - 20));
	const end = text.indexOf(" ", Math.min(text.length, index + length + 20));
	return text.slice(start < 0 ? 0 : start + 1, end < 0 ? text.length : end);
}

function isParticiple(word: string): boolean {
	const form = word.toLowerCase();
	return (
		IRREGULAR_PARTICIPLES.has(form) ||
		(/^[a-z]{2,}ed$/.test(form) && !NOT_PARTICIPLE.has(form))
	);
}

function nextContent(
	words: readonly string[],
	from: number,
	span: number,
): number {
	for (
		let index = from;
		index < Math.min(words.length, from + span + 1);
		index++
	) {
		const word = lower(words[index]);
		if (!INTERVENING.has(word) && !/^[a-z]+ly$/.test(word)) return index;
	}
	return -1;
}

function technical(word: string, glossary: Glossary): boolean {
	return glossary.technicalVerbs.has(word.toLowerCase());
}

const sentenceLength: SentenceRule = (sentence) => {
	const limit = LENGTH_LIMITS[sentence.kind];
	const count = sentence.words.length;
	if (count <= limit) return [];
	return [
		hit(
			"sentence-length",
			sentence,
			sentence.words.slice(0, 8).join(" "),
			`${count} words. A ${sentence.kind} sentence has ${limit} words or fewer. Split it.`,
		),
	];
};

const CONTRACTION =
	/\b[A-Za-z]+n['’]t\b|\b[A-Za-z]+['’](?:re|ve|ll|d|m)\b|\b(?:it|that|there|here|what|let|who|where|he|she)['’]s\b/gi;

const IRREGULAR_EXPANSIONS: Readonly<Record<string, string>> = {
	"can't": "cannot",
	"won't": "will not",
	"shan't": "shall not",
	"let's": "let us",
	"i'm": "I am",
};

function expandContraction(form: string): string {
	const plain = form.replace(/’/g, "'");
	const known = IRREGULAR_EXPANSIONS[plain.toLowerCase()];
	if (known) return known;
	return plain
		.replace(/n't$/i, " not")
		.replace(/'re$/i, " are")
		.replace(/'ve$/i, " have")
		.replace(/'ll$/i, " will")
		.replace(/'d$/i, " would")
		.replace(/'m$/i, " am")
		.replace(/'s$/i, " is");
}

const contraction: SentenceRule = (sentence) =>
	[...sentence.text.matchAll(CONTRACTION)].map((match) =>
		hit(
			"contraction",
			sentence,
			match[0],
			`Write "${expandContraction(match[0])}", not "${match[0]}".`,
		),
	);

const semicolon: SentenceRule = (sentence) => {
	const matches = [...sentence.text.matchAll(/;/g)];
	const unitEnd =
		/;\s*(?:and|or)?\s*$/.test(sentence.text) &&
		sentence.unit.text.endsWith(sentence.text);
	const counted = unitEnd ? matches.slice(0, -1) : matches;
	return counted.map((match) =>
		hit(
			"semicolon",
			sentence,
			around(sentence.text, match.index ?? 0, 1),
			"Write two sentences, not a semicolon.",
		),
	);
};

const DASH =
	/—|(?<![\d\uE001])\s–(?!\s?[\d\uE000])|(?<![\d\uE001]\s?)–\s(?![\d\uE000])|\s--\s/g;

const dash: SentenceRule = (sentence) =>
	[...sentence.text.matchAll(DASH)].map((match) =>
		hit(
			"dash",
			sentence,
			around(sentence.text, match.index ?? 0, match[0].length),
			"Use a comma, a colon or a new sentence, not a long dash.",
		),
	);

const LATIN: readonly (readonly [RegExp, string])[] = [
	[/\be\.\s?g\.?(?=[\s,]|$)/gi, '"for example"'],
	[/\bi\.\s?e\.?(?=[\s,]|$)/gi, '"that is"'],
	[/\betc\b\.?/gi, 'the full list, or "and other" plus a noun'],
	[/\bcf\.(?=\s)/gi, '"compare with"'],
	[/\bet al\b\.?/gi, '"and others"'],
	[/\bviz\./gi, '"that is"'],
];

const latin: SentenceRule = (sentence) =>
	LATIN.flatMap(([pattern, use]) =>
		[...sentence.text.matchAll(pattern)].map((match) =>
			hit(
				"latin",
				sentence,
				around(sentence.text, match.index ?? 0, match[0].length),
				`Write ${use}, not "${match[0].trim()}".`,
			),
		),
	);

const andOr: SentenceRule = (sentence) =>
	sentence.text.includes(AND_OR)
		? [
				hit(
					"and-or",
					sentence,
					around(sentence.text, sentence.text.indexOf(AND_OR), 6),
					'Write "A, B, or both", not "and/or".',
				),
			]
		: [];

function labelAt(sentence: Sentence, word: string): boolean {
	return new RegExp(`(?:^|\\s)${word}\\s*:`, "i").test(sentence.text);
}

function inVerbPosition(
	words: readonly string[],
	index: number,
	entry: WordEntry,
	form: string,
): boolean {
	const before = lower(words[index - 1]);
	const next = words[index + 1];
	const after = lower(next);
	const objectFollows =
		next === undefined ||
		VERB_AFTER.has(after) ||
		isPlaceholder(next) ||
		SUBJECT_PRONOUNS.has(after);
	const base = entry.forms.includes(form) && entry.forms[0] === form;
	if (NOUN_SIDE.has(before) || /^\d/.test(before)) return false;
	if (index === 0) return base && objectFollows;
	if (BE.has(before)) return false;
	if (AUXILIARIES.has(before)) return base;
	if (SUBJECT_PRONOUNS.has(before)) return true;
	if (/(?:s|ed)$/.test(form) && !base) return objectFollows;
	if (["and", "then", "or", "also", "first"].includes(before))
		return base && objectFollows;
	return false;
}

function wordRule(entry: WordEntry): RuleId {
	return entry.tier === "deny" ? "word-list" : "word-broad";
}

const wordList: SentenceRule = (sentence, glossary) => {
	const words = sentence.words.flatMap((word, index) => {
		const form = word.toLowerCase();
		const entry = FORMS.get(form);
		if (!entry || isPlaceholder(word)) return [];
		if (technical(form, glossary) || technical(entry.forms[0] ?? "", glossary))
			return [];
		if (entry.position === "verb") {
			if (labelAt(sentence, word)) return [];
			if (!inVerbPosition(sentence.words, index, entry, form)) return [];
		}
		return [
			hit(
				wordRule(entry),
				sentence,
				window(sentence.words, index),
				`Use ${entry.use}, not "${word}".`,
			),
		];
	});
	const phrases = PHRASES.flatMap((entry) => {
		const match = entry.phrase.exec(sentence.text);
		if (!match) return [];
		return [
			hit(
				entry.tier === "deny" ? "word-list" : "word-broad",
				sentence,
				around(sentence.text, match.index, match[0].length),
				`Use ${entry.use}, not "${match[0].trim()}".`,
			),
		];
	});
	return [...words, ...phrases];
};

const perfect: SentenceRule = (sentence) =>
	sentence.words.flatMap((word, index) => {
		if (!HAVE.has(word.toLowerCase())) return [];
		const target = nextContent(sentence.words, index + 1, 2);
		const verb = sentence.words[target];
		if (target < 0 || verb === undefined || !isParticiple(verb)) return [];
		return [
			hit(
				"perfect",
				sentence,
				window(sentence.words, index, 1, target - index),
				`Use the simple past or the simple present, not "${word} ${verb}".`,
			),
		];
	});

const progressive: SentenceRule = (sentence, glossary) =>
	sentence.words.flatMap((word, index) => {
		if (!BE.has(word.toLowerCase())) return [];
		const target = nextContent(sentence.words, index + 1, 2);
		const verb = lower(sentence.words[target]);
		if (
			target < 0 ||
			!/^[a-z]{3,}ing$/.test(verb) ||
			ING_NOT_PROGRESSIVE.has(verb) ||
			technical(verb, glossary)
		)
			return [];
		return [
			hit(
				"progressive",
				sentence,
				window(sentence.words, index, 1, target - index),
				`Use the simple present, not "${word} ${verb}".`,
			),
		];
	});

const modal: SentenceRule = (sentence) =>
	sentence.words.flatMap((word, index) => {
		const form = word.toLowerCase();
		if (word === "May" && index > 0) return [];
		if (DENY_STYLE_MODALS.has(form))
			return [
				hit(
					"modal",
					sentence,
					window(sentence.words, index),
					`Use "must" for a rule or "can" for a possibility, not "${word}".`,
				),
			];
		if (SOFT_MODALS.has(form))
			return [
				hit(
					"modal",
					sentence,
					window(sentence.words, index),
					`Use "can", or give the condition, not "${word}".`,
				),
			];
		return [];
	});

const passive: SentenceRule = (sentence) =>
	sentence.words.flatMap((word, index) => {
		const form = word.toLowerCase();
		if (!BE.has(form) || form === "being") return [];
		const target = nextContent(sentence.words, index + 1, 2);
		const verb = lower(sentence.words[target]);
		if (target < 0 || !isParticiple(verb) || ADJECTIVAL_PARTICIPLES.has(verb))
			return [];
		const modalBefore =
			form === "be" && MODALS.has(lower(sentence.words[index - 1]));
		const excerpt = window(sentence.words, index, 1, target - index);
		if (modalBefore && sentence.kind === "procedural")
			return [
				hit(
					"passive",
					sentence,
					excerpt,
					`Give the command in the active voice, not "${sentence.words[index - 1]} be ${verb}".`,
				),
			];
		const agent = sentence.words
			.slice(target + 1, target + 4)
			.some((next) => next.toLowerCase() === "by");
		return [
			hit(
				"passive",
				sentence,
				excerpt,
				agent
					? `Make the actor after "by" the subject, not "${word} ${verb}".`
					: `Name the actor if you know it, not "${word} ${verb}".`,
			),
		];
	});

const ingForm: SentenceRule = (sentence, glossary) =>
	sentence.words.flatMap((word, index) => {
		const form = word.toLowerCase();
		if (
			!/^[a-z]{3,}ing$/.test(form) ||
			word !== form ||
			ING_NOT_VERB.has(form) ||
			FORMS.has(form) ||
			technical(form, glossary) ||
			BE.has(lower(sentence.words[index - 1]))
		)
			return [];
		return [
			hit(
				"ing-form",
				sentence,
				window(sentence.words, index),
				`Use a verb in the simple present or a noun, not "${word}".`,
			),
		];
	});

const ADJECTIVE_ENDINGS =
	/(?:al|ive|ous|able|ible|ful|less|ic|ary|ish|ent|ant|est|ly|ed|ing|'s|’s)$/;
const NOUN_ENDINGS = /(?:ment|ion|er|or|ance|ence|ness|ity)s?$/;

function nounLike(word: string, next: string | undefined): boolean {
	if (isPlaceholder(word)) return true;
	const form = word.toLowerCase();
	if (/[a-z]s$/.test(form) && DETERMINERS.has(lower(next))) return false;
	if (
		FUNCTION_WORDS.has(form) ||
		DETERMINERS.has(form) ||
		INTERVENING.has(form) ||
		IMPERATIVES.has(form) ||
		BE.has(form) ||
		HAVE.has(form) ||
		MODALS.has(form) ||
		/^\d/.test(form)
	)
		return false;
	return !ADJECTIVE_ENDINGS.test(form) || NOUN_ENDINGS.test(form);
}

const nounCluster: SentenceRule = (sentence) =>
	sentence.text.split(/[,;:()[\]"“”]|\s[-–—]\s/).flatMap((chunk) => {
		const words = tokens(chunk);
		const runs: string[][] = [];
		let run: string[] = [];
		for (const [index, word] of words.entries()) {
			if (nounLike(word, words[index + 1])) run.push(word);
			else {
				if (run.length > 3) runs.push(run);
				run = [];
			}
		}
		if (run.length > 3) runs.push(run);
		return runs.map((cluster) =>
			hit(
				"noun-cluster",
				sentence,
				cluster.join(" "),
				`Use 3 nouns in a row or fewer. Add "of", "for" or a verb to "${restore(cluster.join(" "), sentence.unit.spans)}".`,
			),
		);
	});

const oneInstruction: SentenceRule = (sentence) => {
	if (sentence.kind !== "procedural") return [];
	return sentence.words.flatMap((word, index) => {
		if (index === 0 || !["and", "then"].includes(word.toLowerCase())) return [];
		const step =
			lower(sentence.words[index + 1]) === "then" ? index + 2 : index + 1;
		const verb = lower(sentence.words[step]);
		const object = lower(sentence.words[step + 1]);
		if (!IMPERATIVES.has(verb) || !DETERMINERS.has(object)) return [];
		return [
			hit(
				"one-instruction",
				sentence,
				window(sentence.words, index),
				"Write one instruction in each sentence.",
			),
		];
	});
};

const hedge: SentenceRule = (sentence) => {
	const count = sentence.words.filter((word) =>
		HEDGES.has(word.toLowerCase()),
	).length;
	if (count < 2) return [];
	return [
		hit(
			"hedge",
			sentence,
			sentence.words.slice(0, 8).join(" "),
			`Keep one hedge word or give the fact. This sentence has ${count}.`,
		),
	];
};

const SYMBOL = /→|⇒|=>|≈|(?<=\s)&(?=\s)|\bvs\b\.?/g;

const symbol: SentenceRule = (sentence) =>
	[...sentence.text.matchAll(SYMBOL)].map((match) =>
		hit(
			"symbol",
			sentence,
			around(sentence.text, match.index ?? 0, match[0].length),
			`Write words, not "${match[0]}".`,
		),
	);

export function paragraphLength(
	sentences: readonly Sentence[],
): readonly Hit[] {
	const first = sentences[0];
	if (!first || sentences.length <= PARAGRAPH_LIMIT) return [];
	return [
		hit(
			"paragraph-length",
			first,
			first.words.slice(0, 8).join(" "),
			`${sentences.length} sentences. A paragraph has ${PARAGRAPH_LIMIT} sentences or fewer.`,
		),
	];
}

export const SENTENCE_RULES: readonly SentenceRule[] = [
	contraction,
	semicolon,
	dash,
	latin,
	andOr,
	sentenceLength,
	wordList,
	perfect,
	progressive,
	modal,
	passive,
	oneInstruction,
	ingForm,
	nounCluster,
	hedge,
	symbol,
];
