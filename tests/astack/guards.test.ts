import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
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
import { duplicatePr } from "../../src/astack/hook/handlers/duplicate-pr.ts";
import { type OpenPr, openPrsFrom } from "../../src/astack/pr/open.ts";

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
		"git archive HEAD docs | tar -x",
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
		mkdirSync(join(hooked, "src"));
		initRepo(hooked);
		write(hooked, {
			".githooks/pre-push": "#!/bin/sh\nexit 0\n",
			"src/app.ts": "a\n",
		});
		git(hooked, "add", ".");
		git(hooked, "commit", "-q", "-m", "base");
		git(hooked, "checkout", "-q", "-b", "feature");
	});

	function run(command: string, recorded: boolean): Verdict {
		const head = spawnSync("git", ["rev-parse", "HEAD"], {
			cwd: hooked,
			encoding: "utf8",
		}).stdout.trim();
		const env = { ASTACK_STATE_DIR: state };
		rmSync(state, { recursive: true, force: true });
		if (recorded)
			saveGateRecord(env, {
				head,
				base: "main",
				baseSha: head,
				ran: ["lint"],
				skipped: [],
			});
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
		const said = reason(run(command, false));
		expect(said).toContain(`${command} skips the git hooks of the repo.`);
		expect(said).toContain("owner gate");
	});

	test("an exported skip variable reaches the push after it", () => {
		expect(reason(run("export HUSKY=0 && git push", false))).toContain(
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
			const said = reason(run(command, false));
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
		expect(run(command, false).kind).toBe("allow");
	});

	test.each([
		"git push --no-verify",
		"LEFTHOOK=0 git push origin feature",
		"HUSKY=0 git push origin HEAD:feature",
		"export HUSKY=0 && git push",
	])(
		"[control:sg-gates-run] %s passes when astack gates run recorded HEAD",
		(command) => {
			expect(run(command, true).kind).toBe("allow");
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
		const said = reason(run(command, true));
		expect(said).toContain(text);
		expect(said).toContain("owner gate");
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

describe("the duplicate PR guard", () => {
	const open: readonly OpenPr[] = [
		{
			number: 12,
			url: "https://github.com/o/r/pull/12",
			head: "dev/abc-1/export",
			title: "Stream the export",
			body: "Part of ABC-1, ABC-2\n\n## Why\nx",
		},
	];

	function run(event: HookEvent, list = open): Verdict {
		return duplicatePr(() => list).run(event, context(repo));
	}

	test("a second PR for the same branch is denied", () => {
		const verdict = run(
			shell('gh pr create --title "Add x" --body "Part of ABC-9"'),
		);
		expect(reason(verdict)).toContain(
			"#12 (https://github.com/o/r/pull/12) is already open for the branch dev/abc-1/export",
		);
	});

	test("a PR on another branch for a ticket of an open PR is denied", () => {
		const verdict = run(
			shell(
				'gh pr create --head dev/abc-2/fix --title "Fix y" --body "Part of ABC-2"',
			),
		);
		expect(reason(verdict)).toContain("is already open for ABC-2");
	});

	test("a PR for new work passes, and an unreadable list fails open", () => {
		expect(
			run(
				shell(
					'gh pr create --head dev/abc-3/new --title "New" --body "Part of ABC-3"',
				),
			).kind,
		).toBe("allow");
		expect(
			duplicatePr(() => undefined).run(
				shell('gh pr create --title "x" --body "Part of ABC-1"'),
				context(repo),
			).kind,
		).toBe("allow");
	});

	test("the GitHub MCP create tool gets the same check", () => {
		const verdict = run({
			kind: "mcp",
			server: "plugin_github_github",
			tool: "create_pull_request",
			input: {
				owner: "o",
				repo: "r",
				head: "dev/abc-1/export",
				title: "Again",
				body: "Part of ABC-7",
			},
		});
		expect(reason(verdict)).toContain("already open for the branch");
	});

	test("the gh list reply parses to open PRs", () => {
		expect(
			openPrsFrom([
				{ number: 3, url: "u", headRefName: "b", title: "t", body: "x" },
				{ title: "no number" },
			]),
		).toEqual([{ number: 3, url: "u", head: "b", title: "t", body: "x" }]);
		expect(openPrsFrom({})).toBeUndefined();
	});
});
