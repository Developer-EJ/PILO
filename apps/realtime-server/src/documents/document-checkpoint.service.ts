import { createRequire } from "node:module";

import {
  DocumentCheckpointError,
  type DocumentAppServerClient,
} from "./document-app-server-client";
import type { DocumentRoomRef } from "./document-types";
import type { DocumentEventLogger } from "./document-observability";

export { DocumentCheckpointError } from "./document-app-server-client";

const moduleRequire = createRequire(__filename);
const Y = moduleRequire("yjs") as {
  applyUpdate: (
    document: YDocument,
    update: Uint8Array,
    origin?: { skipStoreHooks: boolean; source: "local" },
  ) => void;
  encodeStateAsUpdate: (document: YDocument) => Uint8Array;
};
const { yXmlFragmentToProsemirrorJSON } = moduleRequire("y-prosemirror") as {
  yXmlFragmentToProsemirrorJSON: (fragment: unknown) => Record<string, unknown>;
};

type YDocument = {
  getXmlFragment: (name: string) => unknown;
};

const checkpointMergeOrigin = { skipStoreHooks: true, source: "local" } as const;

type DocumentCheckpointContext = DocumentRoomRef & {
  accessToken: string;
};

type DocumentCheckpointStoreInput = DocumentCheckpointContext & {
  document: YDocument;
};

export type DocumentCheckpointService = {
  loadDocument: (input: DocumentCheckpointContext) => Promise<Uint8Array>;
  storeDocument: (input: DocumentCheckpointStoreInput) => Promise<void>;
};

export function createDocumentCheckpointService({
  client,
  eventLogger = () => undefined,
}: {
  client: DocumentAppServerClient;
  eventLogger?: DocumentEventLogger;
}): DocumentCheckpointService {
  const currentVersionByRoom = new Map<string, number>();

  async function loadDocument(input: DocumentCheckpointContext) {
    const bootstrap = await client.getDocument(input);
    currentVersionByRoom.set(roomKey(input), bootstrap.document.currentVersion);
    return Buffer.from(bootstrap.snapshot.yjsState, "base64");
  }

  async function storeDocument(input: DocumentCheckpointStoreInput) {
    const key = roomKey(input);
    const expectedVersion = currentVersionByRoom.get(key);

    if (expectedVersion === undefined) {
      throw new Error("Document checkpoint must load before store");
    }

    const startedAt = performance.now();
    eventLogger({
      documentId: input.documentId,
      event: "document_checkpoint_started",
      expectedVersion,
      workspaceId: input.workspaceId,
    });

    try {
      const savedVersion = await save(input, expectedVersion);
      reportSucceeded(input, expectedVersion, savedVersion, startedAt);
      return;
    } catch (error) {
      if (!(error instanceof DocumentCheckpointError) || error.status !== 409) {
        reportFailed(input, expectedVersion, error, startedAt);
        throw error;
      }
      eventLogger({
        documentId: input.documentId,
        event: "document_checkpoint_conflict",
        expectedVersion,
        status: error.status,
        workspaceId: input.workspaceId,
      });
    }

    const latest = await client.getDocument(input);
    Y.applyUpdate(
      input.document,
      Buffer.from(latest.snapshot.yjsState, "base64"),
      checkpointMergeOrigin,
    );
    currentVersionByRoom.set(key, latest.document.currentVersion);
    try {
      const savedVersion = await save(input, latest.document.currentVersion);
      reportSucceeded(
        input,
        latest.document.currentVersion,
        savedVersion,
        startedAt,
      );
    } catch (error) {
      reportFailed(input, latest.document.currentVersion, error, startedAt);
      throw error;
    }
  }

  async function save(input: DocumentCheckpointStoreInput, expectedVersion: number) {
    const result = await client.saveDocumentSnapshot({
      ...input,
      contentJson: serializeContentJson(input.document),
      expectedVersion,
      yjsState: Buffer.from(Y.encodeStateAsUpdate(input.document)).toString("base64"),
    });
    currentVersionByRoom.set(roomKey(input), result.document.currentVersion);
    return result.document.currentVersion;
  }

  function reportSucceeded(
    input: DocumentCheckpointStoreInput,
    expectedVersion: number,
    savedVersion: number,
    startedAt: number,
  ) {
    eventLogger({
      documentId: input.documentId,
      durationMs: elapsedMs(startedAt),
      event: "document_checkpoint_succeeded",
      expectedVersion,
      savedVersion,
      status: 200,
      workspaceId: input.workspaceId,
    });
  }

  function reportFailed(
    input: DocumentCheckpointStoreInput,
    expectedVersion: number,
    error: unknown,
    startedAt: number,
  ) {
    eventLogger({
      documentId: input.documentId,
      durationMs: elapsedMs(startedAt),
      event: "document_checkpoint_failed",
      expectedVersion,
      status: error instanceof DocumentCheckpointError ? error.status : 500,
      workspaceId: input.workspaceId,
    });
  }

  return { loadDocument, storeDocument };
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function roomKey(room: DocumentRoomRef) {
  return `${room.workspaceId}:${room.documentId}`;
}

function serializeContentJson(document: YDocument): Record<string, unknown> {
  return yXmlFragmentToProsemirrorJSON(document.getXmlFragment("default"));
}
