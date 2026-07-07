# Phase 1 Assumptions

Assumptions mentioned or confirmed during this session's Phase 1 execution
planning (the "present my plan for my team" round) — as distinct from the
earlier design-brainstorming assumptions already captured in
`docs/superpowers/specs/assumptions.md`. Flagged here for team visibility
before the sprint starts.

## Scope

- Phase 1 covers **only Zeroisation**. **Superseded by a later round of
  this same planning effort:** there is no preset options menu at all —
  Waste Adjustment and STR-STR Transfer aren't listed anywhere in the UI,
  disabled or otherwise. The agent is conversational from the first turn;
  when free text implies one of those unbuilt request types, the agent
  recognizes the shape and declines conversationally instead of executing
  it. See `phase_1_plan.md`'s "Recognizing intent without a menu."
- **No approval workflow.** Any authenticated user's submission executes
  directly once validated. Phase 1's demo and seed data assume the bot is
  used by **Store Managers only** — the underlying role/RBAC plumbing
  still supports Store Associates too, this is a demo-scope choice, not a
  code restriction (kept this way so Phase 4's approval workflow, which
  needs the role distinction, isn't designed out).

## Zeroisation business rule (re-confirmed this round)

- **No quantity is ever collected from the user.** An early draft of this
  round's flow briefly suggested parsing a user-stated quantity (e.g.,
  "1000 eggs broken") — reconciled back to the original rule: the user
  just names the product and a reason ("eggs are damaged"); the system
  looks up and zeroes the entire current on-hand quantity itself.
- Zeroisation targets **specific named product(s)**, never "the entire
  store."
- Validation checks exactly two things, not quantity: (1) the request is
  **authorized for that specific store** (the authenticated user's
  store_id must match), and (2) the **product exists** in that store's
  catalog.

## Authentication

- Auth returns `role`, `store_id`, `user_id`, `name`, and a session
  `token` — this is the complete set needed for Zeroisation; nothing else
  is required.
- Phase 1 **implements one** mocked mechanism: username/password. Org SSO
  is **documented only**, as a future pluggable alternative — not built or
  shown in the Phase 1 UI.

## Data & infrastructure

- Mock APIs use an **in-memory** data store for Phase 1, but its
  structure is designed to **strictly mirror a production database**
  (repository-interface pattern) so a later phase can swap in a real
  database without changing the API contract.
- Kafka is simulated (logged, not a running broker) for Phase 1.
- **Logging is a real implementation, not mocked** — audit/system logs are
  genuinely written from day one, even though the Auth/Validation/Stock
  APIs themselves are mocked.

## Stretch scope

- Typo/fuzzy product-name suggestion (agent suggests a corrected name on a
  near-miss) is **optional for Phase 1** — explicitly droppable without
  rework if the timeline is tight; the baseline "product not found, please
  re-type" path ships regardless.

## Tech stack

- Node.js for the MCP/agent layer, using the **Claude SDK directly** for
  the agent (no Claude Desktop involved in this build).
- Java for the mock API services.

## Process

- **Testing is mandatory** — called out as an explicit requirement, not
  optional polish.
- Two teams, **2-week timeline**, split **by layer**: one team owns the
  Node/agent side, the other owns the Java API side.
- An earlier, separate `phase-1.md` draft (different tool names, a
  "collect but don't submit" scope) was **superseded/discarded** by this
  round's plan.
