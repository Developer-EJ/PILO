import { Injectable } from "@nestjs/common";
import { ChangedFileRecord, ChangedFunctionRecord } from "./changed-file.types";

@Injectable()
export class InMemoryChangedFilesRepository {
  private readonly filesById = new Map<string, ChangedFileRecord>();
  private readonly fileIdsByAnalysisAndPath = new Map<string, string>();
  private readonly functionsById = new Map<string, ChangedFunctionRecord>();
  private readonly functionIdsByFileAndName = new Map<string, string>();

  findFileByAnalysisAndPath(
    analysisId: string,
    filePath: string,
  ): ChangedFileRecord | null {
    const fileId = this.fileIdsByAnalysisAndPath.get(
      this.fileKey(analysisId, filePath),
    );
    return fileId ? (this.filesById.get(fileId) ?? null) : null;
  }

  listFilesByAnalysis(analysisId: string): ChangedFileRecord[] {
    return [...this.filesById.values()]
      .filter((file) => file.analysisId === analysisId)
      .sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  listFunctionsByFile(changedFileId: string): ChangedFunctionRecord[] {
    return [...this.functionsById.values()]
      .filter(
        (changedFunction) => changedFunction.changedFileId === changedFileId,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  findFunctionByFileAndName(
    changedFileId: string,
    name: string,
  ): ChangedFunctionRecord | null {
    const functionId = this.functionIdsByFileAndName.get(
      this.functionKey(changedFileId, name),
    );
    return functionId ? (this.functionsById.get(functionId) ?? null) : null;
  }

  saveFile(file: ChangedFileRecord): ChangedFileRecord {
    this.filesById.set(file.id, file);
    this.fileIdsByAnalysisAndPath.set(
      this.fileKey(file.analysisId, file.filePath),
      file.id,
    );
    return file;
  }

  saveFunction(changedFunction: ChangedFunctionRecord): ChangedFunctionRecord {
    this.functionsById.set(changedFunction.id, changedFunction);
    this.functionIdsByFileAndName.set(
      this.functionKey(changedFunction.changedFileId, changedFunction.name),
      changedFunction.id,
    );
    return changedFunction;
  }

  private fileKey(analysisId: string, filePath: string): string {
    return `${analysisId}:${filePath}`;
  }

  private functionKey(changedFileId: string, name: string): string {
    return `${changedFileId}:${name}`;
  }
}
