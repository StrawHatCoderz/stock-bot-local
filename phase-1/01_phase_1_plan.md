# Phase 1 Plan — Zeroisation

**Basis:** This doc is the live execution plan for a 2-team,
2-week build sprint.

## Scope

Zeroisation only. There is no preset options menu — the agent is
conversational from the first turn, recognizing intent directly from
whatever the user describes. Waste Adjustment and Store-to-Store Transfer
aren't built, and aren't listed anywhere in the UI either; when a user's
free text describes one of those scenarios, the agent recognizes the shape
of the request and declines conversationally instead of executing it (see
"Recognizing intent without a menu" below).

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
3. Agent asks an open-ended question (e.g., "Hi Priya, what would you like
   to do?") — no preset options are listed.
4. User describes the situation in free text (e.g., "eggs are damaged").
   The agent infers intent directly from this, per "Recognizing intent
   without a menu" below:
   - **Full write-off implied** (damaged/expired/spoiled, no partial
     quantity) → proceeds as a Zeroisation request, extracting product(s)
     + reason. **No quantity is ever asked for or parsed** for this
     path — enforced by `validate_stock_items`' tool schema having no
     quantity property at all (not just by prompting Claude not to ask),
     so there's nowhere for a number to go even if the user states one.
   - **Partial quantity implied** (e.g., "we threw away about 20 damaged
     Coke bottles") → Waste-Adjustment-shaped, not built. Agent declines
     and offers to zero out the product entirely instead.
   - **Destination store implied** (e.g., "we sent 3 cartons to
     Whitefield") → Transfer-shaped, not built. Agent declines and names
     Zeroisation as what it can currently help with.
   - If the message also implies a location (e.g., "kept near some x
     area"), the agent calls `ToolExecutor: list_store_areas` → `store_id`
     from Memory, and matches the vague phrase against the returned area
     descriptions to resolve an `area_code` — see "Area-based product
     lookup" below. If no location is implied, no area_code is resolved
     yet; `ValidationAPI` handles it in the next step.
5. `ToolExecutor: validate_stock_items` → `ValidationAPI` with `{token,
   store_id, items:[{product_name, reason, area_code?}]}` — `area_code` is
   included only if step 4 resolved one. `store_id` always comes from the
   session token, never from user text.
6. `ValidationAPI` checks, in order:
   - **Store-scope authorization**: token's `store_id` matches the
     request. Mismatch → whole request rejected (`STORE_MISMATCH`),
     logged as a security event, before any item is looked at.
   - **Product exists** in that store's catalog (scoped to the given
     `area_code` if present) → returns `current_quantity` + the resolved
     area, `PRODUCT_AMBIGUOUS` (name matches more than one real SKU),
     `AREA_AMBIGUOUS` (name matches in more than one area and no
     `area_code` was given), or `PRODUCT_NOT_FOUND` / `ALREADY_ZERO`.
7. All valid → agent echoes the discovered on-hand quantity **and the
   resolved area** for each item, asks the user to confirm before zeroing
   (this is the real safety check here, since the user never typed a
   number to sanity-check against, and area resolution can be wrong even
   when confident). Some invalid → agent reports exactly which failed and
   why — presenting the candidate list and asking the user to pick one for
   `PRODUCT_AMBIGUOUS` or `AREA_AMBIGUOUS`, asking the user to correct or
   drop otherwise — keeps the valid ones pending, loops back to step 5 for
   just the corrected items.
8. On confirmation, `ToolExecutor: submit_zeroisation_request` →
   `StockAPI`, which zeroes each product's on-hand quantity, generates a
   `request_id`, returns `COMPLETED` + `quantity_zeroed` per item.
9. `StockAPI` logs the event it would publish to
   `stock.zeroisation.completed` (simulated Kafka).
10. Agent shows the final confirmation (request id, items zeroed).

Full request/response shapes: `api-contract.md`.

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

## Product-name disambiguation — baseline, not stretch

Distinct from the typo-suggestion above: a **generic name matching more
than one real SKU** (e.g. "milk" matching Milk 500ml / 1L / Lite) returns
`PRODUCT_AMBIGUOUS` with a `candidates` list (`api-contract.md`), and the
agent asks the user to pick one before re-validating. This ships
unconditionally — it's the main example of the agent resolving ambiguity
itself rather than requiring the user to be precise upfront, so unlike the
typo-suggestion above it has no cut line. Built into the initial
`ValidationAPI` implementation (Days 2–5) and the Node-side error/recovery
handling (Days 6–7) alongside the other error codes — see timeline below.

## Area-based product lookup — baseline, not stretch

A store has multiple areas (e.g. "Dairy Cooler," "Backroom Storage"), each
with an `area_code`, a `name`, and a free-text `description`. The same
product name can be stocked in more than one area at once, each with its
own quantity — so "eggs" alone doesn't always pin down a single row in the
catalog; which area matters.

Users describe location loosely ("kept near some x area"), not by exact
area code, so the agent can't just string-match it against `area_code` or
`name`. Instead: `ToolExecutor: list_store_areas` returns every area's
`description` for the store, and Claude reasons over that free text to
figure out which area the user means — the same "expose real data, let
Claude reason over it" pattern as `PRODUCT_AMBIGUOUS`'s candidate list, not
a new fuzzy-string-matching algorithm in Node or Java.

Two distinct failure/disambiguation paths exist and shouldn't be
conflated:

- **The agent can't confidently resolve the location phrase** to one area
  from `list_store_areas`'s descriptions → it asks the user to clarify
  before ever calling `validate_stock_items`.
- **The user names no location at all, and the product turns out to exist
  in more than one area** → `ValidationAPI` itself detects this and
  returns `AREA_AMBIGUOUS` with per-area candidates (`api-contract.md`),
  which the agent turns into a pick-one question.

Either way, the resolved area is always restated in the confirmation step
("I found 12 eggs in the Dairy Cooler area — zero them out?"), not just
when the match was uncertain — see step 7 of the end-to-end flow above.
This ships unconditionally, same as product-name disambiguation: it's core
to the agent understanding a real description instead of requiring the
user to state things precisely, so it has no cut line. Built into the
initial `AreaRepository`/`ValidationAPI` work and the `list_store_areas`
tool (Days 2–5), with the disambiguation UX turns added in Days 6–7
alongside the other error/recovery branches — see timeline below.

## Recognizing intent without a menu

A preset options list (even with two entries disabled) still makes the
agent a router in disguise — the user does the classification by picking
an option, and the agent just calls the matching API. Phase 1 removes that
list entirely: after login, the agent asks an open-ended question and
recognizes what the user wants from natural free text, the same way the
Coke-bottles example reasons out "Waste Adjustment" without a menu.

Phase 1 still only *executes* Zeroisation, so recognition has to sort
every incoming request into one of three buckets:

1. **Zeroisation-shaped** (a product is damaged/expired/spoiled, no
   partial quantity implied) → proceeds into the flow below.
2. **Waste-Adjustment-shaped** (a specific partial quantity is implied,
   e.g. "20 damaged bottles") → not built yet. The agent says so and
   offers the one thing it *can* do: zero out the product entirely, if
   that's what the user actually wants.
3. **Transfer-shaped** (a destination store is implied) → not built yet.
   The agent says so and names Zeroisation as what it currently supports
   — no attempt to redirect into a write-off, since a transfer isn't one.

Both decline paths are plain conversational replies — no tool call is
involved, since no Waste Adjustment or Transfer tool exists in Phase 1.
This sorting is Claude's reasoning (system prompt + tool schemas), not
Planner logic — see "Agent reasoning" below and `planner-and-memory.md`.

## Agent reasoning: system prompt over hardcoded routing

The Planner is, and stays, a mechanical router (`tool_use` → ToolExecutor,
plain text → UI) — see `planner-and-memory.md`. Everything that looks like
"reasoning" — recognizing whether a free-text message is Zeroisation-,
Waste-, or Transfer-shaped, extracting product + reason from a free-text
sentence, matching a vague location phrase against `list_store_areas`'s
descriptions, deciding what's still missing before `validate_stock_items`
can be called, handling a `PRODUCT_AMBIGUOUS` or `AREA_AMBIGUOUS` response
by asking the user to pick from the candidates — is Claude's own behavior,
shaped by the system prompt and the tool schemas, not new Node logic.
Memory's conversation history is what makes this work: Claude re-derives
what's known and what's missing from the transcript on every turn, rather
than reading it from a separate state object. Concretely, this phase's
system prompt work (not existing code, since none exists yet) needs to
instruct Claude to: recognize a Zeroisation-shaped request and decline the
other two shapes per "Recognizing intent without a menu" above; extract
product name(s) and reason(s) from natural sentences without ever asking
for a quantity; call `list_store_areas` and reason over its descriptions
when a location is implied; always restate the resolved area in the
confirmation step; present `PRODUCT_AMBIGUOUS`/`AREA_AMBIGUOUS` candidates
as pick-one questions; and re-validate once the user disambiguates or
corrects.

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

**Team A (Node):** Agent (Claude SDK), Planner, Memory, ToolExecutor (4
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
- Team B: Spring Boot app scaffolded, in-memory repositories + seed data
  (including `AreaRepository`), all 4 endpoints implemented per contract —
  including `PRODUCT_AMBIGUOUS` and `AREA_AMBIGUOUS` detection in
  `ValidationAPI` from the start, since both are baseline, not stretch —
  structured logging added, unit tests per endpoint — a runnable local
  instance Team A can point at.
- **End of Week 1 — checkpoint #1:** live demo of the full auth →
  Zeroisation happy path, Team A's real Node backend talking to Team B's
  real running mock service (not stubs), structured logs visible in both
  layers.

**Days 6–10 (Week 2):**
- Days 6–7: fix integration gaps from checkpoint #1; add error/recovery
  branches (invalid product, ambiguous product, ambiguous area,
  already-zero, store-mismatch, correction loop) on both sides, with
  matching logging.
- Day 8: stretch window for typo/fuzzy-match suggestion — droppable per
  the cut line above.
- Day 9: joint E2E scripted suite finalized (happy path + 2+ error paths +
  logging assertions), regression pass, bug bash, feature freeze.
- Day 10: final demo/sign-off (Phase 1 end-of-phase deliverable), doc
  cleanup, `api-contract.md` handed off as the Phase 2 starting point.
