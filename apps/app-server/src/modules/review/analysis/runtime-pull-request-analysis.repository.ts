import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  CreatePullRequestAnalysisInput,
  PullRequestAnalysisRecord,
} from "./pull-request-analysis.types";
import { InMemoryPullRequestAnalysisRepository } from "./in-memory-pull-request-analysis.repository";
import { PullRequestAnalysisRepository } from "./pull-request-analysis.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
};

type DbPullRequestAnalysisRow = {
  id: string;
  pullRequestId: string;
  purposeSummary: string | null;
  impactSummary: string | null;
  testRecommendation: string | null;
  riskLevel: string;
  analysisStatus: string;
  okCount: number;
  discussCount: number;
  riskCount: number;
  conclusion: string | null;
  errorTrace: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
};

@Injectable()
export class RuntimePullRequestAnalysisRepository
  implements PullRequestAnalysisRepository
{
  private readonly memory = new InMemoryPullRequestAnalysisRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get mode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async findById(analysisId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findById(analysisId);
    }

    const rows = await this.db.$queryRaw<DbPullRequestAnalysisRow[]>`
      SELECT ${analysisSelectColumns}
      FROM pull_request_analyses
      WHERE id = ${analysisId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toAnalysisRecord(rows[0]) : null;
  }

  async findByPullRequestId(pullRequestId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findByPullRequestId(pullRequestId);
    }

    const rows = await this.db.$queryRaw<DbPullRequestAnalysisRow[]>`
      SELECT ${analysisSelectColumns}
      FROM pull_request_analyses
      WHERE pull_request_id = ${pullRequestId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toAnalysisRecord(rows[0]) : null;
  }

  async create(input: CreatePullRequestAnalysisInput) {
    if (!this.shouldUseDatabase) {
      return this.memory.create(input);
    }

    const rows = await this.db.$queryRaw<DbPullRequestAnalysisRow[]>`
      INSERT INTO pull_request_analyses (
        id,
        pull_request_id,
        created_at,
        updated_at
      )
      VALUES (
        ${input.id}::uuid,
        ${input.pullRequestId}::uuid,
        ${input.createdAt}::timestamptz,
        ${input.createdAt}::timestamptz
      )
      ON CONFLICT (pull_request_id) DO NOTHING
      RETURNING ${analysisSelectColumns}
    `;

    if (rows[0]) {
      return toAnalysisRecord(rows[0]);
    }

    const existing = await this.findByPullRequestId(input.pullRequestId);

    if (!existing) {
      throw new Error(
        `Pull request analysis was not created: ${input.pullRequestId}`,
      );
    }

    return existing;
  }

  async save(analysis: PullRequestAnalysisRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.save(analysis);
    }

    const rows = await this.db.$queryRaw<DbPullRequestAnalysisRow[]>`
      INSERT INTO pull_request_analyses (
        id,
        pull_request_id,
        purpose_summary,
        impact_summary,
        test_recommendation,
        risk_level,
        analysis_status,
        ok_count,
        discuss_count,
        risk_count,
        conclusion,
        error_trace,
        created_at,
        updated_at
      )
      VALUES (
        ${analysis.id}::uuid,
        ${analysis.pullRequestId}::uuid,
        ${analysis.purposeSummary},
        ${analysis.impactSummary},
        ${analysis.testRecommendation},
        ${analysis.riskLevel},
        ${analysis.analysisStatus},
        ${analysis.okCount},
        ${analysis.discussCount},
        ${analysis.riskCount},
        ${analysis.conclusion},
        ${JSON.stringify(analysis.errorTrace)}::jsonb,
        ${analysis.createdAt}::timestamptz,
        ${analysis.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        pull_request_id = EXCLUDED.pull_request_id,
        purpose_summary = EXCLUDED.purpose_summary,
        impact_summary = EXCLUDED.impact_summary,
        test_recommendation = EXCLUDED.test_recommendation,
        risk_level = EXCLUDED.risk_level,
        analysis_status = EXCLUDED.analysis_status,
        ok_count = EXCLUDED.ok_count,
        discuss_count = EXCLUDED.discuss_count,
        risk_count = EXCLUDED.risk_count,
        conclusion = EXCLUDED.conclusion,
        error_trace = EXCLUDED.error_trace,
        updated_at = EXCLUDED.updated_at
      RETURNING ${analysisSelectColumns}
    `;

    return toAnalysisRecord(requireSingleRow(rows));
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for Review analysis DB mode");
    }

    return this.database as RawDatabaseClient;
  }
}

const analysisSelectColumns = Prisma.sql`
  id::text AS id,
  pull_request_id::text AS "pullRequestId",
  purpose_summary AS "purposeSummary",
  impact_summary AS "impactSummary",
  test_recommendation AS "testRecommendation",
  risk_level AS "riskLevel",
  analysis_status AS "analysisStatus",
  ok_count AS "okCount",
  discuss_count AS "discussCount",
  risk_count AS "riskCount",
  conclusion,
  error_trace AS "errorTrace",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function requireSingleRow(rows: DbPullRequestAnalysisRow[]) {
  const row = rows[0];

  if (!row) {
    throw new Error("Pull request analysis was not found");
  }

  return row;
}

function toAnalysisRecord(
  row: DbPullRequestAnalysisRow,
): PullRequestAnalysisRecord {
  return {
    id: row.id,
    pullRequestId: row.pullRequestId,
    purposeSummary: row.purposeSummary,
    impactSummary: row.impactSummary,
    testRecommendation: row.testRecommendation,
    riskLevel: row.riskLevel as PullRequestAnalysisRecord["riskLevel"],
    analysisStatus:
      row.analysisStatus as PullRequestAnalysisRecord["analysisStatus"],
    okCount: Number(row.okCount),
    discussCount: Number(row.discussCount),
    riskCount: Number(row.riskCount),
    conclusion: row.conclusion,
    errorTrace: toErrorTrace(row.errorTrace),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toErrorTrace(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeParseJson(value) : value;

  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
