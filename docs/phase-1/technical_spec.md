# Phase 1 — Technical Spec

## System Architecture

```
Browser (React/Vite)
    ↕ REST + WebSocket
Express server (Node.js)
    ├── POST /api/auth/login  →  calls Java Auth service directly (not via agent)
    └── WebSocket  →  AgentSession (Claude Agent SDK)
                          ↕ stdio MCP
                      MCP server (Node.js)
                          ↕ HTTP
                      nginx gateway (:8080)
                          ├── auth-service (:8081)
                          ├── validation-service (:8082)
                          └── stock-service (:8083)
```

Login is handled directly by the Express server, not by the agent. The resulting identity (`token`, `employeeId`, `storeId`) is baked into the agent's system prompt via environment variables passed to the MCP subprocess, so the agent never calls auth tools itself.

## Node.js Components (Team A)

### Agent

Calls the Claude API via the Claude Agent SDK with the full conversation history and all tool schemas on every turn. Model: `claude-sonnet-5`. The agent's reasoning — intent recognition, entity extraction, name-guessing, reason-code mapping — lives in the **system prompt**, not in application code.

### Planner

Inspects the Claude API response and routes it:
- **Plain text response** → send to the UI, wait for the next user message.
- **`tool_use` block** → route to ToolExecutor, append the result to Memory, loop back to the Agent.

The Planner has no business logic. It is a mechanical router only.

### Memory

Holds the conversation history array for the current session. This is the array passed to Claude on every turn. It contains, in strict order: user messages, Claude's replies, `tool_use` requests, and tool results. Because the full history is replayed on every Claude call, Claude reconstructs what is known and what is missing from the transcript itself — no separate state object is needed.

Memory also holds the session auth context (`token`, `employee_id`, `storeId`) captured at login, which every subsequent tool call reads from.

**Session lifetime:** Sessions expire after 30 minutes of inactivity. On resume, stored messages are replayed into the new session's system prompt so Claude can continue the conversation with context.

### ToolExecutor (MCP server)

Implemented as a stdio MCP server (`mcp/`). Exposes 7 tools that proxy HTTP calls to the Java backend. Session identity is injected via environment variables (`SESSION_TOKEN`, `SESSION_STORE_ID`, `SESSION_EMPLOYEE_ID`) at spawn time — tools read these from `process.env` rather than accepting them as parameters.

| Tool | API call |
|---|---|
| `authenticate_user` | `POST /api/login` |
| `get_user_details` | `GET /api/me` |
| `search_areas_fuzzy` | `GET /api/validation/area/search` |
| `validate_area` | `POST /api/validation/area` |
| `search_products_fuzzy` | `GET /api/validation/product/search` |
| `validate_product` | `POST /api/validation/product` |
| `get_stock` | `GET /api/stock` |
| `create_zeroization` | `POST /api/stock/zeroization` |
| `create_area_zeroization` | `POST /api/stock/zeroization/area` |

> `authenticate_user` and `get_user_details` exist on the MCP server but are excluded from the agent's `allowedTools` — login already happened server-side.

## Java Spring Boot Components (Team B)

Three services behind an nginx gateway. Each follows the **repository-interface pattern**: every repository is defined as an interface with an `InMemory*` implementation now, and a JPA-backed implementation in Phase 5 — a storage swap with no API or controller changes.

### Auth service (`:8081`)

- `POST /api/login` — validates username/password via `CredentialRepository`, returns a session token.
- `GET /api/me` — resolves token via `SessionTokenRepository`, returns employee identity and store assignment via `EmployeeRepository` + `StoreManagerAssignmentRepository`. No active assignment → `UNAUTHORIZED_MANAGER`.

`AuthProvider` interface allows a future `OrgSsoAuthProvider` (SAML/OIDC) to replace `MockUsernamePasswordAuthProvider` with no change to the API contract or the Node side.

### Validation service (`:8082`)

- `POST /api/validation/area` — exact (case-insensitive) name match within a store via `AreaRepository`.
- `POST /api/validation/product` — exact name match scoped to an already-validated `areaId` via `ProductRepository`.
- `GET /api/validation/area/search` — substring match on area name; returns a `candidates` list.
- `GET /api/validation/product/search` — substring match on product name within an area; returns a `candidates` list.

### Stock service (`:8083`)

- `GET /api/stock` — returns a single product's quantity (with `productId`) or every product in the area (without `productId`) via `StockRepository`.
- `POST /api/stock/zeroization` — sets one product's quantity to zero.
- `POST /api/stock/zeroization/area` — sets every product in an area to zero in one call.

Both write endpoints simulate publishing to the `stock.zeroisation.completed` Kafka topic by logging the event payload instead of talking to a broker.

## API Contract

**All business failures return HTTP 200** with a body-level flag (`exists`, `authorized`, `status`) and an `errorCode`. The MCP server passes the body through as-is; the agent reads `errorCode` itself. Only network failures or non-JSON responses surface as MCP tool errors.

Entity IDs use business-code strings: `STORE-101`, `AREA-10`, `PROD-501`, `EMP-1001`.

---

### POST /api/login

```json
// Request
{ "username": "priya.k", "password": "***" }

// Response (success)
{ "token": "jwt-token" }

// Response (failure) — shape is an open gap; assumed to be 401 or body-level error
```

---

### GET /api/me

Token sent as `Authorization: Bearer <token>`.

```json
// Response (authorised)
{ "authorized": true, "employee_id": "EMP-1001", "employee_number": "1001",
  "name": "Priya K", "email": "priya.k@example.com", "assignedTo": "STORE-101" }

// Response (not authorised)
{ "authorized": false, "errorCode": "UNAUTHORIZED_MANAGER",
  "message": "Employee is not authorized for this store." }
```

`assignedTo` is the `storeId` used on every subsequent call. `employee_id` becomes `requestedBy` on zeroization requests.

---

### GET /api/validation/area/search

```
Query params: storeId=STORE-101&q=fridge
```

```json
{ "candidates": [
    { "areaId": "AREA-10", "areaName": "Refrigerator X", "storageType": "REFRIGERATOR" }
]}
```

---

### POST /api/validation/area

```json
// Request
{ "storeId": "STORE-101", "areaName": "Refrigerator X" }

// Response (found)
{ "exists": true, "areaId": "AREA-10", "storageType": "REFRIGERATOR" }

// Response (not found)
{ "exists": false, "errorCode": "AREA_NOT_FOUND", "message": "Area does not exist." }
```

---

### GET /api/validation/product/search

```
Query params: storeId=STORE-101&areaId=AREA-10&q=eggs
```

```json
{ "candidates": [
    { "productId": "PROD-501", "sku": "SKU-100501", "productName": "Eggs" }
]}
```

---

### POST /api/validation/product

Product existence is checked within the already-validated `areaId`, not store-wide.

```json
// Request
{ "storeId": "STORE-101", "areaId": "AREA-10", "productName": "Eggs" }

// Response (found)
{ "exists": true, "productId": "PROD-501", "sku": "SKU-100501" }

// Response (not found)
{ "exists": false, "errorCode": "PRODUCT_NOT_FOUND",
  "message": "Product does not exist in the specified area." }
```

---

### GET /api/stock

`productId` is optional. Without it, returns every product in the area (used by whole-area zeroization).

```
Query params (single): storeId=STORE-101&areaId=AREA-10&productId=PROD-501
Query params (area):   storeId=STORE-101&areaId=AREA-10
```

```json
// Single product
{ "storeId": "STORE-101", "areaId": "AREA-10", "productId": "PROD-501",
  "availableQuantity": 120, "unit": "BOX" }

// Single product, no stock (not an error — same shape, zero quantity)
{ "storeId": "STORE-101", "areaId": "AREA-10", "productId": "PROD-501",
  "availableQuantity": 0 }

// Whole area
{ "storeId": "STORE-101", "areaId": "AREA-10", "products": [
  { "productId": "PROD-501", "sku": "SKU-100501", "productName": "Eggs",
    "availableQuantity": 120, "unit": "BOX" },
  { "productId": "PROD-502", "sku": "SKU-100502", "productName": "Milk 1L",
    "availableQuantity": 40, "unit": "BOX" }
]}

// Whole area, nothing stocked (not an error — empty list)
{ "storeId": "STORE-101", "areaId": "AREA-10", "products": [] }
```

`availableQuantity` is what the agent echoes to the user for confirmation and what `quantity` on `create_zeroization` must equal exactly.

---

### POST /api/stock/zeroization

```json
// Request
{ "storeId": "STORE-101", "areaId": "AREA-10", "productId": "PROD-501",
  "quantity": 120, "reason": "SPOILED",
  "remarks": "Refrigerator damaged due to electrical power failure.",
  "requestedBy": "EMP-1001" }

// Response (success)
{ "zeroizationId": "ZERO-90001", "status": "SUCCESS",
  "transactionId": "TXN-88292", "message": "Stock successfully zeroized." }

// Response (failure)
{ "status": "FAILED", "errorCode": "ZEROIZATION_FAILED",
  "message": "Unable to create zeroization." }
```

`reason` is a fixed code mapped from the user's free text (e.g. `SPOILED`, `EXPIRED`, `POWER_FAILURE`). `remarks` carries the user's original wording. Full enum to be confirmed by Team B before Day 1 freeze.

---

### POST /api/stock/zeroization/area

One `reason`/`remarks` pair for the shared cause across the whole area. No per-product `quantity` — the server zeroes whatever `GET /api/stock` already reported.

```json
// Request
{ "storeId": "STORE-101", "areaId": "AREA-10", "reason": "POWER_FAILURE",
  "remarks": "Refrigerator lost power overnight.",
  "requestedBy": "EMP-1001" }

// Response (success)
{ "zeroizationId": "ZERO-90002", "status": "SUCCESS",
  "transactionId": "TXN-88300",
  "items": [
    { "productId": "PROD-501", "sku": "SKU-100501", "quantityZeroed": 120 },
    { "productId": "PROD-502", "sku": "SKU-100502", "quantityZeroed": 40 }
  ],
  "message": "Stock successfully zeroized for all products in area." }

// Response (failure)
{ "status": "FAILED", "errorCode": "ZEROIZATION_FAILED",
  "message": "Unable to create zeroization." }
```

## Database Schema

The in-memory repositories mirror this schema. Phase 5 swaps `InMemory*` implementations for JPA-backed ones without touching the API contract.

```sql
CREATE TABLE stores (
    store_id        BIGINT PRIMARY KEY,
    store_code      VARCHAR(20) UNIQUE NOT NULL,
    store_name      VARCHAR(100) NOT NULL,
    location        VARCHAR(255)
);

CREATE TABLE employees (
    employee_id     BIGINT PRIMARY KEY,
    employee_number VARCHAR(20) UNIQUE NOT NULL,
    first_name      VARCHAR(50),
    last_name       VARCHAR(50),
    email           VARCHAR(100)
);

CREATE TABLE store_manager_assignment (
    assignment_id   BIGINT PRIMARY KEY,
    store_id        BIGINT NOT NULL REFERENCES stores(store_id),
    employee_id     BIGINT NOT NULL REFERENCES employees(employee_id),
    start_date      DATE NOT NULL,
    end_date        DATE
);

CREATE TABLE areas (
    area_id         BIGINT PRIMARY KEY,
    store_id        BIGINT NOT NULL REFERENCES stores(store_id),
    area_name       VARCHAR(100) NOT NULL,
    description     TEXT
);

CREATE TABLE products (
    product_id      BIGINT PRIMARY KEY,
    sku             VARCHAR(30) UNIQUE NOT NULL,
    product_name    VARCHAR(255) NOT NULL,
    category        VARCHAR(100)
);

CREATE TABLE area_products (
    area_id         BIGINT NOT NULL REFERENCES areas(area_id),
    product_id      BIGINT NOT NULL REFERENCES products(product_id),
    PRIMARY KEY (area_id, product_id)
);
```

## Logging

Logging is a **real implementation, not mocked** — structured JSON logs are written from day one even though the APIs themselves are mocked. Every event is correlated by a `correlation_id` minted by the Node backend at the start of each session.

**Node logs:** `session_started`, `tool_call_invoked` (token redacted), `tool_call_result`, `agent_reply_sent`, `session_ended`, errors.

**Java logs:** `auth_attempt` (password never logged), `validation_performed`, `zeroisation_submitted` (who/what/`request_id`), `kafka_event_published` (topic + payload summary).

Output to stdout in Phase 1. Schema is production-shaped so pointing it at a real aggregation pipeline later is a config change, not a rewrite.
