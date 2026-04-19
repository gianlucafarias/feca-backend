import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppEnvironment } from "./env.validation";

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<AppEnvironment, true>) {}

  get nodeEnv() {
    return this.configService.get("NODE_ENV", { infer: true });
  }

  get port() {
    return this.configService.get("PORT", { infer: true });
  }

  get databaseUrl() {
    return this.configService.get("DATABASE_URL", { infer: true });
  }

  get authJwtAccessSecret() {
    return this.configService.get("AUTH_JWT_ACCESS_SECRET", { infer: true });
  }

  get authAccessTokenTtlMinutes() {
    return this.configService.get("AUTH_ACCESS_TOKEN_TTL_MINUTES", {
      infer: true,
    });
  }

  get authRefreshTokenTtlDays() {
    return this.configService.get("AUTH_REFRESH_TOKEN_TTL_DAYS", {
      infer: true,
    });
  }

  get googleMapsApiKey() {
    return this.configService.get("GOOGLE_MAPS_API_KEY", { infer: true });
  }

  get googleOAuthWebClientId() {
    return this.configService.get("GOOGLE_OAUTH_WEB_CLIENT_ID", {
      infer: true,
    });
  }

  get googlePlacesCountry() {
    return this.configService.get("GOOGLE_PLACES_COUNTRY", { infer: true });
  }

  get googlePlacesLanguage() {
    return this.configService.get("GOOGLE_PLACES_LANGUAGE", { infer: true });
  }

  get googlePlacesRadiusMeters() {
    return this.configService.get("GOOGLE_PLACES_RADIUS_METERS", {
      infer: true,
    });
  }

  get cacheTtlMs() {
    return this.configService.get("CACHE_TTL_MS", { infer: true });
  }

  get cacheMaxItems() {
    return this.configService.get("CACHE_MAX_ITEMS", { infer: true });
  }

  get rateLimitTtl() {
    return this.configService.get("RATE_LIMIT_TTL", { infer: true });
  }

  get rateLimitLimit() {
    return this.configService.get("RATE_LIMIT_LIMIT", { infer: true });
  }

  get corsAllowedOrigins() {
    const value = this.configService.get("CORS_ALLOWED_ORIGINS", { infer: true });

    if (!value) {
      return [];
    }

    return value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get trustProxy() {
    return this.configService.get("TRUST_PROXY", { infer: true });
  }

  /**
   * Emails de administradores de producto (comparación case-insensitive).
   * Vacío si `FECA_ADMIN_EMAILS` no está definido.
   */
  get fecaAdminEmailSet(): Set<string> {
    const raw = this.configService.get("FECA_ADMIN_EMAILS", { infer: true });
    if (!raw) {
      return new Set();
    }
    return new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  isFecaAdminEmail(email: string): boolean {
    return this.fecaAdminEmailSet.has(email.trim().toLowerCase());
  }
}
