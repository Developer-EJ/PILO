import { Injectable } from "@nestjs/common";
import type { GithubSyncTarget } from "./types";

type GithubSyncOperationEventName =
  | "github_sync_retry"
  | "github_sync_terminal_failure"
  | "github_sync_rate_limit_terminal_failure";

interface GithubSyncOperationEvent {
  event: GithubSyncOperationEventName;
  jobId: string | null;
  syncRunId: string | null;
  target: GithubSyncTarget | "webhook_delivery";
  attemptCount: number | null;
  retryAfterSeconds?: number;
  rateLimitRemaining: number | null;
}

interface GithubSyncJobOperationInput {
  jobId: string;
  syncRunId: string;
  target: GithubSyncTarget;
  attemptCount: number;
  rateLimitRemaining: number | null;
}

@Injectable()
export class GithubSyncObservabilityService {
  emitRetry(input: GithubSyncJobOperationInput, retryAfterSeconds: number): void {
    this.emit({
      event: "github_sync_retry",
      ...input,
      retryAfterSeconds
    });
  }

  emitWebhookRetry(): void {
    this.emit({
      event: "github_sync_retry",
      jobId: null,
      syncRunId: null,
      target: "webhook_delivery",
      attemptCount: null,
      retryAfterSeconds: 120,
      rateLimitRemaining: null
    });
  }

  emitTerminalFailure(input: GithubSyncJobOperationInput, isRateLimited = false): void {
    this.emit({
      event: isRateLimited
        ? "github_sync_rate_limit_terminal_failure"
        : "github_sync_terminal_failure",
      ...input
    });
  }

  private emit(event: GithubSyncOperationEvent): void {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
}
