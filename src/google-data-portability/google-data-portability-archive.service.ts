import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";
import { fetchWithTimeout } from "../common/http/fetch-with-timeout";
import { GOOGLE_DATA_PORTABILITY_MVP_RESOURCES } from "./google-data-portability.constants";

type ExchangeCodeResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

type InitiateArchiveResult = {
  archiveJobId: string;
  accessType?: string;
};

type ArchiveStateResult = {
  state: string;
  urls: string[];
};

@Injectable()
export class GoogleDataPortabilityArchiveService {
  constructor(private readonly config: AppConfigService) {}

  async exchangeCode(code: string): Promise<ExchangeCodeResult> {
    const clientId =
      this.config.googleDataPortabilityClientId ??
      this.config.googleOAuthWebClientId;
    const clientSecret = this.config.googleDataPortabilityClientSecret;
    const redirectUri = this.config.googleDataPortabilityRedirectUri;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException(
        "Google Data Portability OAuth is not fully configured",
      );
    }

    const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok || !isTokenResponse(payload)) {
      throw new BadGatewayException("Google OAuth code exchange failed");
    }

    return {
      accessToken: payload.access_token,
      refreshToken:
        typeof payload.refresh_token === "string"
          ? payload.refresh_token
          : undefined,
      expiresAt:
        typeof payload.expires_in === "number"
          ? new Date(Date.now() + payload.expires_in * 1000)
          : undefined,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ExchangeCodeResult> {
    const clientId =
      this.config.googleDataPortabilityClientId ??
      this.config.googleOAuthWebClientId;
    const clientSecret = this.config.googleDataPortabilityClientSecret;

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        "Google Data Portability OAuth is not fully configured",
      );
    }

    const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const payload = (await response.json()) as unknown;

    if (!response.ok || !isTokenResponse(payload)) {
      throw new BadGatewayException("Google OAuth token refresh failed");
    }

    return {
      accessToken: payload.access_token,
      expiresAt:
        typeof payload.expires_in === "number"
          ? new Date(Date.now() + payload.expires_in * 1000)
          : undefined,
    };
  }

  async initiateArchive(accessToken: string): Promise<InitiateArchiveResult> {
    const response = await fetchWithTimeout(
      "https://dataportability.googleapis.com/v1/portabilityArchive:initiate",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          resources: [...GOOGLE_DATA_PORTABILITY_MVP_RESOURCES],
        }),
      },
    );

    const payload = (await response.json()) as unknown;

    if (!response.ok || !isInitiateArchiveResponse(payload)) {
      throw new BadGatewayException("Google Data Portability archive initiation failed");
    }

    return {
      archiveJobId: payload.archiveJobId,
      accessType: payload.accessType,
    };
  }

  async getArchiveState(
    accessToken: string,
    archiveJobId: string,
  ): Promise<ArchiveStateResult> {
    const response = await fetchWithTimeout(
      `https://dataportability.googleapis.com/v1/archiveJobs/${encodeURIComponent(
        archiveJobId,
      )}/portabilityArchiveState`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );

    const payload = (await response.json()) as unknown;

    if (!response.ok || !isArchiveStateResponse(payload)) {
      throw new BadGatewayException("Google Data Portability archive state check failed");
    }

    return {
      state: payload.state,
      urls: Array.isArray(payload.urls) ? payload.urls : [],
    };
  }
}

function isTokenResponse(value: unknown): value is {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "access_token" in value &&
    typeof value.access_token === "string"
  );
}

function isArchiveStateResponse(value: unknown): value is {
  state: string;
  urls?: string[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    typeof value.state === "string" &&
    (!("urls" in value) ||
      (Array.isArray(value.urls) &&
        value.urls.every((url) => typeof url === "string")))
  );
}

function isInitiateArchiveResponse(value: unknown): value is {
  archiveJobId: string;
  accessType?: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "archiveJobId" in value &&
    typeof value.archiveJobId === "string"
  );
}
