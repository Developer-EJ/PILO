import { Injectable } from "@nestjs/common";
import type { AuthProviderName } from "./auth.config";
import {
  createOAuthStateRecord,
  validateOAuthStateRecord,
  type OAuthStateRecord,
  type OAuthStateValidationResult,
} from "./auth.state";

@Injectable()
export class AuthRepository {
  readonly storageMode = "not-connected";

  private readonly oauthStates = new Map<string, OAuthStateRecord>();

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
}
