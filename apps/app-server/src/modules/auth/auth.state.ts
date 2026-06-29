import { randomBytes } from "node:crypto";
import type { AuthProviderName } from "./auth.config";

export type OAuthStateRecord = {
  provider: AuthProviderName;
  state: string;
  nonce: string;
  nextPath: string;
  createdAt: Date;
  expiresAt: Date;
};

export type OAuthStateValidationReason =
  | "missing"
  | "provider_mismatch"
  | "nonce_mismatch"
  | "expired";

export type OAuthStateValidationResult =
  | {
      valid: true;
      record: OAuthStateRecord;
    }
  | {
      valid: false;
      reason: OAuthStateValidationReason;
    };

type CreateOAuthStateRecordInput = {
  provider: AuthProviderName;
  nextPath: string;
  ttlMs: number;
  now?: Date;
  state?: string;
  nonce?: string;
};

type ValidateOAuthStateRecordInput = {
  provider: AuthProviderName;
  state: string;
  nonce?: string;
  now?: Date;
};

export function createOAuthToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export function createOAuthStateRecord({
  provider,
  nextPath,
  ttlMs,
  now = new Date(),
  state = createOAuthToken(),
  nonce = createOAuthToken(),
}: CreateOAuthStateRecordInput): OAuthStateRecord {
  return {
    provider,
    state,
    nonce,
    nextPath,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  };
}

export function validateOAuthStateRecord(
  record: OAuthStateRecord | undefined,
  { provider, state, nonce, now = new Date() }: ValidateOAuthStateRecordInput,
): OAuthStateValidationResult {
  if (!record || record.state !== state) {
    return {
      valid: false,
      reason: "missing",
    };
  }

  if (record.provider !== provider) {
    return {
      valid: false,
      reason: "provider_mismatch",
    };
  }

  if (nonce !== undefined && record.nonce !== nonce) {
    return {
      valid: false,
      reason: "nonce_mismatch",
    };
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    return {
      valid: false,
      reason: "expired",
    };
  }

  return {
    valid: true,
    record,
  };
}
