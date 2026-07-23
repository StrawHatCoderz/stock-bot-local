# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It's agent-operating guidance only — commands, conventions, and gotchas. For how this component actually works, see [`README.md`](README.md) (setup, project layout) and [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (identity flow, allowed-tools matrix, system prompt structure — all under "Chat App" / cross-cutting sections there).

## Repository Overview

This directory is the **chat app** component of a larger Stock Correction Chatbot system — see `../CLAUDE.md` for how it fits with the Java mock backend (`../services/`) and the MCP server (`../mcp/`), both of which must be running for this app to do anything useful beyond login.

## Commands

There is no root `package.json` — `client/` and `server/` are independent packages with their own `package.json`; install and run each separately, in two terminals. Requires the mock backend (`../services/`, via `docker-compose up --build` or the four `bootRun` processes) and `../mcp/` built (`npm run build` in that dir) running first — see `../README.md`.

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

## Notes

- Model is `claude-sonnet-5`, `maxTurns: 100`, `settingSources: []` (no `.claude/settings` merged into the agent's own config — this repo's own `.claude/` dir is for Claude Code the tool, not the agent-under-test).
- In-memory storage everywhere (`chatStore`, `session-registry`) — all chats, messages, and logged-in identity are lost on server restart; refreshing the page returns to the login form.
- `scratch/` holds working notes (`plan.md`, `scratch.md`, `frontend-refinement/`), not part of the app.
- Vite dev server proxies `/api` and `/ws` to `:3001` (`vite.config.ts`) — in dev, always hit `:5173`, not `:3001` directly, or the proxy doesn't apply.
- Backend uses `tsx` for TypeScript execution in dev; the Docker image compiles the server with `tsc` (`outDir: dist`) and runs plain `node dist/main.js` instead (`server/package.json`'s `build`/`start` scripts).
- Prompt composition (`src/prompts/`), the `McpTool`/`TOOL_GROUPS`/`ROLE_TOOLS` allowed-tools gate, and the identity-propagation sequence are all documented in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — update that file, not this one, when changing any of them.
