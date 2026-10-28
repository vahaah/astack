export const TARGETS = [
	"claude-code",
	"cursor",
	"codex",
	"grok-bot",
	"agentskills",
] as const;
export type Target = (typeof TARGETS)[number];

export const ITEMS = [
	"astack-skills",
	"agents",
	"rule-card",
	"hooks",
	"cli",
	"manifest",
] as const;
export type Item = (typeof ITEMS)[number];

export type Decision =
	| { readonly kind: "emit" }
	| { readonly kind: "omit"; readonly reason: string }
	| { readonly kind: "fallback"; readonly reason: string };

const EMIT: Decision = { kind: "emit" };

function omit(reason: string): Decision {
	return { kind: "omit", reason };
}

function fallback(reason: string): Decision {
	return { kind: "fallback", reason };
}

function claudeCode(item: Item): Decision {
	switch (item) {
		case "astack-skills":
		case "agents":
		case "hooks":
		case "cli":
		case "manifest":
		case "rule-card":
			return EMIT;
	}
}

function cursor(item: Item): Decision {
	switch (item) {
		case "astack-skills":
		case "agents":
		case "rule-card":
		case "hooks":
		case "cli":
		case "manifest":
			return EMIT;
	}
}

function codex(item: Item): Decision {
	switch (item) {
		case "astack-skills":
			return fallback(
				"Codex reads the skills of the Claude build through its marketplace",
			);
		case "hooks":
			return fallback(
				"Codex runs the hooks.json of the Claude build after the owner trusts it",
			);
		case "cli":
			return fallback("Codex runs bin/astack of the Claude build");
		case "manifest":
			return fallback("Codex reads .claude-plugin/marketplace.json");
		case "agents":
			return omit("a Codex plugin cannot ship agents");
		case "rule-card":
			return EMIT;
	}
}

function grokBot(item: Item): Decision {
	switch (item) {
		case "astack-skills":
			return EMIT;
		case "rule-card":
			return fallback("the astack-rules skill carries the rule files");
		case "agents":
			return omit("Grok Bot runs no plugin agents");
		case "hooks":
			return omit("Grok Bot has no hooks");
		case "cli":
			return omit("the bot runs the published CLI package");
		case "manifest":
			return omit("the bot saves each skill as a private skill");
	}
}

function agentSkills(item: Item): Decision {
	switch (item) {
		case "astack-skills":
		case "rule-card":
			return EMIT;
		case "agents":
			return omit("the Agent Skills format has no agents");
		case "hooks":
			return omit("the Agent Skills format has no hooks");
		case "cli":
			return omit("the client runs the published CLI package");
		case "manifest":
			return omit("npx skills add reads the skills folder");
	}
}

export function capability(item: Item, target: Target): Decision {
	switch (target) {
		case "claude-code":
			return claudeCode(item);
		case "cursor":
			return cursor(item);
		case "codex":
			return codex(item);
		case "grok-bot":
			return grokBot(item);
		case "agentskills":
			return agentSkills(item);
	}
}

export function emits(item: Item, target: Target): boolean {
	return capability(item, target).kind !== "omit";
}

export function capabilityReport(): string[] {
	return TARGETS.flatMap((target) =>
		ITEMS.flatMap((item) => {
			const decision = capability(item, target);
			return decision.kind === "emit"
				? []
				: [`${target} ${item}: ${decision.kind}, ${decision.reason}`];
		}),
	);
}
