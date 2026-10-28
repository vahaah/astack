# Design It Twice

Use this parallel subagent pattern when the user wants alternative interfaces for a chosen deepening candidate.
It follows Ousterhout's "Design It Twice" approach.
The first design may not be the strongest.
Use Module, Interface, Seam, Adapter and Leverage from [SKILL.md](SKILL.md).

When `astack-architect` is available, the user can run it to compare models and screen design red flags.
For work about to enter implementation, suggest that skill or `/astack-plan` when available.
This pattern supports the survey in `/astack-improve-codebase-architecture`.

## Process

### 1. Frame the problem space

Before you spawn agents, explain the chosen candidate to the user.
Include these parts:

- The constraints on its new interface.
- Its dependencies and their categories from [DEEPENING.md](DEEPENING.md).
- An illustrative code sketch that makes constraints concrete without proposing a final shape.

Show the explanation to the user.
Then proceed directly to step 2.
The user can read it while agents work.

### 2. Spawn sub-agents

Spawn at least 3 parallel Agent calls with `subagent_type: "astack-explorer"`.
Require a structurally different interface from each agent.
Give each a separate technical brief.
Include paths, coupling, the [dependency category](DEEPENING.md), and what belongs behind the seam.
Keep that brief independent from the step 1 explanation for the user.
Assign different constraints:

- Agent 1 minimizes the interface to 1 to 3 entry points and maximizes leverage for each.
- Agent 2 maximizes flexibility for varied uses and extension.
- Agent 3 optimizes the most common caller and makes its default case straightforward.
- Agent 4, when applicable, designs ports and adapters for dependencies across seams.

Include the [SKILL.md](SKILL.md) vocabulary and the repo's domain glossary in each brief.
Use `CONTEXT.md`, or `GLOSSARY.md` where the repo already uses that name.
Require consistent architecture and domain terms.

Each agent returns:

1. The interface, including types, methods, parameters, invariants, ordering and errors.
2. A caller usage example.
3. The implementation details hidden behind the seam.
4. A dependency and adapter strategy from [DEEPENING.md](DEEPENING.md).
5. Tradeoffs, including where leverage is strong or weak.

### 3. Present and compare

Present the designs one at a time.
Then compare depth, locality and seam placement in prose.
Give your recommendation and its reason.
Propose a combined design when parts from different candidates fit well together.
Make a judgment rather than only list options.
