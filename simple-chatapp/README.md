# Simple Chat App

A Stock Correction chat assistant — Zeroisation, Stock Adjustment,
Store-to-Store Transfer (including approval), and Admin roster/threshold
management — using the Claude Agent SDK with a React frontend and Express
backend. The agent's tools are provided by `../mcp/`, which proxies to the
real backend under `../services/`. See
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the identity flow and system
prompt structure in full detail.

![Architecture Diagram](diagram.png)

## Getting Started

### Prerequisites

- Node.js 18+
- Claude Agent SDK credentials (set `ANTHROPIC_API_KEY` environment variable)
- The mock backend running: `cd ../services && docker-compose up --build`
  (or the four `./gradlew :xxx:bootRun` processes directly — see
  [`../services/README.md`](../services/README.md))
- The MCP server built: `cd ../mcp && npm install && npm run build`

### Installation

```bash
cd server
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY; STOCK_API_BASE_URL
                        # defaults to the docker-compose gateway
cd ../client
npm install
```

### Running

In one terminal:

```bash
cd server
npm run dev
```

In a second terminal:

```bash
cd client
npm run dev
```

This starts both:
- **Backend** (Express + WebSocket) on http://localhost:3001
- **Frontend** (Vite + React) on http://localhost:5173

Open http://localhost:5173 in your browser.

## Login

The chat is gated behind a login form — there's no way to reach the chat UI
without signing in first. Login is a direct server-side call to the real
Auth service (`POST /api/login` then `GET /api/me`, see `server/src/app.ts`'s
`POST /api/auth/login`), not something the agent negotiates; the resulting
identity (token, `employeeId`, `storeId`, `role`) is baked into that chat's
system prompt so the agent never calls `authenticate_user`/`get_user_details`
itself. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md#identity--authentication-flow)
for the full sequence.

Use the mock credentials seeded in `services/auth-service` — e.g. `user001` /
`password123` (Manager, `STORE-101`), `user004` / `password123` (Associate,
`STORE-101`), or `user006` / `password123` (Admin — roster viewing and
associate threshold management only, no stock-mutation capability). See
[`../services/README.md`](../services/README.md) for the full test-account
table.

## Project Layout

```
client/App.tsx (login gate) → LoginForm | [ChatList + ChatWindow]
    ↕ REST (/api/*)              ↕ WebSocket (ws://…/ws)
server/main.ts  →  createApp() [src/app.ts]   +  createWsServer() [src/ws-server.ts]
                        │                              │
                        │                    src/session-registry.ts (chatId -> Session map)
                        │                              ↓
                        │                    src/models/session.ts (Session: one per chat, owns an AgentSession)
                        │                              ↓
                        │                    src/models/agent-session.ts (AgentSession: Claude Agent SDK query())
                        │                              ↕ SSE, 4 MCP servers, identity via a token header
                        │                          ../mcp/ (validation-mcp, stock-mcp, admin-mcp, transfer-mcp)
                        ↓
                src/models/chat-store.ts (in-memory chats + messages, holds identity per chat)
```

- **`server/main.ts`** — entrypoint; wires `createApp()` + `createWsServer()` onto one `http.Server`.
- **`src/app.ts`** — Express REST routes (`/api/auth/login`, `/api/chats*`), plus static file serving for the built client in production.
- **`src/ws-server.ts`** — WebSocket connection handling and a 30s ping/pong heartbeat.
- **`src/session-registry.ts`** — the shared `chatId -> Session` map.
- **`src/models/session.ts`** — one `Session` per chat; owns an `AgentSession`, broadcasts to WebSocket clients, persists messages.
- **`src/models/agent-session.ts`** — wraps the Claude Agent SDK's `query()`, fed by `models/message-queue.ts`'s push-based async iterator.
- **`src/ai-client.ts`** — `MCP_HOST`, `getAllowedToolsForRole`, the `UserMessage` type, and a re-export of `buildSystemPrompt` (implementation in `src/prompts/`).
- **`src/models/chat-store.ts`** — in-memory store for chats and messages; each `Chat` carries the `LoginIdentity` it was created with.
- **`src/prompts/`** — system prompt composition; see [`../ARCHITECTURE.md`](../ARCHITECTURE.md#chat-app-system-prompt-structure).

## Production Considerations

This is an example app for demonstration purposes. For production use, consider:

1. **Isolate the Agent SDK** - Move the SDK into a separate container/service.

2. **Persistent storage** - Replace the in-memory `ChatStore` with a database. Currently all chats are lost on server restart.

3. **Transcript syncing** - For Agent Sessions to be persisted across server restarts, you'll need to persist and restore the SDK's conversation transcripts. The SDK maintains internal state for multi-turn conversations that must be synced with your storage.

4. **Real session/token handling** - The login token currently lives in the client's React state and gets baked verbatim into each chat's system prompt. A production version would use a proper session mechanism (e.g. an httpOnly cookie + server-side session store) instead of trusting the client to carry the token, and would refresh/expire it rather than treating it as good for the lifetime of the chat.
