# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Stock Correction Chatbot Agent** — a conversational interface for store managers, store associates, and admins to perform stock corrections: **Zeroisation** (writing off damaged/expired/spoiled stock entirely, Manager-only) and **Stock Adjustment** (reducing a product's on-hand quantity by a partial amount, available to both Managers and Associates — Associates may not reduce a product to exactly 0 through this path; that requires a Manager's Zeroisation). Store-to-Store Transfer has a Java-service-level implementation now (`transfer-service`, see below), but is still not reachable through the chat agent — no MCP tool exists for it, and the system prompt still declines it as out of scope. A third role, **Admin**, uses the same conversational interface to view the manager/associate roster (system-wide, no store assignment of its own) and to set each associate's **stock-adjustment threshold** — a per-product, depleting percentage quota that caps how much of a product's on-hand quantity that associate may adjust in total; Admin is structurally barred from Zeroisation, Stock Adjustment, and Transfer.

Three components must run together:

| Component | Dir | Description |
|---|---|---|
| Java mock backend | `services/` | 4 independent Spring Boot apps (auth, validation, stock, transfer), each with hardcoded in-memory data — no database, no repository layer |
| MCP server | `mcp/` | Node.js/Express server exposing two MCP servers over **SSE** (`/validation`, `/stock`), proxying to the Java backend |
| Chat app | `simple-chatapp/` | React + Express + WebSocket UI with Claude Agent SDK |

## Commands

### Java backend (run once; all other services depend on it)

```bash
cd services
docker-compose up --build   # starts auth/validation/stock/transfer + nginx gateway
```

The gateway is the only container that publishes a host port: **`http://localhost:8080`** (see `services/docker-compose.yml` — `api-gateway` maps `8080:80`). The three backend containers aren't reachable directly in this mode. `mcp/.env.example` and `simple-chatapp/server/.env` already default their base URLs to `:8080`, matching this gateway port. Inside the root `docker-compose.yml`, `mcp` and `chatapp` instead point at the container network name (`http://api-gateway:80`) rather than the host port — see "Environment variables" below.

Or run each service individually with Gradle, hitting each port directly (no gateway):
```bash
cd services
./gradlew :auth-service:bootRun        # :8081
./gradlew :validation-service:bootRun  # :8082
./gradlew :stock-service:bootRun       # :8083
./gradlew :transfer-service:bootRun    # :8084
```
Test a single service: `./gradlew :auth-service:test` (note: no test sources currently exist under any service — the task runs but has nothing to execute).

There's no shared database between services — `validation-service` and `stock-service` each hardcode their own copy of the same store/area/product IDs (`MockValidationData`/`MockStockData`). Keep those in sync by hand if you add mock data. `transfer-service` hardcodes its own, smaller copy too (`MockStoreData`, just the set of recognized store IDs) — see "Store-to-Store Transfer" below.

### MCP server (build before starting the chat app)

```bash
cd mcp
npm install
npm run build        # tsc → build/index.js
npm run dev          # tsx src/index.ts directly (no build step)
npm start            # node build/index.js
```
No test or lint script is defined.

### Chat app

`client/` and `server/` are independent packages — install and run each
separately, in two terminals:

```bash
cd simple-chatapp/server
cp .env.example .env   # set ANTHROPIC_API_KEY
npm install
npm run dev             # starts Express on :3001
```

```bash
cd simple-chatapp/client
npm install
npm run dev             # starts Vite on :5173
```
No test or lint script is defined; there is no test suite anywhere in this repo.

Visit http://localhost:5173. Log in with a seeded store manager account (see "Test accounts" below) before the chat UI appears.

## Architecture

```
Browser (React/Vite :5173)
    ↕ REST + WebSocket
Express server (:3001, server/main.ts → src/app.ts + src/ws-server.ts)
    ├── POST /api/auth/login → calls Java auth-service directly (not via agent)
    └── WebSocket → AgentSession (Claude Agent SDK, src/models/agent-session.ts)
                        ↕ SSE (2 MCP clients, a token header carries identity per-request)
                    mcp/src/index.ts (Express, PORT default 3000)
                        ├── GET/POST /validation → validation-mcp
                        └── GET/POST /stock      → stock-mcp
                                ↕ HTTP
                            nginx gateway (:8080 in docker-compose; :8081-8084 direct)
                                ├── auth-service
                                ├── validation-service
                                ├── stock-service
                                └── transfer-service (not called by the agent/MCP layer yet — see "Store-to-Store Transfer" below)
```

### Key design decisions

**Login is server-side, not agent-driven.** `server/src/app.ts` calls `POST /api/login` + `GET /api/me` directly and returns the resulting `LoginIdentity` (`token`, `employeeId`, `storeId`, `role`, `name`, etc.) to the client, which sends it with every `POST /api/chats` call. `models/chat-store.ts` persists it on the `Chat` record; `models/session.ts` reads it back to construct that chat's `AgentSession`. The agent never sees credentials and never calls `authenticate_user`/`get_user_details` (those tools exist on the MCP server but are excluded from `allowedTools`).

**Session identity reaches the MCP server via a single SSE header, not env vars or spawn args.** `models/agent-session.ts` passes only `x-session-token` as a header on the SSE `mcpServers` config for both `validation-mcp` and `stock-mcp` — `storeId`/`employeeId`/`role` are no longer forwarded as separate headers; the Java backend derives them itself from the token (see below). `mcp/src/index.ts` reads that header per-request in the `POST /validation/messages` and `POST /stock/messages` handlers and runs the tool call inside `sessionContext.run(...)` (`AsyncLocalStorage`, `mcp/src/context.ts`) — the MCP server itself is stateless across calls; identity is per-request, not per-process.

**RBAC is enforced authoritatively in `stock-service`, not the MCP server — and additionally short-circuited client-side in the chat app.** `validation-service` and `stock-service` each run a `TokenAuthFilter` that verifies the incoming bearer token against a new `GET /api/auth/verify` on `auth-service` on every request, and attach the resulting `{employeeId, storeId, role}` as request attributes — `storeId`/`role`/`requestedBy*` are never accepted as request params/body fields anymore. `StockController`'s `createZeroization`/`createAreaZeroization` return the `FORBIDDEN_ROLE` business-failure JSON if the verified role isn't `STORE_MANAGER`; this remains the real security boundary. `createAdjustment` is role-inclusive instead — it accepts `STORE_MANAGER` and `STORE_ASSOCIATE` alike, but applies its own authoritative quantity floor: it computes `resultingQuantity = currentQuantity - requestedQuantity`, rejects with `ADJUSTMENT_EXCEEDS_AVAILABLE` if that would be negative (either role), and additionally rejects with `ZERO_ADJUSTMENT_REQUIRES_MANAGER` if it would be exactly 0 and the verified role is `STORE_ASSOCIATE` (Managers are exempt from that last check). This floor can't be expressed as a static tool-list gate the way `create_zeroization` is, since it depends on the item's live quantity, not just the caller's role. The MCP server itself has no role-checking logic of its own — read-only tools (`get_stock`, everything on validation-mcp) go through the same token-verification filter but have no additional role gate. On top of that, `simple-chatapp/server/src/models/agent-session.ts` hard-excludes `create_zeroization`/`create_area_zeroization` from `allowedTools` for any non-`STORE_MANAGER` session (via `getAllowedToolsForRole` in `ai-client.ts`), and the system prompt's `<intent_classification>` block tells the agent to decline a zeroisation-execution request from its own role check before calling any tool at all — both are UX/defense-in-depth measures on top of the backend check, not a substitute for it. `create_adjustment` stays in `allowedTools` for both `STORE_MANAGER` and `STORE_ASSOCIATE` sessions, and the system prompt's `<adjustment_workflow>` block has the agent compute the resulting quantity via `get_stock` and pre-emptively decline an Associate's would-be-zero request before calling the tool — again UX/defense-in-depth on top of the backend's own `ZERO_ADJUSTMENT_REQUIRES_MANAGER` check.

**Admin is a third role with no stock-mutation capability at all, and a per-associate, per-product depleting threshold authoritatively caps Associate adjustments.** `getAllowedToolsForRole` returns an entirely separate 3-tool set for `role === "ADMIN"` (`list_store_managers`, `list_store_associates`, `set_associate_threshold` — all on a third MCP server, `admin-mcp`) and none of the read-only/write/adjustment tools — this omission, not a role check, is what makes Admin structurally incapable of zeroisation, adjustment, or transfer, regardless of prompt phrasing. `list_store_managers`/`list_store_associates` proxy to two new `auth-service` endpoints (`GET /api/auth/managers`, `GET /api/auth/associates`), and `set_associate_threshold` proxies to `PATCH /api/auth/associates/{employeeId}/threshold` — all three resolve the caller's identity the same manual way `GET /api/me` already does (`auth-service` has no `TokenAuthFilter` of its own; it's the identity source of truth) and gate on `role == "ADMIN"`, returning `FORBIDDEN_ROLE` otherwise. An associate's threshold (`MockThresholdData` in `auth-service`, seeded per associate) behaves as a depleting quota, not a per-request cap, tracked separately for each product via a new `MockAdjustmentUsage` ledger in `stock-service`: `GET /api/auth/verify` now also returns `thresholdPercent` for `STORE_ASSOCIATE` callers, `TokenAuthFilter` threads it into a new `ATTR_THRESHOLD` request attribute, and `StockController.createAdjustment` checks the requested reduction (as a percentage of the product's current on-hand quantity) against the associate's remaining balance for that specific product before applying it, returning a new `ADJUSTMENT_EXCEEDS_THRESHOLD` failure if it would exceed what's left. `STORE_MANAGER` is exempt from this check entirely. Admin's own `/api/me` call is exempt from the `UNAUTHORIZED_MANAGER` gate that otherwise requires an `assignedTo` store — Admin is deliberately storeless (system-wide), unlike the storeless-Associate test case (`sam.t`) that gate still protects against. See `specs/002-admin-role/` for the full design.

**Store-to-Store Transfer is a Java-service-level feature: request creation only, no destination-side crediting yet.** A new `transfer-service` (port `8084`) exposes `POST /transfer`, manager-only, taking a `fromStoreId` (must match the caller's verified store — never trusted as-is from the body), a `toStoreId`, and one or more product lines (`productId`, source `areaId`, `requestedQuantity`). Whole-request rejections (`FORBIDDEN_ROLE`, `CROSS_STORE_FORBIDDEN`, `INVALID_DESTINATION_STORE`, `EMPTY_PRODUCT_LIST`) happen before anything is created; otherwise each product line is evaluated independently (best-effort, not all-or-nothing) and immediately reserved against the source store's real stock via a new **internal** `stock-service` endpoint, `POST /api/stock/transfer-reserve` — not exposed through the nginx gateway, called service-to-service the same way `stock-service` itself calls `auth-service`'s `GET /api/auth/verify`, and forwarding the caller's original bearer token so `stock-service` re-verifies the role itself rather than trusting `transfer-service`'s own check. This keeps `stock-service` the single authoritative owner of stock quantities — `transfer-service` has no copy of stock data, only its own bookkeeping of created requests (`MockTransferData`). A line's status is one of `IN_PROGRESS` (reserved) or `FAILURE` (rejected, stock untouched); `TRANSFERRED` is part of the status vocabulary but unreachable until a future phase adds destination-area assignment and approval. See `specs/001-store-transfer-request/` for the full design — note that `spec.md`/`plan.md`/etc. in that directory follow a numbered-file reading order per `.specify/memory/constitution.md`'s Numbered Spec Artifact Ordering principle (`00-plan.md`, `01-research.md`, ...).

**Agent model:** `claude-sonnet-5` (set in `simple-chatapp/server/src/models/agent-session.ts`).

**Allowed tools** (`ALLOWED_MCP_TOOLS` in `ai-client.ts`, 9 total): `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product`, `list_areas` (validation-mcp) and `get_stock`, `create_zeroization`, `create_area_zeroization`, `create_adjustment` (stock-mcp). `list_areas` returns every area in the caller's store with no params — for "what areas exist" questions, bypassing fuzzy-search-then-validate. `agent-session.ts` doesn't pass this list directly — `getAllowedToolsForRole(identity?.role)` returns the full 9 for `STORE_MANAGER` sessions, the 6 read-only tools plus `create_adjustment` for `STORE_ASSOCIATE` sessions (dropping `create_zeroization`/`create_area_zeroization`, which stay Manager-only), an entirely separate 3-tool set (`list_store_managers`, `list_store_associates`, `set_associate_threshold`, all on a third MCP server, `admin-mcp`) for `ADMIN` sessions, and only the 6 read-only tools for anyone else, including no-identity sessions. `create_adjustment`'s own per-role quantity floor (an Associate's request can't reduce a product to exactly 0) is enforced authoritatively by `StockController.java`, not by this tool-list gate — see "RBAC is enforced authoritatively in `stock-service`" below. Same for the per-associate, per-product depleting adjustment threshold (also enforced in `StockController.java`) — see "Admin is a third role" above.

**Fuzzy search before exact validation.** The system prompt instructs the agent to call `search_areas_fuzzy`/`search_products_fuzzy` first to get candidates, disambiguate with the user if there are multiple, then call `validate_area`/`validate_product`.

**Business failures are HTTP 200 bodies.** The backend returns `{ exists: false, errorCode: "AREA_NOT_FOUND" }` — not 4xx. `mcp/src/toolResult.ts` passes the body through as-is so the agent reads `exists`/`authorized`/`status`/`errorCode` fields itself. Only network failures surface as MCP tool errors.

**Quantity always comes from `get_stock`.** The agent is never allowed to accept a quantity from the user — enforced by the system prompt and by `create_zeroization`'s schema.

## Java backend structure

`services/` is a Gradle multi-project build (`auth-service`, `validation-service`, `stock-service`, `transfer-service`), Java 21. Each service is plain controllers over a hardcoded static `Mock*Data` list — there is no repository/service layering and no database in Phase 1. Entity IDs are business-code strings (`STORE-101`, `AREA-10`, `PROD-501`, `EMP-1001`).

### Test accounts (`MockAuthData.java`, all password `password123`)

| username | role | assigned store | exercises |
|---|---|---|---|
| `priya.k` | STORE_MANAGER | STORE-101 | happy path |
| `raj.kumar` | STORE_MANAGER | STORE-102 | happy path, different store's data |
| `sam.t` | STORE_ASSOCIATE | *(none)* | `UNAUTHORIZED_MANAGER` at login (`GET /api/me`) |
| `alex.w` | STORE_ASSOCIATE | STORE-101 | passes login; hits `FORBIDDEN_ROLE` on zeroisation tools, but can use `create_adjustment` (subject to `ZERO_ADJUSTMENT_REQUIRES_MANAGER` if the request would zero the product out, and `ADJUSTMENT_EXCEEDS_THRESHOLD` per its Admin-set threshold — seeded at 5%) |
| `morgan.l` | STORE_ASSOCIATE | STORE-102 | second real associate (seeded threshold 12%), for exercising per-associate threshold independence |
| `admin.a` | ADMIN | *(none — system-wide)* | passes login despite having no `assignedTo` (Admin is exempt from the `UNAUTHORIZED_MANAGER` gate, unlike `sam.t`); can list managers/associates and set an associate's threshold; structurally cannot call any zeroisation/adjustment/validation tool |

## Environment variables

**`simple-chatapp/server/.env`** (from `server/.env.example`):
- `ANTHROPIC_API_KEY` — required
- `STOCK_API_BASE_URL` — defaults to `http://localhost:8080` (the nginx gateway)
- `PORT` — optional, defaults to 3001

**`mcp/.env`**: `API_BASE_URL` (default `http://localhost:8080` in `.env.example` — same port note applies), `PORT` (default 3000). In `docker-compose.yml` at repo root, `API_BASE_URL` and `MCP_HOST` are set to the container network names (`api-gateway:80`, `mcp:3000`) rather than these host defaults.

**Root `.env`** (from `.env.example`): only read by `docker-compose` itself, for `${...}` substitution in `docker-compose.yml` — not by any service directly.
- `ANTHROPIC_API_KEY` — required; substituted into the `chatapp` container's env at runtime (not baked into the image)
- `COMPOSE_PARALLEL_LIMIT` — optional, caps concurrent service builds

See [`docs/running-in-production.md`](docs/running-in-production.md) for the full docker-compose walkthrough.

## Planning docs

`docs/phase-1/` has the Phase 1 spec docs — `design_spec.md` (end-to-end flow, intent-recognition rules, fuzzy-before-validate) is accurate and matches the current implementation. `technical_spec.md` predates the SSE migration and still describes the MCP server as stdio-based — don't trust its transport description. `implementation_spec.md` describes `node-ci.yml`/`java-ci.yml`/`e2e.yml` CI workflows that were never built — there's no `.github/` directory anywhere in the repo — so don't trust its CI/process claims either. `specs/001-mcp-http-migration/` is the (completed) spec for that stdio→SSE migration; useful as history, but its file-naming placeholders (`server.js`, `mcp-server-1.js`/`2.js`) don't match the real files (`index.ts`, `mcp-server-validation.ts`, `mcp-server-stock.ts`).

`simple-chatapp/CLAUDE.md` has chat-app-internal notes (identity flow, system prompt structure, per-file breakdown of `server/src/`) and is accurate and up to date — safe to rely on for chat-app implementation detail beyond what's summarized here.
