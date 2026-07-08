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
  full conversation history and the 7 tool schemas.
- **Planner** — inspects Claude's response: plain text (send to the UI,
  wait for the next user message) or a `tool_use` block (route to
  ToolExecutor, feed the result back to Claude, repeat). Extracting
  entities from free text, guessing a single area/product name to
  validate and retrying with a corrected guess on a not-found response,
  recognizing a whole-area request ("zero everything in the fridge") vs a
  single-product one, and tracking what's still missing before a tool can
  be called are all Claude's own reasoning, driven by the system prompt
  and tool schemas — the Planner holds no state or logic beyond this
  routing decision (see `planner-and-memory.md`).
- **Memory** — the conversation history array itself; this project has no
  MCP host to hold it for free, so it's built and owned here.
- **ToolExecutor** — implements the 7 tools (`authenticate_user`,
  `get_user_details`, `validate_area`, `validate_product`, `get_stock`,
  `create_zeroization`, `create_area_zeroization`) and calls the Java mock
  API over REST per `api-contract.md`. `get_stock` takes an optional
  `productId` — omitted, it returns every product in the area, which is
  what `create_area_zeroization` needs to show the user before zeroing
  everything at once.

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
backed by a mocked credential store keyed on `username`. A future
`OrgSsoAuthProvider` (SAML/OIDC) is documented as the eventual second
implementation — it swaps in behind the same `AuthAPI` contract
(`POST /api/login` → `{token}`, `GET /api/me` → identity/authorization),
so neither the Node `ToolExecutor` nor the Agent needs to change when SSO
lands. No SSO button appears in the Phase 1 UI — nothing is built that
isn't real yet.

### Repository-interface pattern (where "in-memory but production-shaped" fits)

Each repository below is defined as an interface with an `InMemory*`
implementation now, and a real JPA-backed implementation later — a storage
swap, not an API rewrite. Entity shapes conceptually mirror
`database_schema.md`'s tables; the identifiers exposed over the API
(`STORE-101`, `AREA-10`, `PROD-501`, `EMP-1001`) are business-code-style
strings, not the schema's raw numeric primary keys — the repository layer
is what translates between the two:

- **`CredentialRepository`** — `username → password_hash → employee_id`.
  Login credential storage isn't part of `database_schema.md`, so this
  stays a standalone mocked concern rather than an invented column bolted
  onto `employees`.
- **`EmployeeRepository`** — employee identity (`employee_id`,
  `employee_number`, name, email), mirroring the `employees` table.
- **`StoreManagerAssignmentRepository`** — which store an employee
  currently manages, mirroring `store_manager_assignment`. `GET /api/me`
  reads this for the employee's active assignment to populate
  `assignedTo`; no active assignment → `UNAUTHORIZED_MANAGER`.
- **`StoreRepository`** — store identity, mirroring `stores`.
- **`AreaRepository`** — `Area { areaId, storeId, areaName, storageType }`,
  mirroring `areas` (`storageType`, e.g. `REFRIGERATOR`, is informational
  only — see `api-contract.md`). `validate_area` matches `areaName`
  exactly within a store; there's no fuzzy/partial matching or a "list
  areas" lookup in this contract, so Claude gets one guess per attempt.
- **`ProductRepository`** — `Product { productId, sku, productName }`.
  Scoped per area for validation purposes: `validate_product` checks
  existence **within an already-validated `areaId`**, not store-wide or
  globally — mirrors `products` + `area_products` together conceptually,
  though the contract doesn't expose that join directly.
- **`StockRepository`** — `{ storeId, areaId, productId, availableQuantity,
  unit }`. This is the quantity data `database_schema.md`'s
  `area_products` table doesn't carry (it's a bare junction table there) —
  `GET /api/stock` reads it (one row, or every row for an area when
  `productId` is omitted), `POST /api/stock/zeroization` zeroes one row,
  `POST /api/stock/zeroization/area` zeroes every row for an area in one
  call.
- **`SessionTokenRepository`** — `token → employee_id`, simulating the
  JWT lookup a real deployment would do. `GET /api/me` and all
  `ValidationAPI`/`StockAPI` calls resolve identity through this.

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
