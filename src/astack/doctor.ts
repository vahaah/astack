import { CODEX_HOOK_EVENTS, CODEX_HOOK_HASHES } from "./codex-trust.ts";
import { MARKETPLACE_NAME, PLUGIN_IDS } from "./marketplace.ts";
import { ASTACK_RULES, ruleLinkName } from "./rules.ts";

export const ASTACK_PLUGINS: readonly string[] = PLUGIN_IDS.map(pluginName);

export const LEGACY_PLUGINS = ["craft"];

export const OUTPUT_STYLE_PLUGINS = [
	"explanatory-output-style",
	"learning-output-style",
];

export { CODEX_HOOK_EVENTS };

export type Install = {
	readonly plugin: string;
	readonly marketplace: string;
	readonly path: string;
	readonly skills: readonly string[];
	readonly stopHook: boolean;
};

export type SkillFolder = {
	readonly path: string;
	readonly names: readonly string[];
};

export type ClaudeProfile = {
	readonly dir: string;
	readonly installs: readonly Install[];
	readonly enabled: readonly string[];
	readonly ruleCard: number | undefined;
	readonly ruleNames: readonly string[];
	readonly readableRules: readonly string[];
};

export type CodexState = {
	readonly home: string;
	readonly enabled: readonly string[];
	readonly trusted: Readonly<Record<string, string>>;
	readonly fragment: string | undefined;
};

export type CursorState = {
	readonly local: string | undefined;
	readonly imported: readonly string[];
};

export type ProfileState =
	| { readonly kind: "absent"; readonly repo: string }
	| { readonly kind: "invalid"; readonly repo: string }
	| {
			readonly kind: "present";
			readonly repo: string;
			readonly keys: readonly string[];
	  };

export type Snapshot = {
	readonly runtime: {
		readonly current: string;
		readonly found: string | undefined;
		readonly old?: string | undefined;
	};
	readonly claude: readonly ClaudeProfile[];
	readonly codex: CodexState | undefined;
	readonly cursor: CursorState | undefined;
	readonly agentsSkills: readonly string[];
	readonly claudeSkills?: readonly SkillFolder[];
	readonly profile: ProfileState;
};

export type Level = "ok" | "note" | "warn" | "fail";

export type Finding = {
	readonly area: string;
	readonly level: Level;
	readonly text: string;
};

function finding(area: string, level: Level, text: string): Finding {
	return { area, level, text };
}

function pluginName(id: string): string {
	return id.split("@")[0] ?? id;
}

function isOutputStyle(id: string): boolean {
	return OUTPUT_STYLE_PLUGINS.includes(pluginName(id));
}

function isAstackPlugin(name: string): boolean {
	return ASTACK_PLUGINS.some((plugin) => plugin === name);
}

function migrationWarnings(area: string, ids: readonly string[]): Finding[] {
	return [...new Set(ids)].flatMap((id) => {
		if (PLUGIN_IDS.includes(id)) return [];
		if (
			id === `pstack@${MARKETPLACE_NAME}` ||
			id === `flow@${MARKETPLACE_NAME}`
		)
			return [
				finding(
					area,
					"warn",
					`${id} is retired. The astack plugin holds its skills. Remove the old plugin.`,
				),
			];
		return pluginName(id) === "pstack"
			? [
					finding(
						area,
						"warn",
						`${id} is a separate pstack install. The astack plugin holds its skills. Keep one plugin for these skills.`,
					),
				]
			: [];
	});
}

function runtimeFindings(snapshot: Snapshot): Finding[] {
	return [
		finding("runtime", "ok", `this run uses ${snapshot.runtime.current}`),
		snapshot.runtime.found === undefined
			? finding(
					"runtime",
					"fail",
					snapshot.runtime.old === undefined
						? "bin/astack finds no node or bun with the PATH of a GUI app. Set ASTACK_RUNTIME, or run astack doctor --save-runtime."
						: `bin/astack finds only ${snapshot.runtime.old}, which is older than node 22, so the hooks do not run. Install node 22 or later, or bun, and run astack doctor --save-runtime with it.`,
				)
			: finding(
					"runtime",
					"ok",
					`bin/astack finds ${snapshot.runtime.found} with the PATH of a GUI app`,
				),
	];
}

function distinctCopies(installs: readonly Install[]): Install[] {
	return installs.filter(
		(install, index) =>
			installs.findIndex(
				(other) =>
					other.marketplace === install.marketplace &&
					other.path === install.path,
			) === index,
	);
}

function claudeFindings(profile: ClaudeProfile): Finding[] {
	const area = `claude-code ${profile.dir}`;
	const ours = profile.installs.filter((install) =>
		isAstackPlugin(install.plugin),
	);
	const findings = migrationWarnings(area, [
		...profile.installs.map(
			(install) => `${install.plugin}@${install.marketplace}`,
		),
		...profile.enabled,
	]);
	if (profile.ruleNames.includes("pstack-models.md"))
		findings.push(
			finding(
				area,
				"warn",
				"rules/pstack-models.md uses the old name. Use astack:setup-models to replace it with rules/astack-models.md.",
			),
		);
	for (const plugin of ASTACK_PLUGINS) {
		const copies = distinctCopies(
			ours.filter((install) => install.plugin === plugin),
		);
		if (copies.length > 1)
			findings.push(
				finding(
					area,
					"fail",
					`${plugin} is installed ${copies.length} times: ${copies.map((copy) => `${copy.plugin}@${copy.marketplace}`).join(", ")}. Keep one copy.`,
				),
			);
		else if (copies.length === 1)
			findings.push(
				finding(area, "ok", `${plugin}@${copies[0]?.marketplace} is installed`),
			);
	}
	for (const id of profile.enabled.filter(isOutputStyle))
		findings.push(
			finding(
				area,
				"fail",
				`${id} is on. It conflicts with the STE reply rule, so turn it off.`,
			),
		);
	for (const legacy of profile.installs.filter((install) =>
		LEGACY_PLUGINS.includes(install.plugin),
	))
		findings.push(
			finding(
				area,
				ours.some((install) => install.plugin === "astack") ? "fail" : "note",
				`${legacy.plugin}@${legacy.marketplace} is the old name of astack. Uninstall it when astack is installed, or each check runs twice.`,
			),
		);
	const stops = [
		...new Set(
			profile.installs
				.filter(
					(install) => install.stopHook && !isAstackPlugin(install.plugin),
				)
				.map((install) => install.plugin),
		),
	];
	if (stops.length > 0)
		findings.push(
			finding(
				area,
				"note",
				[
					`other plugins with a Stop hook: ${stops.join(", ")}.`,
					...new Set(
						stops.flatMap((plugin) => STOP_HOOK_EFFECTS[plugin] ?? []),
					),
				].join(" "),
			),
		);
	const astack = ours.some((install) => install.plugin === "astack");
	findings.push(
		profile.ruleCard !== undefined
			? finding(
					area,
					"ok",
					`this profile links rules/astack.md, ${profile.ruleCard} bytes`,
				)
			: astack
				? finding(
						area,
						"fail",
						"this profile has no rules/astack.md link. Without the rule card, most replies fail STE and each one costs a rewrite. Link the rule card as the install steps say.",
					)
				: finding(area, "note", "this profile has no rules/astack.md link"),
	);
	if (astack)
		for (const rule of ASTACK_RULES.filter(({ name }) => name !== "astack")) {
			const name = ruleLinkName(rule.name);
			findings.push(
				profile.readableRules.includes(name)
					? finding(area, "ok", `rules/${name} is readable`)
					: finding(
							area,
							"fail",
							`rules/${name} is missing or unreadable. Add the rule link from the install steps.`,
						),
			);
		}
	const legacy = profile.installs.some((install) =>
		LEGACY_PLUGINS.includes(install.plugin),
	);
	const rung = astack || legacy ? 1 : 5;
	findings.push(
		finding(
			area,
			"note",
			`lowest enforcement rung: ${rung}${astack ? "" : legacy ? ", from the legacy craft hooks" : ", text only"}`,
		),
	);
	return findings;
}

const STOP_HOOK_EFFECTS: Readonly<Record<string, string>> = {
	warp: "Warp notifies on the first reply, before an STE rewrite exists.",
	"claude-code-warp":
		"Warp notifies on the first reply, before an STE rewrite exists.",
	codex:
		"The Codex review gate can run on both the first reply and the rewrite.",
};

export function codexTrustKey(id: string, event: string): string {
	return `${id}:hooks/hooks.json:${event}:0:0`;
}

function codexFindings(codex: CodexState): Finding[] {
	const area = `codex ${codex.home}`;
	const findings = migrationWarnings(area, codex.enabled);
	const astack = codex.enabled.filter((id) => pluginName(id) === "astack");
	for (const id of astack) {
		const untrusted = CODEX_HOOK_EVENTS.filter(
			(event) => codex.trusted[codexTrustKey(id, event)] === undefined,
		);
		const modified = CODEX_HOOK_EVENTS.filter((event) => {
			const hash = codex.trusted[codexTrustKey(id, event)];
			return hash !== undefined && hash !== CODEX_HOOK_HASHES[event];
		});
		if (untrusted.length > 0)
			findings.push(
				finding(
					area,
					"fail",
					`${id} is on, but Codex does not trust its hooks for ${untrusted.join(", ")}. Open /hooks in Codex and trust them.`,
				),
			);
		if (modified.length > 0)
			findings.push(
				finding(
					area,
					"fail",
					`${id} is on, but the trusted hash of ${modified.join(", ")} is not the hash of this release, so Codex marks the hooks modified and skips them. Open /hooks in Codex and trust them again.`,
				),
			);
		if (untrusted.length === 0 && modified.length === 0)
			findings.push(
				finding(
					area,
					"ok",
					`${id} is on, and its 4 hooks are trusted with the hashes of this release`,
				),
			);
	}
	const rung =
		astack.length > 0 && findings.every((item) => item.level !== "fail")
			? 1
			: 5;
	if (astack.length === 0)
		findings.push(finding(area, "note", "astack is not on in Codex"));
	findings.push(
		finding(
			area,
			"note",
			`lowest enforcement rung: ${rung}${rung === 5 ? ", text only" : ""}`,
		),
	);
	for (const id of codex.enabled.filter(isOutputStyle))
		findings.push(
			finding(
				area,
				"fail",
				`${id} is on. Turn it off, because it conflicts with STE replies.`,
			),
		);
	findings.push(
		codex.fragment === undefined
			? finding(area, "note", "~/.codex/AGENTS.md holds no astack fragment")
			: finding(
					area,
					"ok",
					`~/.codex/AGENTS.md holds the astack ${codex.fragment} fragment`,
				),
	);
	return findings;
}

function cursorFindings(cursor: CursorState): Finding[] {
	const area = "cursor";
	const findings: Finding[] = [
		...migrationWarnings(area, cursor.imported),
		cursor.local === undefined
			? finding(
					area,
					"note",
					"no local astack plugin in ~/.cursor/plugins/local",
				)
			: finding(area, "ok", `local astack plugin ${cursor.local}`),
	];
	for (const id of cursor.imported.filter(isOutputStyle))
		findings.push(
			finding(
				area,
				"fail",
				`Cursor imported ${id}. Turn it off, because it conflicts with STE replies.`,
			),
		);
	findings.push(
		finding(
			area,
			"note",
			`lowest enforcement rung: ${cursor.local === undefined ? "5, text only" : "1"}`,
		),
	);
	const imported = cursor.imported.filter((id) =>
		isAstackPlugin(pluginName(id)),
	);
	if (imported.length > 0 && cursor.local !== undefined)
		findings.push(
			finding(
				area,
				"fail",
				`Cursor also imported ${imported.join(", ")} from a Claude marketplace, so each astack check runs twice.`,
			),
		);
	return findings;
}

export function flatNames(install: Install): string[] {
	return install.skills.map((skill) =>
		install.plugin === "astack" ? `astack-${skill}` : skill,
	);
}

function duplicateFindings(snapshot: Snapshot): Finding[] {
	const area = "skills";
	const owners = new Map<string, Set<string>>();
	for (const profile of snapshot.claude)
		for (const install of profile.installs.filter((each) =>
			isAstackPlugin(each.plugin),
		))
			for (const name of [...install.skills, ...flatNames(install)]) {
				const set = owners.get(name) ?? new Set<string>();
				set.add(install.plugin);
				owners.set(name, set);
			}
	const shared = snapshot.agentsSkills.filter((name) => owners.has(name));
	const folders = (snapshot.claudeSkills ?? []).flatMap((folder) => {
		const repeated = folder.names.filter(
			(name) => owners.has(name) && !shared.includes(name),
		);
		return repeated.length === 0
			? []
			: [
					finding(
						area,
						"fail",
						`${folder.path} repeats ${repeated.length} plugin skill(s): ${repeated.join(", ")}. Claude Code reads that folder, so each one shows twice. Remove them with: rm -r ${repeated.map((name) => `${folder.path}/${name}`).join(" ")}`,
					),
				];
	});
	if (shared.length === 0 && folders.length === 0)
		return [
			finding(
				area,
				"ok",
				"no user skill folder shares a name with an astack skill",
			),
		];
	return [
		...(shared.length === 0
			? []
			: [
					finding(
						area,
						"fail",
						`~/.agents/skills repeats ${shared.length} plugin skill(s): ${shared.join(", ")}. Claude Code reads that folder through the links in each skills folder of a profile, and Codex and Grok Build read it too, so each one shows twice. Remove them, and the links to them in each skills folder of a profile, with: rm -r ${shared.map((name) => `~/.agents/skills/${name}`).join(" ")}`,
					),
				]),
		...folders,
	];
}

function profileFindings(profile: ProfileState): Finding[] {
	const area = `profile ${profile.repo}`;
	switch (profile.kind) {
		case "absent":
			return [
				finding(
					area,
					"note",
					"no .astack/profile.json, so astack uses its defaults",
				),
			];
		case "invalid":
			return [
				finding(area, "fail", ".astack/profile.json is not a JSON object"),
			];
		case "present":
			return [
				finding(
					area,
					"ok",
					`.astack/profile.json sets ${profile.keys.length === 0 ? "nothing" : profile.keys.join(", ")}`,
				),
			];
	}
}

export function diagnose(snapshot: Snapshot): Finding[] {
	return [
		...runtimeFindings(snapshot),
		...snapshot.claude.flatMap(claudeFindings),
		...(snapshot.codex === undefined ? [] : codexFindings(snapshot.codex)),
		...(snapshot.cursor === undefined ? [] : cursorFindings(snapshot.cursor)),
		finding(
			"grok-bot",
			"note",
			"no local state to read. Lowest enforcement rung: 5, text only",
		),
		...duplicateFindings(snapshot),
		...profileFindings(snapshot.profile),
	];
}

export function render(findings: readonly Finding[]): string {
	return findings
		.map(
			(item) =>
				`${item.level.toUpperCase().padEnd(4)} ${item.area}: ${item.text}`,
		)
		.join("\n");
}

export function failed(findings: readonly Finding[]): boolean {
	return findings.some((item) => item.level === "fail");
}
