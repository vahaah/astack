import type { Basis } from "./types.ts";

export type Position = "any" | "verb";

export type WordTier = "deny" | "advise";

export type WordEntry = {
	readonly forms: readonly string[];
	readonly use: string;
	readonly position: Position;
	readonly basis: Basis;
	readonly tier: WordTier;
	readonly pass: string;
	readonly fail: string;
};

export type PhraseEntry = {
	readonly phrase: RegExp;
	readonly use: string;
	readonly basis: Basis;
	readonly tier: WordTier;
	readonly pass: string;
	readonly fail: string;
};

const FAQ: Basis = {
	kind: "ste-public",
	citation: "asd-ste100.org STE FAQ",
};
const TECHSCRIBE: Basis = {
	kind: "ste-public",
	citation: "techscribe.co.uk ASD-STE100 summary",
};
const CHECKERS: Basis = { kind: "ste-checkers" };
const HOUSE: Basis = { kind: "house" };

function word(
	tier: WordTier,
	forms: string,
	use: string,
	basis: Basis,
	position: Position,
	pass: string,
	fail: string,
): WordEntry {
	return {
		forms: forms.split(" "),
		use,
		position,
		basis,
		tier,
		pass,
		fail,
	};
}

export const WORDS: readonly WordEntry[] = [
	word(
		"deny",
		"ensure ensures ensured ensuring",
		'"make sure"',
		TECHSCRIBE,
		"any",
		"Make sure that the port is free.",
		"Ensure that the port is free.",
	),
	word(
		"deny",
		"utilize utilizes utilized utilizing utilization utilise utilises utilised utilising utilisation",
		'"use"',
		CHECKERS,
		"any",
		"The job uses two workers.",
		"The job utilizes two workers.",
	),
	word(
		"deny",
		"leverage leverages leveraged leveraging",
		'"use"',
		HOUSE,
		"verb",
		"Use the cache for each read.",
		"Leverage the cache for each read.",
	),
	word(
		"deny",
		"facilitate facilitates facilitated facilitating",
		'"help" or "make easy"',
		CHECKERS,
		"any",
		"The index helps the search.",
		"The index facilitates the search.",
	),
	word(
		"deny",
		"commence commences commenced commencing",
		'"start"',
		FAQ,
		"any",
		"The import starts at midnight.",
		"The import commences at midnight.",
	),
	word(
		"deny",
		"whilst",
		'"while"',
		HOUSE,
		"any",
		"Keep the lock while the job runs.",
		"Keep the lock whilst the job runs.",
	),
	word(
		"deny",
		"amongst",
		'"among"',
		HOUSE,
		"any",
		"The file is among the inputs.",
		"The file is amongst the inputs.",
	),
	word(
		"deny",
		"additionally",
		'"also"',
		HOUSE,
		"any",
		"The tool also writes a log.",
		"Additionally, the tool writes a log.",
	),
	word(
		"advise",
		"verify verifies verified",
		'"make sure" or "examine"',
		TECHSCRIBE,
		"verb",
		"The verified flag is true.",
		"We verify the hash before the upload.",
	),
	word(
		"advise",
		"confirm confirms confirmed",
		'"make sure"',
		TECHSCRIBE,
		"verb",
		"Make sure that the version is correct.",
		"Confirm the version before the release.",
	),
	word(
		"advise",
		"check checks checked",
		'"make sure", "examine" or "do a check"',
		FAQ,
		"verb",
		"Do a check of the logs.",
		"Check the logs before you merge.",
	),
	word(
		"advise",
		"begin begins began begun",
		'"start"',
		FAQ,
		"any",
		"The sync starts at noon.",
		"The sync begins at noon.",
	),
	word(
		"advise",
		"initiate initiates initiated originate originates originated",
		'"start"',
		FAQ,
		"any",
		"The client starts the call.",
		"The client initiates the call.",
	),
	word(
		"advise",
		"accomplish accomplishes accomplished achieve achieves achieved",
		'"do" or "get"',
		FAQ,
		"any",
		"The script does the same work.",
		"The script achieves the same result.",
	),
	word(
		"advise",
		"perform performs performed",
		'"do"',
		CHECKERS,
		"any",
		"The worker does the merge.",
		"The worker performs the merge.",
	),
	word(
		"advise",
		"assist assists assisted",
		'"help"',
		CHECKERS,
		"any",
		"The guide helps new users.",
		"The guide assists new users.",
	),
	word(
		"advise",
		"obtain obtains obtained",
		'"get"',
		CHECKERS,
		"any",
		"Get a token from the vault.",
		"Obtain a token from the vault.",
	),
	word(
		"advise",
		"attempt attempts attempted",
		'"try"',
		CHECKERS,
		"verb",
		"The first attempt failed.",
		"The client attempts the call again.",
	),
	word(
		"advise",
		"prior",
		'"before"',
		CHECKERS,
		"any",
		"Run the tests before the merge.",
		"Run the tests prior to the merge.",
	),
	word(
		"advise",
		"subsequent subsequently",
		'"after" or "then"',
		CHECKERS,
		"any",
		"Then the job writes the file.",
		"Subsequently, the job writes the file.",
	),
	word(
		"advise",
		"numerous",
		'"many"',
		HOUSE,
		"any",
		"The log has many lines.",
		"The log has numerous lines.",
	),
	word(
		"advise",
		"additional",
		'"more"',
		HOUSE,
		"any",
		"Add more tests.",
		"Add additional tests.",
	),
	word(
		"advise",
		"enhance enhances enhanced enhancing",
		'"improve"',
		HOUSE,
		"any",
		"The patch improves the search.",
		"The patch enhances the search.",
	),
	word(
		"advise",
		"robust seamless seamlessly comprehensive",
		"a specific fact",
		HOUSE,
		"any",
		"The parser accepts empty files.",
		"The parser is robust.",
	),
	word(
		"advise",
		"simply easily basically actually really",
		"no word. Delete it",
		HOUSE,
		"any",
		"Run the script.",
		"Simply run the script.",
	),
	word(
		"advise",
		"regarding concerning",
		'"about"',
		CHECKERS,
		"any",
		"The note is about the cache.",
		"The note is regarding the cache.",
	),
	word(
		"advise",
		"via",
		'"through", "with" or "by"',
		HOUSE,
		"any",
		"Send the file through the queue.",
		"Send the file via the queue.",
	),
	word(
		"advise",
		"delve delves crucial pivotal showcase showcases underscore underscores tapestry vibrant garner garners intricate interplay testament",
		"a plain word",
		HOUSE,
		"any",
		"The test is important.",
		"The test is crucial.",
	),
];

export const PHRASES: readonly PhraseEntry[] = [
	{
		phrase: /\bin order to\b/i,
		use: '"to"',
		basis: HOUSE,
		tier: "deny",
		pass: "Restart the job to clear the cache.",
		fail: "Restart the job in order to clear the cache.",
	},
	{
		phrase: /\bdue to the fact that\b/i,
		use: '"because"',
		basis: HOUSE,
		tier: "deny",
		pass: "The job failed because the disk was full.",
		fail: "The job failed due to the fact that the disk was full.",
	},
	{
		phrase: /\bin the event that\b/i,
		use: '"if"',
		basis: HOUSE,
		tier: "advise",
		pass: "If the job fails, the queue stops.",
		fail: "In the event that the job fails, the queue stops.",
	},
	{
		phrase: /\bat this point in time\b/i,
		use: '"now"',
		basis: HOUSE,
		tier: "advise",
		pass: "The queue is empty now.",
		fail: "The queue is empty at this point in time.",
	},
	{
		phrase: /\bit is (?:important|worth) (?:to note|noting) that\b/i,
		use: "no words. Give the fact",
		basis: HOUSE,
		tier: "advise",
		pass: "The cache expires after one hour.",
		fail: "It is worth noting that the cache expires after one hour.",
	},
	{
		phrase: /\bcarr(?:y|ies|ied) out\b/i,
		use: '"do"',
		basis: FAQ,
		tier: "advise",
		pass: "The worker does the migration.",
		fail: "The worker carries out the migration.",
	},
	{
		phrase: /\babout (?=\d)/i,
		use: '"approximately" before a number. "About" means "concerned with"',
		basis: FAQ,
		tier: "advise",
		pass: "Approximately 40 files changed.",
		fail: "About 40 files changed.",
	},
];

export const FORMS: ReadonlyMap<string, WordEntry> = new Map(
	WORDS.flatMap((entry) => entry.forms.map((form) => [form, entry] as const)),
);
