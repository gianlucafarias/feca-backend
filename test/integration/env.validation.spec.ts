import { describe, expect, it } from "vitest";

import { validateEnv } from "../../src/config/env.validation";

describe("validateEnv", () => {
  it("accepts a minimal test environment", () => {
    const env = validateEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:test@localhost:5432/feca_test",
      AUTH_JWT_ACCESS_SECRET: "test-jwt-secret-min-16-chars",
      GOOGLE_MAPS_API_KEY: "test-google-maps-server-key",
      GOOGLE_OAUTH_WEB_CLIENT_ID: "123456789-test.apps.googleusercontent.com",
    });

    expect(env.NODE_ENV).toBe("test");
    expect(env.PORT).toBe(3001);
    expect(env.RATE_LIMIT_LIMIT).toBe(60);
  });

  it("requires INTERNAL_NOTIFICATIONS_SECRET in production", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:prod@localhost:5432/feca",
        AUTH_JWT_ACCESS_SECRET: "prod-jwt-secret-min-16-chars",
        GOOGLE_MAPS_API_KEY: "prod-google-maps-server-key",
        GOOGLE_OAUTH_WEB_CLIENT_ID: "prod-client.apps.googleusercontent.com",
      }),
    ).toThrow();
  });
});
