export type GoogleIdentityProfile = {
  avatarUrl?: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  providerUserId: string;
};

export type UpdateUserProfileInput = {
  /** `null` borra la biografía en base de datos. */
  bio?: string | null;
  city?: string;
  cityGooglePlaceId?: string;
  displayName?: string;
  groupInvitePolicy?: "everyone" | "from_following_only";
  pushEnabled?: boolean;
  lat?: number;
  lng?: number;
  username?: string;
  /** JSON privado; `null` borra el valor guardado. */
  outingPreferences?: Record<string, unknown> | null;
};

export type AccessTokenPayload = {
  email: string;
  sub: string;
};

export type AuthSessionPayload = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: {
    avatarUrl?: string;
    bio?: string;
    city?: string;
    cityGooglePlaceId?: string;
    displayName: string;
    email: string;
    id: string;
    isAdmin?: boolean;
    isEditor?: boolean;
    lat?: number;
    lng?: number;
    username: string;
    groupInvitePolicy?: "everyone" | "from_following_only";
    pushEnabled?: boolean;
    outingPreferences?: unknown;
  };
};

export type AuthenticateWithGoogleResult = {
  isNewUser: boolean;
  session: AuthSessionPayload;
};
