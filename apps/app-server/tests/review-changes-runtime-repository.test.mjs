import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  RuntimeChangedFilesRepository,
} = require("../src/modules/review/changes/runtime-changed-files.repository.ts");

const ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";
const FILE_ID = "88888888-8888-4888-8888-8888888888b1";
const FUNCTION_ID = "88888888-8888-4888-8888-8888888888c1";

describe("RuntimeChangedFilesRepository database persistence", () => {
  it("restores changed files and functions after repository restart", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createChangedFilesDatabaseStub();
      const repository = new RuntimeChangedFilesRepository(database);

      const file = await repository.saveFile({
        id: FILE_ID,
        analysisId: ANALYSIS_ID,
        filePath: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
        changeType: "modified",
        additions: 24,
        deletions: 6,
        summary: "loads generated changed files",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:01:00.000Z",
      });
      const changedFunction = await repository.saveFunction({
        id: FUNCTION_ID,
        changedFileId: FILE_ID,
        name: "openPullRequest",
        changeType: "modified",
        summary: "hydrates the review session",
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:01:00.000Z",
      });
      const restartedRepository = new RuntimeChangedFilesRepository(database);

      assert.equal(repository.mode, "database");
      assert.deepEqual(
        await restartedRepository.findFileByAnalysisAndPath(
          ANALYSIS_ID,
          file.filePath,
        ),
        file,
      );
      assert.deepEqual(await restartedRepository.findFileById(FILE_ID), file);
      assert.deepEqual(
        await restartedRepository.listFilesByAnalysis(ANALYSIS_ID),
        [file],
      );
      assert.deepEqual(
        await restartedRepository.findFunctionByFileAndName(
          FILE_ID,
          "openPullRequest",
        ),
        changedFunction,
      );
      assert.deepEqual(
        await restartedRepository.listFunctionsByFile(FILE_ID),
        [changedFunction],
      );
      assert.equal(
        database.calls.some((call) => /INSERT INTO changed_files/.test(call.sql)),
        true,
      );
      assert.equal(
        database.calls.some((call) =>
          /INSERT INTO changed_functions/.test(call.sql),
        ),
        true,
      );
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const database = createChangedFilesDatabaseStub();
      const repository = new RuntimeChangedFilesRepository(database);

      await repository.saveFile({
        id: FILE_ID,
        analysisId: ANALYSIS_ID,
        filePath: "apps/frontend/components/review/ReviewRoomWorkspace.tsx",
        changeType: "modified",
        additions: 1,
        deletions: 0,
        summary: null,
        createdAt: "2026-06-30T00:00:00.000Z",
        updatedAt: "2026-06-30T00:00:00.000Z",
      });

      assert.equal(repository.mode, "memory");
      assert.equal((await repository.findFileById(FILE_ID)).id, FILE_ID);
      assert.equal(database.calls.length, 0);
    });
  });
});

async function withDatabaseConnectEnabled(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  delete process.env.PILO_SKIP_DATABASE_CONNECT;

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

async function withDatabaseConnectSkipped(callback) {
  const previous = process.env.PILO_SKIP_DATABASE_CONNECT;
  process.env.PILO_SKIP_DATABASE_CONNECT = "true";

  try {
    await callback();
  } finally {
    restoreDatabaseSkip(previous);
  }
}

function restoreDatabaseSkip(previous) {
  if (previous === undefined) {
    delete process.env.PILO_SKIP_DATABASE_CONNECT;
    return;
  }

  process.env.PILO_SKIP_DATABASE_CONNECT = previous;
}

function createChangedFilesDatabaseStub() {
  const state = {
    filesById: new Map(),
    fileIdsByAnalysisPath: new Map(),
    functionsById: new Map(),
    functionIdsByFileName: new Map(),
  };
  const calls = [];
  const database = {
    state,
    calls,
    async $queryRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      const params = queryParams(values);
      calls.push({ sql, values: params });

      if (
        /SELECT .* FROM changed_files.*WHERE analysis_id =.*AND file_path/.test(
          sql,
        )
      ) {
        const [analysisId, filePath] = params;
        const fileId = state.fileIdsByAnalysisPath.get(
          fileKey(analysisId, filePath),
        );

        return rowForFile(state.filesById.get(fileId));
      }

      if (/SELECT .* FROM changed_files.*WHERE id =/.test(sql)) {
        return rowForFile(state.filesById.get(params[0]));
      }

      if (/SELECT .* FROM changed_files.*WHERE analysis_id =/.test(sql)) {
        const analysisId = findUuid(params);

        return [...state.filesById.values()]
          .filter((file) => file.analysisId === analysisId)
          .sort((left, right) => left.filePath.localeCompare(right.filePath))
          .flatMap(rowForFile);
      }

      if (
        /SELECT .* FROM changed_functions.*WHERE changed_file_id =.*AND name/.test(
          sql,
        )
      ) {
        const [changedFileId, name] = params;
        const functionId = state.functionIdsByFileName.get(
          functionKey(changedFileId, name),
        );

        return rowForFunction(state.functionsById.get(functionId));
      }

      if (/SELECT .* FROM changed_functions.*WHERE changed_file_id =/.test(sql)) {
        const changedFileId = findUuid(params);

        return [...state.functionsById.values()]
          .filter((changedFunction) =>
            changedFunction.changedFileId === changedFileId
          )
          .sort((left, right) => left.name.localeCompare(right.name))
          .flatMap(rowForFunction);
      }

      if (/INSERT INTO changed_files/.test(sql)) {
        const [
          id,
          analysisId,
          filePath,
          changeType,
          additions,
          deletions,
          summary,
          createdAt,
          updatedAt,
        ] = params;
        const existing = state.filesById.get(id);

        if (existing) {
          state.fileIdsByAnalysisPath.delete(
            fileKey(existing.analysisId, existing.filePath),
          );
        }

        const file = {
          id,
          analysisId,
          filePath,
          changeType,
          additions,
          deletions,
          summary,
          createdAt: existing?.createdAt ?? createdAt,
          updatedAt,
        };

        state.filesById.set(id, file);
        state.fileIdsByAnalysisPath.set(fileKey(analysisId, filePath), id);
        return rowForFile(file);
      }

      if (/INSERT INTO changed_functions/.test(sql)) {
        const [
          id,
          changedFileId,
          name,
          changeType,
          summary,
          createdAt,
          updatedAt,
        ] = params;
        const existing = state.functionsById.get(id);

        if (existing) {
          state.functionIdsByFileName.delete(
            functionKey(existing.changedFileId, existing.name),
          );
        }

        const changedFunction = {
          id,
          changedFileId,
          name,
          changeType,
          summary,
          createdAt: existing?.createdAt ?? createdAt,
          updatedAt,
        };

        state.functionsById.set(id, changedFunction);
        state.functionIdsByFileName.set(
          functionKey(changedFileId, name),
          id,
        );
        return rowForFunction(changedFunction);
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  return database;
}

function rowForFile(file) {
  return file
    ? [
        {
          id: file.id,
          analysisId: file.analysisId,
          filePath: file.filePath,
          changeType: file.changeType,
          additions: file.additions,
          deletions: file.deletions,
          summary: file.summary,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        },
      ]
    : [];
}

function rowForFunction(changedFunction) {
  return changedFunction
    ? [
        {
          id: changedFunction.id,
          changedFileId: changedFunction.changedFileId,
          name: changedFunction.name,
          changeType: changedFunction.changeType,
          summary: changedFunction.summary,
          createdAt: changedFunction.createdAt,
          updatedAt: changedFunction.updatedAt,
        },
      ]
    : [];
}

function queryParams(values) {
  return values.filter(
    (value) =>
      !(value && typeof value === "object" && Array.isArray(value.strings)),
  );
}

function fileKey(analysisId, filePath) {
  return `${analysisId}:${filePath}`;
}

function functionKey(changedFileId, name) {
  return `${changedFileId}:${name}`;
}

function findUuid(values) {
  return values.find(
    (value) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
  );
}

function normalizeSql(strings) {
  const parts = Array.isArray(strings)
    ? Array.from(strings)
    : Array.isArray(strings?.strings)
      ? strings.strings
      : [String(strings)];

  return parts.join("?").replace(/\s+/g, " ").trim();
}
