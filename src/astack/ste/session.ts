import { sessionAttended } from "../attended.ts";

type Env = Readonly<Record<string, string | undefined>>;

const TEST_INTERACTIVE = "ASTACK_STE_TEST_INTERACTIVE";

const HARNESS_WRAPPER = /^\s*<[a-z][\w-]*(?:\s[^>]*)?>/;

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

export function humanPrompt(
	source: string | undefined,
	text: string,
	env: Env,
	crons: readonly string[] = [],
): boolean {
	if (source !== undefined) return source === "user";
	if (!replyInteractive(env) || HARNESS_WRAPPER.test(text)) return false;
	return !crons.some((cron) => cronPromptMatches(text, cron));
}
