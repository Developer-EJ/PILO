export type DocumentEventName =
  | "document_checkpoint_conflict"
  | "document_checkpoint_failed"
  | "document_checkpoint_started"
  | "document_checkpoint_succeeded"
  | "document_redis_sync_ready"
  | "document_redis_sync_unavailable"
  | "document_room_authenticated";

export type DocumentEvent = {
  documentId?: string;
  durationMs?: number;
  event: DocumentEventName;
  expectedVersion?: number;
  savedVersion?: number;
  status?: number | string;
  workspaceId?: string;
};

export type DocumentEventLogger = (event: DocumentEvent) => void;

export function createDocumentEventLogger({
  instanceId,
  write = console.log,
}: {
  instanceId: string;
  write?: (line: string) => void;
}): DocumentEventLogger {
  return (event) => {
    write(
      JSON.stringify({
        documentId: event.documentId,
        durationMs: event.durationMs,
        event: event.event,
        expectedVersion: event.expectedVersion,
        instanceId,
        savedVersion: event.savedVersion,
        status: event.status,
        workspaceId: event.workspaceId,
      }),
    );
  };
}
