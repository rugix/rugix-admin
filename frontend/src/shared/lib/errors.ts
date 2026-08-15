import { ApiRequestError } from "../api/client";

export function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    const stderrLine = error.details?.stderr
      ?.trim()
      .split("\n")
      .filter(Boolean)
      .at(-1);
    return stderrLine ? `${error.message}: ${stderrLine}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
