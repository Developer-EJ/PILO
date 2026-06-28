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

@Injectable()
export class AuthRepository {
  readonly storageMode = "not-connected";

  private readonly oauthStates = new Map<string, OAuthStateRecord>();

  private readonly usersById = new Map<string, AuthUserRecord>();

  private readonly userIdByEmail = new Map<string, string>();

  private readonly oauthAccountsById = new Map<string, OAuthAccountRecord>();

  private readonly oauthAccountIdByProviderKey = new Map<string, string>();

  createOAuthState(input: {
    provider: AuthProviderName;
    nextPath: string;
    ttlMs: number;
    now?: Date;
  }) {
    const record = createOAuthStateRecord(input);

    this.oauthStates.set(record.state, record);

    return record;
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
      existingAccount?.userId ?? this.userIdByEmail.get(email);
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
    };

    this.usersById.set(user.id, user);
    this.userIdByEmail.set(user.email, user.id);

    return user;
  }

  private updateUserFromOAuthProfile(
    user: AuthUserRecord,
    profile: OAuthIdentityProfile,
    email: string,
    nowIso: string,
  ) {
    if (user.email !== email) {
      this.userIdByEmail.delete(user.email);
      this.userIdByEmail.set(email, user.id);
    }

    const updatedUser: AuthUserRecord = {
      ...user,
      email,
      name: profile.name ?? user.name,
      avatarUrl: profile.avatarUrl ?? user.avatarUrl,
      emailVerifiedAt:
        profile.emailVerified === true ? nowIso : user.emailVerifiedAt,
      lastLoginAt: nowIso,
      updatedAt: nowIso,
    };

    this.usersById.set(updatedUser.id, updatedUser);

    return updatedUser;
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

function createProviderKey(provider: AuthProviderName, providerUserId: string) {
  return `${provider}:${providerUserId}`;
}
