import { Injectable } from "@nestjs/common";

import { AppConfigService } from "../config/app-config.service";

type BuildAuthorizationUrlInput = {
  importId: string;
  scopes: readonly string[];
};

@Injectable()
export class GoogleDataPortabilityAuthService {
  constructor(private readonly config: AppConfigService) {}

  buildAuthorizationUrl(input: BuildAuthorizationUrlInput): string | null {
    const clientId =
      this.config.googleDataPortabilityClientId ??
      this.config.googleOAuthWebClientId;
    const redirectUri = this.config.googleDataPortabilityRedirectUri;

    if (!clientId || !redirectUri) {
      return null;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: input.scopes.join(" "),
      state: input.importId,
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}
