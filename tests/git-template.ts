import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export type Entry = string | { readonly link: string };

export type Files = Readonly<Record<string, Entry>>;

export type Commit = {
	readonly branch: string;
	readonly from?: string;
	readonly files: Files;
};

export type BranchSpec = {
	readonly commits: readonly Commit[];
	readonly checkout: string;
};

export type FixtureSpec = {
	readonly name: string;
	readonly repos: readonly string[];
	readonly build: (root: string) => void;
};

export type Template = {
	readonly root: string;
	readonly repos: readonly string[];
};

export type RepoCopy = {
	readonly root: string;
	readonly template: string;
	readonly repos: readonly string[];
};

const PAST_EPOCH_SECONDS = 1_700_000_000;

function git(cwd: string, args: readonly string[], input?: string): void {
	const result = spawnSync("git", args, {
		cwd,
		input,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		},
	});
	if (result.status !== 0)
		throw new Error(`git ${args.join(" ")} in ${cwd}: ${result.stderr}`);
}

function gitDir(repo: string): string {
	const dotGit = join(repo, ".git");
	return existsSync(dotGit) ? dotGit : repo;
}

function pointConfigs(
	root: string,
	repos: readonly string[],
	from: string,
	to: string,
): void {
	for (const repo of repos) {
		const config = join(gitDir(join(root, repo)), "config");
		writeFileSync(config, readFileSync(config, "utf8").replaceAll(from, to));
	}
}

export function buildTemplate(spec: FixtureSpec, parent: string): Template {
	const own = realpathSync(mkdtempSync(join(parent, `${spec.name}-`)));
	const build = join(own, "build");
	const root = join(own, "template");
	try {
		mkdirSync(build);
		spec.build(build);
		pointConfigs(build, spec.repos, build, root);
		renameSync(build, root);
	} catch (error) {
		rmSync(own, { recursive: true, force: true });
		throw error;
	}
	return { root, repos: spec.repos };
}

export function removeTemplate(template: Template): void {
	rmSync(dirname(template.root), { recursive: true, force: true });
}

export function copyTemplate(template: Template, root: string): RepoCopy {
	cpSync(template.root, root, { recursive: true, verbatimSymlinks: true });
	return { root, template: template.root, repos: template.repos };
}

export function rewriteConfig(copy: RepoCopy): RepoCopy {
	pointConfigs(copy.root, copy.repos, copy.template, copy.root);
	return copy;
}

export function refreshIndex(copy: RepoCopy): RepoCopy {
	for (const repo of copy.repos) {
		const dir = join(copy.root, repo);
		if (existsSync(join(gitDir(dir), "index")))
			git(dir, ["update-index", "--refresh"]);
	}
	return copy;
}

export function copyRepo(template: Template, root: string): RepoCopy {
	return refreshIndex(rewriteConfig(copyTemplate(template, root)));
}

const data = (text: string): string =>
	`data ${Buffer.byteLength(text)}\n${text}`;

function modify(path: string, entry: Entry): string {
	return typeof entry === "string"
		? `M 100644 inline ${path}\n${data(entry)}`
		: `M 120000 inline ${path}\n${data(entry.link)}`;
}

function importStream(spec: BranchSpec): string {
	return spec.commits
		.map((commit, index) => {
			const signature = `t <t@example.com> ${PAST_EPOCH_SECONDS + index} +0000`;
			return [
				`commit refs/heads/${commit.branch}`,
				`author ${signature}`,
				`committer ${signature}`,
				data(commit.branch),
				...(commit.from === undefined
					? []
					: [`from refs/heads/${commit.from}`]),
				...Object.entries(commit.files).map(([path, entry]) =>
					modify(path, entry),
				),
				"",
			].join("\n");
		})
		.join("");
}

export function commitTree(copy: RepoCopy, spec: BranchSpec): RepoCopy {
	git(copy.root, ["fast-import", "--quiet"], importStream(spec));
	git(copy.root, ["checkout", "-q", "-f", spec.checkout, "--"]);
	return copy;
}
