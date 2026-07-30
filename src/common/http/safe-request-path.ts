import type { Request } from "express";

/**
 * Returns a log-safe path without query parameters or fragments.
 *
 * OAuth callbacks and legacy clients can place credentials in the query
 * string, so `originalUrl`/`url` must never be written to logs or API errors.
 */
export function getSafeRequestPath(
  request: Pick<Request, "path" | "url">,
): string {
  if (typeof request.path === "string" && request.path.length > 0) {
    return request.path;
  }

  return stripQueryAndFragment(request.url);
}

function stripQueryAndFragment(value: string): string {
  const end = [value.indexOf("?"), value.indexOf("#")]
    .filter((index) => index >= 0)
    .reduce((current, index) => Math.min(current, index), value.length);

  return value.slice(0, end) || "/";
}
