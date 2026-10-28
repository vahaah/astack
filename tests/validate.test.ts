import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { builtFlowSkills } from "../scripts/apply.ts";
import {
	applyAllowlist,
	bareSlashPattern,
	buildCatalog,
	checkBareSlashCommands,
	checkLinks,
	checkLoadGate,
	checkPaths,
	checkPluginNames,
	checkSiblingFallbacks,
	checkSkillToolCallees,
	checkSubagentTypes,
	FLOW_RESIDUAL_PATTERNS,
	loadGateFindings,
	type Plugin,
	parseAllowFile,
	relativeLinkTarget,
	residualGroup,
	scanResiduals,
	validate,
} from "../scripts/validate.ts";
import { err, ok } from "../src/astack/result.ts";

const P = "pstack";
const F = "flow";
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function write(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

function plugin(name: string, files: Record<string, string>): Plugin {
	const root = mkdtempSync(join(tmpdir(), `validate-${name}-`));
	roots.push(root);
	write(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ name }));
	for (const [relpath, text] of Object.entries(files))
		write(join(root, relpath), text);
	return { name, root };
}

const skill = (name: string, body: string, dmi = false) =>
	`---\nname: ${name}\ndescription: d\n${dmi ? "disable-model-invocation: true\n" : ""}---\n\n${body}\n`;

const lines = (file: string, text: string) =>
	text.split("\n").map((line, index) => ({
		file,
		relpath: file,
		line: index + 1,
		text: line,
	}));

const upstreamSkill = (name: string, origin: string, body: string) =>
	`---\nname: ${name}\ndescription: d\nmetadata:\n  origin: ${origin}\n---\n\n# ${name}\n\n${body || "Read the workflow."}\n`;

function marketplace(plugins: Record<string, Record<string, string>>): string {
	const root = mkdtempSync(join(tmpdir(), "validate-marketplace-"));
	roots.push(root);
	write(
		join(root, ".claude-plugin/marketplace.json"),
		JSON.stringify({
			name: "astack",
			plugins: Object.keys(plugins).map((name) => ({
				name,
				source: `./plugins/${name}`,
			})),
		}),
	);
	for (const [name, files] of Object.entries(plugins)) {
		const pluginRoot = join(root, "plugins", name);
		write(
			join(pluginRoot, ".claude-plugin/plugin.json"),
			JSON.stringify({ name }),
		);
		for (const [relpath, text] of Object.entries(files))
			write(join(pluginRoot, relpath), text);
	}
	return root;
}

function validateFixture(root: string, allow: { cursor?: string } = {}) {
	if (allow.cursor !== undefined)
		write(join(root, "cursor.allow"), allow.cursor);
	return validate({
		marketplace: root,
		allowFile: join(root, "cursor.allow"),
		flowAllowFile: join(root, "flow.allow"),
		rulesDir: join(root, "rules"),
		claude: false,
	});
}

function reportBlock(text: string, title: string): string[] {
	const all = text.split("\n");
	const start = all.findIndex((line) => line.includes(` ${title}`));
	if (start === -1) return [];
	const end = all.indexOf("", start);
	return all.slice(start, end === -1 ? undefined : end);
}

describe("residuals", () => {
	test("skips the bundled astack CLI, which names every hook tool as data", () => {
		const astack = plugin("astack", {
			"bin/astack.js": 'const TOOLS = ["claude-code", "grok-build"];\n',
			"skills/plan/SKILL.md": skill("plan", "Ask grok for a review."),
		});
		expect(scanResiduals(astack.root).map((found) => found.relpath)).toEqual([
			"skills/plan/SKILL.md",
		]);
	});

	test("accepts the Grok Build plugin root in a hook command", () => {
		const command = `sh -c '"\${CLAUDE_PLUGIN_ROOT:-$GROK_PLUGIN_ROOT}/bin/astack" hook claude-code Stop'`;
		const astack = plugin("astack", {
			"hooks/hooks.json": `${JSON.stringify({ command })}\n`,
		});
		expect(scanResiduals(astack.root)).toEqual([]);
	});

	test("finds Cursor-isms and skips attribution files", () => {
		const pstack = plugin(P, {
			"skills/how/SKILL.md": skill(
				"how",
				'Use `readonly: true` and `environment: "cloud"`.',
			),
			"skills/poteto-mode/scripts/watch-pr/github.ts":
				"const endCursor = page.endCursor;\n",
			NOTICE: "A port of a Cursor plugin.\n",
		});
		const found = scanResiduals(pstack.root).map(
			(r) => `${r.relpath}:${r.line}:${r.patternId}`,
		);
		expect(found).toEqual([
			"skills/how/SKILL.md:6:cloud-environment",
			"skills/how/SKILL.md:6:readonly-mode",
		]);
	});

	test("flags the Cursor Automations host's tools, docs and UI", () => {
		const pstack = plugin(P, {
			"automations/benny/SKILL.md": [
				"Forbid `SendSlackMessage` in every child.",
				"Use built-in `/automate` and the Automations editor.",
				"Read https://cursor.com/docs/skills first.",
				"Type `/in-cloud` before the task.",
				"Hand work to cloud subagents.",
				"Post through the claude.ai Slack connector.",
			].join("\n"),
		});
		expect(scanResiduals(pstack.root).map((found) => found.patternId)).toEqual([
			"cursor-slack-tools",
			"cursor-automations",
			"cursor-docs",
			"in-cloud",
			"cursor-projects",
		]);
	});

	test("an allow entry covers matching lines in matching files and counts its use", () => {
		const pstack = plugin(P, {
			"skills/poteto-mode/scripts/watch-pr/github.ts":
				'author.includes("bugbot")\n',
			"skills/poteto-mode/references/bugbot-triage.md": "# Bugbot triage\n",
		});
		const { entries, errors } = parseAllowFile(
			"# header\nskills/poteto-mode/scripts/**/*.ts:bugbot:the watcher reads review-bot threads on GitHub\n",
		);
		expect(errors).toEqual([]);
		const { unallowed, allowed } = applyAllowlist(
			scanResiduals(pstack.root),
			entries,
		);
		expect(allowed.map((r) => r.relpath)).toEqual([
			"skills/poteto-mode/scripts/watch-pr/github.ts",
		]);
		expect(unallowed.map((r) => r.relpath)).toEqual([
			"skills/poteto-mode/references/bugbot-triage.md",
		]);
		expect(entries[0]?.used).toBe(1);
	});

	test("allow entries keep colons inside the regex", () => {
		const { entries } = parseAllowFile(
			'skills/swarm/SKILL.md:environment: "cloud":explained in the overlay\n',
		);
		expect(entries[0]?.regex.source).toBe('environment: "cloud"');
		expect(entries[0]?.reason).toBe("explained in the overlay");
	});

	test("malformed allow entries are errors", () => {
		expect(parseAllowFile("skills/x.md:no-reason\n").errors).toHaveLength(1);
		expect(parseAllowFile("skills/x.md:(:bad regex\n").errors).toHaveLength(1);
	});

	test("groups files the way overlay work is split", () => {
		expect(residualGroup("skills/poteto-mode/SKILL.md")).toBe(
			"skills/poteto-mode/SKILL.md",
		);
		expect(residualGroup("skills/poteto-mode/playbooks/babysit.md")).toBe(
			"skills/poteto-mode/playbooks/",
		);
		expect(residualGroup("skills/principle-prove-it-works/SKILL.md")).toBe(
			"skills/principle-*",
		);
		expect(residualGroup("skills/reflect/references/synthesizer.md")).toBe(
			"skills/reflect/",
		);
		expect(residualGroup("agents/poteto-agent.md")).toBe(
			"agents/poteto-agent.md",
		);
	});
});

describe("subagent types and names", () => {
	const pstack = () =>
		plugin(P, {
			"skills/how/SKILL.md": skill("how", "", true),
			"skills/no-comments/SKILL.md": skill("no-comments", ""),
			"agents/comment-sicko.md":
				"---\nname: comment-sicko\ndescription: d\n---\n",
		});

	test("accepts built-ins and namespaced plugin agents", () => {
		const catalog = buildCatalog([pstack()]);
		const result = checkSubagentTypes(
			lines(
				"x.md",
				`subagent_type: general-purpose\n\`subagent_type: "${P}:comment-sicko"\`\nsubagent_type: Explore`,
			),
			catalog,
		);
		expect(result.findings).toEqual([]);
	});

	test("rejects bare plugin agents and unknown types", () => {
		const catalog = buildCatalog([pstack()]);
		const result = checkSubagentTypes(
			lines(
				"x.md",
				'subagent_type: "comment-sicko"\nsubagent_type: generalPurpose',
			),
			catalog,
		);
		expect(result.findings.map((finding) => finding.message)).toEqual([
			"subagent_type comment-sicko is not a built-in or a plugin agent (plugin agents need <plugin>:<agent>)",
			"subagent_type generalPurpose is not a built-in or a plugin agent (plugin agents need <plugin>:<agent>)",
		]);
	});

	test("skips templates and only warns about plugins outside the marketplace", () => {
		const catalog = buildCatalog([pstack()]);
		const result = checkSubagentTypes(
			lines(
				"x.md",
				`\`subagent_type: "pr-review-toolkit:<agent>"\`\n\`subagent_type: "other-plugin:reviewer"\`\n\`subagent_type: "${P}:missing"\``,
			),
			catalog,
		);
		expect(
			result.findings.map(
				(finding) => `${finding.severity} ${finding.message}`,
			),
		).toEqual([
			"warning subagent_type other-plugin:reviewer names a plugin outside this marketplace, so it cannot be checked",
			`error subagent_type ${P}:missing is not a built-in or a plugin agent`,
		]);
	});

	test("names must exist, and the Skill tool cannot reach a DMI skill", () => {
		const catalog = buildCatalog([pstack()]);
		const result = checkPluginNames(
			lines(
				"x.md",
				[
					`Run \`/${P}:no-comments\` before opening a PR.`,
					`Invoke ${P}:no-comments with the Skill tool.`,
					`Invoke ${P}:how with the Skill tool.`,
					`Read ${P}:how by path.`,
					`Use ${P}:missing.`,
				].join("\n"),
			),
			catalog,
		);
		expect(
			result.findings.map((finding) => `${finding.line}: ${finding.message}`),
		).toEqual([
			`3: ${P}:how has disable-model-invocation, so the Skill tool refuses it; read its SKILL.md by path instead`,
			`5: ${P}:missing is not a skill or agent in ${P}`,
		]);
	});

	test("a DMI skill that the model is told to run, use or invoke is an error", () => {
		const catalog = buildCatalog([pstack()]);
		const result = checkPluginNames(
			lines(
				"astack/skills/deslop/SKILL.md",
				[
					`Run \`/${P}:how\` over the touched module.`,
					`Use /${P}:how on the old shape.`,
					`Invoke \`${P}:how\` on the diff.`,
					`Tell the user to run \`/${P}:how\`.`,
					`Read \`${P}:how\` by path and run it on the diff.`,
					`A running system answers it | \`${P}:how\` |`,
				].join("\n"),
			),
			catalog,
		);
		expect(result.findings.map((finding) => finding.line)).toEqual([1, 2, 3]);
		const guide = checkPluginNames(
			lines(`${P}/guide/01-setup.md`, `Run \`/${P}:how\` on it.`),
			catalog,
		);
		expect(guide.findings).toEqual([]);
	});
});

describe("paths", () => {
	test("resolves CLAUDE_SKILL_DIR from the skill and CLAUDE_PLUGIN_ROOT from the plugin", () => {
		const pstack = plugin(P, {
			"skills/how/SKILL.md": skill(
				"how",
				`Read \`\${CLAUDE_SKILL_DIR}/../why/SKILL.md\` and \`\${CLAUDE_SKILL_DIR}/../gone/SKILL.md\`.`,
			),
			"skills/why/SKILL.md": skill(
				"why",
				`Template \`\${CLAUDE_SKILL_DIR}/../<name>/SKILL.md\`.`,
			),
			"agents/poteto-agent.md": `---\nname: poteto-agent\ndescription: d\n---\n\nRead \`\${CLAUDE_PLUGIN_ROOT}/skills/how/SKILL.md\`, not \`\${CLAUDE_SKILL_DIR}/x\`.\n`,
			"skills/how/references/note.md": `See \`\${CLAUDE_PLUGIN_ROOT}/skills/why/SKILL.md\`.\n`,
		});
		const messages = checkPaths([pstack]).findings.map(
			(finding) =>
				`${finding.severity} ${finding.file}:${finding.line} ${finding.message}`,
		);
		expect(messages).toEqual([
			`error ${P}/agents/poteto-agent.md:6 \${CLAUDE_SKILL_DIR} is substituted only in SKILL.md bodies; use \${CLAUDE_PLUGIN_ROOT} in agents`,
			`error ${P}/skills/how/SKILL.md:6 missing \${CLAUDE_SKILL_DIR}/../gone/SKILL.md`,
			`warning ${P}/skills/how/references/note.md:1 \${CLAUDE_PLUGIN_ROOT} stays literal in a file read by path`,
		]);
	});

	test("a JSON-escaped quote ends a CLAUDE_PLUGIN_ROOT path", () => {
		const command = (bin: string) =>
			`"\${CLAUDE_PLUGIN_ROOT}/bin/${bin}" hook claude-code PreToolUse`;
		const astack = plugin("astack", {
			"bin/astack": "#!/bin/sh\n",
			"hooks/hooks.json": JSON.stringify(
				{
					hooks: [{ command: command("astack") }, { command: command("gone") }],
				},
				null,
				"\t",
			),
		});
		const messages = checkPaths([astack]).findings.map(
			(finding) => `${finding.line} ${finding.message}`,
		);
		expect(messages).toEqual([`7 missing \${CLAUDE_PLUGIN_ROOT}/bin/gone`]);
	});
});

describe("flow", () => {
	const flow = () =>
		plugin(F, {
			"skills/grilling/SKILL.md": skill("grilling", ""),
			"skills/implement/SKILL.md": skill("implement", "", true),
			"skills/teach/SKILL.md": skill("teach", "", true),
		});

	test("Skill tool calls must name the plugin, and astack:<name> names resolve", () => {
		const catalog = buildCatalog([flow()]);
		const text = [
			'Call the Skill tool with "grilling".',
			`Call the Skill tool with "${F}:grilling", then \`research\` notes.`,
			`Call the Skill tool with \`${F}:implement\`.`,
			`Tell the user to run \`/${F}:teach\`, not ${F}:missing.`,
		].join("\n");
		const callees = checkSkillToolCallees(lines(`${F}/x.md`, text), F, catalog);
		expect(callees.findings.map((finding) => finding.message)).toEqual([
			`"grilling" is a bare skill name in a Skill tool call; name it ${F}:grilling`,
		]);
		const names = checkPluginNames(lines(`${F}/x.md`, text), catalog);
		expect(
			names.findings.map((finding) => `${finding.line}: ${finding.message}`),
		).toEqual([
			`3: ${F}:implement has disable-model-invocation, so the Skill tool refuses it; read its SKILL.md by path instead`,
			`4: ${F}:missing is not a skill or agent in ${F}`,
		]);
	});

	test("a flow line that names astack or pstack says what to do without it", () => {
		const result = checkSiblingFallbacks(
			lines(
				`${F}/skills/implement/SKILL.md`,
				[
					"The PR body follows `astack:write-docs`.",
					`Run \`/${P}:no-comments\` when ${P} is installed.`,
					"The PR body follows the template, else `astack:write-docs`.",
				].join("\n"),
			),
		);
		expect(result.findings.map((finding) => finding.line)).toEqual([1]);
		expect(
			checkSiblingFallbacks(
				lines(`${F}/skills/ask-matt/SKILL.md`, `Use \`/${P}:how\`.`),
			).findings,
		).toEqual([]);
	});

	test("pstack slash commands name the plugin outside headings", () => {
		const catalog = buildCatalog([
			plugin(P, { "skills/how/SKILL.md": skill("how", "", true) }),
		]);
		const result = checkBareSlashCommands(
			lines(
				`${P}/guide/03-understand.md`,
				`## Trace behavior with \`/how\`\nRun /how on it.\nRun /${P}:how on it.`,
			),
			P,
			catalog,
		);
		expect(result.findings.map((finding) => finding.line)).toEqual([2]);
	});

	test("flags upstream names and bare slash commands", () => {
		const root = flow().root;
		write(
			join(root, "skills/grilling/notes.md"),
			[
				"Run `/setup-matt-pocock-skills` and edit GLOSSARY.md.",
				`Then /teach, \`/${F}:teach\`, \`/prototype/<name>\` and \`/pr\`.`,
			].join("\n"),
		);
		const patterns = [
			...FLOW_RESIDUAL_PATTERNS,
			bareSlashPattern(F, ["grilling", "teach", "prototype"]),
		];
		expect(
			scanResiduals(root, patterns)
				.filter((residual) => residual.relpath.endsWith("notes.md"))
				.map((residual) => `${residual.line} ${residual.patternId}`),
		).toEqual([
			"1 upstream-setup-name",
			"1 glossary-file",
			"2 pr-skill",
			`2 bare-${F}-slash`,
		]);
	});

	test("a bare slash pattern with no skill names matches no line", () => {
		const { pattern } = bareSlashPattern(F, []);
		expect(
			["Split a/b and c / d.", "End with a slash /", "Quote `/`."].filter(
				(line) => pattern.test(line),
			),
		).toEqual([]);
	});

	test("links inside code fences are examples, not links", () => {
		const docs = plugin(F, {
			"skills/x/SKILL.md": skill(
				"x",
				"```md\n- [Ordering](./src/ordering/CONTEXT.md)\n```\n\nSee [gone](./gone.md).",
			),
		});
		expect(
			checkLinks([docs]).findings.map((finding) => finding.message),
		).toEqual(["link ./gone.md has no target"]);
	});
});

describe("upstream checks", () => {
	const residual = "Run `/setup-matt-pocock-skills` first.";

	test("a flow item under an astack path still gets the flow residual check, and astack text does not", () => {
		const root = marketplace({
			astack: {
				"skills/grilling/SKILL.md": upstreamSkill(
					"grilling",
					"mattpocock-skills",
					residual,
				),
				"skills/plan/SKILL.md": upstreamSkill(
					"plan",
					"mattpocock-skills pstack",
					residual,
				),
				"skills/notes/SKILL.md": skill("notes", `# Notes\n\n${residual}`),
			},
		});
		const report = validateFixture(root);
		expect(report.errors).toBe(1);
		const block = reportBlock(report.text, "residual upstream names in flow");
		expect(block[0]).toBe(
			"FAIL residual upstream names in flow (1 errors, 0 warnings)",
		);
		expect(block.slice(-2)).toEqual([
			"  astack/skills/grilling/SKILL.md",
			`    10: upstream-setup-name: ${residual}`,
		]);
	});

	test("a Skill tool call in a flow item names the plugin that holds the item", () => {
		const call = 'Call the Skill tool with "grilling".';
		const root = marketplace({
			astack: {
				"skills/grilling/SKILL.md": upstreamSkill(
					"grilling",
					"mattpocock-skills",
					call,
				),
				"skills/notes/SKILL.md": skill("notes", `# Notes\n\n${call}`),
			},
		});
		const report = validateFixture(root);
		expect(
			reportBlock(report.text, "Skill tool calls in astack name their plugin"),
		).toEqual([
			"FAIL Skill tool calls in astack name their plugin (1 errors, 0 warnings)",
			"  1 bare callees found",
			"  astack/skills/grilling/SKILL.md",
			'    10: "grilling" is a bare skill name in a Skill tool call; name it astack:grilling',
		]);
		expect(report.errors).toBe(1);
	});

	test("an allow entry of the Cursor check covers a pstack item that the astack plugin holds", () => {
		const root = marketplace({
			astack: {
				"skills/arena/SKILL.md": upstreamSkill(
					"arena",
					"pstack",
					"Ask with `AskQuestion` here.",
				),
			},
		});
		const report = validateFixture(root, {
			cursor: "skills/arena/SKILL.md:AskQuestion:the seat names the tool\n",
		});
		expect(reportBlock(report.text, "residual Cursor-isms")).toEqual([
			"PASS residual Cursor-isms",
			"  astack: 0 unallowed in 0 files, 1 allowed",
		]);
		expect(report.errors).toBe(0);
	});

	test("builtFlowSkills names the flow items of each plugin, and fails when it finds 0", () => {
		const root = marketplace({
			astack: {
				"skills/grilling/SKILL.md": upstreamSkill(
					"grilling",
					"mattpocock-skills",
					"",
				),
				"skills/plan/SKILL.md": upstreamSkill(
					"plan",
					"mattpocock-skills pstack",
					"",
				),
				"skills/notes/SKILL.md": skill("notes", ""),
			},
			[F]: {
				"skills/tdd/SKILL.md": upstreamSkill("tdd", "mattpocock-skills", ""),
			},
		});
		expect(builtFlowSkills(root)).toEqual(ok(["grilling", "tdd"]));
		const none = marketplace({
			astack: { "skills/notes/SKILL.md": skill("notes", "") },
		});
		expect(builtFlowSkills(none)).toEqual(
			err(`no skill in ${none} has the origin mattpocock-skills`),
		);
		const unknown = marketplace({
			astack: {
				"skills/grilling/SKILL.md": upstreamSkill("grilling", "nobody", ""),
			},
		});
		expect(builtFlowSkills(unknown)).toEqual(
			err(
				`astack/skills/grilling/SKILL.md: metadata.origin names "nobody", which is not one of pstack, mattpocock-skills, cursor-team-kit`,
			),
		);
	});
});

describe("relative links", () => {
	test("only paths count as link targets", () => {
		expect(relativeLinkTarget("./01-setup.md#install")).toBe("./01-setup.md");
		expect(relativeLinkTarget("../skills/how/SKILL.md")).toBe(
			"../skills/how/SKILL.md",
		);
		expect(relativeLinkTarget("https://example.invalid/x.md")).toBeUndefined();
		expect(relativeLinkTarget("#anchor")).toBeUndefined();
		expect(relativeLinkTarget("url")).toBeUndefined();
		expect(relativeLinkTarget("<path>/SKILL.md")).toBeUndefined();
	});

	test("missing targets and links that leave the plugin are errors", () => {
		const pstack = plugin(P, {
			"guide/README.md": "x",
			"guide/01-setup.md":
				"[ok](./README.md) [gone](../skills/make-bot-ui/SKILL.md) [out](../../README.md)\n",
		});
		expect(
			checkLinks([pstack]).findings.map((finding) => finding.message),
		).toEqual([
			"link ../skills/make-bot-ui/SKILL.md has no target",
			`link ../../README.md points outside the ${P} plugin`,
		]);
	});
});

describe("load gate", () => {
	test("skips with no key, so it never runs against the owner's config", () => {
		const saved = {
			key: process.env.ANTHROPIC_API_KEY,
			token: process.env.CLAUDE_CODE_OAUTH_TOKEN,
		};
		delete process.env.ANTHROPIC_API_KEY;
		delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
		try {
			const result = checkLoadGate([]);
			expect(result.skipped).toBe(true);
			expect(result.findings).toEqual([]);
		} finally {
			if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
			if (saved.token !== undefined)
				process.env.CLAUDE_CODE_OAUTH_TOKEN = saved.token;
		}
	});

	test("fails on warnings and errors that name a checked plugin, and on skill counts", () => {
		const pstack = plugin(P, {
			"skills/how/SKILL.md": skill("how", ""),
			"agents/poteto-agent.md":
				"---\nname: poteto-agent\ndescription: d\n---\n",
		});
		const log = [
			`2026-10-14T14:18:13.311Z [WARN] Plugin agent file ${pstack.root}/agents/poteto-agent.md has a frontmatter key Claude Code does not recognize or apply: "is_background"`,
			"2026-10-14T14:18:13.347Z [ERROR] NON-FATAL: Lock acquisition failed for /x (expected in multi-process scenarios)",
			`2026-10-14T14:18:13.311Z [DEBUG] Loaded 1 agents from plugin ${P} default directory`,
			`2026-10-14T14:18:13.315Z [DEBUG] Loaded 0 skills from plugin ${P} default directory`,
			`2026-10-14T14:18:13.400Z [ERROR] Failed to load skill ${P}:how`,
		].join("\n");
		const { findings, summary } = loadGateFindings(log, [pstack]);
		expect(findings.map((finding) => finding.message)).toEqual([
			expect.stringContaining('"is_background"'),
			expect.stringContaining(`Failed to load skill ${P}:how`),
			`${P}: loaded 0 skills, expected 1`,
		]);
		expect(summary).toContain(`${P}: loaded 1 agents, expected 1`);
	});
});
