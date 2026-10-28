import { err, ok, type Result } from "../src/astack/result.ts";
import { companionPaths, openCompanion } from "./lib/companion.ts";
import { cleanEnv, git } from "./lib/exec.ts";
import { readLeakScan } from "./lib/leak-rules.ts";
import { loadAllProjects, ProjectConfigError } from "./lib/projects.ts";
import { readTargetDeny } from "./lib/target-lint.ts";
import { scanFiles, type TreeFile, treeFileOf } from "./neutral.ts";

const usage =
	"Usage: bun scripts/pre-push.ts [--companion <dir>] <remote> <url>, with the pushed refs on stdin";

type Args = {
	readonly companion: string | undefined;
	readonly remote: string;
	readonly url: string;
};

function parseArgs(argv: readonly string[]): Result<Args, string> {
	const positional: string[] = [];
	let companion: string | undefined;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg !== "--companion") {
			if (arg !== undefined) positional.push(arg);
			continue;
		}
		companion = argv[index + 1];
		index++;
		if (companion === undefined) return err(usage);
	}
	const [remote, url, ...rest] = positional;
	return remote === undefined || url === undefined || rest.length > 0
		? err(usage)
		: ok({ companion, remote, url });
}

function remoteKey(url: string): string {
	return url
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
		.replace(/^[^@/]*@/, "")
		.replace(/^([^/:]+):(?:\d+\/)?/, "$1/")
		.replace(/\/+$/, "")
		.replace(/\.git$/, "");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPublicRemote(path: string): Promise<Result<string, string>> {
	const file = Bun.file(path);
	const value: unknown = (await file.exists()) ? await file.json() : undefined;
	const remote = isRecord(value) ? value.publicRemote : undefined;
	return typeof remote === "string" && remote !== ""
		? ok(remote)
		: err(`${path}: publicRemote must be the URL of the public remote`);
}

const refLine = /^\S+ ([0-9a-f]+) \S+ [0-9a-f]+$/;
const deletedRef = /^0+$/;

function pushedShas(stdin: string): Result<readonly string[], string> {
	const shas: string[] = [];
	for (const line of stdin.split("\n").filter((text) => text !== "")) {
		const local = refLine.exec(line)?.[1];
		if (local === undefined)
			return err(`pre-push cannot read the ref line "${line}"`);
		if (!deletedRef.test(local)) shas.push(local);
	}
	return ok(shas);
}

type Entry = { readonly object: string; readonly path: string };

const treeEntry = /^\d+ (\w+) ([0-9a-f]+)\t(.+)$/s;

async function newEntries(
	root: string,
	remote: string,
	shas: readonly string[],
): Promise<Result<readonly Entry[], string>> {
	const listed = await git(root, [
		"rev-list",
		...shas,
		"--not",
		`--remotes=${remote}`,
	]);
	if (listed.exitCode !== 0)
		return err(`git rev-list failed in ${root}: ${listed.stderr.trim()}`);
	const entries = new Map<string, Entry>();
	for (const commit of listed.stdout.split("\n").filter(Boolean)) {
		const tree = await git(root, ["ls-tree", "-r", "-z", commit]);
		if (tree.exitCode !== 0)
			return err(`git ls-tree failed on ${commit}: ${tree.stderr.trim()}`);
		for (const record of tree.stdout.split("\0")) {
			const [, kind, object, path] = treeEntry.exec(record) ?? [];
			if (kind === "blob" && object !== undefined && path !== undefined)
				entries.set(`${object} ${path}`, { object, path });
		}
	}
	return ok([...entries.values()]);
}

async function readBlobs(
	root: string,
	objects: readonly string[],
): Promise<Result<ReadonlyMap<string, Buffer>, string>> {
	const child = Bun.spawn(["git", "-C", root, "cat-file", "--batch"], {
		cwd: root,
		env: cleanEnv(),
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = new Response(child.stdout).arrayBuffer();
	child.stdin.write(objects.map((object) => `${object}\n`).join(""));
	await child.stdin.end();
	const bytes = Buffer.from(await output);
	if ((await child.exited) !== 0) return err(`git cat-file failed in ${root}`);
	const blobs = new Map<string, Buffer>();
	let at = 0;
	while (at < bytes.length) {
		const end = bytes.indexOf(10, at);
		const [object = "", kind, size] = bytes
			.toString("utf8", at, end < 0 ? bytes.length : end)
			.split(" ");
		if (end < 0 || kind !== "blob" || size === undefined)
			return err(`git cat-file cannot read ${object}`);
		const start = end + 1;
		blobs.set(object, bytes.subarray(start, start + Number(size)));
		at = start + Number(size) + 1;
	}
	return ok(blobs);
}

async function pushedFiles(
	root: string,
	remote: string,
	stdin: string,
): Promise<Result<readonly TreeFile[], string>> {
	const shas = pushedShas(stdin);
	if (!shas.ok) return shas;
	if (shas.value.length === 0) return ok([]);
	const entries = await newEntries(root, remote, shas.value);
	if (!entries.ok) return entries;
	const blobs = await readBlobs(root, [
		...new Set(entries.value.map((entry) => entry.object)),
	]);
	if (!blobs.ok) return blobs;
	return ok(
		entries.value.map(({ object, path }): TreeFile => {
			const bytes = blobs.value.get(object);
			return bytes === undefined
				? { kind: "unread", path }
				: treeFileOf(path, bytes);
		}),
	);
}

async function main(argv: readonly string[], stdin: string): Promise<number> {
	const args = parseArgs(argv);
	if (!args.ok) {
		console.error(args.error);
		return 2;
	}
	const companion = openCompanion(args.value.companion, process.env);
	if (!companion.ok) {
		console.error(companion.error);
		return 2;
	}
	if (companion.value.source === "example") {
		console.error(
			`${companion.value.root} is the synthetic example companion, so the pre-push gate cannot read the owner values. Pass --companion <dir> in .git/hooks/pre-push.`,
		);
		return 1;
	}
	const paths = companionPaths(companion.value);
	const publicRemote = await readPublicRemote(paths.machine);
	if (!publicRemote.ok) {
		console.error(publicRemote.error);
		return 1;
	}
	if (remoteKey(args.value.url) !== remoteKey(publicRemote.value)) return 0;
	const projects = await loadAllProjects(paths.projects);
	const deny = await readTargetDeny(companion.value, projects);
	if (!deny.ok) {
		console.error(deny.error);
		return 1;
	}
	const leaks = await readLeakScan(companion.value, projects);
	if (!leaks.ok) {
		console.error(leaks.error);
		return 1;
	}
	const files = await pushedFiles(process.cwd(), args.value.remote, stdin);
	if (!files.ok) {
		console.error(files.error);
		return 1;
	}
	const report = await scanFiles(files.value, deny.value, leaks.value);
	for (const line of report.stderr) console.error(line);
	for (const line of report.stdout) console.log(line);
	return report.code;
}

if (import.meta.main) {
	try {
		process.exitCode = await main(Bun.argv.slice(2), await Bun.stdin.text());
	} catch (error) {
		if (!(error instanceof ProjectConfigError)) throw error;
		console.error(error.message);
		process.exitCode = 2;
	}
}
