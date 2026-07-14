# Simple Chat App

A Stock Zeroisation chat assistant built on the Claude Agent SDK. The agent's
tools come from `../mcp/` (an MCP server over stdio), which proxies to the
real Auth/Validation/Stock backend under `../services/` — see
`phase-1/05_api-contract.md` for what those tools actually do.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express + WebSocket (ws)
- **Agent**: Claude Agent SDK integrated directly on the server, with `../mcp/`
  registered as a stdio MCP server (`server/src/ai-client.ts`)
- **Login**: a direct server-side call to the real Auth service
  (`POST /api/login` + `GET /api/me`), not something the agent negotiates —
  see "Login flow" below

## Running the App

Requires the mock backend (`../services/`, via `docker-compose up --build`
or the three `bootRun` processes) and `../mcp/` built (`npm run build`)
first — see `README.md`.

`client/` and `server/` are independent packages with their own
`package.json` — install and run each separately, in two terminals:

```bash
cd simple-chatapp/server
npm install
cp .env.example .env   # set ANTHROPIC_API_KEY
npm run dev             # Express + WebSocket on http://localhost:3001
```

```bash
cd simple-chatapp/client
npm install
npm run dev             # Vite dev server on http://localhost:5173
```

Visit http://localhost:5173 — you'll land on a login form before the chat UI.

## Login flow

1. `LoginForm.tsx` posts `{username, password}` to `POST /api/auth/login`.
2. `server/src/app.ts` calls the real Auth service directly: `POST /api/login` for a
   token, then `GET /api/me` to confirm the employee is an authorized store
   manager. This never touches the LLM — login is deterministic, not a
   reasoning task.
3. The resulting identity (`token`, `employee_id`, `employee_number`, `name`,
   `email`, `storeId`) is returned to the client, which holds it in React
   state and sends it along in the body of every `POST /api/chats` call.
4. `chat-store.ts` stores the identity on the `Chat` record. `session.ts`
   reads it back when constructing that chat's `AgentSession`.
5. `ai-client.ts` bakes the identity into the system prompt (token/employee_id/
   storeId as plain facts) — the agent is told it's already logged in and
   never calls `authenticate_user`/`get_user_details` itself (those tools
   exist on the MCP server but aren't in this agent's `allowedTools`).

## Project Structure

```
simple-chatapp/
├── client/                    # React frontend (own package.json)
│   ├── App.tsx               # Main app component, login gate
│   ├── index.tsx             # Entry point
│   ├── index.html            # HTML template
│   ├── globals.css           # Tailwind CSS
│   ├── components/
│   │   ├── LoginForm.tsx     # Username/password form, calls POST /api/auth/login
│   │   ├── ChatList.tsx      # Left sidebar with chat list + logged-in identity/logout
│   │   └── ChatWindow.tsx    # Main chat interface
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
├── server/                    # Express + WebSocket backend (own package.json)
│   ├── main.ts                # Entrypoint: creates app + WS server, starts listening
│   ├── src/
│   │   ├── app.ts             # Express app factory (REST routes), POST /api/auth/login
│   │   ├── ws-server.ts       # WebSocket server factory (connection handling, heartbeat)
│   │   ├── session-registry.ts # Shared chatId -> Session map
│   │   ├── ai-client.ts       # Claude Agent SDK wrapper, MCP server registration, system prompt
│   │   ├── session.ts         # Chat session management, reads identity for AgentSession
│   │   ├── chat-store.ts      # In-memory chat storage (now carries identity per chat)
│   │   └── types.ts           # TypeScript types, incl. LoginIdentity
│   ├── .env.example           # ANTHROPIC_API_KEY, STOCK_API_BASE_URL, PORT
│   ├── package.json
│   └── tsconfig.json
└── Dockerfile                  # multi-stage: build client, compile server, backend-only final image
```

## API Endpoints

### REST API

- `POST /api/auth/login` - Login (direct Auth-service call, see "Login flow")
- `GET /api/chats` - List all chats
- `POST /api/chats` - Create new chat (body: `{ title?, identity }`)
- `GET /api/chats/:id` - Get chat details
- `DELETE /api/chats/:id` - Delete chat
- `GET /api/chats/:id/messages` - Get chat messages

### WebSocket (`ws://localhost:3001/ws`)

**Client -> Server:**
- `{ type: "subscribe", chatId: string }` - Subscribe to a chat
- `{ type: "chat", chatId: string, content: string }` - Send message

**Server -> Client:**
- `{ type: "connected" }` - Connection established
- `{ type: "history", messages: [...] }` - Chat history
- `{ type: "assistant_message", content: string }` - AI response
- `{ type: "tool_use", toolName: string, toolInput: {...} }` - Tool being used
- `{ type: "result", success: boolean }` - Query complete
- `{ type: "error", error: string }` - Error occurred

## Notes

- In-memory storage (data lost on restart, including logged-in identity —
  refreshing the page returns to the login form)
- Agent's `allowedTools` is restricted to the 5 stock-operation MCP tools
  (`validate_area`, `validate_product`, `get_stock`, `create_zeroization`,
  `create_area_zeroization`) — no Bash/Read/Write/file/web access, unlike
  the original demo scaffold this was built from
- Uses Vite for frontend development with hot reload
- Backend uses `tsx` for TypeScript execution in dev; the Docker image
  compiles the server with `tsc` and runs plain `node dist/main.js`
  instead (`server/package.json`'s `build`/`start` scripts)
