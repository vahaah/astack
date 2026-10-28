import { isAbsolute, resolve } from "node:path";
import type { HookEvent } from "../events.ts";

export type PatchOp =
	| { readonly kind: "add"; readonly path: string; readonly content: string }
	| {
			readonly kind: "update";
			readonly path: string;
			readonly moveTo: string | undefined;
			readonly hunks: readonly Hunk[];
	  }
	| { readonly kind: "delete"; readonly path: string };

export type Hunk = { readonly old: string; readonly new: string };

const ADD = "*** Add File: ";
const UPDATE = "*** Update File: ";
const DELETE = "*** Delete File: ";
const MOVE = "*** Move to: ";
const END = "*** End Patch";
const EOF_MARK = "*** End of File";

function hunksOf(lines: readonly string[]): Hunk[] | undefined {
	const hunks: Hunk[] = [];
	let old: string[] = [];
	let added: string[] = [];
	const flush = () => {
		if (old.length > 0 || added.length > 0)
			hunks.push({ old: old.join("\n"), new: added.join("\n") });
		old = [];
		added = [];
	};
	for (const line of lines) {
		if (line.startsWith("@@")) flush();
		else if (line === EOF_MARK) continue;
		else if (line.startsWith("+")) added.push(line.slice(1));
		else if (line.startsWith("-")) old.push(line.slice(1));
		else if (line.startsWith(" ") || line === "") {
			const context = line.slice(1);
			old.push(context);
			added.push(context);
		} else return undefined;
	}
	flush();
	return hunks;
}

export function parsePatch(text: string): PatchOp[] | undefined {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const start = lines.findIndex((line) => line.trim() === "*** Begin Patch");
	if (start < 0) return undefined;
	const ops: PatchOp[] = [];
	let index = start + 1;
	const body = (): string[] => {
		const found: string[] = [];
		while (index < lines.length && !(lines[index] ?? "").startsWith("*** "))
			found.push(lines[index++] ?? "");
		if ((lines[index] ?? "") === EOF_MARK) index++;
		return found;
	};
	while (index < lines.length) {
		const line = lines[index++] ?? "";
		if (line.trim() === END) return ops;
		if (line.startsWith(ADD)) {
			const content = body().map((added) =>
				added.startsWith("+") ? added.slice(1) : added,
			);
			ops.push({
				kind: "add",
				path: line.slice(ADD.length).trim(),
				content: `${content.join("\n")}\n`,
			});
		} else if (line.startsWith(DELETE)) {
			ops.push({ kind: "delete", path: line.slice(DELETE.length).trim() });
		} else if (line.startsWith(UPDATE)) {
			const path = line.slice(UPDATE.length).trim();
			const moveLine = lines[index] ?? "";
			const moveTo = moveLine.startsWith(MOVE)
				? moveLine.slice(MOVE.length).trim()
				: undefined;
			if (moveTo !== undefined) index++;
			const hunks = hunksOf(body());
			if (hunks === undefined) return undefined;
			ops.push({ kind: "update", path, moveTo, hunks });
		} else if (line.trim() !== "") return undefined;
	}
	return undefined;
}

export function applyHunks(
	before: string,
	hunks: readonly Hunk[],
): string | undefined {
	let current = before;
	let from = 0;
	for (const hunk of hunks) {
		if (hunk.old === "") {
			current = `${current}${current.endsWith("\n") || current === "" ? "" : "\n"}${hunk.new}\n`;
			continue;
		}
		const at = current.indexOf(hunk.old, from);
		if (at < 0) return undefined;
		current = `${current.slice(0, at)}${hunk.new}${current.slice(at + hunk.old.length)}`;
		from = at + hunk.new.length;
	}
	return current;
}

export function patchText(command: unknown): string | undefined {
	if (typeof command === "string") return command;
	if (Array.isArray(command)) {
		const last: unknown = command.at(-1);
		return typeof last === "string" ? last : undefined;
	}
	return undefined;
}

function opEvents(
	op: PatchOp,
	absolute: (path: string) => string,
	readText: (path: string) => string | undefined,
): HookEvent[] {
	switch (op.kind) {
		case "add": {
			const path = absolute(op.path);
			return [
				{ kind: "write", path, before: readText(path), after: op.content },
			];
		}
		case "update": {
			const before = readText(absolute(op.path));
			const after =
				before === undefined ? undefined : applyHunks(before, op.hunks);
			return before === undefined || after === undefined
				? []
				: [
						{
							kind: "write",
							path: absolute(op.moveTo ?? op.path),
							before,
							after,
						},
					];
		}
		case "delete":
			return [];
	}
}

export function applyPatchEvents(
	patch: string,
	projectDir: string,
	readText: (path: string) => string | undefined,
): HookEvent[] {
	const ops = parsePatch(patch);
	if (ops === undefined) return [];
	const absolute = (path: string) =>
		isAbsolute(path) ? path : resolve(projectDir, path);
	return ops.flatMap((op) => opEvents(op, absolute, readText));
}
