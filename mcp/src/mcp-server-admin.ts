import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./http-client.js";
import { apiResultToToolResult, errorToToolResult } from "./tool-result.js";
import { getSessionToken } from "./context.js";

export const createAdminMCPServer = (options: {
  name: string;
  version: string;
}): McpServer => {
  const server = new McpServer(options);

  server.registerTool(
    "list_store_managers",
    {
      title: "List Store Managers",
      description:
        "List every store manager system-wide (name and assigned store). Admin-only.",
      inputSchema: {},
    },
    async () => {
      try {
        const token = getSessionToken();
        const result = await callApi("GET", "/api/auth/managers", { token });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "list_store_associates",
    {
      title: "List Store Associates",
      description:
        "List every store associate system-wide (name, assigned store, and current " +
        "stock-adjustment threshold percentage). Admin-only.",
      inputSchema: {},
    },
    async () => {
      try {
        const token = getSessionToken();
        const result = await callApi("GET", "/api/auth/associates", { token });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "set_associate_threshold",
    {
      title: "Set Associate Threshold",
      description:
        "Change a store associate's stock-adjustment threshold — the percentage ceiling " +
        "that caps how much of a product's on-hand quantity they may remove via " +
        "create_adjustment, tracked as a depleting quota per product. Admin-only. Always " +
        "confirm the target associate and new value with the user before calling this.",
      inputSchema: {
        employeeId: z
          .string()
          .describe(
            "The target associate's employeeId, as returned by list_store_associates.",
          ),
        thresholdPercent: z
          .number()
          .describe("The new threshold ceiling, 0-100."),
      },
    },
    async ({ employeeId, thresholdPercent }) => {
      try {
        const token = getSessionToken();
        const result = await callApi(
          "PATCH",
          `/api/auth/associates/${employeeId}/threshold`,
          { token, body: { thresholdPercent } },
        );
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  return server;
};
