export type ChangedFileChangeType =
  | "added"
  | "modified"
  | "deleted"
  | "renamed";
export type ChangedFunctionChangeType = "added" | "modified" | "deleted";

export interface ChangedFileRecord {
  id: string;
  analysisId: string;
  filePath: string;
  changeType: ChangedFileChangeType;
  additions: number;
  deletions: number;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangedFunctionRecord {
  id: string;
  changedFileId: string;
  name: string;
  changeType: ChangedFunctionChangeType;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangedFileWithFunctions extends ChangedFileRecord {
  functions: ChangedFunctionRecord[];
}

export interface UpsertChangedFileInput {
  id?: string;
  analysisId: string;
  filePath: string;
  changeType: ChangedFileChangeType;
  additions?: number;
  deletions?: number;
  summary?: string | null;
  changedAt?: string;
}

export interface UpsertChangedFunctionInput {
  id?: string;
  changedFileId: string;
  name: string;
  changeType: ChangedFunctionChangeType;
  summary?: string | null;
  changedAt?: string;
}
