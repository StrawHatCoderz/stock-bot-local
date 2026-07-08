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
2. `ToolExecutor: authenticate_user` → `POST /api/login`. Failure → clear
   rejection, logged, no options shown. Success → a bare `{token}`, which
   Memory keeps for the session.
3. `ToolExecutor: get_user_details` → `GET /api/me` (token via auth
   header). `authorized: false` (`UNAUTHORIZED_MANAGER`) → clear
   rejection, session ends. `authorized: true` → `{employee_id,
   employee_number, name, email, assignedTo}` kept in Memory —
   `assignedTo` is the `storeId` used on every later call, `employee_id`
   becomes `requestedBy` at submission time.
4. Agent asks an open-ended question (e.g., "Hi Priya, what would you like
   to do?") — no preset options are listed.
5. User describes the situation in free text (e.g., "I want to remove
   eggs from Refrigerator X because it's damaged"). The agent infers
   intent directly from this, per "Recognizing intent without a menu"
   below:
   - **Full write-off implied** (damaged/expired/spoiled, no partial
     quantity) → proceeds as a Zeroisation request, extracting product,
     area (if named), and reason. **No quantity is ever asked for or
     parsed** — `quantity` on the eventual zeroization request always
     comes from a stock lookup (step 8), never from user text.
   - **Partial quantity implied** (e.g., "we threw away about 20 damaged
     Coke bottles") → Waste-Adjustment-shaped, not built. Agent declines
     and offers to zero out the product entirely instead.
   - **Destination store implied** (e.g., "we sent 3 cartons to
     Whitefield") → Transfer-shaped, not built. Agent declines and names
     Zeroisation as what it can currently help with.
6. **If no area was named**, the agent asks for one before doing anything
   else — this contract has no way to search for a product across a whole
   store, only within a named area (see "Area and product resolution"
   below), so an area is always required, not just optional context.
7. `ToolExecutor: validate_area` → `POST /api/validation/area`
   `{storeId, areaName}`. `AREA_NOT_FOUND` → agent says so and asks the
   user to restate or correct the area name, retries this same call — it
   cannot fall back to searching, since Claude only gets one guess per
   attempt (no candidate list exists in this contract). `exists: true` →
   `areaId` resolved, kept for the rest of this request.
8. **Did the user name a specific product, or mean everything in the
   area** (e.g. "the whole fridge lost power" vs "the eggs are damaged")?
   See "Whole-area zeroization" below for the second path — the rest of
   this list covers the single-product path.
9. `ToolExecutor: validate_product` → `POST /api/validation/product`
   `{storeId, areaId, productName}`. `PRODUCT_NOT_FOUND` → agent says the
   product isn't stocked in that specific area and asks the user to
   correct the name or the area, retries. `exists: true` → `productId`
   (+ `sku`) resolved.
10. `ToolExecutor: get_stock` → `GET /api/stock?storeId&areaId&productId`
    → `availableQuantity` + `unit`. `availableQuantity: 0` → agent tells
    the user there's nothing to write off, ends without calling the
    zeroization endpoint.
11. `availableQuantity > 0` → agent echoes it back with the resolved area
    (e.g., "I found 120 BOX of eggs in Refrigerator X — zero them out?")
    and asks the user to confirm before zeroing — this is the real safety
    check here, since the user never typed a number to sanity-check
    against.
12. On confirmation, `ToolExecutor: create_zeroization` →
    `POST /api/stock/zeroization` with `quantity` set to the
    `availableQuantity` just read, `reason` mapped from the user's free
    text onto a fixed code (e.g. `SPOILED`), `remarks` carrying the
    original free text, `requestedBy` set to `employee_id`.
    `status: FAILED` (`ZEROIZATION_FAILED`) → agent reports the failure,
    offers to retry. `status: SUCCESS` → `zeroizationId` +
    `transactionId` returned.
13. `StockAPI` logs the event it would publish to
    `stock.zeroisation.completed` (simulated Kafka).
14. Agent shows the final confirmation (`zeroizationId`, item zeroed).

Full request/response shapes: `api-contract.md`.

## Whole-area zeroization

When step 8 above recognizes a whole-area request instead of a
single-product one, the flow after `validate_area` changes:

1. `ToolExecutor: get_stock` → `GET /api/stock?storeId&areaId` (no
   `productId`) → the list of every product currently stocked in that
   area, each with its own `availableQuantity`. An empty `products: []` →
   agent tells the user there's nothing stocked there, ends.
2. Agent confirms the **whole list** before acting — not just a quantity,
   the actual set of products about to be zeroed (e.g., "This will zero
   out 4 products in Dairy: Eggs (120 BOX), Milk 1L (40 BOX), ... —
   proceed?"). This matters more here than in the single-product path: a
   wrong area guess now silently zeroes several unrelated products instead
   of one, so this confirmation is the only safety check before an
   irreversible bulk write.
3. On confirmation, `ToolExecutor: create_area_zeroization` →
   `POST /api/stock/zeroization/area` with one `reason`/`remarks` pair
   covering the whole area (e.g. `POWER_FAILURE`, "lost power overnight"),
   `requestedBy` set to `employee_id`. No per-product `quantity` is sent —
   same reasoning as the single-product path, just applied to every
   product the area-wide `get_stock` call already reported.
4. Same failure/success/Kafka/confirmation handling as the single-product
   path, applied to the whole `items` list `create_area_zeroization`
   returns.

If the user gives *different* reasons for different products in the same
area, that's not a whole-area request — it's several single-product
requests, handled one at a time via the flow above.

## Auth scope for Phase 1

One mocked mechanism is built: username/password. Org SSO is documented in
`tech_stack.md` as a future `AuthProvider` implementation behind the same
contract — not built or shown in the UI this phase.

## Area and product resolution — single-guess, retry on not-found

The mock API signatures (`api-contract.md`) have no "list areas" or
"search products" endpoint — `validate_area` and `validate_product` each
take an exact name and return `exists: true/false`, nothing in between.
That reshapes what "smart" means here: the agent can't be handed a
candidate list to turn into a pick-one question (an earlier draft of this
plan assumed `PRODUCT_AMBIGUOUS`/`AREA_AMBIGUOUS` responses with
candidates — dropped, since this contract doesn't return them; see
`api-contract.md`'s "Note on disambiguation"). Instead:

- Claude produces its single best guess at the area name and product name
  from the user's free text (e.g. "Refrigerator X" from "kept near
  refrigerator X," "eggs" from "eggs are damaged").
- `AREA_NOT_FOUND` or `PRODUCT_NOT_FOUND` → the agent tells the user
  exactly what didn't match and asks them to restate or correct it, then
  retries the same validation call. This is a plain conversational
  correction loop, not a system that shows real alternatives.
- Product validation is scoped to an already-validated `areaId` — there's
  no store-wide fallback if the user never names an area, which is why
  step 6 of the end-to-end flow above always asks for one before
  validating anything, rather than treating location as optional context.

The resolved area is always restated in the confirmation step ("I found
120 BOX of eggs in Refrigerator X — zero them out?"), giving the user one
more chance to catch a wrong guess before anything is written off. Built
into the initial `ValidationAPI` work (Days 2–5), with the retry-loop UX
added in Days 6–7 alongside the other error/recovery branches — see
timeline below.

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
Waste-, or Transfer-shaped, recognizing a whole-area request ("the whole
fridge lost power") vs a single-product one ("the eggs are damaged"),
extracting product/area/reason from a free-text sentence, guessing a
single area or product name to validate and retrying with a corrected
guess on `AREA_NOT_FOUND`/`PRODUCT_NOT_FOUND`, mapping the user's own
words for "why" onto a fixed reason code for `create_zeroization`/
`create_area_zeroization` while keeping the original wording in `remarks`,
deciding what's still missing before a tool can be called — is Claude's
own behavior, shaped by the system prompt and the tool schemas, not new
Node logic. Memory's conversation history is what makes this work: Claude
re-derives what's known and what's missing from the transcript on every
turn, rather than reading it from a separate state object. Concretely,
this phase's system prompt work (not existing code, since none exists
yet) needs to instruct Claude to: recognize a Zeroisation-shaped request
and decline the other two shapes per "Recognizing intent without a menu"
above; always ask for an area if one wasn't named, since there's no
store-wide product search to fall back on; distinguish a whole-area
request from a single-product one per "Whole-area zeroization" above;
extract product name(s) and reason(s) from natural sentences without ever
asking for a quantity; retry with a corrected single guess on
`AREA_NOT_FOUND`/`PRODUCT_NOT_FOUND` rather than presenting alternatives
that don't exist in this contract; map free-text reasons onto fixed reason
codes; and always restate the resolved area, quantity, and (for
whole-area) the full product list in the confirmation step before calling
`create_zeroization` or `create_area_zeroization`.

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

**Team A (Node):** Agent (Claude SDK), Planner, Memory, ToolExecutor (7
tools: `authenticate_user`, `get_user_details`, `validate_area`,
`validate_product`, `get_stock`, `create_zeroization`,
`create_area_zeroization`), custom web UI, Node-side structured logging,
Node tests, the scripted E2E harness.

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
  all 7 endpoints implemented per contract (`/api/login`, `/api/me`,
  `/api/validation/area`, `/api/validation/product`, `/api/stock` —
  including the area-wide form with `productId` omitted —
  `/api/stock/zeroization`, `/api/stock/zeroization/area`), structured
  logging added, unit tests per endpoint — a runnable local instance
  Team A can point at.
- **End of Week 1 — checkpoint #1:** live demo of the full auth →
  Zeroisation happy path, Team A's real Node backend talking to Team B's
  real running mock service (not stubs), structured logs visible in both
  layers.

**Days 6–10 (Week 2):**
- Days 6–7: fix integration gaps from checkpoint #1; add error/recovery
  branches (`AREA_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `UNAUTHORIZED_MANAGER`,
  no-stock, empty-area, `ZEROIZATION_FAILED`, correction loop) on both
  sides, with matching logging; build out the whole-area path
  (`create_area_zeroization` + its confirmation-list UX).
- Day 8: buffer/hardening — no droppable stretch scope remains in this
  contract, so this day goes to whatever's riskiest after checkpoint #1
  (e.g. the reason-code mapping, or the login-failure shape gap flagged in
  `api-contract.md`).
- Day 9: joint E2E scripted suite finalized (happy path + 2+ error paths +
  logging assertions), regression pass, bug bash, feature freeze.
- Day 10: final demo/sign-off (Phase 1 end-of-phase deliverable), doc
  cleanup, `api-contract.md` handed off as the Phase 2 starting point.
