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
    GOOGLE_PLACES_COUNTRY: z.string().trim().length(2).default("uy"),
    GOOGLE_PLACES_LANGUAGE: z.string().trim().default("es"),
    GOOGLE_PLACES_RADIUS_METERS: z.coerce
      .number()
      .int()
      .min(100)
      .max(50000)
      .default(5000),
    CACHE_TTL_MS: z.coerce.number().int().positive().default(300000),
    CACHE_MAX_ITEMS: z.coerce.number().int().positive().default(500),
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(60),
    CORS_ALLOWED_ORIGINS: optionalStringSchema,
    /** Lista separada por comas; emails que pueden otorgarse rol editor (preview). */
    FECA_ADMIN_EMAILS: optionalStringSchema,
    /** Secret compartido para disparar jobs internos de notificaciones. */
    INTERNAL_NOTIFICATIONS_SECRET: optionalStringSchema,
    /** Opcional: bearer token para Expo Push API. */
    EXPO_ACCESS_TOKEN: optionalStringSchema,
    TRUST_PROXY: booleanLikeSchema.default(false),
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

    if (!env.INTERNAL_NOTIFICATIONS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "INTERNAL_NOTIFICATIONS_SECRET is required in production",
        path: ["INTERNAL_NOTIFICATIONS_SECRET"],
      });
    }
  });

export type AppEnvironment = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  return envSchema.parse(config);
}
