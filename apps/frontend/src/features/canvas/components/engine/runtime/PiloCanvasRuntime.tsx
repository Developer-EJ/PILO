"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  normalizeCanvasFreeformShapes,
  readCanvasStorage,
  writeCanvasStorage,
} from "../../../utils/canvas-storage";
import {
  createCanvasShapeSyncQueue,
  syncCanvasFreeformShapes,
  type CanvasShapeSyncQueue,
  type CanvasShapeApiClient,
} from "../../../utils/canvas-shape-sync";
import {
  PiloTldrawCanvas,
  type PiloCanvasActions,
} from "../surface/PiloTldrawCanvas";
import type { PiloCanvasFreeformShape } from "../types";

export type CanvasViewSetting = {
  zoom: number;
  viewportX: number;
  viewportY: number;
};

export type CanvasBoardDetail = {
  id: string;
  title: string;
  workspaceId: string;
  shapeCount: number;
  shapes?: unknown[];
  viewSetting: CanvasViewSetting;
};

type PiloCanvasRuntimeProps = {
  board: CanvasBoardDetail;
  canvasClient?: CanvasViewSettingApiClient | null;
  onReady: (actions: PiloCanvasActions | null) => void;
  storageMode?: "api" | "local";
};

type CanvasViewSettingApiClient = CanvasShapeApiClient & {
  updateViewSetting: (
    boardId: string,
    body: CanvasViewSetting,
    options: { workspaceId: string },
  ) => Promise<unknown>;
};

const DEFAULT_VIEW_SETTING_SYNC_DEBOUNCE_MS = 360;

function clampZoom(value: number) {
  return Math.min(8, Math.max(0.12, Math.round(value * 100) / 100));
}

function areViewSettingsEqual(
  current: CanvasViewSetting,
  next: CanvasViewSetting,
) {
  return (
    current.zoom === next.zoom &&
    current.viewportX === next.viewportX &&
    current.viewportY === next.viewportY
  );
}

function buildFreeformShapesKey(shapes: PiloCanvasFreeformShape[]) {
  return JSON.stringify(shapes);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeViewSetting(
  value: unknown,
  fallback: CanvasViewSetting,
): CanvasViewSetting {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isFiniteNumber((value as CanvasViewSetting).zoom) ||
    !isFiniteNumber((value as CanvasViewSetting).viewportX) ||
    !isFiniteNumber((value as CanvasViewSetting).viewportY)
  ) {
    return fallback;
  }

  return {
    zoom: clampZoom((value as CanvasViewSetting).zoom),
    viewportX: (value as CanvasViewSetting).viewportX,
    viewportY: (value as CanvasViewSetting).viewportY,
  };
}

export function PiloCanvasRuntime({
  board,
  canvasClient = null,
  onReady,
  storageMode = "local",
}: PiloCanvasRuntimeProps) {
  const [canvasActions, setCanvasActions] = useState<PiloCanvasActions | null>(
    null,
  );
  const [freeformShapes, setFreeformShapes] = useState<
    PiloCanvasFreeformShape[]
  >([]);
  const [viewSetting, setViewSetting] = useState<CanvasViewSetting>({
    zoom: 1,
    viewportX: 0,
    viewportY: 0,
  });
  const shapeSyncQueueRef = useRef<CanvasShapeSyncQueue | null>(null);
  const pendingViewSettingRef = useRef<CanvasViewSetting | null>(null);
  const viewSettingRef = useRef<CanvasViewSetting>(viewSetting);
  const viewSettingSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [canvasHydrationVersion, setCanvasHydrationVersion] = useState(0);

  useEffect(() => {
    onReady(canvasActions);
  }, [canvasActions, onReady]);

  useEffect(() => {
    let cancelled = false;
    const boardFreeformShapes = normalizeCanvasFreeformShapes(
      board.shapes,
    ) as PiloCanvasFreeformShape[];
    const storedFreeformShapes =
      storageMode === "local"
        ? (normalizeCanvasFreeformShapes(
            readCanvasStorage("freeform-shapes", board.id),
          ) as PiloCanvasFreeformShape[])
        : boardFreeformShapes;
    const storedViewSetting =
      storageMode === "local"
        ? normalizeViewSetting(
            readCanvasStorage("view-setting", board.id),
            board.viewSetting,
          )
        : board.viewSetting;

    queueMicrotask(() => {
      if (cancelled) return;

      setFreeformShapes(storedFreeformShapes);
      viewSettingRef.current = storedViewSetting;
      setViewSetting(storedViewSetting);

      setCanvasHydrationVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [board.id, board.shapes, board.viewSetting, storageMode]);

  useEffect(() => {
    viewSettingRef.current = viewSetting;
  }, [viewSetting]);

  useEffect(() => {
    if (storageMode !== "api" || !canvasClient) {
      shapeSyncQueueRef.current?.cancel();
      shapeSyncQueueRef.current = null;
      return;
    }

    const shapeSyncQueue = createCanvasShapeSyncQueue({
      boardId: board.id,
      canvasClient,
      onError(error: unknown) {
        console.error("Canvas API shape sync failed", error);
      },
      workspaceId: board.workspaceId,
    });

    shapeSyncQueueRef.current = shapeSyncQueue;

    return () => {
      void shapeSyncQueue.flush().catch((error: unknown) => {
        console.error("Canvas API shape sync failed", error);
      });

      if (shapeSyncQueueRef.current === shapeSyncQueue) {
        shapeSyncQueueRef.current = null;
      }
    };
  }, [board.id, board.workspaceId, canvasClient, storageMode]);

  useEffect(() => {
    return () => {
      if (viewSettingSyncTimerRef.current) {
        clearTimeout(viewSettingSyncTimerRef.current);
        viewSettingSyncTimerRef.current = null;
      }

      const pendingViewSetting = pendingViewSettingRef.current;
      pendingViewSettingRef.current = null;

      if (storageMode === "api" && canvasClient && pendingViewSetting) {
        void canvasClient
          .updateViewSetting(board.id, pendingViewSetting, {
            workspaceId: board.workspaceId,
          })
          .catch((error: unknown) => {
            console.error("Canvas API view setting sync failed", error);
          });
      }
    };
  }, [board.id, board.workspaceId, canvasClient, storageMode]);

  const persistFreeformShapes = useCallback(
    (nextFreeformShapes: PiloCanvasFreeformShape[]) => {
      setFreeformShapes((currentFreeformShapes) => {
        if (
          buildFreeformShapesKey(currentFreeformShapes) ===
          buildFreeformShapesKey(nextFreeformShapes)
        ) {
          return currentFreeformShapes;
        }

        if (storageMode === "api" && canvasClient) {
          const shapeSyncQueue = shapeSyncQueueRef.current;
          const syncInput = {
            nextShapes: nextFreeformShapes,
            previousShapes: currentFreeformShapes,
          };

          if (shapeSyncQueue) {
            shapeSyncQueue.enqueue(syncInput);
          } else {
            void syncCanvasFreeformShapes({
              boardId: board.id,
              canvasClient,
              ...syncInput,
              workspaceId: board.workspaceId,
            }).catch((error: unknown) => {
              console.error("Canvas API shape sync failed", error);
            });
          }
        } else {
          writeCanvasStorage("freeform-shapes", board.id, nextFreeformShapes);
        }

        return nextFreeformShapes;
      });
    },
    [board.id, board.workspaceId, canvasClient, storageMode],
  );

  const persistViewSetting = useCallback(
    (nextViewSetting: CanvasViewSetting) => {
      const normalizedViewSetting = {
        zoom: clampZoom(nextViewSetting.zoom),
        viewportX: nextViewSetting.viewportX,
        viewportY: nextViewSetting.viewportY,
      };

      if (areViewSettingsEqual(viewSettingRef.current, normalizedViewSetting)) {
        return;
      }

      viewSettingRef.current = normalizedViewSetting;
      setViewSetting(normalizedViewSetting);

      if (storageMode === "api" && canvasClient) {
        pendingViewSettingRef.current = normalizedViewSetting;

        if (viewSettingSyncTimerRef.current) {
          clearTimeout(viewSettingSyncTimerRef.current);
        }

        viewSettingSyncTimerRef.current = setTimeout(() => {
          const pendingViewSetting = pendingViewSettingRef.current;

          viewSettingSyncTimerRef.current = null;
          pendingViewSettingRef.current = null;

          if (!pendingViewSetting) return;

          void canvasClient
            .updateViewSetting(board.id, pendingViewSetting, {
              workspaceId: board.workspaceId,
            })
            .catch((error: unknown) => {
              console.error("Canvas API view setting sync failed", error);
            });
        }, DEFAULT_VIEW_SETTING_SYNC_DEBOUNCE_MS);
        return;
      }

      writeCanvasStorage("view-setting", board.id, normalizedViewSetting);
    },
    [board.id, board.workspaceId, canvasClient, storageMode],
  );

  const markCanvasUiEvent = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      canvasActions?.markUiEventAsHandled(event);
      event.stopPropagation();
    },
    [canvasActions],
  );

  return (
    <>
      <section className="canvas-content" aria-label="캔버스 보드">
        <PiloTldrawCanvas
          board={board}
          freeformShapes={freeformShapes}
          hydrationVersion={canvasHydrationVersion}
          initialViewSetting={viewSetting}
          onReady={setCanvasActions}
          onFreeformShapesChange={persistFreeformShapes}
          onViewChange={persistViewSetting}
        />
      </section>

      <div
        className="canvas-zoom-controls"
        aria-label="캔버스 확대/축소"
        onPointerDownCapture={markCanvasUiEvent}
        onPointerUpCapture={markCanvasUiEvent}
      >
        <button
          type="button"
          aria-label="화면 맞춤"
          onClick={() => canvasActions?.fit()}
        >
          맞춤
        </button>
        <button
          type="button"
          aria-label="축소"
          onClick={() => {
            canvasActions?.zoomOut();
          }}
        >
          -
        </button>
        <strong>{Math.round(viewSetting.zoom * 100)}%</strong>
        <button
          type="button"
          aria-label="확대"
          onClick={() => {
            canvasActions?.zoomIn();
          }}
        >
          +
        </button>
      </div>
    </>
  );
}
