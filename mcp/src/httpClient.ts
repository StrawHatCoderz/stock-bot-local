import { getApiBaseUrl } from "./config.js";

export interface ApiResult {
  status: number;
  body: unknown;
}

/**
 * Thrown for failures below the API contract's business-failure layer —
 * the backend being unreachable, or returning something other than JSON.
 * 05_api-contract.md's `errorCode` shapes are always valid JSON bodies, so
 * anything that isn't one is a transport problem, not a business failure.
 */
export class ApiTransportError extends Error {}

export interface CallApiOptions {
  token?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export async function callApi(
  method: "GET" | "POST",
  path: string,
  options: CallApiOptions = {}
): Promise<ApiResult> {
  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new ApiTransportError(
      `Could not reach the backend at ${url.toString()}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const text = await response.text();
  if (text.length === 0) {
    return { status: response.status, body: null };
  }

  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    throw new ApiTransportError(
      `Backend returned a non-JSON response (HTTP ${response.status}) from ${url.toString()}`
    );
  }
}
