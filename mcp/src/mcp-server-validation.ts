import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./httpClient.js";
import { apiResultToToolResult, errorToToolResult } from "./toolResult.js";
import { getSessionToken, getSessionStoreId } from "./context.js";

export const createValidationMCPServer = (options: {
  name: string;
  version: string;
}): McpServer => {
  const server = new McpServer(options);

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
          .describe(
            "Free-text area/location name to resolve, e.g. 'Dairy' or 'Refrigerator X'.",
          ),
      },
    },
    async ({ areaName }) => {
      try {
        const token = getSessionToken();
        const storeId = getSessionStoreId();
        const result = await callApi("POST", "/api/validation/area", {
          token,
          body: { storeId, areaName },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
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
        productName: z
          .string()
          .describe("Free-text product name to resolve, e.g. 'eggs'."),
      },
    },
    async ({ areaId, productName }) => {
      try {
        const token = getSessionToken();
        const storeId = getSessionStoreId();
        const result = await callApi("POST", "/api/validation/product", {
          token,
          body: { storeId, areaId, productName },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "search_areas_fuzzy",
    {
      title: "Search Areas Fuzzy",
      description:
        "Fuzzy search for areas by name within the current store. Always use this to get a list of " +
        "candidate areas before using validate_area. If multiple candidates match, ask the user to clarify.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "The partial name of the area to search for, e.g. 'fridge'",
          ),
      },
    },
    async ({ query }) => {
      try {
        const token = getSessionToken();
        const storeId = getSessionStoreId();
        const result = await callApi("GET", "/api/validation/area/search", {
          token,
          query: { storeId, q: query },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "list_areas",
    {
      title: "List Areas",
      description:
        "List every area/location in the current store. Use this when the user asks what " +
        "areas exist (e.g. 'what areas are in my store?') rather than trying to validate or " +
        "search for a specific one.",
      inputSchema: {},
    },
    async () => {
      try {
        const token = getSessionToken();
        const storeId = getSessionStoreId();
        const result = await callApi("GET", "/api/validation/areas", {
          token,
          query: { storeId },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  server.registerTool(
    "search_products_fuzzy",
    {
      title: "Search Products Fuzzy",
      description:
        "Fuzzy search for products by name within a specific validated area. Always use this to get a list of " +
        "candidate products before using validate_product. If multiple candidates match, ask the user to clarify.",
      inputSchema: {
        areaId: z
          .string()
          .describe("The exact areaId the product should be in."),
        query: z
          .string()
          .describe(
            "The partial name of the product to search for, e.g. 'coke'",
          ),
      },
    },
    async ({ areaId, query }) => {
      try {
        const token = getSessionToken();
        const storeId = getSessionStoreId();
        const result = await callApi("GET", "/api/validation/product/search", {
          token,
          query: { storeId, areaId, q: query },
        });
        return apiResultToToolResult(result);
      } catch (err) {
        return errorToToolResult(err);
      }
    },
  );

  return server;
};
