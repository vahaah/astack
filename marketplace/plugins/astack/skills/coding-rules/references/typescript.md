# TypeScript

This file adds TypeScript examples to the coding rules.
It follows `astack:types` and the type-system principle in `astack:principles`.
Run `astack skill-path astack:principles references/type-system-discipline.md`.
Read the path it prints.
`astack:types` holds the full type and FP rules and what enforces each one.
The examples follow the comments rule too.

## Rules

| Rule | Do this |
|---|---|
| Discriminated unions | Model variants with a literal `kind` field. Never use a bag of optional fields whose combinations need explaining. |
| Exhaustive switches | End each switch on a union with `const unhandled: never = value`. |
| Branded types | Brand primitives that must not mix, such as IDs of different entities. Create them only through a parse function. |
| Constructive types | Build the shape so the illegal value cannot exist: `[T, ...T[]]` for a non-empty list, a start plus a duration for a range. |
| Simplest total type | Keep `T[]` while every operation stays total. Move to `NonEmpty<T>` only where the loose type forces `!`, a cast, or a "cannot happen" throw. |
| `unknown` over `any` | External data is `unknown` until a schema parses it. |
| Schemas before guards | Use the repo's schema library and infer the type. Hand-write a type guard only when no schema fits. |
| No `as` | Do not cast. Parse the value, narrow it, or use `satisfies`. The astack type hook denies a new cast. |
| Narrowing order | Discriminant switch, then `in`, then `typeof` or `instanceof`, then a type guard. A cast that a parser or a DOM API needs goes in the kernel file that `types.allow` names. |
| Honest type guards | A guard named `isX` must check everything the type claims. A lying guard is worse than a cast. |
| Derived types | Reach for `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited` and `typeof` before you declare a new type. |
| `type` and `interface` | `type` for unions, intersections, mapped types and `z.infer`. `interface` for plain object contracts that other code extends or implements. |
| Object arguments | Pass one object when a function takes two or more arguments of the same type. Skip this on hot paths such as parsers and per-frame code. |
| Telemetry | Use the repo's structured logger with an ID to debug from. Ship no `console.log`. |

## Unions and exhaustiveness

```ts
type Invite =
	| { kind: "pending"; sentAt: Date }
	| { kind: "accepted"; acceptedAt: Date; memberId: MemberId }
	| { kind: "revoked"; revokedAt: Date };

function inviteLabel(invite: Invite): string {
	switch (invite.kind) {
		case "pending":
			return "Waiting for reply";
		case "accepted":
			return "Joined";
		case "revoked":
			return "Revoked";
		default: {
			const unhandled: never = invite;
			return unhandled;
		}
	}
}
```

Compare the shape this replaces: `{ accepted: boolean; acceptedAt?: Date; memberId?: string }`. It compiles with `accepted: true` and no `memberId`.

## Brands and parsing at the edge

```ts
import { z } from "zod";

const MemberId = z.uuid().brand<"MemberId">();
type MemberId = z.infer<typeof MemberId>;

const InviteRequest = z.object({
	email: z.email(),
	role: z.enum(["admin", "member"]),
	invitedBy: MemberId,
});
type InviteRequest = z.infer<typeof InviteRequest>;

export function parseInviteRequest(body: unknown) {
	return InviteRequest.safeParse(body);
}
```

The handler parses once. Every function after it takes `InviteRequest` and does not check the fields again.

## Zod 4 forms

| Write | Not |
|---|---|
| `z.email()`, `z.url()`, `z.uuid()` | `z.string().email()`, `z.string().url()`, `z.string().uuid()` |
| `z.guid()` for any 8-4-4-4-12 hex ID | `z.uuid()` for IDs that are not RFC 9562 UUIDs, such as all-zero test fixtures |
| `{ error: "..." }` | `{ message: "..." }`, `required_error`, `invalid_type_error` |

The method forms still run in Zod 4 but are deprecated.
`z.uuid()` checks the version and variant bits.
A fixture such as `00000000-0000-0000-0000-000000000001` fails that check and passes `z.guid()`.

## Non-empty lists

```ts
type NonEmpty<T> = readonly [T, ...T[]];

function newest(events: NonEmpty<AuditEvent>): AuditEvent {
	return events.reduce((latest, event) => (event.at > latest.at ? event : latest));
}
```

Only `newest` needs the stronger type. A function that sums or filters the same list keeps `readonly AuditEvent[]`.

## `satisfies`

```ts
const planLimits = {
	free: { seats: 3 },
	team: { seats: 50 },
} satisfies Record<string, PlanLimits>;
```

The compiler checks each entry against `PlanLimits`.
The type keeps the exact keys, so `planLimits.enterprise` is a compile error.
The annotation `const planLimits: Record<string, PlanLimits>` accepts any key.
