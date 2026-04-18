export type GoogleIdentityProfile = {
  avatarUrl?: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  providerUserId: string;
};

export type UpdateUserProfileInput = {
  bio?: string;
  city?: string;
  cityGooglePlaceId?: string;
  displayName?: string;
  lat?: number;
  lng?: number;
  username?: string;
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
    lat?: number;
    lng?: number;
    username: string;
  };
};

export type AuthenticateWithGoogleResult = {
  isNewUser: boolean;
  session: AuthSessionPayload;
};
