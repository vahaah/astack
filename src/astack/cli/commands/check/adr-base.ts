import { type AdrFolder, adrFolder } from "../../../adr.ts";
import { readBlobs, runGit } from "../../../git.ts";
import { err, ok, type Result } from "../../../result.ts";

export type BaseProblem = { readonly ref: string; readonly message: string };

export function mergeBase(
	root: string,
	ref: string,
): Result<string, BaseProblem> {
	const merged = runGit(root, ["merge-base", `${ref}^{commit}`, "HEAD"]);
	return merged.ok
		? ok(merged.stdout.toString("utf8").trim())
		: err({ ref, message: `git cannot read the base ${ref}` });
}

export function readBaseFolder(
	root: string,
	dir: string,
	commit: string,
): Result<AdrFolder, BaseProblem> {
	const listed = runGit(root, [
		"ls-tree",
		"-z",
		"--name-only",
		commit,
		"--",
		`${dir}/`,
	]);
	if (!listed.ok)
		return err({
			ref: commit,
			message: `git cannot list ${dir} at ${commit}`,
		});
	const paths = listed.stdout
		.toString("utf8")
		.split("\0")
		.filter((path) => path.endsWith(".md"));
	const blobs = readBlobs(
		root,
		paths.map((path) => `${commit}:${path}`),
	);
	return ok(
		adrFolder(
			dir,
			paths.flatMap((path) => {
				const text = blobs.get(`${commit}:${path}`);
				return text === undefined ? [] : [{ path, text }];
			}),
		),
	);
}
