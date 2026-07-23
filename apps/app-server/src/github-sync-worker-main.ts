import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { GithubSyncJobService } from "./modules/github-integration/github-sync-job.service";
import { GithubSyncObservabilityService } from "./modules/github-integration/github-sync-observability.service";
import { runGithubSyncWorkerLoop } from "./modules/github-integration/github-sync-worker-loop";
import { GithubSyncWorkerModule } from "./modules/github-integration/github-sync-worker.module";

async function bootstrap(): Promise<void> {
  process.env.APP_SERVER_RUNTIME = "github-sync-worker";
  const app = await NestFactory.createApplicationContext(GithubSyncWorkerModule, { logger: ["error", "warn", "log"] });
  const worker = app.get(GithubSyncJobService);
  const observability = app.get(GithubSyncObservabilityService);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  await Promise.all([
    runGithubSyncWorkerLoop(
      "sync_jobs",
      () => worker.pollSyncJobQueueOnce(),
      observability,
      () => stopping
    ),
    runGithubSyncWorkerLoop(
      "webhooks",
      () => worker.pollWebhookQueueOnce(),
      observability,
      () => stopping
    )
  ]);
  await app.close();
}
void bootstrap();
