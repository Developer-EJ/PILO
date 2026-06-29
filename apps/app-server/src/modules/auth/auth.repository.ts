import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthProviderName } from "./auth.config";
import {
  createOAuthStateRecord,
  validateOAuthStateRecord,
  type OAuthStateRecord,
  type OAuthStateValidationResult,
} from "./auth.state";

export type AuthUserRecord = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type OAuthAccountRecord = {
  id: string;
  userId: string;
  provider: AuthProviderName;
  providerUserId: string;
  providerEmail: string | null;
  scopes: string[];
  tokenType: string | null;
  tokenExpiresAt: string | null;
  linkedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type OAuthIdentityProfile = {
  provider: AuthProviderName;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean | null;
};

export type OAuthTokenMetadata = {
  scopes: string[];
  tokenType: string | null;
  tokenExpiresAt: string | null;
};

export type OAuthIdentityRecord = {
  user: AuthUserRecord;
  oauthAccount: OAuthAccountRecord;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenHashAlgorithm: "hmac-sha256";
  secretVersion: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthSessionIdentity = {
  session: AuthSessionRecord;
  user: AuthUserRecord;
  oauthAccounts: OAuthAccountRecord[];
};

@Injectable()
export class AuthRepository {
  readonly storageMode = "not-connected";

  private readonly oauthStates = new Map<string, OAuthStateRecord>();

  private readonly usersById = new Map<string, AuthUserRecord>();

  private readonly userIdByEmail = new Map<string, string>();

  private readonly oauthAccountsById = new Map<string, OAuthAccountRecord>();

  private readonly oauthAccountIdByProviderKey = new Map<string, string>();

  private readonly authSessionsById = new Map<string, AuthSessionRecord>();

  private readonly authSessionIdByTokenHash = new Map<string, string>();

  createOAuthState(input: {
    provider: AuthProviderName;
    nextPath: string;
    ttlMs: number;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    this.pruneExpiredOAuthStates(now);
    const record = createOAuthStateRecord({ ...input, now });

    this.oauthStates.set(record.state, record);

    return record;
  }

  private pruneExpiredOAuthStates(now: Date) {
    for (const [state, record] of this.oauthStates.entries()) {
      if (record.expiresAt.getTime() <= now.getTime()) {
        this.oauthStates.delete(state);
      }
    }
  }

  consumeOAuthState(input: {
    provider: AuthProviderName;
    state: string;
    nonce?: string;
    now?: Date;
  }): OAuthStateValidationResult {
    const record = this.oauthStates.get(input.state);

    this.oauthStates.delete(input.state);

    return validateOAuthStateRecord(record, input);
  }

  upsertOAuthIdentity(input: {
    profile: OAuthIdentityProfile;
    token: OAuthTokenMetadata;
    now?: Date;
  }): OAuthIdentityRecord {
    const nowIso = (input.now ?? new Date()).toISOString();
    const providerKey = createProviderKey(
      input.profile.provider,
      input.profile.providerAccountId,
    );
    const existingAccountId = this.oauthAccountIdByProviderKey.get(providerKey);
    const existingAccount = existingAccountId
      ? this.oauthAccountsById.get(existingAccountId)
      : undefined;
    const email = normalizeEmail(
      input.profile.email ??
        `${input.profile.provider}-${input.profile.providerAccountId}@oauth.pilo.local`,
    );
    const existingUserId =
      existingAccount?.userId ??
      (canLinkOAuthProfileByEmail(input.profile)
        ? this.userIdByEmail.get(email)
        : undefined);
    const existingUser = existingUserId
      ? this.usersById.get(existingUserId)
      : undefined;
    const user = existingUser
      ? this.updateUserFromOAuthProfile(
          existingUser,
          input.profile,
          email,
          nowIso,
        )
      : this.createUserFromOAuthProfile(input.profile, email, nowIso);
    const oauthAccount = existingAccount
      ? this.updateOAuthAccount(
          existingAccount,
          input.profile,
          input.token,
          nowIso,
        )
      : this.createOAuthAccount(user.id, input.profile, input.token, nowIso);

    return {
      user,
      oauthAccount,
    };
  }

  listUsers() {
    return Array.from(this.usersById.values());
  }

  listOAuthAccounts() {
    return Array.from(this.oauthAccountsById.values());
  }

  createAuthSession(input: {
    userId: string;
    refreshTokenHash: string;
    tokenHashAlgorithm: "hmac-sha256";
    secretVersion: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
    now?: Date;
  }) {
    const nowIso = (input.now ?? new Date()).toISOString();
    const authSession: AuthSessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      tokenHashAlgorithm: input.tokenHashAlgorithm,
      secretVersion: input.secretVersion,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt: input.expiresAt.toISOString(),
      revokedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.authSessionsById.set(authSession.id, authSession);
    this.authSessionIdByTokenHash.set(
      authSession.refreshTokenHash,
      authSession.id,
    );

    return authSession;
  }

  listAuthSessions() {
    return Array.from(this.authSessionsById.values());
  }

  findSessionIdentityByTokenHash(
    refreshTokenHash: string,
    now = new Date(),
  ): AuthSessionIdentity | null {
    const sessionId = this.authSessionIdByTokenHash.get(refreshTokenHash);
    const session = sessionId
      ? this.authSessionsById.get(sessionId)
      : undefined;

    if (!session || session.revokedAt) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= now.getTime()) {
      return null;
    }

    const user = this.usersById.get(session.userId);

    if (!user || user.deletedAt) {
      return null;
    }

    return {
      session,
      user,
      oauthAccounts: this.listOAuthAccounts().filter(
        (oauthAccount) => oauthAccount.userId === user.id,
      ),
    };
  }

  revokeAuthSessionByTokenHash(refreshTokenHash: string, now = new Date()) {
    const sessionId = this.authSessionIdByTokenHash.get(refreshTokenHash);
    const session = sessionId
      ? this.authSessionsById.get(sessionId)
      : undefined;

    if (!session) {
      return null;
    }

    if (session.revokedAt) {
      return session;
    }

    const revokedSession: AuthSessionRecord = {
      ...session,
      revokedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.authSessionsById.set(revokedSession.id, revokedSession);

    return revokedSession;
  }

  markUserDeleted(userId: string, now = new Date()) {
    const user = this.usersById.get(userId);

    if (!user) {
      return null;
    }

    const deletedUser: AuthUserRecord = {
      ...user,
      deletedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.usersById.set(userId, deletedUser);

    return deletedUser;
  }

  private createUserFromOAuthProfile(
    profile: OAuthIdentityProfile,
    email: string,
    nowIso: string,
  ) {
    const user: AuthUserRecord = {
      id: randomUUID(),
      email,
      name: profile.name ?? email.split("@")[0],
      avatarUrl: profile.avatarUrl,
      emailVerifiedAt: profile.emailVerified ? nowIso : null,
      lastLoginAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    this.usersById.set(user.id, user);
    this.syncVerifiedEmailIndex(null, user);

    return user;
  }

  private updateUserFromOAuthProfile(
    user: AuthUserRecord,
    profile: OAuthIdentityProfile,
    email: string,
    nowIso: string,
  ) {
    const previousEmail = user.email;
    const emailVerifiedAt =
      profile.emailVerified === true
        ? nowIso
        : user.email === email
          ? user.emailVerifiedAt
          : null;

    if (user.email !== email) {
      this.userIdByEmail.delete(user.email);
    }

    const updatedUser: AuthUserRecord = {
      ...user,
      email,
      name: profile.name ?? user.name,
      avatarUrl: profile.avatarUrl ?? user.avatarUrl,
      emailVerifiedAt,
      lastLoginAt: nowIso,
      updatedAt: nowIso,
    };

    this.usersById.set(updatedUser.id, updatedUser);
    this.syncVerifiedEmailIndex(previousEmail, updatedUser);

    return updatedUser;
  }

  private syncVerifiedEmailIndex(
    previousEmail: string | null,
    user: AuthUserRecord,
  ) {
    if (previousEmail && previousEmail !== user.email) {
      this.userIdByEmail.delete(previousEmail);
    }

    if (user.emailVerifiedAt) {
      this.userIdByEmail.set(user.email, user.id);
    } else {
      this.userIdByEmail.delete(user.email);
    }
  }

  private createOAuthAccount(
    userId: string,
    profile: OAuthIdentityProfile,
    token: OAuthTokenMetadata,
    nowIso: string,
  ) {
    const oauthAccount: OAuthAccountRecord = {
      id: randomUUID(),
      userId,
      provider: profile.provider,
      providerUserId: profile.providerAccountId,
      providerEmail: profile.email ? normalizeEmail(profile.email) : null,
      scopes: token.scopes,
      tokenType: token.tokenType,
      tokenExpiresAt: token.tokenExpiresAt,
      linkedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.oauthAccountsById.set(oauthAccount.id, oauthAccount);
    this.oauthAccountIdByProviderKey.set(
      createProviderKey(oauthAccount.provider, oauthAccount.providerUserId),
      oauthAccount.id,
    );

    return oauthAccount;
  }

  private updateOAuthAccount(
    oauthAccount: OAuthAccountRecord,
    profile: OAuthIdentityProfile,
    token: OAuthTokenMetadata,
    nowIso: string,
  ) {
    const updatedOAuthAccount: OAuthAccountRecord = {
      ...oauthAccount,
      providerEmail: profile.email ? normalizeEmail(profile.email) : null,
      scopes: token.scopes,
      tokenType: token.tokenType,
      tokenExpiresAt: token.tokenExpiresAt,
      updatedAt: nowIso,
    };

    this.oauthAccountsById.set(updatedOAuthAccount.id, updatedOAuthAccount);

    return updatedOAuthAccount;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function canLinkOAuthProfileByEmail(profile: OAuthIdentityProfile) {
  return profile.email !== null && profile.emailVerified === true;
}

function createProviderKey(provider: AuthProviderName, providerUserId: string) {
  return `${provider}:${providerUserId}`;
}
