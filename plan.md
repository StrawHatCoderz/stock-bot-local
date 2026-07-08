# MCP server implementation

## Context
This MCP server exposes the 7 Zeroisation-phase APIs (see `phase-1/05_api-contract.md`)
as MCP tools, so the Claude Agent SDK can call them directly via stdio instead of a
hand-built ToolExecutor. This is a new, standalone component — it is not part of the
existing phase-1 Node backend design (which assumes no MCP host).

## Tech Stack
- MCP TypeScript SDK (`@modelcontextprotocol/sdk`), stdio transport
- Node.js + TypeScript
- No mocking: tools proxy real HTTP calls to a Java backend (mock or real) at a
  configurable base URL — no Java mock API exists in this repo yet, so tools must
  be written against `05_api-contract.md`'s documented shapes and fail cleanly if
  the backend isn't reachable

## Directory structure
- Implement everything under a top-level `mcp/` directory. Other services are being
  built in parallel elsewhere in the repo — keep all MCP server code, config, and
  package files scoped to `mcp/` to avoid merge conflicts.

## Tools
One tool per API in `phase-1/05_api-contract.md`, reusing the names already given
in `phase-1/03_tech_stack.md`:

1. `authenticate_user` — `POST /api/login`. Input: `username`, `password`. Output: `token`.
2. `get_user_details` — `GET /api/me`. Input: `token`. Output: authorization + identity
   (`employee_id`, `employee_number`, name, email, `assignedTo`/storeId) or `UNAUTHORIZED_MANAGER`.
3. `validate_area` — `POST /api/validation/area`. Input: `token`, `storeId`, `areaName`.
   Output: `areaId`, `storageType`, or `AREA_NOT_FOUND`.
4. `validate_product` — `POST /api/validation/product`. Input: `token`, `storeId`, `areaId`,
   `productName`. Output: `productId`, `sku`, or `PRODUCT_NOT_FOUND`.
5. `get_stock` — `GET /api/stock`. Input: `token`, `storeId`, `areaId`, optional `productId`.
   Output: single product quantity, or full product list for the area if `productId` omitted.
6. `create_zeroization` — `POST /api/stock/zeroization`. Input: `token`, `storeId`, `areaId`,
   `productId`, `quantity`, `reason`, `remarks`, `requestedBy`.
7. `create_area_zeroization` — `POST /api/stock/zeroization/area`. Input: `token`, `storeId`,
   `areaId`, `reason`, `remarks`, `requestedBy`.

Every tool that needs authorization takes `token` (and `storeId`/`employeeId` where relevant)
as an explicit input parameter — the MCP server is stateless and holds no session state
between calls. The calling agent/conversation is responsible for carrying the token and
identity forward across tool calls within one session.

Write each tool's `description` using the context in the other phase-1 docs (especially
`01_phase_1_plan.md`, `04_planner-and-memory.md`, and the example flows in
`05_api-contract.md`) so the calling LLM understands *when* to call it, not just what it does.

## Backend connectivity
- Base URL for the backend is read from an environment variable (e.g. `API_BASE_URL`),
  no default baked in.
- Business failures come back as HTTP 200 with a body-level flag (`exists`/`authorized`/`status`)
  and an `errorCode` — treat body shape, not HTTP status, as the source of truth, except for
  `POST /api/login`, whose failure shape is an open gap in the contract (guess a `401` or a
  body-level error consistent with the rest, and note the assumption in the tool implementation).

## Transport
stdio — the Claude Agent SDK connects to local MCP servers via an `mcpServers` entry with
`type: "stdio"`, spawning this server as a subprocess.

