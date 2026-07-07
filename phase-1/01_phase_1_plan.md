# Phase 1 Plan — Zeroisation

**Basis:** This doc is the live execution plan for a 2-team,
2-week build sprint, not the design sign-off record.

## Scope

Zeroisation only. Waste Adjustment and Store-to-Store Transfer are shown in
the UI as disabled/"coming soon" options, not hidden — Phase 1 doesn't
build them.

## Overall roadmap (context for the team; only Phase 1 is detailed)

1. **Phase 1 — Zeroisation** (this sprint): custom web UI, Node/Claude-SDK
   agent, mocked username/password auth, mock Java APIs, simulated Kafka,
   real structured logging.
2. **Phase 2 — Waste Adjustment**: adds the one thing Zeroisation
   deliberately excludes — a user-specified *partial* quantity. Reuses the
   same auth/options/confirm pattern; new `submit_waste_adjustment_request`
   tool + its own reason codes (`overstock`, `promotional_waste`).
3. **Phase 3 — Store-to-Store (STR-STR) Transfer**: adds a destination
   store + `TransferAPI`; first cross-store authorization check.
4. **Phase 4 — Approval/threshold workflow**: Store Manager approval for
   high-value/bulk requests, gating submission behind a second actor.
5. **Phase 5 — Real infrastructure**: swap in-memory repositories for a
   real database (already shaped for this, see `tech_stack.md`), real
   Kafka broker, real downstream consumers.
6. **Phase 6 — Org SSO + hardening**: swap `MockUsernamePasswordAuthProvider`
   for the real org SSO/OIDC integration, formal security review.

## End-to-end flow

1. User opens the custom web chat UI, sees a username/password login form.
2. `ToolExecutor: authenticate_user` → `AuthAPI`. Failure → clear
   rejection, logged, no options shown. Success → `{user_id, name, role,
   store_id, token}` kept in Memory for the session (see `tech_stack.md`
   for why this is built here instead of provided for free).
3. Agent lists all three preset options; only Zeroisation is enabled.
4. User selects Zeroisation, then names product(s) + reason in free text
   (e.g., "eggs are damaged"). **No quantity is ever asked for or parsed**
   — this is enforced by `validate_stock_items`' tool schema having no
   quantity property at all (not just by prompting Claude not to ask), so
   there's nowhere for a number to go even if the user states one.
5. `ToolExecutor: validate_stock_items` → `ValidationAPI` with `{token,
   store_id, items:[{product_name, reason}]}`. `store_id` always comes
   from the session token, never from user text.
6. `ValidationAPI` checks, in order:
   - **Store-scope authorization**: token's `store_id` matches the
     request. Mismatch → whole request rejected (`STORE_MISMATCH`),
     logged as a security event, before any item is looked at.
   - **Product exists** in that store's catalog → returns
     `current_quantity`, or `PRODUCT_NOT_FOUND` / `ALREADY_ZERO`.
7. All valid → agent echoes the discovered on-hand quantities, asks the
   user to confirm before zeroing (this is the real safety check here,
   since the user never typed a number to sanity-check against). Some
   invalid → agent reports exactly which failed and why, keeps the valid
   ones pending, loops back to step 5 for just the corrected items.
8. On confirmation, `ToolExecutor: submit_zeroisation_request` →
   `StockAPI`, which zeroes each product's on-hand quantity, generates a
   `request_id`, returns `COMPLETED` + `quantity_zeroed` per item.
9. `StockAPI` logs the event it would publish to
   `stock.zeroisation.completed` (simulated Kafka).
10. Agent shows the final confirmation (request id, items zeroed).

Full request/response shapes: `api-contract.md`.

## Answering the open question: what else does auth need?

`{user_id, name, role, store_id, token}` is sufficient — nothing else is
needed for Zeroisation. `user_id` becomes `submitted_by` on the Stock API
call and in audit logs; `name` is for UI personalization ("Welcome,
Priya"); `role` and `store_id` scope everything downstream; `token` ties
every subsequent tool call back to this session (and is what
`STORE_MISMATCH` checks against).

## Auth scope for Phase 1

One mocked mechanism is built: username/password. Org SSO is documented in
`tech_stack.md` as a future `AuthProvider` implementation behind the same
contract — not built or shown in the UI this phase.

## Typo/fuzzy-suggestion — stretch, with a cut line

**Baseline (always ships):** on `PRODUCT_NOT_FOUND`, the agent says "I
couldn't find a product called '<X>' in this store's catalog" and asks the
user to re-type it. Complete and non-blocking on its own.

**Stretch (explicitly droppable without rework):** `ValidationAPI` also
runs a simple fuzzy match against the store's catalog when a product isn't
found exactly, returning `suggested_product_name` when confidence is high.
The agent then asks a single yes/no confirm ("did you mean 'Bread'?")
before re-validating with the corrected name. Owned by Team B
(`ValidationAPI`) plus one extra Team A confirm-turn; scheduled Day 8 (see
timeline) — late, because it's safe to cut.

## Logging (real, not mocked)

Adopted from an earlier draft of this plan on its own merits: **the audit
logger is a genuine implementation, not a mock**, even though the Auth/
Validation/Stock APIs and Kafka stay mocked. Structured JSON logs,
correlated by a `correlation_id` minted by the Node backend on the first
user message of a session and threaded through every downstream call.

- **Node**: `session_started`, `tool_call_invoked` (tool + args, `token`
  redacted), `tool_call_result`, `agent_reply_sent`, `session_ended`,
  errors.
- **Java**: `auth_attempt` (username, success/fail, store_id if success —
  password never logged), `validation_performed` (per-item results),
  `zeroisation_submitted` (who, what, `request_id`),
  `kafka_event_published` (topic + payload summary).

Written to stdout in Phase 1 (no aggregation pipeline needed yet), but the
schema is deliberately production-shaped so pointing it at a real
pipeline later is a sink swap, not a rewrite. Satisfies the README's
"Compliance | RBAC and audit trails" benefit, and gives the E2E test a
concrete assertion target (e.g., a `zeroisation_submitted` log line
exists for a given `request_id`, with matching `store_id` across both
layers).

## Role note

RBAC/role plumbing stays exactly as designed — both Store Associate and
Store Manager remain capable roles, no code hard-blocks Associates. Only
the Phase 1 *demo and seed data* use Manager-only accounts, per this
round's scope. This keeps Phase 4's approval workflow (which needs the
role distinction) unblocked later.

## In-memory but production-shaped data

See `tech_stack.md` for the repository-interface pattern and entity
shapes. The short version: mock storage is in-memory now, but its
structure mirrors what a real production database would look like, so a
later phase swaps storage without touching the API contract.

## Team split & 2-week timeline

**Team A (Node):** Agent (Claude SDK), Planner, Memory, ToolExecutor (3
tools), custom web UI, Node-side structured logging, Node tests, the
scripted E2E harness.

**Team B (Java):** Spring Boot scaffolding, AuthAPI/ValidationAPI/StockAPI,
in-memory production-shaped repositories + seed data, Kafka simulation,
Java-side structured logging, Java tests, error-path E2E scenarios.

**Day 1 — critical handoff:** both teams jointly freeze `api-contract.md`.
This is the one blocking dependency for parallel work; everything else
below assumes it's done by end of Day 1 (Day 2 morning at the latest).

**Days 2–5 (rest of Week 1):**
- Team A: Node backend + UI shell scaffolded, Claude SDK wired,
  Agent/Planner/Memory loop built against stubbed tool responses matching
  the frozen contract, real ToolExecutor schemas (no quantity field), unit
  tests started.
- Team B: Spring Boot app scaffolded, in-memory repositories + seed data,
  all 3 endpoints implemented per contract, structured logging added, unit
  tests per endpoint — a runnable local instance Team A can point at.
- **End of Week 1 — checkpoint #1:** live demo of the full auth →
  Zeroisation happy path, Team A's real Node backend talking to Team B's
  real running mock service (not stubs), structured logs visible in both
  layers.

**Days 6–10 (Week 2):**
- Days 6–7: fix integration gaps from checkpoint #1; add error/recovery
  branches (invalid product, already-zero, store-mismatch, correction
  loop) on both sides, with matching logging.
- Day 8: stretch window for typo/fuzzy-match suggestion — droppable per
  the cut line above.
- Day 9: joint E2E scripted suite finalized (happy path + 2+ error paths +
  logging assertions), regression pass, bug bash, feature freeze.
- Day 10: final demo/sign-off (Phase 1 end-of-phase deliverable), doc
  cleanup, `api-contract.md` handed off as the Phase 2 starting point.
