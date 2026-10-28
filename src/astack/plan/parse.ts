import type {
	BlockLine,
	Bullet,
	DecisionRow,
	DecisionTable,
	Field,
	Frontmatter,
	FrontmatterField,
	Item,
	Lane,
	Line,
	Milestone,
	Plan,
	Question,
	Section,
	Session,
	Step,
	Table,
	TableRow,
	Unit,
} from "./types.ts";

export const UNIT_FIELDS = [
	"State",
	"Ticket",
	"Branch",
	"Lane",
	"Depends on",
	"Demo",
	"Target",
	"Exit",
	"Proof",
	"Baseline",
	"Blocks",
	"Fog",
] as const;

export const GOAL_FIELDS = ["Goal", "Decision", "Done when"] as const;

export const DECISION_HEADER = [
	"#",
	"Kind",
	"Decision",
	"Rejected",
	"Door",
	"Settled",
	"Record",
] as const;

export const STEP_COLUMNS = [
	"#",
	"Step",
	"Wave",
	"Lane",
	"Files",
	"Covers",
	"Exit",
	"Proof",
	"Checkpoint",
] as const;

const UNIT_FIELD = fieldPattern(UNIT_FIELDS);
const GOAL_FIELD = fieldPattern(GOAL_FIELDS);

function fieldPattern(names: readonly string[]): RegExp {
	return new RegExp(`^(${names.join("|")})\\.(?:\\s+(.*))?$`);
}

type Fence = { readonly char: string; readonly length: number };

function openingFence(text: string): Fence | undefined {
	const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
	const marker = match?.[1];
	if (!marker) return undefined;
	if (marker[0] === "`" && (match[2] ?? "").includes("`")) return undefined;
	return { char: marker[0] ?? "`", length: marker.length };
}

function closesFence(text: string, fence: Fence): boolean {
	const marker = /^ {0,3}(`+|~+)[ \t]*$/.exec(text)?.[1];
	return Boolean(
		marker && marker[0] === fence.char && marker.length >= fence.length,
	);
}

export function parseFrontmatter(raw: readonly string[]): Frontmatter {
	const fields = new Map<string, FrontmatterField>();
	if (raw[0]?.trim() !== "---") return { present: false, fields, endLine: 0 };
	const close = raw.findIndex((line, i) => i > 0 && line.trim() === "---");
	if (close < 0) return { present: false, fields, endLine: 0 };
	let listKey: string | undefined;
	for (let i = 1; i < close; i++) {
		const line = raw[i] ?? "";
		const item = /^\s+-\s+(.*)$/.exec(line);
		const previous = listKey ? fields.get(listKey) : undefined;
		if (item && listKey && previous) {
			const value = item[1]?.trim() ?? "";
			fields.set(listKey, {
				line: previous.line,
				value: previous.value ? `${previous.value}, ${value}` : value,
			});
			continue;
		}
		const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
		if (!pair) continue;
		const key = pair[1] ?? "";
		const value = (pair[2] ?? "").trim();
		fields.set(key, { value, line: i + 1 });
		listKey = value === "" ? key : undefined;
	}
	return { present: true, fields, endLine: close + 1 };
}

export function listValue(value: string): string[] {
	return value
		.replace(/^\[|\]$/g, "")
		.split(",")
		.map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
		.filter(Boolean);
}

export function splitRow(text: string): string[] {
	const cells: string[] = [];
	let current = "";
	let inCode = false;
	const body = text.trim().replace(/^\|/, "").replace(/\|$/, "");
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === "\\" && body[i + 1] === "|") {
			current += "|";
			i++;
		} else if (c === "`") {
			inCode = !inCode;
			current += c;
		} else if (c === "|" && !inCode) {
			cells.push(current.trim());
			current = "";
		} else {
			current += c;
		}
	}
	cells.push(current.trim());
	return cells;
}

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

export function tablesIn(lines: readonly Line[]): Table[] {
	const tables: Table[] = [];
	let block: Line[] = [];
	const flush = (): void => {
		const [header, separator, ...rest] = block;
		block = [];
		if (!header) return;
		const rows =
			separator && SEPARATOR_ROW.test(separator.text.trim())
				? rest
				: [separator, ...rest].filter((row): row is Line => row !== undefined);
		tables.push({
			line: header.n,
			header: splitRow(header.text),
			rows: rows.map(
				(row): TableRow => ({ line: row.n, cells: splitRow(row.text) }),
			),
		});
	};
	for (const line of lines) {
		if (!line.code && line.text.trim().startsWith("|")) block.push(line);
		else flush();
	}
	flush();
	return tables;
}

export function sectionByTitle(
	plan: Pick<Plan, "sections">,
	title: string,
): Section | undefined {
	return plan.sections.find((section) => section.title === title);
}

export function sectionText(section: Section | undefined): string {
	return section
		? section.body
				.map((line) => line.text)
				.join("\n")
				.trim()
		: "";
}

export function bullets(section: Pick<Section, "body"> | undefined): Bullet[] {
	if (!section) return [];
	return section.body.flatMap((line) => {
		if (line.code) return [];
		const match = /^\s*[-*]\s+(.*)$/.exec(line.text);
		return match ? [{ line: line.n, text: match[1]?.trim() ?? "" }] : [];
	});
}

export function fieldText(field: Field | undefined): string {
	return field
		? [field.value, ...field.bullets.map((bullet) => bullet.text)]
				.filter(Boolean)
				.join(" ")
				.trim()
		: "";
}

export function stripPeriod(value: string): string {
	return value.replace(/\.\s*$/, "").trim();
}

export function handleList(value: string): string[] {
	return stripPeriod(value)
		.replace(/`/g, "")
		.split(/\s*(?:,|\band\b)\s*/)
		.map((item) => item.trim())
		.filter((item) => item !== "" && !/^none$/i.test(item));
}

type FieldSink = {
	fields: Map<string, Field>;
	duplicates: Field[];
};

function fieldLines(
	lines: readonly Line[],
	pattern: RegExp,
	sink: FieldSink,
	stray: Line[],
): void {
	let current: { name: string; line: number; value: string } | undefined;
	let currentBullets: Bullet[] = [];
	const flush = (): void => {
		if (!current) return;
		const field: Field = { ...current, bullets: currentBullets };
		if (sink.fields.has(field.name)) sink.duplicates.push(field);
		else sink.fields.set(field.name, field);
		current = undefined;
		currentBullets = [];
	};
	for (const line of lines) {
		if (line.code || line.text.trim() === "") continue;
		if (line.text.trim().startsWith("|")) {
			flush();
			continue;
		}
		const match = pattern.exec(line.text);
		if (match) {
			flush();
			current = {
				name: match[1] ?? "",
				line: line.n,
				value: match[2]?.trim() ?? "",
			};
			continue;
		}
		const bullet = /^\s*[-*]\s+(.*)$/.exec(line.text);
		if (bullet && current) {
			currentBullets.push({ line: line.n, text: bullet[1]?.trim() ?? "" });
			continue;
		}
		flush();
		stray.push(line);
	}
	flush();
}

function headingHandle(
	title: string,
	handle: RegExp,
): { handle: string | undefined; title: string } {
	const [first = "", ...rest] = title.trim().split(/\s+/);
	return handle.test(first)
		? { handle: first, title: rest.join(" ") }
		: { handle: undefined, title: title.trim() };
}

function units(section: Section | undefined, handle: RegExp): Unit[] {
	if (!section) return [];
	const groups: { heading: Line; body: Line[] }[] = [];
	for (const line of section.body) {
		const heading = !line.code && /^###\s+\S/.test(line.text);
		if (heading) groups.push({ heading: line, body: [] });
		else groups.at(-1)?.body.push(line);
	}
	return groups.map(({ heading, body }) => {
		const sink: FieldSink = { fields: new Map(), duplicates: [] };
		const stray: Line[] = [];
		fieldLines(body, UNIT_FIELD, sink, stray);
		const named = headingHandle(
			heading.text.replace(/^###\s+/, "").replace(/\s*#*\s*$/, ""),
			handle,
		);
		return {
			...named,
			line: heading.n,
			fields: sink.fields,
			duplicates: sink.duplicates,
			tables: tablesIn(body),
			stray,
		};
	});
}

function columnIndex(header: readonly string[]): Map<string, number> {
	return new Map(header.map((name, i) => [name.trim().toLowerCase(), i]));
}

function splitList(value: string): string[] {
	return value
		.split(/\s*,\s*/)
		.map((item) => item.replace(/`/g, "").trim())
		.filter((item) => item !== "" && !/^none\.?$/i.test(item));
}

export function stepTable(unit: Unit): Table | undefined {
	return unit.tables.find((table) =>
		table.header.some((cell) => cell.trim().toLowerCase() === "step"),
	);
}

function steps(unit: Unit): Step[] {
	const table = stepTable(unit);
	if (!table) return [];
	const index = columnIndex(table.header);
	return table.rows.map((row) => {
		const cell = (name: string): string => {
			const at = index.get(name);
			return at === undefined ? "" : (row.cells[at] ?? "").trim();
		};
		return {
			line: row.line,
			id: cell("#"),
			title: cell("step"),
			wave: cell("wave"),
			lane: cell("lane"),
			files: splitList(cell("files")),
			covers: handleList(cell("covers")),
			exit: cell("exit"),
			proof: cell("proof"),
			checkpoint: cell("checkpoint"),
		};
	});
}

const BLOCK_MARKER = /\s(Lane|Depends on|Brief|Ticket)\.\s+/g;

export function parseBlockLine(
	line: number,
	text: string,
): BlockLine | undefined {
	const match = /^(B\d{2,}[a-z]?)\s+(.+)$/.exec(text.trim());
	if (!match) return undefined;
	const rest = ` ${match[2] ?? ""}`;
	const markers = [...rest.matchAll(BLOCK_MARKER)];
	const outcome = stripPeriod(rest.slice(0, markers[0]?.index ?? rest.length));
	const values = new Map<string, string>();
	markers.forEach((marker, i) => {
		const start = (marker.index ?? 0) + marker[0].length;
		const end = markers[i + 1]?.index ?? rest.length;
		values.set(marker[1] ?? "", stripPeriod(rest.slice(start, end)));
	});
	return {
		line,
		handle: match[1] ?? "",
		outcome,
		lane: values.get("Lane"),
		dependsOn: handleList(values.get("Depends on") ?? ""),
		brief: values.get("Brief"),
		ticket: values.get("Ticket"),
	};
}

function milestone(unit: Unit): Milestone {
	const field = unit.fields.get("Blocks");
	const blocks = (field?.bullets ?? []).flatMap((bullet) => {
		const parsed = parseBlockLine(bullet.line, bullet.text);
		return parsed ? [parsed] : [];
	});
	return { ...unit, blocks };
}

function parseDecisions(section: Section | undefined): DecisionTable {
	const table = section ? tablesIn(section.body)[0] : undefined;
	if (!table) return { headerLine: undefined, header: [], rows: [] };
	return {
		headerLine: table.line,
		header: table.header,
		rows: table.rows.map((row): DecisionRow => {
			const [handle = "", kind = "", decision = "", rejected = ""] = row.cells;
			const [, , , , door = "", settled = "", record = ""] = row.cells;
			return {
				line: row.line,
				handle,
				cells: row.cells,
				kind,
				decision,
				rejected,
				door,
				settled,
				record,
				supersededBy: /^Superseded by (D\d+)\.?$/i.exec(decision)?.[1],
			};
		}),
	};
}

function items(section: Section | undefined, start: RegExp): Item[] {
	const found: Item[] = [];
	if (!section) return found;
	for (const line of section.body) {
		if (line.code || line.text.trim() === "") continue;
		const match = start.exec(line.text);
		const last = found.at(-1);
		if (match) found.push({ line: line.n, text: match[1]?.trim() ?? "" });
		else if (last)
			found[found.length - 1] = {
				line: last.line,
				text: `${last.text} ${line.text.trim()}`,
			};
	}
	return found;
}

const QUESTION_MARKER =
	/\b(Settles|Blocks|Binds|Decide by|Ticket)\.\s+([A-Za-z0-9#/, -]+?)(?=\.(?:\s|$)|$)/g;

export function parseQuestion(item: Item, number: number): Question {
	const values = new Map<string, string>();
	for (const match of item.text.matchAll(QUESTION_MARKER))
		values.set(match[1] ?? "", match[2] ?? "");
	return {
		line: item.line,
		number,
		text: item.text,
		settles: handleList(values.get("Settles") ?? ""),
		blocks: handleList(values.get("Blocks") ?? ""),
		binds: handleList(values.get("Binds") ?? ""),
		decideBy: values.get("Decide by")?.trim(),
		ticket: values.get("Ticket")?.trim(),
	};
}

function questions(section: Section | undefined): Question[] {
	if (!section) return [];
	const numbered: { item: Item; number: number }[] = [];
	for (const line of section.body) {
		if (line.code || line.text.trim() === "") continue;
		const match = /^\s*(\d+)\.\s+(.*)$/.exec(line.text);
		const last = numbered.at(-1);
		if (match)
			numbered.push({
				item: { line: line.n, text: match[2]?.trim() ?? "" },
				number: Number(match[1]),
			});
		else if (last)
			numbered[numbered.length - 1] = {
				number: last.number,
				item: {
					line: last.item.line,
					text: `${last.item.text} ${line.text.trim()}`,
				},
			};
	}
	return numbered.map(({ item, number }) => parseQuestion(item, number));
}

function lanes(section: Section | undefined): Lane[] {
	return bullets(section).flatMap((bullet) => {
		const match = /^([a-z0-9][a-z0-9-]*)\.\s+(.*)$/.exec(bullet.text);
		return match
			? [{ line: bullet.line, name: match[1] ?? "", text: match[2] ?? "" }]
			: [];
	});
}

function goalFields(section: Section | undefined): Map<string, Field> {
	const sink: FieldSink = { fields: new Map(), duplicates: [] };
	if (section) fieldLines(section.body, GOAL_FIELD, sink, []);
	return sink.fields;
}

export function sourceLines(raw: readonly string[], from: number): Line[] {
	const lines: Line[] = [];
	let fence: Fence | undefined;
	for (let i = from; i < raw.length; i++) {
		const text = raw[i] ?? "";
		let code = Boolean(fence);
		if (fence && closesFence(text, fence)) fence = undefined;
		else if (!fence) {
			fence = openingFence(text);
			code = Boolean(fence);
		}
		lines.push({ n: i + 1, text, code });
	}
	return lines;
}

export function parsePlan(path: string, text: string): Plan {
	const raw = text.split(/\r?\n/);
	if (raw.at(-1) === "") raw.pop();
	const frontmatter = parseFrontmatter(raw);
	const lines = sourceLines(raw, frontmatter.endLine);
	const titles: Item[] = [];
	const intro: Line[] = [];
	const groups: { title: string; line: number; body: Line[] }[] = [];
	for (const line of lines) {
		if (!line.code && /^#\s+\S/.test(line.text)) {
			titles.push({ line: line.n, text: line.text.slice(2).trim() });
			continue;
		}
		if (!line.code && /^##\s+\S/.test(line.text)) {
			groups.push({ title: line.text.slice(3).trim(), line: line.n, body: [] });
			continue;
		}
		const current = groups.at(-1);
		if (current) current.body.push(line);
		else if (titles.length > 0 && line.text.trim() !== "") intro.push(line);
	}
	const sections: Section[] = groups;
	const find = (title: string) => sectionByTitle({ sections }, title);
	return {
		path,
		text,
		lines,
		frontmatter,
		titles,
		intro,
		sections,
		goal: goalFields(find("Goal")),
		decisions: parseDecisions(find("Decisions")),
		sessions: units(find("Sessions"), /^(?:B\d{2,}[a-z]?\/)?S\d+$/).map(
			(unit): Session => ({ ...unit, steps: steps(unit) }),
		),
		milestones: units(find("Milestones"), /^M\d+$/).map(milestone),
		lanes: lanes(find("Lanes")),
		questions: questions(find("Unresolved questions")),
		gates: items(find("Gates"), /^\s*[-*]\s+(.*)$/),
	};
}

export function frontmatterValue(
	plan: Pick<Plan, "frontmatter">,
	key: string,
): string | undefined {
	return plan.frontmatter.fields.get(key)?.value;
}

export function hasPlanFrontmatter(text: string): boolean {
	const fm = parseFrontmatter(text.split(/\r?\n/, 40));
	return fm.present && fm.fields.has("plan");
}

export function stateOf(unit: Unit): string | undefined {
	return /^([a-z]+)/.exec(unit.fields.get("State")?.value ?? "")?.[1];
}
