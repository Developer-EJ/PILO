import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  CodeReviewRoomRecord,
  CreateCodeReviewRoomInput,
} from "./code-review-room.types";
import { CodeReviewRoomRepository } from "./code-review-room.repository";
import { InMemoryCodeReviewRoomRepository } from "./in-memory-code-review-room.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
};

type DbCodeReviewRoomRow = {
  id: string;
  workspaceId: string;
  pullRequestId: string;
  status: string;
  createdByMemberId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

@Injectable()
export class RuntimeCodeReviewRoomRepository
  implements CodeReviewRoomRepository
{
  private readonly memory = new InMemoryCodeReviewRoomRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get mode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async findById(roomId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findById(roomId);
    }

    const rows = await this.db.$queryRaw<DbCodeReviewRoomRow[]>`
      SELECT ${roomSelectColumns}
      FROM code_review_rooms
      WHERE id = ${roomId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toRoomRecord(rows[0]) : null;
  }

  async findByPullRequestId(pullRequestId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findByPullRequestId(pullRequestId);
    }

    const rows = await this.db.$queryRaw<DbCodeReviewRoomRow[]>`
      SELECT ${roomSelectColumns}
      FROM code_review_rooms
      WHERE pull_request_id = ${pullRequestId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toRoomRecord(rows[0]) : null;
  }

  async create(input: CreateCodeReviewRoomInput) {
    if (!this.shouldUseDatabase) {
      return this.memory.create(input);
    }

    const rows = await this.db.$queryRaw<DbCodeReviewRoomRow[]>`
      INSERT INTO code_review_rooms (
        id,
        workspace_id,
        pull_request_id,
        status,
        created_by_member_id,
        created_at,
        updated_at
      )
      VALUES (
        ${input.id}::uuid,
        ${input.workspaceId}::uuid,
        ${input.pullRequestId}::uuid,
        ${"open"},
        ${input.createdByMemberId}::uuid,
        ${input.createdAt}::timestamptz,
        ${input.createdAt}::timestamptz
      )
      ON CONFLICT (pull_request_id) DO UPDATE SET
        pull_request_id = EXCLUDED.pull_request_id
      RETURNING ${roomSelectColumns}
    `;

    return toRoomRecord(requireSingleRow(rows, "Code review room"));
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for Review room DB mode");
    }

    return this.database as RawDatabaseClient;
  }
}

const roomSelectColumns = Prisma.sql`
  id::text AS id,
  workspace_id::text AS "workspaceId",
  pull_request_id::text AS "pullRequestId",
  status,
  created_by_member_id::text AS "createdByMemberId",
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

function toRoomRecord(row: DbCodeReviewRoomRow): CodeReviewRoomRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    pullRequestId: row.pullRequestId,
    status: row.status as CodeReviewRoomRecord["status"],
    createdByMemberId: row.createdByMemberId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
