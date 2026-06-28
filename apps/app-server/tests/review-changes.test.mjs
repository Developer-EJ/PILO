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

function createService(options = {}) {
  return new ChangedFilesService(new InMemoryChangedFilesRepository(), options);
}

describe("changed files/functions service", () => {
  it("lists changed file/function fixture by analysis id", () => {
    const service = createService({ seedFixture: true });

    const files = service.listChangedFiles(
      "88888888-8888-4888-8888-888888888881",
    );

    assert.equal(files.length, 1);
    assert.equal(files[0].filePath, "apps/frontend/app/auth/callback/page.tsx");
    assert.equal(files[0].functions[0].name, "AuthCallbackPage");
  });

  it("does not mix fixture records into runtime services by default", () => {
    const service = createService();

    assert.deepEqual(
      service.listChangedFiles("88888888-8888-4888-8888-888888888881"),
      [],
    );
  });

  it("upserts changed files by analysis id and file path", () => {
    const service = createService();

    const first = service.upsertChangedFile({
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "apps/app-server/src/modules/review/review.module.ts",
      changeType: "added",
      additions: 10,
      deletions: 0,
      summary: "review module 추가",
      changedAt: "2026-06-27T10:00:00.000Z",
    });
    const second = service.upsertChangedFile({
      analysisId: first.analysisId,
      filePath: first.filePath,
      changeType: "modified",
      additions: 12,
      deletions: 1,
      summary: "review module provider 추가",
      changedAt: "2026-06-27T10:10:00.000Z",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.changeType, "modified");
    assert.equal(second.additions, 12);
    assert.equal(second.createdAt, first.createdAt);
  });

  it("rejects invalid line counts and timestamps", () => {
    const service = createService();

    assert.throws(
      () =>
        service.upsertChangedFile({
          analysisId: "88888888-8888-4888-8888-888888888882",
          filePath: "README.md",
          changeType: "modified",
          additions: -1,
        }),
      /additions must be a non-negative integer/,
    );
    assert.throws(
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

  it("upserts changed functions by file id and name", () => {
    const service = createService();
    const file = service.upsertChangedFile({
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "apps/app-server/src/modules/review/review.module.ts",
      changeType: "added",
    });

    const first = service.upsertChangedFunction({
      changedFileId: file.id,
      name: "ReviewModule",
      changeType: "added",
      summary: "review module provider 등록",
    });
    const second = service.upsertChangedFunction({
      changedFileId: file.id,
      name: "ReviewModule",
      changeType: "modified",
      summary: "analysis provider 등록",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.changeType, "modified");
    assert.equal(
      service.listChangedFiles(file.analysisId)[0].functions.length,
      1,
    );
  });

  it("rejects functions for missing changed files", () => {
    const service = createService();

    assert.throws(
      () =>
        service.upsertChangedFunction({
          changedFileId: "88888888-8888-4888-8888-888888888899",
          name: "missing",
          changeType: "modified",
        }),
      /Changed file was not found/,
    );
  });

  it("removes stale indexes when an existing id moves to a new key", () => {
    const repository = new InMemoryChangedFilesRepository();
    const service = new ChangedFilesService(repository);

    const first = service.upsertChangedFile({
      id: "88888888-8888-4888-8888-8888888888d1",
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "old.ts",
      changeType: "added",
    });
    service.upsertChangedFile({
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

  it("rejects invalid file and function change types", () => {
    const service = createService();
    const file = service.upsertChangedFile({
      analysisId: "88888888-8888-4888-8888-888888888882",
      filePath: "README.md",
      changeType: "modified",
    });

    assert.throws(
      () =>
        service.upsertChangedFile({
          analysisId: "88888888-8888-4888-8888-888888888882",
          filePath: "README.md",
          changeType: "moved",
        }),
      /Invalid changed file type/,
    );
    assert.throws(
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
