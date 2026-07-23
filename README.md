# Stock Correction Chatbot Agent

A conversational interface for store managers, store associates, and admins
to perform stock corrections: **Zeroisation** (writing off damaged/expired/
spoiled stock entirely, Manager-only), **Stock Adjustment** (reducing a
product's on-hand quantity by a partial amount, Manager or Associate), and
**Store-to-Store Transfer** (Manager-only: create a request, list outgoing/
incoming activity, and approve an incoming request — which credits the
destination store's real stock). A third role, **Admin**, uses the same chat
interface to view the manager/associate roster and set each associate's
stock-adjustment threshold, and is barred from Zeroisation, Stock Adjustment,
and Transfer.

- **How it all fits together**: [`ARCHITECTURE.md`](ARCHITECTURE.md) — the
  single source of truth for cross-component design decisions, identity
  flow, RBAC, and the Transfer lifecycle, with diagrams.
- **Engineering guide for working in this repo**: [`CLAUDE.md`](CLAUDE.md) —
  commands, conventions, and gotchas for whoever (or whatever agent) is
  editing this code.

## Components

| Component | Dir | Description |
|---|---|---|
| Java mock backend | [`services/`](services/) ([README](services/README.md)) | 4 Spring Boot apps (auth, validation, stock, transfer), behind an nginx gateway |
| MCP server | [`mcp/`](mcp/) ([README](mcp/README.md)) | Node.js/Express server exposing 4 MCP servers (validation, stock, admin, transfer) over SSE, proxying to the Java backend |
| Chat app | [`simple-chatapp/`](simple-chatapp/) ([README](simple-chatapp/README.md)) | React + Express + WebSocket UI with the Claude Agent SDK |

## Quickstart

From the repo root:

```bash
cp .env.example .env   # set ANTHROPIC_API_KEY — docker-compose injects it
                        # into the chatapp container at runtime
docker-compose up --build
```

This starts auth/validation/stock/transfer + the nginx gateway (`:8080`),
`mcp` (`:3000`), and `chatapp` (`:3001`) together on one Docker network.
Visit http://localhost:3001 and log in with a seeded account — a store
manager (`user001` / `password123`), store associate (`user004` /
`password123`), or admin (`user006` / `password123`). See each component's
README for the full test-account table and per-service commands.

For local development with hot reload (running each service directly with
Gradle/`npm run dev` instead of Docker) and environment variables, see
[`CLAUDE.md`](CLAUDE.md).
