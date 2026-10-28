import { lstatSync } from "node:fs";
import { join } from "node:path";

export type PathKind = "missing" | "file" | "directory" | "symlink" | "other";

export type PathProbe = (relativePath: string) => PathKind;

export const instructionFiles = ["claude.md", "agents.md", "review.md"];

export function fsProbe(root: string): PathProbe {
	return (relativePath) => {
		try {
			const stat = lstatSync(join(root, relativePath));
			if (stat.isSymbolicLink()) return "symlink";
			if (stat.isDirectory()) return "directory";
			if (stat.isFile()) return "file";
			return "other";
		} catch {
			return "missing";
		}
	};
}

function ancestors(segments: readonly string[]): string[] {
	return segments
		.slice(0, -1)
		.map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function writeRefusal(
	relativePath: string,
	probe: PathProbe,
): string | undefined {
	if (
		relativePath === "" ||
		relativePath.startsWith("/") ||
		relativePath.includes("\\")
	) {
		return "not a relative POSIX path inside the repo";
	}
	const segments = relativePath.split("/");
	if (
		segments.some(
			(segment) => segment === "" || segment === "." || segment === "..",
		)
	) {
		return "path has an empty, . or .. segment";
	}
	if (segments[0] === ".git") {
		return "path is inside .git";
	}
	const base = segments.at(-1)?.toLowerCase() ?? "";
	if (instructionFiles.includes(base)) {
		return `${segments.at(-1)} is an instruction file; apply never edits CLAUDE.md, AGENTS.md or REVIEW.md, and the report proposes the edit instead`;
	}
	if (
		segments[0] === ".agents" &&
		segments[1] === "skills" &&
		probe(".agents/skills") === "symlink"
	) {
		return ".agents/skills is a symlink; writing through it would land in the directory it points at";
	}
	for (const ancestor of ancestors(segments)) {
		const kind = probe(ancestor);
		if (kind === "symlink") {
			return `${ancestor} is a symlink; apply never writes through a symlink`;
		}
		if (kind === "file" || kind === "other") {
			return `${ancestor} exists and is not a directory`;
		}
	}
	const target = probe(relativePath);
	if (target === "symlink") {
		return `${relativePath} is a symlink; apply never replaces one`;
	}
	if (target === "directory" || target === "other") {
		return `${relativePath} exists and is not a regular file`;
	}
	return undefined;
}
