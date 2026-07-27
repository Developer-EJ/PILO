# GitHub Sync Operations

`github-sync-worker` remains one ECS worker task for GitHub webhook deliveries and durable sync jobs. Inside that one process, the worker owns two independent long-lived polling loops: one for `github-webhooks` and one for `github-sync-jobs`. Each queue loop awaits one handler at a time, so queue-local handler concurrency stays 1; across the process, up to two handlers can be active. One queue's long poll or retry backoff does not block the other queue. This runbook covers dev monitoring and human recovery. It does not introduce a second event worker, autoscaling, or a new queue.

## Metrics and alarms

CloudWatch uses `/ecs/${name_prefix}/github-sync-worker` and existing SQS/ECS metrics. SQS age and backlog alarms evaluate in one-minute periods; operation metrics evaluate in five-minute periods. Missing SQS or operation data is not breaching. Missing worker `RunningTaskCount` is breaching.

| Target | Metric | Warning | Critical | Meaning |
| --- | --- | ---: | ---: | --- |
| `github-webhooks` | oldest message age | 60s | 300s | Webhook processing is behind user changes. |
| `github-webhooks` | visible backlog | 20 | 100 | Webhook messages are accumulating. |
| `github-sync-jobs` | oldest message age | 600s | 1800s | Durable sync-job processing is delayed. |
| `github-sync-jobs` | visible backlog | 10 | 50 | Sync jobs are accumulating. |
| `github-webhooks-dlq` | visible backlog | 1 | 10 | Webhook delivery failures are isolated. |
| `github-sync-jobs-dlq` | visible backlog | 1 | 10 | Sync-job failures are isolated. |
| `github-sync-worker` | ECS `RunningTaskCount` below 1 | 2 minutes | 5 minutes | Worker tasks are not staying healthy. |
| operation logs | `RetryCount` | 5 | 20 | Retries are concentrated in five minutes. |
| operation logs | `TerminalFailureCount` | 1 | 5 | Terminal failures occurred in five minutes. |
| operation logs | `RateLimitRemaining` | 100 | 0 | GitHub GraphQL quota is low or exhausted. |
| operation logs | `DatabasePoolExhaustedCount` | 1 | - | The worker could not acquire a Supabase session-pool connection. |

`RetryCount` is produced by `github_sync_retry`. `TerminalFailureCount` is produced by `github_sync_terminal_failure` and `github_sync_rate_limit_terminal_failure`. `RateLimitRemaining` is produced by numeric `github_sync_rate_limit_observed` events from successful GraphQL responses, so it is a pre-exhaustion signal rather than only a terminal-failure signal. `DatabasePoolExhaustedCount` is produced only when the worker classifies a database error as `EMAXCONNSESSION`. Critical requires immediate human investigation; Warning requires trend and worker-health confirmation.

Consider a separate event worker or autoscaling only after worker health is confirmed and either of these is true:

- A 15-minute window has webhook critical age or backlog.
- backlog-per-running-worker exceeds 100.

## Structured operation logs

The worker writes one raw JSON event per stdout line so CloudWatch JSON filters can read it. Event names are:

- `github_sync_retry`
- `github_sync_terminal_failure`
- `github_sync_rate_limit_terminal_failure`
- `github_sync_rate_limit_observed`
- `github_sync_worker_poll_retry`
- `github_provider_request_observed`
- `github_installation_token_cache`

The legacy sync-operation events (`github_sync_retry`, `github_sync_terminal_failure`, `github_sync_rate_limit_terminal_failure`, `github_sync_rate_limit_observed`, and `github_sync_worker_poll_retry`) contain `event`, `jobId`, `syncRunId`, `deliveryId`, `target`, `attemptCount`, and nullable `rateLimitRemaining`. Job events retain `deliveryId: null`. Retry events include `retryAfterSeconds` when known: 900 seconds for a sync job and 120 seconds for a webhook delivery. A webhook retry records its `deliveryId` and can have null `jobId`, `syncRunId`, and `attemptCount`. A successful GraphQL response with a numeric `x-ratelimit-remaining` header emits `github_sync_rate_limit_observed`; its identifiers are null and its target is `graphql`. A failed worker poll emits `github_sync_worker_poll_retry` with `target: "worker_poll"`, `queueKind: "sync_jobs" | "webhooks"`, bounded backoff, and a safe `failureKind`; it never includes the underlying database error text. Worker poll retry delays remain queue-local, so a retry backoff in one polling loop does not pause the other polling loop.

`github_provider_request_observed` is emitted once for every observed GitHub provider network request. If code performs an actual retry, each attempt emits a separate provider request event. The event fields are `operation`, `authKind`, `outcome`, `status`, `durationMs`, `rateLimitLimit`, `rateLimitRemaining`, `rateLimitUsed`, `rateLimitReset`, and `rateLimitResource`. `operation` is a bounded value such as `github_app_installation_token_create`, `github_installation_rest_request`, `github_user_rest_request`, `github_graphql_project_v2_read`, or `github_graphql_project_v2_write`. `authKind` is one of `installation`, `user_oauth`, `app_jwt`, or `personal_project_v2_oauth`. `outcome` is `success` or `failure`; `status` is null only when the request fails before an HTTP response is available. Rate-limit fields are populated only from safe GitHub response headers.

`github_installation_token_cache` is emitted for GitHub App installation-token cache lookups. Its only fields are `event` and `result`. `result` is one of `hit`, `miss`, `inflight_join`, `refresh`, or `error`. The cache is process-local to the `GithubAppClient` singleton, so a process restart creates a cold cache. The internal cache key is `appId:installationId`, but that key is never logged. Tokens are refreshed five minutes before provider expiry, concurrent cache misses for the same key use single-flight, and token creation responses with missing, invalid, or already-stale expiry metadata are not cached. A cached installation token that receives `401` is evicted only if the cache entry still matches that token, then the request is retried once with a refreshed token. `403` does not trigger token refresh. Deleting an installation evicts the cache entry when GitHub returns success or an already-deleted `404`. User OAuth tokens and Personal ProjectV2 OAuth tokens are excluded from this installation-token cache.

`github_sync_rate_limit_observed` remains as a legacy GraphQL-only signal. Existing Terraform metrics and alarms still read GraphQL `RateLimitRemaining` from that event only; provider request/cache events are available for investigation and post-change baselining until separate Infra review adds metrics or alarms.

Never log access tokens, OAuth tokens, GitHub App JWTs, private keys, webhook payloads, provider request bodies, GraphQL queries, GraphQL variables, repository names, provider URLs, installation identifiers, `appId:installationId` cache keys, raw provider errors, database URLs, passwords, or secrets. Use event identifiers, bounded enum fields, response status, safe rate-limit headers, and DB state for investigation; do not add credentials, payloads, or raw provider responses to logs or incident evidence.

## GitHub provider request and token-cache log queries

Use these CloudWatch Logs Insights queries against `/ecs/${name_prefix}/github-sync-worker` for investigation. They are log-derived diagnostics, not currently Terraform alarms.

Provider request count, average duration, and p95 duration by operation/auth kind/outcome/status:

```sql
fields @timestamp, event, operation, authKind, outcome, status, durationMs
| filter event = "github_provider_request_observed"
| stats count() as requestCount, avg(durationMs) as avgDurationMs, pct(durationMs, 95) as p95DurationMs by operation, authKind, outcome, status
| sort requestCount desc
```

Remaining budget and latest reset by rate-limit resource and operation:

```sql
fields @timestamp, event, operation, rateLimitResource, rateLimitRemaining, rateLimitReset
| filter event = "github_provider_request_observed"
| filter ispresent(rateLimitRemaining)
| stats min(rateLimitRemaining) as minRemaining, latest(rateLimitRemaining) as latestRemaining, latest(rateLimitReset) as latestReset by rateLimitResource, operation
| sort minRemaining asc
```

Installation-token cache lookup count by result:

```sql
fields @timestamp, event, result
| filter event = "github_installation_token_cache"
| stats count() as lookupCount by result
| sort lookupCount desc
```

Token-create and installation-authenticated request count by operation/auth kind/outcome/status:

```sql
fields @timestamp, event, operation, authKind, outcome, status, durationMs, rateLimitRemaining
| filter event = "github_provider_request_observed"
| filter operation = "github_app_installation_token_create" or authKind = "installation"
| stats count() as requestCount, avg(durationMs) as avgDurationMs, pct(durationMs, 95) as p95DurationMs, latest(rateLimitRemaining) as latestRemaining by operation, authKind, outcome, status
| sort requestCount desc
```

For cache effectiveness, calculate warm hit ratio as `hit / (hit + miss + inflight_join + refresh)`. Report `error` separately; do not include `error` in the denominator because it represents token lookup failure rather than a cacheable lookup outcome.

## DLQ recovery procedure

DLQ redrive is performed only by an authorized operator. It must not be run automatically by the worker, because repeated failures and mass reprocessing can be amplified.

1. Identify the failing queue or DLQ from CloudWatch, then identify the `jobId` or `deliveryId` and the corresponding `github_sync_jobs`/`github_sync_runs` or `github_webhook_deliveries` terminal state.
2. Correct the cause first: deploy or roll back code, repair queue publishing, reconnect a credential, restore permission, or wait for the GitHub rate-limit reset.
3. The authorized operator manually redrives a bounded sample. Select a small representative sample; never redrive the whole DLQ first.
4. Confirm queue oldest age and visible backlog, worker raw JSON logs, CloudWatch metrics, and DB run/delivery terminal state for the sample.
5. Only after the sample is healthy, the authorized operator manually redrives the remainder. If failures recur, preserve the remainder and return to investigation.

Do not change queue behavior during redrive: webhook visibility remains 120 seconds, sync-job visibility remains 900 seconds, and SQS redrive max receive count remains 3.

## Incident response paths

### Worker stopped

For `RunningTaskCount` Warning or Critical, inspect ECS service events and task stopped reasons. Correct image, task-role, network, or secret injection issues, then confirm at least one worker task is running. Do not classify backlog as a scaling issue before worker health is confirmed.

### Database pool exhausted

At `DatabasePoolExhaustedCount` Warning, do not restart or scale the worker first. Confirm App Server, Realtime, and GitHub sync worker task counts; then inspect the Supabase session-pool count and safe connection metadata such as `application_name`. The worker retries the failed poll with bounded backoff, so wait for the metric to stop increasing before validating queue drain. Do not expose database URLs, passwords, or raw database errors in the incident record.

## DB connection budget

The dev Supabase session pool has 15 sessions. Reserve 3 sessions for operator access and transient platform activity; application services may use at most 12.

| Service | task count | task connection cap | budgeted connections |
| --- | ---: | ---: | ---: |
| App Server | 1 | 2 | 2 |
| GitHub sync worker | 1 | 1 | 1 |
| Realtime | 1 | 1 | 1 |
| Shared AI worker | 1 | 3 persistent connections | 3 |
| Agent worker | 1 | 1 persistent connection | 1 |
| Meeting worker | 1 | 1 persistent connection | 1 |
| **Total** |  |  | **9** |

The GitHub sync worker may run up to two active handlers at once because the webhook and sync-job polling loops are independent. The task's DB connection cap remains one because `DATABASE_POOL_MAX=1` still limits the process to a single Supabase session-pool connection. Measure DB contention before considering a separate Infra or DB schema/capacity change.

The shared AI worker replacement is the largest single-service overlap: 9 + 3 = 12, which stays within the application budget. Deploy DB-using ECS services one at a time; concurrent replacements can exceed the 12-session budget even when each task follows its individual cap.

### Failed queue publish

For webhook or sync-job publish failure, inspect the application log and durable DB delivery/run state. Correct SQS endpoint, queue URL, task-role permission, or AWS availability first, then confirm persisted delivery/job recovery can publish again. Do not redrive a DLQ before its publish cause is fixed.

### DLQ alarm

For DLQ backlog of 1 or more, follow the DLQ recovery procedure. At Critical 10, pause further redrive, classify the failure causes and sample results, then escalate to the responsible operator.

### GitHub credential revoked

For revoked or invalid GitHub App/OAuth credentials, verify the workspace installation, OAuth connection, required project scope, and permissions, then reconnect. Do not copy credentials into logs or tickets. Verify the repaired permission path with a bounded sample before redriving the remainder.

### GitHub rate limit

At `RateLimitRemaining` Warning from `github_sync_rate_limit_observed`, check remaining budget and request patterns before exhaustion. At Critical 0 or `github_sync_rate_limit_terminal_failure`, do not increase GraphQL traffic: wait for GitHub reset/backoff. A polling rate-limit failure schedules a retry after 30 minutes; do not immediately redrive an entire DLQ. After quota recovers, verify a bounded sample and DB terminal state.

Use `github_provider_request_observed` to identify which provider operations are consuming quota and whether retries are adding duplicate attempts. A `401` retry should produce two provider request events for the same operation/auth kind around the same handler flow. A `403` should not be paired with a new `github_app_installation_token_create` request caused by token refresh. Keep sync/webhook DB terminal-state checks in the same investigation; provider request logs explain external calls but do not replace consistency checks.

## Dev smoke checklist

After deployment or worker changes, collect evidence for both dev flows:

1. Run one successful sync. Confirm CloudWatch queue age/backlog returns to normal, the ECS task is healthy, worker raw JSON logs are safe, and `github_sync_runs`/`github_sync_jobs` reach `success` terminal state.
2. Cause one safe retryable failure. Confirm `github_sync_retry`, `retryAfterSeconds`, CloudWatch `RetryCount`, queue age/backlog, and that the DB run/job did not incorrectly become terminal before retry.
3. For installation-token cache verification, use a deterministic focused test with 100 repeated installation-authenticated operations against the same installation. Confirm warm cache hit ratio is at least 95% and installation-token POST requests fall by at least 95%. A simple expected-shape example is 20 repeated operations: before cache, 20 token POSTs plus 20 downstream GETs equals 40 GitHub provider requests; after cache, 1 token POST plus 20 downstream GETs equals 21 GitHub provider requests. In production logs, treat the new provider/cache events as a post-cache baseline only unless pre-change evidence was captured before deployment.

Do not use a real credential revoke, actual rate-limit exhaustion, or a bulk dev/production DLQ redrive as a smoke test. Verify `401` retry behavior with a controlled mock or bounded safe fixture that produces two provider request events, verify `403` does not trigger token refresh, and verify sync/webhook consistency through DB terminal state. In all flows, retain logs, CloudWatch observations, and DB-state evidence without access tokens, webhook payloads, provider raw errors, or secrets.

## LocalStack queue configuration verification

After starting LocalStack through Docker Compose or running `infra/scripts/create-local-sqs-queues.ps1`, verify both GitHub queues before testing a worker flow. `pilo-dev-github-webhooks` must have `VisibilityTimeout` `120` and `pilo-dev-github-sync-jobs` must have `VisibilityTimeout` `900`. Both queues must have a `RedrivePolicy` that targets their matching `-dlq` queue with `maxReceiveCount` `3`.

```bash
awslocal sqs get-queue-attributes --queue-url "$(awslocal sqs get-queue-url --queue-name pilo-dev-github-webhooks --query QueueUrl --output text)" --attribute-names VisibilityTimeout RedrivePolicy
awslocal sqs get-queue-attributes --queue-url "$(awslocal sqs get-queue-url --queue-name pilo-dev-github-sync-jobs --query QueueUrl --output text)" --attribute-names VisibilityTimeout RedrivePolicy
```

For a PowerShell-created LocalStack instance, replace `awslocal sqs` with `aws --endpoint-url $env:SQS_ENDPOINT sqs` and use the same queue names and attributes. Do not change these attributes while redriving a DLQ.

### Isolated LocalStack integration test

`Infra LocalStack Integration` workflow runs `infra/tests/github-sync-localstack-config.test.mjs` on the GitHub-hosted `ubuntu-latest` runner when the GitHub queue setup paths, this runbook, or the workflow changes. GitHub-hosted Windows runners do not provide a Docker daemon for LocalStack containers, so CI uses Docker Linux container mode and `pwsh` (PowerShell 7) to execute the same PowerShell queue setup script. Before the test, it verifies Docker availability, Docker Linux mode, AWS CLI, and `pwsh`. It starts separate disposable `localstack/localstack:3` containers with anonymous port mappings, runs the shell and PowerShell setup paths independently, and removes the containers afterward. It never uses the `pilo_localstack_data` Docker volume or an AWS account.

For manual Windows execution, Docker Desktop must be running and able to pull `localstack/localstack:3`; Node.js, Windows PowerShell, and AWS CLI must be available. On Linux/macOS, the same test uses `pwsh`. The test supplies only a LocalStack endpoint and test credentials to the PowerShell setup path; it does not use AWS account credentials or an AWS endpoint.

Run it manually from the repository root:

```powershell
$env:RUN_LOCALSTACK_INTEGRATION=1
node infra/tests/github-sync-localstack-config.test.mjs
```

The test verifies `VisibilityTimeout`, `RedrivePolicy`, matching DLQ ARN, and `maxReceiveCount` `3` for both `pilo-dev-github-webhooks` and `pilo-dev-github-sync-jobs` after each setup path.

## Cost scope

This work includes only these cost categories: worker count, public IPv4, CloudWatch logs/metrics/alarms, and SQS requests. It explicitly excludes scale-out and NAT. The single `github-sync-worker` remains in place until the future event-worker/autoscaling decision rule is met.
