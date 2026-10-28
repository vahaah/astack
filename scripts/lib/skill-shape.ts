type Element = {
	readonly tag: string;
	readonly children: readonly Node[];
	readonly target: string | undefined;
};

type Node = string | Element;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeOf(value: unknown): Node {
	if (typeof value === "string") return value;
	if (
		!isRecord(value) ||
		!isRecord(value.props) ||
		!(
			typeof value.type === "string" ||
			value.type === Symbol.for("react.fragment")
		)
	)
		throw new TypeError("The Markdown parser returned an unsupported node.");
	const children = value.props.children ?? [];
	if (!Array.isArray(children))
		throw new TypeError("The Markdown parser returned unsupported children.");
	const target =
		value.type === "a"
			? value.props.href
			: value.type === "img"
				? value.props.src
				: undefined;
	return {
		tag: typeof value.type === "string" ? value.type : "document",
		children: children.map(nodeOf),
		target: typeof target === "string" ? target : undefined,
	};
}

function elements(node: Node): readonly Element[] {
	return typeof node === "string"
		? []
		: [node, ...node.children.flatMap(elements)];
}

function textOf(node: Node): string {
	return typeof node === "string" ? node : node.children.map(textOf).join("");
}

function htmlText(node: Element): string {
	return textOf(node)
		.replace(/<!--[\s\S]*?(?:-->|$)/g, "")
		.replace(/<[^>]*>/g, "")
		.trim();
}

function visible(node: Node): boolean {
	if (typeof node === "string") return node.trim() !== "";
	return node.tag !== "html" || htmlText(node) !== "";
}

function substantive(node: Node): boolean {
	if (typeof node === "string") return node.trim() !== "";
	if (/^h[1-6]$/.test(node.tag) || node.tag === "hr") return false;
	if (node.tag === "html") return htmlText(node) !== "";
	if (node.tag === "pre" || node.tag === "code")
		return textOf(node).trim() !== "";
	if (node.target !== undefined && node.target.trim() !== "") return true;
	return node.children.some(substantive);
}

function titleContent(node: Node): boolean {
	if (typeof node === "string") return node.trim() !== "";
	if (node.tag === "html") return htmlText(node) !== "";
	if (
		node.tag === "img" &&
		node.target !== undefined &&
		node.target.trim() !== ""
	)
		return true;
	return node.children.some(titleContent);
}

export function skillBodyIssues(body: string): readonly string[] {
	const document = nodeOf(Bun.markdown.react(body));
	const blocks =
		typeof document !== "string" && document.tag === "document"
			? document.children
			: [document];
	const titles = elements(document).filter((node) => node.tag === "h1");
	const issues: string[] = [];
	const title = titles[0];
	if (
		titles.length !== 1 ||
		title === undefined ||
		!title.children.some(titleContent)
	)
		issues.push("Body must contain exactly one nonempty H1 title.");
	else if (blocks.find(visible) !== title)
		issues.push("The H1 title must be the first visible block.");
	if (!blocks.some(substantive))
		issues.push("Body must contain substantive content after the title.");
	return issues;
}
