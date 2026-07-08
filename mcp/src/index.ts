#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // stdout is reserved for the MCP protocol stream — log fatal errors to stderr.
  console.error("Fatal error starting stock-bot-mcp:", err);
  process.exit(1);
});
