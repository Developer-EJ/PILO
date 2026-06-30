"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  Tldraw,
  useEditor,
  type Editor,
  type TLCreateShapePartial,
  type TLShape,
  type TLShapeId,
} from "tldraw";
import { useValue } from "@tldraw/state-react";
import {
  PiloCardShapeUtil,
  type PiloCardKind,
  type PiloCardShape,
} from "./PiloCardShapeUtil";
import { PiloCanvasBackground } from "./PiloCanvasBackground";
import {
  PiloCodeBlockShapeUtil,
  type PiloCodeBlockShape,
} from "./PiloCodeBlockShapeUtil";
import {
  PiloStickyNoteShapeUtil,
  type PiloStickyNoteColor,
  type PiloStickyNoteShape,
} from "./PiloStickyNoteShapeUtil";
import { SelectedShapeStackingManager } from "./PiloCanvasStackingManager";
import {
  applyPiloSmartSnap,
  SmartGuidesOverlay,
} from "./PiloCanvasSmartGuides";
import {
  isPiloCardShape,
  isPiloCodeBlockShape,
  isPiloConnectionArrow,
  isPiloFrameShape,
  type PiloArrowPartial,
  type PiloArrowShape,
} from "./PiloCanvasShapeGuards";
import { scrollPiloCodeBlockAtPoint } from "./PiloCodeBlockScroll";
import {
  FrameSelectionToolbar,
  normalizeBlankFrameName,
  PiloFrameShapeUtil,
  resolveNextFrameName,
} from "./PiloFrameSelectionToolbar";

type CanvasEntity = {
  id?: string;
  entityType: string;
  entityId: string;
  displayTitle: string;
  shapeType: string;
  width?: number;
  height?: number;
  color?: string;
  body?: string;
  authorId?: string | null;
  authorName?: string | null;
  createdByMemberId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  position?: {
    x: number;
    y: number;
  };
};

type CanvasConnection = {
  id: string;
  sourceShapeId: string;
  targetShapeId: string;
  connectionType: string;
  label: string | null;
};

type CanvasBoardDetail = {
  id: string;
  title: string;
  shapeCount: number;
  connectionCount: number;
  shapes: CanvasEntity[];
  connections: CanvasConnection[];
};

type CanvasViewSetting = {
  zoom: number;
  viewportX: number;
  viewportY: number;
};

type WorkspaceDashboard = {
  workspace: {
    name: string;
  };
};

export type PiloCanvasShapeState = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};
export type PiloCanvasFreeformShape = TLCreateShapePartial<TLShape>;

export type PiloCanvasSelection = {
  canvasShapeId: string;
  entityType: string;
  entityId: string;
  kind: PiloCardKind;
  title: string;
  subtitle: string;
  body: string;
  status: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

type PiloCanvasCardSnapshot = NonNullable<PiloCanvasSelection>;

export type PiloCanvasTool =
  | "select"
  | "hand"
  | "draw"
  | "text"
  | "arrow"
  | "frame"
  | "code";

export type PiloDrawingPreset =
  | "pen"
  | "highlight"
  | "eraser"
  | "frame"
  | "rectangle"
  | "circle"
  | "black"
  | "red"
  | "yellow"
  | "green"
  | "blue"
  | "violet";

const piloDrawingColorPresets = [
  "black",
  "red",
  "yellow",
  "green",
  "blue",
  "violet",
] as const;

function isPiloDrawingColorPreset(
  preset: PiloDrawingPreset,
): preset is (typeof piloDrawingColorPresets)[number] {
  return piloDrawingColorPresets.includes(
    preset as (typeof piloDrawingColorPresets)[number],
  );
}

export type PiloCanvasActions = {
  selectTool: (tool: PiloCanvasTool) => void;
  selectDrawingPreset: (preset: PiloDrawingPreset) => void;
  createEntityCard: (kind: PiloCardKind) => void;
  createStickyNote: (color?: PiloStickyNoteColor) => void;
  createStickyStack: (color?: PiloStickyNoteColor) => void;
  createCodeBlock: () => void;
  clearSelection: () => void;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  undo: () => void;
  redo: () => void;
};

type PiloTldrawCanvasProps = {
  board: CanvasBoardDetail;
  dashboard: WorkspaceDashboard;
  hasStoredViewSetting: boolean;
  hydrationVersion: number;
  freeformShapes: PiloCanvasFreeformShape[];
  shapeStateById: Record<string, PiloCanvasShapeState>;
  viewSetting: CanvasViewSetting;
  onReady: (actions: PiloCanvasActions | null) => void;
  onSelectionChange: (selection: PiloCanvasSelection) => void;
  onShapesChange: (
    shapeStateById: Record<string, PiloCanvasShapeState>,
  ) => void;
  onFreeformShapesChange: (shapes: PiloCanvasFreeformShape[]) => void;
  onViewChange: (viewSetting: CanvasViewSetting) => void;
};

type PiloStickyNotePartial = TLCreateShapePartial<PiloStickyNoteShape> & {
  id: TLShapeId;
};
type PiloCodeBlockPartial = TLCreateShapePartial<PiloCodeBlockShape> & {
  id: TLShapeId;
};
type PiloPlacementRequest =
  | {
      type: "card";
      kind: PiloCardKind;
    }
  | {
      type: "sticky";
      color?: PiloStickyNoteColor;
    }
  | {
      type: "sticky-stack";
      color?: PiloStickyNoteColor;
    }
  | {
      type: "code";
    };

const shapeUtils = [
  PiloCardShapeUtil,
  PiloFrameShapeUtil,
  PiloStickyNoteShapeUtil,
  PiloCodeBlockShapeUtil,
];
const tldrawComponents = {
  Background: PiloCanvasBackground,
};

const autoLayoutPositions = [
  { x: 120, y: 120 },
  { x: 500, y: 150 },
  { x: 260, y: 390 },
  { x: 780, y: 330 },
  { x: 640, y: 560 },
  { x: 1040, y: 160 },
];

const defaultAccents: Record<PiloCardKind, string> = {
  task: "#e5484d",
  pull_request: "#d9941f",
  meeting_report: "#2e9e5b",
  github_issue: "#6d5bd6",
  document: "#5b6478",
  file: "#6d5bd6",
  code: "#0f1422",
  decision: "#2e9e5b",
  risk: "#e5484d",
  memo: "#f4c950",
};

function normalizeKind(entity: CanvasEntity): PiloCardKind {
  const kind = entity.entityType || entity.shapeType;

  if (kind === "task") return "task";
  if (kind === "pull_request") return "pull_request";
  if (kind === "meeting_report") return "meeting_report";
  if (kind === "github_issue") return "github_issue";
  if (kind === "document") return "document";
  if (kind === "file") return "file";
  if (kind === "code") return "code";
  if (kind === "decision") return "decision";
  if (kind === "memo") return "memo";
  if (kind === "risk") return "risk";

  return "file";
}

function resolveCardBody(kind: PiloCardKind) {
  if (kind === "task") return "Track the owner, status, and linked work.";
  if (kind === "pull_request") return "Review state and code review context.";
  if (kind === "meeting_report") return "Decisions, risks, and action items.";
  if (kind === "github_issue") return "GitHub issue context for the task.";
  if (kind === "risk") return "Delayed or blocked project risk.";
  if (kind === "memo") return "A local note on this canvas.";

  return "Project object summary and connection id.";
}

function resolveStatus(kind: PiloCardKind) {
  if (kind === "pull_request") return "Review";
  if (kind === "meeting_report") return "Report";
  if (kind === "risk") return "Risk";
  if (kind === "memo") return "Note";

  return "Open";
}

function formatMemoSubtitle(entity: CanvasEntity) {
  const author =
    entity.authorName ?? entity.createdByMemberId ?? entity.authorId ?? "작성자";

  if (!entity.createdAt) return `memo / ${author}`;

  return `memo / ${author} / ${entity.createdAt}`;
}

function resolvePosition(entity: CanvasEntity, index: number) {
  if (entity.position) return entity.position;

  return (
    autoLayoutPositions[index] ?? {
      x: 120 + (index % 4) * 360,
      y: 120 + Math.floor(index / 4) * 260,
    }
  );
}

function safeShapeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getCanvasShapeId(entity: CanvasEntity, index: number) {
  return entity.id ?? `${entity.entityType}-${entity.entityId}-${index}`;
}

function getCardShapeId(entity: CanvasEntity, index: number) {
  return createShapeId(`pilo-${safeShapeId(getCanvasShapeId(entity, index))}`);
}

function getConnectionShapeId(connection: CanvasConnection) {
  return createShapeId(`pilo-connection-${safeShapeId(connection.id)}`);
}

function buildPiloCardShape(
  entity: CanvasEntity,
  index: number,
  shapeStateById: Record<string, PiloCanvasShapeState>,
): TLCreateShapePartial<PiloCardShape> {
  const kind = normalizeKind(entity);
  const canvasShapeId = getCanvasShapeId(entity, index);
  const savedState = shapeStateById[canvasShapeId];
  const position = savedState ?? resolvePosition(entity, index);
  const accent = entity.color ?? defaultAccents[kind] ?? defaultAccents.file;
  const body =
    kind === "memo"
      ? entity.body ?? entity.displayTitle
      : entity.body ?? resolveCardBody(kind);

  return {
    id: getCardShapeId(entity, index),
    type: "pilo-card",
    x: position.x,
    y: position.y,
    props: {
      w:
        savedState?.width ??
        entity.width ??
        (kind === "pull_request" ? 308 : 288),
      h:
        savedState?.height ??
        entity.height ??
        (kind === "pull_request" ? 174 : 164),
      kind,
      canvasShapeId,
      entityType: entity.entityType,
      title: entity.displayTitle,
      subtitle:
        kind === "memo"
          ? formatMemoSubtitle(entity)
          : `${kind.replace(/_/g, " ")} / ${entity.shapeType}`,
      body,
      status: resolveStatus(kind),
      accent,
      entityId: entity.entityId,
    },
  };
}

function createLocalCard(
  kind: PiloCardKind,
  index: number,
  dashboard: WorkspaceDashboard,
  position: { x: number; y: number },
): TLCreateShapePartial<PiloCardShape> {
  const canvasShapeId = `local-${kind}-${Date.now()}`;
  const id = createShapeId(`pilo-${canvasShapeId}`);
  const width = kind === "memo" ? 240 : 288;
  const height = kind === "memo" ? 152 : 164;

  return {
    id,
    type: "pilo-card",
    x: position.x - width / 2,
    y: position.y - height / 2,
    props: {
      w: width,
      h: height,
      kind,
      canvasShapeId,
      entityType: kind,
      title: kind === "memo" ? "New note" : `New ${kind.replace(/_/g, " ")}`,
      subtitle: dashboard.workspace.name,
      body: resolveCardBody(kind),
      status: resolveStatus(kind),
      accent: defaultAccents[kind] ?? defaultAccents.file,
      entityId: "local-draft",
    },
  };
}

function createStickyNoteShape(
  index: number,
  position: { x: number; y: number },
  color: PiloStickyNoteColor = "butter",
): PiloStickyNotePartial {
  const width = 156;
  const height = 148;
  const offset = index * 10;

  return {
    id: createShapeId(`pilo-sticky-${Date.now()}-${index}`),
    type: "pilo-sticky-note",
    x: position.x - width / 2 + offset,
    y: position.y - height / 2 + offset,
    props: {
      w: width,
      h: height,
      color,
      text: "",
    },
  };
}

function createCodeBlockShape(
  index: number,
  position: { x: number; y: number },
): PiloCodeBlockPartial {
  const width = 420;
  const height = 260;

  return {
    id: createShapeId(`pilo-code-${Date.now()}-${index}`),
    type: "pilo-code-block",
    x: position.x - width / 2,
    y: position.y - height / 2,
    props: {
      w: width,
      h: height,
      fileName: "canvas-node.tsx",
      language: "tsx",
      code: "export function CanvasNode() {\n  return <div>PILO</div>;\n}",
      scrollY: 0,
    },
  };
}

function isLocalPiloCardShape(shape: TLShape) {
  return (
    isPiloCardShape(shape) &&
    typeof shape.props.canvasShapeId === "string" &&
    shape.props.canvasShapeId.startsWith("local-")
  );
}

function isPersistableFreeformShape(shape: TLShape) {
  if (isPiloConnectionArrow(shape)) return false;
  if (isPiloCardShape(shape)) return isLocalPiloCardShape(shape);

  return true;
}

function toFreeformSnapshot(shape: TLShape): PiloCanvasFreeformShape {
  return JSON.parse(JSON.stringify(shape)) as PiloCanvasFreeformShape;
}

function sortFreeformShapesForCreate(shapes: PiloCanvasFreeformShape[]) {
  return [...shapes].sort((first, second) => {
    const firstParent =
      first.type === "frame" || first.type === "pilo-code-block";
    const secondParent =
      second.type === "frame" || second.type === "pilo-code-block";

    if (firstParent === secondParent) return 0;

    return firstParent ? -1 : 1;
  });
}

function toCardSnapshot(shape: PiloCardShape) {
  return {
    canvasShapeId: shape.props.canvasShapeId,
    entityType: shape.props.entityType,
    entityId: shape.props.entityId,
    kind: shape.props.kind,
    title: shape.props.title,
    subtitle: shape.props.subtitle,
    body: shape.props.body,
    status: shape.props.status,
    x: shape.x,
    y: shape.y,
    width: shape.props.w,
    height: shape.props.h,
  };
}

function buildConnectionArrow(
  connection: CanvasConnection,
  cardsByCanvasShapeId: Map<string, ReturnType<typeof toCardSnapshot>>,
): PiloArrowPartial | null {
  const source = cardsByCanvasShapeId.get(connection.sourceShapeId);
  const target = cardsByCanvasShapeId.get(connection.targetShapeId);

  if (!source || !target) return null;

  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  };
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };

  return {
    id: getConnectionShapeId(connection),
    type: "arrow",
    x: sourceCenter.x,
    y: sourceCenter.y,
    meta: {
      piloConnectionId: connection.id,
    },
    props: {
      start: { x: 0, y: 0 },
      end: {
        x: targetCenter.x - sourceCenter.x,
        y: targetCenter.y - sourceCenter.y,
      },
      bend: 0,
      color: "violet",
      dash: "solid",
      size: "m",
      arrowheadEnd: "arrow",
    },
  };
}

function sameArrowPosition(current: PiloArrowShape, next: PiloArrowPartial) {
  return (
    Math.abs(current.x - (next.x ?? 0)) < 0.5 &&
    Math.abs(current.y - (next.y ?? 0)) < 0.5 &&
    Math.abs(current.props.end.x - (next.props?.end?.x ?? 0)) < 0.5 &&
    Math.abs(current.props.end.y - (next.props?.end?.y ?? 0)) < 0.5
  );
}

function buildCardSnapshotsKey(cardSnapshots: PiloCanvasCardSnapshot[]) {
  return cardSnapshots
    .map(
      (shape) =>
        `${shape.canvasShapeId}:${Math.round(shape.x)}:${Math.round(shape.y)}:${Math.round(shape.width)}:${Math.round(shape.height)}`,
    )
    .join("|");
}

function buildSelectedCardKey(selectedCard: PiloCanvasSelection) {
  if (!selectedCard) return "none";

  return `${selectedCard.canvasShapeId}:${Math.round(selectedCard.x)}:${Math.round(selectedCard.y)}:${Math.round(selectedCard.width)}:${Math.round(selectedCard.height)}:${selectedCard.status}`;
}

function CanvasStateReporter({
  board,
  onSelectionChange,
  onFreeformShapesChange,
  onShapesChange,
  onViewChange,
}: {
  board: CanvasBoardDetail;
  onSelectionChange: (selection: PiloCanvasSelection) => void;
  onFreeformShapesChange: (shapes: PiloCanvasFreeformShape[]) => void;
  onShapesChange: (
    shapeStateById: Record<string, PiloCanvasShapeState>,
  ) => void;
  onViewChange: (viewSetting: CanvasViewSetting) => void;
}) {
  const editor = useEditor();
  const cardSnapshotsRef = useRef<PiloCanvasCardSnapshot[]>([]);
  const freeformShapesRef = useRef<PiloCanvasFreeformShape[]>([]);
  const selectedCardRef = useRef<PiloCanvasSelection>(null);
  const viewSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeformSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shapeSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cardSnapshots = useValue(
    "pilo-card-snapshots",
    () =>
      editor.getCurrentPageShapes().filter(isPiloCardShape).map(toCardSnapshot),
    [editor],
  );
  const selectedCard = useValue(
    "pilo-selected-card",
    () => {
      const selectedShape = editor
        .getSelectedShapeIds()
        .map((shapeId) => editor.getShape(shapeId))
        .find((shape): shape is PiloCardShape =>
          Boolean(shape && isPiloCardShape(shape)),
        );

      return selectedShape ? toCardSnapshot(selectedShape) : null;
    },
    [editor],
  );
  const camera = useValue("pilo-camera-state", () => editor.getCamera(), [
    editor,
  ]);
  const freeformShapes = useValue(
    "pilo-freeform-shapes",
    () =>
      editor
        .getCurrentPageShapes()
        .filter(isPersistableFreeformShape)
        .map(toFreeformSnapshot),
    [editor],
  );
  const cardSnapshotsKey = useMemo(
    () => buildCardSnapshotsKey(cardSnapshots),
    [cardSnapshots],
  );
  const freeformShapesKey = useMemo(
    () => JSON.stringify(freeformShapes),
    [freeformShapes],
  );
  const selectedCardKey = useMemo(
    () => buildSelectedCardKey(selectedCard),
    [selectedCard],
  );

  useEffect(() => {
    cardSnapshotsRef.current = cardSnapshots;
    freeformShapesRef.current = freeformShapes;
    selectedCardRef.current = selectedCard;
  }, [cardSnapshots, freeformShapes, selectedCard]);

  useEffect(() => {
    if (selectionSyncTimerRef.current) {
      clearTimeout(selectionSyncTimerRef.current);
    }

    selectionSyncTimerRef.current = setTimeout(() => {
      selectionSyncTimerRef.current = null;
      onSelectionChange(selectedCardRef.current);
    }, 80);

    return () => {
      if (selectionSyncTimerRef.current) {
        clearTimeout(selectionSyncTimerRef.current);
      }
    };
  }, [onSelectionChange, selectedCardKey]);

  useEffect(() => {
    if (viewSyncTimerRef.current) {
      clearTimeout(viewSyncTimerRef.current);
    }

    const nextViewSetting = {
      zoom: camera.z,
      viewportX: camera.x,
      viewportY: camera.y,
    };

    viewSyncTimerRef.current = setTimeout(() => {
      viewSyncTimerRef.current = null;
      onViewChange(nextViewSetting);
    }, 140);

    return () => {
      if (viewSyncTimerRef.current) {
        clearTimeout(viewSyncTimerRef.current);
      }
    };
  }, [camera.x, camera.y, camera.z, onViewChange]);

  useEffect(() => {
    if (freeformSyncTimerRef.current) {
      clearTimeout(freeformSyncTimerRef.current);
    }

    freeformSyncTimerRef.current = setTimeout(() => {
      freeformSyncTimerRef.current = null;
      onFreeformShapesChange(freeformShapesRef.current);
    }, 220);

    return () => {
      if (freeformSyncTimerRef.current) {
        clearTimeout(freeformSyncTimerRef.current);
      }
    };
  }, [freeformShapesKey, onFreeformShapesChange]);

  useEffect(() => {
    if (shapeSyncTimerRef.current) {
      clearTimeout(shapeSyncTimerRef.current);
    }

    const nextShapeState = Object.fromEntries(
      cardSnapshotsRef.current.map((shape) => [
        shape.canvasShapeId,
        {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        },
      ]),
    );

    shapeSyncTimerRef.current = setTimeout(() => {
      shapeSyncTimerRef.current = null;
      onShapesChange(nextShapeState);
    }, 160);

    return () => {
      if (shapeSyncTimerRef.current) {
        clearTimeout(shapeSyncTimerRef.current);
      }
    };
  }, [cardSnapshotsKey, onShapesChange]);

  useEffect(() => {
    const cardsByCanvasShapeId = new Map(
      cardSnapshotsRef.current.map((shape) => [shape.canvasShapeId, shape]),
    );
    const nextArrows = board.connections
      .map((connection) =>
        buildConnectionArrow(connection, cardsByCanvasShapeId),
      )
      .filter((shape): shape is PiloArrowPartial => Boolean(shape));
    const nextArrowIds = new Set(nextArrows.map((shape) => shape.id));
    const currentArrows = editor
      .getCurrentPageShapes()
      .filter(isPiloConnectionArrow);
    const staleArrowIds = currentArrows
      .filter((shape) => !nextArrowIds.has(shape.id))
      .map((shape) => shape.id);
    const arrowsToCreate = nextArrows.filter(
      (shape) => !editor.getShape(shape.id as TLShapeId),
    );
    const arrowsToUpdate = nextArrows.filter((shape) => {
      const current = editor.getShape(shape.id as TLShapeId);

      return (
        current &&
        current.type === "arrow" &&
        !sameArrowPosition(current, shape)
      );
    });

    if (staleArrowIds.length) {
      editor.deleteShapes(staleArrowIds);
    }
    if (arrowsToCreate.length) {
      editor.createShapes(arrowsToCreate);
    }
    if (arrowsToUpdate.length) {
      editor.updateShapes(arrowsToUpdate);
    }
  }, [board.connections, cardSnapshotsKey, editor]);

  return null;
}

export function PiloTldrawCanvas({
  board,
  dashboard,
  freeformShapes,
  hasStoredViewSetting,
  hydrationVersion,
  shapeStateById,
  viewSetting,
  onReady,
  onFreeformShapesChange,
  onSelectionChange,
  onShapesChange,
  onViewChange,
}: PiloTldrawCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const placementRequestRef = useRef<PiloPlacementRequest | null>(null);
  const createdLocalCardsRef = useRef(0);
  const boardShapes = useMemo(
    () =>
      board.shapes.map((shape, index) =>
        buildPiloCardShape(shape, index, shapeStateById),
      ),
    [board.shapes, shapeStateById],
  );
  const boardShapesRef = useRef(boardShapes);
  const freeformShapesRef = useRef(freeformShapes);
  const viewSettingRef = useRef(viewSetting);
  const seedKey = useMemo(
    () =>
      `${board.id}:${board.shapes
        .map((shape, index) => getCanvasShapeId(shape, index))
        .join("|")}`,
    [board.id, board.shapes],
  );

  useEffect(() => {
    boardShapesRef.current = boardShapes;
    freeformShapesRef.current = freeformShapes;
    viewSettingRef.current = viewSetting;
  }, [boardShapes, freeformShapes, viewSetting]);

  useEffect(() => {
    const editor = editorRef.current;
    const nextBoardShapes = boardShapesRef.current;
    const nextFreeformShapes = freeformShapesRef.current;
    const nextViewSetting = viewSettingRef.current;

    if (!editor) return;

    const existingPiloShapeIds = editor
      .getCurrentPageShapes()
      .filter((shape) => isPiloCardShape(shape) || isPiloConnectionArrow(shape))
      .map((shape) => shape.id as TLShapeId);

    if (existingPiloShapeIds.length) {
      editor.deleteShapes(existingPiloShapeIds);
    }

    if (nextBoardShapes.length) {
      editor.createShapes(nextBoardShapes);
    }

    const existingFreeformShapeIds = editor
      .getCurrentPageShapes()
      .filter(isPersistableFreeformShape)
      .map((shape) => shape.id as TLShapeId);

    if (existingFreeformShapeIds.length) {
      editor.deleteShapes(existingFreeformShapeIds);
    }

    if (nextFreeformShapes.length) {
      editor.createShapes(sortFreeformShapesForCreate(nextFreeformShapes));
    }

    if (hasStoredViewSetting) {
      editor.setCamera({
        x: nextViewSetting.viewportX,
        y: nextViewSetting.viewportY,
        z: nextViewSetting.zoom,
      });
    } else if (nextBoardShapes.length) {
      editor.zoomToFit({ animation: { duration: 180 } });
    }
  }, [hasStoredViewSetting, hydrationVersion, seedKey]);

  function mountEditor(editor: Editor) {
    editorRef.current = editor;
    editor.sideEffects.registerBeforeCreateHandler("shape", (shape) => {
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

      return applyPiloSmartSnap(editor, prev, nextShape);
    });

    if (boardShapes.length) {
      editor.createShapes(boardShapes);
    }

    if (freeformShapes.length) {
      editor.createShapes(sortFreeformShapesForCreate(freeformShapes));
    }

    if (hasStoredViewSetting) {
      editor.setCamera({
        x: viewSetting.viewportX,
        y: viewSetting.viewportY,
        z: viewSetting.zoom,
      });
    } else if (boardShapes.length) {
      editor.zoomToFit({ animation: { duration: 180 } });
    }

    onReady({
      selectTool(tool) {
        const toolId = tool === "arrow" ? "arrow" : tool;
        editor.setCurrentTool(toolId);
      },
      selectDrawingPreset(preset) {
        if (preset === "highlight") {
          editor.setStyleForNextShapes(DefaultColorStyle, "yellow");
          editor.setStyleForNextShapes(DefaultSizeStyle, "xl");
          editor.setCurrentTool("highlight");
          return;
        }

        if (preset === "eraser") {
          editor.setCurrentTool("eraser");
          return;
        }

        if (preset === "frame") {
          editor.setCurrentTool("frame");
          return;
        }

        if (preset === "rectangle") {
          editor.setStyleForNextShapes(GeoShapeGeoStyle, "rectangle");
          editor.setCurrentTool("geo");
          return;
        }

        if (preset === "circle") {
          editor.setStyleForNextShapes(GeoShapeGeoStyle, "ellipse");
          editor.setCurrentTool("geo");
          return;
        }

        if (isPiloDrawingColorPreset(preset)) {
          editor.setStyleForNextShapes(DefaultColorStyle, preset);
          editor.setCurrentTool("draw");
          return;
        }

        editor.setStyleForNextShapes(DefaultColorStyle, "blue");
        editor.setStyleForNextShapes(DefaultDashStyle, "draw");
        editor.setStyleForNextShapes(DefaultSizeStyle, "m");
        editor.setCurrentTool("draw");
      },
      createEntityCard(kind) {
        placementRequestRef.current = {
          type: "card",
          kind,
        };
        editor.setCurrentTool("select");
      },
      createStickyNote(color) {
        placementRequestRef.current = {
          type: "sticky",
          color,
        };
        editor.setCurrentTool("select");
      },
      createStickyStack(color) {
        placementRequestRef.current = {
          type: "sticky-stack",
          color,
        };
        editor.setCurrentTool("select");
      },
      createCodeBlock() {
        placementRequestRef.current = {
          type: "code",
        };
        editor.setCurrentTool("select");
      },
      clearSelection() {
        placementRequestRef.current = null;
        editor.selectNone();
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
    return () => onReady(null);
  }, [onReady]);

  function handleCanvasWheel(event: WheelEvent<HTMLDivElement>) {
    const editor = editorRef.current;

    if (!editor) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".pilo-code-block input, .pilo-code-block select, .pilo-code-block textarea",
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

    if (scrollPiloCodeBlockAtPoint(editor, cursorPagePoint, normalizedDelta)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

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

  function placePendingShapeAt(point: { x: number; y: number }) {
    const editor = editorRef.current;
    const placementRequest = placementRequestRef.current;

    if (!editor || !placementRequest) return false;

    placementRequestRef.current = null;
    createdLocalCardsRef.current += 1;

    if (placementRequest.type === "card") {
      const shape = createLocalCard(
        placementRequest.kind,
        createdLocalCardsRef.current,
        dashboard,
        point,
      );

      editor.createShapes([shape]);
      editor.select(shape.id as TLShapeId);
      return true;
    }

    if (placementRequest.type === "sticky") {
      const shape = createStickyNoteShape(
        createdLocalCardsRef.current,
        point,
        placementRequest.color,
      );

      editor.createShapes([shape]);
      editor.select(shape.id as TLShapeId);
      return true;
    }

    if (placementRequest.type === "sticky-stack") {
      const startIndex = createdLocalCardsRef.current;
      const stackColors: PiloStickyNoteColor[] = placementRequest.color
        ? [
            placementRequest.color,
            placementRequest.color,
            placementRequest.color,
          ]
        : ["butter", "peach", "pink"];
      const shapes = stackColors.map((stackColor, stackIndex) =>
        createStickyNoteShape(startIndex + stackIndex, point, stackColor),
      );

      createdLocalCardsRef.current += shapes.length - 1;
      editor.createShapes(shapes);
      editor.select(shapes[shapes.length - 1].id as TLShapeId);
      return true;
    }

    const shape = createCodeBlockShape(createdLocalCardsRef.current, point);

    editor.createShapes([shape]);
    editor.select(shape.id as TLShapeId);
    return true;
  }

  function handleCanvasPointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    const editor = editorRef.current;

    if (!editor || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".pilo-frame-toolbar, .tl-frame-heading, .tl-frame-heading-hit-area, .tl-frame-label, .tl-frame-name-input, .pilo-code-block input, .pilo-code-block select, .pilo-code-block textarea",
      )
    ) {
      return;
    }

    const pagePoint = editor.screenToPage({
      x: event.clientX,
      y: event.clientY,
    });

    if (placementRequestRef.current) {
      if (placePendingShapeAt(pagePoint)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    const directShape = editor.getShapeAtPoint(pagePoint, {
      hitInside: true,
      hitLabels: true,
      hitLocked: true,
    });

    if (isPiloCodeBlockShape(directShape)) {
      if (!editor.getSelectedShapeIds().includes(directShape.id)) {
        editor.setCurrentTool("select");
        editor.select(directShape.id);
      }

      return;
    }

    if (directShape && !isPiloFrameShape(directShape)) return;

    const frameShape = isPiloFrameShape(directShape)
      ? directShape
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
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className="pilo-tldraw-canvas"
      onPointerDownCapture={handleCanvasPointerDownCapture}
      onWheelCapture={handleCanvasWheel}
    >
      <Tldraw
        hideUi
        shapeUtils={shapeUtils}
        components={tldrawComponents}
        onMount={mountEditor}
      >
        <CanvasStateReporter
          board={board}
          onFreeformShapesChange={onFreeformShapesChange}
          onSelectionChange={onSelectionChange}
          onShapesChange={onShapesChange}
          onViewChange={onViewChange}
        />
        <SmartGuidesOverlay />
        <SelectedShapeStackingManager />
        <FrameSelectionToolbar />
      </Tldraw>
    </div>
  );
}
