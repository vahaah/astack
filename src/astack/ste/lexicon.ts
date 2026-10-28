function set(words: string): ReadonlySet<string> {
	return new Set(words.split(/\s+/).filter(Boolean));
}

export const BE = set("am is are was were be been being");

export const HAVE = set("have has had");

export const MODALS = set(
	"must can will should shall may might could would cannot",
);

export const DENY_STYLE_MODALS = set("should shall ought");

export const SOFT_MODALS = set("might could would may");

export const SUBJECT_PRONOUNS = set("i we you they he she it");

export const AUXILIARIES = set(
	"to must can will should shall may might could would do does did don't doesn't didn't cannot can't won't please not",
);

export const INTERVENING = set(
	"not never also still now then already just only always often usually all both each first again probably actually really fully partly",
);

export const IRREGULAR_PARTICIPLES = set(`
been done gone made seen taken written built run found got gotten given kept left lost put read said
sent set shown split thrown known begun broken chosen driven drawn fallen held hidden led met paid shut
sold spent stood told thought understood won worn bound brought bought caught dealt fed felt fought hung
hit hurt laid lit meant quit rewritten overridden spun stuck swept taught torn woken cut let become come
forgotten frozen grown risen shaken spoken stolen sworn undone withdrawn
`);

export const NOT_PARTICIPLE = set(
	"need feed seed speed bed red shed embed proceed exceed succeed indeed breed hundred sacred kindred bleed weed greed shred",
);

export const ADJECTIVAL_PARTICIPLES = set(`
based located required supposed used allowed enabled disabled installed configured done gone set named
called related concerned interested involved exposed scheduled blocked merged closed signed logged
connected deprecated expected unknown known shared owed covered aligned built limited fixed dated
added unchanged unset pinned generated detached nested finished complete tired married supported
experienced advanced qualified dedicated sized typed versioned scoped bounded tested released
`);

const NON_VERB_ING = set(`
thing things something nothing anything everything string strings during morning evening king ring
spring wing sibling ceiling bring sting swing cling sling fling ding ping wedding pudding
`);

const ADJECTIVAL_ING = set(`
missing remaining pending existing interesting misleading outstanding according including following
upcoming incoming outgoing ongoing boring willing
`);

const NOMINAL_ING = set(`
thinking opening ending heading headings setting settings building buildings warning warnings meaning
meanings listing routing logging rendering testing staging binding bindings mapping mappings caching
pricing billing branding onboarding padding spacing tracing timing ranking hosting rating parsing
linting polling pairing packing booking bookings posting rounding sourcing bundling funding spending
drawing wording feeling finding findings grilling planning writing reading training learning naming
versioning scoping batching tooling matching drafting scheduling understanding beginning engineering
marketing accounting housing clothing railing offering offerings gathering stuffing frosting coating
painting paintings recording recordings proceedings surroundings savings earnings belongings
`);

export const ING_NOT_VERB: ReadonlySet<string> = new Set([
	...NON_VERB_ING,
	...ADJECTIVAL_ING,
	...NOMINAL_ING,
]);

export const ING_NOT_PROGRESSIVE: ReadonlySet<string> = new Set([
	...NON_VERB_ING,
	...ADJECTIVAL_ING,
]);

export const IMPERATIVES = set(`
add apply ask build call change check choose clone close copy create cut define delete describe do
drop edit enable disable export fill find fix follow give go install keep leave let link list load
look make mark merge move name note open pass pick point prefer push put read record remove rename
replace report return review rewrite run save say see send set show skip split start state stop take
tell treat try turn update use wait write file flag quote refuse resume score settle spawn lint test
deploy commit rebase reply answer attach cite count prove print paste type press select click enter
pull fetch get stage ship deliver mention measure compare post close resolve restore revert retry
avoid ignore confirm verify ensure append insert include exclude wrap unwrap trim sort group log
explain summarize summarise draft plan grill hand load reset rerun land bump pin unpin tag
clear restart refresh rotate drain mount unmount scale sync
`);

export const DETERMINERS = set(`
the a an all both each every this that these those any no it them its their your our my his her one
two three four five some only and to from as with until when if for on in at off out up down what
which who how why whether not more less nothing anything everything something yourself us me him back
over through by into again here there now first also
`);

export const NOUN_SIDE = set(`
a an the this that each every no one its their our your his her any first second last type health
status spot double same quick final full real manual visual code unit spell lint pre post
`);

export const VERB_AFTER = set(
	"the a an that whether if it them each every all your its their out both what how which this these those",
);

export const HEDGES = set(
	"might may could possibly potentially perhaps probably likely seems appears arguably maybe",
);

export const FUNCTION_WORDS = set(`
of or but nor so than then too very do does did done not i you he she we they per via about after
before under between without within across against along around behind below beside beyond during
except inside near outside since toward upon while where because although though unless once just
even still yet own same other such many much few most new old next last
`);

export const DEFAULT_TECHNICAL_VERBS: readonly string[] = [
	"test",
	"lint",
	"build",
	"deploy",
	"commit",
	"merge",
	"push",
	"pull",
	"rebase",
	"render",
	"parse",
	"bundle",
	"cache",
	"fetch",
	"query",
	"log",
	"port",
	"patch",
	"stage",
	"ship",
	"seed",
	"mock",
	"hydrate",
	"prefetch",
	"batch",
	"migrate",
];
