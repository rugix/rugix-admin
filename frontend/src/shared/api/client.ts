import type { api } from "../../generated";

export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: api.CommandFailureDetails;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: api.CommandFailureDetails,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const { headers, ...requestInit } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      headers: { Accept: "application/json", ...(headers ?? {}) },
    });
  } catch (error) {
    throw new ApiRequestError(
      0,
      "network-error",
      `request failed: ${unknownErrorMessage(error)}`,
    );
  }
  if (!response.ok) {
    let message =
      response.statusText || `request failed with HTTP ${response.status}`;
    let code = "request-failed";
    let details: api.CommandFailureDetails | undefined;
    try {
      const body = (await response.json()) as api.ApiErrorResponse;
      if (body?.error?.message && body.error.code) {
        message = body.error.message;
        code = body.error.code;
        details = body.error.details;
      }
    } catch (error) {
      console.warn(
        "Failed to decode the API error response; using its HTTP status.",
        error,
      );
    }
    throw new ApiRequestError(response.status, code, message, details);
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiRequestError(
      response.status,
      "invalid-response",
      `server returned invalid JSON: ${unknownErrorMessage(error)}`,
    );
  }
}

export function queryString(query?: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}) as Array<
    [string, string | number | boolean | undefined]
  >) {
    if (value !== undefined && value !== "" && value !== false) {
      params.set(key, String(value));
    }
  }
  const string = params.toString();
  return string ? `?${string}` : "";
}

function unknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
