import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./http-client.js";
import { apiResultToToolResult, errorToToolResult } from "./tool-result.js";
import { getSessionToken } from "./context.js";

export const createTransferMCPServer = (options: {
  name: string;
  version: string;
}): McpServer => {
  const server = new McpServer(options);

  return server;
};
