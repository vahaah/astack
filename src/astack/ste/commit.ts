import { resolve } from "node:path";
import type { Word } from "../shell.ts";

export type CommitMessage =
	| { readonly kind: "none" }
	| { readonly kind: "dynamic" }
	| { readonly kind: "static"; readonly text: string };

const REUSE_FLAGS = new Set([
	"-C",
	"-c",
	"--reuse-message",
	"--reedit-message",
	"--fixup",
	"--squash",
	"-t",
	"--template",
]);

const VALUE_FLAGS = new Set([
	"--author",
	"--date",
	"--trailer",
	"--cleanup",
	"--pathspec-from-file",
	"-S",
	"--gpg-sign",
]);

const GENERATED = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;
const CONVENTIONAL = /^[a-z]+(?:\([^)]*\))?!?:\s+/;
const TRAILER = /^[A-Za-z][\w-]*: \S/;

type Part =
	| { readonly kind: "text"; readonly word: Word }
	| { readonly kind: "file"; readonly word: Word }
	| { readonly kind: "reuse" };

function parts(args: readonly Word[]): readonly Part[] {
	const found: Part[] = [];
	for (let index = 0; index < args.length; index++) {
		const word = args[index];
		if (!word) continue;
		const value = word.value;
		if (value === "--") break;
		const long = /^--(message|file)=(.*)$/s.exec(value);
		if (long) {
			const inner = { value: long[2] ?? "", dynamic: word.dynamic };
			found.push({ kind: long[1] === "file" ? "file" : "text", word: inner });
			continue;
		}
		if (value === "--message" || value === "--file") {
			const next = args[++index];
			if (next)
				found.push({ kind: value === "--file" ? "file" : "text", word: next });
			continue;
		}
		if (REUSE_FLAGS.has(value) || /^--(?:fixup|squash)=/.test(value)) {
			found.push({ kind: "reuse" });
			continue;
		}
		if (VALUE_FLAGS.has(value)) {
			index++;
			continue;
		}
		const short = /^-([A-Za-z]+)(.*)$/s.exec(value);
		if (!short || value.startsWith("--")) continue;
		const letters = short[1] ?? "";
		const at = [...letters].findIndex((letter) => "mFCct".includes(letter));
		if (at < 0) continue;
		const letter = letters[at] ?? "";
		const attached = `${letters.slice(at + 1)}${short[2] ?? ""}`;
		if ("Cct".includes(letter)) {
			found.push({ kind: "reuse" });
			continue;
		}
		const target =
			attached !== ""
				? { value: attached, dynamic: word.dynamic }
				: args[++index];
		if (target)
			found.push({ kind: letter === "F" ? "file" : "text", word: target });
	}
	return found;
}

export function commitMessage(
	args: readonly Word[],
	stdin: string | undefined,
	dir: string,
	readText: (path: string) => string | undefined,
): CommitMessage {
	const found = parts(args);
	if (found.length === 0 || found.some((part) => part.kind === "reuse"))
		return { kind: "none" };
	const texts: string[] = [];
	for (const part of found) {
		if (part.kind === "reuse") return { kind: "none" };
		if (part.word.dynamic) return { kind: "dynamic" };
		if (part.kind === "text") {
			texts.push(part.word.value);
			continue;
		}
		const content =
			part.word.value === "-" ? stdin : readText(resolve(dir, part.word.value));
		if (content === undefined) return { kind: "dynamic" };
		texts.push(content);
	}
	return { kind: "static", text: texts.join("\n\n") };
}

export function commitProse(message: string): string | undefined {
	const lines = message
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => !line.startsWith("#"));
	while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "")
		lines.pop();
	let end = lines.length;
	while (end > 1 && TRAILER.test(lines[end - 1] ?? "")) end--;
	const trailers = end < lines.length && (lines[end - 1] ?? "").trim() === "";
	const kept = trailers ? lines.slice(0, end) : lines;
	const subject = (kept[0] ?? "").trim();
	if (subject === "" || GENERATED.test(subject)) return undefined;
	const body = kept.slice(1).join("\n").trimEnd();
	return `${subject.replace(CONVENTIONAL, "")}\n${body}`;
}

export const SUBJECT_LINES: readonly number[] = [1];
