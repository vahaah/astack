import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	fileWrites,
	type ShellStep,
	shellSteps,
} from "../../src/astack/shell.ts";

type Form = {
	readonly group: string;
	readonly command: string;
	readonly steps?: readonly string[];
};

const forms: readonly Form[] = JSON.parse(
	readFileSync(join(import.meta.dir, "../fixtures/guard-bypass.json"), "utf8"),
).forms;

function rendered(step: ShellStep): string {
	const words = step.simple.words.map((word) =>
		word.dynamic ? `$${word.value}` : word.value,
	);
	const mark = step.unreadable === undefined ? "" : ` [${step.unreadable}]`;
	return `${words.join(" ")}${mark}`;
}

function plain(command: string): readonly string[] {
	return shellSteps(command, "/work/repo").map(rendered);
}

describe("the plain form of each shell step", () => {
	test.each(
		forms.flatMap((form) =>
			form.steps === undefined ? [] : [[form.command, form.steps] as const],
		),
	)("the probe form %s runs the plain steps %p", (command, steps) => {
		expect(plain(command)).toEqual([...steps]);
	});

	test.each([
		["sudo -u root -E LEFTHOOK=0 git push", ["LEFTHOOK=0 git push"]],
		[
			"LEFTHOOK=0 bash -c 'git status; git push'",
			["LEFTHOOK=0 git status", "LEFTHOOK=0 git push"],
		],
		["timeout -s KILL 60 nice -5 git clean -fd", ["git clean -fd"]],
		[
			"find . -name x | xargs -I% git checkout %",
			["find . -name x", "git checkout $%"],
		],
		[
			"for f in $(git ls-files); do git checkout $f; done",
			["git ls-files", "git checkout $f"],
		],
		["function f { git reset --hard; }", ["git reset --hard"]],
		["cd sub && git reset --hard", ["git reset --hard"]],
	])("%s runs %p", (command, steps) => {
		expect(plain(command)).toEqual(steps);
	});

	test.each([
		["sudo -s git reset --hard", "sudo -s git reset --hard [wrapper]"],
		['"$GIT" reset --hard', "$GIT reset --hard [program]"],
		['bash -c "git reset --hard $REF"', "bash -c $git reset --hard REF [body]"],
		["cd ~ && git reset --hard", "git reset --hard [folder]"],
		["popd && git reset --hard", "git reset --hard [folder]"],
	])("%s holds the unreadable step %s", (command, step) => {
		expect(plain(command)).toContain(step);
	});

	test("a body past 4 levels is unreadable, and astack reads no step in it", () => {
		expect(
			plain("echo $(echo $(echo $(echo $(echo $(git reset --hard)))))"),
		).toEqual(["echo $ [depth]", "echo $", "echo $", "echo $", "echo $"]);
	});

	test("a cd moves the folder of each later step, and a body keeps its own folder", () => {
		const steps = shellSteps(
			"cd sub && bash -c 'cd ../b && git status' && git log",
			"/work/repo",
		);
		expect(steps.map((step) => [step.values.join(" "), step.dir])).toEqual([
			["git status", "/work/repo/b"],
			["git log", "/work/repo/sub"],
		]);
	});

	test("a pipe feeds tee from the step before it, also when tee has a substitution", () => {
		const writes = fileWrites(
			shellSteps("echo hi | tee $(echo out.txt) notes.md", "/work"),
		);
		expect(writes.map((write) => [write.target.value, write.body])).toEqual([
			["", "hi\n"],
			["notes.md", "hi\n"],
		]);
	});

	test("&> and &>> write the stdout of the step to their target, and no step runs in the background", () => {
		const steps = shellSteps("echo hi &> a.md; echo ho &>> b.md", "/work");
		expect(steps.map((step) => step.simple.background === true)).toEqual([
			false,
			false,
		]);
		expect(
			fileWrites(steps).map((write) => [
				write.target.value,
				write.append,
				write.body,
			]),
		).toEqual([
			["a.md", false, "hi\n"],
			["b.md", true, "ho\n"],
		]);
	});
});
