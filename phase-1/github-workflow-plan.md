# Phase 1 — GitHub Workflow Plan (CI/CD)

Companion to `testing-strategy.md` (what gets tested) and `phase_1_plan.md`
(team split, timeline). This doc is the automation side: which GitHub
Actions workflows exist, what triggers them, and what directory layout
they assume. No code or workflow files exist yet — this is the plan the
Day 1 scaffolding follows.

## Assumed repo layout

A monorepo, split by team ownership so path-based triggers can gate each
team's CI independently without blocking the other:

```
stock-correction-bot/
├── .github/
│   └── workflows/
│       ├── node-ci.yml
│       ├── java-ci.yml
│       └── e2e.yml
├── node-agent/                     # Team A
│   ├── src/
│   │   ├── agent/                 # Claude SDK call, conversation turn entry point
│   │   ├── planner/                # tool_use vs plain-text routing (see planner-and-memory.md)
│   │   ├── memory/                 # conversation history + session auth context
│   │   ├── tool-executor/          # authenticate_user, validate_stock_items, submit_zeroisation_request
│   │   └── web-ui/                 # custom chat UI
│   └── tests/
│       ├── unit/                   # tool-schema, planner-routing, memory, free-text-parsing tests
│       └── e2e/                    # scripted conversational harness
├── java-mock-api/                  # Team B
│   ├── src/main/java/...
│   │   ├── controller/              # AuthAPI, ValidationAPI, StockAPI endpoints
│   │   ├── service/
│   │   ├── repository/              # UserRepository, StoreCatalogRepository, SessionTokenRepository (InMemory* impls)
│   │   └── dto/
│   └── src/test/java/...
└── phase-1/                         # planning docs (this file's directory)
```

This mirrors the layer split in `tech_stack.md` (Node: Agent/Planner/
Memory/ToolExecutor; Java: controllers/service/repository/DTO) so each
team's CI workflow only needs to watch its own top-level folder.

## Workflows

### `node-ci.yml` — Team A

- **Trigger:** PR and push touching `node-agent/**`.
- **Steps:** install, lint, unit tests (tool-schema, Planner-routing,
  Memory, free-text-parsing — per `testing-strategy.md`), build.
- **No live Claude API calls** — Planner/Memory unit tests run against
  canned Claude response fixtures, matching the "no live API calls in
  unit tests" rule in `testing-strategy.md`.

### `java-ci.yml` — Team B

- **Trigger:** PR and push touching `java-mock-api/**`.
- **Steps:** build, unit tests (AuthAPI, ValidationAPI, StockAPI,
  `InMemory*` repository tests, Kafka payload-builder tests, log-line
  assertion tests), package.

### `e2e.yml` — cross-team, contract-based

- **Trigger:** PR and push touching either `node-agent/**` or
  `java-mock-api/**`, plus `api-contract.md` changes.
- **Steps:** build the Java service, start it locally, point Team A's
  integration suite and the scripted E2E conversational harness at the
  real running instance (not stubs) — the same shape as Checkpoint #1
  (happy path) and Checkpoint #2 (happy path + 2+ error paths + logging
  assertions) in `testing-strategy.md`. Uses the fake/deterministic
  Claude client, not the live API, so this stays fast and free on every
  PR; the optional nightly real-Claude run is a separate scheduled
  workflow, not part of this gate.

## Branch/PR gating

- `node-ci.yml` and `java-ci.yml` are required checks on every PR,
  scoped to the paths each team owns — Team A's PRs never block on
  Team B's build and vice versa.
- `e2e.yml` is a required check on any PR that touches either service or
  `api-contract.md`, since a contract change can break both sides
  silently otherwise.
- After the Day 1 `api-contract.md` freeze (per `phase_1_plan.md`), a PR
  that modifies it needs sign-off from both teams before merge — enforced
  as a CODEOWNERS entry on that file, not by a workflow.

## What's deliberately out of scope for Phase 1

- No deploy workflow — nothing in Phase 1 ships to a real environment
  (mock APIs, simulated Kafka, in-memory repos all stay local/CI-only).
- No nightly-real-Claude workflow is specified here in detail; it's
  flagged in `testing-strategy.md` as optional and can be added later
  without touching the required PR gates above.
