import { createRequire } from "node:module";

import {
  DocumentCheckpointError,
  type DocumentAppServerClient,
} from "./document-app-server-client";
import type { DocumentRoomRef } from "./document-types";
import type { DocumentEventLogger } from "./document-observability";
import type { DocumentCheckpointCoordinator } from "./document-redis-sync";

export { DocumentCheckpointError } from "./document-app-server-client";

const moduleRequire = createRequire(__filename);
const Y = moduleRequire("yjs") as {
  Doc: new () => YDocument;
  applyUpdate: (
    document: YDocument,
    update: Uint8Array,
    origin?: { skipStoreHooks: boolean; source: "local" },
  ) => void;
  encodeStateAsUpdate: (
    document: YDocument,
    encodedTargetStateVector?: Uint8Array,
  ) => Uint8Array;
  encodeStateVector: (document: YDocument) => Uint8Array;
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
  drain: (options?: {
    retryDelayMs?: number;
    timeoutMs?: number;
  }) => Promise<void>;
  loadDocument: (input: DocumentCheckpointContext) => Promise<Uint8Array>;
  storeDocument: (input: DocumentCheckpointStoreInput) => Promise<void>;
};

export function createDocumentCheckpointService({
  client,
  checkpointCoordinator = null,
  eventLogger = () => undefined,
  refreshBeforeStore = false,
}: {
  client: DocumentAppServerClient;
  checkpointCoordinator?: DocumentCheckpointCoordinator | null;
  eventLogger?: DocumentEventLogger;
  refreshBeforeStore?: boolean;
}): DocumentCheckpointService {
  const currentVersionByRoom = new Map<string, number>();
  const failedStoreByRoom = new Map<string, DocumentCheckpointStoreInput>();
  const latestStoreByRoom = new Map<string, DocumentCheckpointStoreInput>();
  const pendingInputByWork = new Map<Promise<void>, DocumentCheckpointStoreInput>();
  const pendingStores = new Set<Promise<void>>();

  async function loadDocument(input: DocumentCheckpointContext) {
    const bootstrap = await client.getDocument(input);
    currentVersionByRoom.set(roomKey(input), bootstrap.document.currentVersion);
    return Buffer.from(bootstrap.snapshot.yjsState, "base64");
  }

  async function storeDocumentNow(input: DocumentCheckpointStoreInput) {
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

    let saveVersion = expectedVersion;
    if (refreshBeforeStore) {
      try {
        const latest = await client.getDocument(input);
        const latestUpdate = Buffer.from(latest.snapshot.yjsState, "base64");
        const hasUnpersistedChanges = hasChangesBeyondUpdate(
          input.document,
          latestUpdate,
        );
        Y.applyUpdate(input.document, latestUpdate, checkpointMergeOrigin);
        saveVersion = latest.document.currentVersion;
        currentVersionByRoom.set(key, saveVersion);

        if (!hasUnpersistedChanges) {
          reportSucceeded(input, saveVersion, saveVersion, startedAt, "skipped");
          return;
        }
      } catch (error) {
        reportFailed(input, saveVersion, error, startedAt);
        throw error;
      }
    }

    try {
      const savedVersion = await save(input, saveVersion);
      reportSucceeded(input, saveVersion, savedVersion, startedAt);
      return;
    } catch (error) {
      if (!(error instanceof DocumentCheckpointError) || error.status !== 409) {
        reportFailed(input, saveVersion, error, startedAt);
        throw error;
      }
      eventLogger({
        documentId: input.documentId,
        event: "document_checkpoint_conflict",
        expectedVersion: saveVersion,
        status: error.status,
        workspaceId: input.workspaceId,
      });
    }

    try {
      const latest = await client.getDocument(input);
      Y.applyUpdate(
        input.document,
        Buffer.from(latest.snapshot.yjsState, "base64"),
        checkpointMergeOrigin,
      );
      currentVersionByRoom.set(key, latest.document.currentVersion);
      const savedVersion = await save(input, latest.document.currentVersion);
      reportSucceeded(
        input,
        latest.document.currentVersion,
        savedVersion,
        startedAt,
      );
    } catch (error) {
      reportFailed(input, currentVersionByRoom.get(key) ?? saveVersion, error, startedAt);
      throw error;
    }
  }

  function startStore(input: DocumentCheckpointStoreInput) {
    const key = roomKey(input);
    const work = checkpointCoordinator
      ? checkpointCoordinator.runExclusive(key, () => storeDocumentNow(input))
      : storeDocumentNow(input);
    pendingStores.add(work);
    pendingInputByWork.set(work, input);
    void work.then(
      () => {
        pendingStores.delete(work);
        pendingInputByWork.delete(work);
        if (latestStoreByRoom.get(key) === input) {
          failedStoreByRoom.delete(key);
          latestStoreByRoom.delete(key);
        }
      },
      () => {
        pendingStores.delete(work);
        pendingInputByWork.delete(work);
        if (latestStoreByRoom.get(key) === input) failedStoreByRoom.set(key, input);
      },
    );
    return work;
  }

  function storeDocument(input: DocumentCheckpointStoreInput) {
    latestStoreByRoom.set(roomKey(input), input);
    return startStore(input);
  }

  async function drain({ retryDelayMs = 100, timeoutMs = 20_000 } = {}) {
    const deadline = performance.now() + timeoutMs;
    let nextRetryDelayMs = retryDelayMs;
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      while (true) {
        while (pendingStores.size > 0) {
          await beforeDeadline(Promise.allSettled([...pendingStores]), deadline);
        }
        if (failedStoreByRoom.size === 0) return;

        const remainingMs = deadline - performance.now();
        if (remainingMs <= 0) throw drainTimeoutError(failedStoreByRoom.size);
        await delay(Math.min(nextRetryDelayMs, remainingMs));
        if (performance.now() >= deadline) {
          throw new Error("Document checkpoint drain deadline reached");
        }
        nextRetryDelayMs = Math.min(Math.max(1, nextRetryDelayMs * 2), 1_000);
        for (const input of [...failedStoreByRoom.values()]) startStore(input);
      }
    } catch (error) {
      reportDrainTimeout();
      throw drainTimeoutError(unsavedInputs().length, { cause: error });
    }
  }

  function unsavedInputs() {
    const inputByRoom = new Map<string, DocumentCheckpointStoreInput>();
    for (const input of pendingInputByWork.values()) {
      inputByRoom.set(roomKey(input), input);
    }
    for (const input of failedStoreByRoom.values()) {
      inputByRoom.set(roomKey(input), input);
    }
    return [...inputByRoom.values()];
  }

  function reportDrainTimeout() {
    for (const input of unsavedInputs()) {
      eventLogger({
        documentId: input.documentId,
        event: "document_checkpoint_drain_failed",
        status: "timeout",
        workspaceId: input.workspaceId,
      });
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
    status: number | string = 200,
  ) {
    eventLogger({
      documentId: input.documentId,
      durationMs: elapsedMs(startedAt),
      event: "document_checkpoint_succeeded",
      expectedVersion,
      savedVersion,
      status,
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

  return { drain, loadDocument, storeDocument };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function drainTimeoutError(failedCount: number, options?: ErrorOptions) {
  return new Error(
    `Document checkpoint drain timed out with ${failedCount} unsaved document(s)`,
    options,
  );
}

async function beforeDeadline<T>(
  work: Promise<T>,
  deadline: number,
) {
  const remainingMs = deadline - performance.now();
  if (remainingMs <= 0) throw new Error("Document checkpoint drain deadline reached");
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Document checkpoint drain deadline reached")),
          remainingMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function hasChangesBeyondUpdate(document: YDocument, update: Uint8Array) {
  const persistedDocument = new Y.Doc();
  Y.applyUpdate(persistedDocument, update);
  const missingUpdate = Y.encodeStateAsUpdate(
    document,
    Y.encodeStateVector(persistedDocument),
  );
  return missingUpdate.length > 2;
}

function roomKey(room: DocumentRoomRef) {
  return `${room.workspaceId}:${room.documentId}`;
}

function serializeContentJson(document: YDocument): Record<string, unknown> {
  return yXmlFragmentToProsemirrorJSON(document.getXmlFragment("default"));
}
