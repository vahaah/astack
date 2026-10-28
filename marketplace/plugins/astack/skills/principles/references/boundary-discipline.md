# Boundary Discipline

Place validation, type narrowing, and error handling at system edges.
Trust internal code unconditionally.
Keep business logic in pure functions.
Keep the shell thin and mechanical.

## Why

Scattered validation creates noise, repeats work, and can falsely suggest safety.
Keep logic outside framework wiring so you can test it without the framework.

## Procedure

- At system edges, validate input, return errors, and handle it defensively. Examples include CLI args, config files, external APIs, and network protocols.
- Inside the system, use typed data and propagate errors without validating again. Trust the types.
- Across a system edge, expose domain concepts instead of private representations. Keep general mechanism inside and specialized policy at the edge.

## Validation and errors

- Validate config when parsing it, not inside business logic.
- Parse raw data into domain types at the system edge.
- Do not re-export transport, storage, framework, or wire types through the public surface.
- Add no redundant nil checks deep in call chains when input validation already covered the case.

## Code organization

- Keep business logic in pure functions without framework dependencies.
- Make parse functions pure transforms from raw bytes to typed state.
- Build prompts by transforming structured state into strings.
- Make scoring and assessment pure transforms from state to results.

## Questions

Ask whether data crosses a system edge here.
If not, validation is redundant.
Ask whether the logic can be a pure function called by the shell.
If so, extract it.
