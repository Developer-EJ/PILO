"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  exportAs,
  type Editor,
  type TLGeoShapeGeoStyle,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
  useEditor,
} from "tldraw";
import { useValue } from "@tldraw/state-react";
import { useCanvasAgent } from "@/features/canvas/agent/use-canvas-agent";
import { CanvasAgentDeepLinkHandler } from "@/features/canvas/agent/CanvasAgentDeepLinkHandler";
import { getCanvasAgentDriveShapeId } from "@/features/canvas/agent/canvas-agent-deep-link";
import { buildCanvasAgentDelegationRequestContext } from "@/features/canvas/agent/canvas-agent-delegation-context";
import { registerCanvasAgentDelegationAdapter } from "@/features/agent/canvas-delegation-context";
import { CanvasWorkspaceLocationAdapter } from "@/features/canvas/canvas-workspace-location-adapter";
import { TldrawSurface } from "@/shared/tldraw";
import type { CanvasPresenceController } from "@/features/canvas/collaboration/useCanvasRoom";
import { CanvasRemoteShapePreviewProvider } from "@/features/canvas/collaboration/CanvasRemoteShapePreviewContext";
import { RemoteCursorOverlay } from "@/shared/canvas-realtime/RemoteCursorOverlay";
import { CanvasRemotePresenceProvider } from "@/features/canvas/collaboration/CanvasRemotePresenceContext";
import type {
  CanvasShapePreviewPhase,
} from "@/shared/canvas-realtime/canvas-realtime-types";
import { PiloCanvasBackground } from "./overlays/PiloCanvasBackground";
import {
  CanvasAiChatOverlay,
} from "./overlays/CanvasAiChatOverlay";
import { CanvasAgentVisualOverlay } from "./overlays/CanvasAgentVisualOverlay";
import { CanvasCameraCoordinateHud } from "./overlays/CanvasCameraCoordinateHud";
import { CanvasFrameLazyLoadingOverlay } from "./overlays/CanvasFrameLazyLoadingOverlay";
import { CanvasRemoteWorldPreviewLayer } from "./overlays/CanvasRemoteWorldPreviewLayer";
import { SelectedShapeStackingManager } from "../interactions/PiloCanvasStackingManager";
import { SelectedGroupToolbar } from "../interactions/PiloCanvasGroupToolbar";
import {
  isPiloCodeBlockShape,
  isPiloFrameShape,
} from "../shapes/PiloCanvasShapeGuards";
import {
  FrameSelectionToolbar,
} from "../shapes/frame/PiloFrameSelectionToolbar";
import { withPiloMediaAsset } from "../assets/pilo-canvas-assets";
import { CanvasFileDropImporter } from "./CanvasFileDropImporter";
import { CanvasRealtimePreviewApplier } from "./realtime/CanvasRealtimePreviewApplier";
import { CanvasPresenceReporter } from "./reporters/CanvasPresenceReporter";
import { CanvasStateReporter } from "./reporters/CanvasStateReporter";
import {
  CanvasHistoryStateReporter,
  CanvasLocalInteractionReporter,
  CanvasSnapStateReporter,
} from "./reporters/CanvasEditorStateReporters";
import {
  withSerializedArrowBindings,
  type PiloArrowBindingSnapshot,
} from "./canvas-arrow-bindings";
import {
  applyFreeformShapePatchIncrementally,
  hydrateFreeformShapes,
  registerCanvasEditorSideEffects,
  resetFreeformShapes,
  syncFreeformShapesIncrementally,
} from "./canvas-editor-shape-hydration";
import type {
  PiloCanvasFreeformShape,
  PiloCanvasLocalInteractionState,
  PiloCanvasLocalShapeChange,
  PiloCanvasViewportBounds,
  PiloCanvasViewSetting,
} from "../canvas-engine-types";
import type { PiloInsertableTool } from "../shapes/pilo-canvas-shape-factory";
import { piloCanvasShapeUtils } from "../shapes/pilo-canvas-shape-utils";
import { createPiloCanvasShapeInEmptyViewport } from "../interactions/pilo-canvas-instant-shape";
import { placePiloCanvasShapeInEmptyViewport } from "../interactions/pilo-canvas-placement";
import type {
  CanvasAiChatAnchor,
  PiloCanvasActions,
  PiloCanvasColor,
  PiloCanvasDash,
  PiloCanvasExportFormat,
  PiloCanvasExportScope,
  PiloCanvasFill,
  PiloCanvasHistoryState,
  PiloCanvasSelectionAction,
  PiloCanvasSize,
  PiloCanvasSnapState,
  PiloCanvasShapePatch,
  PiloCanvasStyleState,
  PiloCanvasTool,
  PiloCanvasUserPreference,
  PiloCanvasUserPreferenceState,
  PiloDrawingPreset,
} from "./canvas-editor-contracts";
import { resetClassicCanvasCamera } from "./canvas-initial-camera";
import { CanvasDriveFileProvider } from "../../integrations/drive/CanvasDriveFileContext";

export type { PiloCanvasFreeformShape } from "../canvas-engine-types";
export type { PiloInsertableTool } from "../shapes/pilo-canvas-shape-factory";
export type {
  PiloCanvasActions,
  PiloCanvasColor,
  PiloCanvasDash,
  PiloCanvasExportFormat,
  PiloCanvasExportScope,
  PiloCanvasFill,
  PiloCanvasHistoryState,
  PiloCanvasSelectionAction,
  PiloCanvasSize,
  PiloCanvasSnapState,
  PiloCanvasShapePatch,
  PiloCanvasStyleState,
  PiloCanvasTool,
  PiloCanvasUserPreference,
  PiloCanvasUserPreferenceState,
  PiloDrawingPreset,
} from "./canvas-editor-contracts";

type CanvasBoardDetail = {
  id: string;
  workspaceId: string;
  title: string;
  shapeCount: number;
};

const piloGeoStyleByDrawingPreset: Partial<
  Record<PiloDrawingPreset, TLGeoShapeGeoStyle>
> = {
  rectangle: "rectangle",
  circle: "ellipse",
  triangle: "triangle",
  diamond: "diamond",
  hexagon: "hexagon",
  ellipse: "ellipse",
  oval: "oval",
  rhombus: "rhombus",
  "rhombus-2": "rhombus-2",
  star: "star",
  cloud: "cloud",
  heart: "heart",
  "x-box": "x-box",
  "check-box": "check-box",
  "arrow-left": "arrow-left",
  "arrow-up": "arrow-up",
  "arrow-down": "arrow-down",
  "arrow-right": "arrow-right",
};

function getCanvasExportName(title: string) {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "PILO Canvas";
}

function getCanvasUserPreferences(
  editor: Editor,
): PiloCanvasUserPreferenceState {
  return {
    "paste-at-cursor": editor.user.getIsPasteAtCursorMode(),
    "reduce-motion": editor.user.getAnimationSpeed() === 0,
    "wrap-text": editor.user.getIsWrapMode(),
  };
}

type CanvasEditorProps = {
  board: CanvasBoardDetail;
  cameraResetVersion: number;
  consumeShapePatch: () => PiloCanvasShapePatch;
  hydrationVersion: number;
  getCommittedFreeformShapeSnapshots: () => PiloCanvasFreeformShape[];
  getPublishedFreeformShapeSnapshots: () => PiloCanvasFreeformShape[];
  loadingFrameIds: ReadonlySet<string>;
  onReady: (actions: PiloCanvasActions | null) => void;
  onFreeformShapesDraftChange: (
    shapes: PiloCanvasFreeformShape[],
    change?: PiloCanvasLocalShapeChange,
  ) => void;
  onFreeformShapesChange: (
    shapes: PiloCanvasFreeformShape[],
    change?: PiloCanvasLocalShapeChange,
  ) => void;
  onViewChange: (viewSetting: PiloCanvasViewSetting) => void;
  onFrameSubtreeRequest: (frameId: string) => Promise<void>;
  getPreservedFreeformShapeSnapshots?: () => PiloCanvasFreeformShape[];
  isShapePatchProtected: (shapeId: string) => boolean;
  onViewportBoundsChange: (bounds: PiloCanvasViewportBounds) => void;
  onHistoryStateChange: (state: PiloCanvasHistoryState) => void;
  onLocalInteractionStateChange: (
    state: PiloCanvasLocalInteractionState,
  ) => void;
  presence?: CanvasPresenceController;
  onSnapStateChange: (state: PiloCanvasSnapState) => void;
  onOneShotToolCreated?: () => void;
  shapePatchVersion: number;
  canvasAgentEnabled?: boolean;
};

const tldrawComponents = {
  Background: PiloCanvasBackground,
  OnTheCanvas: CanvasRemoteWorldPreviewLayer,
};

const CANVAS_AI_CHAT_HOLD_MS = 500;
const CANVAS_PENDING_PREVIEW_GROUP_TTL_MS = 30_000;
const CANVAS_PENDING_PREVIEW_HEARTBEAT_MS = 1_500;
const CANVAS_SHAPE_PREVIEW_THROTTLE_MS = 60;
const connectionTools = new Set<PiloCanvasTool>(["arrow", "line"]);
type PendingRealtimePreviewGroup = {
  createdAt: number;
  expiresAt: number;
  id: string;
  shapeIds: Set<string>;
  snapshots: Map<string, PiloCanvasFreeformShape>;
};

type PendingShapePreviewPayload = {
  deletedShapeIds: string[];
  phase: CanvasShapePreviewPhase;
  shapes: Record<string, unknown>[];
};

function getFreeformShapeId(shape: PiloCanvasFreeformShape | TLShape) {
  return typeof shape.id === "string" ? shape.id : null;
}

function cloneFreeformShape(shape: PiloCanvasFreeformShape) {
  return JSON.parse(JSON.stringify(shape)) as PiloCanvasFreeformShape;
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

function mergeFreeformShapeSnapshots({
  changedShapeIds,
  currentShapes,
  deletedShapeIds,
  snapshotShapes,
}: {
  changedShapeIds: Iterable<string>;
  currentShapes: PiloCanvasFreeformShape[];
  deletedShapeIds: Iterable<string>;
  snapshotShapes: PiloCanvasFreeformShape[];
}) {
  const changedShapeIdSet = new Set(changedShapeIds);
  const deletedShapeIdSet = new Set(deletedShapeIds);
  const shapeMap = buildFreeformShapeMapFromShapes(currentShapes);
  const orderedShapeIds = currentShapes.flatMap((shape) => {
    const shapeId = getFreeformShapeId(shape);

    return shapeId ? [shapeId] : [];
  });

  deletedShapeIdSet.forEach((shapeId) => {
    shapeMap.delete(shapeId);
  });
  snapshotShapes.forEach((shape) => {
    const shapeId = getFreeformShapeId(shape);

    if (!shapeId || !changedShapeIdSet.has(shapeId)) return;
    if (!shapeMap.has(shapeId)) {
      orderedShapeIds.push(shapeId);
    }
    shapeMap.set(shapeId, shape);
  });

  return Array.from(new Set(orderedShapeIds))
    .map((shapeId) => shapeMap.get(shapeId))
    .filter((shape): shape is PiloCanvasFreeformShape => Boolean(shape));
}

function hasGroupedFreeformShapes(shapes: PiloCanvasFreeformShape[]) {
  if (shapes.length < 2) return false;

  const shapeIds = new Set<string>(
    shapes.flatMap((shape) => {
      const shapeId = getFreeformShapeId(shape);

      return shapeId ? [shapeId] : [];
    }),
  );

  return shapes.some((shape) => {
    if (shape.type === "frame") return true;

    const parentId = typeof shape.parentId === "string" ? shape.parentId : null;

    return Boolean(parentId && shapeIds.has(parentId));
  });
}

function refreshPendingPreviewGroupSnapshots({
  groups,
  now,
  shapes,
}: {
  groups: Map<string, PendingRealtimePreviewGroup>;
  now: number;
  shapes: PiloCanvasFreeformShape[];
}) {
  const currentShapesById = buildFreeformShapeMapFromShapes(shapes);

  groups.forEach((group, groupId) => {
    if (group.expiresAt <= now) {
      groups.delete(groupId);
      return;
    }

    group.shapeIds.forEach((shapeId) => {
      const currentShape = currentShapesById.get(shapeId);

      if (currentShape) {
        group.snapshots.set(shapeId, cloneFreeformShape(currentShape));
      }
    });
  });

  return currentShapesById;
}

function acknowledgePendingPreviewGroupShapes(
  groups: Map<string, PendingRealtimePreviewGroup>,
  committedShapeIds: string[],
) {
  if (!groups.size || !committedShapeIds.length) return;

  const committedShapeIdSet = new Set(committedShapeIds);

  groups.forEach((group, groupId) => {
    committedShapeIdSet.forEach((shapeId) => {
      group.shapeIds.delete(shapeId);
      group.snapshots.delete(shapeId);
    });

    if (!group.shapeIds.size) {
      groups.delete(groupId);
    }
  });
}

function collectPendingPreviewGroupShapeIds(
  groups: Map<string, PendingRealtimePreviewGroup>,
) {
  const shapeIds = new Set<string>();

  groups.forEach((group) => {
    group.shapeIds.forEach((shapeId) => shapeIds.add(shapeId));
  });

  return shapeIds;
}

function collectPendingPreviewGroupShapes({
  currentShapesById,
  groups,
}: {
  currentShapesById: Map<string, PiloCanvasFreeformShape>;
  groups: Map<string, PendingRealtimePreviewGroup>;
}) {
  const previewShapesById = new Map<string, PiloCanvasFreeformShape>();

  groups.forEach((group) => {
    group.shapeIds.forEach((shapeId) => {
      const currentShape = currentShapesById.get(shapeId);
      const snapshot = currentShape ?? group.snapshots.get(shapeId);

      if (!snapshot) return;
      previewShapesById.set(shapeId, snapshot);
    });
  });

  return Array.from(previewShapesById.values());
}

function isPointerInsideTrashDropZone(event: globalThis.PointerEvent) {
  const target = document.elementFromPoint(event.clientX, event.clientY);

  return Boolean(target?.closest(".canvas-trash-drop-zone"));
}

function updateTrashDropZoneAttraction(
  editor: Editor,
  event: globalThis.PointerEvent,
) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const trashDropZone = target?.closest(".canvas-trash-drop-zone");

  const shouldAttract =
    Boolean(trashDropZone) && editor.getSelectedShapeIds().length > 0;

  document
    .querySelectorAll(".canvas-trash-drop-zone")
    .forEach((currentTrashDropZone) =>
      currentTrashDropZone.classList.toggle(
        "is-attracting",
        shouldAttract && currentTrashDropZone === trashDropZone,
      ),
    );
}

function clearTrashDropZoneAttraction() {
  document
    .querySelectorAll(".canvas-trash-drop-zone.is-attracting")
    .forEach((trashDropZone) =>
      trashDropZone.classList.remove("is-attracting"),
    );
}

function isPiloErasableShape(shape: TLShape | undefined) {
  return Boolean(shape && (shape.type === "draw" || shape.type === "highlight"));
}

function isCanvasEditableShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable=\"true\"], .pilo-code-mirror",
      ),
    )
  );
}

function getShapePreviewPhase(
  currentToolId: string,
  selectedShapeIds: string[],
): CanvasShapePreviewPhase | null {
  if (!selectedShapeIds.length) return null;
  if (currentToolId.includes("resize")) return "resize";
  if (currentToolId.includes("translate")) return "move";

  return null;
}

function getDeletedPreviewShapeIds({
  nextShapes,
  previewShapeIds,
  previousShapes,
}: {
  nextShapes: PiloCanvasFreeformShape[];
  previewShapeIds: Set<string>;
  previousShapes: PiloCanvasFreeformShape[];
}) {
  if (!previewShapeIds.size) return [];

  const previousShapeIds = new Set<string>(
    previousShapes.flatMap((shape) => {
      const shapeId = getFreeformShapeId(shape);

      return shapeId ? [String(shapeId)] : [];
    }),
  );
  const nextShapeIds = new Set<string>(
    nextShapes.flatMap((shape) => {
      const shapeId = getFreeformShapeId(shape);

      return shapeId ? [String(shapeId)] : [];
    }),
  );

  return Array.from(previewShapeIds).filter(
    (shapeId) => previousShapeIds.has(shapeId) && !nextShapeIds.has(shapeId),
  );
}

function getCreatedFreeformShapeIds({
  nextShapes,
  previousShapes,
}: {
  nextShapes: PiloCanvasFreeformShape[];
  previousShapes: PiloCanvasFreeformShape[];
}) {
  const previousShapeIds = new Set<string>(
    previousShapes.flatMap((shape) => {
      const shapeId = getFreeformShapeId(shape);

      return shapeId ? [String(shapeId)] : [];
    }),
  );

  return nextShapes.flatMap((shape) => {
    const shapeId = getFreeformShapeId(shape);

    return shapeId && !previousShapeIds.has(String(shapeId))
      ? [String(shapeId)]
      : [];
  });
}

function deleteSelectedShapes(editor: Editor) {
  const selectedShapeIds = editor.getSelectedShapeIds();

  if (!selectedShapeIds.length) return false;

  editor.deleteShapes(selectedShapeIds);
  return true;
}

function getArrowAtPoint(editor: Editor, pagePoint: { x: number; y: number }) {
  const hitMargin = 8 / editor.getZoomLevel();

  return editor
    .getShapesAtPoint(pagePoint, {
      hitInside: true,
      margin: hitMargin,
    })
    .find((shape) => shape.type === "arrow");
}

function getVisibleFrameHeadingShape(
  editor: Editor,
  target: EventTarget | null,
) {
  if (!(target instanceof Element)) return null;

  const shapeElement = target
    .closest(".tl-frame-heading")
    ?.closest<HTMLElement>("[data-shape-id]");
  const shapeId = shapeElement?.dataset.shapeId;
  const shape = shapeId ? editor.getShape(shapeId as TLShapeId) : undefined;

  return isPiloFrameShape(shape) ? shape : null;
}

export function CanvasEditor({
  board,
  cameraResetVersion,
  consumeShapePatch,
  getCommittedFreeformShapeSnapshots,
  getPublishedFreeformShapeSnapshots,
  hydrationVersion,
  loadingFrameIds,
  onReady,
  onFreeformShapesDraftChange,
  onFreeformShapesChange,
  onViewChange,
  onFrameSubtreeRequest,
  getPreservedFreeformShapeSnapshots,
  isShapePatchProtected,
  onViewportBoundsChange,
  onHistoryStateChange,
  onLocalInteractionStateChange,
  presence,
  onSnapStateChange,
  onOneShotToolCreated,
  shapePatchVersion,
  canvasAgentEnabled = false,
}: CanvasEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const [canvasEditor, setCanvasEditor] = useState<Editor | null>(null);
  const returnToSelectAfterPlacementRef = useRef(false);
  const onOneShotToolCreatedRef = useRef(onOneShotToolCreated);
  const canvasAiChatPointerRef = useRef<CanvasAiChatAnchor | null>(null);
  const canvasAiChatHoldFrameRef = useRef<number | null>(null);
  const canvasAiChatHoldStartedAtRef = useRef<number | null>(null);
  const canvasAiChatHoldPositionRef = useRef<CanvasAiChatAnchor | null>(null);
  const pendingArrowBindingsRef = useRef<PiloArrowBindingSnapshot[]>([]);
  const piloDefaultArrowKindHydrationGuardRef = useRef(false);
  const piloEraserActiveRef = useRef(false);
  const piloEraserPointerIdRef = useRef<number | null>(null);
  const createdLocalCardsRef = useRef(0);
  const localPreviewShapeIdsRef = useRef<string[]>([]);
  const localPreviewPhaseRef = useRef<CanvasShapePreviewPhase | null>(null);
  const pendingShapePreviewPayloadRef =
    useRef<PendingShapePreviewPayload | null>(null);
  const shapePreviewSendTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShapePreviewSentAtRef = useRef(0);
  const pendingRealtimePreviewGroupsRef = useRef(
    new Map<string, PendingRealtimePreviewGroup>(),
  );
  const remotePreviewOriginalShapesRef = useRef(
    new Map<string, PiloCanvasFreeformShape>(),
  );
  const remotePreviewShapeIdsRef = useRef(new Set<string>());
  const canvasWheelCleanupRef = useRef<(() => void) | null>(null);
  const lastHydratedSeedKeyRef = useRef<string | null>(null);
  const seedKey = board.id;
  const [canvasAiChatAnchor, setCanvasAiChatAnchor] =
    useState<CanvasAiChatAnchor | null>(null);
  const [canvasAiChatHoldProgress, setCanvasAiChatHoldProgress] = useState<
    (CanvasAiChatAnchor & { progress: number }) | null
  >(null);
  const [isPiloEraserActive, setIsPiloEraserActive] = useState(false);
  const [localInteractionVersion, setLocalInteractionVersion] = useState(0);
  const isCanvasAiChatVisible = Boolean(canvasAiChatAnchor || canvasAiChatHoldProgress);
  const handleCanvasAgentApplied = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const bounds = editor.getViewportPageBounds();
    onViewportBoundsChange({
      x: bounds.x,
      y: bounds.y,
      width: bounds.w,
      height: bounds.h,
      zoom: editor.getCamera().z,
    });
  }, [onViewportBoundsChange]);
  const handleCanvasAgentDriveFileInsert = useCallback(
    (
      file: { fileId: string; fileName: string; mimeType: string },
      runId: string,
    ) => {
      const editor = editorRef.current;
      if (!editor) return false;

      const shapeId = getCanvasAgentDriveShapeId(runId) as TLShapeId;
      if (editor.getShape(shapeId)) {
        editor.setSelectedShapes([shapeId]);
        return true;
      }

      editor.cancel();
      editor.setCurrentTool("select.idle");
      const result = placePiloCanvasShapeInEmptyViewport({
        editor,
        index: createdLocalCardsRef.current + 1,
        placementRequest: { type: "drive-file", file, shapeId },
      });
      if (!result.placed) return false;

      createdLocalCardsRef.current += result.createdCount;
      onOneShotToolCreatedRef.current?.();
      return true;
    },
    [],
  );

  const canvasAgent = useCanvasAgent({
    canvasId: board.id,
    editor: canvasEditor,
    enabled: canvasAgentEnabled,
    onApplied: handleCanvasAgentApplied,
    onDriveFileInsert: handleCanvasAgentDriveFileInsert,
    onFrameSubtreeRequest,
    workspaceId: board.workspaceId,
  });
  useEffect(() => {
    if (!canvasEditor) return;
    return registerCanvasAgentDelegationAdapter({
      canvasId: board.id,
      buildRequestContext: (toolHelpMode) =>
        buildCanvasAgentDelegationRequestContext({
          canvasId: board.id,
          editor: canvasEditor,
          onFrameSubtreeRequest,
          toolHelpMode,
        }),
      presentRun: canvasAgent.adoptRun,
    });
  }, [board.id, canvasAgent.adoptRun, canvasEditor, onFrameSubtreeRequest]);
  const scheduleShapePreviewSend = useCallback(
    (payload: PendingShapePreviewPayload) => {
      if (!presence?.enabled) return;

      pendingShapePreviewPayloadRef.current = payload;

      if (shapePreviewSendTimerRef.current) {
        return;
      }

      const elapsed = Date.now() - lastShapePreviewSentAtRef.current;
      const delay = Math.max(0, CANVAS_SHAPE_PREVIEW_THROTTLE_MS - elapsed);

      const flushPreview = () => {
        shapePreviewSendTimerRef.current = null;
        const nextPayload = pendingShapePreviewPayloadRef.current;

        pendingShapePreviewPayloadRef.current = null;
        if (!nextPayload) return;

        presence.sendShapePreview(
          nextPayload.shapes,
          nextPayload.phase,
          nextPayload.deletedShapeIds,
        );
        lastShapePreviewSentAtRef.current = Date.now();
      };

      if (delay === 0) {
        flushPreview();
        return;
      }

      shapePreviewSendTimerRef.current = setTimeout(flushPreview, delay);
    },
    [presence?.enabled, presence?.sendShapePreview],
  );

  useEffect(() => {
    onOneShotToolCreatedRef.current = onOneShotToolCreated;
  }, [onOneShotToolCreated]);

  useEffect(() => {
    const committedPatch = presence?.lastCommittedShapePatch;

    if (!committedPatch) return;

    acknowledgePendingPreviewGroupShapes(
      pendingRealtimePreviewGroupsRef.current,
      committedPatch.shapeIds,
    );
  }, [presence?.lastCommittedShapePatch]);

  const resolveRealtimePreviewSnapshot = useCallback(
    (_shape: TLShape, snapshot: PiloCanvasFreeformShape) => {
      const shapeId = getFreeformShapeId(snapshot);

      if (!shapeId || !remotePreviewShapeIdsRef.current.has(shapeId)) {
        return snapshot;
      }

      return remotePreviewOriginalShapesRef.current.get(shapeId) ?? null;
    },
    [],
  );

  const registerPendingRealtimePreviewGroup = useCallback(
    (shapes: PiloCanvasFreeformShape[], reason: string) => {
      const groupShapes = shapes.filter((shape) => getFreeformShapeId(shape));

      if (!groupShapes.length) return;

      const shapeIds = new Set(
        groupShapes.flatMap((shape) => {
          const shapeId = getFreeformShapeId(shape);

          return shapeId ? [shapeId] : [];
        }),
      );
      const pendingGroups = pendingRealtimePreviewGroupsRef.current;
      const existingGroup = Array.from(pendingGroups.values()).find((group) =>
        Array.from(shapeIds).every((shapeId) => group.shapeIds.has(shapeId)),
      );
      const now = Date.now();
      const snapshots = new Map<string, PiloCanvasFreeformShape>();

      groupShapes.forEach((shape) => {
        const shapeId = getFreeformShapeId(shape);

        if (shapeId) {
          snapshots.set(shapeId, cloneFreeformShape(shape));
        }
      });

      if (existingGroup) {
        snapshots.forEach((snapshot, shapeId) => {
          existingGroup.snapshots.set(shapeId, snapshot);
        });
        existingGroup.expiresAt = Math.max(
          existingGroup.expiresAt,
          now + CANVAS_PENDING_PREVIEW_GROUP_TTL_MS,
        );
        return;
      }

      pendingGroups.set(`${reason}:${now}:${pendingGroups.size}`, {
        createdAt: now,
        expiresAt: now + CANVAS_PENDING_PREVIEW_GROUP_TTL_MS,
        id: `${reason}:${now}:${pendingGroups.size}`,
        shapeIds,
        snapshots,
      });
    },
    [],
  );

  const handleRealtimePreviewDraftChange = useCallback(
    (
      shapes: PiloCanvasFreeformShape[],
      localChange?: PiloCanvasLocalShapeChange,
      previousShapes = getCommittedFreeformShapeSnapshots(),
    ) => {
      const createdShapeIds = getCreatedFreeformShapeIds({
        nextShapes: shapes,
        previousShapes,
      });
      const createdShapeIdSet = new Set(createdShapeIds);
      const createdShapes = shapes.filter((shape) => {
        const shapeId = getFreeformShapeId(shape);

        return shapeId ? createdShapeIdSet.has(shapeId) : false;
      });

      if (hasGroupedFreeformShapes(createdShapes)) {
        registerPendingRealtimePreviewGroup(createdShapes, "created-group");
      }

      if (localChange?.isFreehandDrawing) {
        const changedShapeIdSet = new Set(localChange.changedShapeIds);
        const freehandShapes = shapes.filter((shape) => {
          const shapeId = getFreeformShapeId(shape);

          return Boolean(
            shapeId &&
              changedShapeIdSet.has(shapeId) &&
              (shape.type === "draw" || shape.type === "highlight"),
          );
        });

        registerPendingRealtimePreviewGroup(freehandShapes, "freehand");
      }

      const currentShapesById = refreshPendingPreviewGroupSnapshots({
        groups: pendingRealtimePreviewGroupsRef.current,
        now: Date.now(),
        shapes,
      });
      const pendingPreviewShapeIds = collectPendingPreviewGroupShapeIds(
        pendingRealtimePreviewGroupsRef.current,
      );
      const previewShapeIds = new Set([
        ...localPreviewShapeIdsRef.current,
        ...createdShapeIds,
        ...pendingPreviewShapeIds,
      ]);
      const phase = localPreviewPhaseRef.current;
      const deletedShapeIds = getDeletedPreviewShapeIds({
        nextShapes: shapes,
        previewShapeIds,
        previousShapes,
      });

      if (!presence?.enabled || !previewShapeIds.size) {
        return;
      }

      const previewShapesById = new Map<string, PiloCanvasFreeformShape>();

      shapes.forEach((shape) => {
        const shapeId = getFreeformShapeId(shape);

        if (shapeId && previewShapeIds.has(shapeId)) {
          previewShapesById.set(shapeId, shape);
        }
      });
      collectPendingPreviewGroupShapes({
        currentShapesById,
        groups: pendingRealtimePreviewGroupsRef.current,
      }).forEach((shape) => {
        const shapeId = getFreeformShapeId(shape);

        if (shapeId) {
          previewShapesById.set(shapeId, shape);
        }
      });
      const previewShapes = Array.from(previewShapesById.values());

      if (!previewShapes.length && !deletedShapeIds.length) return;

      scheduleShapePreviewSend({
        deletedShapeIds,
        phase: deletedShapeIds.length ? "delete" : (phase ?? "unknown"),
        shapes: previewShapes as unknown as Record<string, unknown>[],
      });
    },
    [
      presence?.enabled,
      getCommittedFreeformShapeSnapshots,
      registerPendingRealtimePreviewGroup,
      scheduleShapePreviewSend,
    ],
  );

  const handleLocalInteractionChange = useCallback(
    (state: PiloCanvasLocalInteractionState) => {
      const nextShapeIds = Array.from(
        new Set(state.activeMutationShapeIds.filter(Boolean)),
      );
      const nextPreviewPhase = getShapePreviewPhase(
        state.currentToolId,
        state.selectedShapeIds,
      );

      localPreviewShapeIdsRef.current = nextShapeIds;
      localPreviewPhaseRef.current = nextPreviewPhase;
      setLocalInteractionVersion((version) => version + 1);

      onLocalInteractionStateChange(state);
    },
    [onLocalInteractionStateChange],
  );
  const handleFreeformShapesDraftChange = useCallback(
    (
      shapes: PiloCanvasFreeformShape[],
      change: PiloCanvasLocalShapeChange,
    ) => {
      const previousShapes = getCommittedFreeformShapeSnapshots();

      onFreeformShapesDraftChange(shapes, change);
      const nextShapes = getCommittedFreeformShapeSnapshots();

      handleRealtimePreviewDraftChange(
        nextShapes,
        change,
        previousShapes,
      );
    },
    [
      getCommittedFreeformShapeSnapshots,
      handleRealtimePreviewDraftChange,
      onFreeformShapesDraftChange,
    ],
  );

  useEffect(() => {
    if (!presence?.enabled) return;

    const heartbeatTimer = window.setInterval(() => {
      if (!pendingRealtimePreviewGroupsRef.current.size) return;

      const editor = editorRef.current;

      if (!editor) return;

      const pendingShapeIds = collectPendingPreviewGroupShapeIds(
        pendingRealtimePreviewGroupsRef.current,
      );
      const shapes = Array.from(pendingShapeIds).flatMap((shapeId) => {
        const shape = editor.getShape(shapeId as TLShapeId);

        return shape
          ? [
              withPiloMediaAsset(
                editor,
                withSerializedArrowBindings(editor, shape),
              ),
            ]
          : [];
      });
      const deletedShapeIds = Array.from(pendingShapeIds).filter(
        (shapeId) => !editor.getShape(shapeId as TLShapeId),
      );
      const previousShapes = getCommittedFreeformShapeSnapshots();
      const nextShapes = mergeFreeformShapeSnapshots({
        changedShapeIds: pendingShapeIds,
        currentShapes: previousShapes,
        deletedShapeIds,
        snapshotShapes: shapes,
      });

      handleRealtimePreviewDraftChange(
        nextShapes,
        {
          changedShapeIds: Array.from(pendingShapeIds),
          deletedShapeIds,
          isFreehandDrawing: false,
        },
        previousShapes,
      );
    }, CANVAS_PENDING_PREVIEW_HEARTBEAT_MS);

    return () => window.clearInterval(heartbeatTimer);
  }, [
    getCommittedFreeformShapeSnapshots,
    handleRealtimePreviewDraftChange,
    presence?.enabled,
  ]);

  useEffect(
    () => () => {
      if (canvasAiChatHoldFrameRef.current !== null) {
        window.cancelAnimationFrame(canvasAiChatHoldFrameRef.current);
      }

      if (shapePreviewSendTimerRef.current) {
        clearTimeout(shapePreviewSendTimerRef.current);
        shapePreviewSendTimerRef.current = null;
      }
      pendingShapePreviewPayloadRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) return;

    const shouldPreserveLocalState =
      lastHydratedSeedKeyRef.current === seedKey;
    const committedShapes = getCommittedFreeformShapeSnapshots();

    if (shouldPreserveLocalState) {
      syncFreeformShapesIncrementally(
        editor,
        committedShapes,
        pendingArrowBindingsRef,
        piloDefaultArrowKindHydrationGuardRef,
        getPreservedFreeformShapeSnapshots,
      );
    } else {
      resetFreeformShapes(
        editor,
        committedShapes,
        pendingArrowBindingsRef,
        piloDefaultArrowKindHydrationGuardRef,
      );
    }

    lastHydratedSeedKeyRef.current = seedKey;
  }, [
    getCommittedFreeformShapeSnapshots,
    getPreservedFreeformShapeSnapshots,
    hydrationVersion,
    seedKey,
  ]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const patch = consumeShapePatch();

    applyFreeformShapePatchIncrementally(
      editor,
      patch,
      pendingArrowBindingsRef,
      piloDefaultArrowKindHydrationGuardRef,
    );
    presence?.remoteShapePreviewStore.acknowledgeAppliedShapeIds([
      ...patch.deletedShapeIds,
      ...patch.upsertShapes.flatMap((shape) => {
        const shapeId = getFreeformShapeId(shape);

        return shapeId ? [shapeId] : [];
      }),
    ]);
  }, [
    consumeShapePatch,
    presence?.remoteShapePreviewStore,
    shapePatchVersion,
  ]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) return;

    resetClassicCanvasCamera(editor);
  }, [cameraResetVersion, seedKey]);

  function deactivatePiloEraser(editor = editorRef.current) {
    piloEraserActiveRef.current = false;
    piloEraserPointerIdRef.current = null;
    setIsPiloEraserActive(false);

    if (editor?.getCurrentToolId() === "eraser") {
      editor.setCurrentTool("select.idle");
    }
  }

  function activatePiloEraser(editor: Editor) {
    returnToSelectAfterPlacementRef.current = false;
    piloEraserActiveRef.current = true;
    piloEraserPointerIdRef.current = null;
    setIsPiloEraserActive(true);
    editor.cancel();
    editor.updateInstanceState({ isToolLocked: false });
    editor.setCurrentTool("select.idle");
  }

  function erasePiloDrawShapeAtScreenPoint(
    editor: Editor,
    event: Pick<globalThis.PointerEvent, "clientX" | "clientY">,
  ) {
    const pagePoint = editor.screenToPage({
      x: event.clientX,
      y: event.clientY,
    });
    const hitMargin = editor.options.hitTestMargin / editor.getZoomLevel();
    const hitErasableShapes = editor
      .getShapesAtPoint(pagePoint, {
        hitInside: false,
        margin: hitMargin,
      })
      .filter(isPiloErasableShape);
    const erasableShapeIds = hitErasableShapes.map(
      (shape) => shape.id as TLShapeId,
    );

    if (!erasableShapeIds.length) return false;

    editor.deleteShapes(Array.from(new Set(erasableShapeIds)));
    return true;
  }

  function shouldUsePiloEraser(editor: Editor) {
    return (
      piloEraserActiveRef.current || editor.getCurrentToolId() === "eraser"
    );
  }

  function stopPiloEraserPointerEvent(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  }

  function handlePiloEraserPointerDown(
    event: PointerEvent<HTMLDivElement>,
    editor: Editor,
  ) {
    if (event.button !== 0 || !shouldUsePiloEraser(editor)) return false;

    piloEraserActiveRef.current = true;
    piloEraserPointerIdRef.current = event.pointerId;
    editor.setCurrentTool("select.idle");
    editor.markHistoryStoppingPoint("pilo eraser begin");
    erasePiloDrawShapeAtScreenPoint(editor, event.nativeEvent);
    stopPiloEraserPointerEvent(event);
    return true;
  }

  function handlePiloEraserPointerMove(event: PointerEvent<HTMLDivElement>) {
    const editor = editorRef.current;

    if (
      !editor ||
      piloEraserPointerIdRef.current === null ||
      piloEraserPointerIdRef.current !== event.pointerId
    ) {
      return false;
    }

    erasePiloDrawShapeAtScreenPoint(editor, event.nativeEvent);
    stopPiloEraserPointerEvent(event);
    return true;
  }

  function handlePiloEraserPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const editor = editorRef.current;

    if (
      !editor ||
      piloEraserPointerIdRef.current === null ||
      piloEraserPointerIdRef.current !== event.pointerId
    ) {
      return false;
    }

    piloEraserPointerIdRef.current = null;
    editor.markHistoryStoppingPoint("pilo eraser end");
    stopPiloEraserPointerEvent(event);
    return true;
  }

  useEffect(() => {
    function shouldIgnoreCanvasAiChatShortcut(event: KeyboardEvent) {
      return (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.key.toLowerCase() !== "c" ||
        (event.target instanceof Element &&
          event.target.closest(
            "input, textarea, select, [contenteditable=\"true\"], .pilo-code-mirror",
          ))
      );
    }

    function startCanvasAiChatWithShortcut(event: KeyboardEvent) {
      if (
        event.repeat ||
        shouldIgnoreCanvasAiChatShortcut(event)
      ) {
        return;
      }

      event.preventDefault();
      startCanvasAiChatHold(
        canvasAiChatPointerRef.current ?? {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        },
      );
    }

    function cancelCanvasAiChatWithShortcut(event: KeyboardEvent) {
      if (shouldIgnoreCanvasAiChatShortcut(event)) return;

      event.preventDefault();
      cancelCanvasAiChatHold();
    }

    window.addEventListener("keydown", startCanvasAiChatWithShortcut, true);
    window.addEventListener("keyup", cancelCanvasAiChatWithShortcut, true);
    return () => {
      window.removeEventListener("keydown", startCanvasAiChatWithShortcut, true);
      window.removeEventListener("keyup", cancelCanvasAiChatWithShortcut, true);
    };
  }, []);

  useEffect(() => {
    function shouldIgnorePiloEraserShortcut(event: KeyboardEvent) {
      const editor = editorRef.current;

      return (
        !editor ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.key.toLowerCase() !== "e" ||
        isCanvasEditableShortcutTarget(event.target) ||
        !editor.getIsFocused()
      );
    }

    function activatePiloEraserWithShortcut(event: KeyboardEvent) {
      if (event.repeat || shouldIgnorePiloEraserShortcut(event)) return;

      const editor = editorRef.current;

      if (!editor) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      activatePiloEraser(editor);
    }

    window.addEventListener("keydown", activatePiloEraserWithShortcut, true);
    return () => {
      window.removeEventListener(
        "keydown",
        activatePiloEraserWithShortcut,
        true,
      );
    };
  }, []);

  useEffect(() => {
    function cancelPiloEraserWithEscape(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key !== "Escape" ||
        isCanvasEditableShortcutTarget(event.target) ||
        !piloEraserActiveRef.current
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      deactivatePiloEraser();
    }

    window.addEventListener("keydown", cancelPiloEraserWithEscape, true);
    return () => {
      window.removeEventListener("keydown", cancelPiloEraserWithEscape, true);
    };
  }, []);

  useEffect(() => {
    if (!isCanvasAiChatVisible) return undefined;

    function closeCanvasAiChatWithEscape(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      cancelCanvasAiChatHold();
      setCanvasAiChatAnchor(null);
    }

    window.addEventListener("keydown", closeCanvasAiChatWithEscape, true);
    return () => {
      window.removeEventListener("keydown", closeCanvasAiChatWithEscape, true);
    };
  }, [isCanvasAiChatVisible]);

  function mountEditor(editor: Editor) {
    editorRef.current = editor;
    setCanvasEditor(editor);
    canvasWheelCleanupRef.current?.();

    const canvasContainer = editor.getContainer();
    canvasContainer.addEventListener("wheel", handleCanvasWheel, {
      capture: true,
      passive: false,
    });
    canvasWheelCleanupRef.current = () => {
      canvasContainer.removeEventListener("wheel", handleCanvasWheel, {
        capture: true,
      });
    };

    registerCanvasEditorSideEffects(
      editor,
      piloDefaultArrowKindHydrationGuardRef,
    );
    hydrateFreeformShapes(
      editor,
      getCommittedFreeformShapeSnapshots(),
      pendingArrowBindingsRef,
      piloDefaultArrowKindHydrationGuardRef,
    );
    resetClassicCanvasCamera(editor);

    onReady({
      markUiEventAsHandled(event) {
        editor.markEventAsHandled(event);
        event.stopPropagation();
      },
      openCanvasAiChat(anchor) {
        deactivatePiloEraser(editor);
        returnToSelectAfterPlacementRef.current = false;
        editor.cancel();
        editor.setCurrentTool("select.idle");
        openCanvasAiChatAt(anchor);
      },
      selectTool(tool) {
        deactivatePiloEraser(editor);
        editor.cancel();
        editor.updateInstanceState({ isToolLocked: false });

        if (tool === "frame" || tool === "text") {
          returnToSelectAfterPlacementRef.current = false;

          if (
            createPiloCanvasShapeInEmptyViewport({
              editor,
              request: { type: tool },
            })
          ) {
            onOneShotToolCreatedRef.current?.();
          }

          return;
        }

        returnToSelectAfterPlacementRef.current =
          tool !== "select" &&
          tool !== "hand" &&
          !connectionTools.has(tool);
        editor.setCurrentTool(tool === "select" ? "select.idle" : tool);
      },
      selectDrawingPreset(preset) {
        if (preset === "eraser") {
          activatePiloEraser(editor);
          return;
        }

        deactivatePiloEraser(editor);
        const shouldKeepDrawing = preset === "pen" || preset === "highlight";
        returnToSelectAfterPlacementRef.current = !shouldKeepDrawing;
        editor.cancel();
        editor.updateInstanceState({ isToolLocked: shouldKeepDrawing });

        if (preset === "highlight") {
          editor.setStyleForNextShapes(DefaultSizeStyle, "xl");
          editor.setCurrentTool("highlight");
          return;
        }

        const geoStyle = piloGeoStyleByDrawingPreset[preset];
        if (geoStyle) {
          editor.setStyleForNextShapes(GeoShapeGeoStyle, geoStyle);

          if (
            createPiloCanvasShapeInEmptyViewport({
              editor,
              request: {
                geo: geoStyle,
                preset: preset as Exclude<
                  PiloDrawingPreset,
                  "pen" | "highlight" | "eraser"
                >,
                type: "geo",
              },
            })
          ) {
            onOneShotToolCreatedRef.current?.();
          }

          return;
        }

        editor.setStyleForNextShapes(DefaultDashStyle, "draw");
        editor.setStyleForNextShapes(DefaultSizeStyle, "m");
        editor.setCurrentTool("draw");
      },
      setColor(color) {
        if (color === "default") {
          const { [DefaultColorStyle.id]: _color, ...stylesForNextShape } =
            editor.getInstanceState().stylesForNextShape;
          const selectedShapeColorUpdates = editor
            .getSelectedShapes()
            .flatMap((shape) => {
              const defaultProps = editor.getShapeUtil(shape).getDefaultProps();

              if (!("color" in defaultProps) || !("color" in shape.props)) {
                return [];
              }

              return [
                {
                  id: shape.id,
                  type: shape.type,
                  props: { color: defaultProps.color },
                } as unknown as TLShapePartial,
              ];
            });

          editor.updateInstanceState({ stylesForNextShape });

          if (selectedShapeColorUpdates.length) {
            editor.updateShapes(selectedShapeColorUpdates);
          }

          return;
        }

        editor.setStyleForNextShapes(DefaultColorStyle, color);

        if (editor.getSelectedShapeIds().length) {
          editor.setStyleForSelectedShapes(DefaultColorStyle, color);
        }
      },
      setFill(fill) {
        editor.setStyleForNextShapes(DefaultFillStyle, fill);

        if (editor.getSelectedShapeIds().length) {
          editor.setStyleForSelectedShapes(DefaultFillStyle, fill);
        }
      },
      setDash(dash) {
        editor.setStyleForNextShapes(DefaultDashStyle, dash);

        if (editor.getSelectedShapeIds().length) {
          editor.setStyleForSelectedShapes(DefaultDashStyle, dash);
        }
      },
      setSize(size) {
        editor.setStyleForNextShapes(DefaultSizeStyle, size);

        if (editor.getSelectedShapeIds().length) {
          editor.setStyleForSelectedShapes(DefaultSizeStyle, size);
        }
      },
      setOpacity(opacity) {
        const nextOpacity = Math.min(1, Math.max(0.1, opacity));

        editor.setOpacityForNextShapes(nextOpacity);

        if (editor.getSelectedShapeIds().length) {
          editor.setOpacityForSelectedShapes(nextOpacity);
        }
      },
      getStyleState() {
        const sharedStyles = editor.getSharedStyles();
        const sharedDash = sharedStyles.get(DefaultDashStyle);
        const sharedFill = sharedStyles.get(DefaultFillStyle);
        const sharedSize = sharedStyles.get(DefaultSizeStyle);
        const sharedOpacity = editor.getSharedOpacity();
        const dash =
          sharedDash?.type === "shared"
            ? sharedDash.value
            : sharedDash?.type === "mixed"
              ? null
              : editor.getStyleForNextShape(DefaultDashStyle);
        const fill =
          sharedFill?.type === "shared"
            ? sharedFill.value
            : sharedFill?.type === "mixed"
              ? null
              : editor.getStyleForNextShape(DefaultFillStyle);
        const size =
          sharedSize?.type === "shared"
            ? sharedSize.value
            : sharedSize?.type === "mixed"
              ? null
              : editor.getStyleForNextShape(DefaultSizeStyle);

        return {
          dash:
            dash === "draw" ||
            dash === "dashed" ||
            dash === "dotted" ||
            dash === "solid"
              ? dash
              : null,
          fill:
            fill === "none" ||
            fill === "semi" ||
            fill === "solid" ||
            fill === "fill"
              ? fill
              : null,
          opacity:
            sharedOpacity.type === "shared" ? sharedOpacity.value : null,
          size,
        };
      },
      createNote() {
        deactivatePiloEraser(editor);
        returnToSelectAfterPlacementRef.current = false;
        editor.cancel();
        editor.updateInstanceState({ isToolLocked: false });

        if (
          createPiloCanvasShapeInEmptyViewport({
            editor,
            request: { type: "note" },
          })
        ) {
          onOneShotToolCreatedRef.current?.();
        }
      },
      createCodeBlock() {
        deactivatePiloEraser(editor);
        returnToSelectAfterPlacementRef.current = false;
        editor.cancel();
        editor.setCurrentTool("select.idle");
        const result = placePiloCanvasShapeInEmptyViewport({
          editor,
          index: createdLocalCardsRef.current + 1,
          placementRequest: { type: "code" },
        });

        if (result.placed) {
          createdLocalCardsRef.current += result.createdCount;
          onOneShotToolCreatedRef.current?.();
        }
      },
      createInsertableShape(tool, url) {
        deactivatePiloEraser(editor);
        returnToSelectAfterPlacementRef.current = false;
        editor.cancel();
        editor.setCurrentTool("select.idle");
        const result = placePiloCanvasShapeInEmptyViewport({
          editor,
          index: createdLocalCardsRef.current + 1,
          placementRequest: { type: tool, url },
        });

        if (result.placed) {
          createdLocalCardsRef.current += result.createdCount;
          onOneShotToolCreatedRef.current?.();
        }
      },
      createDriveFileShape(file) {
        deactivatePiloEraser(editor);
        returnToSelectAfterPlacementRef.current = false;
        editor.cancel();
        editor.setCurrentTool("select.idle");
        const result = placePiloCanvasShapeInEmptyViewport({
          editor,
          index: createdLocalCardsRef.current + 1,
          placementRequest: { type: "drive-file", file },
        });

        if (result.placed) {
          createdLocalCardsRef.current += result.createdCount;
          onOneShotToolCreatedRef.current?.();
        }
      },
      groupSelection() {
        const selectedShapeIds = editor.getSelectedShapeIds();

        if (selectedShapeIds.length < 2) return;

        editor.groupShapes(selectedShapeIds);
      },
      performSelectionAction(action) {
        if (action === "select-all") {
          editor.selectAll();
          return;
        }

        const selectedShapeIds = editor.getSelectedShapeIds();
        if (!selectedShapeIds.length) return;

        switch (action) {
          case "duplicate":
            editor.duplicateShapes(selectedShapeIds, { x: 16, y: 16 });
            break;
          case "group":
            if (selectedShapeIds.length > 1) {
              editor.groupShapes(selectedShapeIds);
            }
            break;
          case "ungroup":
            editor.ungroupShapes(selectedShapeIds);
            break;
          case "bring-to-front":
            editor.bringToFront(selectedShapeIds);
            break;
          case "send-to-back":
            editor.sendToBack(selectedShapeIds);
            break;
          case "align-left":
            editor.alignShapes(selectedShapeIds, "left");
            break;
          case "align-center":
            editor.alignShapes(selectedShapeIds, "center-horizontal");
            break;
          case "align-right":
            editor.alignShapes(selectedShapeIds, "right");
            break;
          case "align-top":
            editor.alignShapes(selectedShapeIds, "top");
            break;
          case "align-middle":
            editor.alignShapes(selectedShapeIds, "center-vertical");
            break;
          case "align-bottom":
            editor.alignShapes(selectedShapeIds, "bottom");
            break;
          case "distribute-horizontal":
            editor.distributeShapes(selectedShapeIds, "horizontal");
            break;
          case "distribute-vertical":
            editor.distributeShapes(selectedShapeIds, "vertical");
            break;
        }
      },
      async exportCanvas(format, scope, background) {
        const shapeIds =
          scope === "selection"
            ? editor.getSelectedShapeIds()
            : [...editor.getCurrentPageShapeIds()];

        if (!shapeIds.length) return false;

        await exportAs(editor, shapeIds, {
          background,
          format,
          name: getCanvasExportName(board.title),
        });
        return true;
      },
      setUserPreference(preference, enabled) {
        switch (preference) {
          case "paste-at-cursor":
            editor.user.updateUserPreferences({
              isPasteAtCursorMode: enabled,
            });
            break;
          case "wrap-text":
            editor.user.updateUserPreferences({ isWrapMode: enabled });
            break;
          case "reduce-motion":
            editor.user.updateUserPreferences({
              animationSpeed: enabled ? 0 : 1,
            });
            break;
        }

        return getCanvasUserPreferences(editor);
      },
      getUserPreferences() {
        return getCanvasUserPreferences(editor);
      },
      setSmartGuidesEnabled(enabled) {
        editor.user.updateUserPreferences({ isSnapMode: enabled });
        editor.updateInstanceState({ isGridMode: enabled });
      },
      clearSelection() {
        deactivatePiloEraser(editor);
        returnToSelectAfterPlacementRef.current = false;
        editor.selectNone();
      },
      deleteSelection() {
        deleteSelectedShapes(editor);
      },
      fit() {
        editor.zoomToFit({ animation: { duration: 180 } });
      },
      zoomIn() {
        editor.zoomIn(editor.getViewportScreenCenter(), {
          animation: { duration: 120 },
        });
      },
      zoomOut() {
        editor.zoomOut(editor.getViewportScreenCenter(), {
          animation: { duration: 120 },
        });
      },
      undo() {
        editor.undo();
      },
      redo() {
        editor.redo();
      },
    });
  }

  useEffect(() => {
    return () => {
      canvasWheelCleanupRef.current?.();
      canvasWheelCleanupRef.current = null;
      onReady(null);
    };
  }, [onReady]);

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      const editor = editorRef.current;

      if (!editor || event.isPrimary === false) return;

      updateTrashDropZoneAttraction(editor, event);
    }

    function handlePointerUp(event: globalThis.PointerEvent) {
      const editor = editorRef.current;

      if (!editor || event.isPrimary === false) return;
      clearTrashDropZoneAttraction();

      if (
        returnToSelectAfterPlacementRef.current &&
        !(event.target instanceof Element && event.target.closest(".canvas-tool-rail"))
      ) {
        window.requestAnimationFrame(() => {
          if (!returnToSelectAfterPlacementRef.current) return;

          returnToSelectAfterPlacementRef.current = false;
          editor.setCurrentTool("select.idle");
          onOneShotToolCreatedRef.current?.();
        });
      }

      if (!isPointerInsideTrashDropZone(event)) return;

      const selectedShapeIds = editor.getSelectedShapeIds();
      if (!selectedShapeIds.length) return;

      window.requestAnimationFrame(() => {
        editor.deleteShapes(selectedShapeIds);
      });
    }

    window.addEventListener("pointermove", handlePointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", clearTrashDropZoneAttraction, {
      capture: true,
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", handlePointerUp, {
        capture: true,
      });
      window.removeEventListener("pointercancel", clearTrashDropZoneAttraction, {
        capture: true,
      });
      clearTrashDropZoneAttraction();
    };
  }, []);

  function handleCanvasWheel(event: globalThis.WheelEvent) {
    const editor = editorRef.current;

    if (!editor) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".pilo-code-block input, .pilo-code-block select, .pilo-code-mirror",
      )
    ) {
      return;
    }

    const deltaMultiplier =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
    const normalizedDelta = event.deltaY * deltaMultiplier;
    const cursorPagePoint = editor.screenToPage({
      x: event.clientX,
      y: event.clientY,
    });

    event.preventDefault();
    event.stopPropagation();

    const currentCamera = editor.getCamera();
    const nextZoom = Math.min(
      8,
      Math.max(0.12, currentCamera.z * Math.exp(-normalizedDelta * 0.0012)),
    );

    if (Math.abs(nextZoom - currentCamera.z) < 0.001) return;

    const viewportBounds = editor.getViewportScreenBounds();

    editor.setCamera({
      x: (event.clientX - viewportBounds.x) / nextZoom - cursorPagePoint.x,
      y: (event.clientY - viewportBounds.y) / nextZoom - cursorPagePoint.y,
      z: nextZoom,
    });
  }

  function handleCanvasPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    if (
      event.target instanceof Element &&
      event.target.closest(".canvas-ai-chat, .canvas-coordinate-hud")
    ) {
      return;
    }

    const editor = editorRef.current;

    if (!editor || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".pilo-frame-toolbar, .pilo-code-block input, .pilo-code-block select, .pilo-code-mirror",
      )
    ) {
      return;
    }

    if (handlePiloEraserPointerDown(event, editor)) {
      return;
    }

    const pagePoint = editor.screenToPage({
      x: event.clientX,
      y: event.clientY,
    });

    // Frame and shape detail selection are select-tool affordances. Let an
    // active drawing tool receive its first click so an arrow can start from
    // a frame instead of the frame stealing that click.
    const currentToolId = editor.getCurrentToolId();
    const isSelectTool =
      currentToolId === "select" || currentToolId.startsWith("select.");

    if (!isSelectTool) {
      return;
    }

    const directShape =
      getVisibleFrameHeadingShape(editor, event.target) ??
      editor.getShapeAtPoint(pagePoint, {
        hitInside: true,
        hitLabels: true,
        hitLocked: true,
      });
    // Frames are filled hit targets, so getShapeAtPoint can return the frame
    // even when the pointer is directly on an arrow inside it. Prefer the
    // arrow here so a connector remains selectable.
    const pointedShape = getArrowAtPoint(editor, pagePoint) ?? directShape;

    if (isPiloCodeBlockShape(pointedShape)) {
      if (!editor.getSelectedShapeIds().includes(pointedShape.id)) {
        editor.setCurrentTool("select");
        editor.select(pointedShape.id);
      }

      return;
    }

    if (pointedShape && !isPiloFrameShape(pointedShape)) {
      return;
    }

    const frameShape = isPiloFrameShape(pointedShape)
      ? pointedShape
      : editor.getShapeAtPoint(pagePoint, {
          filter: isPiloFrameShape,
          hitFrameInside: true,
          hitLabels: true,
          hitLocked: true,
        });

    if (!isPiloFrameShape(frameShape)) return;
    if (
      !frameShape.isLocked &&
      editor.getSelectedShapeIds().includes(frameShape.id)
    ) {
      return;
    }

    editor.setCurrentTool("select");
    editor.select(frameShape.id);

    if (!frameShape.isLocked) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  function trackCanvasAiChatPointer(event: PointerEvent<HTMLDivElement>) {
    canvasAiChatPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleCanvasPointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
    if (handlePiloEraserPointerMove(event)) return;

    trackCanvasAiChatPointer(event);
  }

  function handleCanvasPointerUpCapture(event: PointerEvent<HTMLDivElement>) {
    handlePiloEraserPointerEnd(event);
  }

  function handleCanvasPointerCancelCapture(event: PointerEvent<HTMLDivElement>) {
    handlePiloEraserPointerEnd(event);
  }

  function startCanvasAiChatHold(position: CanvasAiChatAnchor) {
    cancelCanvasAiChatHold();
    setCanvasAiChatAnchor(null);
    canvasAiChatHoldPositionRef.current = position;
    canvasAiChatHoldStartedAtRef.current = window.performance.now();
    setCanvasAiChatHoldProgress({ ...position, progress: 0 });

    function updateHoldProgress(timestamp: number) {
      const startedAt = canvasAiChatHoldStartedAtRef.current ?? timestamp;
      const holdPosition = canvasAiChatHoldPositionRef.current;

      if (!holdPosition) return;

      const progress = Math.min(
        1,
        (timestamp - startedAt) / CANVAS_AI_CHAT_HOLD_MS,
      );
      setCanvasAiChatHoldProgress({ ...holdPosition, progress });

      if (progress < 1) {
        canvasAiChatHoldFrameRef.current = window.requestAnimationFrame(
          updateHoldProgress,
        );
        return;
      }

      canvasAiChatHoldFrameRef.current = null;
      canvasAiChatHoldStartedAtRef.current = null;
      canvasAiChatHoldPositionRef.current = null;
      setCanvasAiChatHoldProgress(null);
      setCanvasAiChatAnchor(holdPosition);
    }

    canvasAiChatHoldFrameRef.current = window.requestAnimationFrame(
      updateHoldProgress,
    );
  }

  function cancelCanvasAiChatHold() {
    if (canvasAiChatHoldFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasAiChatHoldFrameRef.current);
      canvasAiChatHoldFrameRef.current = null;
    }

    canvasAiChatHoldStartedAtRef.current = null;
    canvasAiChatHoldPositionRef.current = null;
    setCanvasAiChatHoldProgress(null);
  }

  function openCanvasAiChatAt(anchor: CanvasAiChatAnchor) {
    cancelCanvasAiChatHold();
    setCanvasAiChatAnchor((currentAnchor) => {
      if (currentAnchor) return null;

      return anchor;
    });
  }

  return (
    <CanvasDriveFileProvider workspaceId={board.workspaceId}>
      <div
        className={`relative h-full${isPiloEraserActive ? " is-pilo-eraser-active" : ""}`}
        onPointerCancelCapture={handleCanvasPointerCancelCapture}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerMoveCapture={handleCanvasPointerMoveCapture}
        onPointerUpCapture={handleCanvasPointerUpCapture}
      >
        <CanvasRemotePresenceProvider presence={presence?.remotePresence ?? []}>
          <CanvasRemoteShapePreviewProvider
            previewStore={presence?.remoteShapePreviewStore ?? null}
          >
            <TldrawSurface
              className="pilo-tldraw-canvas"
              components={tldrawComponents}
              hideUi
              licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
              onMount={mountEditor}
              shapeUtils={piloCanvasShapeUtils}
            >
              <CanvasWorkspaceLocationAdapter canvasId={board.id} />
              <CanvasAgentDeepLinkHandler
                canvasId={board.id}
                onDriveFileInsert={handleCanvasAgentDriveFileInsert}
                onFrameSubtreeRequest={onFrameSubtreeRequest}
                workspaceId={board.workspaceId}
              />
              <CanvasLocalInteractionReporter
                onChange={handleLocalInteractionChange}
              />
              <CanvasStateReporter
                onFreeformShapesChange={onFreeformShapesChange}
                onFreeformShapesDraftChange={handleFreeformShapesDraftChange}
                onResolveFreeformShapeSnapshot={resolveRealtimePreviewSnapshot}
                onViewChange={onViewChange}
                onViewportBoundsChange={onViewportBoundsChange}
              />
              <CanvasRealtimePreviewApplier
                getCommittedShapes={getPublishedFreeformShapeSnapshots}
                isShapePatchProtected={isShapePatchProtected}
                originalShapesRef={remotePreviewOriginalShapesRef}
                previewShapeIdsRef={remotePreviewShapeIdsRef}
                previewStore={presence?.remoteShapePreviewStore}
                protectionVersion={localInteractionVersion}
              />
              <CanvasHistoryStateReporter
                onHistoryStateChange={onHistoryStateChange}
              />
              <CanvasCameraCoordinateHud />
              <CanvasFileDropImporter />
              {presence?.enabled ? (
                <CanvasPresenceReporter presence={presence} />
              ) : null}
              {presence ? (
                <RemoteCursorOverlay
                  currentUserId={presence.currentUserId}
                  cursorStore={presence.remoteCursorStore}
                  presence={presence.remotePresence}
                />
              ) : null}
              <CanvasSnapStateReporter onSnapStateChange={onSnapStateChange} />
              <SelectedShapeStackingManager />
              <SelectedGroupToolbar />
              {loadingFrameIds.size ? (
                <CanvasFrameLazyLoadingOverlay loadingFrameIds={loadingFrameIds} />
              ) : null}
              <FrameSelectionToolbar />
            </TldrawSurface>
          </CanvasRemoteShapePreviewProvider>
        </CanvasRemotePresenceProvider>
        <CanvasAiChatOverlay
          anchor={canvasAiChatAnchor}
          artifact={canvasAgent.artifact}
          draft={canvasAgent.draft}
          error={canvasAgent.error}
          holdProgress={canvasAiChatHoldProgress}
          isRunning={canvasAgent.isRunning}
          layoutStorageKey={`pilo:canvas-ai-chat-layout:${board.id}`}
          onApplyDraft={canvasAgent.applyDraft}
          onClose={() => setCanvasAiChatAnchor(null)}
          onDiscardDraft={canvasAgent.discardDraft}
          onSubmit={canvasAgent.submit}
          statusMessage={canvasAgent.message}
        />
        <CanvasAgentVisualOverlay
          draft={canvasAgent.draft}
          editor={canvasEditor}
          playbackEnabled={canvasAgent.presentationMode !== "background"}
          progress={canvasAgent.progress}
        />
      </div>
    </CanvasDriveFileProvider>
  );
}
