import { Injectable, Optional } from "@nestjs/common";

export interface DocumentSnapshotConflictObservation {
  documentId: string;
  expectedVersion: number;
  currentVersion: number;
}

export interface DocumentSnapshotConflictEvent {
  event: "document_snapshot_conflict";
  status: 409;
  documentId: string;
  expectedVersion: number;
  currentVersion: number;
}

export interface DocumentConflictLogger {
  warn(message: string): void;
}

const stderrDocumentConflictLogger: DocumentConflictLogger = {
  warn(message) {
    process.stderr.write(`${message}\n`);
  }
};

export function buildDocumentSnapshotConflictEvent(
  input: DocumentSnapshotConflictObservation
): DocumentSnapshotConflictEvent {
  return {
    event: "document_snapshot_conflict",
    status: 409,
    documentId: input.documentId,
    expectedVersion: input.expectedVersion,
    currentVersion: input.currentVersion
  };
}

@Injectable()
export class DocumentConflictObserver {
  private readonly logger: DocumentConflictLogger;

  constructor(@Optional() logger?: DocumentConflictLogger) {
    this.logger = logger ?? stderrDocumentConflictLogger;
  }

  observe(input: DocumentSnapshotConflictObservation): void {
    try {
      this.logger.warn(JSON.stringify(buildDocumentSnapshotConflictEvent(input)));
    } catch {
      return;
    }
  }
}
