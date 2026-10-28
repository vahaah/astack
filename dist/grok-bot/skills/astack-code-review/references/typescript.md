# Review TypeScript and TSX

Use this checklist for TypeScript code and its callers.
Apply the repo's rules and `astack-coding-rules` first.
Review the changed behavior against the requested base and head.

## Input and type contracts

- Trace external values into their parser before internal code uses them.
- Make sure schema output owns its TypeScript type.
- Exercise invalid input, optional fields, and empty collections where the change reaches them.
- Trace each union branch and its exhaustive result.
- Check indexed access when a key or position can be absent.
- Reject a cast, `any`, or assertion that hides the missing behavior.
- Follow branded values back to their validating constructor.

TypeScript narrows discriminated unions through their common literal field.
A `never` assignment makes an unhandled variant a compiler error.
See [the narrowing handbook](https://www.typescriptlang.org/docs/handbook/2/narrowing).

The `noUncheckedIndexedAccess` option adds absence to unchecked indexed values.
See [the compiler option](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html).

## Effects and TSX

- Follow each asynchronous result to its consumer, including rejection and cancellation.
- Check whether a later request can receive an earlier request's result.
- For React code, inspect every effect dependency and its cleanup.
- Exercise a changed TSX control through its event handler and state transition.
- Test the behavior at the public seam, using real local dependencies.

React cleans up an effect before its next changed-dependency setup and after unmount.
See [the React effect reference](https://react.dev/reference/react/useEffect).
Use the renderer's own lifecycle rules for another TSX framework.

## Findings

Report a finding only after tracing its failing path.
Name the changed line, trigger, wrong result, and supporting evidence.
State a missing proof step as a coverage limit.
A successful typecheck proves no runtime-input contract by itself.
