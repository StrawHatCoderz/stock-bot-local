# Feature Specification: MCP HTTP Migration

**Feature Branch**: `001-mcp-http-migration`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "hey i want to migrate my mcp server transport. currently i have stdio (with some issues) i want to migrate it to http. with single express server hoisting 2 mcp servers in same node js process."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Client Connects via HTTP (Priority: P1)

A client (such as an MCP client application) can connect to the MCP servers over an HTTP connection instead of the standard input/output streams.

**Why this priority**: Core objective of the migration is to transition away from stdio due to issues, making HTTP transport the primary goal.

**Independent Test**: Can be tested by starting the Express server and sending a valid MCP HTTP request (e.g., POST request) to the endpoints to verify a successful JSON-RPC response.

**Acceptance Scenarios**:

1. **Given** the node process is running the Express server, **When** the client sends a valid MCP request to the HTTP endpoint for Server 1, **Then** it receives the correct MCP response.
2. **Given** the node process is running the Express server, **When** the client sends a valid MCP request to the HTTP endpoint for Server 2, **Then** it receives the correct MCP response.

### Edge Cases

- What happens when a client sends a malformed HTTP request? (Should return a 400 Bad Request or standard JSON-RPC error).
- How does the system handle concurrent requests to both MCP servers?
- What happens if the Express server fails to bind to the specified port?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose HTTP endpoints to handle MCP JSON-RPC messages.
- **FR-002**: System MUST host exactly two MCP servers within a single Express.js application instance.
- **FR-003**: System MUST route incoming HTTP requests to the appropriate MCP server based on the endpoint path or headers.
- **FR-004**: System MUST handle request parsing, transport serialization, and deserialization for the HTTP protocol.
- **FR-005**: System MUST NOT rely on stdio for client-server communication.

### Key Entities

- **MCP Express Server**: The main Express.js application acting as the HTTP transport layer.
- **MCP Server 1 & 2**: The two instances of the Model Context Protocol servers running in the same Node.js process.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of MCP client-server communication occurs over HTTP.
- **SC-002**: Both MCP servers can be queried concurrently through the single Express server without cross-talk or blocking.
- **SC-003**: System startup initializes the Express server and both MCP servers successfully in under 5 seconds.

## Assumptions

- The existing MCP server business logic and capabilities remain unchanged; only the transport layer is being modified.
- The two MCP servers can coexist in the same Node.js event loop without blocking each other unacceptably.
- Standard HTTP/1.1 or HTTP/2 requests will be used for JSON-RPC communication (e.g. SSE for server-to-client messages if required by standard MCP HTTP transport).
