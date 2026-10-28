import { isPlaceholder } from "./mask.ts";
import { tokens } from "./sentences.ts";
import type { Unit } from "./types.ts";

const NON_LATIN_SHARE = 0.3;
const FOREIGN_MIN = 2;

function set(words: string): ReadonlySet<string> {
	return new Set(words.split(/\s+/).filter(Boolean));
}

const ENGLISH = set(`
the a and or but not no nor of to on at by for from with without into onto over under about after
before between through during are were be been being am do does did has have had would can could
must should shall may might it its this that these those there here they them their we our us you
your he she his her him i my me what which who whom whose when where why how if then than as all
any each every some more most only just now yet still very both either neither such same other
another one it's i'm we're they're you're don't doesn't isn't aren't can't won't
`);

const FOREIGN = set(`
der das und ist nicht ein eine einen einem einer auf für ich wir sie sind wird werden wurde wurden
kann können muss müssen oder aber bei nach zum zur vom dem den des auch noch schon jetzt alle alles
nur sich dass weil wenn wie hier gibt habe haben keine kein nein fertig erledigt läuft danke bitte
le la les est et une pas avec dans sur qui que sont nous vous ils elle cette mais aussi très tous
toutes tout été être ont sera peut merci oui voilà fini terminé ça au ces leur leurs encore déjà ici
c'est n'est j'ai d'un d'une qu'il s'il
los las una uno para por pero también como está están esta este eso ya muy todas sí listo hecho
gracias funciona ahora aquí más cuando porque sobre fue puede tiene
il gli della delle dello degli nel nella sono che anche questo questa più già fatto tutto tutti
grazie adesso bene ancora perché
não uma mas são foi feito obrigado tudo isso isto muito já ainda
het een niet zijn ook maar voor dat klaar gedaan goed geen deze worden wordt hebben heeft bedankt
werkt nog
`);

const ACCENTED = /[\u00C0-\u024F]/;
const LOWER_START = /^\p{Ll}/u;

function normal(word: string): string {
	return word.toLowerCase().replaceAll("\u2019", "'");
}

function foreignWord(word: string): boolean {
	const lower = normal(word);
	if (ENGLISH.has(lower)) return false;
	return FOREIGN.has(lower) || (LOWER_START.test(word) && ACCENTED.test(word));
}

function words(units: readonly Unit[]): readonly string[] {
	return units
		.flatMap((unit) => tokens(unit.text))
		.filter((word) => !isPlaceholder(word));
}

export function nonLatin(units: readonly Unit[]): boolean {
	const text = units.map((unit) => unit.text).join(" ");
	const letters = text.match(/\p{L}/gu)?.length ?? 0;
	const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
	return letters > 0 && (letters - latin) / letters > NON_LATIN_SHARE;
}

export function foreignWords(units: readonly Unit[]): number {
	return words(units).filter(foreignWord).length;
}

export function otherLatinLanguage(units: readonly Unit[]): boolean {
	const all = words(units);
	const foreign = all.filter(foreignWord).length;
	const english = all.filter((word) => ENGLISH.has(normal(word))).length;
	return foreign >= FOREIGN_MIN && foreign > english;
}
