import { describe, expect, test } from "bun:test";
import {
	type FlatContext,
	SKILL_DIR_NOTE,
	toCodex,
	toFlat,
} from "../../scripts/dist/codemods.ts";

const ASTACK: FlatContext = {
	owner: "astack",
	astackSkills: new Set(["plan", "coding-guide", "control-cli", "grilling"]),
};
const SKILL_DIR = `\${CLAUDE_SKILL_DIR}`;

function dir(text: string): string {
	return text.replaceAll("$DIR", SKILL_DIR);
}

describe("flat names", () => {
	test("slash commands and bare references become flat", () => {
		expect(
			toFlat(
				"Run `/astack:plan`, then `astack:coding-guide`, `/astack:no-comments`, `astack:delegate` and `astack:grilling`.",
				ASTACK,
			),
		).toBe(
			"Run `/astack-plan`, then `astack-coding-guide`, `/astack-no-comments`, `astack-delegate` and `astack-grilling`.",
		);
	});

	test("retired namespaces stay visible for validation to reject", () => {
		const text = "Run `pstack:tdd` and `/flow:no-such-skill`.";
		expect(toFlat(text, ASTACK)).toBe(text);
	});

	test("skill-path arguments, permission rules and placeholders stay", () => {
		const text =
			"Run `astack skill-path astack:how` and `astack skill-path astack:plan references/phase-boundaries.md`. `Bash(astack:*)` covers <plugin>:<skill>.";
		expect(toFlat(text, ASTACK)).toBe(text);
	});

	test("skill folder paths become relative, and astack siblings get the prefix", () => {
		expect(
			toFlat(
				dir(
					"Read `$DIR/references/stages.md` and `$DIR/../coding-guide/SKILL.md`. See [the guide](../coding-guide/SKILL.md).",
				),
				ASTACK,
			),
		).toBe(
			"Read `references/stages.md` and `../astack-coding-guide/SKILL.md`. See [the guide](../astack-coding-guide/SKILL.md).",
		);
		expect(
			toFlat(
				dir(
					"`$DIR/../grilling/SKILL.md`, `$DIR/../references/a.md` and `../bin/astack`",
				),
				ASTACK,
			),
		).toBe(
			"`../astack-grilling/SKILL.md`, `../references/a.md` and `../bin/astack`",
		);
	});

	test("agent references keep their skills directory and flatten known skill names", () => {
		const body =
			"[guide](../skills/grilling/references/a.md) [other](../skills/unknown/a.md)";
		expect(toFlat(body, ASTACK)).toBe(
			"[guide](../skills/astack-grilling/references/a.md) [other](../skills/unknown/a.md)",
		);
	});

	test("a command in a code fence names the skill folder, and the skill says what that is", () => {
		const out = toFlat(
			dir('# Control\n\n```sh\npython3 "$DIR/scripts/pty.py" start\n```\n'),
			ASTACK,
		);
		expect(out).toContain('python3 "<skill-dir>/scripts/pty.py" start');
		expect(out).toContain(`# Control\n\n${SKILL_DIR_NOTE}\n`);
	});

	test("Skill tool phrases become plain skill calls", () => {
		expect(toFlat('Call the Skill tool with "astack:grilling".', ASTACK)).toBe(
			'Invoke the "astack-grilling" skill.',
		);
		expect(
			toFlat(
				'call the Skill tool twice, for "astack:grilling" and "astack:domain-modeling"',
				ASTACK,
			),
		).toBe('invoke the "astack-grilling" and "astack-domain-modeling" skills');
		expect(
			toFlat(
				"Load `astack:coding-rules` with the Skill tool before your first edit.",
				ASTACK,
			),
		).toBe("Load `astack-coding-rules` before your first edit.");
		expect(
			toFlat(
				"The rest set `disable-model-invocation`, so the Skill tool refuses them.",
				ASTACK,
			),
		).toBe(
			"The rest set `disable-model-invocation`, so the model cannot invoke them.",
		);
		expect(toFlat("Plan the work in `$ARGUMENTS`.", ASTACK)).toBe(
			"Plan the work in the user's request.",
		);
	});
});

describe("the Codex dialect", () => {
	test("slash commands take a dollar sign, and bare names keep the plugin", () => {
		expect(
			toCodex(
				"Run `/astack:plan`. Load `astack:coding-rules` with the Skill tool.",
			),
		).toBe("Run `$astack:plan`. Load `astack:coding-rules`.");
	});
});
