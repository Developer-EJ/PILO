import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  ChangedFilesService,
} = require("../src/modules/review/changes/changed-files.service.ts");
const {
  InMemoryChangedFilesRepository,
} = require("../src/modules/review/changes/in-memory-changed-files.repository.ts");
const {
  AgentChangedFilesResultService,
} = require("../src/modules/review/result/agent-changed-files-result.service.ts");

function createService() {
  return new AgentChangedFilesResultService(
    new ChangedFilesService(new InMemoryChangedFilesRepository()),
  );
}

describe("agent result changed files adapter", () => {
  it("upserts changed files and functions from result payload", async () => {
    const service = createService();
    const analysisId = "88888888-8888-4888-8888-888888888883";

    const first = await service.applyChangedFiles(analysisId, [
      {
        filePath: "apps/frontend/app/auth/callback/page.tsx",
        changeType: "modified",
        additions: 42,
        deletions: 8,
        summary: "callback route shell",
        functions: [
          {
            name: "AuthCallbackPage",
            changeType: "modified",
            summary: "reads callback query params",
          },
        ],
      },
    ]);
    const second = await service.applyChangedFiles(analysisId, [
      {
        filePath: first[0].filePath,
        changeType: "modified",
        additions: 50,
        deletions: 10,
        functions: [
          {
            name: "AuthCallbackPage",
            changeType: "modified",
            summary: "keeps same function row",
          },
        ],
      },
    ]);

    assert.equal(second.length, 1);
    assert.equal(second[0].id, first[0].id);
    assert.equal(second[0].additions, 50);
    assert.equal(second[0].functions.length, 1);
    assert.equal(second[0].functions[0].id, first[0].functions[0].id);
  });
});
