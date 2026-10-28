# TypeScript best practices

Find principles in `astack:principles` with `astack skill-path astack:principles references/<title>.md`.
Read each one in full when you apply it.
Apply **type-system-discipline** first.
`SKILL.md` owns the house restrictions and their named kernel exceptions.

| Rule | Summary |
|------|---------|
| Discriminated unions | Use a literal `kind` for variants. Prevent invalid combinations instead of using optional-field bags |
| Branded types | Derive brands from their parsing schema so distinct IDs cannot mix. Parse once at the system edge |
| Constructive modeling | Build valid shapes directly. Use `[T, ...T[]]` for non-empty lists and `[T, T][]` for pairs. Represent a range with `start` and `duration` |
| Simplest total type | Keep `T[]` while operations stay total. Use `NonEmpty<T>` only where the loose type forces `!`, a cast or an impossible-case throw |
| `unknown` over `any` | Treat all external data as `unknown` |
| Schemas before guards | Use the repo's runtime schema and infer its type, such as `z.infer`, before writing a field-by-field guard |
| No `as` casts | Parse, narrow or use `satisfies`. Validation does not grant permission to cast |
| Narrowing hierarchy | Prefer a discriminant, then `in`, then `typeof` or `instanceof`, then an honest guard. Fix the model or parse if none fits |
| Type guards | Check every claim and use `isX` or `hasX` names. A misleading guard hides its defect behind a promise of safety |
| Exhaustiveness | Use `const _exhaustive: never = x;` in default arms so new variants fail compilation |
| `satisfies` over `as` | Check the value without widening literal types |
| Boundary validation | Parse incoming data into a named domain type. Keep `Record<string, unknown>` at the parse. Trust internal types. Apply **boundary-discipline** |
| Schema-derived types | Prefer `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited` and `typeof` before a new interface |
| Object args | Use object arguments to make ordering explicit. Skip this on hot paths such as render loops, tokenizers and parsers |
| Real tests | Run real dependencies when possible. Prefer framework test tools with leak and disposal checks. Verify UI in a running build. Mock only what cannot run locally |
| Structured telemetry | Use structured diagnostics with enough context to investigate an ID. Ship no `console.log` |

## Code examples

The principles apply across languages.
Consult **type-system-discipline** and **boundary-discipline** for the underlying rules.

## Branded types

Use schema-owned brands to keep IDs distinct.
Parse once at the system edge, then trust the derived type internally.

```ts
import { z } from "zod";

const AgentId = z.uuid().brand<"AgentId">();
type AgentId = z.infer<typeof AgentId>;

function parseAgentId(input: unknown) {
  return AgentId.safeParse(input);
}

function focusAgent(id: AgentId): void {
  /* input is trusted */
}
```

Derive the brand and its TypeScript type from the same schema.
Do not create a separate cast-based branding convention.

## Discriminated unions

Give every variant the same discriminant field with its own unique literal.
The union then permits only valid combinations.

```ts
// Don't. Boolean + optionals lets contradictory states exist.
type DiffState = { loading: boolean; diff?: GitDiff; error?: string };

// Do. Only valid states exist.
type DiffState =
  | { kind: "loading" }
  | { kind: "ready"; diff: GitDiff }
  | { kind: "error"; error: string };
```

Choose one discriminant name, such as `kind`, `type` or `tag`, and use it consistently.

## Constructive modeling

Build types from valid parts rather than repeatedly guard an overly broad shape.
For a non-empty list, use a variadic tuple:

```ts
// Don't: T[] plus a length check every caller must repeat
function pickWinner(entries: string[]): string {
  if (entries.length === 0) throw new Error("no entries");
  return entries[Math.floor(Math.random() * entries.length)];
}
```

### Choose a random winner from a non-empty list

```ts
type NonEmpty<T> = [T, ...T[]];

function pickWinner(entries: NonEmpty<string>): string {
  const winnerIndex = Math.floor(Math.random() * entries.length);
  return entries.reduce(
    (winner, entry, index) => (index === winnerIndex ? entry : winner),
    entries[0],
  );
}
```

When a plain `T[]` arrives, narrow it once.
The stronger type preserves the fact for later calls:

```ts
const isNonEmpty = <T>(arr: T[]): arr is NonEmpty<T> => arr.length > 0;
```

Represent even length as pairs:

```ts
type Pairs<T> = [T, T][];
```

Represent a time range with a start and duration:

```ts
// Don't: a comment holds the invariant
type TimeRange = { start: Date; end: Date }; // start <= end
```

### Parse a time range with nonnegative duration

```ts
import { z } from "zod";

const DurationMs = z.number().nonnegative().brand<"DurationMs">();
type DurationMs = z.infer<typeof DurationMs>;

const TimeRange = z.object({
  start: z.date(),
  durationMs: DurationMs,
});
type TimeRange = z.infer<typeof TimeRange>;
```

Parse `durationMs` through a nonnegative branded schema.
The brand prevents unchecked numbers from entering the range.
Keep `start` as `Date`.
Choose a representation that enforces the required invariant.
Derive other views with `pairs.flat()` or a `rangeEnd()` helper.

## Simplest total type

Do not strengthen a type that already supports total operations:

```ts
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0); // [] is 0, fine
```

Strengthen it when a use site otherwise needs `!`, `arr[0] as T`, or an impossible-case throw:

```ts
// Don't: partiality smuggled past the compiler
function newestSession(sessions: Session[]): Session {
  return sessions.at(0)!;
}

// Do: strengthen the input; the assertion disappears
function newestSession(sessions: NonEmpty<Session>): Session {
  return sessions[0];
}
```

Alternatively, return `Session | undefined` to make absence explicit.

## `unknown` over `any`

Treat external data as `unknown` and narrow it before use:

```ts
// Don't
function handle(input: any) {
  return input.foo.bar;
}

// Do
function handle(input: unknown) {
  if (typeof input === "object" && input !== null && "foo" in input) {
    // narrowed; compiler verifies access
  }
}
```

External sources include RPC, `JSON.parse`, `postMessage`, IPC, files, environment variables and database results.

## Schemas before hand-rolled guards

Before writing a field-by-field guard, find the repo's runtime schema library and existing schemas.
Let one schema own validation and derive the type from it.
Do not maintain a schema, duplicate interface and separate guard that can disagree.

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

type User = z.infer<typeof UserSchema>;

function parseUser(input: unknown): User {
  return UserSchema.parse(input);
}
```

Use `safeParse` for expected failure.
Use the existing library's inference helper when it is not Zod.
Do not add a schema dependency for one guard.
Prefer the schema system that the repo already uses.

## No `as` casts

Do not cast, including after validation.
Parse, narrow or use `satisfies` under the restrictions and named kernel exceptions in `SKILL.md`.

```ts
import { z } from "zod";

// Don't
const user = data as User;

// Don't
function isUser(data: unknown): data is User {
  return typeof data === "object" && data !== null && "id" in data;
}

// Do
const userSchema = z.object({ id: z.string(), name: z.string() });
type User = z.infer<typeof userSchema>;

function parseUser(data: unknown): User {
  return userSchema.parse(data);
}
```

When a type exists first, annotate its validator with the type it proves.
The compiler then rejects a weaker validator.
Removing `name` from this object makes assignment fail:

```ts
type User = { id: string; name: string };

const userSchema: z.ZodType<User> = z.object({ id: z.string(), name: z.string() });
```

When removing an existing cast, identify why inference fails:

- Add a missing discriminant and use a discriminated union.
- Narrow an overly wide source, such as `Record<string, unknown>`.
- Parse an untyped system edge with its owning schema. Add a schema only when none exists.
- Use a branded type or `satisfies` for a claim that cannot otherwise be expressed.

## Narrowing hierarchy

Use this order:

1. Use a discriminated-union switch or condition for compiler narrowing.
2. Use `in`, such as `"key" in obj`, to select variants with a property.
3. Use `typeof` for primitives or `instanceof` for class instances.
4. Use an honest type guard when those forms are insufficient.
5. If none fits, parse the input or correct the type model. Do not cast after validation.

```ts
function area(s: Shape): number {
  if ("radius" in s) return Math.PI * s.radius ** 2; // narrowed to circle
  return s.width * s.height; // narrowed to rect
}
```

## Type guards

Verify every claim in a type guard.
A false guard hides a defect more effectively than a visible cast.

```ts
function isCircle(s: Shape): s is Shape & { kind: "circle" } {
  return s.kind === "circle";
}
```

Prefer direct discriminant narrowing when possible.

## Exhaustiveness

In a default arm, assign the unmatched value to a `never` local:

```ts
// Value-returning switch
function area(s: Shape): number {
  switch (s.kind) {
    case "circle":
      return Math.PI * s.radius ** 2;
    case "rect":
      return s.width * s.height;
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
}

// Void switch
function handle(s: Shape): void {
  switch (s.kind) {
    case "circle":
      drawCircle(s);
      break;
    case "rect":
      drawRect(s);
      break;
    default: {
      const _exhaustive: never = s;
      void _exhaustive;
    }
  }
}
```

Return that value in a value-returning switch.
Use the void form in a statement switch.

## `satisfies` over `as`

Use `satisfies` to validate while retaining literal types:

```ts
// Don't. Widens, loses literal types.
const config = { theme: "dark", cols: 3 } as Config;

// Do. Validates AND preserves literal types.
const config = { theme: "dark", cols: 3 } satisfies Config;
// config.theme is "dark" (literal), not string
```

## Boundary validation

Validate incoming data once and trust the internal type.
Apply **boundary-discipline**.

- Parse wire formats such as proto and JSON-RPC with `ignoreUnknownFields` for forward compatibility.
- Version persisted JSON and catch parse errors.
- Do not repeat validation deep in the call chain.

## Schema-derived types

Derive a shape from generated types when a `.proto`, OpenAPI, GraphQL or database schema already owns it.
Do not create a duplicate:

```ts
// Don't. Duplicate shape, drifts when the schema changes.
type CheckSummary = {
  totalCount: number;
  checks: { name: string; status: string }[];
};
function renderChecks(s: CheckSummary) {
  /* ... */
}

// Do. Derive from the generated schema type.
import type { ChecksMessage } from "<generated module>";
function renderChecks(s: Pick<ChecksMessage, "totalCount" | "checks">) {
  /* ... */
}
```

Try `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited` and `typeof` before writing another interface.

## Object args

```ts
// Don't. Swap two args, still compiles.
openFile(uri, {
  startLineNumber: 10,
  startColumn: 1,
  endLineNumber: 10,
  endColumn: 1,
});

// Do. Order-independent, self-documenting.
openFile({
  uri,
  selection: {
    startLineNumber: 10,
    startColumn: 1,
    endLineNumber: 10,
    endColumn: 1,
  },
});
```

Skip object allocation on hot paths where it matters, such as per-frame rendering, tokenizers, parsers and tight loops.
