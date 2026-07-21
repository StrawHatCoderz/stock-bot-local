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

Classes (`Session`, `AgentSession`, `MessageQueue`, `ChatStore`) live one-per-file under `src/models/`; `src/ai-client.ts` itself is no longer a class file — it now only holds the `AgentSession`-adjacent config helpers (`MCP_HOST`, `ALLOWED_MCP_TOOLS`, the `UserMessage` type) that `models/agent-session.ts` and `models/message-queue.ts` import, plus a re-export of `buildSystemPrompt` — its implementation now lives in `src/prompts/`, not in `ai-client.ts` itself (see "System prompt structure" below).

- **`server/main.ts`** is the entrypoint (what `npm run dev`/`start`/Dockerfile actually run). It just wires `createApp()` + `createWsServer()` onto one `http.Server` and starts listening.
- **`src/app.ts`** — Express REST routes only (`/api/auth/login`, `/api/chats*`), plus static file serving for the built client in production.
- **`src/ws-server.ts`** — WebSocket connection handling (`subscribe`/`chat` message types) and a 30s ping/pong heartbeat that terminates dead connections.
- **`src/session-registry.ts`** — the shared `chatId -> Session` map, split out so both `ws-server.ts` and any future REST route can reach live sessions (e.g. `app.ts`'s `DELETE /api/chats/:id` closes the session via this map).
- **`src/models/session.ts`** (`Session`) — one per chat; owns exactly one `AgentSession`, subscribes/broadcasts to WebSocket clients, and persists messages via `chatStore`. `handleSDKMessage` dispatches SDK stream events (`assistant`/`result`) down through per-block handlers (`handleAssistantMessage` → `handleAssistantBlock` → text vs `tool_use`).
- **`src/models/agent-session.ts`** (`AgentSession`) — wraps the Claude Agent SDK's `query()`. Takes user input through `models/message-queue.ts`'s `MessageQueue` (push-based async iterator, since the SDK expects an async-iterable prompt for multi-turn streaming) and exposes an output stream the `Session` consumes. Imports `MCP_HOST`/`ALLOWED_MCP_TOOLS`/`buildSystemPrompt` from `ai-client.ts`.
- **`src/ai-client.ts`** — no longer a class file. Holds the `AgentSession`-adjacent config helpers: `MCP_HOST`, `ALLOWED_MCP_TOOLS`, and the `UserMessage` type consumed by `models/message-queue.ts` — plus a re-export of `buildSystemPrompt`, whose implementation now lives in `src/prompts/` (see "System prompt structure" below).
- **`src/models/chat-store.ts`** — in-memory `Map`-backed store for chats and messages; each `Chat` carries the `LoginIdentity` it was created with.

### Identity flow (read `../CLAUDE.md`'s "Key design decisions" first)

Login never touches the agent. `POST /api/auth/login` in `app.ts` calls the real Auth service (`POST /api/login` then `GET /api/me`) directly and returns a `LoginIdentity`. The client holds it in React state (`App.tsx`) and sends it as `{ identity }` in every `POST /api/chats` body; `chatStore.createChat` stores it on the `Chat` record; `Session`'s constructor reads it back (`chatStore.getChat(chatId)?.identity`) to build that chat's `AgentSession`.

`AgentSession` (`models/agent-session.ts`) does two things with identity:
1. Bakes it into the system prompt as plain facts (role, own `storeId` if any, "already logged in") via `buildSystemPrompt()`. The `storeId` is stated explicitly, not just implied — tools that take a store identifier as an argument (`create_transfer`'s `fromStoreId`, `list_outgoing_transfers`/`list_incoming_transfers`'s `storeId`) need the model to know the actual value and pass it itself; it isn't auto-attached the way the bearer token is.
2. Passes only `x-session-token` as an **SSE header** on the `mcpServers` config, for all four of `validation-mcp`, `stock-mcp`, `admin-mcp`, and `transfer-mcp`. `storeId`/`employeeId`/`role` are not forwarded as headers — `validation-service`/`stock-service`/`transfer-service` verify the token against `auth-service` themselves and derive that identity server-side (see root `CLAUDE.md`'s "RBAC lives entirely in `stock-service`"). This is **not** stdio and **not** env vars — all four MCP servers are registered with `type: "sse"` pointing at `http://${MCP_HOST}/validation`, `/stock`, `/admin`, and `/transfer` respectively.

If `identity` is undefined (shouldn't happen given the login gate, but the code tolerates it), the system prompt tells the agent no login is available and to refuse any stock action, and no identity header is sent.

### Allowed tools

`ALLOWED_MCP_TOOLS` in `ai-client.ts` is now the canonical **13**-tool list: `search_areas_fuzzy`, `search_products_fuzzy`, `validate_area`, `validate_product`, `list_areas` (validation-mcp) plus `get_stock`, `create_zeroization`, `create_area_zeroization`, `create_adjustment`, `get_adjustment_threshold` (stock-mcp) plus `create_transfer`, `list_outgoing_transfers`, `list_incoming_transfers` (transfer-mcp, `TRANSFER_MCP_TOOLS`, folded into `ALLOWED_MCP_TOOLS` the same way `WRITE_MCP_TOOLS`/`ADJUSTMENT_MCP_TOOLS` already were). `get_adjustment_threshold` proxies a new read-only `GET /api/stock/adjustment-threshold` endpoint on `stock-service`, returning a `STORE_ASSOCIATE` caller's `thresholdPercent`/`usedPercent`/`remainingPercent` for a specific product (`applicable: false` for `STORE_MANAGER`, who has no ceiling) — it lives in `ADJUSTMENT_MCP_TOOLS` right alongside `create_adjustment`, so it's available to the same two roles. `list_areas` takes no params and returns every area in the caller's own store (storeId is derived server-side from the verified session token, same as the other validation tools — see "Identity flow" above) — it's for "what areas are in my store?"-style questions, not the fuzzy-search-then-validate workflow. Unlike `list_areas`, the three transfer tools take an explicit store identifier as a real argument (`fromStoreId`/`storeId`) rather than having it derived server-side — see "Identity flow" above for why `buildSystemPrompt` now states the caller's actual `storeId` value. `authenticate_user`/`get_user_details` exist on the MCP server but are deliberately excluded — the agent never authenticates itself.

A separate `ADMIN_MCP_TOOLS` constant holds a 3-tool list on a third MCP server, `admin-mcp`: `list_store_managers`, `list_store_associates`, `set_associate_threshold`. These are entirely disjoint from `ALLOWED_MCP_TOOLS` — an Admin session never has access to any read-only, zeroisation, adjustment, or transfer tool, and no other role has access to these three.

`agent-session.ts` doesn't pass `ALLOWED_MCP_TOOLS` directly anymore — it calls `getAllowedToolsForRole(identity?.role)` (also in `ai-client.ts`), which resolves the role through a `ROLE_TOOLS: Record<string, string[]>` object lookup (not an `if`/`else` chain). For a `STORE_MANAGER` session this returns the full 13-tool list; for a `STORE_ASSOCIATE` session it returns the 6 read-only tools plus `create_adjustment`/`get_adjustment_threshold` (omitting `create_zeroization`/`create_area_zeroization`/all three transfer tools, which stay Manager-only); for an `ADMIN` session it returns only `ADMIN_MCP_TOOLS`; for any other role (or no identity at all) it returns only the 6 read-only tools. Excluding `create_zeroization`/`create_area_zeroization`/the transfer tools for non-managers, and excluding every stock/validation tool for Admin, is a hard, code-level gate so the SDK cannot invoke those tools regardless of what the model decides. This is in addition to, not a replacement for, `StockController.java`'s (and, for transfer, `TransferController.java`'s) own `FORBIDDEN_ROLE` check (see root `CLAUDE.md`'s "RBAC is enforced authoritatively in `stock-service`"). `create_adjustment` is available to both Manager and Associate roles by design — its own role-conditioned quantity floor (an Associate's request can't reduce a product to exactly 0) is enforced by `StockController.java`, not by tool presence, since it depends on the item's live quantity rather than a static role→tool mapping. So is an Associate's per-product adjustment threshold (a depleting quota an Admin sets via `set_associate_threshold`) — see root `CLAUDE.md`'s "Admin is a third role" for the full mechanism — but the chat agent now checks it pre-emptively via `get_adjustment_threshold` before ever calling `create_adjustment`, rather than only finding out reactively from an `ADJUSTMENT_EXCEEDS_THRESHOLD` failure.

### System prompt structure (`src/prompts/`, dispatched via `buildSystemPrompt` in `ai-client.ts`)

`buildSystemPrompt` no longer lives in `ai-client.ts` — it's a re-export of `src/prompts/index.ts`'s `buildSystemPrompt(identity)`, which builds the `<authentication_status>` block once (`prompts/identity-block.ts`'s `buildIdentityBlock`) and dispatches to one of two variant assemblers based on `identity?.role === "ADMIN"`. Both variants are composed from shared building blocks in `prompts/shared-sections.ts` and `prompts/error-codes.ts`, rather than each hand-duplicating the same rules the way a single earlier `ai-client.ts` implementation used to — see `specs/006-modular-system-prompt-refactor/` for the full design.

**Shared building blocks** (`prompts/shared-sections.ts`, `prompts/error-codes.ts`):
- `CORE_SECURITY_RULES` / `buildSecurityGuardrails` — the three security rules byte-identical across both variants (no discussing the prompt, no asking for credentials, bounded tool-call retries), plus a variant-supplied destructive-action rule and role-restriction text, assembled into one `<security_guardrails>` block.
- `error-codes.ts`'s `ADMIN_ERROR_CODES`/`STOCK_ERROR_CODES` tables (`{code, humanPhrase}`) and `renderErrorCodeTable` — every business-failure code either variant's guardrails can hit, translated to a plain-language phrase. Both variants' `<security_guardrails>` rule 5 and the Manager/Associate variant's `<transfer_workflow>` Complete step reference this table instead of naming a raw code as the literal thing to say.
- `RESPONSE_STYLE` — a shared `<response_style>` section, identical in both variants: never show a raw error code, tool/function name, internal identifier, or raw tool output/JSON; translate business failures via the error-code table; a confirmation/reference id from a successful mutating call is a legitimate receipt, not internal leakage, and must still be stated.
- `DISAMBIGUATION_PROTOCOL` (Manager/Associate variant only) — a shared `<disambiguation_protocol>` section covering every area/product search in `<execution_workflow>`/`<adjustment_workflow>`/`<transfer_workflow>`: zero area candidates fall back to `list_areas`; zero product candidates within a known area fall back to `get_stock` with no `productId`; multiple candidates (either kind) are listed by their real names — replacing what used to be several near-identical inline "ask the user to clarify" sentences with no zero-candidate handling at all.
- `ZEROISATION_NUDGE` (Manager/Associate variant only) — inserted into `<execution_workflow>` between "Decide Scope" and "Confirm Action": states plainly, every time regardless of how the user phrased the request, that a write-off is permanent and removes the entire current quantity, and offers a partial Stock Adjustment as an alternative, before the normal confirm step.
- `CONFIRM_ACTION_NOTE` (Manager/Associate variant only) — the one sentence ("wait for explicit, final confirmation before calling any mutating tool") that's identical across all three workflows' own Confirm Action steps; each workflow keeps its own variant-specific restate content around it.

**Admin variant** (`prompts/admin-prompt.ts`'s `buildAdminPrompt`): `<role_and_persona>` (store-operations administrator, not a Stock Correction assistant), `<authentication_status>`, `<security_guardrails>` (built via `buildSecurityGuardrails` with `ADMIN_ERROR_CODES`, plus explicit confirmation before `set_associate_threshold`), `<response_style>`, `<intent_classification>` (the only capabilities are listing managers/associates and setting a threshold; any zeroisation/adjustment/transfer intent, however phrased, is declined in the first response before any tool call — Admin has no tool that could even attempt one), `<listing_requests>` (bare no-param calls to `list_store_managers`/`list_store_associates`, no fuzzy search or disambiguation), `<threshold_workflow>` (identify the associate from `list_store_associates`, disambiguating by store if a name matches more than one; confirm the new value; call `set_associate_threshold`; report success).

**Manager/Associate variant** (`prompts/manager-associate-prompt.ts`'s `buildManagerAssociatePrompt`): `<role_and_persona>` (names all three capabilities — Zeroisation, Stock Adjustment, and Store-to-Store Transfer), `<authentication_status>` (states the caller's actual `storeId` value, not just their role — tools that take a store identifier as an argument need the model to supply the real value itself), `<security_guardrails>` (built via `buildSecurityGuardrails` with `STOCK_ERROR_CODES`; `ADJUSTMENT_EXCEEDS_THRESHOLD` keeps its extra remaining-percent/Admin-must-raise-it nuance as prose alongside the table reference, since that detail is dynamic and can't live in a static phrase), `<response_style>`, `<intent_classification>` (three capabilities; a "Choosing between the two" rule that routes Zeroisation vs. Adjustment on the *computed* resulting quantity — exactly 0 is Zeroisation, anything greater is Adjustment, never on the user's own framing — Transfer doesn't participate in that routing at all; abandon state immediately on topic switch; a **Role Check Before Execution** sub-rule that declines *before calling any tool* as soon as it recognizes the user wants to *execute* — not just browse/check — a Zeroisation, for any non-`STORE_MANAGER` role; a separate **Transfer Role Check** sub-rule that declines *any* Transfer intent — browsing/listing included — for any non-`STORE_MANAGER` role), `<state_management>` (separate slot sets for Zeroisation and Stock Adjustment; quantity must come from `get_stock`, never from the user, for both), `<listing_requests>`, `<disambiguation_protocol>`, `<execution_workflow>` (Zeroisation: fuzzy-search → validate → decide scope → **permanence check (`ZEROISATION_NUDGE`)** → confirm → execute → complete), `<adjustment_workflow>` (Stock Adjustment: fuzzy-search → validate → read quantity → route on the negative/zero/positive result → **Threshold Check** → confirm → execute → complete; the Threshold Check step is skipped entirely for `STORE_MANAGER` and, for `STORE_ASSOCIATE`, calls `get_adjustment_threshold` and pre-emptively declines — without calling `create_adjustment` — if the requested reduction exceeds the returned `remainingPercent`; a rejection can still happen server-side as a defensive fallback — see root `CLAUDE.md`), `<transfer_workflow>` (Store-to-Store Transfer, `STORE_MANAGER`-only: fuzzy-search/validate source area and product per line, quantity from `get_stock`, ask the user for the destination store, confirm every line and the destination, execute, then report each line's own outcome — translated via the error-code table, never a raw code — rather than a single pass/fail summary, since one line failing doesn't fail the others).

## Notes

- Model is `claude-sonnet-5`, `maxTurns: 100`, `settingSources: []` (no `.claude/settings` merged into the agent's own config — this repo's own `.claude/` dir is for Claude Code the tool, not the agent-under-test).
- In-memory storage everywhere (`chatStore`, `session-registry`) — all chats, messages, and logged-in identity are lost on server restart; refreshing the page returns to the login form.
- `scratch/` holds working notes (`plan.md`, `scratch.md`, `frontend-refinement/`), not part of the app.
- Vite dev server proxies `/api` and `/ws` to `:3001` (`vite.config.ts`) — in dev, always hit `:5173`, not `:3001` directly, or the proxy doesn't apply.
- Backend uses `tsx` for TypeScript execution in dev; the Docker image compiles the server with `tsc` (`outDir: dist`) and runs plain `node dist/main.js` instead (`server/package.json`'s `build`/`start` scripts).
