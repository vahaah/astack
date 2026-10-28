export const TIERS = ["standard", "programme", "brief"] as const;
export type Tier = (typeof TIERS)[number];

export const STATUSES = ["draft", "active", "paused"] as const;
export type Status = (typeof STATUSES)[number];

export const HOMES = ["repo", "linear", "github"] as const;
export type Home = (typeof HOMES)[number];

export const SESSION_STATES = ["done", "now", "next", "later"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const MILESTONE_STATES = ["exited", "now", "next", "later"] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];

export const DECISION_KINDS = ["goal", "decision", "rule", "tech"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const STEP_CHECKPOINTS = ["report", "approve ui", "approve one-way"];

export const DEFAULT_OWNER_GATES = [
	"production merge",
	"hosted migration",
	"money",
	"legal",
	"accounts",
	"secrets",
	"client messages",
	"destructive resets",
] as const;

export const INTEGRATOR_LANE = "integrator";

export const HANDLE = {
	milestone: /^M\d+$/,
	block: /^B\d{2,}[a-z]?$/,
	session: /^(?:B\d{2,}[a-z]?\/)?S\d+$/,
	decision: /^D\d+$/,
	wave: /^W\d+$/,
	step: /^\d+[a-z]?$/,
	lane: /^[a-z0-9][a-z0-9-]*$/,
} as const;

export type Line = {
	readonly n: number;
	readonly text: string;
	readonly code: boolean;
};

export type Bullet = { readonly line: number; readonly text: string };

export type Field = {
	readonly name: string;
	readonly line: number;
	readonly value: string;
	readonly bullets: readonly Bullet[];
};

export type TableRow = {
	readonly line: number;
	readonly cells: readonly string[];
};

export type Table = {
	readonly line: number;
	readonly header: readonly string[];
	readonly rows: readonly TableRow[];
};

export type Section = {
	readonly title: string;
	readonly line: number;
	readonly body: readonly Line[];
};

export type FrontmatterField = {
	readonly value: string;
	readonly line: number;
};

export type Frontmatter = {
	readonly present: boolean;
	readonly fields: ReadonlyMap<string, FrontmatterField>;
	readonly endLine: number;
};

export type Unit = {
	readonly handle: string | undefined;
	readonly title: string;
	readonly line: number;
	readonly fields: ReadonlyMap<string, Field>;
	readonly duplicates: readonly Field[];
	readonly tables: readonly Table[];
	readonly stray: readonly Line[];
};

export type Step = {
	readonly line: number;
	readonly id: string;
	readonly title: string;
	readonly wave: string;
	readonly lane: string;
	readonly files: readonly string[];
	readonly covers: readonly string[];
	readonly exit: string;
	readonly proof: string;
	readonly checkpoint: string;
};

export type Session = Unit & { readonly steps: readonly Step[] };

export type BlockLine = {
	readonly line: number;
	readonly handle: string;
	readonly outcome: string;
	readonly lane: string | undefined;
	readonly dependsOn: readonly string[];
	readonly brief: string | undefined;
	readonly ticket: string | undefined;
};

export type Milestone = Unit & { readonly blocks: readonly BlockLine[] };

export type DecisionRow = {
	readonly line: number;
	readonly handle: string;
	readonly cells: readonly string[];
	readonly kind: string;
	readonly decision: string;
	readonly rejected: string;
	readonly door: string;
	readonly settled: string;
	readonly record: string;
	readonly supersededBy: string | undefined;
};

export type DecisionTable = {
	readonly headerLine: number | undefined;
	readonly header: readonly string[];
	readonly rows: readonly DecisionRow[];
};

export type Question = {
	readonly line: number;
	readonly number: number;
	readonly text: string;
	readonly settles: readonly string[];
	readonly blocks: readonly string[];
	readonly binds: readonly string[];
	readonly decideBy: string | undefined;
	readonly ticket: string | undefined;
};

export type Item = { readonly line: number; readonly text: string };

export type Lane = {
	readonly line: number;
	readonly name: string;
	readonly text: string;
};

export type Plan = {
	readonly path: string;
	readonly text: string;
	readonly lines: readonly Line[];
	readonly frontmatter: Frontmatter;
	readonly titles: readonly Item[];
	readonly intro: readonly Line[];
	readonly sections: readonly Section[];
	readonly goal: ReadonlyMap<string, Field>;
	readonly decisions: DecisionTable;
	readonly sessions: readonly Session[];
	readonly milestones: readonly Milestone[];
	readonly lanes: readonly Lane[];
	readonly questions: readonly Question[];
	readonly gates: readonly Item[];
};

export type Severity = "error" | "warning" | "note";

export type Group =
	| "frontmatter"
	| "shape"
	| "goal"
	| "decisions"
	| "sessions"
	| "steps"
	| "gates"
	| "ledger"
	| "prose"
	| "ste"
	| "links"
	| "milestones"
	| "base";

export type PlanFinding = {
	readonly file: string;
	readonly line: number;
	readonly severity: Severity;
	readonly group: Group;
	readonly message: string;
};

export type TrailRow = {
	readonly ts: string;
	readonly phase: string;
	readonly decision: string;
	readonly why: string;
	readonly evidence: string;
	readonly result: string;
};

export type Glossary = {
	readonly paths: readonly string[];
	readonly terms: ReadonlySet<string>;
	readonly avoid: ReadonlyMap<string, string>;
};

export type CheckEnv = {
	readonly root: string;
	readonly today: string;
	readonly adrDir: string;
	readonly glossary: Glossary | undefined;
	readonly trail: readonly TrailRow[] | undefined;
	readonly principles?: ReadonlySet<string>;
	readonly exists: (path: string) => boolean;
	readonly listDir: (path: string) => readonly string[];
	readonly readFile: (path: string) => string | undefined;
};

export function isOneOf<T extends string>(
	values: readonly T[],
	value: string | undefined,
): value is T {
	return values.some((candidate) => candidate === value);
}
