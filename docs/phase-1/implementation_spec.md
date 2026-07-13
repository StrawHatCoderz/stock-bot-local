# Phase 1 — Implementation Spec

## Team Split

| Team | Owns | Components |
|---|---|---|
| **Team A (Node)** | Agent layer | Claude SDK integration, Planner, Memory, MCP ToolExecutor (9 tools), custom web UI, Node-side structured logging, Node unit tests, scripted E2E harness |
| **Team B (Java)** | Backend layer | Spring Boot scaffolding, Auth/Validation/Stock APIs, in-memory repositories + seed data, Kafka simulation, Java-side structured logging, Java unit tests, error-path E2E scenarios |

## 2-Week Timeline

### Day 1 — Critical handoff (both teams together)

Freeze `api-contract.md` (now `technical_spec.md`'s API Contract section). This is the single blocking dependency — everything below assumes it is done by end of Day 1. Changes after this freeze require sign-off from both teams.

### Days 2–5 (Week 1)

**Team A:**
- Node backend + UI shell scaffolded
- Claude SDK wired; Agent/Planner/Memory loop built against **stubbed** tool responses matching the frozen contract
- Real ToolExecutor tool schemas defined (no quantity field on zeroization tools)
- Unit tests started

**Team B:**
- Spring Boot app scaffolded with in-memory repositories + seed data
- All 9 endpoints implemented per contract
- Structured logging added
- Unit tests per endpoint
- Goal: a runnable local instance Team A can point at

**End of Week 1 — Checkpoint #1:**
Live demo of the full auth → Zeroisation happy path. Team A's real Node backend talking to Team B's real running mock service (not stubs). Structured logs visible in both layers.

### Days 6–10 (Week 2)

**Days 6–7:** Fix integration gaps from Checkpoint #1. Add error/recovery branches on both sides with matching logging:
- `AREA_NOT_FOUND` / `PRODUCT_NOT_FOUND` correction loops
- `UNAUTHORIZED_MANAGER`
- No-stock, empty-area
- `ZEROIZATION_FAILED` with retry
- Whole-area path (`create_area_zeroization` + its confirmation-list UX)

**Day 8:** Buffer/hardening. Focus on whatever was riskiest after Checkpoint #1 (e.g. the reason-code mapping, or the login-failure shape gap).

**Day 9:** Joint E2E scripted suite finalised (happy path + 2+ error paths + logging assertions). Regression pass, bug bash, feature freeze.

**Day 10:** Final demo/sign-off. Doc cleanup. `technical_spec.md`'s API Contract section handed off as the Phase 2 starting point.

## Testing Strategy

Testing is mandatory — it is the sprint's definition of done, not optional polish.

### Node unit tests (Team A)

| Test type | What it asserts |
|---|---|
| Tool schema tests | `create_zeroization` and `create_area_zeroization` payloads never contain a `quantity` field from user input, even when the user states a number |
| Planner routing tests | Given canned Claude API responses (no live API calls), `tool_use` block → ToolExecutor; plain text → sent to UI |
| Memory tests | Correct append order for user messages, tool calls, and tool results across a multi-turn session |
| Free-text parsing tests | Scripted user utterances map to the expected structured entities |

### Java unit tests (Team B)

| Test type | What it covers |
|---|---|
| AuthAPI | Valid/invalid credentials, token issuance, password never appears in logs |
| ValidationAPI | Area found, `AREA_NOT_FOUND`, product found, `PRODUCT_NOT_FOUND`, fuzzy search candidates |
| StockAPI | Zero-out logic, `request_id` generation, correct `quantityZeroed` per item |
| Repository tests | `InMemory*` implementations behave correctly — doubles as a contract smoke-test for the future real-DB swap |
| Kafka payload-builder tests | Event payload shape is correct |
| Log-line assertion tests | Required structured fields are present (via a log-capturing test appender) |

### Contract-based integration tests (cross-team)

No Pact or similar framework given the 2-week timeline. Instead, the frozen API contract (request/response examples in `technical_spec.md`) serves as the shared fixture both sides' tests load. Team A's integration suite starts a real local Spring Boot instance and runs ToolExecutor against it for the happy path and every error code.

### Scripted E2E conversational test

A harness drives the agent through a fixed conversation script:

> login → Zeroisation intent → "eggs are damaged" → area named → confirmation → execute

Assertions: the final StockAPI call shape, the `zeroisation_submitted` log line, and the `kafka_event_published` log line match expectations. Uses a fake/deterministic Claude client in CI (fast, no flakiness, no API cost). An optional nightly run exercises the real Claude API. Team A owns the harness; Team B contributes error-path scripts (product-not-found, already-zero, store-mismatch).

### Ownership and cadence

- Each team unit-tests its own layer on every PR (CI gate).
- Contract fixtures must be frozen by end of Day 1 — no test in this strategy can run in earnest before that.
- **Checkpoint #1 (end of Week 1):** Happy-path E2E against real services, not stubs.
- **Checkpoint #2 (end of Week 2):** Full scripted suite — happy path + 2+ error/recovery paths + logging assertions. This is the sprint's definition of done.

## CI/CD (GitHub Actions)

### `node-ci.yml` — Team A

- **Trigger:** PR and push touching `node-agent/**`
- **Steps:** install → lint → unit tests (no live Claude API calls; Planner/Memory tests run against canned fixtures) → build

### `java-ci.yml` — Team B

- **Trigger:** PR and push touching `java-mock-api/**`
- **Steps:** build → unit tests (Auth, Validation, Stock, repository, Kafka, log-line) → package

### `e2e.yml` — cross-team

- **Trigger:** PR and push touching either `node-agent/**` or `java-mock-api/**`, plus any change to the API contract
- **Steps:** build the Java service → start it locally → run Team A's integration suite and scripted E2E harness against the real running instance (fake/deterministic Claude client, not live API)

### Branch gating

- `node-ci.yml` and `java-ci.yml` are required checks on every PR, scoped to each team's paths — Team A's PRs never block on Team B's build and vice versa.
- `e2e.yml` is a required check on any PR touching either service or the API contract.
- A PR modifying the API contract requires sign-off from both teams, enforced as a CODEOWNERS entry on that file.

No deploy workflow exists for Phase 1 — everything stays local/CI only (mock APIs, simulated Kafka, in-memory repos).

## Open Gaps

These must be resolved before or on Day 1:

| Gap | Owner | Detail |
|---|---|---|
| Login failure response shape | Team B | Contract does not specify what `POST /api/login` returns on bad credentials — a `401` or a body-level error consistent with the other endpoints. Assumed body-level error for now. |
| Full `reason` code enum | Team B | Only `SPOILED` and `POWER_FAILURE` are shown as examples in the contract. The complete list (e.g. `EXPIRED`, `DAMAGED`) must be confirmed before the agent's reason-mapping system prompt is finalised. |
| `ZEROIZATION_FAILED` on area endpoint | Team B | The failure shape for `POST /api/stock/zeroization/area` is not explicitly specified in the original contract. Assumed to reuse `ZEROIZATION_FAILED` consistently with the single-product endpoint. |

## Key Assumptions

- **No quantity from the user.** The system always reads quantity from `get_stock`. Any quantity in user free text is ignored.
- **RBAC plumbing is complete.** Both Store Associate and Store Manager are valid roles in the code; Phase 1 demo seed data uses Manager accounts only. Phase 4's approval workflow (which needs the distinction) is not designed out.
- **No approval workflow.** Any authenticated manager's submission executes directly once validated.
- **Logging is real.** Even though Auth/Validation/Stock APIs are mocked, audit and system logs are genuinely written from day one.
- **Kafka is simulated.** The Stock service logs the event it would publish rather than talking to a broker. Real Kafka is a Phase 5 concern.
- **In-memory but production-shaped.** Repository interfaces mirror the database schema so Phase 5's storage swap is an implementation swap, not an API rewrite.
