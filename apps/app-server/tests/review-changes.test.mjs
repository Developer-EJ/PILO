import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  ChangedFilesService,
} = require("../src/modules/review/changes/changed-files.service.ts");
const {
  ChangedFilesController,
} = require("../src/modules/review/changes/changed-files.controller.ts");
const {
  InMemoryChangedFilesRepository,
} = require("../src/modules/review/changes/in-memory-changed-files.repository.ts");

function createService(options = {}) {
  return new ChangedFilesService(new InMemoryChangedFilesRepository(), options);
}

function createController(options = {}) {
  return new ChangedFilesController(createService(options));
}

describe("changed files/functions service", () => {
  it("exposes changed file/function read models by analysis id", async () => {
    const controller = createController({ seedFixture: true });

    const files = await controller.listChangedFiles(
      "88888888-8888-4888-8888-888888888881",
    );

    assert.equal(files.length, 1);
    assert.equal(files[0].analysisId, "88888888-8888-4888-8888-888888888881");
    assert.equal(files[0].functions[0].changedFileId, files[0].id);
  });

  it("lists changed file/function fixture by analysis id", async () => {
    const service = createService({ seedFixture: true });

    const files = await service.listChangedFiles(
      "88888888-8888-4888-8888-888888888881",
    );

    assert.equal(files.length, 1);
    assert.equal(files[0].filePath, "apps/frontend/app/auth/callback/page.tsx");
    assert.equal(files[0].functions[0].name, "AuthCallbackPage");
  });

  it("does not mix fixture records into runtime services by default", async () => {
    const service = createService();

    assert.deepEqual(
      await service.listChangedFiles("88888888-8888-4888-8888-888888888881"),
      [],
    );
  });

  it("upserts changed files by analysis id and file path", async () => {
    const service = createService();

    const first = await service.upsertChangedFile({
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "apps/app-server/src/modules/review/review.module.ts",
      changeType: "added",
      additions: 10,
      deletions: 0,
      summary: "review module added",
      changedAt: "2026-06-27T10:00:00.000Z",
    });
    const second = await service.upsertChangedFile({
      analysisId: first.analysisId,
      filePath: first.filePath,
      changeType: "modified",
      additions: 12,
      deletions: 1,
      summary: "review module provider updated",
      changedAt: "2026-06-27T10:10:00.000Z",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.changeType, "modified");
    assert.equal(second.additions, 12);
    assert.equal(second.createdAt, first.createdAt);
  });

  it("normalizes non-UUID agent-provided ids before persistence", async () => {
    const service = createService();

    const file = await service.upsertChangedFile({
      id: "review-room-file",
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
      changeType: "modified",
    });
    const changedFunction = await service.upsertChangedFunction({
      id: "open-room",
      changedFileId: file.id,
      name: "openPullRequest",
      changeType: "modified",
    });

    assert.match(file.id, /^[0-9a-f-]{36}$/i);
    assert.match(changedFunction.id, /^[0-9a-f-]{36}$/i);
  });

  it("rejects invalid line counts and timestamps", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.upsertChangedFile({
          analysisId: "88888888-8888-4888-8888-888888888882",
          filePath: "README.md",
          changeType: "modified",
          additions: -1,
        }),
      /additions must be a non-negative integer/,
    );
    await assert.rejects(
      () =>
        service.upsertChangedFile({
          analysisId: "88888888-8888-4888-8888-888888888882",
          filePath: "README.md",
          changeType: "modified",
          changedAt: "tomorrow",
        }),
      /changedAt must be a valid ISO timestamp/,
    );
  });

  it("upserts changed functions by file id and name", async () => {
    const service = createService();
    const file = await service.upsertChangedFile({
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "apps/app-server/src/modules/review/review.module.ts",
      changeType: "added",
    });

    const first = await service.upsertChangedFunction({
      changedFileId: file.id,
      name: "ReviewModule",
      changeType: "added",
      summary: "review module provider registered",
    });
    const second = await service.upsertChangedFunction({
      changedFileId: file.id,
      name: "ReviewModule",
      changeType: "modified",
      summary: "analysis provider registered",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.changeType, "modified");
    assert.equal(
      (await service.listChangedFiles(file.analysisId))[0].functions.length,
      1,
    );
  });

  it("rejects functions for missing changed files", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.upsertChangedFunction({
          changedFileId: "88888888-8888-4888-8888-888888888899",
          name: "missing",
          changeType: "modified",
        }),
      /Changed file was not found/,
    );
  });

  it("removes stale indexes when an existing id moves to a new key", async () => {
    const repository = new InMemoryChangedFilesRepository();
    const service = new ChangedFilesService(repository);

    const first = await service.upsertChangedFile({
      id: "88888888-8888-4888-8888-8888888888d1",
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "old.ts",
      changeType: "added",
    });
    await service.upsertChangedFile({
      id: first.id,
      analysisId: first.analysisId,
      filePath: "new.ts",
      changeType: "renamed",
    });

    assert.equal(
      repository.findFileByAnalysisAndPath(first.analysisId, "old.ts"),
      null,
    );
    assert.equal(
      repository.findFileByAnalysisAndPath(first.analysisId, "new.ts")?.id,
      first.id,
    );
  });

  it("rejects invalid file and function change types", async () => {
    const service = createService();
    const file = await service.upsertChangedFile({
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "README.md",
      changeType: "modified",
    });

    await assert.rejects(
      () =>
        service.upsertChangedFile({
          analysisId: "88888888-8888-4888-8888-888888888882",
          filePath: "README.md",
          changeType: "moved",
        }),
      /Invalid changed file type/,
    );
    await assert.rejects(
      () =>
        service.upsertChangedFunction({
          changedFileId: file.id,
          name: "readme",
          changeType: "renamed",
        }),
      /Invalid changed function type/,
    );
  });
});
