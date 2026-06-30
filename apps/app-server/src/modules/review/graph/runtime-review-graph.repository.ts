import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  NodeReviewStateRecord,
  ReviewCanvasPosition,
  ReviewGraphRecord,
  ReviewNodeRecord,
} from "./review-graph.types";
import { InMemoryReviewGraphRepository } from "./in-memory-review-graph.repository";
import { ReviewGraphRepository } from "./review-graph.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
};

type DbReviewGraphRow = {
  id: string;
  analysisId: string;
  pullRequestId: string | null;
  summary: string | null;
  intentSummary: string;
  reviewStrategy: string;
  reviewOrder: unknown;
};

type DbReviewNodeRow = {
  id: string;
  graphId: string;
  nodeType: string;
  label: string;
  filePath: string | null;
  functionName: string | null;
  riskLevel: string;
  reviewOrder: number;
  roleSummary: string;
  reviewReason: string;
  position: unknown;
};

type DbNodeReviewStateRow = {
  id: string;
  nodeId: string;
  reviewerMemberId: string;
  status: string;
  comment: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

@Injectable()
export class RuntimeReviewGraphRepository implements ReviewGraphRepository {
  private readonly memory = new InMemoryReviewGraphRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get mode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async findGraphByAnalysis(analysisId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findGraphByAnalysis(analysisId);
    }

    const rows = await this.db.$queryRaw<DbReviewGraphRow[]>`
      SELECT ${graphSelectColumns}
      FROM review_graphs
      WHERE analysis_id = ${analysisId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toGraphRecord(rows[0]) : null;
  }

  async saveGraph(graph: ReviewGraphRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveGraph(graph);
    }

    const rows = await this.db.$queryRaw<DbReviewGraphRow[]>`
      INSERT INTO review_graphs (
        id,
        analysis_id,
        pull_request_id,
        summary,
        intent_summary,
        review_strategy,
        review_order
      )
      VALUES (
        ${graph.id}::uuid,
        ${graph.analysisId}::uuid,
        ${graph.pullRequestId}::uuid,
        ${graph.summary},
        ${graph.intentSummary},
        ${graph.reviewStrategy},
        ${JSON.stringify(graph.reviewOrder)}::jsonb
      )
      ON CONFLICT (analysis_id) DO UPDATE SET
        pull_request_id = EXCLUDED.pull_request_id,
        summary = EXCLUDED.summary,
        intent_summary = EXCLUDED.intent_summary,
        review_strategy = EXCLUDED.review_strategy,
        review_order = EXCLUDED.review_order,
        updated_at = now()
      RETURNING ${graphSelectColumns}
    `;

    return toGraphRecord(requireSingleRow(rows, "Review graph"));
  }

  async findNodeById(nodeId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findNodeById(nodeId);
    }

    const rows = await this.db.$queryRaw<DbReviewNodeRow[]>`
      SELECT ${nodeSelectColumns}
      FROM review_nodes
      WHERE id = ${nodeId}
      LIMIT 1
    `;

    return rows[0] ? toNodeRecord(rows[0]) : null;
  }

  async listNodesByGraph(graphId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.listNodesByGraph(graphId);
    }

    const rows = await this.db.$queryRaw<DbReviewNodeRow[]>`
      SELECT ${nodeSelectColumns}
      FROM review_nodes
      WHERE graph_id = ${graphId}::uuid
      ORDER BY review_order ASC, id ASC
    `;

    return rows.map(toNodeRecord);
  }

  async saveNode(node: ReviewNodeRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveNode(node);
    }

    const rows = await this.db.$queryRaw<DbReviewNodeRow[]>`
      INSERT INTO review_nodes (
        id,
        graph_id,
        node_type,
        label,
        file_path,
        function_name,
        risk_level,
        review_order,
        role_summary,
        review_reason,
        position
      )
      VALUES (
        ${node.id},
        ${node.graphId}::uuid,
        ${node.nodeType},
        ${node.label},
        ${node.filePath},
        ${node.functionName},
        ${node.riskLevel},
        ${node.reviewOrder},
        ${node.roleSummary},
        ${node.reviewReason},
        ${JSON.stringify(node.position)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        graph_id = EXCLUDED.graph_id,
        node_type = EXCLUDED.node_type,
        label = EXCLUDED.label,
        file_path = EXCLUDED.file_path,
        function_name = EXCLUDED.function_name,
        risk_level = EXCLUDED.risk_level,
        review_order = EXCLUDED.review_order,
        role_summary = EXCLUDED.role_summary,
        review_reason = EXCLUDED.review_reason,
        position = EXCLUDED.position,
        updated_at = now()
      RETURNING ${nodeSelectColumns}
    `;

    return toNodeRecord(requireSingleRow(rows, "Review node"));
  }

  async findStateByNodeReviewer(nodeId: string, reviewerMemberId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findStateByNodeReviewer(nodeId, reviewerMemberId);
    }

    const rows = await this.db.$queryRaw<DbNodeReviewStateRow[]>`
      SELECT ${stateSelectColumns}
      FROM node_review_states
      WHERE node_id = ${nodeId}
        AND reviewer_member_id = ${reviewerMemberId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toStateRecord(rows[0]) : null;
  }

  async listStatesByNode(nodeId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.listStatesByNode(nodeId);
    }

    const rows = await this.db.$queryRaw<DbNodeReviewStateRow[]>`
      SELECT ${stateSelectColumns}
      FROM node_review_states
      WHERE node_id = ${nodeId}
      ORDER BY updated_at DESC, id ASC
    `;

    return rows.map(toStateRecord);
  }

  async saveState(state: NodeReviewStateRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveState(state);
    }

    const rows = await this.db.$queryRaw<DbNodeReviewStateRow[]>`
      INSERT INTO node_review_states (
        id,
        node_id,
        reviewer_member_id,
        status,
        comment,
        created_at,
        updated_at
      )
      VALUES (
        ${state.id}::uuid,
        ${state.nodeId},
        ${state.reviewerMemberId}::uuid,
        ${state.status},
        ${state.comment},
        ${state.createdAt}::timestamptz,
        ${state.updatedAt}::timestamptz
      )
      ON CONFLICT (node_id, reviewer_member_id) DO UPDATE SET
        status = EXCLUDED.status,
        comment = EXCLUDED.comment,
        updated_at = EXCLUDED.updated_at
      RETURNING ${stateSelectColumns}
    `;

    return toStateRecord(requireSingleRow(rows, "Review node state"));
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for Review graph DB mode");
    }

    return this.database as RawDatabaseClient;
  }
}

const graphSelectColumns = Prisma.sql`
  id::text AS id,
  analysis_id::text AS "analysisId",
  pull_request_id::text AS "pullRequestId",
  summary,
  intent_summary AS "intentSummary",
  review_strategy AS "reviewStrategy",
  review_order AS "reviewOrder"
`;

const nodeSelectColumns = Prisma.sql`
  id,
  graph_id::text AS "graphId",
  node_type AS "nodeType",
  label,
  file_path AS "filePath",
  function_name AS "functionName",
  risk_level AS "riskLevel",
  review_order AS "reviewOrder",
  role_summary AS "roleSummary",
  review_reason AS "reviewReason",
  position
`;

const stateSelectColumns = Prisma.sql`
  id::text AS id,
  node_id AS "nodeId",
  reviewer_member_id::text AS "reviewerMemberId",
  status,
  comment,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function requireSingleRow<T>(rows: T[], label: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(`${label} was not found`);
  }

  return row;
}

function toGraphRecord(row: DbReviewGraphRow): ReviewGraphRecord {
  return {
    id: row.id,
    analysisId: row.analysisId,
    pullRequestId: row.pullRequestId,
    summary: row.summary,
    intentSummary: row.intentSummary,
    reviewStrategy: row.reviewStrategy,
    reviewOrder: toStringArray(row.reviewOrder),
  };
}

function toNodeRecord(row: DbReviewNodeRow): ReviewNodeRecord {
  return {
    id: row.id,
    graphId: row.graphId,
    nodeType: row.nodeType as ReviewNodeRecord["nodeType"],
    label: row.label,
    filePath: row.filePath,
    functionName: row.functionName,
    riskLevel: row.riskLevel as ReviewNodeRecord["riskLevel"],
    reviewOrder: Number(row.reviewOrder),
    roleSummary: row.roleSummary,
    reviewReason: row.reviewReason,
    position: toPosition(row.position),
  };
}

function toStateRecord(row: DbNodeReviewStateRow): NodeReviewStateRecord {
  return {
    id: row.id,
    nodeId: row.nodeId,
    reviewerMemberId: row.reviewerMemberId,
    status: row.status as NodeReviewStateRecord["status"],
    comment: row.comment,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toStringArray(value: unknown): string[] {
  const parsed = typeof value === "string" ? safeParseJson(value) : value;

  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function toPosition(value: unknown): ReviewCanvasPosition {
  const parsed = typeof value === "string" ? safeParseJson(value) : value;

  if (!parsed || typeof parsed !== "object") {
    return { x: 0, y: 0 };
  }

  const maybePosition = parsed as { x?: unknown; y?: unknown };

  return {
    x: typeof maybePosition.x === "number" ? maybePosition.x : 0,
    y: typeof maybePosition.y === "number" ? maybePosition.y : 0,
  };
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
