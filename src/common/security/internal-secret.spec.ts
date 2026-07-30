import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { assertInternalSecret } from "./internal-secret";

describe("assertInternalSecret", () => {
  it("accepts an exact configured secret", () => {
    expect(() => assertInternalSecret("secret-value", "secret-value")).not.toThrow();
  });

  it("rejects a missing configured secret", () => {
    expect(() => assertInternalSecret(undefined, "secret-value")).toThrow(
      ServiceUnavailableException,
    );
  });

  it("rejects missing, different, and different-length values", () => {
    expect(() => assertInternalSecret("secret-value", undefined)).toThrow(
      UnauthorizedException,
    );
    expect(() => assertInternalSecret("secret-value", "secret-valuf")).toThrow(
      UnauthorizedException,
    );
    expect(() => assertInternalSecret("secret-value", "short")).toThrow(
      UnauthorizedException,
    );
  });
});
