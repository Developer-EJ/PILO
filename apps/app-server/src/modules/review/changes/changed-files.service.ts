import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import {
  ChangedFileChangeType,
  ChangedFileRecord,
  ChangedFileWithFunctions,
  ChangedFunctionChangeType,
  ChangedFunctionRecord,
  UpsertChangedFileInput,
  UpsertChangedFunctionInput,
} from "./changed-file.types";
import { ChangedFilesRepository } from "./changed-files.repository";

const FILE_CHANGE_TYPES = ["added", "modified", "deleted", "renamed"];
const FUNCTION_CHANGE_TYPES = ["added", "modified", "deleted"];
const FIXTURE_ANALYSIS_ID = "88888888-8888-4888-8888-888888888881";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ChangedFilesServiceOptions {
  seedFixture?: boolean;
}

@Injectable()
export class ChangedFilesService {
  constructor(
    private readonly changedFilesRepository: ChangedFilesRepository,
    @Optional()
    options: ChangedFilesServiceOptions = {},
  ) {
    if (options.seedFixture) {
      this.seedFixture();
    }
  }

  async upsertChangedFile(
    input: UpsertChangedFileInput,
  ): Promise<ChangedFileRecord> {
    const changeType = this.toFileChangeType(input.changeType);
    const existing =
      await this.changedFilesRepository.findFileByAnalysisAndPath(
        input.analysisId,
        input.filePath,
      );
    const changedAt = this.timestampOrNow(input.changedAt);

    const file: ChangedFileRecord = {
      id: existing?.id ?? this.recordId(input.id),
      analysisId: input.analysisId,
      filePath: input.filePath,
      changeType,
      additions: this.nonNegativeInteger("additions", input.additions),
      deletions: this.nonNegativeInteger("deletions", input.deletions),
      summary: input.summary ?? null,
      createdAt: existing?.createdAt ?? changedAt,
      updatedAt: changedAt,
    };

    return this.changedFilesRepository.saveFile(file);
  }

  async upsertChangedFunction(
    input: UpsertChangedFunctionInput,
  ): Promise<ChangedFunctionRecord> {
    if (!(await this.changedFilesRepository.findFileById(input.changedFileId))) {
      throw new BadRequestException(
        `Changed file was not found: ${input.changedFileId}`,
      );
    }

    const changeType = this.toFunctionChangeType(input.changeType);
    const existing =
      await this.changedFilesRepository.findFunctionByFileAndName(
        input.changedFileId,
        input.name,
      );
    const changedAt = this.timestampOrNow(input.changedAt);

    const changedFunction: ChangedFunctionRecord = {
      id: existing?.id ?? this.recordId(input.id),
      changedFileId: input.changedFileId,
      name: input.name,
      changeType,
      summary: input.summary ?? null,
      createdAt: existing?.createdAt ?? changedAt,
      updatedAt: changedAt,
    };

    return this.changedFilesRepository.saveFunction(changedFunction);
  }

  async listChangedFiles(
    analysisId: string,
  ): Promise<ChangedFileWithFunctions[]> {
    const files = await this.changedFilesRepository.listFilesByAnalysis(
      analysisId,
    );

    return Promise.all(
      files.map(async (file) => ({
        ...file,
        functions: await this.changedFilesRepository.listFunctionsByFile(
          file.id,
        ),
      })),
    );
  }

  private seedFixture(): void {
    const callbackFile: ChangedFileRecord = {
      id: "88888888-8888-4888-8888-8888888888b1",
      analysisId: FIXTURE_ANALYSIS_ID,
      filePath: "apps/frontend/app/auth/callback/page.tsx",
      changeType: "modified",
      additions: 42,
      deletions: 8,
      summary: "OAuth callback success/failure route shell.",
      createdAt: "2026-06-27T10:00:00.000Z",
      updatedAt: "2026-06-27T10:00:00.000Z",
    };

    void this.changedFilesRepository.saveFile(callbackFile);
    void this.changedFilesRepository.saveFunction({
      id: "88888888-8888-4888-8888-8888888888c1",
      changedFileId: callbackFile.id,
      name: "AuthCallbackPage",
      changeType: "modified",
      summary: "Reads provider callback query params and redirect state.",
      createdAt: "2026-06-27T10:00:00.000Z",
      updatedAt: "2026-06-27T10:00:00.000Z",
    });
  }

  private toFileChangeType(value: string): ChangedFileChangeType {
    if (FILE_CHANGE_TYPES.includes(value)) {
      return value as ChangedFileChangeType;
    }

    throw new BadRequestException(`Invalid changed file type: ${value}`);
  }

  private toFunctionChangeType(value: string): ChangedFunctionChangeType {
    if (FUNCTION_CHANGE_TYPES.includes(value)) {
      return value as ChangedFunctionChangeType;
    }

    throw new BadRequestException(`Invalid changed function type: ${value}`);
  }

  private nonNegativeInteger(fieldName: string, value = 0): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative integer`,
      );
    }

    return value;
  }

  private timestampOrNow(value?: string): string {
    if (!value) {
      return new Date().toISOString();
    }

    if (Number.isNaN(Date.parse(value))) {
      throw new BadRequestException("changedAt must be a valid ISO timestamp");
    }

    return value;
  }

  private recordId(candidate?: string): string {
    return candidate && UUID_PATTERN.test(candidate) ? candidate : randomUUID();
  }
}
