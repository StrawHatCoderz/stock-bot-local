import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./httpClient.js";
import { apiResultToToolResult, errorToToolResult } from "./toolResult.js";
import { getSessionToken } from "./context.js";

export const createStockMCPServer = (options: {
  name: string;
  version: string;
}): McpServer => {
  const server = new McpServer(options);
  server.registerTool(
    "get_stock",
    {
      title: "Get Stock",
      description:
        "Look up current on-hand quantity for a validated area. Pass `productId` to get " +
        "one product's `availableQuantity` — this exact number must be used as `quantity` " +
        "on create_zeroization; never ask the user for a quantity, always read it from " +
        "here. Omit `productId` to get every product currently stocked in the area with " +
        "its own quantity, which is needed before confirming or running " +
        "create_area_zeroization for a whole-area zero-out. A quantity of 0, or an empty " +
        "product list, is a normal result, not an error — it means there is nothing to zero.",
      inputSchema: {
        areaId: z
          .string()
          .describe("The validated areaId to look up stock for."),
        productId: z
          .string()
          .optional()
          .describe(
            "Optional. If provided, returns just this product's quantity. If omitted, " +
              "returns every product currently stocked in the area.",
          ),
      },
    },
    async ({ areaId, productId }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("GET", "/api/stock", {
          token,
          query: { areaId, productId },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "create_zeroization",
    {
      title: "Create Zeroization",
      description:
        "Zero out the stock of a single product in a single area. `quantity` must be " +
        "exactly the `availableQuantity` just read from get_stock. `reason` is a fixed " +
        "code (e.g. SPOILED) that you map from whatever the user actually said caused the " +
        "loss; `remarks` should carry the user's original free-text explanation so nothing " +
        "is lost in that mapping. " +
        "Always confirm the product and quantity with the user before calling this — it is " +
        "a destructive, auditable action.",
      inputSchema: {
        areaId: z.string(),
        productId: z.string(),
        quantity: z
          .number()
          .describe(
            "Must equal the availableQuantity just read from get_stock — never a user-supplied number.",
          ),
        reason: z
          .string()
          .describe(
            "A fixed reason code mapped from the user's stated cause, e.g. SPOILED.",
          ),
        remarks: z
          .string()
          .describe(
            "The user's original free-text explanation of what happened.",
          ),
      },
    },
    async ({ areaId, productId, quantity, reason, remarks }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("POST", "/api/stock/zeroization", {
          token,
          body: { areaId, productId, quantity, reason, remarks },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "create_area_zeroization",
    {
      title: "Create Area Zeroization",
      description:
        "Zero out every product currently stocked in one area in a single call — for a " +
        "shared-cause event like a whole refrigerator losing power, where every item in " +
        "the area needs zeroing for the same reason. There is no quantity field; the " +
        "server zeroes whatever the area-wide get_stock call already reported for every " +
        "product. Use this only when the user means the entire area, not a specific " +
        "product — for a single product use create_zeroization instead, and if different " +
        "products in the same area have different individual reasons, call " +
        "create_zeroization once per product rather than this tool. Always confirm the " +
        "full list of affected products with the user before calling this.",
      inputSchema: {
        areaId: z.string(),
        reason: z
          .string()
          .describe(
            "A single fixed reason code covering every product in the area, e.g. POWER_FAILURE.",
          ),
        remarks: z
          .string()
          .describe(
            "The user's original free-text explanation of the shared cause.",
          ),
      },
    },
    async ({ areaId, reason, remarks }) => {
      try {
        const token = getSessionToken();
        const result = await callApi("POST", "/api/stock/zeroization/area", {
          token,
          body: { areaId, reason, remarks },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  return server;
};
