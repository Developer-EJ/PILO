import { Injectable } from "@nestjs/common";
import type { GithubSyncTarget } from "./types";

type GithubSyncOperationEventName =
  | "github_sync_retry"
  | "github_sync_terminal_failure"
  | "github_sync_rate_limit_terminal_failure"
  | "github_sync_rate_limit_observed";

interface GithubSyncOperationEvent {
  event: GithubSyncOperationEventName;
  jobId: string | null;
  syncRunId: string | null;
  deliveryId: string | null;
  target: GithubSyncTarget | "webhook_delivery" | "graphql";
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
      deliveryId: null,
      retryAfterSeconds
    });
  }

  emitWebhookRetry(deliveryId: string): void {
    this.emit({
      event: "github_sync_retry",
      jobId: null,
      syncRunId: null,
      deliveryId,
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
      ...input,
      deliveryId: null
    });
  }

  emitRateLimitObserved(rateLimitRemaining: number): void {
    this.emit({
      event: "github_sync_rate_limit_observed",
      jobId: null,
      syncRunId: null,
      deliveryId: null,
      target: "graphql",
      attemptCount: null,
      rateLimitRemaining
    });
  }

  private emit(event: GithubSyncOperationEvent): void {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
}
