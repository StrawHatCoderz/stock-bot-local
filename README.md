# Stock Correction Chatbot Agent

A conversational interface for store managers to perform stock zeroisation
(writing off damaged/expired/spoiled stock) — Phase 1 scope. Waste Adjustment
and Store-to-Store Transfer are phase 2/3 and not implemented.

- **Business requirements & design**: [`docs/prd.md`](docs/prd.md)
- **Phase 1 specs**: [`docs/phase-1/`](docs/phase-1/) — `design_spec.md`
  (agent flow, intent rules) is current; `technical_spec.md` and
  `implementation_spec.md` predate later changes (the SSE migration, actual
  CI setup) — see `CLAUDE.md`'s Planning docs section for specifics
- **Engineering guide for working in this repo**: [`CLAUDE.md`](CLAUDE.md) —
  commands, architecture, key design decisions; start here for anything code-related

## Components

| Component | Dir | Description |
|---|---|---|
| Java mock backend | [`services/`](services/) | 3 Spring Boot apps (auth, validation, stock), behind an nginx gateway |
| MCP server | [`mcp/`](mcp/) ([README](mcp/README.md)) | Node.js/Express server exposing MCP tools over SSE, proxying to the Java backend |
| Chat app | [`simple-chatapp/`](simple-chatapp/) ([README](simple-chatapp/README.md)) | React + Express + WebSocket UI with the Claude Agent SDK |

## Quickstart

From the repo root:

```bash
# create simple-chatapp/.env first with ANTHROPIC_API_KEY=... — the chatapp
# image bakes in whatever's in that file at build time, so it must exist
# before you build
docker-compose up --build
```

This starts auth/validation/stock/nginx-gateway (gateway on
http://localhost:8085), `mcp` (:3000), and `chatapp` (:3001) together on one
Docker network. Visit http://localhost:3001 and log in with a seeded store
manager account (`priya.k` / `password123` — see `CLAUDE.md` for the full
test-account table).

For local development with hot reload, per-component commands, the full
architecture diagram, and known gaps (e.g. `mcp/.env.example` defaults
`API_BASE_URL` to `:8080` instead of the gateway's actual `:8085`), see
`CLAUDE.md`.
