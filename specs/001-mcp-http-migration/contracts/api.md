# HTTP Contract for MCP Servers

## Base Endpoints

### Server 1
- **POST** `/mcp1/messages`: Accepts standard MCP JSON-RPC messages for Server 1.
- **GET** `/mcp1/sse`: (If SSE transport is used) Establishes server-to-client event stream.

### Server 2
- **POST** `/mcp2/messages`: Accepts standard MCP JSON-RPC messages for Server 2.
- **GET** `/mcp2/sse`: (If SSE transport is used) Establishes server-to-client event stream.

All endpoints adhere to the standard MCP JSON-RPC over HTTP transport specifications.
