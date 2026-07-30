import { describe, expect, it } from "vitest";

import { getSafeRequestPath } from "./safe-request-path";

describe("getSafeRequestPath", () => {
  it("prefers the parsed Express path", () => {
    expect(
      getSafeRequestPath({
        path: "/v1/google-data-imports/oauth/callback",
        url: "/callback?code=secret&state=secret",
      }),
    ).toBe("/v1/google-data-imports/oauth/callback");
  });

  it("removes query parameters and fragments from the fallback URL", () => {
    expect(
      getSafeRequestPath({
        path: "",
        url: "/v1/auth/refresh?refreshToken=secret#fragment",
      }),
    ).toBe("/v1/auth/refresh");
  });
});
