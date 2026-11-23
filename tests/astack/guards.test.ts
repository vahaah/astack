import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveGateRecord } from "../../src/astack/gates.ts";
import type {
	Context,
	HookEvent,
	Verdict,
} from "../../src/astack/hook/events.ts";
import { handler as destructive } from "../../src/astack/hook/handlers/destructive.ts";
import { mergeGuard } from "../../src/astack/hook/handlers/merge-guard.ts";

let root = "";
let repo = "";
let dirty = "";

function git(dir: string, ...args: string[]): void {
	spawnSync("git", args, { cwd: dir });
}

function initRepo(dir: string): void {
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "T");
}

function write(dir: string, files: Readonly<Record<string, string>>): void {
	for (const [path, text] of Object.entries(files))
		writeFileSync(join(dir, path), text);
}

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "astack-guards-"));
	repo = join(root, "repo");
	mkdirSync(repo);
	initRepo(repo);
	writeFileSync(
		join(repo, "package.json"),
		JSON.stringify({
			scripts: {
				reset: "supabase db reset",
				"db:wipe": "bun ../../tooling/stack/supabase.ts db reset",
				test: "vitest",
			},
		}),
	);
	git(repo, "add", ".");
	git(repo, "commit", "-q", "-m", "base");
	git(repo, "checkout", "-q", "-b", "dev/abc-1/export");

	dirty = join(root, "dirty");
	mkdirSync(join(dirty, "src"), { recursive: true });
	mkdirSync(join(dirty, "docs"));
	initRepo(dirty);
	write(dirty, {
		"notes.txt": "a\n",
		"src/app.ts": "a\n",
		"staged.txt": "a\n",
		"docs/guide.md": "a\n",
	});
	git(dirty, "add", ".");
	git(dirty, "commit", "-q", "-m", "base");
	write(dirty, {
		"notes.txt": "b\n",
		"src/app.ts": "b\n",
		"staged.txt": "b\n",
	});
	git(dirty, "add", "staged.txt");
	write(dirty, { "scratch.txt": "x\n" });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function context(cwd: string): Context {
	return {
		tool: "claude-code",
		event: "PreToolUse",
		cwd,
		projectDir: cwd,
		env: {},
		today: "2026-10-16",
	};
}

function shell(command: string, cwd = repo): HookEvent {
	return { kind: "shell", command, cwd };
}

function reason(verdict: Verdict): string {
	return verdict.kind === "deny" ? verdict.reason : "";
}

describe("the destructive command guard", () => {
	test.each([
		["supabase db reset", "deletes the database data"],
		["npx supabase db reset --linked", "deletes the database data"],
		["bun run reset", "The script reset runs supabase db reset"],
		["pnpm db:wipe", "The script db:wipe runs supabase db reset"],
		["git push --force origin main", "shared branch main"],
		["git push origin +master", "shared branch master"],
		[
			"git push -f origin HEAD:release/2026-10",
			"shared branch release/2026-10",
		],
		['git commit --no-verify --allow-empty -m "Add the parser"', "--no-verify"],
		['git commit -nm "Add the parser"', "--no-verify"],
		["git push --no-verify origin dev/abc-1/export", "--no-verify"],
		["git push --no-verif origin dev/abc-1/export", "--no-verify"],
		["git commit --no-veri -m x", "--no-verify"],
	])("%s is denied", (command, text) => {
		const verdict = destructive.run(shell(command), context(repo));
		expect(verdict.kind).toBe("deny");
		expect(reason(verdict)).toContain(text);
		expect(reason(verdict)).toContain("owner gate");
	});

	test.each([
		"git push --force-with-lease origin dev/abc-1/export",
		"git push --force",
		"git push origin main",
		"bun run test",
		"supabase db diff",
		'git commit -m "Add the parser"',
		"git commit --amend --no-edit",
	])("%s passes", (command) => {
		expect(destructive.run(shell(command), context(repo)).kind).toBe("allow");
	});

	const tracked = "notes.txt, src/app.ts, staged.txt";
	test.each([
		["git reset --hard", `discards the uncommitted changes in ${tracked}.`],
		["git checkout -f main", `discards the uncommitted changes in ${tracked}.`],
		[
			"git switch --discard-changes main",
			`discards the uncommitted changes in ${tracked}.`,
		],
		[
			"git checkout HEAD -- .",
			`discards the uncommitted changes in ${tracked}.`,
		],
		[
			"git checkout -q .",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		[
			"git restore :/",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		["git restore src", "discards the uncommitted changes in src/app.ts."],
		[
			"git restore *",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		[
			"git checkout -- '*.txt'",
			"discards the uncommitted changes in notes.txt.",
		],
		["git clean -fd", "deletes the untracked files scratch.txt."],
		[
			"git restore --pathspec-from-file=list.txt",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
		[
			"git checkout --pathspec-from-file list.txt",
			"discards the uncommitted changes in notes.txt, src/app.ts.",
		],
	])(
		"[control:sg-work-loss-denied] %s is denied when it discards uncommitted work",
		(command, text) => {
			const verdict = destructive.run(shell(command, dirty), context(dirty));
			expect(reason(verdict)).toContain(
				`- ${command.replaceAll("'", "")} ${text}`,
			);
			expect(reason(verdict)).toContain("owner gate");
		},
	);

	test.each([
		"git checkout HEAD -- notes.txt",
		"git restore docs",
		"git restore --staged .",
		"git checkout main",
		"git clean -fdn",
		"git clean -fX",
		"git clean -fd -e scratch.txt",
		"git stash",
	])(
		"[control:sg-explicit-discard-passes] %s passes on a dirty tree because it discards no work",
		(command) => {
			expect(destructive.run(shell(command, dirty), context(dirty)).kind).toBe(
				"allow",
			);
		},
	);

	test.each(["git reset --hard", "git checkout HEAD -- .", "git clean -fd"])(
		"[control:sg-clean-tree-passes] %s passes on a clean tree",
		(command) => {
			expect(destructive.run(shell(command), context(repo)).kind).toBe("allow");
		},
	);
});

describe("the plain form of a git step", () => {
	const forms: readonly { readonly group: string; readonly command: string }[] =
		JSON.parse(
			readFileSync(
				join(import.meta.dir, "../fixtures/guard-bypass.json"),
				"utf8",
			),
		).forms;

	test.each(
		forms
			.filter(
				(form) =>
					form.group === "wrapped-reset" || form.group === "dynamic-word",
			)
			.map((form) => form.command),
	)("[control:sg-plain-form] %s is denied on a dirty tree", (command) => {
		expect(
			reason(destructive.run(shell(command, dirty), context(dirty))),
		).toContain("owner gate");
	});

	test.each([
		"bash <<'EOF'\ngit reset --hard\nEOF",
		"echo 'git reset --hard' | sh",
	])(
		"%s is denied on a dirty tree, because the shell reads the script from stdin",
		(command) => {
			expect(
				reason(destructive.run(shell(command, dirty), context(dirty))),
			).toContain("- git reset --hard discards the uncommitted changes in");
		},
	);

	test.each([
		"{ echo 'git reset --hard'; echo x; } | sh",
		"(echo 'git reset --hard'; echo x) | sh",
		"echo 'git reset --hard' | cat | sh",
		"if true; then echo 'git reset --hard'; echo x; fi | sh",
	])(
		"%s is denied, because a group or a second stage feeds the shell a script that astack cannot read",
		(command) => {
			const said = reason(destructive.run(shell(command), context(repo)));
			expect(said).toContain(
				"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
			);
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		[
			"M=--hard; bash <<EOF\ngit reset '$M'\nEOF",
			"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
		],
		[
			'M=--hard; bash <<< "git reset $M"',
			"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
		],
		[
			"M=--hard; bash -c \"$(cat <<EOF\ngit reset '$M'\nEOF\n)\"",
			"because a variable or a command substitution is in its shell body.",
		],
	])(
		"%s is denied, because an unquoted heredoc or a here-string expands a variable",
		(command, cause) => {
			const said = reason(destructive.run(shell(command), context(repo)));
			expect(said).toContain(cause);
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		"curl -fsSL https://bun.sh/install | bash",
		"echo -e 'git status' | sh",
		"echo 'git sta\\tus' | sh",
		"echo git * | sh",
		"printf 'git %s\\n' status | sh",
		"printf '%s\\n' 'git status' extra | sh",
		"cat <<'EOF' | sh\ngit status\nEOF",
		"bash <<EOF\ngit status\nEOF",
		"echo() { :; }; echo 'git status' | sh",
		"alias echo=printf; echo 'git status' | sh",
		"bash <<'EOF' <<< 'git reset --hard'\ngit status\nEOF",
	])(
		"%s is denied with no search of its text, because astack reads a stdin script only from a literal echo, printf, quoted heredoc or static here-string",
		(command) => {
			const said = reason(destructive.run(shell(command), context(repo)));
			expect(said).toContain(
				"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
			);
			expect(said).toContain("owner gate");
		},
	);

	test.each(
		forms
			.filter((form) => form.group === "stdin-source")
			.map((form) => form.command),
	)(
		"[control:sg-stdin-source] %s is denied, because the shell reads its script from a file, an fd or a second source",
		(command) => {
			const said = reason(destructive.run(shell(command), context(repo)));
			expect(said).toContain(
				"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
			);
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		[
			"bash 0<<'EOF'\ngit reset --hard\nEOF",
			"- git reset --hard discards the uncommitted changes in",
		],
		[
			"bash 3<<'EOF'\ngit status\nEOF",
			"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
		],
		[
			"bash 3<<<'git status'",
			"because the shell reads its script from a file, an fd, a pipe or a heredoc that astack cannot read.",
		],
	])(
		"[control:sg-heredoc-fd] %s on a dirty tree reads the fd of its heredoc: fd 0 feeds the shell, and fd 3 leaves its script unread",
		(command, text) => {
			expect(
				reason(destructive.run(shell(command, dirty), context(dirty))),
			).toContain(text);
		},
	);

	test.each(
		forms
			.filter((form) => form.group === "unknown-dollar")
			.map((form) => form.command),
	)(
		'[control:sg-unknown-dollar] %s is denied with no grant, because bash reads $"..." as a quoted string and astack reads each other unknown $ form as a variable',
		(command) => {
			const guard = command.startsWith("gh")
				? mergeGuard(() => undefined)
				: destructive;
			expect(reason(guard.run(shell(command, dirty), context(dirty)))).not.toBe(
				"",
			);
		},
	);

	test('git commit -m "costs $.50" passes on a dirty tree, because the dynamic word is the message', () => {
		expect(
			destructive.run(
				shell('git commit -m "costs $.50"', dirty),
				context(dirty),
			).kind,
		).toBe("allow");
	});

	test("a heredoc with 2>&1 stays a readable stdin script, so it gets the verdict of its plain form", () => {
		expect(
			reason(
				destructive.run(
					shell("bash <<'EOF' 2>&1\ngit reset --hard\nEOF", dirty),
					context(dirty),
				),
			),
		).toContain("- git reset --hard discards the uncommitted changes in");
	});

	test.each([
		"printf '%s\\n' 'git reset --hard' | sh",
		"printf '%s' 'git reset --hard' | sh",
		"bash <<< 'git reset --hard'",
		'bash <<"EOF"\ngit reset --hard\nEOF',
	])(
		"%s is a readable stdin script, so it gets the verdict of its plain form",
		(command) => {
			expect(
				reason(destructive.run(shell(command, dirty), context(dirty))),
			).toContain("- git reset --hard discards the uncommitted changes in");
		},
	);

	test.each([
		"git reset $(echo --hard)",
		'git commit -m "$(cat msg.txt)"',
		'git commit -am "Bump to $V"',
		'cd "$dir" && git status',
	])("%s passes on a clean tree", (command) => {
		expect(destructive.run(shell(command), context(repo)).kind).toBe("allow");
	});

	test("a variable after a short cluster that ends in -b is the branch name, so the checkout passes on a dirty tree", () => {
		expect(
			destructive.run(
				shell('git checkout -qb "feat/$X"', dirty),
				context(dirty),
			).kind,
		).toBe("allow");
	});

	test.each([
		[
			"env -C ../dirty git reset --hard",
			"astack cannot read env -C ../dirty git reset --hard, because a wrapper before it has a flag that astack does not know.",
		],
		[
			'bash -c "cd $D && git reset --hard"',
			"because a variable or a command substitution is in its shell body.",
		],
		[
			'G="git -C ../dirty"; $G reset --hard',
			"astack cannot read $G reset --hard, because a variable gives the program.",
		],
		[
			'D=../dirty; git -C "$D" reset --hard',
			"astack cannot read git -C $D reset --hard, because a variable or a command substitution gives the -C, -c, --config-env, --git-dir or --work-tree value.",
		],
	])(
		"%s is denied from a clean folder, because astack cannot read the folder it runs in",
		(command, text) => {
			expect(reason(destructive.run(shell(command), context(repo)))).toContain(
				text,
			);
		},
	);

	test.each([
		[
			'bash -c "$(which git) reset --hard"',
			"because a variable or a command substitution is in its shell body.",
		],
		[
			'G=git; bash -c "$G reset --hard"',
			"because a variable or a command substitution is in its shell body.",
		],
		[
			"env -Z $(which git) reset --hard",
			"because a wrapper before it has a flag that astack does not know.",
		],
		[
			"G=git; env -Z $G reset --hard",
			"because a wrapper before it has a flag that astack does not know.",
		],
	])(
		"%s is denied from a clean folder, because a substitution or a variable can give the program git",
		(command, cause) => {
			const said = reason(destructive.run(shell(command), context(repo)));
			expect(said).toContain(cause);
			expect(said).toContain("owner gate");
		},
	);

	test.each(["yarn commit -n", "echo reset --hard && git status"])(
		"%s passes on a dirty tree, because its program is not git",
		(command) => {
			expect(destructive.run(shell(command, dirty), context(dirty)).kind).toBe(
				"allow",
			);
		},
	);

	test.each([
		[
			"M=--hard; git reset $M",
			"astack cannot read git reset $M, because a variable or a command substitution gives a flag or an operand of git reset. Write the git command with static words, such as a branch name or HEAD in place of a variable. This is an owner gate, so stop and ask the owner.",
		],
		[
			'git push -u origin "$(git branch --show-current)"',
			"astack cannot read git push -u origin $(...), because a variable or a command substitution gives a flag or an operand of git push.",
		],
		[
			'cd "$dir" && git reset --hard',
			"astack cannot read git reset --hard, because an earlier cd goes to a folder that astack cannot read.",
		],
		[
			"git $(echo reset) --hard",
			"astack cannot read git $(...) --hard, because a variable or a command substitution gives the git subcommand.",
		],
		[
			'"$GIT" reset --hard',
			"astack cannot read $GIT reset --hard, because a variable gives the program.",
		],
		[
			"$(which git) reset --hard",
			"astack cannot read $(...) reset --hard, because a variable gives the program.",
		],
		[
			"`command -v git` reset --hard",
			"astack cannot read $(...) reset --hard, because a variable gives the program.",
		],
		[
			"$(command -v git) push --no-verify",
			"astack cannot read $(...) push --no-verify, because a variable gives the program.",
		],
	])(
		"[control:sg-dynamic-word] %s is denied with its cause",
		(command, text) => {
			const where = command.startsWith("git push") ? repo : dirty;
			expect(
				reason(destructive.run(shell(command, where), context(where))),
			).toContain(text);
		},
	);
});

describe("the whole-tree discard forms", () => {
	const forms: readonly { readonly group: string; readonly command: string }[] =
		JSON.parse(
			readFileSync(
				join(import.meta.dir, "../fixtures/guard-bypass.json"),
				"utf8",
			),
		).forms;
	const wholeTree = forms
		.filter((form) => form.group === "whole-tree")
		.map((form) => form.command);

	test.each([
		[
			"git diff | git apply -R",
			"- git apply -R discards the uncommitted changes in notes.txt, src/app.ts, staged.txt.",
		],
		[
			"git apply -R <(git diff)",
			"- astack cannot read git apply -R $(...), because a variable or a command substitution gives a flag or an operand of git apply.",
		],
		[
			"git read-tree -u --reset HEAD",
			"- git read-tree -u --reset HEAD discards the uncommitted changes in notes.txt, src/app.ts, staged.txt.",
		],
		[
			"git checkout-index -a -f",
			"- git checkout-index -a -f discards the uncommitted changes in notes.txt, src/app.ts, staged.txt.",
		],
		[
			"git archive HEAD | tar -x",
			"- git archive HEAD | tar -x discards the uncommitted changes in notes.txt, src/app.ts, staged.txt.",
		],
	])(
		"[control:sg-whole-tree] %s is denied on a dirty tree",
		(command, text) => {
			expect(wholeTree).toContain(command);
			const said = reason(
				destructive.run(shell(command, dirty), context(dirty)),
			);
			expect(said).toContain(text);
			expect(said).toContain("owner gate");
		},
	);

	test.each(["git diff | git apply -R /dev/stdin", "git apply -R /dev/fd/0"])(
		"%s reads the patch from stdin, so it is denied on a dirty tree",
		(command) => {
			expect(
				reason(destructive.run(shell(command, dirty), context(dirty))),
			).toContain(
				"discards the uncommitted changes in notes.txt, src/app.ts, staged.txt.",
			);
		},
	);

	test.each([
		"git archive --add-virtual-file notes.txt:x HEAD docs | tar -x",
		"git archive --mtime 2020-01-01 HEAD docs | tar -x",
		'git archive HEAD "$P" | tar -x',
		"git archive --forma tar HEAD docs | tar -x",
		"git archive notes.txt docs | tar -x",
		"git archive HEAD docs | tar -x --strip-components=1",
		"git archive HEAD docs | tar -xP",
		'git archive HEAD docs | tar -x "$OPT"',
		"git archive HEAD docs | tar --extr",
		"git archive HEAD docs | tar -x",
		"git archive --format=tar HEAD docs | tar -x",
		"git archive HEAD docs | tar -xvf -",
		"git archive HEAD docs | tar xf -",
		"git archive HEAD docs | tar xC .",
		"git archive HEAD docs | tar -x --direc=.",
		"git archive HEAD docs | TAR_OPTIONS=--strip-components=1 tar -x",
		'git archive HEAD | tar -x -C "$D"',
		"git archive HEAD | tar -xCv ../repo",
	])(
		"%s is the whole tree of the tar folder, so it is denied on a dirty tree",
		(command) => {
			const said = reason(
				destructive.run(shell(command, dirty), context(dirty)),
			);
			expect(said).toContain(
				"discards the uncommitted changes in notes.txt, src/app.ts, staged.txt.",
			);
			expect(said).toContain("owner gate");
		},
	);

	test("git archive piped to tar -x in a repo where git status fails is denied", () => {
		const broken = join(root, "broken");
		mkdirSync(broken, { recursive: true });
		initRepo(broken);
		write(broken, { "a.txt": "a\n" });
		git(broken, "add", "a.txt");
		git(broken, "commit", "-q", "-m", "base");
		writeFileSync(join(broken, ".git/index"), "not an index");
		const said = reason(
			destructive.run(
				shell("git archive HEAD | tar -x", broken),
				context(broken),
			),
		);
		expect(said).toContain("git status fails in");
		expect(said).toContain("owner gate");
	});

	test.each(wholeTree)("%s passes on a clean tree", (command) => {
		expect(destructive.run(shell(command), context(repo)).kind).toBe("allow");
	});

	test.each([
		"git show HEAD:notes.txt > notes.txt",
		"git checkout-index -f -- notes.txt",
		"git apply -R fix.patch",
		"git apply <(git diff HEAD)",
		"git archive -o out.tar HEAD",
		"git archive HEAD | tar -t",
		"git read-tree HEAD",
	])("the named-file or read form %s passes on a dirty tree", (command) => {
		expect(destructive.run(shell(command, dirty), context(dirty)).kind).toBe(
			"allow",
		);
	});
});

describe("a hook skip", () => {
	const forms: readonly { readonly group: string; readonly command: string }[] =
		JSON.parse(
			readFileSync(
				join(import.meta.dir, "../fixtures/guard-bypass.json"),
				"utf8",
			),
		).forms;
	let hooked = "";
	let state = "";

	beforeAll(() => {
		hooked = join(root, "hooked");
		state = join(root, "hooked-state");
		mkdirSync(join(hooked, ".githooks"), { recursive: true });
		mkdirSync(join(hooked, ".claude"));
		mkdirSync(join(hooked, "src"));
		initRepo(hooked);
		write(hooked, {
			".githooks/pre-push": "#!/bin/sh\nexit 0\n",
			".claude/pr-review-hardening.profile.md": "# Profile\n",
			"src/app.ts": "a\n",
		});
		chmodSync(join(hooked, ".githooks/pre-push"), 0o755);
		git(hooked, "add", ".");
		git(hooked, "commit", "-q", "-m", "base");
		git(hooked, "checkout", "-q", "-b", "edited");
		write(hooked, { ".claude/pr-review-hardening.profile.md": "# Edited\n" });
		git(hooked, "commit", "-q", "-am", "drop a gate");
		git(hooked, "checkout", "-q", "main");
		git(hooked, "checkout", "-q", "-b", "feature");
	});

	type Recorded = "none" | "bound" | "old" | "edited";

	function gitOut(...args: string[]): string {
		return spawnSync("git", args, {
			cwd: hooked,
			encoding: "utf8",
		}).stdout.trim();
	}

	function run(command: string, recorded: Recorded): Verdict {
		const env = { ASTACK_STATE_DIR: state };
		rmSync(state, { recursive: true, force: true });
		const source = recorded === "edited" ? "edited" : "HEAD";
		const head = gitOut("rev-parse", source);
		const record = {
			head,
			base: "main",
			baseSha: gitOut("rev-parse", "main"),
			profile: gitOut(
				"rev-parse",
				`${source}:.claude/pr-review-hardening.profile.md`,
			),
			ran: ["lint"],
			skipped: [],
		};
		if (recorded === "bound" || recorded === "edited")
			saveGateRecord(env, record);
		if (recorded === "old") {
			mkdirSync(join(state, "gates"), { recursive: true });
			const { profile: _, ...old } = record;
			writeFileSync(join(state, "gates", `${head}.json`), JSON.stringify(old));
		}
		return destructive.run(shell(command, hooked), {
			...context(hooked),
			env,
		});
	}

	test.each(
		forms
			.filter((form) => form.group === "hook-skip")
			.map((form) => form.command),
	)("[control:sg-hook-skip] %s gets the --no-verify reason", (command) => {
		const said = reason(run(command, "none"));
		expect(said).toContain(`${command} skips the git hooks of the repo.`);
		expect(said).toContain("owner gate");
	});

	test.each([
		"GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git push",
		"export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null; git push",
		"GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=include.path GIT_CONFIG_VALUE_0=/tmp/h git push",
		`GIT_CONFIG_PARAMETERS="'core.hookspath'='/dev/null'" git push`,
		"GIT_CONFIG_GLOBAL=/tmp/x git push",
		"GIT_CONFIG_SYSTEM=/tmp/x git push",
		"HUSKY=0; export HUSKY; git push",
		"export HUSKY; git push",
		"declare -x HUSKY=0; git push",
		"typeset -x LEFTHOOK=0; git push",
		"set -a; HUSKY=0; git push",
		"setopt allexport; HUSKY=0; git push",
		"setopt ALL_EXPORT; HUSKY=0; git push",
		"setopt noglob; HUSKY=0; git push",
		"unsetopt noallexport; LEFTHOOK=0; git push",
		"options[allexport]=on; HUSKY=0; git push",
		"HUSKY=$X git push",
		"git -c include.path=/tmp/h push",
		"git -c includeIf.onbranch:main.path=/tmp/h commit -m x",
	])(
		"[control:sg-hook-skip-env] %s gets the hook-skip reason, because git or the hook manager reads that setting from the environment or an included file",
		(command) => {
			const said = reason(run(command, "none"));
			expect(said).toContain("skips the git hooks of the repo.");
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		"GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=T git push",
		"HUSKY=0; git push",
		"git config --get include.path",
	])("%s passes, because it turns no hook off", (command) => {
		expect(run(command, "none").kind).toBe("allow");
	});

	test("an exported skip variable reaches the push after it", () => {
		expect(reason(run("export HUSKY=0 && git push", "none"))).toContain(
			"HUSKY=0 git push skips the git hooks of the repo.",
		);
	});

	test.each([
		["git -c core.hooksPath=src push", "git -c core.hooksPath=src push"],
		["git -c core.hooksPath=. push", "git -c core.hooksPath=. push"],
		["git -c 'core.hooksPath=*' push", "git -c core.hooksPath=* push"],
		[
			"git -c core.hooksPath=src commit -m x",
			"git -c core.hooksPath=src commit -m x",
		],
		["git config core.hooksPath src", "git config core.hooksPath src"],
		["git config core.hooksPath .", "git config core.hooksPath ."],
		[
			"git --config-env=core.hooksPath=HP push",
			"git --config-env=core.hooksPath=HP push",
		],
		[
			"git --config-env core.hooksPath=HP push",
			"git --config-env core.hooksPath=HP push",
		],
	])(
		"%s skips the hooks, because its folder holds no tracked hook",
		(command, form) => {
			const said = reason(run(command, "none"));
			expect(said).toContain(`${form} skips the git hooks of the repo.`);
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		"git config --get core.hooksPath",
		"git config core.hooksPath .githooks",
		"git config core.hooksPath ./.githooks/",
		"git -c core.hooksPath=.githooks push origin feature",
	])("%s passes, because it reads the hooks or turns them on", (command) => {
		expect(run(command, "none").kind).toBe("allow");
	});

	test.each([
		["git push --no-verify", "bound", "allow"],
		["LEFTHOOK=0 git push origin feature", "bound", "allow"],
		["HUSKY=0 git push origin HEAD:feature", "bound", "allow"],
		["export HUSKY=0 && git push", "bound", "allow"],
		["git push --no-verify", "old", "deny"],
		["HUSKY=0 git push origin edited", "edited", "deny"],
	] as const)(
		"[control:sg-gates-run] %s with a %s gate record gets %s, because the record must hold the profile blob of the source and of its merge base",
		(command, recorded, kind) => {
			expect(run(command, recorded).kind).toBe(kind);
		},
	);

	test.each([
		[
			"git push --no-verify --tags",
			"pushes refs that astack gates run cannot record",
		],
		["HUSKY=0 git push origin :old", "has no green record for :old"],
		[
			"LEFTHOOK=0 git commit -m x",
			"LEFTHOOK=0 git commit -m x skips the git hooks",
		],
	])("%s stays an owner gate with a record of HEAD", (command, text) => {
		const said = reason(run(command, "bound"));
		expect(said).toContain(text);
		expect(said).toContain("owner gate");
	});
});

describe("the gate record folder", () => {
	let state = "";
	let gates = "";
	let records = "";

	beforeAll(() => {
		state = join(root, "gate-folder-state");
		gates = join(state, "gates");
		records = join(root, "records");
		mkdirSync(gates, { recursive: true });
		mkdirSync(records, { recursive: true });
		writeFileSync(join(gates, "a.json"), "{}\n");
		writeFileSync(join(records, "a.json"), "{}\n");
	});

	function run(event: HookEvent): Verdict {
		return destructive.run(event, {
			...context(records),
			env: { ASTACK_STATE_DIR: state },
		});
	}

	test.each([
		[
			"a Write call",
			() =>
				({
					kind: "write",
					path: join(gates, "x.json"),
					before: undefined,
					after: "{}",
				}) as const,
		],
		[
			"an Edit call",
			() =>
				({
					kind: "edit",
					path: join(gates, "a.json"),
					before: "{}\n",
					after: "{ }\n",
					regions: [],
					oldText: "{}",
					newText: "{ }",
				}) as const,
		],
		["an echo redirect", () => shell(`echo '{}' > ${gates}/x.json`, records)],
		["an &> redirect", () => shell(`echo '{}' &> ${gates}/x.json`, records)],
		["an &>> redirect", () => shell(`echo '{}' &>> ${gates}/x.json`, records)],
		["a cp with no git word", () => shell(`cp a.json ${gates}/`, records)],
		["a find with -delete", () => shell(`find ${gates} -delete`, records)],
		[
			"a find that names no action",
			() => shell(`find ${gates} -name '*.json'`, records),
		],
		["a cat with a glob", () => shell(`cat ${gates}/*.json`, records)],
		["a cat with a variable", () => shell(`cat ${gates}/a.json $X`, records)],
		["an rm of a parent folder", () => shell(`rm -rf ${state}`, records)],
		[
			"a cp through ASTACK_STATE_DIR",
			() => shell("cp a.json $ASTACK_STATE_DIR/gates/b.json", records),
		],
		[
			"a cp to a variable in a line that names gates",
			() => shell('cp a.json "$D"/gates/b.json', records),
		],
		["a cat with a path", () => shell(`./cat ${gates}/a.json`, records)],
		[
			"a less with -o",
			() => shell(`less -o ${gates}/b.json ${gates}/a.json`, records),
		],
		[
			"a cp through a relative path",
			() => shell("cp a.json ../gate-folder-state/gates/b.json", records),
		],
	])(
		"[control:sg-gate-folder] %s into the gate record folder is denied",
		(_, event) => {
			const said = reason(run(event()));
			expect(said).toContain("gate record folder");
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		["cat GATES/a.json"],
		["diff GATES/a.json GATES/a.json"],
		["shasum -a 256 GATES/a.json"],
		["astack gates run --base main"],
		["echo '{}' > RECORDS/b.json"],
	])(
		"%s passes, because it only reads the gate record folder or does not name it",
		(command) => {
			const event = shell(
				command.replaceAll("GATES", gates).replaceAll("RECORDS", records),
				records,
			);
			expect(run(event).kind).toBe("allow");
		},
	);
});

describe("a core.hooksPath that names a folder", () => {
	let active = "";

	beforeAll(() => {
		active = join(root, "active-hooks");
		for (const folder of [
			".githooks",
			"docs",
			"plain",
			"partial",
			"staged",
			"swapped",
			"same",
			"changed",
		])
			mkdirSync(join(active, folder), { recursive: true });
		initRepo(active);
		const hook = "#!/bin/sh\nexit 0\n";
		const red = "#!/bin/sh\nexit 1\n";
		write(active, {
			"same/pre-push": red,
			"same/pre-commit": red,
			"changed/pre-push": red,
			"changed/pre-commit": red,
			".githooks/pre-push": hook,
			".githooks/pre-commit": hook,
			"docs/update": "How to update\n",
			"plain/pre-push": hook,
			"plain/pre-commit": hook,
			"partial/pre-push": hook,
			"swapped/pre-push": hook,
			"swapped/pre-commit": hook,
		});
		for (const path of [
			".githooks/pre-push",
			".githooks/pre-commit",
			"same/pre-push",
			"same/pre-commit",
			"changed/pre-push",
			"changed/pre-commit",
			"partial/pre-push",
			"swapped/pre-push",
			"swapped/pre-commit",
		])
			chmodSync(join(active, path), 0o755);
		git(active, "add", ".");
		git(active, "commit", "-q", "-m", "base");
		rmSync(join(active, "swapped"), { recursive: true });
		symlinkSync("docs", join(active, "swapped"));
		write(active, { "staged/pre-push": hook, "staged/pre-commit": hook });
		chmodSync(join(active, "staged/pre-push"), 0o755);
		chmodSync(join(active, "staged/pre-commit"), 0o755);
		git(active, "add", "staged");
		for (const name of ["pre-push", "pre-commit"]) {
			write(active, { [`.git/hooks/${name}`]: red });
			chmodSync(join(active, ".git/hooks", name), 0o755);
		}
		write(active, { "changed/pre-push": hook });
	});

	function run(command: string): Verdict {
		return destructive.run(shell(command, active), {
			...context(active),
			env: { ASTACK_STATE_DIR: join(root, "active-hooks-state") },
		});
	}

	test.each([
		["git -c core.hooksPath=docs push", "a file with a hook name only"],
		["git -c core.hooksPath=staged push", "hooks in the index only"],
		["git config core.hooksPath plain", "hooks with no executable mode"],
		["git -c core.hooksPath=partial push", "no pre-commit hook"],
	])(
		"%s skips the hooks that are active now, because its folder holds %s in HEAD",
		(command) => {
			const said = reason(run(command));
			expect(said).toContain(`${command} skips the git hooks of the repo.`);
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		[
			"git -c core.hooksPath=missing/../.githooks push",
			"a folder that is not there",
		],
		["git -c core.hooksPath=docs/../.githooks push", "a .. segment"],
		[
			"git config core.hooksPath swapped",
			"a symlink to a folder with no hooks",
		],
	])("%s skips the hooks, because its path holds %s", (command) => {
		const said = reason(run(command));
		expect(said).toContain(`${command} skips the git hooks of the repo.`);
		expect(said).toContain("owner gate");
	});

	test.each([
		["git -c core.hooksPath=.githooks push", "hooks with other bytes"],
		["git config core.hooksPath plain", "a hook with mode 100644"],
		["git config core.hooksPath changed", "a working-tree change"],
	])(
		"[control:sg-hooks-path] %s skips the hooks that are active now, because its folder holds %s",
		(command) => {
			const said = reason(run(command));
			expect(said).toContain(`${command} skips the git hooks of the repo.`);
			expect(said).toContain("owner gate");
		},
	);

	test.each([
		"git -c core.hooksPath=same push",
		"git config core.hooksPath same",
	])(
		"%s passes, because HEAD holds each active hook in the folder as an executable file with the same bytes",
		(command) => {
			expect(run(command).kind).toBe("allow");
		},
	);

	test("a core.hooksPath that git uses now passes, also with a working-tree change in it", () => {
		const inUse = join(root, "hooks-in-use");
		mkdirSync(join(inUse, ".githooks"), { recursive: true });
		initRepo(inUse);
		write(inUse, { ".githooks/pre-push": "#!/bin/sh\nexit 0\n" });
		chmodSync(join(inUse, ".githooks/pre-push"), 0o755);
		git(inUse, "add", ".");
		git(inUse, "commit", "-q", "-m", "base");
		git(inUse, "config", "core.hooksPath", ".githooks");
		write(inUse, { ".githooks/pre-push": "#!/bin/sh\nexit 1\n" });
		expect(
			destructive.run(
				shell("git -c core.hooksPath=./.githooks push", inUse),
				context(inUse),
			).kind,
		).toBe("allow");
	});
});

describe("the clean selection of the work-loss guard", () => {
	let count = 0;
	function untrackedRepo(): string {
		count++;
		const dir = join(root, `clean-${count}`);
		mkdirSync(join(dir, "junk"), { recursive: true });
		initRepo(dir);
		write(dir, { "kept.md": "kept\n" });
		git(dir, "add", "kept.md");
		git(dir, "commit", "-q", "-m", "init");
		write(dir, { "keep.txt": "keep\n", "junk/a.txt": "a\n" });
		return dir;
	}

	test.each([
		["git clean -fq", "deletes the untracked files keep.txt."],
		["git clean -fd junk", "deletes the untracked files junk/a.txt."],
		["git clean -fd -e keep.txt", "deletes the untracked files junk/a.txt."],
		["git clean -f junk", "deletes the untracked files junk/a.txt."],
		["git clean -nf --no-dry-run", "deletes the untracked files keep.txt."],
		["git clean --forc", "deletes the untracked files keep.txt."],
		["git clean -i", "deletes the untracked files keep.txt."],
		["git clean -ffd", "deletes the untracked files junk/a.txt, keep.txt."],
		[
			"git clean -fd --excl keep.txt",
			"deletes the untracked files junk/a.txt.",
		],
	])("%s is denied", (command, text) => {
		const dir = untrackedRepo();
		expect(
			reason(destructive.run(shell(command, dir), context(dir))),
		).toContain(`- ${command} ${text}`);
	});

	test("git clean -ffd is denied for a nested repo", () => {
		const dir = untrackedRepo();
		const nested = join(dir, "vendor/lib");
		mkdirSync(nested, { recursive: true });
		initRepo(nested);
		write(nested, { "lib.ts": "export {};\n" });
		git(nested, "add", "lib.ts");
		git(nested, "commit", "-q", "-m", "lib");
		expect(
			reason(destructive.run(shell("git clean -ffd", dir), context(dir))),
		).toContain("vendor/lib/");
	});

	test("git reset --ha is denied as git reset --hard is", () => {
		const verdict = destructive.run(
			shell("git reset --ha", dirty),
			context(dirty),
		);
		expect(reason(verdict)).toContain("discards the uncommitted changes in");
	});

	test("the guard leaves the index file of the repo as it was", () => {
		const dir = untrackedRepo();
		const index = readFileSync(join(dir, ".git/index"));
		const later = new Date(Date.now() + 60_000);
		utimesSync(join(dir, "kept.md"), later, later);
		destructive.run(shell("git reset --hard", dir), context(dir));
		expect(readFileSync(join(dir, ".git/index")).equals(index)).toBe(true);
	});

	test("git clean -ff passes when only an untracked folder exists", () => {
		const dir = untrackedRepo();
		rmSync(join(dir, "keep.txt"));
		expect(
			destructive.run(shell("git clean -ff", dir), context(dir)).kind,
		).toBe("allow");
	});

	test.each(["git checkout -f main", "git reset --hard main"])(
		"%s is denied when it overwrites an untracked file that main tracks",
		(command) => {
			const dir = untrackedRepo();
			write(dir, { "a.txt": "main\n" });
			git(dir, "add", "a.txt");
			git(dir, "commit", "-q", "-m", "a");
			git(dir, "checkout", "-q", "-b", "feature");
			git(dir, "rm", "-q", "a.txt");
			git(dir, "commit", "-q", "-m", "drop a");
			write(dir, { "a.txt": "work\n" });
			expect(
				reason(destructive.run(shell(command, dir), context(dir))),
			).toContain("a.txt");
			expect(
				destructive.run(shell("git reset --hard", dir), context(dir)).kind,
			).toBe("allow");
		},
	);

	test("the guard deletes no file when it reads git clean --no-dry-run", () => {
		const dir = untrackedRepo();
		const verdict = destructive.run(
			shell("git clean -f --no-dry-run", dir),
			context(dir),
		);
		expect(existsSync(join(dir, "keep.txt"))).toBe(true);
		expect(reason(verdict)).toContain("deletes the untracked files keep.txt.");
	});

	test("git clean -fd -e keep.txt -e junk passes, because it deletes no file", () => {
		const dir = untrackedRepo();
		expect(
			destructive.run(
				shell("git clean -fd -e keep.txt -e junk", dir),
				context(dir),
			).kind,
		).toBe("allow");
	});
});

describe("a repo that this session made", () => {
	let count = 0;

	function fresh(name: string): { dir: string; state: string } {
		count++;
		const dir = join(root, `session-${count}`);
		mkdirSync(dir);
		return { dir: join(dir, name), state: join(dir, "state") };
	}

	function runAs(
		session: string | undefined,
		command: string,
		cwd: string,
		state: string,
	): Verdict {
		return destructive.run(shell(command, cwd), {
			...context(cwd),
			env: { ASTACK_STATE_DIR: state },
			...(session === undefined ? {} : { session }),
		});
	}

	function sessionRun(command: string, cwd: string, state: string): Verdict {
		return runAs("session-1", command, cwd, state);
	}

	function dirtyRepoAt(dir: string): void {
		mkdirSync(dir, { recursive: true });
		initRepo(dir);
		write(dir, { "a.txt": "a\n" });
		git(dir, "add", ".");
		git(dir, "commit", "-q", "-m", "a");
		write(dir, { "a.txt": "b\n", "new.txt": "n\n" });
	}

	function initedRepo(state: string, target: string): void {
		const parent = join(target, "..");
		expect(sessionRun(`git init ${target}`, parent, state).kind).toBe("allow");
		dirtyRepoAt(target);
	}

	const DISCARDS = [
		"git reset --hard",
		"git checkout -- .",
		"git clean -f",
		"git restore :/",
		"git archive HEAD | tar -xf -",
	];

	test.each(DISCARDS)(
		"[control:sg-session-repo] %s passes in a dirty repo that git init made in this session",
		(command) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			expect(sessionRun(command, dir, state).kind).toBe("allow");
		},
	);

	test("[control:sg-session-repo-clone] git reset --hard passes in a repo that git clone made in this session", () => {
		const { dir, state } = fresh("clone");
		const parent = join(dir, "..");
		expect(sessionRun(`git clone ${repo} clone`, parent, state).kind).toBe(
			"allow",
		);
		git(parent, "clone", "-q", repo, "clone");
		write(dir, { "package.json": "{}\n" });
		expect(sessionRun("git reset --hard", dir, state).kind).toBe("allow");
	});

	function reportsBirthTimes(paths: readonly string[]): boolean {
		return paths.every((path) => {
			const { birthtimeNs, ctimeNs } = lstatSync(path, { bigint: true });
			return birthtimeNs !== 0n && birthtimeNs !== ctimeNs;
		});
	}

	const WORKTREE_RESET_BY_BIRTH: Readonly<Record<"known" | "none", Verdict>> = {
		known: { kind: "allow" },
		none: {
			kind: "deny",
			reason:
				"astack blocked a destructive command:\n- git reset --hard discards the uncommitted changes in a.txt. This is an owner gate, so stop and ask the owner.",
		},
	};

	test("[control:sg-session-repo-worktree] git reset --hard in a worktree that git worktree add made in this session passes when the host reports a birth time for each file that the guard stamps, and is denied when it does not", () => {
		const { dir, state } = fresh("main");
		dirtyRepoAt(dir);
		const worktree = join(dir, "..", "wt");
		const gitDir = join(dir, ".git", "worktrees", "wt");
		expect(sessionRun("git worktree add ../wt", dir, state).kind).toBe("allow");
		git(dir, "worktree", "add", "-q", "../wt");
		write(worktree, { "a.txt": "b\n", "new.txt": "n\n" });
		const birth = reportsBirthTimes([
			worktree,
			gitDir,
			join(worktree, ".git"),
			join(gitDir, "HEAD"),
		])
			? "known"
			: "none";
		expect(sessionRun("git reset --hard", worktree, state)).toEqual(
			WORKTREE_RESET_BY_BIRTH[birth],
		);
		expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
			"owner gate",
		);
	});

	test.each([
		["git push --force origin main", "shared branch main"],
		["supabase db reset", "deletes the database data"],
		['git commit --no-verify -m "x"', "--no-verify"],
	])(
		"[control:sg-session-repo-gates] %s keeps its owner gate in a session repo",
		(command, text) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			expect(reason(sessionRun(command, dir, state))).toContain(text);
		},
	);

	test("[control:sg-session-repo-nested] git clean -ffd is denied for a nested repo with no bound record", () => {
		const { dir, state } = fresh("made");
		initedRepo(state, dir);
		const nested = join(dir, "vendor/lib");
		dirtyRepoAt(nested);
		const said = reason(sessionRun("git clean -ffd", dir, state));
		expect(said).toContain("deletes the untracked files vendor/lib/.");
	});

	test.each([
		"git archive --prefix=../victim/ HEAD | tar -xf -",
		"git archive --pref=sub/ HEAD | tar -xf -",
		"git archive --remote=../other HEAD | tar -xf -",
		"git archive --add-file=extra.txt HEAD | tar -xf -",
		"git archive --add-virtual-file=a.txt:x HEAD | tar -xf -",
		"git archive HEAD:docs | tar -xf -",
		"git -C ../other archive HEAD | tar -xf -",
		"git archive --format=tar HEAD | tar -xf -",
	])(
		"[control:sg-session-repo-archive] %s gets no session exemption, because only git archive HEAD in the folder of tar stays in the tree of the repo",
		(command) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			expect(reason(sessionRun(command, dir, state))).toContain(
				"discards the uncommitted changes in a.txt",
			);
		},
	);

	test("git archive HEAD | tar -xf - is denied in a session repo for a dirty nested repo and a dirty submodule", () => {
		const { dir, state } = fresh("made");
		initedRepo(state, dir);
		const nested = join(dir, "vendor/lib");
		dirtyRepoAt(nested);
		const module = join(dir, "..", "module");
		dirtyRepoAt(module);
		git(module, "commit", "-q", "-am", "b");
		git(
			dir,
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"-q",
			module,
			"sub",
		);
		git(dir, "commit", "-q", "-m", "sub");
		write(dir, { "sub/a.txt": "c\n" });
		const said = reason(sessionRun("git archive HEAD | tar -xf -", dir, state));
		expect(said).toContain("vendor/lib/");
		expect(said).toContain("sub");
	});

	test.each<[string, (dir: string, nested: string) => void]>([
		[
			"a HEAD path that names the nested repo in another case",
			(dir) => {
				mkdirSync(join(dir, "vendor/lib"), { recursive: true });
				write(dir, { "vendor/lib/b.txt": "x\n" });
				git(dir, "add", "vendor/lib/b.txt");
				git(dir, "commit", "-q", "-m", "held");
				rmSync(join(dir, "vendor"), { recursive: true, force: true });
			},
		],
		[
			"an ignored file in the nested repo",
			(_, nested) => {
				mkdirSync(nested, { recursive: true });
				write(nested, { ".gitignore": "x.log\n", "x.log": "x\n" });
			},
		],
	])(
		"git archive HEAD | tar -xf - keeps a clean nested repo with %s in a session repo",
		(_, prepare) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			const nested = join(dir, "Vendor/lib");
			prepare(dir, nested);
			dirtyRepoAt(nested);
			git(nested, "add", "-A");
			git(nested, "commit", "-q", "-m", "b");
			expect(sessionRun("git status", dir, state).kind).toBe("allow");
			const said = reason(
				sessionRun("git archive HEAD | tar -xf -", dir, state),
			);
			expect(said).toMatch(/[Vv]endor\/lib\//);
			expect(said).not.toContain("changes in a.txt");
		},
	);

	test("git archive HEAD | tar -xf - passes in a session repo with a clean nested repo that HEAD does not hold, because tar cannot reach it", () => {
		const { dir, state } = fresh("made");
		initedRepo(state, dir);
		const nested = join(dir, "vendor/lib");
		dirtyRepoAt(nested);
		git(nested, "add", ".");
		git(nested, "commit", "-q", "-m", "b");
		expect(sessionRun("git archive HEAD | tar -xf -", dir, state).kind).toBe(
			"allow",
		);
	});

	function withSubmodule(dir: string): void {
		const module = join(dir, "..", "module");
		dirtyRepoAt(module);
		git(module, "commit", "-q", "-am", "b");
		git(
			dir,
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"-q",
			module,
			"sub",
		);
		git(dir, "commit", "-q", "-m", "sub");
		write(dir, { "a.txt": "c\n" });
	}

	test.each([
		["git reset --hard --recurse-submodules", () => {}],
		["git -c submodule.recurse=true reset --hard", () => {}],
		[
			"git reset --hard",
			(dir: string) => git(dir, "config", "submodule.recurse", "true"),
		],
		[
			"git config submodule.recurse true; git reset --hard",
			(dir: string) => git(dir, "config", "submodule.recurse", "false"),
		],
		[
			"git restore :/",
			(dir: string) => git(dir, "config", "submodule.recurse", "false"),
		],
	])(
		"[control:sg-session-repo-submodule] %s gets no session exemption in a repo with a submodule, because a config that the hook cannot read can make git reset the work of each submodule",
		(command, configure) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			withSubmodule(dir);
			configure(dir);
			expect(reason(sessionRun(command, dir, state))).toContain(
				"discards the uncommitted changes in a.txt",
			);
		},
	);

	test("git reset --hard is denied in a session repo with a dirty submodule, because the reset can reach the work of the submodule", () => {
		const { dir, state } = fresh("made");
		initedRepo(state, dir);
		const module = join(dir, "..", "module");
		dirtyRepoAt(module);
		git(module, "commit", "-q", "-am", "b");
		git(
			dir,
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"-q",
			module,
			"sub",
		);
		git(dir, "commit", "-q", "-m", "sub");
		git(dir, "config", "submodule.recurse", "false");
		write(dir, { "sub/a.txt": "c\n" });
		expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
			"discards the uncommitted changes in a.txt, sub.",
		);
	});

	test.each([
		"git init NEW && cp -R OWNER/. NEW",
		"git init NEW && rm -rf NEW/.git && mv OWNER/.git NEW/.git",
	])(
		"[control:sg-session-repo-copied] after %s a reset in the new repo is denied, because the line writes into the target",
		(command) => {
			const { dir, state } = fresh("new");
			const parent = join(dir, "..");
			const owner = join(parent, "owner");
			dirtyRepoAt(owner);
			const made = command.replaceAll("OWNER", owner).replaceAll("NEW", dir);
			expect(sessionRun(made, parent, state).kind).toBe("allow");
			expect(spawnSync("sh", ["-c", made], { cwd: parent }).status).toBe(0);
			expect(sessionRun("ls", parent, state).kind).toBe("allow");
			expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
				"discards the uncommitted changes in a.txt",
			);
		},
	);

	test("after git init NEW && cd NEW && cp a.txt b.txt a reset in the new repo passes, because the copy brings no work from outside", () => {
		const { dir, state } = fresh("new");
		const parent = join(dir, "..");
		const made = `git init -q ${dir} && cd ${dir} && echo a > a.txt && cp a.txt b.txt`;
		expect(sessionRun(made, parent, state).kind).toBe("allow");
		expect(spawnSync("sh", ["-c", made], { cwd: parent }).status).toBe(0);
		dirtyRepoAt(dir);
		expect(sessionRun("ls", parent, state).kind).toBe("allow");
		expect(sessionRun("git reset --hard", dir, state).kind).toBe("allow");
	});

	test.each([
		[
			"a Write call",
			(state: string) =>
				({
					kind: "write",
					path: join(state, "session-repos", "s.json"),
					before: undefined,
					after: "[]",
				}) as const,
		],
		[
			"an echo redirect",
			(state: string, cwd: string) =>
				shell(`echo '[]' > ${state}/session-repos/s.json`, cwd),
		],
		[
			"an &> redirect",
			(state: string, cwd: string) =>
				shell(`echo '[]' &> ${state}/session-repos/s.json`, cwd),
		],
		[
			"a cp to a glob",
			(state: string, cwd: string) =>
				shell(`cp x.json ${state}/sess*/s.json`, cwd),
		],
		[
			"a python -c body",
			(state: string, cwd: string) =>
				shell(
					`python3 -c "open('${state}/session-repos/s.json', 'w').write('[]')"`,
					cwd,
				),
		],
	])(
		"[control:sg-session-repo-record] %s into the session repo record folder is denied",
		(_, event) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			const said = reason(
				destructive.run(event(state, dir), {
					...context(dir),
					env: { ASTACK_STATE_DIR: state },
					session: "session-1",
				}),
			);
			expect(said).toContain("session repo record folder");
		},
	);

	test.each<[string, (state: string, dir: string, owner: string) => void]>([
		[
			"another process swaps the git dir of a bound repo",
			(state, dir, owner) => {
				initedRepo(state, dir);
				expect(sessionRun("git status", dir, state).kind).toBe("allow");
				rmSync(join(dir, ".git"), { recursive: true, force: true });
				renameSync(join(owner, ".git"), join(dir, ".git"));
			},
		],
		[
			"a missing target gets a git dir that is older than the call",
			(state, dir, owner) => {
				expect(sessionRun(`git init ${dir}`, join(dir, ".."), state).kind).toBe(
					"allow",
				);
				mkdirSync(dir);
				renameSync(join(owner, ".git"), join(dir, ".git"));
				write(dir, { "a.txt": "b\n" });
			},
		],
		[
			"an empty target gets a git dir that is older than the call",
			(state, dir, owner) => {
				mkdirSync(dir);
				expect(sessionRun(`git init ${dir}`, join(dir, ".."), state).kind).toBe(
					"allow",
				);
				renameSync(join(owner, ".git"), join(dir, ".git"));
				write(dir, { "a.txt": "b\n" });
			},
		],
		[
			"another process copies the git dir and the work of another repo into a bound repo",
			(state, dir, owner) => {
				initedRepo(state, dir);
				expect(sessionRun("git status", dir, state).kind).toBe("allow");
				spawnSync("cp", ["-R", `${owner}/.`, dir]);
			},
		],
		[
			"a new git dir holds an index entry that is older than the call",
			(state, dir, owner) => {
				expect(sessionRun(`git init ${dir}`, join(dir, ".."), state).kind).toBe(
					"allow",
				);
				mkdirSync(dir);
				initRepo(dir);
				copyFileSync(join(owner, ".git/index"), join(dir, ".git/index"));
			},
		],
	])(
		"[control:sg-session-repo-made] a reset is denied when %s",
		(_, prepare) => {
			const { dir, state } = fresh("new");
			const parent = join(dir, "..");
			const owner = join(parent, "owner");
			dirtyRepoAt(owner);
			prepare(state, dir, owner);
			expect(sessionRun("ls", parent, state).kind).toBe("allow");
			expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
				"owner gate",
			);
		},
	);

	test.each([
		["mv ../owner/a.txt a.txt", true],
		['"$TOOL" a.txt', false],
	])(
		"a reset is denied in a bound repo after a later call runs %s in it",
		(command, run) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			dirtyRepoAt(join(dir, "..", "owner"));
			expect(sessionRun("git status", dir, state).kind).toBe("allow");
			expect(sessionRun(command, dir, state).kind).toBe("allow");
			if (run) spawnSync("sh", ["-c", command], { cwd: dir });
			expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
				"discards the uncommitted changes in a.txt",
			);
		},
	);

	test("[control:sg-session-repo-identity] a reset is denied in a dirty repo that another process made at a dropped pending path", () => {
		const { dir, state } = fresh("made");
		const parent = join(dir, "..");
		expect(sessionRun(`git init ${dir}`, parent, state).kind).toBe("allow");
		expect(sessionRun("ls", parent, state).kind).toBe("allow");
		dirtyRepoAt(dir);
		expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
			"discards the uncommitted changes in a.txt",
		);
	});

	test.each([
		["mv OWNER NEW && git init NEW", (owner: string) => dirtyRepoAt(owner)],
		[
			"rmdir NEW && mv OWNER NEW && git init NEW",
			(owner: string, dir: string) => {
				dirtyRepoAt(owner);
				mkdirSync(dir);
			},
		],
	])(
		"[control:sg-session-repo-moved] after %s a reset in the moved repo is denied",
		(command, prepare) => {
			const { dir, state } = fresh("new");
			const parent = join(dir, "..");
			const owner = join(parent, "owner");
			prepare(owner, dir);
			const made = command.replaceAll("OWNER", owner).replaceAll("NEW", dir);
			expect(sessionRun(made, parent, state).kind).toBe("allow");
			expect(spawnSync("sh", ["-c", made], { cwd: parent }).status).toBe(0);
			expect(sessionRun("ls", parent, state).kind).toBe("allow");
			expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
				"discards the uncommitted changes in a.txt",
			);
		},
	);

	test.each([
		[
			"a symlink to another dirty repo",
			(dir: string) => symlinkSync(dirty, dir),
		],
		["a new dirty repo", (dir: string) => dirtyRepoAt(dir)],
	])(
		"[control:sg-session-repo-replaced] a reset is denied at the path of a bound record that now holds %s",
		(_, replace) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			expect(sessionRun("git status", dir, state).kind).toBe("allow");
			rmSync(dir, { recursive: true, force: true });
			replace(dir);
			expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
				"owner gate",
			);
		},
	);

	test.each([
		"git init --separate-git-dir=OTHER/.git NEW",
		"git init --separate-git-dir OTHER/.git NEW",
	])(
		"[control:sg-session-repo-separate] after %s a reset in the new folder is denied",
		(command) => {
			const { dir, state } = fresh("new");
			const other = join(dir, "..", "other");
			dirtyRepoAt(other);
			git(other, "add", "a.txt");
			const parent = join(dir, "..");
			const made = command.replace("OTHER", other).replace("NEW", dir);
			expect(sessionRun(made, parent, state).kind).toBe("allow");
			spawnSync("sh", ["-c", made], { cwd: parent });
			expect(sessionRun("ls", parent, state).kind).toBe("allow");
			expect(reason(sessionRun("git reset --hard", dir, state))).toContain(
				"owner gate",
			);
		},
	);

	const DISCARDED = "discards the uncommitted changes in a.txt";

	test.each([
		["git --git-dir=REPO/.git reset --hard", DISCARDED],
		["git --work-tree=REPO reset --hard", DISCARDED],
		["GIT_DIR=REPO/.git git reset --hard", DISCARDED],
		["GIT_WORK_TREE=REPO git reset --hard", DISCARDED],
		["GIT_INDEX_FILE=REPO/.git/index git reset --hard", DISCARDED],
		["export GIT_DIR=REPO/.git && git reset --hard", DISCARDED],
		["GIT_DIR=REPO/.git; export GIT_DIR; git reset --hard", DISCARDED],
		["declare -x GIT_DIR=REPO/.git; git reset --hard", DISCARDED],
		["set -a; GIT_WORK_TREE=REPO; git reset --hard", DISCARDED],
		[
			'set -o allexport; read -r "$name" < place.txt; git reset --hard',
			DISCARDED,
		],
		['eval "$SETUP"; git reset --hard', DISCARDED],
		[
			'eval "export GIT_WORK_TREE=$W"; git clean -fdx',
			"deletes the untracked files new.txt",
		],
		[". ./env.sh; git checkout -- .", DISCARDED],
		["source ./setup.sh; git reset --hard", DISCARDED],
		[
			"for i in 1 2; do git reset --hard; export GIT_WORK_TREE=REPO; done",
			DISCARDED,
		],
		["f() { git reset --hard; }; declare -x GIT_DIR=REPO/.git; f", DISCARDED],
		["declare -x $'GIT\\x5fDIR=REPO/.git'; git reset --hard", DISCARDED],
		["set -k; git reset --hard GIT_WORK_TREE=REPO", DISCARDED],
		[
			'setopt allexport; read -r "$name" < place.txt; git reset --hard',
			DISCARDED,
		],
		["export $'GIT\\x5fDIR=REPO/.git'; git reset --hard", DISCARDED],
		["export GIT_{DIR,X}=REPO/.git; git reset --hard", DISCARDED],
		[
			"$'\\x65val' $'export GIT\\x5fWORK_TREE=REPO'; git reset --hard",
			DISCARDED,
		],
		["git $'--git\\x2ddir=REPO/.git' reset --hard", DISCARDED],
		["trap '. ./env.sh' DEBUG; git reset --hard", DISCARDED],
		["git config core.worktree REPO; git reset --hard", DISCARDED],
		["git archive HEAD | tar -x -C REPO", DISCARDED],
		["git archive HEAD | tar --directory=REPO -x", DISCARDED],
		["git archive --prefix=REPO/ HEAD | tar -xP", DISCARDED],
		["export TAR_OPTIONS=-CREPO; git archive HEAD | tar -x", DISCARDED],
	])(
		"[control:sg-session-repo-place] %s gets the deny of main in a dirty session repo",
		(command, text) => {
			const { dir, state } = fresh("made");
			initedRepo(state, dir);
			expect(
				reason(sessionRun(command.replaceAll("REPO", dir), dir, state)),
			).toContain(text);
		},
	);

	test("[control:sg-session-repo-hook-env] a place variable in the env of the hook gives no exemption", () => {
		const { dir, state } = fresh("made");
		initedRepo(state, dir);
		const verdict = destructive.run(shell("git reset --hard", dir), {
			...context(dir),
			env: { ASTACK_STATE_DIR: state, GIT_DIR: join(dir, ".git") },
			session: "session-1",
		});
		expect(reason(verdict)).toContain("owner gate");
	});

	test.each<[string, string | undefined, (state: string) => void]>([
		["no session id", undefined, () => {}],
		["an id with a slash", "a/b", () => {}],
		[
			"a state folder that refuses a write",
			"session-1",
			(state) => {
				mkdirSync(state);
				chmodSync(state, 0o500);
			},
		],
	])(
		"[control:sg-session-repo-closed] with %s the discard after git init is denied",
		(_, session, prepare) => {
			const { dir, state } = fresh("made");
			const parent = join(dir, "..");
			prepare(state);
			expect(runAs(session, `git init ${dir}`, parent, state).kind).toBe(
				"allow",
			);
			dirtyRepoAt(dir);
			expect(runAs(session, "ls", parent, state).kind).toBe("allow");
			const said = reason(runAs(session, "git reset --hard", dir, state));
			if (session === "session-1") chmodSync(state, 0o755);
			expect(said).toContain("discards the uncommitted changes in a.txt");
		},
	);

	test("[control:sg-session-repo-save-fails] a pending entry that binds in a call whose save fails passes the discard of that call", () => {
		const { dir, state } = fresh("made");
		initedRepo(state, dir);
		const folder = join(state, "session-repos");
		chmodSync(folder, 0o500);
		const first = sessionRun("git reset --hard", dir, state).kind;
		const second = sessionRun("git reset --hard", dir, state).kind;
		chmodSync(folder, 0o755);
		expect([first, second]).toEqual(["allow", "allow"]);
		expect(
			JSON.parse(readFileSync(join(folder, "session-1.json"), "utf8")),
		).toEqual([
			{
				kind: "pending",
				path: realpathSync(dir),
				free: { kind: "missing", since: expect.stringMatching(/^\d+$/) },
			},
		]);
	});

	test.each<[string, (state: string, target: string) => string]>([
		[
			"a record file that is a folder",
			(state) => {
				mkdirSync(join(state, "session-repos", "session-1.json"), {
					recursive: true,
				});
				return state;
			},
		],
		[
			"a record of a wrong shape",
			(state) => {
				mkdirSync(join(state, "session-repos"), { recursive: true });
				writeFileSync(
					join(state, "session-repos", "session-1.json"),
					'[{"kind":"bound","path":"/x"}]',
				);
				return state;
			},
		],
		[
			"a pending path with a NUL byte",
			(state) => {
				mkdirSync(join(state, "session-repos"), { recursive: true });
				writeFileSync(
					join(state, "session-repos", "session-1.json"),
					JSON.stringify([{ kind: "pending", path: "/tmp/a\u0000b" }]),
				);
				return state;
			},
		],
		[
			"a state path that is a file",
			(state) => {
				writeFileSync(state, "x");
				return state;
			},
		],
		[
			"an init target that is a file",
			(state, target) => {
				writeFileSync(target, "x");
				return state;
			},
		],
	])(
		"[control:sg-session-repo-total] with %s a call still denies a force-push and a discard in another repo",
		(_, fault) => {
			const { dir, state } = fresh("made");
			const parent = join(dir, "..");
			const used = fault(state, dir);
			const command = `git init ${dir}; git push --force origin main; git -C ${dirty} reset --hard`;
			const said = reason(sessionRun(command, parent, used));
			const later = sessionRun("git status", parent, used).kind;
			expect(said).toContain("shared branch main");
			expect(said).toContain("discards the uncommitted changes in notes.txt");
			expect(later).toBe("allow");
		},
	);
});
