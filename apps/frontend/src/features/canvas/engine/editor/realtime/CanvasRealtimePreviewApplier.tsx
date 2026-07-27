"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";
import {
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
  useEditor,
} from "tldraw";
import { useValue } from "@tldraw/state-react";
import type { CanvasRemoteShapePreviewStore } from "../../../collaboration/canvas-remote-shape-preview-store";
import type { CanvasShapePreviewEventPayload } from "@/shared/canvas-realtime/canvas-realtime-types";
import type { PiloCanvasFreeformShape } from "../../canvas-engine-types";
import { restorePiloShapeAssets } from "../../assets/pilo-canvas-assets";
import { sortFreeformShapesForCreate } from "../../shapes/pilo-canvas-shape-factory";
import { withSerializedArrowBindings } from "../canvas-arrow-bindings";

const CANVAS_REMOTE_PREVIEW_DELETE_GRACE_MS = 8_000;
const EMPTY_REMOTE_SHAPE_PREVIEWS: readonly CanvasShapePreviewEventPayload[] = [];
const emptyRemoteShapePreviewStore: CanvasRemoteShapePreviewStore = {
  acknowledgeAppliedShapeIds: () => {},
  getSnapshot: () => EMPTY_REMOTE_SHAPE_PREVIEWS,
  subscribe: () => () => {},
};

function getFreeformShapeId(shape: PiloCanvasFreeformShape | TLShape) {
  return typeof shape.id === "string" ? shape.id : null;
}

export function CanvasRealtimePreviewApplier({
  getCommittedShapes,
  isShapePatchProtected,
  originalShapesRef,
  protectionVersion,
  previewShapeIdsRef,
  previewStore = emptyRemoteShapePreviewStore,
}: {
  getCommittedShapes: () => PiloCanvasFreeformShape[];
  isShapePatchProtected: (shapeId: string) => boolean;
  originalShapesRef: MutableRefObject<Map<string, PiloCanvasFreeformShape>>;
  protectionVersion: number;
  previewShapeIdsRef: MutableRefObject<Set<string>>;
  previewStore?: CanvasRemoteShapePreviewStore;
}) {
  const editor = useEditor();
  const previews = useSyncExternalStore(
    previewStore.subscribe,
    previewStore.getSnapshot,
    previewStore.getSnapshot,
  );
  const locallyEditingShapeId = useValue(
    "pilo-preview-local-editing-shape-id",
    () => {
      const editingShapeId = editor.getEditingShapeId();

      return editingShapeId ? String(editingShapeId) : null;
    },
    [editor],
  );
  const [previewDeleteCleanupVersion, setPreviewDeleteCleanupVersion] =
    useState(0);
  const previewDeleteGraceSinceRef = useRef(new Map<string, number>());
  const previewDeleteCleanupTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (previewDeleteCleanupTimerRef.current) {
      clearTimeout(previewDeleteCleanupTimerRef.current);
      previewDeleteCleanupTimerRef.current = null;
    }

    const activePreviewShapeIds = new Set<string>();
    const previewShapesById = new Map<string, PiloCanvasFreeformShape>();
    const previewDeletedShapeIds = new Set<string>();

    previews.forEach((preview) => {
      preview.shapes.forEach((shape) => {
        const previewShape = shape as PiloCanvasFreeformShape;
        const shapeId = getFreeformShapeId(previewShape);

        if (!shapeId) return;
        if (
          previewShape.type === "draw" ||
          previewShape.type === "highlight" ||
          previewShape.type === "line" ||
          previewShape.type === "arrow"
        ) {
          return;
        }
        activePreviewShapeIds.add(shapeId);
        if (
          shapeId === locallyEditingShapeId ||
          isShapePatchProtected(shapeId)
        ) {
          return;
        }

        previewShapesById.set(shapeId, previewShape);
      });
      preview.deletedShapeIds?.forEach((shapeId) => {
        if (!shapeId) return;
        activePreviewShapeIds.add(shapeId);
        if (
          shapeId === locallyEditingShapeId ||
          isShapePatchProtected(shapeId)
        ) {
          return;
        }

        previewDeletedShapeIds.add(shapeId);
      });
    });

    const committedShapesById = new Map<string, PiloCanvasFreeformShape>();

    getCommittedShapes().forEach((shape) => {
      const shapeId = getFreeformShapeId(shape);

      if (shapeId) {
        committedShapesById.set(shapeId, shape);
      }
    });

    const previousPreviewShapeIds = new Set(previewShapeIdsRef.current);
    const deferredProtectedRestoreShapeIds = Array.from(
      previousPreviewShapeIds,
    ).filter(
      (shapeId) =>
        !activePreviewShapeIds.has(shapeId) &&
        (shapeId === locallyEditingShapeId ||
          isShapePatchProtected(shapeId)),
    );
    const shapeIdsToRestore = Array.from(previousPreviewShapeIds).filter(
      (shapeId) =>
        !activePreviewShapeIds.has(shapeId) &&
        !deferredProtectedRestoreShapeIds.includes(shapeId),
    );
    const now = Date.now();
    const shapeIdsToDelete = shapeIdsToRestore.filter(
      (shapeId) => {
        if (
          committedShapesById.has(shapeId) ||
          originalShapesRef.current.has(shapeId)
        ) {
          previewDeleteGraceSinceRef.current.delete(shapeId);
          return false;
        }

        if (!editor.getShape(shapeId as TLShapeId)) {
          previewDeleteGraceSinceRef.current.delete(shapeId);
          return false;
        }

        const graceSince =
          previewDeleteGraceSinceRef.current.get(shapeId) ?? now;

        previewDeleteGraceSinceRef.current.set(shapeId, graceSince);

        return now - graceSince >= CANVAS_REMOTE_PREVIEW_DELETE_GRACE_MS;
      },
    );
    activePreviewShapeIds.forEach((shapeId) => {
      previewDeleteGraceSinceRef.current.delete(shapeId);
    });
    shapeIdsToDelete.forEach((shapeId) => {
      previewDeleteGraceSinceRef.current.delete(shapeId);
    });
    const pendingDeleteGraceShapeIds = shapeIdsToRestore.filter((shapeId) =>
      previewDeleteGraceSinceRef.current.has(shapeId),
    );

    if (pendingDeleteGraceShapeIds.length) {
      previewDeleteCleanupTimerRef.current = setTimeout(() => {
        previewDeleteCleanupTimerRef.current = null;
        setPreviewDeleteCleanupVersion((version) => version + 1);
      }, CANVAS_REMOTE_PREVIEW_DELETE_GRACE_MS);
    }
    const trackedPreviewShapeIds = new Set([
      ...activePreviewShapeIds,
      ...deferredProtectedRestoreShapeIds,
      ...pendingDeleteGraceShapeIds,
    ]);

    shapeIdsToDelete.forEach((shapeId) => {
      trackedPreviewShapeIds.delete(shapeId);
    });
    const shapesToRestore = shapeIdsToRestore.flatMap((shapeId) => {
      const committedShape = committedShapesById.get(shapeId);

      return committedShape ? [committedShape] : [];
    });
    const shapesToHide = Array.from(previewDeletedShapeIds).flatMap((shapeId) => {
      const currentShape = editor.getShape(shapeId as TLShapeId);

      if (!currentShape) return [];

      if (!originalShapesRef.current.has(shapeId)) {
        originalShapesRef.current.set(
          shapeId,
          withSerializedArrowBindings(editor, currentShape),
        );
      }

      return [
        {
          ...withSerializedArrowBindings(editor, currentShape),
          opacity: 0,
        } as PiloCanvasFreeformShape,
      ];
    });
    const shapesToPreview = Array.from(previewShapesById.values()).filter(
      (shape) => {
        const shapeId = getFreeformShapeId(shape);
        const currentShape = shapeId
          ? editor.getShape(shapeId as TLShapeId)
          : null;

        if (!shapeId || !currentShape || currentShape.type !== shape.type) {
          return false;
        }

        if (!originalShapesRef.current.has(shapeId)) {
          originalShapesRef.current.set(
            shapeId,
            withSerializedArrowBindings(editor, currentShape),
          );
        }

        return true;
      },
    );
    const shapesToCreate = Array.from(previewShapesById.values()).filter(
      (shape) => {
        const shapeId = getFreeformShapeId(shape);
        const currentShape = shapeId
          ? editor.getShape(shapeId as TLShapeId)
          : null;

        return Boolean(shapeId && !currentShape);
      },
    );

    if (
      shapeIdsToDelete.length ||
      shapesToRestore.length ||
      shapesToHide.length ||
      shapesToPreview.length ||
      shapesToCreate.length
    ) {
      previewShapeIdsRef.current = trackedPreviewShapeIds;

      editor.store.mergeRemoteChanges(() => {
        editor.run(
          () => {
            if (shapeIdsToDelete.length) {
              editor.deleteShapes(shapeIdsToDelete as TLShapeId[]);
            }

            if (shapesToRestore.length) {
              restorePiloShapeAssets(editor, shapesToRestore);
              editor.updateShapes(shapesToRestore as TLShapePartial<TLShape>[]);
            }

            if (shapesToHide.length) {
              editor.updateShapes(shapesToHide as TLShapePartial<TLShape>[]);
            }

            if (shapesToPreview.length) {
              restorePiloShapeAssets(editor, shapesToPreview);
              editor.updateShapes(shapesToPreview as TLShapePartial<TLShape>[]);
            }

            if (shapesToCreate.length) {
              restorePiloShapeAssets(editor, shapesToCreate);
              editor.createShapes(sortFreeformShapesForCreate(shapesToCreate));
            }
          },
          { history: "ignore" },
        );
      });
    }

    shapeIdsToRestore.forEach((shapeId) => {
      originalShapesRef.current.delete(shapeId);
    });

    if (
      !shapeIdsToDelete.length &&
      !shapesToRestore.length &&
      !shapesToHide.length &&
      !shapesToPreview.length &&
      !shapesToCreate.length
    ) {
      previewShapeIdsRef.current = trackedPreviewShapeIds;
    }
  }, [
    editor,
    getCommittedShapes,
    isShapePatchProtected,
    locallyEditingShapeId,
    originalShapesRef,
    previewDeleteCleanupVersion,
    previewShapeIdsRef,
    previews,
    protectionVersion,
  ]);

  useEffect(
    () => () => {
      if (previewDeleteCleanupTimerRef.current) {
        clearTimeout(previewDeleteCleanupTimerRef.current);
        previewDeleteCleanupTimerRef.current = null;
      }

      const shapesToRestore = Array.from(originalShapesRef.current.values());

      if (shapesToRestore.length) {
        editor.store.mergeRemoteChanges(() => {
          editor.run(
            () => {
              restorePiloShapeAssets(editor, shapesToRestore);
              editor.updateShapes(shapesToRestore as TLShapePartial<TLShape>[]);
            },
            { history: "ignore" },
          );
        });
      }

      originalShapesRef.current.clear();
      previewShapeIdsRef.current.clear();
    },
    [editor, originalShapesRef, previewShapeIdsRef],
  );

  return null;
}
