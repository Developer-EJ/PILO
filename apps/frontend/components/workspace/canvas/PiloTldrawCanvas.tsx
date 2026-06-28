"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  FrameShapeUtil,
  GeoShapeGeoStyle,
  Tldraw,
  useEditor,
  type Editor,
  type TLCreateShapePartial,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
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

type CanvasEntity = {
  id?: string;
  entityType: string;
  entityId: string;
  displayTitle: string;
  shapeType: string;
  width?: number;
  height?: number;
  color?: string;
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
  shapeStateById: Record<string, PiloCanvasShapeState>;
  viewSetting: CanvasViewSetting;
  onReady: (actions: PiloCanvasActions | null) => void;
  onSelectionChange: (selection: PiloCanvasSelection) => void;
  onShapesChange: (
    shapeStateById: Record<string, PiloCanvasShapeState>,
  ) => void;
  onViewChange: (viewSetting: CanvasViewSetting) => void;
};

type PiloArrowShape = Extract<TLShape, { type: "arrow" }>;
type PiloArrowPartial = TLCreateShapePartial<PiloArrowShape> & {
  id: TLShapeId;
};
type PiloFrameShape = Extract<TLShape, { type: "frame" }>;
type PiloFramePartial = TLShapePartial<PiloFrameShape> & {
  id: TLShapeId;
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

const PILO_EMPTY_FRAME_NAME = "\u200B";

function isBlankFrameName(name: string) {
  return name.replaceAll(PILO_EMPTY_FRAME_NAME, "").trim() === "";
}

function normalizeBlankFrameName(name: string) {
  return isBlankFrameName(name) ? PILO_EMPTY_FRAME_NAME : name;
}

const piloFrameDisplayColors: Partial<
  Record<
    PiloFrameShape["props"]["color"],
    {
      fill: string;
      stroke: string;
      headingText: string;
    }
  >
> = {
  black: {
    fill: "#edf0f4",
    stroke: "#5b6472",
    headingText: "#111827",
  },
  grey: {
    fill: "#d9dde4",
    stroke: "#7b8492",
    headingText: "#111827",
  },
  "light-violet": {
    fill: "#eadcff",
    stroke: "#a379e6",
    headingText: "#3b2470",
  },
  violet: {
    fill: "#dec8ff",
    stroke: "#7c4bd6",
    headingText: "#35176f",
  },
  blue: {
    fill: "#d4e2ff",
    stroke: "#4c6fe8",
    headingText: "#173a8a",
  },
  "light-blue": {
    fill: "#d6ecff",
    stroke: "#4595d9",
    headingText: "#0e4d78",
  },
  yellow: {
    fill: "#fff0a6",
    stroke: "#d79b1f",
    headingText: "#704900",
  },
  orange: {
    fill: "#ffd8b8",
    stroke: "#df7a28",
    headingText: "#783500",
  },
  green: {
    fill: "#cdf2db",
    stroke: "#2b9b55",
    headingText: "#10542c",
  },
  "light-green": {
    fill: "#d8f6cf",
    stroke: "#5dad45",
    headingText: "#285f1b",
  },
  "light-red": {
    fill: "#ffd2d2",
    stroke: "#e06b6b",
    headingText: "#831f1f",
  },
  red: {
    fill: "#ffc3c3",
    stroke: "#d94949",
    headingText: "#7a1111",
  },
  white: {
    fill: "#ffffff",
    stroke: "#cbd2df",
    headingText: "#111827",
  },
};

const PiloFrameShapeUtil = FrameShapeUtil.configure({
  showColors: true,
  getCustomDisplayValues(_editor, shape) {
    const colors =
      piloFrameDisplayColors[shape.props.color] ?? piloFrameDisplayColors.black;

    if (!colors) return {};

    return {
      showColorsFillColor: colors.fill,
      showColorsStrokeColor: colors.stroke,
      showColorsHeadingFillColor: "transparent",
      showColorsHeadingStrokeColor: "transparent",
      showColorsHeadingTextColor: colors.headingText,
    };
  },
});
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

const frameColorOptions: {
  label: string;
  value: PiloFrameShape["props"]["color"];
}[] = [
  { label: "검정", value: "black" },
  { label: "회색", value: "grey" },
  { label: "연보라", value: "light-violet" },
  { label: "보라", value: "violet" },
  { label: "파랑", value: "blue" },
  { label: "연파랑", value: "light-blue" },
  { label: "노랑", value: "yellow" },
  { label: "주황", value: "orange" },
  { label: "초록", value: "green" },
  { label: "연초록", value: "light-green" },
  { label: "연빨강", value: "light-red" },
  { label: "빨강", value: "red" },
  { label: "흰색", value: "white" },
];

const frameRatioPresets = [
  { key: "custom", label: "사용자 지정", width: 360, height: 240 },
  { key: "a4", label: "A4", width: 297, height: 420 },
  { key: "letter", label: "레터", width: 330, height: 426 },
  { key: "16-9", label: "16 : 9", width: 480, height: 270 },
  { key: "4-3", label: "4 : 3", width: 400, height: 300 },
  { key: "1-1", label: "1 : 1", width: 320, height: 320 },
  { key: "phone", label: "전화", width: 210, height: 380 },
  { key: "tablet", label: "태블릿", width: 300, height: 400 },
  { key: "browser", label: "브라우저", width: 520, height: 325 },
];

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

function isPiloFrameShape(shape: TLShape | undefined): shape is PiloFrameShape {
  return Boolean(shape && shape.type === "frame");
}

function buildFrameSizePartial(
  shape: PiloFrameShape,
  preset: (typeof frameRatioPresets)[number],
): PiloFramePartial {
  const center = {
    x: shape.x + shape.props.w / 2,
    y: shape.y + shape.props.h / 2,
  };

  return {
    id: shape.id,
    type: shape.type,
    x: center.x - preset.width / 2,
    y: center.y - preset.height / 2,
    props: {
      w: preset.width,
      h: preset.height,
      name: normalizeBlankFrameName(shape.props.name),
    },
  };
}

function updateFrame(
  editor: Editor,
  shape: PiloFrameShape,
  partial: PiloFramePartial,
) {
  editor.updateShapes([partial]);
  editor.select(shape.id);
}

function resolveNextFrameName(editor: Editor) {
  const usedFrameNumbers = new Set<number>();

  editor.getCurrentPageShapes().forEach((shape) => {
    if (!isPiloFrameShape(shape)) return;

    const match = isBlankFrameName(shape.props.name)
      ? null
      : shape.props.name.match(/^프레임\s+(\d+)$/);
    const frameNumber = match ? Number(match[1]) : NaN;

    if (Number.isFinite(frameNumber) && frameNumber > 0) {
      usedFrameNumbers.add(frameNumber);
    }
  });

  let nextFrameNumber = 1;

  while (usedFrameNumbers.has(nextFrameNumber)) {
    nextFrameNumber += 1;
  }

  return `프레임 ${nextFrameNumber}`;
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
      subtitle: `${kind.replace(/_/g, " ")} / ${entity.shapeType}`,
      body: resolveCardBody(kind),
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
    },
  };
}

function isPiloCardShape(shape: TLShape): shape is PiloCardShape {
  return shape.type === "pilo-card";
}

function isPiloConnectionArrow(shape: TLShape): shape is PiloArrowShape {
  return (
    shape.type === "arrow" && typeof shape.meta?.piloConnectionId === "string"
  );
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
  onShapesChange,
  onViewChange,
}: {
  board: CanvasBoardDetail;
  onSelectionChange: (selection: PiloCanvasSelection) => void;
  onShapesChange: (
    shapeStateById: Record<string, PiloCanvasShapeState>,
  ) => void;
  onViewChange: (viewSetting: CanvasViewSetting) => void;
}) {
  const editor = useEditor();
  const cardSnapshotsRef = useRef<PiloCanvasCardSnapshot[]>([]);
  const selectedCardRef = useRef<PiloCanvasSelection>(null);
  const viewSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const cardSnapshotsKey = useMemo(
    () => buildCardSnapshotsKey(cardSnapshots),
    [cardSnapshots],
  );
  const selectedCardKey = useMemo(
    () => buildSelectedCardKey(selectedCard),
    [selectedCard],
  );

  useEffect(() => {
    cardSnapshotsRef.current = cardSnapshots;
    selectedCardRef.current = selectedCard;
  }, [cardSnapshots, selectedCard]);

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

function FrameSelectionToolbar() {
  const editor = useEditor();
  const [openMenu, setOpenMenu] = useState<"ratio" | "color" | null>(null);
  const toolbarState = useValue(
    "pilo-selected-frame-toolbar",
    () => {
      const selectedFrame = editor.getSelectedShapes().find(isPiloFrameShape);

      if (!selectedFrame) return null;

      const bounds = editor.getShapePageBounds(selectedFrame.id);

      if (!bounds) return null;

      const viewportBounds = editor.getViewportScreenBounds();
      const topCenter = editor.pageToViewport({
        x: bounds.x + bounds.w / 2,
        y: bounds.y + bounds.h,
      });
      const toolbarHalfWidth = 132;
      const clampedLeft = Math.min(
        Math.max(topCenter.x, toolbarHalfWidth + 12),
        Math.max(
          toolbarHalfWidth + 12,
          viewportBounds.w - toolbarHalfWidth - 12,
        ),
      );

      return {
        frame: selectedFrame,
        left: clampedLeft,
        top: topCenter.y + 12,
      };
    },
    [editor],
  );

  if (!toolbarState) return null;

  const selectedFrame = toolbarState.frame;

  function toggleMenu(menu: "ratio" | "color") {
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
  }

  function applyFramePreset(preset: (typeof frameRatioPresets)[number]) {
    updateFrame(
      editor,
      selectedFrame,
      buildFrameSizePartial(selectedFrame, preset),
    );
    setOpenMenu(null);
  }

  function applyFrameColor(color: PiloFrameShape["props"]["color"]) {
    updateFrame(editor, selectedFrame, {
      id: selectedFrame.id,
      type: selectedFrame.type,
      props: {
        color,
      },
    });
    setOpenMenu(null);
  }

  function toggleFrameLock() {
    setOpenMenu(null);
    editor.toggleLock([selectedFrame.id]);
    editor.select(selectedFrame.id);
  }

  function toggleFrameVisibility() {
    setOpenMenu(null);
    updateFrame(editor, selectedFrame, {
      id: selectedFrame.id,
      type: selectedFrame.type,
      opacity: selectedFrame.opacity < 0.35 ? 1 : 0.18,
    });
  }

  return (
    <div
      className="pilo-frame-toolbar"
      style={{
        left: toolbarState.left,
        top: toolbarState.top,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="pilo-frame-toolbar-ratio"
        data-tooltip="비율 선택"
        onClick={() => toggleMenu("ratio")}
      >
        <span>비율</span>
      </button>
      <button
        type="button"
        aria-label={`${isBlankFrameName(selectedFrame.props.name) ? "프레임" : selectedFrame.props.name} 색상`}
        data-tooltip="색상 선택"
        onClick={() => toggleMenu("color")}
      >
        <span
          className={`pilo-frame-toolbar-swatch is-${selectedFrame.props.color}`}
        />
      </button>
      <button
        type="button"
        aria-label="프레임 잠금"
        data-tooltip={selectedFrame.isLocked ? "잠금 해제" : "잠금"}
        onClick={toggleFrameLock}
      >
        <FrameToolbarIcon type={selectedFrame.isLocked ? "unlock" : "lock"} />
      </button>
      <button
        type="button"
        aria-label="프레임 표시"
        data-tooltip={selectedFrame.opacity < 0.35 ? "다시 표시" : "흐리게"}
        onClick={toggleFrameVisibility}
      >
        <FrameToolbarIcon
          type={selectedFrame.opacity < 0.35 ? "eye-off" : "eye"}
        />
      </button>
      {openMenu === "ratio" ? (
        <div className="pilo-frame-dropdown pilo-frame-ratio-menu">
          {frameRatioPresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`pilo-frame-ratio-option is-${preset.key}`}
              data-tooltip={preset.label}
              onClick={() => applyFramePreset(preset)}
            >
              <span aria-hidden="true" />
              <strong>{preset.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
      {openMenu === "color" ? (
        <div className="pilo-frame-dropdown pilo-frame-color-menu">
          <header>
            <span>브랜드 색상</span>
            <b>↟</b>
          </header>
          <button
            type="button"
            className="pilo-frame-add-color"
            data-tooltip="색상 추가"
            onClick={() => applyFrameColor("violet")}
          >
            + 색상 추가
          </button>
          <strong>모든 색상</strong>
          <div className="pilo-frame-color-grid">
            {frameColorOptions.map((color) => (
              <button
                key={color.value}
                type="button"
                className={`pilo-frame-color-option is-${color.value}`}
                data-tooltip={color.label}
                aria-label={`${color.label} 적용`}
                onClick={() => applyFrameColor(color.value)}
              >
                {selectedFrame.props.color === color.value ? (
                  <span aria-hidden="true">✓</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FrameToolbarIcon({
  type,
}: {
  type: "lock" | "unlock" | "eye" | "eye-off";
}) {
  const commonProps = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (type === "lock") {
    return (
      <svg {...commonProps}>
        <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
        <path d="M8.5 10V7.2a3.5 3.5 0 0 1 7 0V10" />
      </svg>
    );
  }

  if (type === "unlock") {
    return (
      <svg {...commonProps}>
        <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
        <path d="M8.5 10V7.2a3.5 3.5 0 0 1 6.4-2" />
      </svg>
    );
  }

  if (type === "eye-off") {
    return (
      <svg {...commonProps}>
        <path d="M3.5 3.5 20.5 20.5" />
        <path d="M9.6 5.1A8.7 8.7 0 0 1 12 4.8c5 0 8.4 4.6 9.4 7.2a12.4 12.4 0 0 1-2.4 3.6" />
        <path d="M6.2 6.8A12.2 12.2 0 0 0 2.6 12c1 2.6 4.4 7.2 9.4 7.2a8.5 8.5 0 0 0 4.1-1" />
        <path d="M10.3 10.3a2.4 2.4 0 0 0 3.4 3.4" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M2.6 12c1-2.6 4.4-7.2 9.4-7.2s8.4 4.6 9.4 7.2c-1 2.6-4.4 7.2-9.4 7.2S3.6 14.6 2.6 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

export function PiloTldrawCanvas({
  board,
  dashboard,
  hasStoredViewSetting,
  hydrationVersion,
  shapeStateById,
  viewSetting,
  onReady,
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
    viewSettingRef.current = viewSetting;
  }, [boardShapes, viewSetting]);

  useEffect(() => {
    const editor = editorRef.current;
    const nextBoardShapes = boardShapesRef.current;
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
      if (!isPiloFrameShape(next)) return next;
      if (prev.type === "frame" && prev.props.name === next.props.name) {
        return next;
      }

      const normalizedName = normalizeBlankFrameName(next.props.name);

      if (normalizedName === next.props.name) return next;

      return {
        ...next,
        props: {
          ...next.props,
          name: normalizedName,
        },
      };
    });

    if (boardShapes.length) {
      editor.createShapes(boardShapes);
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

    event.preventDefault();
    event.stopPropagation();

    const deltaMultiplier =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
    const normalizedDelta = event.deltaY * deltaMultiplier;
    const currentCamera = editor.getCamera();
    const nextZoom = Math.min(
      8,
      Math.max(0.12, currentCamera.z * Math.exp(-normalizedDelta * 0.0012)),
    );

    if (Math.abs(nextZoom - currentCamera.z) < 0.001) return;

    const cursorPagePoint = editor.screenToPage({
      x: event.clientX,
      y: event.clientY,
    });
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
        ".pilo-frame-toolbar, .tl-frame-heading, .tl-frame-heading-hit-area, .tl-frame-label, .tl-frame-name-input",
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
          onSelectionChange={onSelectionChange}
          onShapesChange={onShapesChange}
          onViewChange={onViewChange}
        />
        <FrameSelectionToolbar />
      </Tldraw>
    </div>
  );
}
