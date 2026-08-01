import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../../.github/workflows/deploy-realtime-server.yml", import.meta.url),
  "utf8",
);
const ecsModule = await readFile(
  new URL("../modules/ecs/main.tf", import.meta.url),
  "utf8",
);
const devEnvironment = await readFile(
  new URL("../envs/dev/main.tf", import.meta.url),
  "utf8",
);

const scaleOldIndex = workflow.indexOf("Scale existing revision to one task");
const deployCanaryIndex = workflow.indexOf("Deploy one-task canary");
assert.ok(scaleOldIndex >= 0, "the old revision must be scaled down first");
assert.ok(scaleOldIndex < deployCanaryIndex, "old scale-down must precede canary deploy");

const scaleOldStep = workflow.slice(scaleOldIndex, deployCanaryIndex);
assert.match(scaleOldStep, /--desired-count 1/);
assert.doesNotMatch(scaleOldStep, /--task-definition/);
assert.match(scaleOldStep, /services-stable/);

assert.match(workflow, /\.stopTimeout = 45/);
assert.match(ecsModule, /stopTimeout\s*=\s*each\.value\.stop_timeout_seconds/);
assert.match(devEnvironment, /stop_timeout_seconds\s*=\s*45/);

console.log("Realtime Server serialized deployment contract verified.");
