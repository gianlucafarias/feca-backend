import { Injectable } from "@nestjs/common";
import { AuthProvider, Prisma, type Session, type User } from "@prisma/client";
import { randomInt } from "node:crypto";

import { PrismaService } from "../database/prisma.service";
import type {
  GoogleIdentityProfile,
  UpdateUserProfileInput,
} from "./auth.types";

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async findUserByIdWithCity(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        cityRef: true,
      },
    });
  }

  async findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async upsertGoogleUser(profile: GoogleIdentityProfile) {
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.authIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: AuthProvider.google,
            providerUserId: profile.providerUserId,
          },
        },
        include: {
          user: true,
        },
      });

      if (identity) {
        const user = await tx.user.update({
          where: { id: identity.userId },
          data: {
            avatarUrl: profile.avatarUrl,
            displayName: profile.displayName,
            email: profile.email,
            emailVerified: profile.emailVerified,
          },
        });

        await tx.userSettings.upsert({
          where: { userId: identity.userId },
          update: {},
          create: {
            userId: identity.userId,
          },
        });

        await tx.authIdentity.update({
          where: { id: identity.id },
          data: {
            email: profile.email,
            emailVerified: profile.emailVerified,
          },
        });

        return {
          isNewUser: false,
          user,
        };
      }

      const existingUser = await tx.user.findUnique({
        where: { email: profile.email },
      });

      if (existingUser) {
        await tx.authIdentity.create({
          data: {
            email: profile.email,
            emailVerified: profile.emailVerified,
            provider: AuthProvider.google,
            providerUserId: profile.providerUserId,
            userId: existingUser.id,
          },
        });

        const user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            avatarUrl: profile.avatarUrl,
            displayName: profile.displayName,
            emailVerified: profile.emailVerified,
          },
        });

        await tx.userSettings.upsert({
          where: { userId: existingUser.id },
          update: {},
          create: {
            userId: existingUser.id,
          },
        });

        return {
          isNewUser: false,
          user,
        };
      }

      const username = await this.generateUniqueUsername(tx, profile);

      const user = await tx.user.create({
        data: {
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          email: profile.email,
          emailVerified: profile.emailVerified,
          username,
        },
      });

      await tx.userSettings.create({
        data: {
          userId: user.id,
        },
      });

      await tx.authIdentity.create({
        data: {
          email: profile.email,
          emailVerified: profile.emailVerified,
          provider: AuthProvider.google,
          providerUserId: profile.providerUserId,
          userId: user.id,
        },
      });

      return {
        isNewUser: true,
        user,
      };
    });
  }

  updateUserProfile(
    userId: string,
    input: UpdateUserProfileInput & { cityId?: string },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
        ...(input.lat !== undefined ? { lat: input.lat } : {}),
        ...(input.lng !== undefined ? { lng: input.lng } : {}),
      },
      include: {
        cityRef: true,
      },
    });
  }

  createSession(input: {
    expiresAt: Date;
    ipAddress?: string;
    refreshTokenHash: string;
    userAgent?: string;
    userId: string;
  }) {
    return this.prisma.session.create({
      data: input,
    });
  }

  findActiveSessionByRefreshTokenHash(refreshTokenHash: string) {
    return this.prisma.session.findFirst({
      where: {
        expiresAt: {
          gt: new Date(),
        },
        refreshTokenHash,
        revokedAt: null,
      },
      include: {
        user: true,
      },
    });
  }

  revokeSessionById(sessionId: string) {
    return this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  revokeSessionByRefreshTokenHash(refreshTokenHash: string) {
    return this.prisma.session.updateMany({
      where: {
        refreshTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private async generateUniqueUsername(
    tx: Prisma.TransactionClient,
    profile: GoogleIdentityProfile,
  ) {
    const base = sanitizeUsername(
      profile.email.split("@")[0] || profile.displayName || "feca",
    );

    let candidate = base;
    let index = 0;

    while (true) {
      const existing = await tx.user.findUnique({
        where: {
          username: candidate,
        },
      });

      if (!existing) {
        return candidate;
      }

      index += 1;
      candidate = `${base}${index === 1 ? randomInt(10, 99) : index}`;
    }
  }
}

function sanitizeUsername(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "feca";
}
