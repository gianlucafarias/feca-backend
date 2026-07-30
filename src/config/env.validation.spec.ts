import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.validation";

const validProductionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://feca:secret@db:5432/feca",
  AUTH_JWT_ACCESS_SECRET: "a".repeat(48),
  GOOGLE_MAPS_API_KEY: "maps-key-production-value",
  GOOGLE_OAUTH_WEB_CLIENT_ID:
    "123456789.apps.googleusercontent.com",
  INTERNAL_NOTIFICATIONS_SECRET: "b".repeat(48),
};

describe("validateEnv", () => {
  it("accepts a minimal production configuration", () => {
    expect(validateEnv(validProductionEnv).NODE_ENV).toBe("production");
  });

  it("requires the complete Data Portability secret set", () => {
    expect(() =>
      validateEnv({
        ...validProductionEnv,
        GOOGLE_DATA_PORTABILITY_CLIENT_ID: "client-id",
      }),
    ).toThrow(/requires client id, client secret, redirect URI and token encryption key/u);
  });

  it("rejects wildcard production CORS origins", () => {
    expect(() =>
      validateEnv({
        ...validProductionEnv,
        CORS_ALLOWED_ORIGINS: "*",
      }),
    ).toThrow(/HTTPS origins without paths or wildcards/u);
  });

  it("accepts a complete, secure Data Portability configuration", () => {
    expect(() =>
      validateEnv({
        ...validProductionEnv,
        GOOGLE_DATA_PORTABILITY_CLIENT_ID: "client-id",
        GOOGLE_DATA_PORTABILITY_CLIENT_SECRET: "client-secret",
        GOOGLE_DATA_PORTABILITY_REDIRECT_URI:
          "https://api.feca.app/v1/google-data-imports/oauth/callback",
        GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY: "c".repeat(48),
      }),
    ).not.toThrow();
  });
});
