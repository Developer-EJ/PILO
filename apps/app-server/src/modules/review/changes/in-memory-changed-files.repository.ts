import { Injectable } from "@nestjs/common";
import { ChangedFileRecord, ChangedFunctionRecord } from "./changed-file.types";
import { ChangedFilesRepository } from "./changed-files.repository";

@Injectable()
export class InMemoryChangedFilesRepository implements ChangedFilesRepository {
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
    return fileId ? this.cloneFileNullable(this.filesById.get(fileId)) : null;
  }

  findFileById(changedFileId: string): ChangedFileRecord | null {
    return this.cloneFileNullable(this.filesById.get(changedFileId));
  }

  listFilesByAnalysis(analysisId: string): ChangedFileRecord[] {
    return [...this.filesById.values()]
      .filter((file) => file.analysisId === analysisId)
      .sort((a, b) => a.filePath.localeCompare(b.filePath))
      .map((file) => this.cloneFile(file));
  }

  listFunctionsByFile(changedFileId: string): ChangedFunctionRecord[] {
    return [...this.functionsById.values()]
      .filter(
        (changedFunction) => changedFunction.changedFileId === changedFileId,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((changedFunction) => this.cloneFunction(changedFunction));
  }

  findFunctionByFileAndName(
    changedFileId: string,
    name: string,
  ): ChangedFunctionRecord | null {
    const functionId = this.functionIdsByFileAndName.get(
      this.functionKey(changedFileId, name),
    );
    return functionId
      ? this.cloneFunctionNullable(this.functionsById.get(functionId))
      : null;
  }

  saveFile(file: ChangedFileRecord): ChangedFileRecord {
    const previous = this.filesById.get(file.id);

    if (previous) {
      this.fileIdsByAnalysisAndPath.delete(
        this.fileKey(previous.analysisId, previous.filePath),
      );
    }

    this.filesById.set(file.id, this.cloneFile(file));
    this.fileIdsByAnalysisAndPath.set(
      this.fileKey(file.analysisId, file.filePath),
      file.id,
    );
    return this.cloneFile(file);
  }

  saveFunction(changedFunction: ChangedFunctionRecord): ChangedFunctionRecord {
    const previous = this.functionsById.get(changedFunction.id);

    if (previous) {
      this.functionIdsByFileAndName.delete(
        this.functionKey(previous.changedFileId, previous.name),
      );
    }

    this.functionsById.set(
      changedFunction.id,
      this.cloneFunction(changedFunction),
    );
    this.functionIdsByFileAndName.set(
      this.functionKey(changedFunction.changedFileId, changedFunction.name),
      changedFunction.id,
    );
    return this.cloneFunction(changedFunction);
  }

  private fileKey(analysisId: string, filePath: string): string {
    return `${analysisId}:${filePath}`;
  }

  private functionKey(changedFileId: string, name: string): string {
    return `${changedFileId}:${name}`;
  }

  private cloneFile(file: ChangedFileRecord): ChangedFileRecord {
    return { ...file };
  }

  private cloneFileNullable(
    file: ChangedFileRecord | null | undefined,
  ): ChangedFileRecord | null {
    return file ? this.cloneFile(file) : null;
  }

  private cloneFunction(
    changedFunction: ChangedFunctionRecord,
  ): ChangedFunctionRecord {
    return { ...changedFunction };
  }

  private cloneFunctionNullable(
    changedFunction: ChangedFunctionRecord | null | undefined,
  ): ChangedFunctionRecord | null {
    return changedFunction ? this.cloneFunction(changedFunction) : null;
  }
}
