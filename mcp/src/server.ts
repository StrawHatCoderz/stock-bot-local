import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./httpClient.js";
import { apiResultToToolResult, errorToToolResult } from "./toolResult.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "stock-bot-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "validate_area",
    {
      title: "Validate Area",
      description:
        "Resolve a free-text area/location name (e.g. 'Refrigerator X', 'Dairy') to a " +
        "canonical `areaId` within a store. Matching is exact, not fuzzy, and there is no " +
        "way to list all areas or get candidate suggestions — if this returns " +
        "AREA_NOT_FOUND, produce a single corrected best-guess area name and retry rather " +
        "than asking the user to enumerate options. Must be called before validate_product " +
        "or get_stock, since those are scoped to an already-validated areaId.",
      inputSchema: {
        areaName: z
          .string()
          .describe("Free-text area/location name to resolve, e.g. 'Dairy' or 'Refrigerator X'."),
      },
    },
    async ({ areaName }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const result = await callApi("POST", "/api/validation/area", {
          token,
          body: { storeId, areaName },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
  );

  server.registerTool(
    "validate_product",
    {
      title: "Validate Product",
      description:
        "Resolve a free-text product name (e.g. 'eggs') to a canonical `productId`, scoped " +
        "to a specific area already validated with validate_area — PRODUCT_NOT_FOUND means " +
        "the product isn't stocked in that area, not that it doesn't exist anywhere. As " +
        "with area validation, there is no candidate list; on PRODUCT_NOT_FOUND, retry once " +
        "with a corrected best-guess name. Skip this call entirely when the user means to " +
        "zero out an entire area rather than a single product.",
      inputSchema: {
        areaId: z.string().describe("The areaId returned by validate_area."),
        productName: z.string().describe("Free-text product name to resolve, e.g. 'eggs'."),
      },
    },
    async ({ areaId, productName }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const result = await callApi("POST", "/api/validation/product", {
          token,
          body: { storeId, areaId, productName },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
  );

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
        areaId: z.string().describe("The validated areaId to look up stock for."),
        productId: z
          .string()
          .optional()
          .describe(
            "Optional. If provided, returns just this product's quantity. If omitted, " +
              "returns every product currently stocked in the area."
          ),
      },
    },
    async ({ areaId, productId }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const result = await callApi("GET", "/api/stock", {
          token,
          query: { storeId, areaId, productId },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
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
            "Must equal the availableQuantity just read from get_stock — never a user-supplied number."
          ),
        reason: z
          .string()
          .describe("A fixed reason code mapped from the user's stated cause, e.g. SPOILED."),
        remarks: z.string().describe("The user's original free-text explanation of what happened."),
      },
    },
    async ({ areaId, productId, quantity, reason, remarks }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const requestedBy = process.env.SESSION_EMPLOYEE_ID;
        const result = await callApi("POST", "/api/stock/zeroization", {
          token,
          body: { storeId, areaId, productId, quantity, reason, remarks, requestedBy },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
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
          .describe("A single fixed reason code covering every product in the area, e.g. POWER_FAILURE."),
        remarks: z.string().describe("The user's original free-text explanation of the shared cause."),
      },
    },
    async ({ areaId, reason, remarks }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const requestedBy = process.env.SESSION_EMPLOYEE_ID;
        const result = await callApi("POST", "/api/stock/zeroization/area", {
          token,
          body: { storeId, areaId, reason, remarks, requestedBy },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
  );

  server.registerTool(
    "search_areas_fuzzy",
    {
      title: "Search Areas Fuzzy",
      description:
        "Fuzzy search for areas by name within the current store. Always use this to get a list of " +
        "candidate areas before using validate_area. If multiple candidates match, ask the user to clarify.",
      inputSchema: {
        query: z.string().describe("The partial name of the area to search for, e.g. 'fridge'"),
      },
    },
    async ({ query }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const result = await callApi("GET", "/api/validation/area/search", {
          token,
          query: { storeId, q: query },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
  );

  server.registerTool(
    "search_products_fuzzy",
    {
      title: "Search Products Fuzzy",
      description:
        "Fuzzy search for products by name within a specific validated area. Always use this to get a list of " +
        "candidate products before using validate_product. If multiple candidates match, ask the user to clarify.",
      inputSchema: {
        areaId: z.string().describe("The exact areaId the product should be in."),
        query: z.string().describe("The partial name of the product to search for, e.g. 'coke'"),
      },
    },
    async ({ areaId, query }) => {
      try {
        const token = process.env.SESSION_TOKEN;
        const storeId = process.env.SESSION_STORE_ID;
        const result = await callApi("GET", "/api/validation/product/search", {
          token,
          query: { storeId, areaId, q: query },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    }
  );

  return server;
}
