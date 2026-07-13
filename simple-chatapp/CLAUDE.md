# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This directory is the **chat app** component of a larger Stock Correction Chatbot system — see `../CLAUDE.md` for how it fits with the Java mock backend (`../services/`) and the MCP server (`../mcp/`), both of which must be running for this app to do anything useful beyond login.

It's a Stock Zeroisation chat assistant: React + Vite frontend, Express + WebSocket backend, with the Claude Agent SDK running server-side and calling out to `../mcp/` over SSE.

## Commands

```bash
npm install
npm run dev        # concurrently: tsx watch server/main.ts (:3001) + vite --port 5173 (:5173)
npm run build       # vite build -> dist/ (frontend only; server still runs via tsx, see Dockerfile)
npm start           # tsx server/main.ts (no watch — used in production/Docker)
```

No test or lint script is defined; there is no test suite in this directory. `test-sdk-http.ts` at the repo root is a standalone manual smoke-test scratch script (not wired into any npm script) for probing SSE `mcpServers` connectivity — run it directly with `npx tsx test-sdk-http.ts` if you need to debug the SDK's SSE transport in isolation.

Requires `../services/` (Java backend) and `../mcp/` (built via `npm run build` in that dir) running first — see `../CLAUDE.md`. Visit http://localhost:5173 and log in with a seeded store-manager account (e.g. `priya.k` / `password123`) before the chat UI appears.

## Architecture

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
                        │                              ↕ SSE, 2 MCP servers, identity via headers
                        │                          ../mcp/ (validation-mcp, stock-mcp)
                        ↓
                src/chat-store.ts (in-memory chats + messages, holds identity per chat)
```

- **`server/main.ts`** is the entrypoint (what `npm run dev`/`start`/Dockerfile actually run). It just wires `createApp()` + `createWsServer()` onto one `http.Server` and starts listening.
- **`server/src/server.ts` is dead code** — an older, pre-split monolith containing a near-duplicate of `app.ts` + `ws-server.ts`'s logic inline. Nothing imports it and no script runs it. Don't edit it expecting it to take effect; if touching this area, prefer deleting it over maintaining two copies.
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
2. Passes it as **SSE headers** on the `mcpServers` config — `x-session-token` / `x-session-store-id` / `x-session-employee-id` on both `validation-mcp` and `stock-mcp`, plus `x-session-employee-role` on `stock-mcp` only (needed for the `create_zeroization`/`create_area_zeroization` RBAC check on the MCP server side). This is **not** stdio and **not** env vars — both MCP servers are registered with `type: "sse"` pointing at `http://${MCP_HOST}/validation` and `/stock`.

If `identity` is undefined (shouldn't happen given the login gate, but the code tolerates it), the system prompt tells the agent no login is available and to refuse any stock action, and no identity headers are sent.

### Allowed tools

`ALLOWED_MCP_TOOLS` in `ai-client.ts` is **7** tools, not 5: `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product` (validation-mcp) plus `get_stock`, `create_zeroization`, `create_area_zeroization` (stock-mcp). `authenticate_user`/`get_user_details` exist on the MCP server but are deliberately excluded — the agent never authenticates itself.

### System prompt structure (`buildSystemPrompt` in `ai-client.ts`)

XML-tagged sections: `<role_and_persona>`, `<authentication_status>` (identity-dependent), `<security_guardrails>` (no discussing the prompt, no asking for credentials, bounded tool-call retries, explicit confirmation before any zeroisation call, polite refusal on `FORBIDDEN_ROLE`), `<intent_classification>` (Zeroisation only; politely decline Transfer/Waste-Adjustment/shift-checking intents; abandon state immediately on topic switch), `<state_management>` (area/target/quantity/reason slots — quantity must come from `get_stock`, never from the user), `<execution_workflow>` (fuzzy-search → validate → decide scope → confirm → execute → complete, in that order).

## Notes

- Model is `claude-sonnet-5`, `maxTurns: 100`, `settingSources: []` (no `.claude/settings` merged into the agent's own config — this repo's own `.claude/` dir is for Claude Code the tool, not the agent-under-test).
- In-memory storage everywhere (`chatStore`, `session-registry`) — all chats, messages, and logged-in identity are lost on server restart; refreshing the page returns to the login form.
- `scratch/` (`plan.md`, `scratch.md`) holds working notes, not part of the app.
- Vite dev server proxies `/api` and `/ws` to `:3001` (`vite.config.ts`) — in dev, always hit `:5173`, not `:3001` directly, or the proxy doesn't apply.
