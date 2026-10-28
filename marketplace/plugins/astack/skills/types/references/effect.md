# Effect notes

Use this reference when repo instructions or an ADR require Effect, or the changed package already imports `effect`.
Do not add Effect to another package without an ADR.
The 25 rules in `SKILL.md` still apply.
This reference gives their Effect forms.

## Errors

- Put expected failure in the error channel as `Data.TaggedError` or `Schema.TaggedError`. The type `Effect<A, E, R>` then names it.
- Use `Effect.die` or `Effect.orDie` only for defects that mean a bug.
- Keep plain `Result` out of Effect pipelines. Use `Either` only at a seam with plain TypeScript.

```ts
class InviteNotFound extends Data.TaggedError("InviteNotFound")<{
	readonly inviteId: InviteId;
}> {}

const loadInvite = (inviteId: InviteId) =>
	Effect.gen(function* () {
		const repo = yield* InviteRepo;
		const invite = yield* repo.find(inviteId);
		return yield* Option.match(invite, {
			onNone: () => Effect.fail(new InviteNotFound({ inviteId })),
			onSome: Effect.succeed,
		});
	});
```

## Data at the edges

- Parse incoming data with `Schema.decodeUnknown`. Derive its type with `Schema.Schema.Type<typeof Invite>`.
- Construct brands with `Schema.brand` or `Brand.nominal` rather than casts.
- Use `Option` for absence within Effect. Convert it to `T | undefined` when crossing to plain TypeScript.

## Dependencies and steps

- Name each dependency with `Context.Tag` or `Effect.Service`. Provide it through a `Layer` rather than pass a client as a pipeline argument.
- Write sequential steps with `Effect.gen` and `yield*`. Use `pipe` normally within Effect code.
- Match tagged unions with `Match.value(x).pipe(Match.tag("a", onA), Match.exhaustive)` or a `switch` ending in a `never` check.

## Running a program

- Run programs only at a route handler, job entry, script or test. Use `Effect.runPromise` or `ManagedRuntime` there.
- Never run programs within a domain package.

## Laws

Derive generators from schemas so property tests exercise the actual shapes:

```ts
import { Arbitrary, FastCheck, Schema } from "effect";

const invites = Arbitrary.make(Invite);

test("an invite survives a round trip through its encoded form", () => {
	FastCheck.assert(
		FastCheck.property(invites, (invite) => {
			const encoded = Schema.encodeSync(Invite)(invite);
			expect(Schema.decodeUnknownSync(Invite)(encoded)).toEqual(invite);
		}),
	);
});
```

## The type hook in Effect code

The hook permits these class bases:

- `Data.TaggedError`, `Data.TaggedClass` and `Data.Class`.
- `Schema.TaggedError`, `Schema.TaggedClass`, `Schema.TaggedRequest` and `Schema.Class`.
- `Context.Tag`, `Effect.Tag` and `Effect.Service`.

Effect code still cannot add `any`, unsafe casts or `!`.
