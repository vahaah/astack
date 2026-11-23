import {
	type ChangeSources,
	currentBranch,
	type GitFileChange,
	type GitResult,
	gitChanges,
	gitText,
	originSlug,
	repoRoot,
	runGit,
} from "./git.ts";
import {
	canonicalRelative,
	type FolderId,
	folderId,
	isExecutable,
	isScratchPath,
	listDir,
	readOptional,
	realPath,
	workTreeRoot,
} from "./paths.ts";
import { readProfileJson } from "./profile.ts";
import { kindOf, type PathKind } from "./repo-facts.ts";

export {
	currentBranch as gitBranch,
	gitChanges,
	gitText,
	originSlug as gitOrigin,
	repoRoot as gitRoot,
	runGit as gitRun,
} from "./git.ts";
export {
	canonicalRelative as relativePath,
	folderId,
	isExecutable,
	isScratchPath as isScratch,
	listDir,
	readOptional as readText,
	realPath,
	workTreeRoot as workTree,
} from "./paths.ts";
export { readProfileJson as readProfile } from "./profile.ts";
export { kindOf as pathKind } from "./repo-facts.ts";

export type FilePorts = {
	readonly readText: (path: string) => string | undefined;
	readonly pathKind: (path: string) => PathKind;
	readonly realPath: (path: string) => string | undefined;
	readonly relativePath: (projectDir: string, absolute: string) => string;
	readonly isScratch: (projectDir: string, path: string) => boolean;
	readonly workTree: (start: string) => string | undefined;
	readonly listDir: (path: string) => readonly string[] | undefined;
	readonly isExecutable: (path: string) => boolean;
	readonly folderId: (path: string) => FolderId | undefined;
};

export type GitPorts = {
	readonly gitRun: (
		cwd: string,
		args: readonly string[],
		input?: string,
	) => GitResult;
	readonly gitText: (
		cwd: string,
		args: readonly string[],
	) => string | undefined;
	readonly gitRoot: (cwd: string) => string | undefined;
	readonly gitBranch: (cwd: string) => string | undefined;
	readonly gitOrigin: (root: string) => string | undefined;
	readonly gitChanges: (
		root: string,
		sources: ChangeSources,
	) => readonly GitFileChange[] | undefined;
};

export type ProfilePorts = {
	readonly readProfile: (dir: string) => unknown;
};

export type Ports = {
	readonly files: FilePorts;
	readonly git: GitPorts;
	readonly profile: ProfilePorts;
};

const NODE_PORTS: Ports = {
	files: {
		readText: readOptional,
		pathKind: kindOf,
		realPath,
		relativePath: canonicalRelative,
		isScratch: isScratchPath,
		workTree: workTreeRoot,
		listDir,
		isExecutable,
		folderId,
	},
	git: {
		gitRun: runGit,
		gitText,
		gitRoot: repoRoot,
		gitBranch: currentBranch,
		gitOrigin: originSlug,
		gitChanges,
	},
	profile: { readProfile: readProfileJson },
};

type Held<T> = { readonly value: T };

function remembered<T>(
	cache: Map<string, Held<T>>,
	key: string,
	read: () => T,
): T {
	const held = cache.get(key);
	if (held !== undefined) return held.value;
	const value = read();
	cache.set(key, { value });
	return value;
}

export function portsFrom(raw: Ports): Ports {
	const folder = (dir: string) => raw.files.realPath(dir) ?? dir;
	const profiles = new Map<string, Held<unknown>>();
	const roots = new Map<string, Held<string | undefined>>();
	return {
		files: raw.files,
		git: {
			...raw.git,
			gitRoot: (cwd) =>
				remembered(roots, folder(cwd), () => raw.git.gitRoot(cwd)),
		},
		profile: {
			readProfile: (dir) =>
				remembered(profiles, folder(dir), () => raw.profile.readProfile(dir)),
		},
	};
}

export function processPorts(): Ports {
	return portsFrom(NODE_PORTS);
}
