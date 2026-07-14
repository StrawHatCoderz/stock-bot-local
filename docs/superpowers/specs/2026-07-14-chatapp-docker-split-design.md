# simple-chatapp: split client/server + multi-stage Docker build

## Problem

`simple-chatapp/` currently has a single root `package.json` for both the
React client and the Express/WebSocket server, and a single-stage
`Dockerfile` that installs everything, runs `vite build`, then runs the
server with `tsx` directly out of source. This has two concrete problems:

1. **`isProd` ternary in `server/src/app.ts`** picks the static-file
   directory based on `NODE_ENV`. If that env var is missing or misspelled
   at runtime, the server silently serves from the wrong (or no) directory.
2. **The final Docker image contains the frontend source, all
   devDependencies (vite, tailwind, typescript, tsx), and both
   `package.json`s** — none of which are needed to run the production
   server. This bloats the image and blurs the line between build-time and
   run-time concerns.

## Goals

- Separate `client/` and `server/` into independently installable packages,
  each with its own `package.json`.
- Multi-stage Docker build: build the client, compile the server, then
  assemble a final image containing only the compiled server + its
  production dependencies + the built client's static assets.
- Remove the `isProd` ternary and the `NODE_ENV`-driven branching entirely.
- No root `package.json` — `client/` and `server/` are each installed and
  run independently in local dev (two terminals, no `concurrently`).

## Non-goals

- No change to the WebSocket protocol, MCP tool integration, or any
  business logic in `server/src/*.ts`.
- No change to `docker-compose.yml`'s service definitions — it already
  builds `simple-chatapp` with `context: ./simple-chatapp`, which continues
  to work unchanged since the Dockerfile's internal `COPY` paths are
  relative to that same context.
- No introduction of npm workspaces or a monorepo tool. This is a plain
  two-directory split.

## Directory layout (after)

```
simple-chatapp/
├── client/
│   ├── package.json          # react, react-dom, react-markdown, react-use-websocket, remark-gfm
│   │                          # devDeps: vite, @vitejs/plugin-react, tailwindcss, postcss,
│   │                          #          autoprefixer, typescript, @types/react, @types/react-dom
│   ├── tsconfig.json          # moved from root, scoped to client/**/*.ts(x)
│   ├── vite.config.ts         # moved from root; root: ".", build.outDir: "dist"
│   ├── tailwind.config.js     # moved from root
│   ├── postcss.config.js      # moved from root
│   ├── index.html
│   ├── App.tsx / index.tsx / globals.css
│   └── components/
├── server/
│   ├── package.json          # deps: express, cors, dotenv, uuid, ws, @anthropic-ai/claude-agent-sdk
│   │                          # devDeps: typescript, tsx, @types/node, @types/express, @types/cors,
│   │                          #          @types/uuid, @types/ws
│   ├── tsconfig.json          # moved from root, scoped to server; module/moduleResolution: NodeNext
│   ├── .env.example           # moved from simple-chatapp root
│   ├── main.ts
│   └── src/
│       ├── app.ts             # isProd ternary removed (see below)
│       └── ... (unchanged)
├── Dockerfile                 # rewritten as 3-stage build (see below)
├── docker-compose.yml         # unchanged (lives one level up, at repo root)
└── README.md                  # setup instructions updated
```

No `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`,
or `postcss.config.js` remain at `simple-chatapp/` root.

## `server/src/app.ts` static-serving change

Replace:

```ts
const isProd = process.env.NODE_ENV === "production";
const staticDir = isProd
  ? path.join(__dirname, "../../dist")
  : path.join(__dirname, "../../client");

app.use("/client", express.static(staticDir));
if (isProd) {
  app.use(express.static(staticDir));
}
```

with:

```ts
const staticDir = path.join(process.cwd(), "public");

app.use(express.static(staticDir));
```

`process.cwd()` is used instead of `__dirname` because it stays stable
regardless of how deep the compiled output lives (`dist/main.js` vs
`dist/src/app.js`), as long as the process is started from `server/` (dev)
or `/app` (the Docker image) — both of which the respective `start`
scripts and `CMD` guarantee.

In dev, `server/public` never exists, so `express.static` simply falls
through (404) for direct hits to `http://localhost:3001/` — dev traffic is
expected to go through the Vite dev server on `:5173`, which proxies
`/api` and `/ws` to `:3001` (`vite.config.ts`, unchanged). The `/client`
static mount is dropped — it isn't served correctly today either (in dev
it points at TSX source that only Vite's transform pipeline can serve),
and the new design has no dev-time equivalent to remove ambiguity about.

The `app.get("/")` handler's `res.sendFile` target updates from
`path.join(staticDir, "index.html")` to the same `staticDir` computed
above — no other change.

The `__filename`/`__dirname` computation via `fileURLToPath` at the top of
`app.ts` becomes dead code once `staticDir` is based on `process.cwd()`
and should be removed along with the now-unused `fileURLToPath` import.

## `server/tsconfig.json`

Root `tsconfig.json` today uses `"moduleResolution": "bundler"`, which is
fine when `tsx` executes TypeScript directly (as it does today, and still
will in dev) but does **not** produce runnable Node ESM output when `tsc`
is used to emit `.js` files for production. `server/tsconfig.json` sets:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Existing relative imports already use explicit `.js` extensions (e.g.
`from "./src/app.js"`), which `NodeNext` requires — no import-site changes
needed.

`client/tsconfig.json` keeps `"moduleResolution": "bundler"` (Vite handles
bundling; nothing runs `tsc --build` on the client) plus `"jsx": "react-jsx"`
and DOM libs, scoped to `client/**/*.ts(x)`.

## `server/package.json` scripts

```json
{
  "scripts": {
    "dev": "tsx watch main.ts",
    "build": "tsc",
    "start": "node dist/main.js"
  }
}
```

## `client/package.json` scripts

```json
{
  "scripts": {
    "dev": "vite --port 5173",
    "build": "vite build"
  }
}
```

`client/vite.config.ts`'s `build.outDir` changes from `"../dist"` (today,
relative to `root: "client"` at the repo's `simple-chatapp/` level) to
`"dist"` (relative to `client/` itself, since `client/` is now the whole
Vite project root) — i.e. output lands at `client/dist`.

## Dockerfile (3 stages)

```dockerfile
# ---- Build client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# ---- Compile server ----
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# ---- Production image: backend only ----
FROM node:20-alpine AS production
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist ./public

EXPOSE 3001

CMD ["node", "dist/main.js"]
```

No `ENV` instructions in the image at all: `app.ts` no longer reads
`NODE_ENV` for anything, and `PORT` already defaults to `3001` in
`main.ts` (`process.env.PORT || 3001`) if the orchestrator (e.g.
`docker-compose.yml`) doesn't set it. `EXPOSE 3001` stays — it's metadata
for tooling, not an env var.

## `.dockerignore`

Add/update `simple-chatapp/.dockerignore` to exclude both packages'
`node_modules` and build output, plus env files:

```
client/node_modules
client/dist
server/node_modules
server/dist
.env
```

## Docs to update

- `simple-chatapp/README.md` — install/run instructions become two steps
  (`cd client && npm install`, `cd server && npm install`) and dev
  becomes two terminals (`npm run dev` in each) instead of one root
  `npm run dev`.
- `simple-chatapp/CLAUDE.md` — "Running the App" section and "Project
  Structure" tree updated to match the new layout; note that `.env` now
  lives in `server/`.
- Root `/CLAUDE.md` — "Chat app" command block updated:
  ```
  cd simple-chatapp/server
  cp .env.example .env   # set ANTHROPIC_API_KEY
  npm install
  npm run dev             # starts Express on :3001
  # in a second terminal:
  cd simple-chatapp/client
  npm install
  npm run dev             # starts Vite on :5173
  ```

## Testing / verification

- `cd server && npm run build` succeeds with no TS errors (validates the
  `NodeNext` module-resolution switch against existing `.js`-suffixed
  imports).
- `cd client && npm run dev` + `cd server && npm run dev` in two
  terminals reproduces today's dev experience (login form, chat, WS)
  unchanged.
- `docker build -t chatapp -f simple-chatapp/Dockerfile simple-chatapp`
  (or `docker-compose build chatapp`) succeeds, and `docker run -p
  3001:3001 chatapp` serves the built client at `/` and functions
  end-to-end when pointed at a running backend + MCP server.
- Confirm the final image has no `client/` source, no devDependencies,
  and no root `package.json` layer (`docker run --rm chatapp sh -c "ls
  /app && ls /app/node_modules | grep -i vite"` should show no vite).
