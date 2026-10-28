export const ASTACK_RULES = [
	{ name: "astack", repo: false, fragment: true },
	{ name: "coding", repo: true, fragment: true },
	{ name: "comments", repo: true, fragment: false },
	{ name: "typescript", repo: true, fragment: true },
	{ name: "postgres", repo: true, fragment: true },
] as const;

export type RuleName = (typeof ASTACK_RULES)[number]["name"];

export function ruleLinkName(name: RuleName): string {
	return name === "astack" ? "astack.md" : `astack-${name}.md`;
}
