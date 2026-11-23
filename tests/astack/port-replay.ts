import type {
	FilePorts,
	GitPorts,
	Ports,
	ProfilePorts,
} from "../../src/astack/ports.ts";

type Table<F extends (...args: never[]) => unknown> = Map<
	string,
	{ readonly value: ReturnType<F> }
>;

type Tables<T> = {
	readonly [K in keyof T]: T[K] extends (...args: never[]) => unknown
		? Table<T[K]>
		: never;
};

export type Answers = {
	readonly files: Tables<FilePorts>;
	readonly git: Tables<GitPorts>;
	readonly profile: Tables<ProfilePorts>;
};

export function noAnswers(): Answers {
	return {
		files: {
			readText: new Map(),
			pathKind: new Map(),
			realPath: new Map(),
			relativePath: new Map(),
			isScratch: new Map(),
			workTree: new Map(),
			listDir: new Map(),
			isExecutable: new Map(),
			folderId: new Map(),
		},
		git: {
			gitRun: new Map(),
			gitText: new Map(),
			gitRoot: new Map(),
			gitBranch: new Map(),
			gitOrigin: new Map(),
			gitChanges: new Map(),
		},
		profile: { readProfile: new Map() },
	};
}

export function answerCount(answers: Answers): number {
	return [
		...Object.values(answers.files),
		...Object.values(answers.git),
		...Object.values(answers.profile),
	].reduce((sum, table) => sum + table.size, 0);
}

function record<A extends readonly unknown[], R>(
	table: Map<string, { readonly value: R }>,
	run: (...args: A) => R,
): (...args: A) => R {
	return (...args) => {
		const value = run(...args);
		table.set(JSON.stringify(args), { value });
		return value;
	};
}

export function recording(raw: Ports, answers: Answers): Ports {
	const { files, git, profile } = answers;
	return {
		files: {
			readText: record(files.readText, raw.files.readText),
			pathKind: record(files.pathKind, raw.files.pathKind),
			realPath: record(files.realPath, raw.files.realPath),
			relativePath: record(files.relativePath, raw.files.relativePath),
			isScratch: record(files.isScratch, raw.files.isScratch),
			workTree: record(files.workTree, raw.files.workTree),
			listDir: record(files.listDir, raw.files.listDir),
			isExecutable: record(files.isExecutable, raw.files.isExecutable),
			folderId: record(files.folderId, raw.files.folderId),
		},
		git: {
			gitRun: record(git.gitRun, raw.git.gitRun),
			gitText: record(git.gitText, raw.git.gitText),
			gitRoot: record(git.gitRoot, raw.git.gitRoot),
			gitBranch: record(git.gitBranch, raw.git.gitBranch),
			gitOrigin: record(git.gitOrigin, raw.git.gitOrigin),
			gitChanges: record(git.gitChanges, raw.git.gitChanges),
		},
		profile: {
			readProfile: record(profile.readProfile, raw.profile.readProfile),
		},
	};
}

function play<A extends readonly unknown[], R>(
	op: string,
	table: Map<string, { readonly value: R }>,
	misses: string[],
): (...args: A) => R {
	return (...args) => {
		const key = JSON.stringify(args);
		const held = table.get(key);
		if (held !== undefined) return held.value;
		misses.push(`${op} ${key}`);
		throw new Error(`no recorded answer for ${op} ${key}`);
	};
}

export function replaying(answers: Answers, misses: string[]): Ports {
	const { files, git, profile } = answers;
	return {
		files: {
			readText: play("readText", files.readText, misses),
			pathKind: play("pathKind", files.pathKind, misses),
			realPath: play("realPath", files.realPath, misses),
			relativePath: play("relativePath", files.relativePath, misses),
			isScratch: play("isScratch", files.isScratch, misses),
			workTree: play("workTree", files.workTree, misses),
			listDir: play("listDir", files.listDir, misses),
			isExecutable: play("isExecutable", files.isExecutable, misses),
			folderId: play("folderId", files.folderId, misses),
		},
		git: {
			gitRun: play("gitRun", git.gitRun, misses),
			gitText: play("gitText", git.gitText, misses),
			gitRoot: play("gitRoot", git.gitRoot, misses),
			gitBranch: play("gitBranch", git.gitBranch, misses),
			gitOrigin: play("gitOrigin", git.gitOrigin, misses),
			gitChanges: play("gitChanges", git.gitChanges, misses),
		},
		profile: {
			readProfile: play("readProfile", profile.readProfile, misses),
		},
	};
}
