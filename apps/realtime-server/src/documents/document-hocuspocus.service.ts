import { createRequire } from "node:module";

import type { RealtimeSessionService } from "../auth/session.service";
import type { DocumentAccessService } from "./document-access.service";
import type { DocumentCheckpointService } from "./document-checkpoint.service";
import type { DocumentHocuspocusInstance } from "./document-hocuspocus-transport";
import type { DocumentEventLogger } from "./document-observability";
import type { DocumentRoomRef } from "./document-types";

type HocuspocusDocumentConnection = {
  close: (event: { code: number; reason: string }) => void;
  context: DocumentHocuspocusContext;
};

type HocuspocusDocumentConnectionStore = {
  getConnections: () => readonly HocuspocusDocumentConnection[];
};

type HocuspocusDocumentServer = DocumentHocuspocusInstance & {
  closeConnections: () => void;
  documents: Map<string, HocuspocusDocumentConnectionStore>;
  flushPendingStores: () => void;
  getConnectionsCount: () => number;
  getDocumentsCount: () => number;
  unloadDocument: (
    document: HocuspocusDocumentConnectionStore,
  ) => Promise<unknown>;
};

type HocuspocusDocument = Parameters<
  DocumentCheckpointService["storeDocument"]
>[0]["document"];

type HocuspocusConstructor = new <Context>(configuration: {
  onAuthenticate: (payload: {
    documentName: string;
    token: string;
  }) => Promise<Context>;
  onLoadDocument: (payload: { context: Context }) => Promise<Uint8Array>;
  onStoreDocument: (payload: {
    document: HocuspocusDocument;
    lastContext: Context | null;
  }) => Promise<void>;
  afterUnloadDocument: () => void;
  debounce: number;
  extensions: readonly unknown[];
  name: string;
  unloadImmediately: boolean;
}) => HocuspocusDocumentServer;

const { Hocuspocus } = createRequire(__filename)("@hocuspocus/server") as {
  Hocuspocus: HocuspocusConstructor;
};

export type DocumentHocuspocusContext = DocumentRoomRef & {
  accessToken: string;
  userId: string;
};

export type DocumentHocuspocusService = {
  authorizeDocument: (
    documentName: string,
    token: string,
  ) => Promise<DocumentHocuspocusContext>;
  hocuspocus: HocuspocusDocumentServer;
  loadDocument: (context: DocumentHocuspocusContext) => Promise<Uint8Array>;
  storeDocument: (
    context: DocumentHocuspocusContext,
    document: HocuspocusDocument,
  ) => Promise<void>;
  shutdown: () => Promise<void>;
};

export function createDocumentHocuspocusService({
  accessService,
  checkpointService,
  eventLogger = () => undefined,
  extensions = [],
  instanceId = "pilo-realtime-server",
  sessionService,
  shutdownTimeoutMs = 20_000,
}: {
  accessService: DocumentAccessService;
  checkpointService: DocumentCheckpointService;
  eventLogger?: DocumentEventLogger;
  extensions?: readonly unknown[];
  instanceId?: string;
  sessionService: RealtimeSessionService;
  shutdownTimeoutMs?: number;
}): DocumentHocuspocusService {
  const shutdownWaiters = new Set<() => void>();

  function resolveShutdownWaiters(hocuspocus: HocuspocusDocumentServer) {
    if (hocuspocus.getDocumentsCount() !== 0) {
      return;
    }

    for (const resolve of shutdownWaiters) {
      resolve();
    }
    shutdownWaiters.clear();
  }

  async function authorizeDocument(documentName: string, token: string) {
    const room = parseDocumentRoomName(documentName);
    if (!room) {
      throw new Error("FORBIDDEN");
    }

    const session = await sessionService.validateSessionToken(token);
    if (!session) {
      throw new Error("NOT_AUTHENTICATED");
    }

    const access = await accessService.getDocumentRoomAccess(
      { userId: session.userId },
      room,
    );
    if (!access) {
      throw new Error("FORBIDDEN");
    }

    eventLogger({
      documentId: room.documentId,
      event: "document_room_authenticated",
      workspaceId: room.workspaceId,
    });

    return { ...room, accessToken: token, userId: session.userId };
  }

  function loadDocument(context: DocumentHocuspocusContext) {
    return checkpointService.loadDocument(context);
  }

  function storeDocument(
    context: DocumentHocuspocusContext,
    document: HocuspocusDocument,
  ) {
    return checkpointService.storeDocument({ ...context, document });
  }

  const hocuspocus = new Hocuspocus<DocumentHocuspocusContext>({
    async onAuthenticate({ documentName, token }) {
      return authorizeDocument(documentName, token);
    },
    onLoadDocument({ context }) {
      return loadDocument(context);
    },
    onStoreDocument({ document, lastContext }) {
      if (!lastContext) {
        throw new Error("Document checkpoint requires an authenticated context");
      }

      return storeDocument(lastContext, document);
    },
    afterUnloadDocument() {
      resolveShutdownWaiters(hocuspocus);
    },
    debounce: 1_000,
    extensions,
    name: instanceId,
    unloadImmediately: true,
  });

  async function shutdown() {
    const deadline = performance.now() + shutdownTimeoutMs;
    hocuspocus.closeConnections();
    hocuspocus.flushPendingStores();
    await withinShutdownBudget(
      checkpointService.drain({ timeoutMs: remainingShutdownMs(deadline) }),
      deadline,
      "checkpoint drain",
    );

    await withinShutdownBudget(
      Promise.all(
        [...hocuspocus.documents.values()].map((document) =>
          hocuspocus.unloadDocument(document),
        ),
      ),
      deadline,
      "document unload",
    );

    if (hocuspocus.getDocumentsCount() !== 0) {
      let resolveWaiter: (() => void) | undefined;
      const unloaded = new Promise<void>((resolve) => {
        resolveWaiter = resolve;
        shutdownWaiters.add(resolve);
        resolveShutdownWaiters(hocuspocus);
      });
      try {
        await withinShutdownBudget(unloaded, deadline, "document unload");
      } finally {
        if (resolveWaiter) shutdownWaiters.delete(resolveWaiter);
      }
    }
    await withinShutdownBudget(
      checkpointService.drain({ timeoutMs: remainingShutdownMs(deadline) }),
      deadline,
      "final checkpoint drain",
    );
  }

  return { authorizeDocument, hocuspocus, loadDocument, shutdown, storeDocument };
}

function remainingShutdownMs(deadline: number) {
  return Math.max(1, Math.ceil(deadline - performance.now()));
}

async function withinShutdownBudget<T>(
  work: Promise<T>,
  deadline: number,
  phase: string,
) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Document shutdown timed out during ${phase}`)),
          remainingShutdownMs(deadline),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseDocumentRoomName(documentName: string): DocumentRoomRef | null {
  const parts = documentName.split(":");
  if (
    parts.length !== 5 ||
    parts[0] !== "workspace" ||
    parts[2] !== "document" ||
    parts[4] !== "yjs" ||
    !parts[1] ||
    !parts[3]
  ) {
    return null;
  }

  return { documentId: parts[3], workspaceId: parts[1] };
}
