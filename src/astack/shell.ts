import { basename, resolve } from "node:path";

export interface Word {
	value: string;
	dynamic: boolean;
	startsDynamic?: boolean;
	expands?: boolean;
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
	substitutions?: string[];
	piped?: boolean;
	background?: boolean;
}

const UNQUOTED_EXPANSION = /[*?[]|\{[^{}]*(?:,|\.\.)[^{}]*\}/;

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
	let substitutions: string[] = [];
	let redirectNext: Omit<Redirect, "target"> | undefined;
	let hereStringNext: SimpleCommand | undefined;
	let current: SimpleCommand = {
		words,
		stdin: undefined,
		redirects: [],
		substitutions,
	};
	let i = 0;
	let unquoted = "";

	const append = (text: string, dynamic = false): void => {
		word ??= { value: "", dynamic: false };
		if (dynamic && word.value === "") word.startsDynamic = true;
		word.value += text;
		if (dynamic) word.dynamic = true;
	};
	const endWord = (): void => {
		if (!word) return;
		if (UNQUOTED_EXPANSION.test(unquoted)) word.expands = true;
		unquoted = "";
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
		if (words.length > 0 || substitutions.length > 0) commands.push(current);
		words = [];
		substitutions = [];
		current = { words, stdin: undefined, redirects: [], substitutions };
	};
	const parenBody = (): void => {
		const end = matchingParen(src, i + 2);
		substitutions.push(src.slice(i + 2, src[end - 1] === ")" ? end - 1 : end));
		i = end;
		append("", true);
	};
	const backtickBody = (): void => {
		const close = src.indexOf("`", i + 1);
		substitutions.push(src.slice(i + 1, close < 0 ? src.length : close));
		i = close < 0 ? src.length : close + 1;
		append("", true);
	};
	const substitution = (): void => {
		const heredoc = HEREDOC_SUBSTITUTION.exec(src.slice(i));
		if (heredoc) {
			append(stripTabs(heredoc[4] ?? "", heredoc[1] === "-"));
			i += heredoc[0].length;
			return;
		}
		parenBody();
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
					backtickBody();
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
			backtickBody();
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
		if (c === "&") {
			const paired = src[i + 1] === "&";
			if (!paired) current.background = true;
			endCommand();
			i += paired ? 2 : 1;
			continue;
		}
		if (c === ";" || c === "(" || c === ")") {
			endCommand();
			i++;
			continue;
		}
		if ((c === "<" || c === ">") && src[i + 1] === "(") {
			parenBody();
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
				unquoted = "";
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
		unquoted += c;
		i++;
	}
	endCommand();
	return commands;
}

export const ENV_ASSIGNMENT = /^[A-Za-z_]\w*=/;

export type Unreadable = "folder" | "depth" | "body" | "wrapper" | "program";

export interface ShellStep {
	simple: SimpleCommand;
	env: Word[];
	unsetsEnv: boolean;
	words: Word[];
	values: string[];
	dir: string;
	unreadable: Unreadable | undefined;
}

type Wrapper = {
	readonly flags?: readonly string[];
	readonly values?: readonly string[];
	readonly replace?: string;
	readonly assigns?: boolean;
	readonly unsets?: readonly string[];
	readonly resets?: boolean;
	readonly keeps?: readonly string[];
	readonly operands?: number;
	readonly feeds?: boolean;
	readonly numeric?: boolean;
};

const WRAPPERS: ReadonlyMap<string, Wrapper> = new Map([
	[
		"env",
		{
			flags: ["-", "-0", "-i", "--ignore-environment", "--null"],
			values: ["-u", "--unset"],
			assigns: true,
			unsets: ["-", "-i", "--ignore-environment", "-u", "--unset"],
		},
	],
	["command", { flags: ["-p"] }],
	["builtin", {}],
	["exec", { flags: ["-c", "-l"], values: ["-a"], unsets: ["-c"] }],
	["time", { flags: ["-p"] }],
	["nohup", {}],
	["nice", { values: ["-n", "--adjustment"], numeric: true }],
	[
		"timeout",
		{
			flags: ["-v", "--foreground", "--preserve-status", "--verbose"],
			values: ["-k", "-s", "--kill-after", "--signal"],
			operands: 1,
		},
	],
	[
		"sudo",
		{
			flags: [
				"-b",
				"-E",
				"-H",
				"-k",
				"-n",
				"-P",
				"-S",
				"--background",
				"--non-interactive",
				"--preserve-env",
				"--preserve-groups",
				"--reset-timestamp",
				"--set-home",
				"--stdin",
			],
			values: ["-g", "-u", "--group", "--user"],
			assigns: true,
			resets: true,
			keeps: ["-E", "--preserve-env"],
		},
	],
	["doas", { flags: ["-n"], values: ["-u"], resets: true }],
	["stdbuf", { values: ["-e", "-i", "-o", "--error", "--input", "--output"] }],
	[
		"xargs",
		{
			flags: [
				"-0",
				"-r",
				"-t",
				"-x",
				"--exit",
				"--no-run-if-empty",
				"--null",
				"--verbose",
			],
			values: [
				"-a",
				"-d",
				"-E",
				"-L",
				"-n",
				"-P",
				"-s",
				"--arg-file",
				"--delimiter",
				"--eof",
				"--max-args",
				"--max-chars",
				"--max-lines",
				"--max-procs",
			],
			replace: "-I",
			feeds: true,
		},
	],
]);

const RESERVED = new Set([
	"!",
	"{",
	"}",
	"do",
	"done",
	"elif",
	"else",
	"esac",
	"fi",
	"if",
	"then",
	"until",
	"while",
]);
const HEADERS = new Set(["case", "for", "select"]);
const SHELLS = new Set(["bash", "dash", "ksh", "sh", "zsh"]);
const FOLDER_MOVES = new Set(["cd", "popd", "pushd"]);
const MAX_DEPTH = 4;
const FED: Word = { value: "", dynamic: true, startsDynamic: true };

type Option = {
	readonly name: string;
	readonly width: number;
	readonly value: Word | undefined;
};

function attached(name: string, value: string): Option {
	return { name, width: 1, value: { value, dynamic: false } };
}

function readOption(
	wrapper: Wrapper,
	word: Word,
	next: Word | undefined,
): Option | undefined {
	if (word.dynamic) return undefined;
	const text = word.value;
	const flags = wrapper.flags ?? [];
	const valued = [
		...(wrapper.values ?? []),
		...(wrapper.replace ? [wrapper.replace] : []),
	];
	if (flags.includes(text)) return { name: text, width: 1, value: undefined };
	if (text.startsWith("--")) {
		const eq = text.indexOf("=");
		const name = eq < 0 ? text : text.slice(0, eq);
		if (eq >= 0)
			return flags.includes(name) || valued.includes(name)
				? attached(name, text.slice(eq + 1))
				: undefined;
		return valued.includes(name) && next
			? { name, width: 2, value: next }
			: undefined;
	}
	const name = text.slice(0, 2);
	if (valued.includes(name))
		return text.length > 2
			? attached(name, text.slice(2))
			: next && { name, width: 2, value: next };
	if (wrapper.numeric && /^-\d+$/.test(text))
		return { name: text, width: 1, value: undefined };
	return /^-[A-Za-z0-9]+$/.test(text) &&
		[...text.slice(1)].every((letter) => flags.includes(`-${letter}`))
		? { name: text, width: 1, value: undefined }
		: undefined;
}

type Plain = {
	readonly env: Word[];
	readonly unsetsEnv: boolean;
	readonly words: Word[];
	readonly unreadable: Unreadable | undefined;
};

function namesFlag(flags: readonly string[], name: string): boolean {
	return (
		flags.includes(name) ||
		(/^-[A-Za-z0-9]{2,}$/.test(name) &&
			[...name.slice(1)].some((letter) => flags.includes(`-${letter}`)))
	);
}

function fedWords(words: Word[], replace: string | undefined): Word[] {
	if (words.length === 0) return words;
	if (replace === undefined) return [...words, FED];
	return words.map((word) =>
		word.value.includes(replace)
			? { ...word, dynamic: true, startsDynamic: true }
			: word,
	);
}

function plainForm(raw: readonly Word[]): Plain {
	const env: Word[] = [];
	let unsets = false;
	let at = 0;
	let assigns = true;
	let feeds = false;
	let replace: string | undefined;
	for (;;) {
		const word = raw[at];
		if (word === undefined) break;
		const name = word.dynamic ? "" : word.value;
		if (HEADERS.has(name))
			return { env, unsetsEnv: unsets, words: [], unreadable: undefined };
		if (RESERVED.has(name) || name === "function") {
			at += name === "function" ? 2 : 1;
			continue;
		}
		if (assigns && ENV_ASSIGNMENT.test(word.value)) {
			env.push(word);
			at++;
			continue;
		}
		const wrapper = WRAPPERS.get(basename(name));
		if (wrapper === undefined) break;
		const start = at;
		let kept = false;
		at++;
		for (
			let option = raw[at];
			option?.value.startsWith("-");
			option = raw[at]
		) {
			if (option.value === "--" && !option.dynamic) {
				at++;
				break;
			}
			const read = readOption(wrapper, option, raw[at + 1]);
			if (
				read === undefined ||
				(read.name === wrapper.replace && read.value?.dynamic)
			)
				return {
					env,
					unsetsEnv: unsets,
					words: raw.slice(start),
					unreadable: "wrapper",
				};
			if (read.name === wrapper.replace) replace = read.value?.value;
			unsets ||= namesFlag(wrapper.unsets ?? [], read.name);
			kept ||=
				read.value === undefined && namesFlag(wrapper.keeps ?? [], read.name);
			at += read.width;
		}
		unsets ||= wrapper.resets === true && !kept;
		at += wrapper.operands ?? 0;
		assigns = wrapper.assigns === true;
		feeds ||= wrapper.feeds === true;
	}
	const rest = raw.slice(at);
	const words = feeds ? fedWords(rest, replace) : rest;
	return {
		env,
		unsetsEnv: unsets,
		words,
		unreadable: words[0]?.dynamic ? "program" : undefined,
	};
}

function stdinScript(
	simple: SimpleCommand,
	previous: ShellStep | undefined,
): Word | undefined {
	if (simple.stdin !== undefined)
		return { value: simple.stdin, dynamic: false };
	if (simple.piped !== true) return undefined;
	const printed = previous === undefined ? undefined : printedText(previous);
	return printed === undefined
		? { value: "", dynamic: true }
		: { value: printed, dynamic: false };
}

function scriptBody(
	words: readonly Word[],
	simple: SimpleCommand,
	previous: ShellStep | undefined,
): Word | undefined {
	const [program, ...args] = words;
	if (program === undefined || program.dynamic) return undefined;
	const name = basename(program.value);
	if (name === "eval")
		return args.length === 0
			? undefined
			: {
					value: args.map((arg) => arg.value).join(" "),
					dynamic: args.some((arg) => arg.dynamic),
				};
	if (!SHELLS.has(name)) return undefined;
	let command = false;
	let fromStdin = false;
	for (let at = 0; at < args.length; at++) {
		const arg = args[at];
		const text = arg === undefined || arg.dynamic ? "" : arg.value;
		if (/^(?:[-+][oO]|--init-file|--rcfile)$/.test(text)) at++;
		else if (/^-[A-Za-z]+$/.test(text)) {
			command ||= text.includes("c");
			fromStdin ||= text.includes("s");
		} else if (!/^(?:\+[A-Za-z]+|--.*)$/.test(text)) {
			if (command) return arg;
			return fromStdin || text === "-"
				? stdinScript(simple, previous)
				: undefined;
		}
	}
	return command ? undefined : stdinScript(simple, previous);
}

type Folder = { readonly dir: string; readonly known: boolean };

type Move =
	| { readonly kind: "none" }
	| { readonly kind: "to"; readonly dir: string }
	| { readonly kind: "unknown" };

function folderMove(dir: string, words: readonly Word[]): Move {
	const [name, ...args] = words;
	if (name === undefined || name.dynamic || !FOLDER_MOVES.has(name.value))
		return { kind: "none" };
	const operands = args.filter(
		(arg) => arg.dynamic || !/^(?:--|-[LPe@]+)$/.test(arg.value),
	);
	const [target] = operands;
	return name.value !== "popd" &&
		operands.length === 1 &&
		target !== undefined &&
		!target.dynamic &&
		!/^[-+~]/.test(target.value)
		? { kind: "to", dir: resolve(dir, target.value) }
		: { kind: "unknown" };
}

function bodyMark(
	plain: Plain,
	body: Word | undefined,
	deep: boolean,
): Unreadable | undefined {
	if (deep) return "depth";
	if (body === undefined) return plain.unreadable;
	return body.dynamic ? "body" : "depth";
}

type Inherited = { readonly env: readonly Word[]; readonly unsetsEnv: boolean };

function scriptSteps(
	src: string,
	start: Folder,
	depth: number,
	inherited: Inherited,
): ShellStep[] {
	let folder = start;
	let pipeline = 0;
	const steps: ShellStep[] = [];
	const nested = depth < MAX_DEPTH;
	for (const simple of parseShell(src)) {
		if (simple.piped !== true) pipeline = steps.length;
		const bodies = simple.substitutions ?? [];
		if (nested)
			steps.splice(
				pipeline,
				0,
				...bodies.flatMap((body) =>
					scriptSteps(body, folder, depth + 1, inherited),
				),
			);
		const plain = plainForm(simple.words);
		const env = [...inherited.env, ...plain.env];
		const unsetsEnv = inherited.unsetsEnv || plain.unsetsEnv;
		const move: Move = plain.unreadable
			? { kind: "none" }
			: folderMove(folder.dir, plain.words);
		if (move.kind === "to") {
			folder = { dir: move.dir, known: folder.known };
			continue;
		}
		const body = plain.unreadable
			? undefined
			: scriptBody(plain.words, simple, steps.at(-1));
		if (body !== undefined && !body.dynamic && nested) {
			steps.push(
				...scriptSteps(body.value, folder, depth + 1, { env, unsetsEnv }),
			);
			continue;
		}
		if (plain.env.length > 0 || plain.words.length > 0)
			steps.push({
				simple: { ...simple, words: [...env, ...plain.words] },
				env,
				unsetsEnv,
				words: plain.words,
				values: plain.words.map((word) => word.value),
				dir: folder.dir,
				unreadable: folder.known
					? bodyMark(plain, body, !nested && bodies.length > 0)
					: "folder",
			});
		if (move.kind === "unknown") folder = { dir: folder.dir, known: false };
	}
	return steps;
}

export function shellSteps(command: string, cwd: string): ShellStep[] {
	return scriptSteps(command, { dir: cwd, known: true }, 0, {
		env: [],
		unsetsEnv: false,
	});
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
