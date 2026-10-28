export type MarkdownFile = { readonly path: string; readonly text: string };

const escaped = (path: string): string =>
	path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function lineCitationGrep(managed: readonly string[]): string {
	return `(${managed.map(escaped).join("|")}):[0-9]`;
}

export function managedLineCitations(
	files: readonly MarkdownFile[],
	managed: readonly string[],
): string[] {
	if (managed.length === 0) return [];
	const cite = new RegExp(
		String.raw`(?<![\w./-])(?:${managed.map(escaped).join("|")}):\d+`,
		"g",
	);
	return files
		.filter((file) => !managed.includes(file.path))
		.flatMap(({ path, text }) =>
			text
				.split("\n")
				.flatMap((line, index) =>
					[...line.matchAll(cite)].map(
						([cited]) =>
							`${path}:${index + 1} cites ${cited}, a line of a file that apply writes. Each apply update can move that line, so the citation goes stale. Cite the file with no line number, and quote its words or name its heading.`,
					),
				),
		);
}
