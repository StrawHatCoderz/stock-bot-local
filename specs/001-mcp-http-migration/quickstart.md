# Quickstart Validation: MCP HTTP Migration

## Prerequisites
- Node.js 18+
- curl or Postman

## Setup
1. `npm install` (in the relevant `mcp` project directory).

## Run
1. Start the Express server:
   ```bash
   node mcp/src/server.js
   ```

## Validation
1. Send an HTTP request to Server 1:
   ```bash
   curl -X POST http://localhost:3000/mcp1/messages \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 1}'
   ```
   **Expected**: A valid JSON-RPC response from Server 1.

2. Send an HTTP request to Server 2:
   ```bash
   curl -X POST http://localhost:3000/mcp2/messages \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc": "2.0", "method": "initialize", "params": {}, "id": 2}'
   ```
   **Expected**: A valid JSON-RPC response from Server 2.
