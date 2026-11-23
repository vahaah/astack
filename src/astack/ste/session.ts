import { sessionAttended } from "../attended.ts";
import type { Env } from "../process.ts";

const TEST_INTERACTIVE = "ASTACK_STE_TEST_INTERACTIVE";

const TAG_FRAME = /^<[a-z][\w-]*(?:\s[^>]*)?>/;

const LABEL_FRAME = /^\[[A-Za-z][^\]\n]*\](?!\()/;

const CLIP_MARKER = /… \[\+\d+ chars\]$/;

export function replyInteractive(env: Env): boolean {
	return env[TEST_INTERACTIVE] === "1" || sessionAttended(env);
}

export function cronPromptMatches(text: string, cron: string): boolean {
	const prompt = text.trim();
	const stored = cron.trim();
	if (stored === "") return false;
	const clipped = CLIP_MARKER.exec(stored);
	return clipped === null
		? prompt === stored
		: prompt.startsWith(stored.slice(0, clipped.index));
}

function opensWithHarnessFrame(text: string): boolean {
	const opening = text.trimStart();
	return TAG_FRAME.test(opening) || LABEL_FRAME.test(opening);
}

export function humanPrompt(
	source: string | undefined,
	text: string,
	attended: boolean,
	crons: readonly string[] = [],
): boolean {
	if (source !== undefined) return source === "user";
	if (!attended || opensWithHarnessFrame(text)) return false;
	return !crons.some((cron) => cronPromptMatches(text, cron));
}
