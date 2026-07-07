# Phase 1 — Tech Stack

## Node.js + Claude SDK (Agent, Planner, Memory, ToolExecutor, custom web UI)

The conversation is fundamentally an async, I/O-bound turn loop: call
Claude → inspect the response → maybe call a tool → call Claude again. This
is a natural fit for Node's event loop, and the Claude SDK is JS/TS-first.
Keeping the custom web UI and the Agent backend in the same language and
repo lets one team (Team A) own the entire "chat surface + reasoning"
vertical without needing a third stack in the mix.

**Components, all in Node:**
- **Agent** — calls the Claude API directly via the Claude SDK with the
  full conversation history and the 4 tool schemas.
- **Planner** — inspects Claude's response: plain text (send to the UI,
  wait for the next user message) or a `tool_use` block (route to
  ToolExecutor, feed the result back to Claude, repeat). Extracting
  entities from free text, matching a vague location phrase (e.g. "near
  some x area") against the real areas returned by `list_store_areas`,
  disambiguating an ambiguous product name, and tracking what's still
  missing before a tool can be called are all Claude's own reasoning,
  driven by the system prompt and tool schemas — the Planner holds no
  state or logic beyond this routing decision (see `planner-and-memory.md`).
- **Memory** — the conversation history array itself; this project has no
  MCP host to hold it for free, so it's built and owned here.
- **ToolExecutor** — implements the 4 tools (`authenticate_user`,
  `list_store_areas`, `validate_stock_items`, `submit_zeroisation_request`)
  and calls the Java mock API over REST per `api-contract.md`.

## Java Spring Boot (mock AuthAPI, ValidationAPI, StockAPI)

The mock is built in the language a real enterprise retail inventory
backend is most likely already written in, so its structure — controllers,
service layer, repository interfaces, DTOs — can be lifted almost directly
into the real service in a later phase. That's the strongest version of
"production-shaped": not just matching data shapes, but matching the code
structure a real Java backend team would already recognize. It also gives
Team B a clean, independently testable boundary that lines up with the
layer-based team split.

### `AuthProvider` interface (where SSO fits)

```
interface AuthProvider {
    AuthResult authenticate(Credentials credentials);
}
```

Phase 1 ships exactly one implementation, `MockUsernamePasswordAuthProvider`,
backed by the in-memory `UserRepository`. A future `OrgSsoAuthProvider`
(SAML/OIDC) is documented as the eventual second implementation — it swaps
in behind the same `AuthAPI` contract (`POST /api/auth/login` →
`{user_id, name, role, store_id, token}`), so neither the Node
`ToolExecutor` nor the Agent needs to change when SSO lands. No SSO button
appears in the Phase 1 UI — nothing is built that isn't real yet.

### Repository-interface pattern (where "in-memory but production-shaped" fits)

Each piece of mock state is defined as an interface with an `InMemory*`
implementation now, and a real JPA-backed implementation later — a storage
swap, not an API rewrite:

- **`UserRepository`** — `User { user_id, username, password_hash, name,
  role, store_id }`. Password is hashed even in-memory, to keep the swap to
  a real auth service trivial and to enforce the right habit now.
- **`StoreCatalogRepository`** — `Product { product_id, product_name,
  store_id, area_code, current_quantity }`. Each store has its own catalog
  subset (not every store carries every product) — seeded via a startup
  initializer, not hardcoded into controllers. The catalog key is
  `store_id + area_code + product_name`, not just `store_id +
  product_name`: the same product name can be stocked in more than one
  area of a store, each with its own `product_id` and quantity (e.g. Eggs
  in both the Dairy Cooler and Backroom Storage areas).
- **`AreaRepository`** — `Area { area_code, name, description, store_id }`.
  `description` is the free-text field Claude reasons over when a user
  gives a vague location phrase instead of the exact area code or name —
  see `list_store_areas` in `api-contract.md`. Seeded per store, same as
  `StoreCatalogRepository`.
- **`SessionTokenRepository`** — `token → {user_id, store_id, expiry}`,
  shared between `AuthAPI` and `ValidationAPI`/`StockAPI`, simulating the
  session/JWT lookup a real deployment would do. This is what backs the
  `STORE_MISMATCH` check in `api-contract.md`.

Phase 5 (per the roadmap in `phase_1_plan.md`) swaps the `InMemory*`
classes for JPA-backed ones behind the same interfaces, with zero change to
controllers, the API contract, or the Node side.

## Logging (real, not mocked)

Everything above is mocked except logging — structured JSON logs are a
genuine implementation from day one in both services, correlated by a
`correlation_id` minted by the Node backend per session. See
`phase_1_plan.md` for what gets logged where.

## Kafka (simulated for Phase 1)

`StockAPI` logs the event payload it would publish to
`stock.zeroisation.completed` rather than talking to a running broker.
Real Kafka is a Phase 5 concern (per the roadmap), once real downstream
consumers exist to receive it.
