import { z } from "zod";

const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalStringSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).optional());

function looksLikePlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("replace-with") ||
    normalized.includes("change-me") ||
    normalized.includes("example")
  );
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().trim().min(1),
    AUTH_JWT_ACCESS_SECRET: z.string().trim().min(16),
    AUTH_JWT_ISSUER: z.string().trim().min(1).default("feca-backend"),
    AUTH_JWT_AUDIENCE: z.string().trim().min(1).default("feca-app"),
    AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(15),
    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    GOOGLE_MAPS_API_KEY: z.string().trim().min(1),
    GOOGLE_OAUTH_WEB_CLIENT_ID: z.string().trim().min(1),
    GOOGLE_DATA_PORTABILITY_CLIENT_ID: optionalStringSchema,
    GOOGLE_DATA_PORTABILITY_CLIENT_SECRET: optionalStringSchema,
    GOOGLE_DATA_PORTABILITY_REDIRECT_URI: optionalStringSchema,
    GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY: optionalStringSchema,
    GOOGLE_PLACES_COUNTRY: z.string().trim().length(2).default("uy"),
    GOOGLE_PLACES_LANGUAGE: z.string().trim().default("es"),
    GOOGLE_PLACES_RADIUS_METERS: z.coerce
      .number()
      .int()
      .min(100)
      .max(50000)
      .default(5000),
    GOOGLE_PLACES_LOCAL_ONLY: booleanLikeSchema.default(false),
    GOOGLE_PLACE_PHOTOS_HOME_ENABLED: booleanLikeSchema.default(false),
    GOOGLE_PLACE_PHOTOS_HOME_LIMIT: z.coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .default(6),
    GOOGLE_PLACE_PHOTOS_DETAIL_ENABLED: booleanLikeSchema.default(true),
    CACHE_TTL_MS: z.coerce.number().int().positive().default(300000),
    CACHE_MAX_ITEMS: z.coerce.number().int().positive().default(500),
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(60),
    CORS_ALLOWED_ORIGINS: optionalStringSchema,
    /** Lista separada por comas de administradores autorizados. */
    FECA_ADMIN_EMAILS: optionalStringSchema,
    /** Secret compartido para disparar jobs internos de notificaciones. */
    INTERNAL_NOTIFICATIONS_SECRET: optionalStringSchema,
    /** Opcional: bearer token para Expo Push API. */
    EXPO_ACCESS_TOKEN: optionalStringSchema,
    TRUST_PROXY: booleanLikeSchema.default(false),
    REDIS_URL: optionalStringSchema,
    /** `in-process` (default dev/test) or `pg-boss` (default production). */
    QUEUE_BACKEND: z.enum(["in-process", "pg-boss"]).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") {
      return;
    }

    if (looksLikePlaceholder(env.AUTH_JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_JWT_ACCESS_SECRET must be replaced in production",
        path: ["AUTH_JWT_ACCESS_SECRET"],
      });
    }

    if (looksLikePlaceholder(env.GOOGLE_MAPS_API_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GOOGLE_MAPS_API_KEY must be replaced in production",
        path: ["GOOGLE_MAPS_API_KEY"],
      });
    }

    if (looksLikePlaceholder(env.GOOGLE_OAUTH_WEB_CLIENT_ID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GOOGLE_OAUTH_WEB_CLIENT_ID must be replaced in production",
        path: ["GOOGLE_OAUTH_WEB_CLIENT_ID"],
      });
    }

    if (
      env.GOOGLE_DATA_PORTABILITY_CLIENT_ID &&
      looksLikePlaceholder(env.GOOGLE_DATA_PORTABILITY_CLIENT_ID)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GOOGLE_DATA_PORTABILITY_CLIENT_ID must be replaced in production",
        path: ["GOOGLE_DATA_PORTABILITY_CLIENT_ID"],
      });
    }

    if (
      env.GOOGLE_DATA_PORTABILITY_CLIENT_SECRET &&
      looksLikePlaceholder(env.GOOGLE_DATA_PORTABILITY_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "GOOGLE_DATA_PORTABILITY_CLIENT_SECRET must be replaced in production",
        path: ["GOOGLE_DATA_PORTABILITY_CLIENT_SECRET"],
      });
    }

    const portabilityValues = [
      env.GOOGLE_DATA_PORTABILITY_CLIENT_ID,
      env.GOOGLE_DATA_PORTABILITY_CLIENT_SECRET,
      env.GOOGLE_DATA_PORTABILITY_REDIRECT_URI,
      env.GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY,
    ];
    if (
      portabilityValues.some(Boolean) &&
      portabilityValues.some((value) => !value)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Google Data Portability requires client id, client secret, redirect URI and token encryption key",
        path: ["GOOGLE_DATA_PORTABILITY_CLIENT_ID"],
      });
    }

    if (
      env.GOOGLE_DATA_PORTABILITY_REDIRECT_URI &&
      !isValidProductionRedirectUri(env.GOOGLE_DATA_PORTABILITY_REDIRECT_URI)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "GOOGLE_DATA_PORTABILITY_REDIRECT_URI must be an HTTPS callback URL",
        path: ["GOOGLE_DATA_PORTABILITY_REDIRECT_URI"],
      });
    }

    if (
      env.GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY &&
      env.GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY.length < 32
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY must be at least 32 characters",
        path: ["GOOGLE_DATA_PORTABILITY_TOKEN_ENCRYPTION_KEY"],
      });
    }

    if (env.AUTH_JWT_ACCESS_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_JWT_ACCESS_SECRET must be at least 32 characters in production",
        path: ["AUTH_JWT_ACCESS_SECRET"],
      });
    }

    if (!env.INTERNAL_NOTIFICATIONS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INTERNAL_NOTIFICATIONS_SECRET is required in production",
        path: ["INTERNAL_NOTIFICATIONS_SECRET"],
      });
    } else if (
      env.INTERNAL_NOTIFICATIONS_SECRET.length < 32 ||
      looksLikePlaceholder(env.INTERNAL_NOTIFICATIONS_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "INTERNAL_NOTIFICATIONS_SECRET must be a non-placeholder value of at least 32 characters",
        path: ["INTERNAL_NOTIFICATIONS_SECRET"],
      });
    }

    if (env.CORS_ALLOWED_ORIGINS) {
      for (const origin of env.CORS_ALLOWED_ORIGINS.split(",")) {
        if (!isValidProductionOrigin(origin.trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "CORS_ALLOWED_ORIGINS must contain only HTTPS origins without paths or wildcards",
            path: ["CORS_ALLOWED_ORIGINS"],
          });
          break;
        }
      }
    }
  });

export type AppEnvironment = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}

function isValidProductionOrigin(value: string) {
  if (!value || value === "*") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value.replace(/\/$/u, "") &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isValidProductionRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.pathname.endsWith("/v1/google-data-imports/oauth/callback")
    );
  } catch {
    return false;
  }
}
