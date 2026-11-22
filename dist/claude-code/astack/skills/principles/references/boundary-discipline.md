# Boundary Discipline

Put validation, type narrowing and error handling at the system edges.
Keep the shell thin and mechanical.

## Why

Validation that is spread through the code adds noise and repeats work.
It can also show a false safety, because no reader knows which check covers which case.
Logic outside the framework wiring is easy to test without the framework.

`astack:coding-rules` gives the rules in its section "Validate at the system edge".

## Design

- Across a system edge, show domain concepts, not private representations.
- Keep the general mechanism inside. Keep the special policy at the edge.
- Make parsers, prompt builders and scorers pure transforms of state.

Ask whether data crosses a system edge at this line.
If not, the validation is redundant.
