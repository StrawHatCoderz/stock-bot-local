# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **Stock Correction Chatbot Agent** — a conversational interface for store managers, store associates, and admins to perform stock corrections: **Zeroisation** (writing off damaged/expired/spoiled stock entirely, Manager-only), **Stock Adjustment** (reducing a product's on-hand quantity by a partial amount, available to both Managers and Associates — Associates may not reduce a product to exactly 0 through this path; that requires a Manager's Zeroisation), and **Store-to-Store Transfer** (Manager-only: create a transfer request, list outgoing/incoming requests, and approve an incoming request, which credits the destination store's stock — reachable end to end through the chat agent, not just at the Java-service/MCP level). A third role, **Admin**, uses the same conversational interface to view the manager/associate roster (system-wide, no store assignment of its own) and to set each associate's **stock-adjustment threshold** — a per-product, depleting percentage quota that caps how much of a product's on-hand quantity that associate may adjust in total; Admin is structurally barred from Zeroisation, Stock Adjustment, and Transfer.

Three components must run together:

| Component | Dir | Description |
|---|---|---|
| Java mock backend | `services/` | 4 independent Spring Boot apps (auth, validation, stock, transfer), each with hardcoded in-memory data — no database, no repository layer |
| MCP server | `mcp/` | Node.js/Express server exposing four MCP servers over **SSE** (`/validation`, `/stock`, `/admin`, `/transfer`), proxying to the Java backend |
| Chat app | `simple-chatapp/` | React + Express + WebSocket UI with Claude Agent SDK |

## Commands

### Java backend (run once; all other services depend on it)

```bash
cd services
docker-compose up --build   # starts auth/validation/stock/transfer + nginx gateway
```

The gateway is the only container that publishes a host port: **`http://localhost:8080`** (see `services/docker-compose.yml` — `api-gateway` maps `8080:80`). The four backend containers aren't reachable directly in this mode. `mcp/.env.example` and `simple-chatapp/server/.env` already default their base URLs to `:8080`, matching this gateway port. Inside the root `docker-compose.yml`, `mcp` and `chatapp` instead point at the container network name (`http://api-gateway:80`) rather than the host port — see "Environment variables" below.

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
npm run build        # tsc → build/main.js
npm run dev          # tsx main.ts directly (no build step)
npm start            # node build/main.js
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
                        ↕ SSE (4 MCP clients configured — validation-mcp, stock-mcp, admin-mcp, transfer-mcp; a token header carries identity per-request)
                    mcp/main.ts → src/app.ts (Express, PORT default 3000)
                        ├── GET/POST /validation → validation-mcp
                        ├── GET/POST /stock      → stock-mcp
                        ├── GET/POST /admin      → admin-mcp
                        └── GET/POST /transfer   → transfer-mcp (in agent-session.ts's client config — see "Store-to-Store Transfer" below)
                                ↕ HTTP
                            nginx gateway (:8080 in docker-compose; :8081-8084 direct)
                                ├── auth-service
                                ├── validation-service
                                ├── stock-service
                                └── transfer-service
```

### Key design decisions

Full rationale for each of these lives in [`ARCHITECTURE.md`](ARCHITECTURE.md) — read it before making a non-trivial change in the area it covers; the summaries below are just enough to orient.

- **Login is server-side, not agent-driven.** The agent never sees credentials and never calls `authenticate_user`/`get_user_details`.
- **Session identity reaches the MCP server via a single SSE header** (`x-session-token`), not env vars or spawn args — the MCP server is stateless across calls.
- **RBAC is enforced authoritatively in `stock-service`** (a `TokenAuthFilter` re-verifies the bearer token itself), not the MCP server — the chat app's tool-list exclusions and system-prompt role checks are defense-in-depth on top of that, never a substitute for it.
- **Admin is a third role with no stock-mutation capability at all** — a disjoint 3-tool set, not a role check, is what makes this structurally true. A per-associate, per-product depleting threshold (`MockAdjustmentUsage`) authoritatively caps Associate adjustments.
- **Store-to-Store Transfer covers creation, listing, and approval end to end** — approving credits the destination store's real stock (`stock-service`'s `transfer-credit`, find-or-create), gated so only the destination store's own manager can approve.

**Agent model:** `claude-sonnet-5` (set in `simple-chatapp/server/src/models/agent-session.ts`).

**Allowed tools**: `ai-client.ts`'s `TOOL_GROUPS`/`ROLE_TOOLS` gate which of the 18 MCP tools each role's session can invoke — a hard, code-level gate the SDK enforces regardless of what the model decides. Full role × tool table in [`ARCHITECTURE.md`](ARCHITECTURE.md#role--tool-access).

**Fuzzy search before exact validation.** The system prompt instructs the agent to call `search_areas_fuzzy`/`search_products_fuzzy` first to get candidates, disambiguate with the user if there are multiple, then call `validate_area`/`validate_product`.

**Business failures are HTTP 200 bodies.** The backend returns `{ exists: false, errorCode: "AREA_NOT_FOUND" }` — not 4xx. `mcp/src/toolResult.ts` passes the body through as-is so the agent reads `exists`/`authorized`/`status`/`errorCode` fields itself. Only network failures surface as MCP tool errors.

**Quantity always comes from `get_stock`.** The agent is never allowed to accept a quantity from the user — enforced by the system prompt and by `create_zeroization`'s schema.

## Java backend structure

`services/` is a Gradle multi-project build (`auth-service`, `validation-service`, `stock-service`, `transfer-service`), Java 21. Each service is plain controllers over a hardcoded static `Mock*Data` list — there is no repository/service layering and no database in Phase 1. Entity IDs are business-code strings (`STORE-101`, `AREA-10`, `PROD-501`, `EMP-1001`).

### Test accounts (`MockAuthData.java`, all password `password123`)

| username | role | assigned store | exercises |
|---|---|---|---|
| `user001` | STORE_MANAGER | STORE-101 | happy path |
| `user002` | STORE_MANAGER | STORE-102 | happy path, different store's data |
| `user003` | STORE_ASSOCIATE | *(none)* | `UNAUTHORIZED_MANAGER` at login (`GET /api/me`) |
| `user004` | STORE_ASSOCIATE | STORE-101 | passes login; hits `FORBIDDEN_ROLE` on zeroisation tools, but can use `create_adjustment` (subject to `ZERO_ADJUSTMENT_REQUIRES_MANAGER` if the request would zero the product out, and `ADJUSTMENT_EXCEEDS_THRESHOLD` per its Admin-set threshold — seeded at 5%) |
| `user005` | STORE_ASSOCIATE | STORE-102 | second real associate (seeded threshold 12%), for exercising per-associate threshold independence |
| `user006` | ADMIN | *(none — system-wide)* | passes login despite having no `assignedTo` (Admin is exempt from the `UNAUTHORIZED_MANAGER` gate, unlike `user003`); can list managers/associates and set an associate's threshold; structurally cannot call any zeroisation/adjustment/validation tool |

## Environment variables

**`simple-chatapp/server/.env`** (from `server/.env.example`):
- `ANTHROPIC_API_KEY` — required
- `STOCK_API_BASE_URL` — defaults to `http://localhost:8080` (the nginx gateway)
- `PORT` — optional, defaults to 3001

**`mcp/.env`**: `API_BASE_URL` (default `http://localhost:8080` in `.env.example` — same port note applies), `PORT` (default 3000). In `docker-compose.yml` at repo root, `API_BASE_URL` and `MCP_HOST` are set to the container network names (`api-gateway:80`, `mcp:3000`) rather than these host defaults.

**Root `.env`** (from `.env.example`): only read by `docker-compose` itself, for `${...}` substitution in `docker-compose.yml` — not by any service directly.
- `ANTHROPIC_API_KEY` — required; substituted into the `chatapp` container's env at runtime (not baked into the image)
- `COMPOSE_PARALLEL_LIMIT` — optional, caps concurrent service builds

## Documentation map

This file is agent-operating guidance only — commands, conventions, and
gotchas. It intentionally does not hold architecture narrative. For that:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the single source of truth for
  cross-component design decisions (identity flow, RBAC, Transfer
  lifecycle, system prompt structure), with diagrams.
- [`README.md`](README.md), [`services/README.md`](services/README.md),
  [`mcp/README.md`](mcp/README.md), [`simple-chatapp/README.md`](simple-chatapp/README.md)
  — lightweight, per-component setup/usage docs.
- `simple-chatapp/CLAUDE.md` — the same kind of agent-operating guidance as
  this file, scoped to the chat app.

`specs/NNN-feature-name/` directories (speckit output) and `docs/` are both
gitignored in this repo — they may not exist in every checkout, and their
absence doesn't mean anything is missing from the tracked docs above. Don't
treat a stale or missing `specs/`/`docs/` file as authoritative over
`ARCHITECTURE.md` or a component's `README.md`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/007-transfer-approval/00-plan.md
<!-- SPECKIT END -->

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
