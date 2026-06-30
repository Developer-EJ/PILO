import {
  ChangedFileRecord,
  ChangedFunctionRecord,
} from "./changed-file.types";

export type MaybePromise<T> = T | Promise<T>;

export abstract class ChangedFilesRepository {
  abstract findFileByAnalysisAndPath(
    analysisId: string,
    filePath: string,
  ): MaybePromise<ChangedFileRecord | null>;

  abstract findFileById(
    changedFileId: string,
  ): MaybePromise<ChangedFileRecord | null>;

  abstract listFilesByAnalysis(
    analysisId: string,
  ): MaybePromise<ChangedFileRecord[]>;

  abstract listFunctionsByFile(
    changedFileId: string,
  ): MaybePromise<ChangedFunctionRecord[]>;

  abstract findFunctionByFileAndName(
    changedFileId: string,
    name: string,
  ): MaybePromise<ChangedFunctionRecord | null>;

  abstract saveFile(
    file: ChangedFileRecord,
  ): MaybePromise<ChangedFileRecord>;

  abstract saveFunction(
    changedFunction: ChangedFunctionRecord,
  ): MaybePromise<ChangedFunctionRecord>;
}
