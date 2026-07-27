import type { MutableRefObject } from "react";
import {
  type Editor,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from "tldraw";
import {
  restorePiloShapeAssets,
  withPiloMediaAsset,
} from "../assets/pilo-canvas-assets";
import type { PiloCanvasFreeformShape } from "../canvas-engine-types";
import { isPiloFrameShape } from "../shapes/PiloCanvasShapeGuards";
import {
  normalizeBlankFrameName,
  resolveNextFrameName,
} from "../shapes/frame/PiloFrameShapeUtil";
import { sortFreeformShapesForCreate } from "../shapes/pilo-canvas-shape-factory";
import {
  removeStaleSerializedArrowBindings,
  readSerializedArrowBindings,
  restoreSerializedArrowBindings,
  withSerializedArrowBindings,
  type PiloArrowBindingSnapshot,
} from "./canvas-arrow-bindings";
import type { PiloCanvasShapePatch } from "./canvas-editor-contracts";

function getRestorableToolId(toolId: string) {
  if (!toolId || toolId.startsWith("select.")) {
    return "select.idle";
  }

  return toolId;
}

function collectSerializedArrowBindings(shapes: PiloCanvasFreeformShape[]) {
  return shapes.flatMap(readSerializedArrowBindings);
}

function uniquePendingArrowBindings(bindings: PiloArrowBindingSnapshot[]) {
  const bindingMap = new Map<string, PiloArrowBindingSnapshot>();

  bindings.forEach((binding) => {
    bindingMap.set(
      [
        binding.id ?? "",
        binding.fromId,
        binding.toId,
        binding.props.terminal,
      ].join("|"),
      binding,
    );
  });

  return Array.from(bindingMap.values());
}

function getFreeformShapeId(shape: PiloCanvasFreeformShape | TLShape) {
  return typeof shape.id === "string" ? shape.id : null;
}

function buildFreeformShapeMapFromShapes(shapes: PiloCanvasFreeformShape[]) {
  const shapeMap = new Map<string, PiloCanvasFreeformShape>();

  shapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (shapeId) {
      shapeMap.set(shapeId, shape);
    }
  });

  return shapeMap;
}

function shouldPreserveMissingFrameChildShape({
  incomingShapeMap,
  preservedShapeMap,
  shapeId,
}: {
  incomingShapeMap: Map<string, PiloCanvasFreeformShape>;
  preservedShapeMap: Map<string, PiloCanvasFreeformShape>;
  shapeId: string;
}) {
  const preservedShape = preservedShapeMap.get(shapeId);
  const parentId =
    preservedShape && typeof preservedShape.parentId === "string"
      ? preservedShape.parentId
      : null;

  if (!preservedShape || !parentId?.startsWith("shape:")) return false;
  if (!incomingShapeMap.has(parentId) && !preservedShapeMap.has(parentId)) {
    return false;
  }

  return true;
}

function serializeFreeformShape(shape: PiloCanvasFreeformShape) {
  return JSON.stringify(shape);
}

function hasFreeformShapeChanged(
  editor: Editor,
  currentShape: TLShape,
  nextShape: PiloCanvasFreeformShape,
) {
  return (
    serializeFreeformShape(withSerializedArrowBindings(editor, currentShape)) !==
    serializeFreeformShape(nextShape)
  );
}

function restoreFreeformShapeBindings(
  editor: Editor,
  shapes: PiloCanvasFreeformShape[],
  pendingArrowBindingsRef: MutableRefObject<PiloArrowBindingSnapshot[]>,
) {
  const bindingsToRestore = uniquePendingArrowBindings([
    ...pendingArrowBindingsRef.current,
    ...collectSerializedArrowBindings(shapes),
  ]);

  removeStaleSerializedArrowBindings(editor, shapes);

  if (!bindingsToRestore.length) return;

  const result = restoreSerializedArrowBindings(editor, bindingsToRestore);
  pendingArrowBindingsRef.current = uniquePendingArrowBindings(result.pending);
}

function createFreeformShapeRecords(
  editor: Editor,
  shapes: PiloCanvasFreeformShape[],
  pendingArrowBindingsRef: MutableRefObject<PiloArrowBindingSnapshot[]>,
  piloDefaultArrowKindHydrationGuardRef: MutableRefObject<boolean>,
) {
  if (!shapes.length) return;

  restorePiloShapeAssets(editor, shapes);
  piloDefaultArrowKindHydrationGuardRef.current = true;
  try {
    editor.createShapes(sortFreeformShapesForCreate(shapes));
  } finally {
    piloDefaultArrowKindHydrationGuardRef.current = false;
  }

  restoreFreeformShapeBindings(editor, shapes, pendingArrowBindingsRef);
}

export function hydrateFreeformShapes(
  editor: Editor,
  shapes: PiloCanvasFreeformShape[],
  pendingArrowBindingsRef: MutableRefObject<PiloArrowBindingSnapshot[]>,
  piloDefaultArrowKindHydrationGuardRef: MutableRefObject<boolean>,
) {
  editor.store.mergeRemoteChanges(() => {
    editor.run(
      () =>
        createFreeformShapeRecords(
          editor,
          shapes,
          pendingArrowBindingsRef,
          piloDefaultArrowKindHydrationGuardRef,
        ),
      {
        history: "ignore",
      },
    );
  });
}

export function resetFreeformShapes(
  editor: Editor,
  shapes: PiloCanvasFreeformShape[],
  pendingArrowBindingsRef: MutableRefObject<PiloArrowBindingSnapshot[]>,
  piloDefaultArrowKindHydrationGuardRef: MutableRefObject<boolean>,
  { preserveLocalState = false }: { preserveLocalState?: boolean } = {},
) {
  const selectedShapeIds = preserveLocalState ? editor.getSelectedShapeIds() : [];
  const editingShapeId = preserveLocalState ? editor.getEditingShapeId() : null;
  const currentPageState = preserveLocalState
    ? editor.getCurrentPageState()
    : null;
  const focusedGroupId = currentPageState?.focusedGroupId ?? null;
  const currentToolId = preserveLocalState ? editor.getCurrentToolId() : null;
  const isFocused = preserveLocalState ? editor.getIsFocused() : false;

  editor.store.mergeRemoteChanges(() => {
    editor.run(
      () => {
        pendingArrowBindingsRef.current = [];
        const existingFreeformShapeIds = editor
          .getCurrentPageShapes()
          .map((shape) => shape.id as TLShapeId);

        if (existingFreeformShapeIds.length) {
          editor.deleteShapes(existingFreeformShapeIds);
        }

        createFreeformShapeRecords(
          editor,
          shapes,
          pendingArrowBindingsRef,
          piloDefaultArrowKindHydrationGuardRef,
        );

        if (preserveLocalState) {
          const nextSelectedShapeIds = selectedShapeIds.filter((shapeId) =>
            editor.getShape(shapeId),
          );

          if (nextSelectedShapeIds.length) {
            editor.setSelectedShapes(nextSelectedShapeIds);
          }

          if (focusedGroupId && editor.getShape(focusedGroupId)) {
            editor.setFocusedGroup(focusedGroupId);
          }

          if (editingShapeId && editor.getShape(editingShapeId)) {
            editor.setEditingShape(editingShapeId);
          }

          if (currentToolId) {
            editor.setCurrentTool(getRestorableToolId(currentToolId));
          }
        }
      },
      { history: "ignore" },
    );
  });

  if (isFocused) {
    editor.focus({ focusContainer: false });
  }
}

export function syncFreeformShapesIncrementally(
  editor: Editor,
  shapes: PiloCanvasFreeformShape[],
  pendingArrowBindingsRef: MutableRefObject<PiloArrowBindingSnapshot[]>,
  piloDefaultArrowKindHydrationGuardRef: MutableRefObject<boolean>,
  getPreservedFreeformShapeSnapshots?: () => PiloCanvasFreeformShape[],
) {
  editor.store.mergeRemoteChanges(() => {
    editor.run(
      () => {
        const incomingShapeMap = new Map<string, PiloCanvasFreeformShape>();
        const preservedShapeMap = buildFreeformShapeMapFromShapes(
          getPreservedFreeformShapeSnapshots?.() ?? [],
        );
        const currentShapeMap = new Map<string, TLShape>();
        const shapeIdsToDelete: TLShapeId[] = [];
        const shapesToCreate: PiloCanvasFreeformShape[] = [];
        const shapesToUpdate: PiloCanvasFreeformShape[] = [];
        const changedShapesForBindingRestore: PiloCanvasFreeformShape[] = [];

        shapes.forEach((shape) => {
          const shapeId = getFreeformShapeId(shape);

          if (shapeId) {
            incomingShapeMap.set(shapeId, shape);
          }
        });

        editor.getCurrentPageShapes().forEach((shape) => {
          currentShapeMap.set(String(shape.id), shape);

          if (!incomingShapeMap.has(String(shape.id))) {
            if (
              shouldPreserveMissingFrameChildShape({
                incomingShapeMap,
                preservedShapeMap,
                shapeId: String(shape.id),
              })
            ) {
              return;
            }

            shapeIdsToDelete.push(shape.id as TLShapeId);
          }
        });

        shapes.forEach((shape) => {
          const shapeId = getFreeformShapeId(shape);
          const currentShape = shapeId ? currentShapeMap.get(shapeId) : null;

          if (!currentShape) {
            shapesToCreate.push(shape);
            changedShapesForBindingRestore.push(shape);
            return;
          }

          if (currentShape.type !== shape.type) {
            shapeIdsToDelete.push(currentShape.id as TLShapeId);
            shapesToCreate.push(shape);
            changedShapesForBindingRestore.push(shape);
            return;
          }

          if (hasFreeformShapeChanged(editor, currentShape, shape)) {
            shapesToUpdate.push(shape as TLShapePartial<TLShape>);
            changedShapesForBindingRestore.push(shape);
          }
        });

        if (shapeIdsToDelete.length) {
          editor.deleteShapes(Array.from(new Set(shapeIdsToDelete)));
        }

        if (shapesToCreate.length || shapesToUpdate.length) {
          restorePiloShapeAssets(editor, [...shapesToCreate, ...shapesToUpdate]);
        }

        if (shapesToCreate.length) {
          piloDefaultArrowKindHydrationGuardRef.current = true;
          try {
            editor.createShapes(sortFreeformShapesForCreate(shapesToCreate));
          } finally {
            piloDefaultArrowKindHydrationGuardRef.current = false;
          }
        }

        if (shapesToUpdate.length) {
          editor.updateShapes(shapesToUpdate as TLShapePartial<TLShape>[]);
        }

        if (changedShapesForBindingRestore.length) {
          restoreFreeformShapeBindings(
            editor,
            changedShapesForBindingRestore,
            pendingArrowBindingsRef,
          );
        } else if (pendingArrowBindingsRef.current.length) {
          restoreFreeformShapeBindings(editor, [], pendingArrowBindingsRef);
        }
      },
      { history: "ignore" },
    );
  });
}

export function applyFreeformShapePatchIncrementally(
  editor: Editor,
  patch: PiloCanvasShapePatch,
  pendingArrowBindingsRef: MutableRefObject<PiloArrowBindingSnapshot[]>,
  piloDefaultArrowKindHydrationGuardRef: MutableRefObject<boolean>,
) {
  const deletedShapeIdSet = new Set(patch.deletedShapeIds);
  const shapesToCreate: PiloCanvasFreeformShape[] = [];
  const shapesToUpdate: PiloCanvasFreeformShape[] = [];
  const shapeIdsToDelete = new Set<TLShapeId>();
  const changedShapesForBindingRestore: PiloCanvasFreeformShape[] = [];

  patch.deletedShapeIds.forEach((shapeId) => {
    const currentShape = editor.getShape(shapeId as TLShapeId);

    if (currentShape) {
      shapeIdsToDelete.add(currentShape.id as TLShapeId);
    }
  });

  patch.upsertShapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (!shapeId || deletedShapeIdSet.has(shapeId)) return;

    const currentShape = editor.getShape(shapeId as TLShapeId);

    if (!currentShape) {
      shapesToCreate.push(shape);
      changedShapesForBindingRestore.push(shape);
      return;
    }

    if (currentShape.type !== shape.type) {
      shapeIdsToDelete.add(currentShape.id as TLShapeId);
      shapesToCreate.push(shape);
      changedShapesForBindingRestore.push(shape);
      return;
    }

    if (hasFreeformShapeChanged(editor, currentShape, shape)) {
      shapesToUpdate.push(shape);
      changedShapesForBindingRestore.push(shape);
    }
  });

  if (
    !shapeIdsToDelete.size &&
    !shapesToCreate.length &&
    !shapesToUpdate.length
  ) {
    return;
  }

  editor.store.mergeRemoteChanges(() => {
    editor.run(
      () => {
        if (shapeIdsToDelete.size) {
          editor.deleteShapes([...shapeIdsToDelete]);
        }

        if (shapesToCreate.length || shapesToUpdate.length) {
          restorePiloShapeAssets(editor, [...shapesToCreate, ...shapesToUpdate]);
        }

        if (shapesToCreate.length) {
          piloDefaultArrowKindHydrationGuardRef.current = true;
          try {
            editor.createShapes(sortFreeformShapesForCreate(shapesToCreate));
          } finally {
            piloDefaultArrowKindHydrationGuardRef.current = false;
          }
        }

        if (shapesToUpdate.length) {
          editor.updateShapes(shapesToUpdate as TLShapePartial<TLShape>[]);
        }

        if (changedShapesForBindingRestore.length) {
          restoreFreeformShapeBindings(
            editor,
            changedShapesForBindingRestore,
            pendingArrowBindingsRef,
          );
        }
      },
      { history: "ignore" },
    );
  });
}

export function registerCanvasEditorSideEffects(
  editor: Editor,
  piloDefaultArrowKindHydrationGuardRef: MutableRefObject<boolean>,
) {
  editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
    if (
      shape.type === "arrow" &&
      !piloDefaultArrowKindHydrationGuardRef.current &&
      shape.props.kind !== "elbow"
    ) {
      return {
        ...shape,
        props: {
          ...shape.props,
          kind: "elbow",
        },
      };
    }

    if (!isPiloFrameShape(shape) || shape.props.name.trim()) return shape;

    return {
      ...shape,
      props: {
        ...shape.props,
        name: resolveNextFrameName(editor),
      },
    };
  });

  editor.sideEffects.registerBeforeChangeHandler("shape", (prev, next) => {
    let nextShape = next;

    if (isPiloFrameShape(nextShape)) {
      const shouldNormalizeFrameName =
        prev.type !== "frame" || prev.props.name !== nextShape.props.name;

      if (shouldNormalizeFrameName) {
        const normalizedName = normalizeBlankFrameName(nextShape.props.name);

        if (normalizedName !== nextShape.props.name) {
          nextShape = {
            ...nextShape,
            props: {
              ...nextShape.props,
              name: normalizedName,
            },
          };
        }
      }
    }

    return nextShape;
  });
}
