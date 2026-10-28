import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gitCommonDir } from "../../plan/trail.ts";
import { collectUnits, type ExportUnit } from "../../plan/units.ts";
import { positional, valueAfter } from "../args.ts";
import type { Command } from "../command.ts";
import { type Io, usageError } from "../io.ts";
import { setFor } from "./plan.ts";

export function ticketFileName(title: string): string {
	return `${
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60) || "ticket"
	}.md`;
}

function chosen(units: readonly ExportUnit[], target: string): ExportUnit[] {
	const tickets = units.filter(
		(unit) => unit.kind !== "copy" && unit.kind !== "addendum",
	);
	if (target === "umbrella")
		return tickets.filter((unit) => unit.kind === "root");
	if (target === "--frontier")
		return tickets.filter(
			(unit) =>
				unit.kind === "session" &&
				(unit.state === "now" || unit.state === "next"),
		);
	return tickets.filter((unit) => unit.handle === target);
}

function run(args: readonly string[], io: Io): number {
	const outFlag = valueAfter(args, "--out");
	const [file, handle] = positional(args, outFlag ? ["--out"] : []);
	const target = args.includes("--frontier") ? "--frontier" : handle;
	if (!file || !target)
		return usageError(
			io,
			"astack plan-ticket: give <plan> and umbrella, a unit handle such as S1, B07/S2 or Q3, or --frontier",
		);
	const loaded = setFor(file, io);
	if (!loaded) return 2;
	const units = collectUnits(loaded.set);
	const picked = chosen(units, target);
	if (picked.length === 0) {
		const handles = units
			.filter((unit) => unit.kind !== "copy" && unit.kind !== "addendum")
			.map((unit) => unit.handle);
		io.err(
			`astack plan-ticket: no ticket for ${target}; the units are ${handles.join(", ")}\n`,
		);
		return 1;
	}
	if (outFlag !== undefined) {
		const common = outFlag === null ? gitCommonDir(loaded.root) : undefined;
		if (outFlag === null && !common)
			return usageError(
				io,
				"astack plan-ticket: --out with no directory needs a git repository",
			);
		const dir = outFlag
			? resolve(io.cwd, outFlag)
			: join(common ?? "", "astack", "plans", loaded.set.slug, "tickets");
		mkdirSync(dir, { recursive: true });
		for (const unit of picked) {
			const path = join(dir, ticketFileName(unit.title));
			writeFileSync(path, `${unit.body}\n`);
			io.out(`${relative(io.cwd, path)}\t${unit.title}\n`);
		}
		return 0;
	}
	io.out(
		picked.length === 1
			? `${picked[0]?.body ?? ""}\n`
			: picked.map((unit) => `# ${unit.title}\n\n${unit.body}\n`).join("\n"),
	);
	return 0;
}

export const command: Command = {
	name: "plan-ticket",
	summary:
		"Prints the tracker body that export writes for one plan unit. With --out and no directory, writes the bodies under the git common directory.",
	usage:
		"plan-ticket <plan> umbrella | <unit handle> | --frontier [--out [<dir>]]",
	run,
};
