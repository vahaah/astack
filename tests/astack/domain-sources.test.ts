import { afterAll, describe, expect, test } from "bun:test";
import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ModuleSource,
	moduleSources,
	type SourceAt,
} from "../../src/astack/domain/sources.ts";
import { git, scratchDir, writeFiles } from "./change-proof-fixture.ts";

const root = scratchDir("astack-sources-");
const broken = scratchDir("astack-sources-break-");
afterAll(() => {
	rmSync(root, { recursive: true, force: true });
	rmSync(broken, { recursive: true, force: true });
});

git(root, "init", "-q");
writeFiles(root, {
	"src/a.ts": "export const a = 1;\n",
	"src/ui/b.tsx": "export const b = <i />;\n",
	"src/c.js": "export const c = 3;\n",
	"tools.ts": "export const t = 4;\n",
});
symlinkSync("a.ts", join(root, "src/link.ts"));
git(root, "add", "-A");
git(root, "commit", "-q", "-m", "first");
const first = git(root, "rev-parse", "HEAD").trim();
writeFileSync(join(root, "src/a.ts"), "export const a = 2;\n");

function read(at: SourceAt): readonly ModuleSource[] | string {
	const found = moduleSources({ root, codeRoots: ["src/**"], at });
	return found.ok ? found.value : found.error.message;
}

const LINK: ModuleSource = {
	kind: "report",
	path: "src/link.ts",
	message: "the module is a symlink, so the check reads no class of it",
};

describe("moduleSources", () => {
	test("[control:effects-sources] it reads each tracked .ts and .tsx file under the code roots in the tree and at a commit, and a symlink gives a report", () => {
		expect({
			tree: read({ kind: "tree" }),
			commit: read({ kind: "commit", commit: first }),
		}).toEqual({
			tree: [
				{ kind: "text", path: "src/a.ts", text: "export const a = 2;\n" },
				LINK,
				{
					kind: "text",
					path: "src/ui/b.tsx",
					text: "export const b = <i />;\n",
				},
			],
			commit: [
				{ kind: "text", path: "src/a.ts", text: "export const a = 1;\n" },
				LINK,
				{
					kind: "text",
					path: "src/ui/b.tsx",
					text: "export const b = <i />;\n",
				},
			],
		});
	});

	test("a code root with no slash names only a file at the repo root", () => {
		const found = moduleSources({
			root,
			codeRoots: ["*.tsx", "*.ts"],
			at: { kind: "tree" },
		});
		expect(found.ok ? found.value.map((one) => one.path) : found).toEqual([
			"tools.ts",
		]);
	});

	test("a tracked path with a line break gives a report, and each other module at a commit keeps its own text", () => {
		const forged = "a\nHEAD:b.ts";
		git(broken, "init", "-q");
		writeFiles(broken, {
			"b.ts": "export const b = 1;\n",
			[forged]: "export const a = 1;\n",
		});
		git(broken, "add", "-A");
		git(broken, "commit", "-q", "-m", "first");
		const commit = git(broken, "rev-parse", "HEAD").trim();
		writeFileSync(join(broken, "b.ts"), "export const b = 2;\n");
		git(broken, "commit", "-q", "-am", "second");
		const readAt = (at: SourceAt) => {
			const found = moduleSources({ root: broken, codeRoots: ["*.ts"], at });
			return found.ok ? found.value : found.error.message;
		};
		const report: ModuleSource = {
			kind: "report",
			path: JSON.stringify(forged),
			message: "the path holds a line break, so the check reads no class of it",
		};
		expect({
			tree: readAt({ kind: "tree" }),
			commit: readAt({ kind: "commit", commit }),
		}).toEqual({
			tree: [
				report,
				{ kind: "text", path: "b.ts", text: "export const b = 2;\n" },
			],
			commit: [
				report,
				{ kind: "text", path: "b.ts", text: "export const b = 1;\n" },
			],
		});
	});

	test("a ref that is no commit gives a source stop", () => {
		expect([
			read({ kind: "commit", commit: "no-such-ref" }),
			read({ kind: "commit", commit: "--output=x" }),
		]).toEqual([
			"no-such-ref is not a commit of the repo",
			"--output=x is not a commit of the repo",
		]);
	});
});
