import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
	type DiskText,
	type StagedText,
	shellSteps,
	stagedText,
} from "../../src/astack/shell.ts";

const CWD = "/work/repo";
const PATH = "/work/repo/body.md";
const GH = "gh pr create --body-file body.md";
const RUNS = { numRuns: 100 };

function staged(command: string, disk: DiskText): StagedText {
	const steps = shellSteps(command, CWD);
	const at = steps.findIndex((step) => step.values[0] === "gh");
	return stagedText(steps, at, PATH, disk);
}

const line = fc.stringMatching(/^[a-z][a-z #]{0,12}$/);
const lines = fc
	.array(line, { minLength: 1, maxLength: 3 })
	.map((parts) => parts.join("\n"));

type Item =
	| {
			readonly kind: "write";
			readonly append: boolean;
			readonly body: string;
			readonly shell: (join: string) => string;
	  }
	| { readonly kind: "unread"; readonly shell: (join: string) => string }
	| { readonly kind: "none"; readonly shell: (join: string) => string };

const write = fc.oneof(
	fc.record({ append: fc.boolean(), text: lines }).map(
		({ append, text }): Item => ({
			kind: "write",
			append,
			body: `${text}\n`,
			shell: (join) =>
				`cat ${append ? ">>" : ">"} body.md <<'EOF'${join}\n${text}\nEOF`,
		}),
	),
	fc.record({ append: fc.boolean(), text: line }).map(
		({ append, text }): Item => ({
			kind: "write",
			append,
			body: text,
			shell: (join) =>
				`printf '%s' '${text}' ${append ? ">>" : ">"} body.md${join}`,
		}),
	),
	fc.record({ append: fc.boolean(), text: line }).map(
		({ append, text }): Item => ({
			kind: "write",
			append,
			body: `${text}\n`,
			shell: (join) => `echo '${text}' ${append ? ">>" : ">"} body.md${join}`,
		}),
	),
	fc.record({ append: fc.boolean(), text: line }).map(
		({ append, text }): Item => ({
			kind: "write",
			append,
			body: `${text}\n`,
			shell: (join) => `echo '${text}' ${append ? "&>>" : "&>"} body.md${join}`,
		}),
	),
	fc.record({ append: fc.boolean(), text: line }).map(
		({ append, text }): Item => ({
			kind: "write",
			append,
			body: `${text}\n`,
			shell: (join) =>
				`printf '%s\\n' '${text}' | tee ${append ? "-a " : ""}body.md > /dev/null${join}`,
		}),
	),
);

const READERS = [
	"cat body.md",
	"astack check ste body.md --surface pr",
	"head -n 3 body.md",
	"tail -n 1 body.md",
	"grep -c '#' body.md",
	"wc -l body.md",
	"ls -la",
	"test -f body.md",
	"[ -s body.md ]",
];

const reader = fc
	.constantFrom(...READERS)
	.map((shell): Item => ({ kind: "none", shell: (join) => `${shell}${join}` }));

const other = lines.map(
	(text): Item => ({
		kind: "none",
		shell: (join) => `cat > other.md <<'EOF'${join}\n${text}\nEOF`,
	}),
);

const UNREAD = [
	(join: string) => `npm test > "$LOG"${join}`,
	(join: string) => `sed -i 's/a/b/' body.md${join}`,
	(join: string) => `diff old.md body.md${join}`,
	(join: string) =>
		`python3 - <<'EOF'${join}\nopen("body.md", "w").write("x")\nEOF`,
	(join: string) => `cp draft.md ./body.md${join}`,
	(join: string) => `bash -c "$SCRIPT"${join}`,
	(join: string) =>
		`tee body.md > /dev/null <<EOF${join}\n$(cat draft.md)\nEOF`,
	(join: string) => `tee body.md > /dev/null <<< "$DRAFT"${join}`,
];

const CONDITIONAL = [
	(join: string) => `false || cat > body.md <<'EOF'${join}\nx\nEOF`,
	(join: string) => `if true; then\ncat > body.md <<'EOF'\nx\nEOF\nfi${join}`,
	() => "cat > body.md <<'EOF' &\nx\nEOF",
	() => "git add -A && printf '%s' x > body.md",
	(join: string) => `f() { printf '%s' x > body.md; }${join}`,
	(join: string) => `while false; do printf '%s' x > body.md; done${join}`,
	(join: string) => `case x in x) printf '%s' x > body.md ;; esac${join}`,
];

function unreadItem(
	forms: readonly ((join: string) => string)[],
): fc.Arbitrary<Item> {
	return fc
		.constantFrom(...forms)
		.map((shell): Item => ({ kind: "unread", shell }));
}

type Fold =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "unread" }
	| { readonly kind: "missing" };

function expected(items: readonly Item[], disk: DiskText): StagedText {
	let state: Fold =
		disk === undefined ? { kind: "missing" } : { kind: "text", text: disk };
	for (const item of items) {
		if (item.kind === "unread") state = { kind: "unread" };
		if (item.kind !== "write") continue;
		if (!item.append) state = { kind: "text", text: item.body };
		else if (state.kind === "missing")
			state = { kind: "text", text: item.body };
		else if (state.kind === "text")
			state = { kind: "text", text: `${state.text}${item.body}` };
	}
	if (state.kind === "text") return state;
	return state.kind === "unread" && disk !== undefined
		? { kind: "unread", disk }
		: { kind: "missing" };
}

function lineScript(items: readonly Item[]): string {
	return [...items.map((item) => item.shell("")), GH].join("\n");
}

function chainScript(items: readonly Item[]): string {
	return ["git add -A &&", ...items.map((item) => item.shell(" &&")), GH].join(
		"\n",
	);
}

const disk = fc.option(lines, { nil: undefined });

describe("stagedText reads a body file as the earlier steps of its command leave it", () => {
	test("[control:body-file-staged] the last certain static write with each later append, and the disk text for an untouched file", () => {
		const items = fc.array(fc.oneof(write, reader, other), { maxLength: 5 });
		fc.assert(
			fc.property(items, disk, (generated, onDisk) => {
				const want = expected(generated, onDisk);
				expect(staged(lineScript(generated), onDisk)).toEqual(want);
				expect(staged(chainScript(generated), onDisk)).toEqual(want);
			}),
			RUNS,
		);
	});

	test("[control:body-file-unread] a dynamic target or script, sed, diff, cp, a python heredoc and a tee of dynamic stdin give unread with the disk text, and cat or astack give none", () => {
		const items = fc.array(fc.oneof(write, reader, unreadItem(UNREAD)), {
			maxLength: 5,
		});
		fc.assert(
			fc.property(items, lines, (generated, onDisk) => {
				expect(staged(lineScript(generated), onDisk)).toEqual(
					expected(generated, onDisk),
				);
			}),
			RUNS,
		);
		expect(
			staged(
				"python3 - <<'EOF'\nopen('body.md', 'w').write('x')\nEOF\ngh pr create --body-file ./body.md",
				"## Why\n",
			),
		).toEqual({ kind: "unread", disk: "## Why\n" });
		for (const command of [
			`cd "$DIR"\n${GH}`,
			`cd "$DIR"\ncat > body.md <<'EOF'\nx\nEOF\n${GH}`,
		])
			expect(staged(command, "old\n")).toEqual({
				kind: "unread",
				disk: "old\n",
			});
		expect(staged(`sed -i 's/a/b/' body.md\n${GH}`, undefined)).toEqual({
			kind: "missing",
		});
	});

	test("[control:body-file-conditional] a write after ||, in if, case, a loop or a function, in the background or after a broken && chain gives unread", () => {
		const items = fc.array(fc.oneof(write, reader, unreadItem(CONDITIONAL)), {
			maxLength: 5,
		});
		fc.assert(
			fc.property(items, lines, (generated, onDisk) => {
				expect(staged(lineScript(generated), onDisk)).toEqual(
					expected(generated, onDisk),
				);
			}),
			RUNS,
		);
		for (const command of [
			`printf '%s' x | tee body.md | ${GH}`,
			`${GH} | tee body.md`,
		])
			expect(staged(command, "old\n")).toEqual({
				kind: "unread",
				disk: "old\n",
			});
	});
});
