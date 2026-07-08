import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiResult, ApiTransportError } from "./httpClient.js";

export type ToolResult = CallToolResult;

/**
 * Business failures (exists:false, authorized:false, status:"FAILED", ...) are
 * ordinary bodies per phase-1/05_api-contract.md — pass them through as-is so
 * the calling model reads the errorCode itself. Only transport/parse failures
 * (see httpClient.ApiTransportError) become an MCP tool error.
 */
export function apiResultToToolResult(result: ApiResult): ToolResult {
  const body =
    result.body ?? {
      status: "FAILED",
      errorCode: "EMPTY_RESPONSE",
      message: `Backend returned HTTP ${result.status} with an empty body.`,
    };
  return { content: [{ type: "text", text: JSON.stringify(body) }] };
}

export function errorToToolResult(err: unknown): ToolResult {
  const message =
    err instanceof ApiTransportError || err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}
