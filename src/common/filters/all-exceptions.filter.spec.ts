import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { sanitizeHttpMessage } from "./all-exceptions.filter";

describe("sanitizeHttpMessage", () => {
  it("removes query credentials from Nest's default not-found message", () => {
    const message = sanitizeHttpMessage(
      "Cannot GET /oauth/callback?code=secret&state=secret",
      {
        method: "GET",
        path: "/oauth/callback",
        requestUrl: "/oauth/callback?code=secret&state=secret",
        status: HttpStatus.NOT_FOUND,
      },
    );

    expect(message).toBe("Cannot GET /oauth/callback");
    expect(String(message)).not.toContain("secret");
  });

  it("redacts the request target in other HTTP messages", () => {
    expect(
      sanitizeHttpMessage("Invalid /path?token=secret", {
        method: "GET",
        path: "/path",
        requestUrl: "/path?token=secret",
        status: HttpStatus.BAD_REQUEST,
      }),
    ).toBe("Invalid /path");
  });
});
