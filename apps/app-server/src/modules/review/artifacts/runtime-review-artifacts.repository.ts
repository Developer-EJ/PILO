import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  ReviewChecklistItemRecord,
  ReviewChecklistType,
  ReviewCommentRecord,
} from "./review-artifact.types";
import { ReviewArtifactsRepository } from "./review-artifacts.repository";
import { InMemoryReviewArtifactsRepository } from "./in-memory-review-artifacts.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
};

type DbReviewCommentRow = {
  id: string;
  roomId: string;
  authorMemberId: string;
  nodeId: string | null;
  changedFileId: string | null;
  changedFunctionId: string | null;
  body: string;
  createdAt: Date | string;
};

type DbReviewChecklistItemRow = {
  id: string;
  analysisId: string;
  checklistType: string;
  title: string;
  status: string;
  checkedByMemberId: string | null;
  checkedAt: Date | string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbMaxSortOrderRow = {
  maxSortOrder: number | null;
};

@Injectable()
export class RuntimeReviewArtifactsRepository
  implements ReviewArtifactsRepository
{
  private readonly memory = new InMemoryReviewArtifactsRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get mode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async saveComment(comment: ReviewCommentRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveComment(comment);
    }

    const rows = await this.db.$queryRaw<DbReviewCommentRow[]>`
      INSERT INTO review_comments (
        id,
        room_id,
        author_member_id,
        node_id,
        changed_file_id,
        changed_function_id,
        body,
        created_at,
        updated_at
      )
      VALUES (
        ${comment.id}::uuid,
        ${comment.roomId}::uuid,
        ${comment.authorMemberId}::uuid,
        ${comment.nodeId},
        ${comment.changedFileId}::uuid,
        ${comment.changedFunctionId}::uuid,
        ${comment.body},
        ${comment.createdAt}::timestamptz,
        ${comment.createdAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        body = EXCLUDED.body,
        updated_at = EXCLUDED.updated_at
      RETURNING ${commentSelectColumns}
    `;

    return toCommentRecord(requireSingleRow(rows, "Review comment"));
  }

  async listCommentsByRoom(roomId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.listCommentsByRoom(roomId);
    }

    const rows = await this.db.$queryRaw<DbReviewCommentRow[]>`
      SELECT ${commentSelectColumns}
      FROM review_comments
      WHERE room_id = ${roomId}::uuid
      ORDER BY created_at ASC, id ASC
    `;

    return rows.map(toCommentRecord);
  }

  async findChecklistItemBySlot(
    analysisId: string,
    checklistType: ReviewChecklistType,
    sortOrder: number,
  ) {
    if (!this.shouldUseDatabase) {
      return this.memory.findChecklistItemBySlot(
        analysisId,
        checklistType,
        sortOrder,
      );
    }

    const rows = await this.db.$queryRaw<DbReviewChecklistItemRow[]>`
      SELECT ${checklistSelectColumns}
      FROM review_checklist_items
      WHERE analysis_id = ${analysisId}::uuid
        AND checklist_type = ${checklistType}
        AND sort_order = ${sortOrder}
      LIMIT 1
    `;

    return rows[0] ? toChecklistItemRecord(rows[0]) : null;
  }

  async listChecklistItems(analysisId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.listChecklistItems(analysisId);
    }

    const rows = await this.db.$queryRaw<DbReviewChecklistItemRow[]>`
      SELECT ${checklistSelectColumns}
      FROM review_checklist_items
      WHERE analysis_id = ${analysisId}::uuid
      ORDER BY sort_order ASC, id ASC
    `;

    return rows.map(toChecklistItemRecord);
  }

  async findChecklistItemById(itemId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findChecklistItemById(itemId);
    }

    const rows = await this.db.$queryRaw<DbReviewChecklistItemRow[]>`
      SELECT ${checklistSelectColumns}
      FROM review_checklist_items
      WHERE id = ${itemId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toChecklistItemRecord(rows[0]) : null;
  }

  async nextChecklistSortOrder(
    analysisId: string,
    checklistType: ReviewChecklistType,
  ) {
    if (!this.shouldUseDatabase) {
      return this.memory.nextChecklistSortOrder(analysisId, checklistType);
    }

    const rows = await this.db.$queryRaw<DbMaxSortOrderRow[]>`
      SELECT MAX(sort_order) AS "maxSortOrder"
      FROM review_checklist_items
      WHERE analysis_id = ${analysisId}::uuid
        AND checklist_type = ${checklistType}
    `;
    const maxSortOrder = rows[0]?.maxSortOrder;

    return Number.isInteger(maxSortOrder) ? Number(maxSortOrder) + 1 : 0;
  }

  async saveChecklistItem(item: ReviewChecklistItemRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveChecklistItem(item);
    }

    const rows = await this.db.$queryRaw<DbReviewChecklistItemRow[]>`
      INSERT INTO review_checklist_items (
        id,
        analysis_id,
        checklist_type,
        title,
        status,
        checked_by_member_id,
        checked_at,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (
        ${item.id}::uuid,
        ${item.analysisId}::uuid,
        ${item.checklistType},
        ${item.title},
        ${item.status},
        ${item.checkedByMemberId}::uuid,
        ${item.checkedAt}::timestamptz,
        ${item.sortOrder},
        ${item.createdAt}::timestamptz,
        ${item.updatedAt}::timestamptz
      )
      ON CONFLICT (analysis_id, checklist_type, sort_order) DO UPDATE SET
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        checked_by_member_id = EXCLUDED.checked_by_member_id,
        checked_at = EXCLUDED.checked_at,
        updated_at = EXCLUDED.updated_at
      RETURNING ${checklistSelectColumns}
    `;

    return toChecklistItemRecord(
      requireSingleRow(rows, "Review checklist item"),
    );
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error(
        "DatabaseService is required for Review artifacts DB mode",
      );
    }

    return this.database as RawDatabaseClient;
  }
}

const commentSelectColumns = Prisma.sql`
  id::text AS id,
  room_id::text AS "roomId",
  author_member_id::text AS "authorMemberId",
  node_id AS "nodeId",
  changed_file_id::text AS "changedFileId",
  changed_function_id::text AS "changedFunctionId",
  body,
  created_at AS "createdAt"
`;

const checklistSelectColumns = Prisma.sql`
  id::text AS id,
  analysis_id::text AS "analysisId",
  checklist_type AS "checklistType",
  title,
  status,
  checked_by_member_id::text AS "checkedByMemberId",
  checked_at AS "checkedAt",
  sort_order AS "sortOrder",
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

function toCommentRecord(row: DbReviewCommentRow): ReviewCommentRecord {
  return {
    id: row.id,
    roomId: row.roomId,
    authorMemberId: row.authorMemberId,
    nodeId: row.nodeId,
    changedFileId: row.changedFileId,
    changedFunctionId: row.changedFunctionId,
    body: row.body,
    createdAt: toIsoString(row.createdAt),
  };
}

function toChecklistItemRecord(
  row: DbReviewChecklistItemRow,
): ReviewChecklistItemRecord {
  return {
    id: row.id,
    analysisId: row.analysisId,
    checklistType: row.checklistType as ReviewChecklistItemRecord["checklistType"],
    title: row.title,
    status: row.status as ReviewChecklistItemRecord["status"],
    checkedByMemberId: row.checkedByMemberId,
    checkedAt: row.checkedAt ? toIsoString(row.checkedAt) : null,
    sortOrder: Number(row.sortOrder),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
