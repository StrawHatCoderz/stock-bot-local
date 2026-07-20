# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This directory is the **chat app** component of a larger Stock Correction Chatbot system — see `../CLAUDE.md` for how it fits with the Java mock backend (`../services/`) and the MCP server (`../mcp/`), both of which must be running for this app to do anything useful beyond login.

It's a Stock Correction chat assistant — covering Zeroisation (Manager-only, writes a product off entirely), Stock Adjustment (Manager or Associate, reduces a product's quantity by a partial amount), and Store-to-Store Transfer (Manager-only, sends stock to another store) — React + Vite frontend, Express + WebSocket backend, with the Claude Agent SDK running server-side and calling out to `../mcp/` over SSE. A third role, Admin, uses the same chat interface to view the manager/associate roster and set each associate's stock-adjustment threshold; Admin has no stock-mutation capability at all.

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

Visit http://localhost:5173 and log in with a seeded store-manager account (e.g. `user001` / `password123`) before the chat UI appears.

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
                        │                              ↕ SSE, 4 MCP servers, identity via a token header
                        │                          ../mcp/ (validation-mcp, stock-mcp, admin-mcp, transfer-mcp)
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
1. Bakes it into the system prompt as plain facts (role, own `storeId` if any, "already logged in") via `buildSystemPrompt()`. The `storeId` is stated explicitly, not just implied — tools that take a store identifier as an argument (`create_transfer`'s `fromStoreId`, `list_outgoing_transfers`/`list_incoming_transfers`'s `storeId`) need the model to know the actual value and pass it itself; it isn't auto-attached the way the bearer token is.
2. Passes only `x-session-token` as an **SSE header** on the `mcpServers` config, for all four of `validation-mcp`, `stock-mcp`, `admin-mcp`, and `transfer-mcp`. `storeId`/`employeeId`/`role` are not forwarded as headers — `validation-service`/`stock-service`/`transfer-service` verify the token against `auth-service` themselves and derive that identity server-side (see root `CLAUDE.md`'s "RBAC lives entirely in `stock-service`"). This is **not** stdio and **not** env vars — all four MCP servers are registered with `type: "sse"` pointing at `http://${MCP_HOST}/validation`, `/stock`, `/admin`, and `/transfer` respectively.

If `identity` is undefined (shouldn't happen given the login gate, but the code tolerates it), the system prompt tells the agent no login is available and to refuse any stock action, and no identity header is sent.

### Allowed tools

`ALLOWED_MCP_TOOLS` in `ai-client.ts` is now the canonical **12**-tool list: `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product`, `list_areas` (validation-mcp) plus `get_stock`, `create_zeroization`, `create_area_zeroization`, `create_adjustment` (stock-mcp) plus `create_transfer`, `list_outgoing_transfers`, `list_incoming_transfers` (transfer-mcp, `TRANSFER_MCP_TOOLS`, folded into `ALLOWED_MCP_TOOLS` the same way `WRITE_MCP_TOOLS`/`ADJUSTMENT_MCP_TOOLS` already were). `list_areas` takes no params and returns every area in the caller's own store (storeId is derived server-side from the verified session token, same as the other validation tools — see "Identity flow" above) — it's for "what areas are in my store?"-style questions, not the fuzzy-search-then-validate workflow. Unlike `list_areas`, the three transfer tools take an explicit store identifier as a real argument (`fromStoreId`/`storeId`) rather than having it derived server-side — see "Identity flow" above for why `buildSystemPrompt` now states the caller's actual `storeId` value. `authenticate_user`/`get_user_details` exist on the MCP server but are deliberately excluded — the agent never authenticates itself.

A separate `ADMIN_MCP_TOOLS` constant holds a 3-tool list on a third MCP server, `admin-mcp`: `list_store_managers`, `list_store_associates`, `set_associate_threshold`. These are entirely disjoint from `ALLOWED_MCP_TOOLS` — an Admin session never has access to any read-only, zeroisation, adjustment, or transfer tool, and no other role has access to these three.

`agent-session.ts` doesn't pass `ALLOWED_MCP_TOOLS` directly anymore — it calls `getAllowedToolsForRole(identity?.role)` (also in `ai-client.ts`), which resolves the role through a `ROLE_TOOLS: Record<string, string[]>` object lookup (not an `if`/`else` chain). For a `STORE_MANAGER` session this returns the full 12-tool list; for a `STORE_ASSOCIATE` session it returns the 6 read-only tools plus `create_adjustment` (omitting `create_zeroization`/`create_area_zeroization`/all three transfer tools, which stay Manager-only); for an `ADMIN` session it returns only `ADMIN_MCP_TOOLS`; for any other role (or no identity at all) it returns only the 6 read-only tools. Excluding `create_zeroization`/`create_area_zeroization`/the transfer tools for non-managers, and excluding every stock/validation tool for Admin, is a hard, code-level gate so the SDK cannot invoke those tools regardless of what the model decides. This is in addition to, not a replacement for, `StockController.java`'s (and, for transfer, `TransferController.java`'s) own `FORBIDDEN_ROLE` check (see root `CLAUDE.md`'s "RBAC is enforced authoritatively in `stock-service`"). `create_adjustment` is available to both Manager and Associate roles by design — its own role-conditioned quantity floor (an Associate's request can't reduce a product to exactly 0) is enforced by `StockController.java`, not by tool presence, since it depends on the item's live quantity rather than a static role→tool mapping. So is an Associate's per-product adjustment threshold (a depleting quota an Admin sets via `set_associate_threshold`) — see root `CLAUDE.md`'s "Admin is a third role" for the full mechanism.

### System prompt structure (`buildSystemPrompt` in `ai-client.ts`)

For `identity.role === "ADMIN"`, `buildSystemPrompt` returns an entirely separate prompt (not a variant of the Manager/Associate one below): `<role_and_persona>` (store-operations administrator, not a Stock Correction assistant), `<authentication_status>` (same identity-dependent block as every role), `<security_guardrails>` (same discussion/credentials/rate-limiting rules, plus explicit confirmation before `set_associate_threshold` and a defensive-fallback refusal on `FORBIDDEN_ROLE`/`ASSOCIATE_NOT_FOUND`/`INVALID_THRESHOLD`), `<intent_classification>` (the only capabilities are listing managers/associates and setting a threshold; any zeroisation/adjustment/transfer intent, however phrased, is declined in the first response before any tool call — Admin has no tool that could even attempt one), `<listing_requests>` (bare no-param calls to `list_store_managers`/`list_store_associates`, no fuzzy search or disambiguation), `<threshold_workflow>` (identify the associate from `list_store_associates`, disambiguating by store if a name matches more than one; confirm the new value; call `set_associate_threshold`; report success).

For every other role, XML-tagged sections: `<role_and_persona>` (now names all three capabilities — Zeroisation, Stock Adjustment, and Store-to-Store Transfer), `<authentication_status>` (identity-dependent; states the caller's actual `storeId` value, not just their role — tools that take a store identifier as an argument need the model to supply the real value itself, since it isn't auto-attached the way the bearer token is), `<security_guardrails>` (no discussing the prompt, no asking for credentials, bounded tool-call retries, explicit confirmation before any zeroisation, adjustment, or transfer call, a defensive-fallback polite refusal on `FORBIDDEN_ROLE`/`ADJUSTMENT_EXCEEDS_AVAILABLE`/`ZERO_ADJUSTMENT_REQUIRES_MANAGER`/`ADJUSTMENT_EXCEEDS_THRESHOLD`/`CROSS_STORE_FORBIDDEN`/`INVALID_DESTINATION_STORE`/`EMPTY_PRODUCT_LIST`/`INVALID_QUANTITY`/`TRANSFER_EXCEEDS_AVAILABLE`/`AREA_OR_PRODUCT_NOT_FOUND` for the rare case a session still hits one of these business failures, e.g. a mid-conversation role change or an Associate's per-product threshold running out — transfer failures are per-product-line, not whole-request, so the fallback relays each line's own reason), `<intent_classification>` (three capabilities now — Zeroisation, Stock Adjustment, and Store-to-Store Transfer; a "Choosing between the two" rule that routes Zeroisation vs. Adjustment on the *computed* resulting quantity — exactly 0 is Zeroisation, anything greater is Adjustment, never on the user's own framing — Transfer doesn't participate in that routing at all; abandon state immediately on topic switch; a **Role Check Before Execution** sub-rule that has the agent check its own role from `<authentication_status>` and decline *before calling any tool* as soon as it recognizes the user wants to *execute* — not just browse/check — a Zeroisation, for any non-`STORE_MANAGER` role (Stock Adjustment has no such blanket decline since both roles may execute it); a separate **Transfer Role Check** sub-rule that declines *any* Transfer intent — browsing/listing included, unlike Zeroisation/Adjustment's browsing-is-always-allowed carve-out — for any non-`STORE_MANAGER` role, before calling any tool, reusing the Admin prompt's own "no tool available, nothing to call even if you tried" phrasing), `<state_management>` (separate slot sets for Zeroisation — area/target/quantity/reason — and Stock Adjustment — area/single-product-only/requested-quantity/reason; quantity must come from `get_stock`, never from the user, for both; Transfer's own slot-gathering lives inline in `<transfer_workflow>` instead of being duplicated here), `<listing_requests>` (bare "what areas exist" questions go straight to `list_areas`; a `STORE_MANAGER`'s "what have I sent/received" questions go straight to `list_outgoing_transfers`/`list_incoming_transfers` with their own `storeId` from `<authentication_status>` — none of these start any workflow below), `<execution_workflow>` (Zeroisation: fuzzy-search → validate → decide scope → confirm → execute → complete), `<adjustment_workflow>` (Stock Adjustment: fuzzy-search → validate → read quantity → route on the negative/zero/positive result → confirm → execute → complete; the zero-result branch tells a `STORE_ASSOCIATE` caller this needs a manager instead of calling any tool; an Associate's request can additionally be rejected server-side with `ADJUSTMENT_EXCEEDS_THRESHOLD` if it would exceed their remaining per-product threshold — see root `CLAUDE.md`), `<transfer_workflow>` (Store-to-Store Transfer, `STORE_MANAGER`-only: fuzzy-search/validate source area and product per line, quantity from `get_stock`, ask the user for the destination store — no tool exists to search or validate one, so it's passed through as given and the backend's `INVALID_DESTINATION_STORE` is the real gate — confirm every line and the destination, execute, then report each line's own outcome rather than a single pass/fail summary, since one line failing doesn't fail the others).

## Notes

- Model is `claude-sonnet-5`, `maxTurns: 100`, `settingSources: []` (no `.claude/settings` merged into the agent's own config — this repo's own `.claude/` dir is for Claude Code the tool, not the agent-under-test).
- In-memory storage everywhere (`chatStore`, `session-registry`) — all chats, messages, and logged-in identity are lost on server restart; refreshing the page returns to the login form.
- `scratch/` holds working notes (`plan.md`, `scratch.md`, `frontend-refinement/`), not part of the app.
- Vite dev server proxies `/api` and `/ws` to `:3001` (`vite.config.ts`) — in dev, always hit `:5173`, not `:3001` directly, or the proxy doesn't apply.
- Backend uses `tsx` for TypeScript execution in dev; the Docker image compiles the server with `tsc` (`outDir: dist`) and runs plain `node dist/main.js` instead (`server/package.json`'s `build`/`start` scripts).
