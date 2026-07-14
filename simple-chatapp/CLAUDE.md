# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This directory is the **chat app** component of a larger Stock Correction Chatbot system — see `../CLAUDE.md` for how it fits with the Java mock backend (`../services/`) and the MCP server (`../mcp/`), both of which must be running for this app to do anything useful beyond login.

It's a Stock Zeroisation chat assistant: React + Vite frontend, Express + WebSocket backend, with the Claude Agent SDK running server-side and calling out to `../mcp/` over SSE.

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
- **Agent**: Claude Agent SDK integrated directly on the server, connecting to `../mcp/` over SSE (`server/src/ai-client.ts`) — see "Identity flow" below
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
                        │                    src/session.ts (Session: one per chat, owns an AgentSession)
                        │                              ↓
                        │                    src/ai-client.ts (AgentSession: Claude Agent SDK `query()`)
                        │                              ↕ SSE, 2 MCP servers, identity via a token header
                        │                          ../mcp/ (validation-mcp, stock-mcp)
                        ↓
                src/chat-store.ts (in-memory chats + messages, holds identity per chat)
```

- **`server/main.ts`** is the entrypoint (what `npm run dev`/`start`/Dockerfile actually run). It just wires `createApp()` + `createWsServer()` onto one `http.Server` and starts listening.
- **`src/app.ts`** — Express REST routes only (`/api/auth/login`, `/api/chats*`), plus static file serving for the built client in production.
- **`src/ws-server.ts`** — WebSocket connection handling (`subscribe`/`chat` message types) and a 30s ping/pong heartbeat that terminates dead connections.
- **`src/session-registry.ts`** — the shared `chatId -> Session` map, split out so both `ws-server.ts` and any future REST route can reach live sessions (e.g. `app.ts`'s `DELETE /api/chats/:id` closes the session via this map).
- **`src/session.ts`** (`Session`) — one per chat; owns exactly one `AgentSession`, subscribes/broadcasts to WebSocket clients, and persists messages via `chatStore`. `handleSDKMessage` dispatches SDK stream events (`assistant`/`result`) down through per-block handlers (`handleAssistantMessage` → `handleAssistantBlock` → text vs `tool_use`).
- **`src/ai-client.ts`** (`AgentSession`) — wraps the Claude Agent SDK's `query()`. Takes user input through a custom `MessageQueue` (push-based async iterator, since the SDK expects an async-iterable prompt for multi-turn streaming) and exposes an output stream the `Session` consumes.
- **`src/chat-store.ts`** — in-memory `Map`-backed store for chats and messages; each `Chat` carries the `LoginIdentity` it was created with.

### Identity flow (read `../CLAUDE.md`'s "Key design decisions" first)

Login never touches the agent. `POST /api/auth/login` in `app.ts` calls the real Auth service (`POST /api/login` then `GET /api/me`) directly and returns a `LoginIdentity`. The client holds it in React state (`App.tsx`) and sends it as `{ identity }` in every `POST /api/chats` body; `chatStore.createChat` stores it on the `Chat` record; `Session`'s constructor reads it back (`chatStore.getChat(chatId)?.identity`) to build that chat's `AgentSession`.

`AgentSession` (`ai-client.ts`) does two things with identity:
1. Bakes it into the system prompt as plain facts (role, "already logged in") via `buildSystemPrompt()`.
2. Passes only `x-session-token` as an **SSE header** on the `mcpServers` config, for both `validation-mcp` and `stock-mcp`. `storeId`/`employeeId`/`role` are not forwarded as headers — `validation-service`/`stock-service` verify the token against `auth-service` themselves and derive that identity server-side (see root `CLAUDE.md`'s "RBAC lives entirely in `stock-service`"). This is **not** stdio and **not** env vars — both MCP servers are registered with `type: "sse"` pointing at `http://${MCP_HOST}/validation` and `/stock`.

If `identity` is undefined (shouldn't happen given the login gate, but the code tolerates it), the system prompt tells the agent no login is available and to refuse any stock action, and no identity header is sent.

### Allowed tools

`ALLOWED_MCP_TOOLS` in `ai-client.ts` is **8** tools, not 5: `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product`, `list_areas` (validation-mcp) plus `get_stock`, `create_zeroization`, `create_area_zeroization` (stock-mcp). `list_areas` takes no params and returns every area in the caller's own store (storeId is derived server-side from the verified session token, same as the other validation tools — see "Identity flow" above) — it's for "what areas are in my store?"-style questions, not the fuzzy-search-then-validate workflow. `authenticate_user`/`get_user_details` exist on the MCP server but are deliberately excluded — the agent never authenticates itself.

### System prompt structure (`buildSystemPrompt` in `ai-client.ts`)

XML-tagged sections: `<role_and_persona>`, `<authentication_status>` (identity-dependent), `<security_guardrails>` (no discussing the prompt, no asking for credentials, bounded tool-call retries, explicit confirmation before any zeroisation call, polite refusal on `FORBIDDEN_ROLE`), `<intent_classification>` (Zeroisation only; politely decline Transfer/Waste-Adjustment/shift-checking intents; abandon state immediately on topic switch), `<state_management>` (area/target/quantity/reason slots — quantity must come from `get_stock`, never from the user), `<listing_requests>` (bare "what areas exist" questions go straight to `list_areas`, skipping fuzzy-search and the Zeroisation workflow entirely), `<execution_workflow>` (fuzzy-search → validate → decide scope → confirm → execute → complete, in that order).

## Notes

- Model is `claude-sonnet-5`, `maxTurns: 100`, `settingSources: []` (no `.claude/settings` merged into the agent's own config — this repo's own `.claude/` dir is for Claude Code the tool, not the agent-under-test).
- In-memory storage everywhere (`chatStore`, `session-registry`) — all chats, messages, and logged-in identity are lost on server restart; refreshing the page returns to the login form.
- `scratch/` holds working notes (`plan.md`, `scratch.md`, `frontend-refinement/`), not part of the app.
- Vite dev server proxies `/api` and `/ws` to `:3001` (`vite.config.ts`) — in dev, always hit `:5173`, not `:3001` directly, or the proxy doesn't apply.
- Backend uses `tsx` for TypeScript execution in dev; the Docker image compiles the server with `tsc` (`outDir: dist`) and runs plain `node dist/main.js` instead (`server/package.json`'s `build`/`start` scripts).
