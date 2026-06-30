import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  RuntimePullRequestAnalysisRepository,
} = require("../src/modules/review/analysis/runtime-pull-request-analysis.repository.ts");

const ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";
const PULL_REQUEST_ID = "66666666-6666-4666-8666-666666666661";
const CREATED_AT = "2026-06-30T00:00:00.000Z";
const UPDATED_AT = "2026-06-30T00:01:00.000Z";

describe("RuntimePullRequestAnalysisRepository database persistence", () => {
  it("restores PR analysis root results from a database-backed repository", async () => {
    await withDatabaseConnectEnabled(async () => {
      const database = createReviewAnalysisDatabaseStub();
      const repository = new RuntimePullRequestAnalysisRepository(database);

      const created = await repository.create({
        id: ANALYSIS_ID,
        pullRequestId: PULL_REQUEST_ID,
        createdAt: CREATED_AT,
      });
      const saved = await repository.save({
        ...created,
        purposeSummary: "Review OAuth callback flow.",
        impactSummary: "Auth callback and redirect state are affected.",
        testRecommendation: "Run provider success and failure smoke tests.",
        riskLevel: "medium",
        analysisStatus: "failed",
        okCount: 1,
        discussCount: 2,
        riskCount: 1,
        conclusion: "Retry after callback error handling is checked.",
        errorTrace: ["[WORKFLOW_FAILED] review workflow failed"],
        updatedAt: UPDATED_AT,
      });
      const restartedRepository = new RuntimePullRequestAnalysisRepository(
        database,
      );
      const restoredByPr =
        await restartedRepository.findByPullRequestId(PULL_REQUEST_ID);
      const restoredById = await restartedRepository.findById(ANALYSIS_ID);

      assert.equal(repository.mode, "database");
      assert.deepEqual(restoredByPr, saved);
      assert.deepEqual(restoredById, saved);
      assert.equal(
        database.calls.some((call) =>
          /INSERT INTO pull_request_analyses/.test(call.sql),
        ),
        true,
      );
    });
  });

  it("falls back to memory storage when database connection is explicitly skipped", async () => {
    await withDatabaseConnectSkipped(async () => {
      const database = createReviewAnalysisDatabaseStub();
      const repository = new RuntimePullRequestAnalysisRepository(database);

      await repository.create({
        id: ANALYSIS_ID,
        pullRequestId: PULL_REQUEST_ID,
        createdAt: CREATED_AT,
      });

      assert.equal(repository.mode, "memory");
      assert.equal((await repository.findById(ANALYSIS_ID)).id, ANALYSIS_ID);
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

function createReviewAnalysisDatabaseStub() {
  const state = {
    analysesById: new Map(),
    analysisIdsByPullRequestId: new Map(),
  };
  const calls = [];
  const database = {
    state,
    calls,
    async $queryRaw(strings, ...values) {
      const sql = normalizeSql(strings);
      calls.push({
        sql,
        values,
      });

      if (/SELECT .* FROM pull_request_analyses.*WHERE id =/.test(sql)) {
        const analysisId = findUuid(values);
        return rowForAnalysis(state.analysesById.get(analysisId));
      }

      if (
        /SELECT .* FROM pull_request_analyses.*WHERE pull_request_id =/.test(
          sql,
        )
      ) {
        const pullRequestId = findUuid(values);
        const analysisId = state.analysisIdsByPullRequestId.get(pullRequestId);
        return rowForAnalysis(state.analysesById.get(analysisId));
      }

      if (/ON CONFLICT \(pull_request_id\) DO NOTHING/.test(sql)) {
        const [id, pullRequestId, createdAt] = values;
        const existingId = state.analysisIdsByPullRequestId.get(pullRequestId);

        if (existingId) {
          return [];
        }

        const analysis = {
          id,
          pullRequestId,
          purposeSummary: null,
          impactSummary: null,
          testRecommendation: null,
          riskLevel: "low",
          analysisStatus: "pending",
          okCount: 0,
          discussCount: 0,
          riskCount: 0,
          conclusion: null,
          errorTrace: [],
          createdAt,
          updatedAt: createdAt,
        };
        state.analysesById.set(id, analysis);
        state.analysisIdsByPullRequestId.set(pullRequestId, id);
        return rowForAnalysis(analysis);
      }

      if (/ON CONFLICT \(id\) DO UPDATE/.test(sql)) {
        const [
          id,
          pullRequestId,
          purposeSummary,
          impactSummary,
          testRecommendation,
          riskLevel,
          analysisStatus,
          okCount,
          discussCount,
          riskCount,
          conclusion,
          errorTraceJson,
          createdAt,
          updatedAt,
        ] = values;
        const analysis = {
          id,
          pullRequestId,
          purposeSummary,
          impactSummary,
          testRecommendation,
          riskLevel,
          analysisStatus,
          okCount,
          discussCount,
          riskCount,
          conclusion,
          errorTrace: JSON.parse(errorTraceJson),
          createdAt,
          updatedAt,
        };
        state.analysesById.set(id, analysis);
        state.analysisIdsByPullRequestId.set(pullRequestId, id);
        return rowForAnalysis(analysis);
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  return database;
}

function rowForAnalysis(analysis) {
  return analysis
    ? [
        {
          id: analysis.id,
          pullRequestId: analysis.pullRequestId,
          purposeSummary: analysis.purposeSummary,
          impactSummary: analysis.impactSummary,
          testRecommendation: analysis.testRecommendation,
          riskLevel: analysis.riskLevel,
          analysisStatus: analysis.analysisStatus,
          okCount: analysis.okCount,
          discussCount: analysis.discussCount,
          riskCount: analysis.riskCount,
          conclusion: analysis.conclusion,
          errorTrace: analysis.errorTrace,
          createdAt: analysis.createdAt,
          updatedAt: analysis.updatedAt,
        },
      ]
    : [];
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
