import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../../database/database.service";
import {
  ChangedFileRecord,
  ChangedFunctionRecord,
} from "./changed-file.types";
import { ChangedFilesRepository } from "./changed-files.repository";
import { InMemoryChangedFilesRepository } from "./in-memory-changed-files.repository";

type RawDatabaseClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
};

type DbChangedFileRow = {
  id: string;
  analysisId: string;
  filePath: string;
  changeType: string;
  additions: number;
  deletions: number;
  summary: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbChangedFunctionRow = {
  id: string;
  changedFileId: string;
  name: string;
  changeType: string;
  summary: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

@Injectable()
export class RuntimeChangedFilesRepository implements ChangedFilesRepository {
  private readonly memory = new InMemoryChangedFilesRepository();

  constructor(@Optional() private readonly database?: DatabaseService) {}

  get mode() {
    return this.shouldUseDatabase ? "database" : "memory";
  }

  async findFileByAnalysisAndPath(analysisId: string, filePath: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findFileByAnalysisAndPath(analysisId, filePath);
    }

    const rows = await this.db.$queryRaw<DbChangedFileRow[]>`
      SELECT ${fileSelectColumns}
      FROM changed_files
      WHERE analysis_id = ${analysisId}::uuid
        AND file_path = ${filePath}
      LIMIT 1
    `;

    return rows[0] ? toFileRecord(rows[0]) : null;
  }

  async findFileById(changedFileId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findFileById(changedFileId);
    }

    const rows = await this.db.$queryRaw<DbChangedFileRow[]>`
      SELECT ${fileSelectColumns}
      FROM changed_files
      WHERE id = ${changedFileId}::uuid
      LIMIT 1
    `;

    return rows[0] ? toFileRecord(rows[0]) : null;
  }

  async listFilesByAnalysis(analysisId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.listFilesByAnalysis(analysisId);
    }

    const rows = await this.db.$queryRaw<DbChangedFileRow[]>`
      SELECT ${fileSelectColumns}
      FROM changed_files
      WHERE analysis_id = ${analysisId}::uuid
      ORDER BY file_path ASC
    `;

    return rows.map(toFileRecord);
  }

  async listFunctionsByFile(changedFileId: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.listFunctionsByFile(changedFileId);
    }

    const rows = await this.db.$queryRaw<DbChangedFunctionRow[]>`
      SELECT ${functionSelectColumns}
      FROM changed_functions
      WHERE changed_file_id = ${changedFileId}::uuid
      ORDER BY name ASC
    `;

    return rows.map(toFunctionRecord);
  }

  async findFunctionByFileAndName(changedFileId: string, name: string) {
    if (!this.shouldUseDatabase) {
      return this.memory.findFunctionByFileAndName(changedFileId, name);
    }

    const rows = await this.db.$queryRaw<DbChangedFunctionRow[]>`
      SELECT ${functionSelectColumns}
      FROM changed_functions
      WHERE changed_file_id = ${changedFileId}::uuid
        AND name = ${name}
      LIMIT 1
    `;

    return rows[0] ? toFunctionRecord(rows[0]) : null;
  }

  async saveFile(file: ChangedFileRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveFile(file);
    }

    const rows = await this.db.$queryRaw<DbChangedFileRow[]>`
      INSERT INTO changed_files (
        id,
        analysis_id,
        file_path,
        change_type,
        additions,
        deletions,
        summary,
        created_at,
        updated_at
      )
      VALUES (
        ${file.id}::uuid,
        ${file.analysisId}::uuid,
        ${file.filePath},
        ${file.changeType},
        ${file.additions},
        ${file.deletions},
        ${file.summary},
        ${file.createdAt}::timestamptz,
        ${file.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        analysis_id = EXCLUDED.analysis_id,
        file_path = EXCLUDED.file_path,
        change_type = EXCLUDED.change_type,
        additions = EXCLUDED.additions,
        deletions = EXCLUDED.deletions,
        summary = EXCLUDED.summary,
        updated_at = EXCLUDED.updated_at
      RETURNING ${fileSelectColumns}
    `;

    return toFileRecord(requireSingleRow(rows, "Changed file"));
  }

  async saveFunction(changedFunction: ChangedFunctionRecord) {
    if (!this.shouldUseDatabase) {
      return this.memory.saveFunction(changedFunction);
    }

    const rows = await this.db.$queryRaw<DbChangedFunctionRow[]>`
      INSERT INTO changed_functions (
        id,
        changed_file_id,
        name,
        change_type,
        summary,
        created_at,
        updated_at
      )
      VALUES (
        ${changedFunction.id}::uuid,
        ${changedFunction.changedFileId}::uuid,
        ${changedFunction.name},
        ${changedFunction.changeType},
        ${changedFunction.summary},
        ${changedFunction.createdAt}::timestamptz,
        ${changedFunction.updatedAt}::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        changed_file_id = EXCLUDED.changed_file_id,
        name = EXCLUDED.name,
        change_type = EXCLUDED.change_type,
        summary = EXCLUDED.summary,
        updated_at = EXCLUDED.updated_at
      RETURNING ${functionSelectColumns}
    `;

    return toFunctionRecord(requireSingleRow(rows, "Changed function"));
  }

  private get shouldUseDatabase() {
    return Boolean(
      this.database && process.env.PILO_SKIP_DATABASE_CONNECT !== "true",
    );
  }

  private get db(): RawDatabaseClient {
    if (!this.database) {
      throw new Error("DatabaseService is required for changed files DB mode");
    }

    return this.database as RawDatabaseClient;
  }
}

const fileSelectColumns = Prisma.sql`
  id::text AS id,
  analysis_id::text AS "analysisId",
  file_path AS "filePath",
  change_type AS "changeType",
  additions,
  deletions,
  summary,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const functionSelectColumns = Prisma.sql`
  id::text AS id,
  changed_file_id::text AS "changedFileId",
  name,
  change_type AS "changeType",
  summary,
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

function toFileRecord(row: DbChangedFileRow): ChangedFileRecord {
  return {
    id: row.id,
    analysisId: row.analysisId,
    filePath: row.filePath,
    changeType: row.changeType as ChangedFileRecord["changeType"],
    additions: Number(row.additions),
    deletions: Number(row.deletions),
    summary: row.summary,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toFunctionRecord(
  row: DbChangedFunctionRow,
): ChangedFunctionRecord {
  return {
    id: row.id,
    changedFileId: row.changedFileId,
    name: row.name,
    changeType: row.changeType as ChangedFunctionRecord["changeType"],
    summary: row.summary,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
