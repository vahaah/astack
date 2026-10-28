const BLOCK = /<!-- astack \S+ -->[\s\S]*?<!-- \/astack \S+ -->\n?/;

export function withFragment(existing: string, fragment: string): string {
	const block = fragment.endsWith("\n") ? fragment : `${fragment}\n`;
	if (BLOCK.test(existing)) return existing.replace(BLOCK, block);
	if (existing.trim() === "") return block;
	return `${existing.trimEnd()}\n\n${block}`;
}

export function cursorInstall(root: string): string {
	return [
		"mkdir -p ~/.cursor/plugins/local",
		"rm -rf ~/.cursor/plugins/local/astack",
		`cp -R "${root}/cursor/astack" ~/.cursor/plugins/local/astack`,
		"",
	].join("\n");
}
