# Research: MCP HTTP Migration

## Integration Pattern: MCP over HTTP with Express
**Decision**: Use Express.js to create HTTP endpoints, and use `@modelcontextprotocol/sdk/server/express` (or equivalent HTTP/SSE transport mapping) for the two MCP servers.
**Rationale**: Express is requested by the user and is standard for Node.js web servers. The SDK provides built-in transport adapters.
**Alternatives considered**: Fastify, but Express was explicitly requested by the user.

## Hosting Multiple MCP Servers
**Decision**: Mount the two servers on different URL paths within the same Express instance (e.g., `/mcp/validation` and `/mcp/stock`).
**Rationale**: Simplest way to disambiguate traffic for the two servers without needing separate ports.
**Alternatives considered**: Header-based routing, but path-based routing is more explicit and easier to debug.
