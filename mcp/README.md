# stock-bot-mcp

MCP server exposing the Stock Correction backend (`../services/`) as four
role-scoped MCP servers over **SSE**: `validation-mcp`, `stock-mcp`,
`admin-mcp`, and `transfer-mcp`. It's a thin proxy — no mock data, no
business logic, no role checks of its own — every tool passes the caller's
identity token through and lets the Java backend decide. See
[`../ARCHITECTURE.md`](../ARCHITECTURE.md) for identity flow and the full
role-to-tool matrix.

## Setup

```sh
npm install
npm run build   # tsc -> build/main.js
```

## Configuration

The server proxies real HTTP calls to the Java backend (`../services/`) — it
does not mock any data.

- `API_BASE_URL` — required. Base URL of the backend, typically the nginx
  gateway (`http://localhost:8080` locally, `http://api-gateway:80` in
  docker-compose). The server throws on the first tool call if unset.
- `PORT` — optional, defaults to `3000`.

## Running

```sh
npm start   # node build/main.js, after npm run build
npm run dev  # tsx main.ts directly, no build step
```

The server listens on `PORT` and exposes each MCP server as an SSE
connection — it is **not** stdio and is not spawned as a subprocess. Connect
to it with an SSE-capable MCP client (e.g. the Claude Agent SDK's
`mcpServers` config with `type: "sse"`, as `simple-chatapp/server` does).

## Identity

Every tool call carries the caller's identity as a single `x-session-token`
header on the SSE connection — not `storeId`/`employeeId`/`role` as separate
headers, and not env vars or spawn args. `src/app.ts` reads that header
per-request and runs the tool call inside `sessionContext.run(...)`
(`AsyncLocalStorage`, `src/context.ts`) — the server itself is stateless
across calls; identity is per-request, not per-process. Each tool forwards
the token as a bearer token to the Java backend, which re-verifies it itself
and derives `storeId`/`employeeId`/`role` server-side — the MCP layer never
decides authorization.

## Tools

### `validation-mcp` (`/validation`)

| Tool | API |
|---|---|
| `search_areas_fuzzy` | `GET /api/validation/area/search` |
| `search_products_fuzzy` | `GET /api/validation/product/search` |
| `validate_area` | `POST /api/validation/area` |
| `validate_product` | `POST /api/validation/product` |
| `list_areas` | `GET /api/validation/areas` |

### `stock-mcp` (`/stock`)

| Tool | API |
|---|---|
| `get_stock` | `GET /api/stock` |
| `create_zeroization` | `POST /api/stock/zeroization` |
| `create_area_zeroization` | `POST /api/stock/zeroization/area` |
| `create_adjustment` | `POST /api/stock/adjustment` |
| `get_adjustment_threshold` | `GET /api/stock/adjustment-threshold` |

### `admin-mcp` (`/admin`)

| Tool | API |
|---|---|
| `list_store_managers` | `GET /api/auth/managers` |
| `list_store_associates` | `GET /api/auth/associates` |
| `set_associate_threshold` | `PATCH /api/auth/associates/{employeeId}/threshold` |

### `transfer-mcp` (`/transfer`)

| Tool | API |
|---|---|
| `list_stores` | `GET /api/transfer/stores` |
| `create_transfer` | `POST /api/transfer` |
| `list_outgoing_transfers` | `GET /api/transfer/{storeId}/outgoing` |
| `list_incoming_transfers` | `GET /api/transfer/{storeId}/incoming` |
| `approve_transfer` | `POST /api/transfer/{transferId}/approve` |

`authenticate_user`/`get_user_details` (`POST /api/login`, `GET /api/me`)
are deliberately **not** exposed as tools anywhere — the chat app logs a
user in server-side before the agent ever starts, so the agent never
authenticates itself. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for
which roles get which tools.

Tool results pass the backend's JSON body through as-is (business failures
are ordinary 200-ish bodies with an `errorCode`, per each service's
contract) so the calling model reads `exists`/`authorized`/`status`/
`errorCode` fields itself. Only a network failure or a non-JSON response
from the backend surfaces as an MCP tool error (`isError: true`).

## Project layout

```
mcp/
  main.ts               # entrypoint: creates the app (src/app.ts) and starts listening
  src/
    app.ts              # Express app: SSE transport wiring for all four MCP servers
    config.ts           # reads API_BASE_URL
    context.ts          # AsyncLocalStorage session context (per-request identity)
    http-client.ts      # generic fetch wrapper, throws on network/parse failure
    tool-result.ts       # converts API responses/errors into MCP CallToolResult
    mcp-server-*.ts      # one createXMCPServer() per role-scoped MCP server
  build/                 # tsc output (gitignored)
```
