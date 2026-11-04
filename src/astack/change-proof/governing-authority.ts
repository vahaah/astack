import { err, ok, type Result } from "../result.ts";

export interface GoverningTexts {
	readonly integration: string;
	readonly base: string;
	readonly candidate: string;
}

type AuthorityView = keyof GoverningTexts;

export type GoverningProblem =
	| {
			readonly kind: "invalid-landed-header";
			readonly view: AuthorityView;
			readonly reason: string;
	  }
	| {
			readonly kind: "changed-authority";
			readonly view: "integration" | "base";
	  };

interface ProtectedText {
	readonly before: string;
	readonly after: string;
}

function landedAuthority(text: string): Result<ProtectedText, string> {
	for (let index = 0; index < text.length; index++) {
		const point = text.charCodeAt(index);
		if (
			(point < 0x20 && point !== 0x09 && point !== 0x0a && point !== 0x0d) ||
			(point >= 0x7f && point <= 0x9f) ||
			point === 0x2028 ||
			point === 0x2029
		)
			return err("contains a control character or line separator");
	}
	const lines: { readonly start: number; readonly text: string }[] = [];
	let offset = 0;
	while (offset < text.length) {
		const newline = text.indexOf("\n", offset);
		const end = newline < 0 ? text.length : newline;
		const contentEnd = end > offset && text[end - 1] === "\r" ? end - 1 : end;
		const line = text.slice(offset, contentEnd);
		if (line.includes("\r") || (newline < 0 && contentEnd !== end))
			return err("contains a lone carriage return");
		lines.push({ start: offset, text: line });
		offset = newline < 0 ? text.length : newline + 1;
	}
	const first = lines[0];
	if (first === undefined || !/^#[ \t]+\S/u.test(first.text))
		return err("requires an initial top-level title");
	const reserved =
		/^(?:[ \t]|>[ \t]?|[-+*][ \t]+|\d+[.)][ \t]+)*(?:\*\*)?landed[ \t]*:(?:\*\*)?(?:[ \t]|$)/i;
	if (lines.filter((line) => reserved.test(line.text)).length !== 1)
		return err("requires one unambiguous Landed header");
	const body = lines.findIndex(
		(line, index) => index > 0 && /^#{2,6}[ \t]+\S/u.test(line.text),
	);
	const separator = lines[body - 1];
	if (body < 0 || separator === undefined || !/^[ \t]*$/u.test(separator.text))
		return err("requires a blank separator before the body heading");
	let protectedText: ProtectedText | undefined;
	for (const line of lines.slice(1, body)) {
		if (/^[ \t]*$/u.test(line.text)) continue;
		if (line.text.includes("<!--") || line.text.includes("-->"))
			return err("does not permit HTML comments in the metadata preamble");
		const field =
			/^((?:[A-Za-z][A-Za-z0-9 _-]*:|- \*\*[A-Za-z][A-Za-z0-9 _-]*:\*\*)[ \t]+)(\S(?:.*\S)?)([ \t]*)$/u.exec(
				line.text,
			);
		const prefix = field?.[1];
		const value = field?.[2];
		const trailing = field?.[3];
		if (prefix === undefined || value === undefined || trailing === undefined)
			return err("requires flat single-line metadata fields");
		if (!/^(?:Landed:|- \*\*Landed:\*\*)[ \t]+$/u.test(prefix)) continue;
		if (
			value.includes("<") ||
			value.includes("```") ||
			value.includes("~~~") ||
			value.endsWith("\\") ||
			trailing.length > 1
		)
			return err(
				"requires a single-line Landed scalar without markup continuations",
			);
		const start = line.start + prefix.length;
		protectedText = {
			before: text.slice(0, start),
			after: text.slice(start + value.length),
		};
	}
	return protectedText === undefined
		? err("requires the canonical Landed header in the metadata preamble")
		: ok(protectedText);
}

export function compareLandedAuthority(
	texts: GoverningTexts,
): Result<undefined, GoverningProblem> {
	const current = landedAuthority(texts.candidate);
	if (!current.ok)
		return err({
			kind: "invalid-landed-header",
			view: "candidate",
			reason: current.error,
		});
	const integrated = landedAuthority(texts.integration);
	if (!integrated.ok)
		return err({
			kind: "invalid-landed-header",
			view: "integration",
			reason: integrated.error,
		});
	const base = landedAuthority(texts.base);
	if (!base.ok)
		return err({
			kind: "invalid-landed-header",
			view: "base",
			reason: base.error,
		});
	for (const [view, previous] of [
		["integration", integrated.value],
		["base", base.value],
	] as const) {
		if (
			previous.before !== current.value.before ||
			previous.after !== current.value.after
		)
			return err({ kind: "changed-authority", view });
	}
	return ok(undefined);
}
