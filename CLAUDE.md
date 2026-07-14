# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Stock Correction Chatbot Agent** — a conversational interface for store managers to perform stock zeroisation (writing off damaged/expired/spoiled stock). Phase 1 scope is Zeroisation only; Waste Adjustment and Store-to-Store Transfer are out of scope (mentioned in the system prompt as intents to politely decline, but no backend/tool support exists for either).

Three components must run together:

| Component | Dir | Description |
|---|---|---|
| Java mock backend | `services/` | 3 independent Spring Boot apps (auth, validation, stock), each with hardcoded in-memory data — no database, no repository layer |
| MCP server | `mcp/` | Node.js/Express server exposing two MCP servers over **SSE** (`/validation`, `/stock`), proxying to the Java backend |
| Chat app | `simple-chatapp/` | React + Express + WebSocket UI with Claude Agent SDK |

## Commands

### Java backend (run once; all other services depend on it)

```bash
cd services
docker-compose up --build   # starts auth/validation/stock + nginx gateway
```

The gateway is the only container that publishes a host port: **`http://localhost:8080`** (see `services/docker-compose.yml` — `api-gateway` maps `8080:80`). The three backend containers aren't reachable directly in this mode. `mcp/.env.example` and `simple-chatapp/server/.env` already default their base URLs to `:8080`, matching this gateway port. Inside the root `docker-compose.yml`, `mcp` and `chatapp` instead point at the container network name (`http://api-gateway:80`) rather than the host port — see "Environment variables" below.

Or run each service individually with Gradle, hitting each port directly (no gateway):
```bash
cd services
./gradlew :auth-service:bootRun        # :8081
./gradlew :validation-service:bootRun  # :8082
./gradlew :stock-service:bootRun       # :8083
```
Test a single service: `./gradlew :auth-service:test` (note: no test sources currently exist under any service — the task runs but has nothing to execute).

There's no shared database between services — `validation-service` and `stock-service` each hardcode their own copy of the same store/area/product IDs (`MockValidationData`/`MockStockData`). Keep those in sync by hand if you add mock data.

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
    └── WebSocket → AgentSession (Claude Agent SDK, src/ai-client.ts)
                        ↕ SSE (2 MCP clients, headers carry identity per-request)
                    mcp/src/index.ts (Express, PORT default 3000)
                        ├── GET/POST /validation → validation-mcp
                        └── GET/POST /stock      → stock-mcp
                                ↕ HTTP
                            nginx gateway (:8080 in docker-compose; :8081-8083 direct)
                                ├── auth-service
                                ├── validation-service
                                └── stock-service
```

### Key design decisions

**Login is server-side, not agent-driven.** `server/src/app.ts` calls `POST /api/login` + `GET /api/me` directly and returns the resulting `LoginIdentity` (`token`, `employeeId`, `storeId`, `role`, `name`, etc.) to the client, which sends it with every `POST /api/chats` call. `chat-store.ts` persists it on the `Chat` record; `session.ts` reads it back to construct that chat's `AgentSession`. The agent never sees credentials and never calls `authenticate_user`/`get_user_details` (those tools exist on the MCP server but are excluded from `allowedTools`).

**Session identity reaches the MCP server via SSE headers, not env vars or spawn args.** `ai-client.ts` passes `x-session-token` / `x-session-store-id` / `x-session-employee-id` (both servers) and `x-session-employee-role` (stock-mcp only) as headers on the SSE `mcpServers` config. `mcp/src/index.ts` reads these per-request in the `POST /validation/messages` and `POST /stock/messages` handlers and runs the tool call inside `sessionContext.run(...)` (`AsyncLocalStorage`, `mcp/src/context.ts`) — the MCP server itself is stateless across calls; identity is per-request, not per-process.

**RBAC: only the two zeroisation-write tools are role-gated.** `create_zeroization` and `create_area_zeroization` (in `mcp-server-stock.ts`) call `getSessionRole()` and immediately return a `FORBIDDEN_ROLE` business-failure JSON if `role !== "STORE_MANAGER"`, before ever calling the backend. Read-only tools (`get_stock`, everything on validation-mcp) are not gated.

**Agent model:** `claude-sonnet-5` (set in `simple-chatapp/server/src/ai-client.ts`).

**Allowed tools** (`ALLOWED_MCP_TOOLS` in `ai-client.ts`, 7 total): `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product` (validation-mcp) and `get_stock`, `create_zeroization`, `create_area_zeroization` (stock-mcp).

**Fuzzy search before exact validation.** The system prompt instructs the agent to call `search_areas_fuzzy`/`search_products_fuzzy` first to get candidates, disambiguate with the user if there are multiple, then call `validate_area`/`validate_product`.

**Business failures are HTTP 200 bodies.** The backend returns `{ exists: false, errorCode: "AREA_NOT_FOUND" }` — not 4xx. `mcp/src/toolResult.ts` passes the body through as-is so the agent reads `exists`/`authorized`/`status`/`errorCode` fields itself. Only network failures surface as MCP tool errors.

**Quantity always comes from `get_stock`.** The agent is never allowed to accept a quantity from the user — enforced by the system prompt and by `create_zeroization`'s schema.

## Java backend structure

`services/` is a Gradle multi-project build (`auth-service`, `validation-service`, `stock-service`), Java 21. Each service is plain controllers over a hardcoded static `Mock*Data` list — there is no repository/service layering and no database in Phase 1. Entity IDs are business-code strings (`STORE-101`, `AREA-10`, `PROD-501`, `EMP-1001`).

### Test accounts (`MockAuthData.java`, all password `password123`)

| username | role | assigned store | exercises |
|---|---|---|---|
| `priya.k` | STORE_MANAGER | STORE-101 | happy path |
| `raj.kumar` | STORE_MANAGER | STORE-102 | happy path, different store's data |
| `sam.t` | STORE_ASSOCIATE | *(none)* | `UNAUTHORIZED_MANAGER` at login (`GET /api/me`) |
| `alex.w` | STORE_ASSOCIATE | STORE-101 | passes login, but hits `FORBIDDEN_ROLE` on zeroisation tools |

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
