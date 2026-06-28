import { Injectable } from "@nestjs/common";
import { ChangedFileWithFunctions } from "../changes/changed-file.types";
import { ChangedFilesService } from "../changes/changed-files.service";

export interface AgentChangedFileResult {
  id?: string;
  filePath: string;
  changeType: string;
  additions?: number;
  deletions?: number;
  summary?: string | null;
  functions?: AgentChangedFunctionResult[];
}

export interface AgentChangedFunctionResult {
  id?: string;
  name: string;
  changeType: string;
  summary?: string | null;
}

@Injectable()
export class AgentChangedFilesResultService {
  constructor(private readonly changedFilesService: ChangedFilesService) {}

  applyChangedFiles(
    analysisId: string,
    changedFiles: AgentChangedFileResult[] = [],
  ): ChangedFileWithFunctions[] {
    for (const file of changedFiles) {
      const savedFile = this.changedFilesService.upsertChangedFile({
        id: file.id,
        analysisId,
        filePath: file.filePath,
        changeType: file.changeType,
        additions: file.additions,
        deletions: file.deletions,
        summary: file.summary,
      });

      for (const changedFunction of file.functions ?? []) {
        this.changedFilesService.upsertChangedFunction({
          id: changedFunction.id,
          changedFileId: savedFile.id,
          name: changedFunction.name,
          changeType: changedFunction.changeType,
          summary: changedFunction.summary,
        });
      }
    }

    return this.changedFilesService.listChangedFiles(analysisId);
  }
}
