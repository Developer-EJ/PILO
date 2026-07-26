import { useEffect } from "react";
import {
  normalizeCanvasFreeformShapes,
  readCanvasStorage,
} from "@/features/canvas/persistence/canvas-storage";
import type { PiloCanvasFreeformShape } from "../canvas-engine-types";
import type {
  CanvasBoardDetail,
  CanvasRuntimeStorageMode,
} from "./canvas-runtime-types";

type RuntimeRef<T> = {
  current: T;
};

type UseCanvasRuntimeHydrationOptions = {
  board: CanvasBoardDetail;
  committedShapeMapRef: RuntimeRef<Map<string, PiloCanvasFreeformShape>>;
  publishedShapeMapRef: RuntimeRef<Map<string, PiloCanvasFreeformShape>>;
  pendingLocalShapeVersionsRef: RuntimeRef<Map<string, number>>;
  setCameraResetVersion: (updater: (version: number) => number) => void;
  setCanvasHydrationVersion: (updater: (version: number) => number) => void;
  shapeDetailCacheRef: RuntimeRef<Map<string, PiloCanvasFreeformShape>>;
  storageMode: CanvasRuntimeStorageMode;
  viewportShapeLoadRequestSeqRef: RuntimeRef<number>;
};

export function useCanvasRuntimeHydration({
  board,
  committedShapeMapRef,
  publishedShapeMapRef,
  pendingLocalShapeVersionsRef,
  setCameraResetVersion,
  setCanvasHydrationVersion,
  shapeDetailCacheRef,
  storageMode,
  viewportShapeLoadRequestSeqRef,
}: UseCanvasRuntimeHydrationOptions) {
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
    queueMicrotask(() => {
      if (cancelled) return;

      shapeDetailCacheRef.current.clear();
      viewportShapeLoadRequestSeqRef.current += 1;
      pendingLocalShapeVersionsRef.current.clear();
      committedShapeMapRef.current = new Map(
        storedFreeformShapes.flatMap((shape) =>
          typeof shape.id === "string" ? [[shape.id, shape]] : [],
        ),
      );
      publishedShapeMapRef.current = new Map(
        committedShapeMapRef.current,
      );

      setCanvasHydrationVersion((version) => version + 1);
      setCameraResetVersion((version) => version + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [
    board.id,
    board.shapes,
    committedShapeMapRef,
    publishedShapeMapRef,
    pendingLocalShapeVersionsRef,
    setCameraResetVersion,
    setCanvasHydrationVersion,
    shapeDetailCacheRef,
    storageMode,
    viewportShapeLoadRequestSeqRef,
  ]);
}
