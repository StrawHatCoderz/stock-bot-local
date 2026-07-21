export const MCP_HOST = process.env.MCP_HOST || "localhost:3000";

export const STOCK_API_BASE_URL = process.env.STOCK_API_BASE_URL || "http://localhost:8080";

enum McpTool {
  SearchAreasFuzzy = "mcp__validation-mcp__search_areas_fuzzy",
  SearchProductsFuzzy = "mcp__validation-mcp__search_products_fuzzy",
  ValidateArea = "mcp__validation-mcp__validate_area",
  ValidateProduct = "mcp__validation-mcp__validate_product",
  ListAreas = "mcp__validation-mcp__list_areas",
  GetStock = "mcp__stock-mcp__get_stock",
  CreateZeroization = "mcp__stock-mcp__create_zeroization",
  CreateAreaZeroization = "mcp__stock-mcp__create_area_zeroization",
  CreateAdjustment = "mcp__stock-mcp__create_adjustment",
  GetAdjustmentThreshold = "mcp__stock-mcp__get_adjustment_threshold",
  CreateTransfer = "mcp__transfer-mcp__create_transfer",
  ListOutgoingTransfers = "mcp__transfer-mcp__list_outgoing_transfers",
  ListIncomingTransfers = "mcp__transfer-mcp__list_incoming_transfers",
  ListStoreManagers = "mcp__admin-mcp__list_store_managers",
  ListStoreAssociates = "mcp__admin-mcp__list_store_associates",
  SetAssociateThreshold = "mcp__admin-mcp__set_associate_threshold",
}

const TOOL_GROUPS = {
  read: [
    McpTool.SearchAreasFuzzy,
    McpTool.SearchProductsFuzzy,
    McpTool.ValidateArea,
    McpTool.ValidateProduct,
    McpTool.ListAreas,
    McpTool.GetStock,
  ],
  adjustments: [McpTool.CreateAdjustment, McpTool.GetAdjustmentThreshold],
  zeroization: [McpTool.CreateZeroization, McpTool.CreateAreaZeroization],
  transfers: [
    McpTool.CreateTransfer,
    McpTool.ListOutgoingTransfers,
    McpTool.ListIncomingTransfers,
  ],
  admin: [
    McpTool.ListStoreManagers,
    McpTool.ListStoreAssociates,
    McpTool.SetAssociateThreshold,
  ],
} as const;

const ROLE_TOOLS = {
  STORE_MANAGER: [
    ...TOOL_GROUPS.read,
    ...TOOL_GROUPS.adjustments,
    ...TOOL_GROUPS.zeroization,
    ...TOOL_GROUPS.transfers,
  ],
  STORE_ASSOCIATE: [...TOOL_GROUPS.read, ...TOOL_GROUPS.adjustments],
  ADMIN: TOOL_GROUPS.admin,
} satisfies Record<string, readonly McpTool[]>;

export const getAllowedToolsForRole = (role: string | undefined): readonly McpTool[] =>
  (role !== undefined && (ROLE_TOOLS as Record<string, readonly McpTool[]>)[role]) ||
  TOOL_GROUPS.read;

export { buildSystemPrompt } from "./prompts/index.js";

