# TypeScript

These rules apply to fixes when the profile sets `typescript.rules: true`.

## Prove types, do not assert them

Prefer fixes in this order:

1. Prove the type from its source of truth.
2. Validate unknown input at the system edge.
3. Represent states with discriminated unions.
4. Make impossible states impossible types.
5. Handle unions exhaustively with a `switch` that ends in `never`.
6. Narrow with a small local type guard.
7. Use an assertion function only when it checks at runtime.
8. Use `satisfies` for structural conformance.
9. Use `as const` only to keep literal types.
10. Cast at a system edge only when validation and narrowing are both impossible.

Validate at these edges in particular:

- API ingress, and RPC or tRPC input and output;
- database rows, unless the repo generates row types from the schema and checks them in CI;
- `JSON.parse` and serialised data;
- responses from external services;
- MCP tool input and output;
- environment variables;
- `localStorage` and `sessionStorage`;
- URL and search params;
- queue messages and webhooks.

## What a fix may not add

- An `as Type` assertion, other than `as const`.
- `any`. Use `unknown` and narrow it.
- A non-null assertion `!`, or a definite-assignment `!`.
- A double cast through `unknown`.
- An angle-bracket cast.
- `Object.assign` used to coerce a type.
- A generic used only to bypass proof.
- Declaration merging that hides a type error.

## A cast that must stay

If validation and narrowing are both impossible, the cast stays and still counts against the metrics budget. Put the reason in the commit body and in the final report.

If the profile sets `typescript.boundary_cast_marker`, the cast also carries a comment that starts with that marker and states why. The profile then lists a keep pattern for the marker, so the comment gate keeps it. Without a marker, write no comment on the cast.

## Strictness flags

If `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes` is off, recommend it in the final report. Do not change `tsconfig` for that recommendation.

## Metric keys

A metrics command for a TypeScript repo usually reports these counts:

| Key | Counts |
|---|---|
| `nonConstAsCasts` | `as` expressions other than `as const` |
| `angleBracketCasts` | `<T>value` assertions |
| `nonNullAssertions` | `value!` and definite-assignment `!` |
| `explicitAny` | the `any` keyword in type positions |
| `doubleCastsViaUnknown` | `value as unknown as T` |
| `suppressionComments` | suppression directives such as `@ts-expect-error` and `biome-ignore` |
