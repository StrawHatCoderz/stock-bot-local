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

  server.registerTool(
    "create_transfer",
    {
      title: "Create Store-to-Store Transfer",
      description:
        "Request a transfer of one or more products from the caller's own store to a " +
        "different destination store. Each product line is reserved from the source " +
        "store's real stock immediately and evaluated independently — one line failing " +
        "(e.g. insufficient stock) does not block the others. `requestedQuantity` for each " +
        "line must come from a prior get_stock call, never invented or estimated. Only a " +
        "store manager may call this. Always confirm every product, source area, " +
        "quantity, and the destination store with the user before calling — it moves real " +
        "stock out of the source store immediately.",
      inputSchema: {
        fromStoreId: z
          .string()
          .describe(
            "The caller's own store — must match their verified identity or the request is rejected.",
          ),
        toStoreId: z
          .string()
          .describe("The destination store. Must be a different, recognized store."),
        products: z
          .array(
            z.object({
              productId: z.string(),
              areaId: z
                .string()
                .describe(
                  "The source area within fromStoreId that currently holds this product.",
                ),
              requestedQuantity: z
                .number()
                .describe(
                  "Must come from a prior get_stock call — never invented or estimated.",
                ),
            }),
          )
          .describe(
            "One or more product lines to transfer. Each is evaluated independently — " +
              "one line failing doesn't block the others.",
          ),
      },
    },
    async ({ fromStoreId, toStoreId, products }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("POST", "/api/transfer", {
          token,
          body: { fromStoreId, toStoreId, products },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "list_outgoing_transfers",
    {
      title: "List Outgoing Transfer Requests",
      description:
        "List every transfer request the given store has initiated, most-recently-created " +
        "first, with full per-line detail. `storeId` must be the caller's own store, or the " +
        "request is rejected. Store-manager only.",
      inputSchema: {
        storeId: z
          .string()
          .describe(
            "The store whose outgoing transfer requests to list. Must be the caller's own store, or the request is rejected.",
          ),
      },
    },
    async ({ storeId }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("GET", `/api/transfer/${storeId}/outgoing`, {
          token,
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  return server;
};
