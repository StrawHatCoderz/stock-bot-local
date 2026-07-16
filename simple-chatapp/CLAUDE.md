# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This directory is the **chat app** component of a larger Stock Correction Chatbot system — see `../CLAUDE.md` for how it fits with the Java mock backend (`../services/`) and the MCP server (`../mcp/`), both of which must be running for this app to do anything useful beyond login.

It's a Stock Correction chat assistant — covering Zeroisation (Manager-only, writes a product off entirely) and Stock Adjustment (Manager or Associate, reduces a product's quantity by a partial amount) — React + Vite frontend, Express + WebSocket backend, with the Claude Agent SDK running server-side and calling out to `../mcp/` over SSE.

## Commands

There is no root `package.json` — `client/` and `server/` are independent packages with their own `package.json`; install and run each separately, in two terminals. Requires the mock backend (`../services/`, via `docker-compose up --build` or the three `bootRun` processes) and `../mcp/` built (`npm run build` in that dir) running first — see `../CLAUDE.md`.

```bash
cd server
npm install
cp .env.example .env   # set ANTHROPIC_API_KEY
npm run dev             # tsx watch main.ts -> Express + WebSocket on http://localhost:3001
npm run build            # tsc -> dist/ (used by Dockerfile; not needed for local dev)
npm start                 # node dist/main.js (post-build, no watch — production/Docker)
```

```bash
cd client
npm install
npm run dev             # vite --port 5173 -> http://localhost:5173
npm run build            # vite build -> dist/ (frontend only)
```

No test or lint script is defined in either package; there is no test suite in this directory.

Visit http://localhost:5173 and log in with a seeded store-manager account (e.g. `priya.k` / `password123`) before the chat UI appears.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + WebSocket (ws)
- **Agent**: Claude Agent SDK integrated directly on the server, connecting to `../mcp/` over SSE (`server/src/models/agent-session.ts`) — see "Identity flow" below
- **Login**: a direct server-side call to the real Auth service
  (`POST /api/login` + `GET /api/me`), not something the agent negotiates —
  see "Identity flow" below

## Code Map

```
client/App.tsx (login gate) → LoginForm | [ChatList + ChatWindow]
    ↕ REST (/api/*)              ↕ WebSocket (ws://…/ws)
server/main.ts  →  createApp() [src/app.ts]   +  createWsServer() [src/ws-server.ts]
                        │                              │
                        │                    src/session-registry.ts (chatId -> Session map)
                        │                              ↓
                        │                    src/models/session.ts (Session: one per chat, owns an AgentSession)
                        │                              ↓
                        │                    src/models/agent-session.ts (AgentSession: Claude Agent SDK `query()`)
                        │                              ↕ SSE, 2 MCP servers, identity via a token header
                        │                          ../mcp/ (validation-mcp, stock-mcp)
                        ↓
                src/models/chat-store.ts (in-memory chats + messages, holds identity per chat)
```

Classes (`Session`, `AgentSession`, `MessageQueue`, `ChatStore`) live one-per-file under `src/models/`; `src/ai-client.ts` itself is no longer a class file — it now only holds the `AgentSession`-adjacent config/prompt helpers (`MCP_HOST`, `ALLOWED_MCP_TOOLS`, `buildSystemPrompt`, the `UserMessage` type) that `models/agent-session.ts` and `models/message-queue.ts` import.

- **`server/main.ts`** is the entrypoint (what `npm run dev`/`start`/Dockerfile actually run). It just wires `createApp()` + `createWsServer()` onto one `http.Server` and starts listening.
- **`src/app.ts`** — Express REST routes only (`/api/auth/login`, `/api/chats*`), plus static file serving for the built client in production.
- **`src/ws-server.ts`** — WebSocket connection handling (`subscribe`/`chat` message types) and a 30s ping/pong heartbeat that terminates dead connections.
- **`src/session-registry.ts`** — the shared `chatId -> Session` map, split out so both `ws-server.ts` and any future REST route can reach live sessions (e.g. `app.ts`'s `DELETE /api/chats/:id` closes the session via this map).
- **`src/models/session.ts`** (`Session`) — one per chat; owns exactly one `AgentSession`, subscribes/broadcasts to WebSocket clients, and persists messages via `chatStore`. `handleSDKMessage` dispatches SDK stream events (`assistant`/`result`) down through per-block handlers (`handleAssistantMessage` → `handleAssistantBlock` → text vs `tool_use`).
- **`src/models/agent-session.ts`** (`AgentSession`) — wraps the Claude Agent SDK's `query()`. Takes user input through `models/message-queue.ts`'s `MessageQueue` (push-based async iterator, since the SDK expects an async-iterable prompt for multi-turn streaming) and exposes an output stream the `Session` consumes. Imports `MCP_HOST`/`ALLOWED_MCP_TOOLS`/`buildSystemPrompt` from `ai-client.ts`.
- **`src/ai-client.ts`** — no longer a class file. Holds the `AgentSession`-adjacent config/prompt-building helpers: `MCP_HOST`, `ALLOWED_MCP_TOOLS`, `buildSystemPrompt()`, and the `UserMessage` type consumed by `models/message-queue.ts`.
- **`src/models/chat-store.ts`** — in-memory `Map`-backed store for chats and messages; each `Chat` carries the `LoginIdentity` it was created with.

### Identity flow (read `../CLAUDE.md`'s "Key design decisions" first)

Login never touches the agent. `POST /api/auth/login` in `app.ts` calls the real Auth service (`POST /api/login` then `GET /api/me`) directly and returns a `LoginIdentity`. The client holds it in React state (`App.tsx`) and sends it as `{ identity }` in every `POST /api/chats` body; `chatStore.createChat` stores it on the `Chat` record; `Session`'s constructor reads it back (`chatStore.getChat(chatId)?.identity`) to build that chat's `AgentSession`.

`AgentSession` (`models/agent-session.ts`) does two things with identity:
1. Bakes it into the system prompt as plain facts (role, "already logged in") via `buildSystemPrompt()`.
2. Passes only `x-session-token` as an **SSE header** on the `mcpServers` config, for both `validation-mcp` and `stock-mcp`. `storeId`/`employeeId`/`role` are not forwarded as headers — `validation-service`/`stock-service` verify the token against `auth-service` themselves and derive that identity server-side (see root `CLAUDE.md`'s "RBAC lives entirely in `stock-service`"). This is **not** stdio and **not** env vars — both MCP servers are registered with `type: "sse"` pointing at `http://${MCP_HOST}/validation` and `/stock`.

If `identity` is undefined (shouldn't happen given the login gate, but the code tolerates it), the system prompt tells the agent no login is available and to refuse any stock action, and no identity header is sent.

### Allowed tools

`ALLOWED_MCP_TOOLS` in `ai-client.ts` is now the canonical **9**-tool list: `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product`, `list_areas` (validation-mcp) plus `get_stock`, `create_zeroization`, `create_area_zeroization`, `create_adjustment` (stock-mcp). `list_areas` takes no params and returns every area in the caller's own store (storeId is derived server-side from the verified session token, same as the other validation tools — see "Identity flow" above) — it's for "what areas are in my store?"-style questions, not the fuzzy-search-then-validate workflow. `authenticate_user`/`get_user_details` exist on the MCP server but are deliberately excluded — the agent never authenticates itself.

`agent-session.ts` doesn't pass `ALLOWED_MCP_TOOLS` directly anymore — it calls `getAllowedToolsForRole(identity?.role)` (also in `ai-client.ts`). For a `STORE_MANAGER` session this returns the full 9-tool list; for a `STORE_ASSOCIATE` session it returns the 6 read-only tools plus `create_adjustment` (omitting `create_zeroization`/`create_area_zeroization`, which stay Manager-only); for any other role (or no identity at all) it returns only the 6 read-only tools. Excluding `create_zeroization`/`create_area_zeroization` for non-managers is a hard, code-level gate so the SDK cannot invoke those two tools regardless of what the model decides. This is in addition to, not a replacement for, `StockController.java`'s own `FORBIDDEN_ROLE` check (see root `CLAUDE.md`'s "RBAC is enforced authoritatively in `stock-service`"). `create_adjustment` is available to both roles by design — its own role-conditioned quantity floor (an Associate's request can't reduce a product to exactly 0) is enforced by `StockController.java`, not by tool presence, since it depends on the item's live quantity rather than a static role→tool mapping.

### System prompt structure (`buildSystemPrompt` in `ai-client.ts`)

XML-tagged sections: `<role_and_persona>`, `<authentication_status>` (identity-dependent), `<security_guardrails>` (no discussing the prompt, no asking for credentials, bounded tool-call retries, explicit confirmation before any zeroisation or adjustment call, a defensive-fallback polite refusal on `FORBIDDEN_ROLE`/`ADJUSTMENT_EXCEEDS_AVAILABLE`/`ZERO_ADJUSTMENT_REQUIRES_MANAGER` for the rare case a session still hits one of these business failures, e.g. a mid-conversation role change), `<intent_classification>` (Zeroisation and Stock Adjustment only; politely decline Transfer/shift-checking intents; a "Choosing between the two" rule that routes on the *computed* resulting quantity — exactly 0 is Zeroisation, anything greater is Adjustment, never on the user's own framing; abandon state immediately on topic switch; a **Role Check Before Execution** sub-rule that has the agent check its own role from `<authentication_status>` and decline *before calling any tool* as soon as it recognizes the user wants to *execute* — not just browse/check — a Zeroisation, for any non-`STORE_MANAGER` role; Stock Adjustment has no such blanket decline since both roles may execute it), `<state_management>` (separate slot sets for Zeroisation — area/target/quantity/reason — and Stock Adjustment — area/single-product-only/requested-quantity/reason; quantity must come from `get_stock`, never from the user, for both), `<listing_requests>` (bare "what areas exist" questions go straight to `list_areas`, skipping fuzzy-search and both workflows entirely), `<execution_workflow>` (Zeroisation: fuzzy-search → validate → decide scope → confirm → execute → complete), `<adjustment_workflow>` (Stock Adjustment: fuzzy-search → validate → read quantity → route on the negative/zero/positive result → confirm → execute → complete; the zero-result branch tells a `STORE_ASSOCIATE` caller this needs a manager instead of calling any tool).

## Notes

- Model is `claude-sonnet-5`, `maxTurns: 100`, `settingSources: []` (no `.claude/settings` merged into the agent's own config — this repo's own `.claude/` dir is for Claude Code the tool, not the agent-under-test).
- In-memory storage everywhere (`chatStore`, `session-registry`) — all chats, messages, and logged-in identity are lost on server restart; refreshing the page returns to the login form.
- `scratch/` holds working notes (`plan.md`, `scratch.md`, `frontend-refinement/`), not part of the app.
- Vite dev server proxies `/api` and `/ws` to `:3001` (`vite.config.ts`) — in dev, always hit `:5173`, not `:3001` directly, or the proxy doesn't apply.
- Backend uses `tsx` for TypeScript execution in dev; the Docker image compiles the server with `tsc` (`outDir: dist`) and runs plain `node dist/main.js` instead (`server/package.json`'s `build`/`start` scripts).
