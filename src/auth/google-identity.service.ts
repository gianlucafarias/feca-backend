import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";

import { AppConfigService } from "../config/app-config.service";
import type { GoogleIdentityProfile } from "./auth.types";

@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: AppConfigService) {}

  async verifyIdToken(idToken: string): Promise<GoogleIdentityProfile> {
    const audience = this.config.googleOAuthWebClientId;

    if (!audience) {
      throw new UnauthorizedException("Google OAuth is not configured");
    }

    const ticket = await this.client.verifyIdToken({
      audience,
      idToken,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException("Google token payload is incomplete");
    }

    return {
      avatarUrl: payload.picture ?? undefined,
      displayName: payload.name ?? payload.email,
      email: payload.email,
      emailVerified: Boolean(payload.email_verified),
      providerUserId: payload.sub,
    };
  }
}
