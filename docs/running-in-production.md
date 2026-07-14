# Running the whole app in production (Docker Compose)

This runs all five containers — `auth-service`, `validation-service`,
`stock-service`, `api-gateway` (nginx), `mcp`, and `chatapp` — on one Docker
network, built from source, with no host-level Node/Java toolchain required.
See `CLAUDE.md` for the architecture and per-component dev commands; this
page is only about the "build it and run it" production path.

## Prerequisites

- Docker + Docker Compose (`docker compose version` or `docker-compose
  --version`)
- An Anthropic API key with access to the model set in
  `simple-chatapp/server/src/ai-client.ts` (currently `claude-sonnet-5`)

## 1. Create the root `.env`

`docker-compose.yml` reads a `.env` file in the repo root to substitute
`${ANTHROPIC_API_KEY}` into the `chatapp` service — the key is injected as
a container env var at runtime, it is never baked into any image layer.

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
ANTHROPIC_API_KEY=sk-ant-...   # required
COMPOSE_PARALLEL_LIMIT=1        # optional; lower this on a low-memory box —
                                 # it throttles how many of the 3 Java
                                 # services build concurrently
```

No other `.env` file is needed for this path. `simple-chatapp/server/.env`
and `mcp/.env` are only for running those two services directly on the host
(`npm run dev`) — in `docker-compose.yml`, `STOCK_API_BASE_URL`, `MCP_HOST`,
and `mcp`'s `API_BASE_URL` are already set to the container network names
(`api-gateway:80`, `mcp:3000`).

## 2. Build and start everything

From the repo root:

```bash
docker-compose up --build -d
```

First build compiles 3 Spring Boot services (Gradle), the MCP server
(TypeScript), and the chat app (client build + server compile) — expect
several minutes on a cold cache. Subsequent runs reuse Docker's layer cache
and are much faster.

## 3. Verify it's up

```bash
docker-compose ps
```

All 6 services should show `running`/`healthy`. Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001   # chatapp -> 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/me  # gateway -> reachable (401 without a token is expected)
```

| Service | Host port | Notes |
|---|---|---|
| `chatapp` | `3001` | Visit **http://localhost:3001** in a browser |
| `mcp` | `3000` | MCP tools over SSE; not meant to be hit directly |
| `api-gateway` (nginx) | `8080` | Fronts auth/validation/stock; not meant to be hit directly |
| `auth-service`, `validation-service`, `stock-service` | *(none)* | Only reachable inside the Docker network, via the gateway |

## 4. Log in

Visit http://localhost:3001 and sign in with a seeded store manager account
(`MockAuthData.java`, all passwords `password123`):

| username | role | store | notes |
|---|---|---|---|
| `priya.k` | STORE_MANAGER | STORE-101 | happy path |
| `raj.kumar` | STORE_MANAGER | STORE-102 | happy path, different store |
| `sam.t` | STORE_ASSOCIATE | *(none)* | rejected at login |
| `alex.w` | STORE_ASSOCIATE | STORE-101 | logs in, blocked on zeroisation tools |

## 5. Logs / troubleshooting

```bash
docker-compose logs -f chatapp        # tail one service
docker-compose logs -f                # tail everything
```

- `chatapp` exits or the agent errors immediately → `ANTHROPIC_API_KEY` is
  missing/invalid. Confirm it resolved correctly:
  `docker-compose config | grep -A3 'ANTHROPIC_API_KEY'` (prints the
  resolved value — don't paste this output anywhere shared).
- Login succeeds but tool calls fail → check `mcp` and `api-gateway` logs;
  `mcp`'s `API_BASE_URL` and `chatapp`'s `STOCK_API_BASE_URL` must both
  point at `http://api-gateway:80` (already set in `docker-compose.yml`,
  only relevant if you've edited it).

## 6. Rebuilding after code changes

```bash
docker-compose up --build -d chatapp   # rebuild + restart just one service
docker-compose up --build -d           # rebuild + restart everything
```

## 7. Stopping

```bash
docker-compose down            # stop and remove containers, keep images
docker-compose down --rmi local # also remove the images this compose file built
```
