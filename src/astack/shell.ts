import { basename, resolve } from "node:path";

export interface Word {
	value: string;
	dynamic: boolean;
	expands?: boolean;
	splits?: boolean;
	quoted?: boolean;
}

export interface Redirect {
	op: string;
	fd: number;
	target: Word;
}

export interface SimpleCommand {
	words: Word[];
	stdin: string | undefined;
	stdinDynamic?: boolean;
	stdinFrom?: "heredoc" | "quoted heredoc" | "here-string";
	stdinSources?: number;
	redirects: Redirect[];
	substitutions?: string[];
	piped?: boolean;
	wholeStage?: boolean;
	background?: boolean;
	andOr?: AndOr;
	chain?: number;
	nested?: boolean;
}

export type AndOr = "&&" | "||";

const OPENS = new Set(["if", "while", "until", "for", "select", "case", "{"]);
const CLOSES = new Set(["fi", "done", "esac", "}"]);

function commandPosition(words: readonly Word[]): boolean {
	return (
		words.every((word) => !word.dynamic && RESERVED.has(word.value)) ||
		(words.length === 2 && words[0]?.value === "function")
	);
}

const ONE_WORD =
	/^(?:[A-Za-z_]\w*(?![\w[])|\{[A-Za-z_]\w*(?:\[[^\]@*()]*\])?\})/;
const LITERAL_AFTER_DOLLAR = /[ \t\n;&|<>)"]/;

function dollarExpands(next: string | undefined): boolean {
	return next !== undefined && !LITERAL_AFTER_DOLLAR.test(next);
}

const EXPANDS_IN_HEREDOC = /[$`\\]/;
const DEFINES_COMMAND =
	/\bfunction\b|\balias\b|\(\s*\)\s*[{(]|(?:^|[\s;&|(])[A-Za-z_][\w.-]*\s*\(\s*\)/;

const UNQUOTED_EXPANSION = /[*?]|\[[^\]]*\]|\{[^{}]*(?:,|\.\.)[^{}]*\}/;

const STDIN_FD = 0;
const STDOUT_FD = 1;

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
		quoted: boolean;
		command: SimpleCommand | undefined;
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
	let link: AndOr | undefined;
	let chain = 0;
	let depth = 0;
	let parens = 0;

	const append = (text: string, dynamic = false): void => {
		word ??= { value: "", dynamic: false };
		word.value += text;
		if (dynamic) word.dynamic = true;
	};
	const splits = (): void => {
		if (word) word.splits = true;
	};
	const quoted = (): void => {
		word ??= { value: "", dynamic: false };
		word.quoted = true;
	};
	const endWord = (): void => {
		if (!word) return;
		if (UNQUOTED_EXPANSION.test(unquoted)) word.expands = true;
		unquoted = "";
		if (hereStringNext) {
			hereStringNext.stdin = word.value;
			hereStringNext.stdinFrom = "here-string";
			if (word.dynamic) hereStringNext.stdinDynamic = true;
			hereStringNext = undefined;
		} else if (redirectNext) {
			current.redirects.push({ ...redirectNext, target: word });
			redirectNext = undefined;
		} else {
			if (!word.dynamic && commandPosition(words)) {
				if (OPENS.has(word.value)) depth++;
				if (CLOSES.has(word.value)) depth = Math.max(0, depth - 1);
				if (OPENS.has(word.value) || CLOSES.has(word.value))
					current.nested = true;
			}
			words.push(word);
		}
		word = undefined;
	};
	let groupStdin = false;
	const readsStdin = (command: SimpleCommand, readable: boolean): void => {
		command.stdinSources = (command.stdinSources ?? 0) + 1;
		if (command.stdinSources > 1 || !readable) command.stdinDynamic = true;
	};
	const redirectFd = (fallback: number): number => {
		if (
			!word ||
			word.dynamic ||
			word.quoted === true ||
			!/^\d+$/.test(word.value)
		)
			return fallback;
		const fd = Number(word.value);
		word = undefined;
		unquoted = "";
		return fd;
	};
	const endCommand = (): void => {
		endWord();
		const named = words.filter(
			(one) => one.dynamic || !RESERVED.has(one.value),
		);
		const program = named.findIndex(
			(one) => one.dynamic || !EXEC_PREFIXES.has(one.value),
		);
		const rest = program < 0 ? [] : named.slice(program);
		const redirected =
			(current.stdinSources ?? 0) > (current.piped === true ? 1 : 0);
		if (
			(current.stdinSources !== undefined &&
				(rest.length === 0 ||
					(rest.length === 1 &&
						!rest[0]?.dynamic &&
						rest[0]?.value === "exec"))) ||
			(redirected &&
				words.some(
					(one) =>
						!one.dynamic && (one.value === "exec" || one.value === "eval"),
				))
		)
			groupStdin = true;
		if (words.length > 0 || substitutions.length > 0) {
			if (current.piped !== true) {
				if (link !== "&&") chain++;
				if (link !== undefined) current.andOr = link;
			}
			current.chain = chain;
			if (depth > 0) current.nested = true;
			commands.push(current);
			link = undefined;
		}
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
			const body = stripTabs(heredoc[4] ?? "", heredoc[1] === "-");
			append(body, heredoc[2] === "" && EXPANDS_IN_HEREDOC.test(body));
			i += heredoc[0].length;
			return;
		}
		parenBody();
	};

	let stageEmpty = false;
	while (i < src.length) {
		const c = src[i] ?? "";
		if (c !== "\n" && c !== " " && c !== "\t" && (c !== "#" || word))
			stageEmpty = false;
		if (c === "\n") {
			if (current.piped !== true || !stageEmpty) endCommand();
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
				const { command } = doc;
				if (command === undefined) continue;
				command.stdin = stripTabs(lines.join("\n"), doc.strip);
				command.stdinFrom = doc.quoted ? "quoted heredoc" : "heredoc";
				if (!doc.quoted && EXPANDS_IN_HEREDOC.test(command.stdin))
					command.stdinDynamic = true;
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
			if (src[i + 1] !== "\n") {
				append(src[i + 1] ?? "");
				quoted();
			}
			i += 2;
			continue;
		}
		if (c === "'") {
			quoted();
			const close = src.indexOf("'", i + 1);
			append(src.slice(i + 1, close < 0 ? src.length : close));
			i = close < 0 ? src.length : close + 1;
			continue;
		}
		if (c === '"') {
			quoted();
			i++;
			while (i < src.length && src[i] !== '"') {
				const d = src[i] ?? "";
				if (d === "\\" && /["\\$`\n]/.test(src[i + 1] ?? "")) {
					if (src[i + 1] !== "\n") append(src[i + 1] ?? "");
					i += 2;
				} else if (d === "$" && src[i + 1] === "(") {
					substitution();
				} else if (d === "$" && dollarExpands(src[i + 1])) {
					append("", true);
					if (!ONE_WORD.test(src.slice(i + 1))) splits();
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
			splits();
			continue;
		}
		if (c === "$" && src[i + 1] === "'") {
			quoted();
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
		if (c === "$" && src[i + 1] === '"') {
			quoted();
			i++;
			continue;
		}
		if (c === "$" && dollarExpands(src[i + 1])) {
			append("", true);
			splits();
			i++;
			continue;
		}
		if (c === "`") {
			backtickBody();
			splits();
			continue;
		}
		if (c === "|") {
			const stage = current;
			endCommand();
			if (src[i + 1] === "|") {
				link = "||";
				i += 2;
				continue;
			}
			if (
				commands.at(-1) === stage &&
				(stage.substitutions ?? []).length === 0 &&
				!RESERVED.has(stage.words[0]?.value ?? "")
			)
				stage.wholeStage = true;
			current.piped = true;
			readsStdin(current, true);
			stageEmpty = true;
			i += src[i + 1] === "&" ? 2 : 1;
			continue;
		}
		if (c === "&" && src[i + 1] === ">") {
			endWord();
			const op = src[i + 2] === ">" ? "&>>" : "&>";
			redirectNext = { op, fd: STDOUT_FD };
			i += op.length;
			continue;
		}
		if (c === "&") {
			const paired = src[i + 1] === "&";
			if (!paired) current.background = true;
			endCommand();
			link = paired ? "&&" : undefined;
			i += paired ? 2 : 1;
			continue;
		}
		if (c === ";") {
			endCommand();
			link = undefined;
			i++;
			continue;
		}
		if (c === "(") {
			endCommand();
			parens++;
			depth++;
			i++;
			continue;
		}
		if (c === ")") {
			endCommand();
			if (parens > 0) {
				parens--;
				depth = Math.max(0, depth - 1);
			}
			i++;
			continue;
		}
		if ((c === "<" || c === ">") && src[i + 1] === "(") {
			parenBody();
			splits();
			continue;
		}
		if (c === "<" && src.startsWith("<<<", i)) {
			const fd = redirectFd(STDIN_FD);
			endWord();
			readsStdin(current, fd === STDIN_FD);
			if (fd === STDIN_FD) hereStringNext = current;
			else redirectNext = { op: "<<<", fd };
			i += 3;
			continue;
		}
		const heredoc =
			c === "<"
				? /^<<(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/.exec(src.slice(i))
				: null;
		if (heredoc) {
			const fd = redirectFd(STDIN_FD);
			endWord();
			readsStdin(current, fd === STDIN_FD);
			pendingHeredocs.push({
				tag: heredoc[3] ?? "",
				strip: heredoc[1] === "-",
				quoted: heredoc[2] !== "",
				command: fd === STDIN_FD ? current : undefined,
			});
			i += heredoc[0].length;
			continue;
		}
		if (c === "<" || c === ">") {
			const fd = redirectFd(c === "<" ? STDIN_FD : STDOUT_FD);
			endWord();
			const opStart = i;
			while (src[i] === "<" || src[i] === ">" || src[i] === "&") i++;
			if (src[i] === "|" && src[i - 1] === ">") i++;
			if (fd === STDIN_FD) readsStdin(current, false);
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
	if (groupStdin)
		for (const command of commands) {
			command.stdinDynamic = true;
			command.stdinSources = (command.stdinSources ?? 0) + 1;
		}
	return commands;
}

export const ENV_ASSIGNMENT = /^[A-Za-z_]\w*=/;

export function chainSteps(command: string): string[] {
	return parseShell(command).flatMap((simple) => {
		const word = simple.words.find(
			(candidate) =>
				!ENV_ASSIGNMENT.test(candidate.value) &&
				(candidate.dynamic || !RESERVED.has(candidate.value)),
		);
		if (word === undefined) return [];
		return [word.dynamic && word.value === "" ? "$" : word.value];
	});
}

export type Unreadable =
	| "folder"
	| "depth"
	| "body"
	| "stdin"
	| "wrapper"
	| "program";

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
const EXEC_PREFIXES = new Set(["builtin", "command"]);
const FOLDER_MOVES = new Set(["cd", "popd", "pushd"]);
const MAX_DEPTH = 4;
const FED: Word = { value: "", dynamic: true, splits: true };

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
	readonly execs: boolean;
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
			? { ...word, dynamic: true, splits: true }
			: word,
	);
}

function plainForm(raw: readonly Word[]): Plain {
	const env: Word[] = [];
	let unsets = false;
	let at = 0;
	let assigns = true;
	let feeds = false;
	let execs = false;
	let replace: string | undefined;
	for (;;) {
		const word = raw[at];
		if (word === undefined) break;
		const name = word.dynamic ? "" : word.value;
		if (HEADERS.has(name))
			return {
				env,
				unsetsEnv: unsets,
				words: [],
				unreadable: undefined,
				execs,
			};
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
		execs ||= basename(name) === "exec";
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
					execs,
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
		execs,
	};
}

const REBINDS_STDIN = new Set([".", "eval", "source"]);

function rebindsStdin(simple: SimpleCommand, plain: Plain): boolean {
	const program = plain.words[0];
	return (
		plain.execs ||
		(simple.stdinSources ?? 0) > (simple.piped === true ? 1 : 0) ||
		(program !== undefined &&
			!program.dynamic &&
			REBINDS_STDIN.has(basename(program.value)))
	);
}

type Body = {
	readonly text: string;
	readonly dynamic: boolean;
	readonly stdin: boolean;
};

const UNREAD_STDIN: Body = { text: "", dynamic: true, stdin: true };

function literalPrint(step: ShellStep): string | undefined {
	const [name, ...args] = step.words;
	if (step.unreadable !== undefined || name === undefined || name.dynamic)
		return undefined;
	if (args.some((arg) => arg.dynamic || arg.expands === true)) return undefined;
	if (name.value === "echo")
		return args.every(
			(arg) => !arg.value.startsWith("-") && !arg.value.includes("\\"),
		)
			? `${args.map((arg) => arg.value).join(" ")}\n`
			: undefined;
	const [format, value, ...extra] = args;
	if (name.value !== "printf" || value === undefined || extra.length > 0)
		return undefined;
	if (format?.value === "%s") return value.value;
	return format?.value === "%s\\n" ? `${value.value}\n` : undefined;
}

function literalScript(
	simple: SimpleCommand,
	previous: ShellStep | undefined,
): string | undefined {
	if (simple.stdinDynamic === true) return undefined;
	if (simple.stdin !== undefined)
		return simple.stdinFrom === "quoted heredoc" ||
			simple.stdinFrom === "here-string"
			? simple.stdin
			: undefined;
	return pipeStageText(previous);
}

export function pipeStageText(
	stage: ShellStep | undefined,
): string | undefined {
	return stage?.simple.wholeStage === true ? literalPrint(stage) : undefined;
}

type ShellState = { readonly defines: boolean; readonly rebound: boolean };

function stdinScript(
	simple: SimpleCommand,
	earlier: readonly ShellStep[],
	state: ShellState,
): Body | undefined {
	if (simple.stdinSources === undefined)
		return state.defines || state.rebound ? UNREAD_STDIN : undefined;
	const script = state.defines
		? undefined
		: literalScript(simple, earlier.at(-1));
	return script === undefined
		? UNREAD_STDIN
		: { text: script, dynamic: false, stdin: true };
}

function scriptBody(
	words: readonly Word[],
	simple: SimpleCommand,
	earlier: readonly ShellStep[],
	state: ShellState,
): Body | undefined {
	const [program, ...args] = words;
	if (program === undefined || program.dynamic) return undefined;
	const name = basename(program.value);
	if (name === "eval")
		return args.length === 0
			? undefined
			: {
					text: args.map((arg) => arg.value).join(" "),
					dynamic: args.some((arg) => arg.dynamic),
					stdin: false,
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
			if (command)
				return arg && { text: arg.value, dynamic: arg.dynamic, stdin: false };
			return fromStdin || text === "-"
				? stdinScript(simple, earlier, state)
				: undefined;
		}
	}
	return command ? undefined : stdinScript(simple, earlier, state);
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
	body: Body | undefined,
	deep: boolean,
): Unreadable | undefined {
	if (deep) return "depth";
	if (body === undefined) return plain.unreadable;
	if (!body.dynamic) return "depth";
	return body.stdin ? "stdin" : "body";
}

type Inherited = {
	readonly env: readonly Word[];
	readonly unsetsEnv: boolean;
	readonly defines: boolean;
	readonly rebound: boolean;
};

function scriptSteps(
	src: string,
	start: Folder,
	depth: number,
	inherited: Inherited,
): ShellStep[] {
	let folder = start;
	let pipeline = 0;
	let rebound = inherited.rebound;
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
					scriptSteps(body, folder, depth + 1, { ...inherited, rebound }),
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
		const state = { defines: inherited.defines, rebound };
		const body = plain.unreadable
			? undefined
			: scriptBody(plain.words, simple, steps, state);
		rebound ||= rebindsStdin(simple, plain);
		if (body !== undefined && !body.dynamic && nested) {
			steps.push(
				...scriptSteps(body.text, folder, depth + 1, {
					env,
					unsetsEnv,
					...state,
				}),
			);
			continue;
		}
		if (plain.env.length > 0 || plain.words.length > 0)
			steps.push({
				simple: {
					...simple,
					words: [...env, ...plain.words],
					...(depth > 0 ? { nested: true } : {}),
				},
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
		defines: DEFINES_COMMAND.test(command),
		rebound: false,
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
				redirect.fd === STDOUT_FD && /^(?:&?>>?|>\|)$/.test(redirect.op),
		)
		.map((redirect) => ({
			target: redirect.target,
			append: redirect.op.endsWith(">>"),
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
			return args.every(
				(arg) => arg.value === "-" || arg.value.startsWith("-"),
			) && step.simple.stdinDynamic !== true
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
			const stdin =
				step.simple.stdinDynamic === true
					? undefined
					: (step.simple.stdin ?? fed);
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

export type DiskText = string | undefined;

export type StagedText =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "unread"; readonly disk: string }
	| { readonly kind: "missing" };

type Effect =
	| { readonly kind: "none" }
	| { readonly kind: "unread" }
	| { readonly kind: "writes"; readonly writes: readonly FileWrite[] };

const NONE: Effect = { kind: "none" };
const UNREAD: Effect = { kind: "unread" };

const READERS = new Set([
	"cat",
	"head",
	"tail",
	"grep",
	"wc",
	"ls",
	"test",
	"[",
	"astack",
]);

function writeTargets(step: ShellStep): Word[] {
	const redirected = step.simple.redirects
		.filter((redirect) => redirect.op.includes(">"))
		.map((redirect) => redirect.target);
	const teed =
		step.values[0] === "tee"
			? teeTargets(step.words.slice(1)).map((write) => write.target)
			: [];
	return [...redirected, ...teed];
}

function isReader(step: ShellStep): boolean {
	return (
		READERS.has(step.values[0] ?? "") &&
		writeTargets(step).every(
			(target) => !target.dynamic && target.value === "/dev/null",
		)
	);
}

function hits(step: ShellStep, target: Word, path: string): boolean {
	if (target.dynamic) return false;
	return step.unreadable === "folder"
		? basename(target.value) === basename(path)
		: resolve(step.dir, target.value) === path;
}

function namesFile(step: ShellStep, name: string): boolean {
	const pattern = new RegExp(
		`(?<![\\w.-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
	);
	return [
		...step.simple.words.map((word) => word.value),
		...step.simple.redirects.map((redirect) => redirect.target.value),
		...(step.simple.stdinFrom === undefined ? [] : [step.simple.stdin ?? ""]),
	].some((text) => pattern.test(text));
}

function stepEffect(
	step: ShellStep,
	writes: readonly FileWrite[],
	path: string,
): Effect {
	if (isReader(step)) return NONE;
	const targets = writeTargets(step);
	if (targets.some((target) => target.dynamic)) return UNREAD;
	if (step.unreadable !== undefined && step.unreadable !== "folder")
		return UNREAD;
	const own = writes.filter((write) => write.step === step);
	const parsed = own.filter((write) => hits(step, write.target, path));
	const unparsed = targets.filter(
		(target) =>
			hits(step, target, path) && !own.some((write) => write.target === target),
	);
	if (unparsed.length > 0) return UNREAD;
	if (own.length === 0 && namesFile(step, basename(path))) return UNREAD;
	if (parsed.length === 0) return NONE;
	return step.unreadable === "folder"
		? UNREAD
		: { kind: "writes", writes: parsed };
}

function pipelineOf(
	steps: readonly ShellStep[],
	at: number,
): { readonly start: number; readonly end: number } {
	let start = at;
	while (start > 0 && steps[start]?.simple.piped === true) start--;
	let end = at;
	while (steps[end + 1]?.simple.piped === true) end++;
	return { start, end };
}

function isCertain(
	steps: readonly ShellStep[],
	at: number,
	body: ShellStep,
	bodyChain: number | undefined,
): boolean {
	const step = steps[at];
	const { start, end } = pipelineOf(steps, at);
	const head = steps[start]?.simple;
	if (step === undefined || head === undefined) return false;
	if (step.simple.nested === true || head.nested === true) return false;
	if (steps[end]?.simple.background === true) return false;
	if (head.andOr === undefined) return true;
	return (
		head.andOr === "&&" &&
		body.simple.nested !== true &&
		head.chain !== undefined &&
		head.chain === bodyChain
	);
}

export function stagedText(
	steps: readonly ShellStep[],
	at: number,
	path: string,
	disk: DiskText,
): StagedText {
	const body = steps[at];
	const pipeline = pipelineOf(steps, at);
	const bodyChain = steps[pipeline.start]?.simple.chain;
	const later =
		body?.simple.nested === true ||
		steps[pipeline.end]?.simple.background === true;
	const writes = fileWrites(steps);
	let text: string | undefined = disk;
	let unread = body === undefined || body.unreadable === "folder";
	steps.forEach((step, index) => {
		const concurrent =
			(index >= pipeline.start && index <= pipeline.end) ||
			(index > at && later);
		if (index === at || (index > at && !concurrent) || body === undefined)
			return;
		const effect = stepEffect(step, writes, path);
		if (effect.kind === "none") return;
		if (
			effect.kind === "unread" ||
			concurrent ||
			!isCertain(steps, index, body, bodyChain)
		) {
			unread = true;
			return;
		}
		for (const write of effect.writes) {
			if (!write.append) {
				text = write.body;
				unread = false;
			} else text = `${text ?? ""}${write.body}`;
		}
	});
	if (
		body !== undefined &&
		writeTargets(body).some(
			(target) => target.dynamic || hits(body, target, path),
		)
	)
		unread = true;
	if (!unread)
		return text === undefined ? { kind: "missing" } : { kind: "text", text };
	return disk === undefined ? { kind: "missing" } : { kind: "unread", disk };
}
