# Data Model: MCP HTTP Migration

No new persistent entities are introduced.

## Ephemeral State
- **Express Server**: Holds the HTTP listener.
- **Server 1 Instance**: Maintains session state/transport state for MCP server 1.
- **Server 2 Instance**: Maintains session state/transport state for MCP server 2.
