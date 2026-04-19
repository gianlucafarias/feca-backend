import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { createHash, randomBytes } from "node:crypto";

import { AppConfigService } from "../config/app-config.service";
import { GooglePlacesClient } from "../infrastructure/google-places/google-places.client";
import { CitiesRepository } from "../infrastructure/repositories/cities.repository";
import { SocialRepository } from "../infrastructure/repositories/social.repository";
import {
  mapApiGroupInvitePolicyToPrisma,
  mapGroupInvitePolicyToApi,
  mergeSerializedUserStats,
  serializeAuthenticatedUser,
} from "../lib/api-presenters";
import { sanitizeOutingPreferences } from "../lib/outing-preferences";
import { AuthRepository } from "./auth.repository";
import type {
  AccessTokenPayload,
  AuthenticateWithGoogleResult,
  AuthSessionPayload,
  UpdateUserProfileInput,
} from "./auth.types";
import { GoogleIdentityService } from "./google-identity.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly googleIdentityService: GoogleIdentityService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
    private readonly citiesRepository: CitiesRepository,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly socialRepository: SocialRepository,
  ) {}

  async authenticateWithGoogle(
    idToken: string,
  ): Promise<AuthenticateWithGoogleResult> {
    if (!this.config.googleOAuthWebClientId) {
      throw new ServiceUnavailableException("Google OAuth is not configured");
    }

    const profile = await this.googleIdentityService.verifyIdToken(idToken);
    const result = await this.authRepository.upsertGoogleUser(profile);

    return {
      isNewUser: result.isNewUser,
      session: await this.issueSession(result.user),
    };
  }

  async refreshSession(refreshToken: string) {
    const tokenHash = hashRefreshToken(refreshToken);
    const existingSession =
      await this.authRepository.findActiveSessionByRefreshTokenHash(tokenHash);

    if (!existingSession) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.authRepository.revokeSessionById(existingSession.id);

    return this.issueSession(existingSession.user);
  }

  async logout(refreshToken: string) {
    await this.authRepository.revokeSessionByRefreshTokenHash(
      hashRefreshToken(refreshToken),
    );
  }

  async getMe(userId: string) {
    const [user, stats, socialSettings] = await Promise.all([
      this.authRepository.findUserByIdWithCity(userId),
      this.socialRepository.getProfileStats(userId),
      this.socialRepository.getSocialSettings(userId),
    ]);

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return {
      user: {
        ...mergeSerializedUserStats(
          serializeAuthenticatedUser(user, {
            isAdmin: this.config.isFecaAdminEmail(user.email),
          }),
          stats,
        ),
        groupInvitePolicy: mapGroupInvitePolicyToApi(socialSettings.groupInvitePolicy),
      },
    };
  }

  async setMyEditorFlag(userId: string, isEditor: boolean) {
    await this.authRepository.updateUserIsEditor(userId, isEditor);
    return this.getMe(userId);
  }

  async updateMe(userId: string, input: UpdateUserProfileInput) {
    const user = await this.authRepository.findUserById(userId);

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (input.username) {
      const existing = await this.authRepository.findUserByUsername(
        input.username,
      );

      if (existing && existing.id !== userId) {
        throw new ConflictException("El nombre de usuario ya está en uso");
      }
    }

    assertLocationInputConsistency(input);

    const cityId =
      input.cityGooglePlaceId !== undefined
        ? await this.resolveCityId(input.cityGooglePlaceId)
        : undefined;

    try {
      const {
        groupInvitePolicy: _groupInvitePolicy,
        outingPreferences,
        ...profileInput
      } = input;

      let outingForDb: ReturnType<typeof sanitizeOutingPreferences> | null | undefined;
      if (outingPreferences !== undefined) {
        if (outingPreferences === null) {
          outingForDb = null;
        } else {
          try {
            outingForDb = sanitizeOutingPreferences(outingPreferences);
          } catch {
            throw new BadRequestException("Formato invalido en outingPreferences");
          }
        }
      }

      const updatedUser = await this.authRepository.updateUserProfile(
        userId,
        {
          ...profileInput,
          cityId,
          ...(outingForDb !== undefined ? { outingPreferences: outingForDb } : {}),
        },
      );

      const [socialSettings, stats] = await Promise.all([
        input.groupInvitePolicy !== undefined
          ? this.socialRepository.updateSocialSettings(userId, {
              groupInvitePolicy: mapApiGroupInvitePolicyToPrisma(
                input.groupInvitePolicy,
              ),
            })
          : this.socialRepository.getSocialSettings(userId),
        this.socialRepository.getProfileStats(userId),
      ]);

      return {
        user: {
          ...mergeSerializedUserStats(
            serializeAuthenticatedUser(updatedUser, {
              isAdmin: this.config.isFecaAdminEmail(updatedUser.email),
            }),
            stats,
          ),
          groupInvitePolicy: mapGroupInvitePolicyToApi(socialSettings.groupInvitePolicy),
        },
      };
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("El nombre de usuario ya está en uso");
      }

      throw error;
    }
  }

  private async issueSession(user: User): Promise<AuthSessionPayload> {
    const accessTokenExpiresAt = addMinutes(
      new Date(),
      this.config.authAccessTokenTtlMinutes,
    );
    const refreshTokenExpiresAt = addDays(
      new Date(),
      this.config.authRefreshTokenTtlDays,
    );

    const accessTokenPayload: AccessTokenPayload = {
      email: user.email,
      sub: user.id,
    };

    const accessToken = await this.jwtService.signAsync(accessTokenPayload, {
      expiresIn: `${this.config.authAccessTokenTtlMinutes}m`,
      secret: this.config.authJwtAccessSecret,
    });

    const refreshToken = randomBytes(48).toString("base64url");

    await this.authRepository.createSession({
      expiresAt: refreshTokenExpiresAt,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userId: user.id,
    });

    const hydratedUser = await this.authRepository.findUserByIdWithCity(user.id);

    if (!hydratedUser) {
      throw new UnauthorizedException("User not found");
    }

    return {
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      user: serializeAuthenticatedUser(hydratedUser, {
        isAdmin: this.config.isFecaAdminEmail(hydratedUser.email),
      }),
    };
  }

  private async resolveCityId(cityGooglePlaceId: string) {
    try {
      const city = await this.googlePlacesClient.getCityByPlaceId(cityGooglePlaceId);
      const storedCity = await this.citiesRepository.upsertCity({
        displayName: city.displayName,
        googlePlaceId: city.cityGooglePlaceId,
        lat: city.lat,
        lng: city.lng,
        name: city.city,
      });

      return storedCity.id;
    } catch {
      throw new BadRequestException("Invalid cityGooglePlaceId");
    }
  }
}

function assertLocationInputConsistency(input: UpdateUserProfileInput) {
  const hasLat = input.lat !== undefined;
  const hasLng = input.lng !== undefined;
  const hasCity = input.city !== undefined;
  const hasCityGooglePlaceId = input.cityGooglePlaceId !== undefined;

  const locationFieldCount = [
    hasCity,
    hasCityGooglePlaceId,
    hasLat,
    hasLng,
  ].filter(Boolean).length;

  if (locationFieldCount > 0 && locationFieldCount < 4) {
    throw new UnprocessableEntityException({
      details: [
        {
          constraints: {
            locationContext:
              "city, cityGooglePlaceId, lat and lng must be sent together",
          },
          property: !hasCity
            ? "city"
            : !hasCityGooglePlaceId
              ? "cityGooglePlaceId"
              : !hasLat
                ? "lat"
                : "lng",
        },
      ],
      message: "Request validation failed",
    });
  }
}

function hashRefreshToken(refreshToken: string) {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
