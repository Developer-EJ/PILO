import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-app-server.yml", import.meta.url),
  "utf8"
);

assert.match(workflow, /concurrency:\s*\n\s+group: deploy-app-server/);
assert.match(workflow, /cancel-in-progress: false/);

assert.match(workflow, /Capture rollback state/);
assert.match(workflow, /previous_task_definition/);
assert.match(workflow, /previous_desired_count/);
assert.match(workflow, /previous_image_digest/);
assert.match(workflow, /previous-task-definition\.json/);

assert.match(workflow, /ECS_APP_SERVER_LOG_GROUP/);
assert.match(workflow, /aws logs describe-log-groups/);
assert.doesNotMatch(workflow, /aws logs create-log-group/);

assert.match(workflow, /id: build/);
assert.match(workflow, /steps\.build\.outputs\.digest/);
assert.match(workflow, /Register logged task definition/);
assert.match(workflow, /logDriver:\s*"awslogs"/);
assert.match(workflow, /awslogs-group/);
assert.match(workflow, /awslogs-region/);
assert.match(workflow, /awslogs-stream-prefix/);
assert.match(workflow, /register-task-definition/);
assert.match(workflow, /next-task-definition\.json/);

assert.match(workflow, /Deploy one-task canary/);
assert.match(workflow, /--desired-count 1/);
assert.match(workflow, /Verify one-task canary/);
assert.match(workflow, /steps\.task-definition\.outputs\.arn/);
assert.match(workflow, /canary_task_id/);
assert.match(
  workflow,
  /expected_log_stream="app-server\/\$\{CONTAINER_NAME\}\/\$\{canary_task_id\}"/
);
assert.match(workflow, /--log-stream-name-prefix "\$expected_log_stream"/);
assert.match(workflow, /\.logStreamName == \$expected_stream/);
assert.match(workflow, /Restore intended task count/);

assert.match(workflow, /Capture optional worker rollback state/);
assert.match(workflow, /previous-worker-task-definition\.json/);
assert.match(workflow, /previous_worker_image_digest/);
assert.match(workflow, /Register optional worker task definition/);
assert.match(workflow, /next-worker-task-definition\.json/);
assert.match(workflow, /steps\.worker-task-definition\.outputs\.arn/);
assert.match(workflow, /Verify optional worker task/);

assert.match(workflow, /Roll back failed deployment/);
assert.match(workflow, /rollback-task-definition\.json/);
assert.match(workflow, /rollback-worker-task-definition\.json/);
assert.match(workflow, /PREVIOUS_IMAGE_URI/);
assert.match(workflow, /PREVIOUS_WORKER_IMAGE_URI/);
assert.match(workflow, /ROLLBACK_DESIRED_COUNT/);
assert.match(workflow, /ROLLBACK_WORKER_DESIRED_COUNT/);
assert.match(workflow, /force-new-deployment/);

console.log("App Server immutable logged deployment contract verified.");
