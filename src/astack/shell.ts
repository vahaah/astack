import { resolve } from "node:path";

export interface Word {
	value: string;
	dynamic: boolean;
}

export interface Redirect {
	op: string;
	fd: string | undefined;
	target: Word;
}

export interface SimpleCommand {
	words: Word[];
	stdin: string | undefined;
	redirects: Redirect[];
	piped?: boolean;
}

const HEREDOC_SUBSTITUTION =
	/^\$\(\s*cat\s*<<(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2[ \t]*\n([\s\S]*?)\n[ \t]*\3[ \t]*\n?\s*\)/;

function matchingParen(src: string, from: number): number {
	let depth = 1;
	let i = from;
	while (i < src.length && depth > 0) {
		const c = src[i];
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (c === "'" || c === '"') {
			const close = src.indexOf(c, i + 1);
			i = close < 0 ? src.length : close + 1;
			continue;
		}
		if (c === "(") depth++;
		else if (c === ")") depth--;
		i++;
	}
	return i;
}

function stripTabs(body: string, strip: boolean): string {
	return strip ? body.replace(/^\t+/gm, "") : body;
}

export function parseShell(src: string): SimpleCommand[] {
	const commands: SimpleCommand[] = [];
	let words: Word[] = [];
	let word: Word | undefined;
	let pendingHeredocs: {
		tag: string;
		strip: boolean;
		command: SimpleCommand;
	}[] = [];
	let redirectNext: Omit<Redirect, "target"> | undefined;
	let hereStringNext: SimpleCommand | undefined;
	let current: SimpleCommand = { words, stdin: undefined, redirects: [] };
	let i = 0;

	const append = (text: string, dynamic = false): void => {
		word ??= { value: "", dynamic: false };
		word.value += text;
		if (dynamic) word.dynamic = true;
	};
	const endWord = (): void => {
		if (!word) return;
		if (hereStringNext) {
			hereStringNext.stdin = word.value;
			hereStringNext = undefined;
		} else if (redirectNext) {
			current.redirects.push({ ...redirectNext, target: word });
			redirectNext = undefined;
		} else {
			words.push(word);
		}
		word = undefined;
	};
	const endCommand = (): void => {
		endWord();
		if (words.length > 0) commands.push(current);
		words = [];
		current = { words, stdin: undefined, redirects: [] };
	};
	const substitution = (): void => {
		const heredoc = HEREDOC_SUBSTITUTION.exec(src.slice(i));
		if (heredoc) {
			append(stripTabs(heredoc[4] ?? "", heredoc[1] === "-"));
			i += heredoc[0].length;
			return;
		}
		i = matchingParen(src, i + 2);
		append("", true);
	};

	while (i < src.length) {
		const c = src[i] ?? "";
		if (c === "\n") {
			endCommand();
			i++;
			for (const doc of pendingHeredocs) {
				const lines: string[] = [];
				while (i < src.length) {
					const eol = src.indexOf("\n", i);
					const line = src.slice(i, eol < 0 ? src.length : eol);
					i = eol < 0 ? src.length : eol + 1;
					if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.tag) break;
					lines.push(line);
				}
				doc.command.stdin = stripTabs(lines.join("\n"), doc.strip);
			}
			pendingHeredocs = [];
			continue;
		}
		if (c === " " || c === "\t") {
			endWord();
			i++;
			continue;
		}
		if (c === "#" && !word) {
			const eol = src.indexOf("\n", i);
			i = eol < 0 ? src.length : eol;
			continue;
		}
		if (c === "\\") {
			if (src[i + 1] !== "\n") append(src[i + 1] ?? "");
			i += 2;
			continue;
		}
		if (c === "'") {
			const close = src.indexOf("'", i + 1);
			append(src.slice(i + 1, close < 0 ? src.length : close));
			i = close < 0 ? src.length : close + 1;
			continue;
		}
		if (c === '"') {
			append("");
			i++;
			while (i < src.length && src[i] !== '"') {
				const d = src[i] ?? "";
				if (d === "\\" && /["\\$`\n]/.test(src[i + 1] ?? "")) {
					if (src[i + 1] !== "\n") append(src[i + 1] ?? "");
					i += 2;
				} else if (d === "$" && src[i + 1] === "(") {
					substitution();
				} else if (d === "$" && /[\w{@*#?$!-]/.test(src[i + 1] ?? "")) {
					append("", true);
					i++;
				} else if (d === "`") {
					const close = src.indexOf("`", i + 1);
					append("", true);
					i = close < 0 ? src.length : close + 1;
				} else {
					append(d);
					i++;
				}
			}
			i++;
			continue;
		}
		if (c === "$" && src[i + 1] === "(") {
			substitution();
			continue;
		}
		if (c === "$" && src[i + 1] === "'") {
			const close = src.indexOf("'", i + 2);
			append(
				src
					.slice(i + 2, close < 0 ? src.length : close)
					.replace(/\\n/g, "\n")
					.replace(/\\t/g, "\t"),
			);
			i = close < 0 ? src.length : close + 1;
			continue;
		}
		if (c === "$" && /[\w{@*#?$!-]/.test(src[i + 1] ?? "")) {
			append("", true);
			i++;
			continue;
		}
		if (c === "`") {
			const close = src.indexOf("`", i + 1);
			append("", true);
			i = close < 0 ? src.length : close + 1;
			continue;
		}
		if (c === "|") {
			endCommand();
			if (src[i + 1] === "|") {
				i += 2;
				continue;
			}
			current.piped = true;
			i++;
			continue;
		}
		if (c === ";" || c === "&" || c === "(" || c === ")") {
			endCommand();
			i++;
			continue;
		}
		if (c === "<" && src.startsWith("<<<", i)) {
			endWord();
			hereStringNext = current;
			i += 3;
			continue;
		}
		if (c === "<" && src.startsWith("<<", i)) {
			endWord();
			const match = /^<<(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/.exec(src.slice(i));
			if (match) {
				pendingHeredocs.push({
					tag: match[3] ?? "",
					strip: match[1] === "-",
					command: current,
				});
				i += match[0].length;
				continue;
			}
		}
		if (c === "<" || c === ">") {
			let fd: string | undefined;
			if (word && /^\d+$/.test(word.value)) {
				fd = word.value;
				word = undefined;
			}
			endWord();
			const opStart = i;
			while (src[i] === "<" || src[i] === ">" || src[i] === "&") i++;
			if (src[i] === "|" && src[i - 1] === ">") i++;
			if (/\d/.test(src[i] ?? "") && src[i - 1] === "&") {
				while (/\d/.test(src[i] ?? "")) i++;
				continue;
			}
			redirectNext = { op: src.slice(opStart, i), fd };
			continue;
		}
		append(c);
		i++;
	}
	endCommand();
	return commands;
}

export const ENV_ASSIGNMENT = /^[A-Za-z_]\w*=/;

export function commandWords(command: SimpleCommand): Word[] {
	let start = 0;
	while (
		start < command.words.length &&
		ENV_ASSIGNMENT.test(command.words[start]?.value ?? "")
	)
		start++;
	return command.words.slice(start);
}

export interface ShellStep {
	simple: SimpleCommand;
	words: Word[];
	values: string[];
	dir: string;
}

export function shellSteps(command: string, cwd: string): ShellStep[] {
	let dir = cwd;
	const steps: ShellStep[] = [];
	for (const simple of parseShell(command)) {
		const words = commandWords(simple);
		const values = words.map((word) => word.value);
		if (values[0] === "cd" && words[1] && !words[1].dynamic) {
			dir = resolve(dir, values[1] ?? "");
			continue;
		}
		steps.push({ simple, words, values, dir });
	}
	return steps;
}

export interface ShellWrite {
	target: Word;
	append: boolean;
}

export interface FileWrite {
	readonly step: ShellStep;
	readonly target: Word;
	readonly append: boolean;
	readonly body: string;
}

function stdoutWrites(simple: SimpleCommand): ShellWrite[] {
	return simple.redirects
		.filter(
			(redirect) =>
				(redirect.fd === undefined || redirect.fd === "1") &&
				/^(?:>|>>|>\|)$/.test(redirect.op),
		)
		.map((redirect) => ({
			target: redirect.target,
			append: redirect.op === ">>",
		}));
}

function teeTargets(args: readonly Word[]): ShellWrite[] {
	const append = args.some(
		(arg) => arg.value === "--append" || /^-[A-Za-z]*a/.test(arg.value),
	);
	return args
		.filter((arg) => !arg.value.startsWith("-"))
		.map((target) => ({ target, append }));
}

const ESCAPES: Readonly<Record<string, string>> = {
	n: "\n",
	t: "\t",
	r: "\r",
	"\\": "\\",
	a: "",
	b: "",
	f: "",
	v: "",
	e: "",
};

function decodeEscapes(text: string): string {
	return text.replace(/\\(.)/g, (match, letter: string) =>
		letter in ESCAPES ? (ESCAPES[letter] ?? "") : match,
	);
}

function echoText(args: readonly Word[]): string | undefined {
	let index = 0;
	let newline = true;
	let escapes = false;
	while (/^-[neE]+$/.test(args[index]?.value ?? "")) {
		const flags = args[index]?.value ?? "";
		if (flags.includes("n")) newline = false;
		if (flags.includes("e")) escapes = true;
		index++;
	}
	const rest = args.slice(index);
	if (rest.some((arg) => arg.dynamic)) return undefined;
	const joined = rest.map((arg) => arg.value).join(" ");
	return `${escapes ? decodeEscapes(joined) : joined}${newline ? "\n" : ""}`;
}

function printfText(args: readonly Word[]): string | undefined {
	const [format, ...values] = args[0]?.value === "--" ? args.slice(1) : args;
	if (!format || format.dynamic || values.some((arg) => arg.dynamic))
		return undefined;
	let next = 0;
	const filled = format.value.replace(/%([%sbdi])/g, (_match, kind: string) => {
		if (kind === "%") return "%";
		const value = values[next++]?.value ?? "";
		return kind === "b" ? decodeEscapes(value) : value;
	});
	return decodeEscapes(filled);
}

function printedText(step: ShellStep): string | undefined {
	const [name, ...args] = step.words;
	switch (name?.value) {
		case "echo":
			return echoText(args);
		case "printf":
			return printfText(args);
		case "cat":
			return args.every((arg) => arg.value === "-" || arg.value.startsWith("-"))
				? step.simple.stdin
				: undefined;
		default:
			return undefined;
	}
}

function lineEnded(text: string): string {
	return text.endsWith("\n") ? text : `${text}\n`;
}

export function fileWrites(steps: readonly ShellStep[]): FileWrite[] {
	return steps.flatMap((step, index) => {
		const name = step.values[0];
		if (name === "tee") {
			const piped = step.simple.piped === true ? steps[index - 1] : undefined;
			const fed = piped ? printedText(piped) : undefined;
			const stdin = step.simple.stdin ?? fed;
			if (stdin === undefined) return [];
			return teeTargets(step.words.slice(1)).map((write) => ({
				step,
				...write,
				body: lineEnded(stdin),
			}));
		}
		const printed = printedText(step);
		if (printed === undefined) return [];
		const body = name === "cat" ? lineEnded(printed) : printed;
		return stdoutWrites(step.simple).map((write) => ({ step, ...write, body }));
	});
}
