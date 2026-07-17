# Stock Correction Chatbot Agent

A conversational interface for store managers, store associates, and admins
to perform stock corrections: **Zeroisation** (writing off damaged/expired/
spoiled stock entirely, Manager-only) and **Stock Adjustment** (reducing a
product's on-hand quantity by a partial amount, Manager or Associate). A
third role, **Admin**, uses the same chat interface to view the manager/
associate roster and set each associate's stock-adjustment threshold — a
per-product quota that caps how much an associate may adjust — and is
barred from Zeroisation, Stock Adjustment, and Transfer. Store-to-Store
Transfer itself remains unimplemented (no backend/tool support exists for
it for any role).

- **Engineering guide for working in this repo**: [`CLAUDE.md`](CLAUDE.md) —
  commands, architecture, key design decisions, and the full test-account
  table; start here for anything code-related.

## Components

| Component | Dir | Description |
|---|---|---|
| Java mock backend | [`services/`](services/) | 3 Spring Boot apps (auth, validation, stock), behind an nginx gateway |
| MCP server | [`mcp/`](mcp/) ([README](mcp/README.md)) | Node.js/Express server exposing 3 MCP servers (validation, stock, admin) over SSE, proxying to the Java backend |
| Chat app | [`simple-chatapp/`](simple-chatapp/) ([README](simple-chatapp/README.md)) | React + Express + WebSocket UI with the Claude Agent SDK |

## Quickstart

From the repo root:

```bash
cp .env.example .env   # set ANTHROPIC_API_KEY — docker-compose injects it
                        # into the chatapp container at runtime
docker-compose up --build
```

This starts auth/validation/stock/nginx-gateway (gateway on
http://localhost:8080), `mcp` (:3000), and `chatapp` (:3001) together on one
Docker network. Visit http://localhost:3001 and log in with a seeded
account — a store manager (`priya.k` / `password123`), store associate
(`alex.w` / `password123`), or admin (`admin.a` / `password123`) — see
`CLAUDE.md` for the full test-account table.

For local development with hot reload, per-component commands (running
each service directly with Gradle/`npm run dev` instead of Docker), env
vars, and the full architecture diagram, see `CLAUDE.md`.
