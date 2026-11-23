import { dirname } from "node:path";
import { githubSlug } from "../../src/astack/git.ts";
import { projectRelative } from "../../src/astack/paths.ts";
import type { Ports } from "../../src/astack/ports.ts";

export type FakeRepo = {
	readonly files?: Readonly<Record<string, string>>;
	readonly profiles?: Readonly<Record<string, unknown>>;
	readonly git?: Readonly<Record<string, string>>;
};

export function gitKey(cwd: string, args: readonly string[]): string {
	return `${cwd} ${args.join(" ")}`;
}

export function fakePorts(repo: FakeRepo = {}): Ports {
	const files = repo.files ?? {};
	const folders = new Set(Object.keys(files).map((path) => dirname(path)));
	const known = (path: string) => path in files || folders.has(path);
	const gitText = (cwd: string, args: readonly string[]) =>
		repo.git?.[gitKey(cwd, args)]?.trim();
	return {
		files: {
			readText: (path) => files[path],
			pathKind: (path) =>
				path in files ? "file" : folders.has(path) ? "directory" : "missing",
			realPath: (path) => (known(path) ? path : undefined),
			relativePath: projectRelative,
			isScratch: () => false,
			workTree: () => undefined,
			listDir: (path) =>
				folders.has(path)
					? Object.keys(files)
							.filter((file) => dirname(file) === path)
							.map((file) => file.slice(path.length + 1))
					: undefined,
			isExecutable: () => false,
			folderId: () => undefined,
		},
		git: {
			gitRun: (cwd, args) => {
				const stdout = repo.git?.[gitKey(cwd, args)];
				return stdout === undefined
					? { ok: false, stdout: Buffer.alloc(0) }
					: { ok: true, stdout: Buffer.from(stdout) };
			},
			gitText,
			gitRoot: (cwd) => gitText(cwd, ["rev-parse", "--show-toplevel"]),
			gitBranch: (cwd) => {
				const branch = gitText(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
				return branch === "HEAD" || branch === "" ? undefined : branch;
			},
			gitOrigin: (root) => {
				const url = gitText(root, ["remote", "get-url", "origin"]);
				return url === undefined ? undefined : githubSlug(url);
			},
			gitChanges: () => undefined,
		},
		profile: { readProfile: (dir) => repo.profiles?.[dir] },
	};
}
