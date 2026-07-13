# Implementation Plan: MCP HTTP Migration

**Branch**: `001-mcp-http-migration` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-mcp-http-migration/spec.md`

## Summary

Migrate the MCP servers transport from stdio to HTTP using Express.js, hosting two MCP servers on a single process.

## Technical Context

**Language/Version**: Node.js 18+ (JavaScript)

**Primary Dependencies**: Express.js, @modelcontextprotocol/sdk

**Storage**: N/A

**Testing**: Jest

**Target Platform**: Node.js backend

**Project Type**: HTTP Service (Backend)

**Performance Goals**: Minimal overhead added to standard MCP requests

**Constraints**: Must host 2 MCP servers in the same Node.js process without blocking

**Scale/Scope**: Local or contained network HTTP traffic for MCP clients

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Arrow Functions**: Ensure all new function definitions use arrow functions where appropriate, honoring the constitution's lexical scoping mandate.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-http-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
mcp/
├── src/
│   ├── server.js          # Express app entry point
│   ├── mcp-server-1.js    # Logic for first MCP server
│   ├── mcp-server-2.js    # Logic for second MCP server
│   └── transport/         # Custom HTTP transport wrappers if necessary
└── tests/
```

**Structure Decision**: A dedicated `mcp/` directory (or updates to existing) will house the Express server and the two MCP servers it hosts.
