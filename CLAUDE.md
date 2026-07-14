# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Stock Correction Chatbot Agent** — a conversational interface for store managers to perform stock zeroisation (writing off damaged/expired/spoiled stock). Phase 1 scope is Zeroisation only; Waste Adjustment and Store-to-Store Transfer are scoped to phase 2 and 3.

Three components must run together:

| Component | Dir | Description |
|---|---|---|
| Java mock backend | `services/` | Spring Boot (auth + validation + stock), behind nginx |
| MCP server | `mcp/` | Node.js stdio MCP server proxying the 7 Phase 1 tools to the backend |
| Chat app | `simple-chatapp/` | React + Express + WebSocket UI with Claude Agent SDK |

## Commands

### Java backend (run once; all other services depend on it)

```bash
cd services
docker-compose up --build   # recommended: starts auth:8081, validation:8082, stock:8083 behind nginx:8080
```

Or run each service individually with Gradle:
```bash
./gradlew :auth-service:bootRun
./gradlew :validation-service:bootRun
./gradlew :stock-service:bootRun
```

### MCP server (build before starting the chat app)

```bash
cd mcp
npm install
npm run build        # compiles TypeScript → build/index.js
# npm run dev        # tsx direct (no build step, for development)
```

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

Visit http://localhost:5173. Log in with a seeded store manager account before the chat UI appears.

## Architecture

```
Browser (React/Vite :5173)
    ↕ REST + WebSocket
Express server (:3001)
    ├── POST /api/auth/login → calls Java auth-service directly (not via agent)
    └── WebSocket → AgentSession (Claude Agent SDK)
                        ↕ stdio MCP
                    MCP server (mcp/build/index.js)
                        ↕ HTTP
                    nginx gateway (:8080)
                        ├── auth-service (:8081)
                        ├── validation-service (:8082)
                        └── stock-service (:8083)
```

### Key design decisions

**Login is server-side, not agent-driven.** `server.ts` calls `POST /api/login` + `GET /api/me` directly and stores the resulting `LoginIdentity` (`token`, `employeeId`, `storeId`, `name`, etc.) on the `Chat` record. The agent never sees credentials and never calls `authenticate_user`/`get_user_details`.

**Session identity reaches the MCP subprocess via env vars.** `ai-client.ts` spawns `mcp/build/index.js` with `SESSION_TOKEN`, `SESSION_STORE_ID`, and `SESSION_EMPLOYEE_ID` set. Every MCP tool reads these from `process.env` — the agent passes no auth params itself, and the MCP server is stateless across tool calls within a session.

**Agent model:** `claude-sonnet-5` (set in `simple-chatapp/server/src/ai-client.ts`).

**Allowed tools** (from `ai-client.ts` `ALLOWED_MCP_TOOLS`): `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product`, `get_stock`, `create_zeroization`, `create_area_zeroization`. Auth tools are excluded — login already happened.

**Fuzzy search before exact validation.** The current tool set includes `search_areas_fuzzy` and `search_products_fuzzy` (beyond the 7 in the original plan). The system prompt instructs the agent to call fuzzy search first to get candidates, then disambiguate before calling `validate_area`/`validate_product`.

**Business failures are HTTP 200 bodies.** The backend returns `{ exists: false, errorCode: "AREA_NOT_FOUND" }` — not 4xx. `mcp/src/toolResult.ts` passes the body through as-is so the agent reads the `exists`/`authorized`/`status`/`errorCode` fields itself. Only network failures surface as MCP tool errors.

**Quantity always comes from `get_stock`.** The agent is never allowed to accept a quantity from the user. The `create_zeroization` schema and system prompt both enforce this.

## Java backend structure

`services/` is a Gradle multi-project build (`auth-service`, `validation-service`, `stock-service`). Each is a standalone Spring Boot app using the repository-interface pattern — `InMemory*` implementations now, JPA-backed in Phase 5. Entity IDs are business-code strings (`STORE-101`, `AREA-10`, `PROD-501`, `EMP-1001`).

## Environment variables

**`simple-chatapp/server/.env`** (from `server/.env.example`):
- `ANTHROPIC_API_KEY` — required
- `STOCK_API_BASE_URL` — defaults to `http://localhost:8080` (the nginx gateway)
- `PORT` — optional, defaults to 3001

**`mcp/`** — `API_BASE_URL` is injected at spawn time by `ai-client.ts`; do not set it in a `.env` for the MCP server.

## Planning docs

`phase-1/` contains the frozen spec for this sprint:
- `01_phase_1_plan.md` — end-to-end flow, whole-area zeroisation, intent recognition rules
- `03_tech_stack.md` — Node/Java stack rationale, repository-interface pattern
- `05_api-contract.md` — frozen REST shapes for all 7 endpoints
- `04_planner-and-memory.md` — Planner/Memory/ToolExecutor design

`simple-chatapp/CLAUDE.md` has detailed notes on the chat app's internals (login flow, WebSocket protocol, component structure).
