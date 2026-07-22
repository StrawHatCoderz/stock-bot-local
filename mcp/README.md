# stock-bot-mcp

MCP server exposing the Phase 1 Zeroisation APIs (`phase-1/05_api-contract.md`) as
7 tools over stdio, so the Claude Agent SDK can call them directly instead of a
hand-built ToolExecutor. See `../plan.md` for the full spec.

## Setup

```sh
npm install
npm run build
```

## Configuration

The server proxies real HTTP calls to the Auth/Validation/Stock backend — it does
not mock any data. Set the backend's base URL before starting:

```sh
export API_BASE_URL=http://localhost:8080
```

`API_BASE_URL` is required; the server throws on startup of the first tool call if
it's unset.

## Running

```sh
npm start          # runs build/main.js
npm run dev         # runs main.ts directly via tsx, no build step
```

The server speaks MCP over stdio — it expects to be spawned as a subprocess by an
MCP client, not run standalone in a terminal.

## Connecting from the Claude Agent SDK

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "...",
  options: {
    mcpServers: {
      "stock-bot": {
        type: "stdio",
        command: "node",
        args: ["./mcp/build/main.js"],
        env: { API_BASE_URL: "http://localhost:8080" },
      },
    },
  },
})) {
  // ...
}
```

## Tools

| Tool | API |
|---|---|
| `authenticate_user` | `POST /api/login` |
| `get_user_details` | `GET /api/me` |
| `validate_area` | `POST /api/validation/area` |
| `validate_product` | `POST /api/validation/product` |
| `get_stock` | `GET /api/stock` |
| `create_zeroization` | `POST /api/stock/zeroization` |
| `create_area_zeroization` | `POST /api/stock/zeroization/area` |
| `list_store_managers` | `GET /api/auth/managers` |
| `list_store_associates` | `GET /api/auth/associates` |
| `set_associate_threshold` | `PATCH /api/auth/associates/{employeeId}/threshold` |

The last three (Admin-only) are served from a separate `admin-mcp` server —
see `src/mcp-server-admin.ts` and `src/app.ts`'s `/admin` route. This
table predates that split and otherwise still describes the original
stdio-based server layout; see root `CLAUDE.md` for the current SSE
transport and per-role tool allowlists.

Every tool that needs authorization takes `token` as an explicit input parameter —
the server is stateless and holds no session state between calls. The calling
conversation is responsible for carrying the token and identity (`storeId`,
`employee_id`) forward across tool calls.

Tool results pass the backend's JSON body through as-is (business failures are
ordinary 200-ish bodies with an `errorCode`, per the API contract) so the calling
model can read `exists`/`authorized`/`status`/`errorCode` fields itself. Only a
network failure or a non-JSON response from the backend is surfaced as an MCP tool
error (`isError: true`).

## Project layout

```
mcp/
  main.ts             # entrypoint: creates the app (src/app.ts) and starts listening
  src/
    app.ts            # Express app: SSE transport wiring for all four MCP servers
    config.ts         # reads API_BASE_URL
    http-client.ts    # generic fetch wrapper, throws ApiTransportError on network/parse failure
    tool-result.ts    # converts API responses/errors into MCP CallToolResult
    mcp-server-*.ts   # one createXMCPServer() per role-scoped MCP server
  build/              # tsc output (gitignored)
```
