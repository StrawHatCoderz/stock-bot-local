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
              productName: z
                .string()
                .describe("From a prior validate_product call — never invented."),
              sku: z.string().describe("From a prior validate_product call."),
              unit: z.string().describe("From a prior get_stock/validate_product call."),
              areaId: z
                .string()
                .describe(
                  "The source area within fromStoreId that currently holds this product.",
                ),
              areaName: z
                .string()
                .describe("From a prior validate_area call — never invented."),
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

  server.registerTool(
    "list_incoming_transfers",
    {
      title: "List Incoming Transfer Requests",
      description:
        "List every transfer request naming the given store as destination, " +
        "most-recently-created first, with full per-line detail. `storeId` must be the " +
        "caller's own store, or the request is rejected. Store-manager only.",
      inputSchema: {
        storeId: z
          .string()
          .describe(
            "The store whose incoming transfer requests to list. Must be the caller's own store, or the request is rejected.",
          ),
      },
    },
    async ({ storeId }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("GET", `/api/transfer/${storeId}/incoming`, {
          token,
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "approve_transfer",
    {
      title: "Approve Store-to-Store Transfer Request",
      description:
        "Approve an incoming transfer request at the caller's own store, crediting the " +
        "confirmed destination area's stock for each eligible line. Only a store manager " +
        "assigned to the destination store may call this. destinationAreaId for each " +
        "product must be confirmed with the user first — either accepted from a suggested " +
        "area or explicitly chosen from list_areas — never invented. Lines already " +
        "transferred or failed are left untouched.",
      inputSchema: {
        transferId: z
          .string()
          .describe("The transfer request identifier, from list_incoming_transfers."),
        lines: z
          .array(
            z.object({
              productId: z.string(),
              destinationAreaId: z
                .string()
                .describe(
                  "The destination-store area confirmed by the manager to receive this product.",
                ),
            }),
          )
          .describe("One entry per product the manager is ready to approve this call."),
      },
    },
    async ({ transferId, lines }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("POST", `/api/transfer/${transferId}/approve`, {
          token,
          body: { lines },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  return server;
};
