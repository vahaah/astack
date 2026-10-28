# PR review hardening profile

Settings for the PR review hardening loop on the `v2` branch of the synthetic repo `acme`. The loop reads the YAML block below. Its schema is in the astack plugin's `pr-review-hardening` skill, `references/profile.md`.

```yaml
version: 1
base:
  default: v2
  from_pr: true
  sync: merge
iterations:
  min: 1
  max: 2
after_create_pr: harden
push: when-authorised
guardrails:
  - Run each script with bun.
gates:
  - name: typecheck
    command: bun run typecheck
    env: []
    requires: []
    setup: []
    when_changed: []
    ci_env: []
    after: []
    tools: {}
    rewrites: []
  - name: lint
    command: bun run lint
    env: []
    requires: []
    setup: []
    when_changed: []
    ci_env: []
    after: []
    tools: {}
    rewrites: []
test:
  name: test
  command: bun run test
  env: []
  requires: []
  setup: []
  when_changed: []
  ci_env: []
  after: []
  tools: {}
  rewrites: []
metrics: null
type_coverage: null
typescript:
  rules: true
  boundary_cast_marker: null
reviewers:
  select: applicable
  agents:
    - code-reviewer
    - silent-failure-hunter
    - pr-test-analyzer
  checklists:
    - path: AGENTS.md
      use: The standing rules of the repo.
  notes: []
test_adequacy: changed-behaviour
ledger:
  carry_over: true
prepasses: []
comments:
  keep_patterns:
    - '\bADR-\d{4}\b'
forbidden:
  commands:
    - "\\bgit rebase\\b"
  paths:
    - bun.lock
    - .github/workflows/**
conventions:
  branch:
    create: dev/<slug>
    pattern: "^dev/[a-z0-9-]+$"
  commit:
    subject: "fix(review): <finding-id> <short factual summary>"
    trailers: []
proof:
  pr_comment: null
  on_unclean: null
threads:
  answer: true
merge:
  after_clean_stop: report
  conditions: []
```

## Where the values come from

- `acme` is a synthetic repo. The tests make it in a temporary folder.
- The gates run the three checks of the one CI job, `.github/workflows/ci.yml#check`, in the same order.
- The loop reports after a clean stop. The owner merges the PR.
