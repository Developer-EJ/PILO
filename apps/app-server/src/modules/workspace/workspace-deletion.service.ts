import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  DatabaseService,
  DatabaseTransaction
} from "../../database/database.service";

const SWEEP_INTERVAL_MS = 5_000;
const CLAIM_TIMEOUT_SECONDS = 15 * 60;
const BATCH_SIZE = 50;
const RETRY_DELAYS_MS = [
  5_000,
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000
];

interface WorkspaceDeletionStorageConfig {
  awsRegion: string;
  bucket: string;
  endpoint?: string;
}

interface WorkspaceDeletionTargetClaim {
  id: string;
  deletion_job_id: string;
  workspace_id: string;
  target_type: string;
  object_key: string;
  attempt_count: number | string;
  claim_token: string;
}

type WorkspaceDeletionS3Client = Pick<S3Client, "send"> &
  Partial<Pick<S3Client, "destroy">>;

export function getWorkspaceDeletionRetryDelayMs(attemptCount: number): number {
  const index = Math.max(
    0,
    Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)
  );
  return RETRY_DELAYS_MS[index];
}

@Injectable()
export class WorkspaceDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkspaceDeletionService.name);
  private interval: ReturnType<typeof setInterval> | null = null;
  private s3Client: WorkspaceDeletionS3Client | null = null;
  private s3ClientConfigKey: string | null = null;
  private sweepPromise: Promise<void> | null = null;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    if (process.env.APP_SERVER_RUNTIME === "github-sync-worker") return;

    this.interval = setInterval(() => this.requestSweep(), SWEEP_INTERVAL_MS);
    this.requestSweep();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.s3Client?.destroy?.();
    this.s3Client = null;
    this.s3ClientConfigKey = null;
  }

  requestSweep(): void {
    if (this.sweepPromise) return;

    this.sweepPromise = this.processDueDeletionJobs()
      .catch(() => {
        this.logger.error("Workspace deletion sweep failed");
      })
      .finally(() => {
        this.sweepPromise = null;
      });
  }

  async processDueDeletionJobs(): Promise<void> {
    const targets = await this.database.query<{ id: string }>(
      `
        SELECT id
        FROM workspace_deletion_targets
        WHERE (status = 'pending' AND next_attempt_at <= now())
          OR (
            status = 'processing'
            AND claimed_at <= now() - ($1 * INTERVAL '1 second')
          )
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT $2
      `,
      [CLAIM_TIMEOUT_SECONDS, BATCH_SIZE]
    );

    for (const target of targets) {
      await this.deleteTarget(target.id);
    }

    await this.finalizeReadyJobs();
  }

  protected createS3Client(
    config: WorkspaceDeletionStorageConfig
  ): WorkspaceDeletionS3Client {
    return new S3Client({
      region: config.awsRegion,
      endpoint: config.endpoint
    });
  }

  private async deleteTarget(id: string): Promise<void> {
    const claim = await this.claimTarget(id);
    if (!claim) return;

    try {
      await this.deleteExternalObject(claim);
      const completed = await this.database.execute(
        `
          UPDATE workspace_deletion_targets
          SET
            status = 'completed',
            claim_token = NULL,
            claimed_at = NULL,
            completed_at = now(),
            last_error_code = NULL
          WHERE id = $1
            AND status = 'processing'
            AND claim_token = $2
        `,
        [claim.id, claim.claim_token]
      );

      if (completed.rowCount) {
        this.logger.log(
          `Workspace deletion target completed workspace_id=${claim.workspace_id} deletion_job_id=${claim.deletion_job_id} target_type=${claim.target_type} attempt_count=${claim.attempt_count}`
        );
      }
    } catch {
      await this.retryTarget(claim);
    }
  }

  private async claimTarget(
    id: string
  ): Promise<WorkspaceDeletionTargetClaim | null> {
    const claimToken = randomUUID();
    return this.database.transaction(transaction =>
      transaction.queryOne<WorkspaceDeletionTargetClaim>(
        `
          WITH candidate AS (
            SELECT id
            FROM workspace_deletion_targets
            WHERE id = $1
              AND (
                (status = 'pending' AND next_attempt_at <= now())
                OR (
                  status = 'processing'
                  AND claimed_at <= now() - ($2 * INTERVAL '1 second')
                )
              )
            FOR UPDATE SKIP LOCKED
          )
          UPDATE workspace_deletion_targets AS target
          SET
            status = 'processing',
            attempt_count = target.attempt_count + 1,
            claim_token = $3,
            claimed_at = now(),
            last_error_code = NULL
          FROM candidate
          WHERE target.id = candidate.id
          RETURNING
            target.id,
            target.deletion_job_id,
            target.workspace_id,
            target.target_type,
            target.object_key,
            target.attempt_count,
            target.claim_token
        `,
        [id, CLAIM_TIMEOUT_SECONDS, claimToken]
      )
    );
  }

  private async deleteExternalObject(
    claim: WorkspaceDeletionTargetClaim
  ): Promise<void> {
    switch (claim.target_type) {
      case "drive_object":
      case "meeting_recording": {
        const config = this.getConfig();
        await this.getS3Client(config).send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: claim.object_key
          })
        );
        return;
      }
      default:
        throw new Error("Unsupported Workspace deletion target type");
    }
  }

  private async retryTarget(
    claim: WorkspaceDeletionTargetClaim
  ): Promise<void> {
    const nextAttemptAt = new Date(
      Date.now() +
        getWorkspaceDeletionRetryDelayMs(Number(claim.attempt_count))
    );
    const result = await this.database.execute(
      `
        UPDATE workspace_deletion_targets
        SET
          status = 'pending',
          next_attempt_at = $3,
          claim_token = NULL,
          claimed_at = NULL,
          last_error_code = 'EXTERNAL_OBJECT_DELETE_FAILED'
        WHERE id = $1
          AND status = 'processing'
          AND claim_token = $2
      `,
      [claim.id, claim.claim_token, nextAttemptAt]
    );

    if (result.rowCount) {
      this.logger.warn(
        `Workspace deletion target retry scheduled workspace_id=${claim.workspace_id} deletion_job_id=${claim.deletion_job_id} target_type=${claim.target_type} attempt_count=${claim.attempt_count}`
      );
    }
  }

  private async finalizeReadyJobs(): Promise<void> {
    const jobs = await this.database.query<{ id: string }>(
      `
        SELECT job.id
        FROM workspace_deletion_jobs AS job
        WHERE job.status = 'cleaning'
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_deletion_targets AS target
            WHERE target.deletion_job_id = job.id
              AND target.status <> 'completed'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM workspace_membership_revocation_outbox AS revocation
            WHERE revocation.workspace_id = job.workspace_id
              AND revocation.status <> 'delivered'
          )
        ORDER BY job.requested_at ASC
        LIMIT $1
      `,
      [BATCH_SIZE]
    );

    for (const job of jobs) {
      await this.finalizeJob(job.id);
    }
  }

  private async finalizeJob(id: string): Promise<void> {
    await this.database.transaction(async transaction => {
      const job = await transaction.queryOne<{
        id: string;
        workspace_id: string;
      }>(
        `
          SELECT job.id, job.workspace_id
          FROM workspace_deletion_jobs AS job
          WHERE job.id = $1
            AND job.status = 'cleaning'
            AND NOT EXISTS (
              SELECT 1
              FROM workspace_deletion_targets AS target
              WHERE target.deletion_job_id = job.id
                AND target.status <> 'completed'
            )
            AND NOT EXISTS (
              SELECT 1
              FROM workspace_membership_revocation_outbox AS revocation
              WHERE revocation.workspace_id = job.workspace_id
                AND revocation.status <> 'delivered'
            )
          FOR UPDATE SKIP LOCKED
        `,
        [id]
      );
      if (!job) return;

      await transaction.execute(
        "SELECT set_config('pilo.activity_log_tenant_purge', 'on', true)"
      );
      await transaction.execute(
        "SELECT set_config('pilo.workspace_deletion_finalize', 'on', true)"
      );
      const deleted = await transaction.execute(
        `
          DELETE FROM workspaces
          WHERE id = $1
            AND deletion_status = 'deleting'
        `,
        [job.workspace_id]
      );

      if (deleted.rowCount) {
        this.logFinalized(job.workspace_id, job.id);
      }
    });
  }

  private logFinalized(workspaceId: string, deletionJobId: string): void {
    this.logger.log(
      `Workspace deletion finalized workspace_id=${workspaceId} deletion_job_id=${deletionJobId}`
    );
  }

  private getS3Client(
    config: WorkspaceDeletionStorageConfig
  ): WorkspaceDeletionS3Client {
    const configKey = `${config.awsRegion}\n${config.bucket}\n${config.endpoint ?? ""}`;
    if (this.s3Client === null || this.s3ClientConfigKey !== configKey) {
      this.s3Client?.destroy?.();
      this.s3Client = this.createS3Client(config);
      this.s3ClientConfigKey = configKey;
    }
    return this.s3Client;
  }

  private getConfig(): WorkspaceDeletionStorageConfig {
    return {
      awsRegion: this.requireConfig(process.env.AWS_REGION),
      bucket: this.requireConfig(process.env.S3_UPLOADS_BUCKET),
      endpoint: this.optionalConfig(process.env.S3_ENDPOINT)
    };
  }

  private requireConfig(value: string | undefined): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("Workspace deletion storage is not configured");
    }
    return value.trim();
  }

  private optionalConfig(value: string | undefined): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    return value.trim();
  }
}
