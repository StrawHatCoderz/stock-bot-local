# Tasks: MCP HTTP Migration

**Input**: Design documents from `/specs/001-mcp-http-migration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Initialize Express and @modelcontextprotocol/sdk dependencies in `mcp/package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [x] T002 Setup the Express server application shell in `mcp/src/server.js`

---

## Phase 3: User Story 1 - Client Connects via HTTP (Priority: P1) 🎯 MVP

**Goal**: A client can connect to the MCP servers over an HTTP connection instead of the standard input/output streams.

**Independent Test**: Can be fully tested by starting the Express server and sending a valid MCP HTTP POST request to the endpoints to verify a successful JSON-RPC response.

### Implementation for User Story 1

- [x] T003 [P] [US1] Implement Server 1 logic in `mcp/src/mcp-server-1.js` (using arrow functions per Constitution)
- [x] T004 [P] [US1] Implement Server 2 logic in `mcp/src/mcp-server-2.js` (using arrow functions per Constitution)
- [x] T005 [US1] Implement Express route `/mcp1/messages` linking to Server 1 in `mcp/src/server.js`
- [x] T006 [US1] Implement Express route `/mcp2/messages` linking to Server 2 in `mcp/src/server.js`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Both servers reachable via HTTP.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T007 Run quickstart.md validation locally to ensure curl commands work.

---

## Dependencies & Execution Order

- Setup → Foundational → User Story 1 → Polish
