import { Injectable } from "@nestjs/common";
import type { GithubSyncWorkerQueueKind } from "./github-sync-worker-loop";
import type { GithubSyncTarget } from "./types";

export type GithubProviderRequestOperation =
  | "github_app_installation_get"
  | "github_app_installation_delete"
  | "github_app_installation_token_create"
  | "github_installation_rest_request"
  | "github_installation_repositories_list"
  | "github_repository_issues_list"
  | "github_repository_issue_get"
  | "github_repository_issue_update"
  | "github_repository_issue_create"
  | "github_repository_issue_assignees_update"
  | "github_repository_assignees_list"
  | "github_repository_pull_requests_list"
  | "github_pull_request_files_list"
  | "github_pull_request_get"
  | "github_repository_compare_get"
  | "github_repository_file_content_get"
  | "github_user_rest_request"
  | "github_graphql_project_v2_read"
  | "github_graphql_project_v2_write";

export type GithubProviderRequestAuthKind =
  | "installation"
  | "user_oauth"
  | "app_jwt"
  | "personal_project_v2_oauth";

type GithubProviderRequestOutcome = "success" | "failure";

export interface GithubProviderRequestObservedInput {
  operation: GithubProviderRequestOperation;
  authKind: GithubProviderRequestAuthKind;
  outcome: GithubProviderRequestOutcome;
  status: number | null;
  durationMs: number;
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitUsed: number | null;
  rateLimitReset: number | null;
  rateLimitResource: string | null;
}

type GithubProviderRequestObservedEvent = GithubProviderRequestObservedInput & {
  event: "github_provider_request_observed";
};

type GithubSyncOperationEventName =
  | "github_sync_retry"
  | "github_sync_terminal_failure"
  | "github_sync_rate_limit_terminal_failure"
  | "github_sync_rate_limit_observed"
  | "github_sync_worker_poll_retry";

interface GithubSyncOperationEvent {
  event: GithubSyncOperationEventName;
  jobId: string | null;
  syncRunId: string | null;
  deliveryId: string | null;
  target: GithubSyncTarget | "webhook_delivery" | "graphql" | "worker_poll";
  attemptCount: number | null;
  queueKind?: GithubSyncWorkerQueueKind;
  failureKind?: "database_session_pool_exhausted" | "unknown";
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

type GithubManualSyncObservabilityEvent =
  | { event: "github_manual_sync_idempotency_replay" }
  | { event: "github_manual_sync_active_run_reused" }
  | {
      event: "github_manual_sync_admission_rejected";
      limitScope: "user" | "workspace";
      retryAfterSeconds: number;
    }
  | { event: "github_manual_sync_queue_saturated"; retryAfterSeconds: number };

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

  emitProviderRequestObserved(input: GithubProviderRequestObservedInput): void {
    this.emit({
      event: "github_provider_request_observed",
      ...input
    });
  }

  emitWorkerPollRetry(
    queueKind: GithubSyncWorkerQueueKind,
    retryAfterMilliseconds: number,
    failureKind: "database_session_pool_exhausted" | "unknown"
  ): void {
    this.emit({
      event: "github_sync_worker_poll_retry",
      jobId: null,
      syncRunId: null,
      deliveryId: null,
      target: "worker_poll",
      attemptCount: null,
      queueKind,
      failureKind,
      retryAfterSeconds: Math.ceil(retryAfterMilliseconds / 1_000),
      rateLimitRemaining: null
    });
  }

  emitManualSyncIdempotencyReplay(): void {
    this.emit({ event: "github_manual_sync_idempotency_replay" });
  }

  emitManualSyncActiveRunReuse(): void {
    this.emit({ event: "github_manual_sync_active_run_reused" });
  }

  emitManualSyncAdmissionRejected(
    limitScope: "user" | "workspace",
    retryAfterSeconds: number
  ): void {
    this.emit({
      event: "github_manual_sync_admission_rejected",
      limitScope,
      retryAfterSeconds
    });
  }

  emitManualSyncQueueSaturated(retryAfterSeconds: number): void {
    this.emit({ event: "github_manual_sync_queue_saturated", retryAfterSeconds });
  }

  private emit(
    event:
      | GithubSyncOperationEvent
      | GithubManualSyncObservabilityEvent
      | GithubProviderRequestObservedEvent
  ): void {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
}
