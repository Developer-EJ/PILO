"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createShapeId,
  Tldraw,
  useEditor,
  type Editor,
  type TLCreateShapePartial,
  type TLShapeId,
} from "tldraw";
import { useValue } from "@tldraw/state-react";
import {
  PiloCardShapeUtil,
  type PiloCardKind,
  type PiloCardShape,
} from "./PiloCardShapeUtil";
import { PiloCanvasBackground } from "./PiloCanvasBackground";

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

type CanvasBoardDetail = {
  id: string;
  title: string;
  shapeCount: number;
  connectionCount: number;
  shapes: CanvasEntity[];
};

type WorkspaceDashboard = {
  workspace: {
    name: string;
  };
};

export type PiloCanvasTool = "select" | "hand" | "draw" | "text" | "arrow";

export type PiloCanvasActions = {
  selectTool: (tool: PiloCanvasTool) => void;
  createEntityCard: (kind: PiloCardKind) => void;
  createStickyNote: () => void;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type PiloTldrawCanvasProps = {
  board: CanvasBoardDetail;
  dashboard: WorkspaceDashboard;
  onReady: (actions: PiloCanvasActions | null) => void;
  onZoomChange: (zoom: number) => void;
};

const shapeUtils = [PiloCardShapeUtil];
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
  if (kind === "risk") return "risk";

  return "file";
}

function resolveCardBody(kind: PiloCardKind) {
  if (kind === "task") return "실행해야 하는 작업과 담당 흐름을 표시합니다.";
  if (kind === "pull_request")
    return "리뷰 대기, 병합 상태, 코드 리뷰 연결을 보여줍니다.";
  if (kind === "meeting_report")
    return "회의에서 나온 결정과 후속 작업을 묶어 봅니다.";
  if (kind === "github_issue")
    return "GitHub Issue와 연결된 작업 단서를 표시합니다.";
  if (kind === "risk") return "지연되거나 막힌 항목을 빠르게 확인합니다.";
  if (kind === "memo") return "캔버스 위에 남기는 가벼운 메모입니다.";

  return "프로젝트 객체의 요약과 연결 ID를 표시합니다.";
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

function getShapeId(entity: CanvasEntity, index: number) {
  const sourceId =
    entity.id ?? `${entity.entityType}-${entity.entityId}-${index}`;

  return createShapeId(`pilo-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`);
}

function buildPiloCardShape(
  entity: CanvasEntity,
  index: number,
): TLCreateShapePartial<PiloCardShape> {
  const kind = normalizeKind(entity);
  const position = resolvePosition(entity, index);
  const accent = entity.color ?? defaultAccents[kind] ?? defaultAccents.file;

  return {
    id: getShapeId(entity, index),
    type: "pilo-card",
    x: position.x,
    y: position.y,
    props: {
      w: entity.width ?? (kind === "pull_request" ? 308 : 288),
      h: entity.height ?? (kind === "pull_request" ? 174 : 164),
      kind,
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
): TLCreateShapePartial<PiloCardShape> {
  const position =
    autoLayoutPositions[(index + 2) % autoLayoutPositions.length] ??
    autoLayoutPositions[0];
  const id = createShapeId(`pilo-local-${kind}-${Date.now()}`);

  return {
    id,
    type: "pilo-card",
    x: position.x + index * 24,
    y: position.y + index * 18,
    props: {
      w: kind === "memo" ? 240 : 288,
      h: kind === "memo" ? 152 : 164,
      kind,
      title: kind === "memo" ? "새 메모" : `새 ${kind.replace(/_/g, " ")} 카드`,
      subtitle: dashboard.workspace.name,
      body: resolveCardBody(kind),
      status: resolveStatus(kind),
      accent: defaultAccents[kind] ?? defaultAccents.file,
      entityId: "local-draft",
    },
  };
}

function ZoomReporter({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
  const editor = useEditor();
  const zoom = useValue("pilo-camera-zoom", () => editor.getCamera().z, [
    editor,
  ]);

  useEffect(() => {
    onZoomChange(zoom);
  }, [onZoomChange, zoom]);

  return null;
}

export function PiloTldrawCanvas({
  board,
  dashboard,
  onReady,
  onZoomChange,
}: PiloTldrawCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const createdLocalCardsRef = useRef(0);
  const boardShapes = useMemo(
    () => board.shapes.map((shape, index) => buildPiloCardShape(shape, index)),
    [board.shapes],
  );

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) return;

    const existingPiloShapeIds = editor
      .getCurrentPageShapes()
      .filter((shape) => shape.type === "pilo-card")
      .map((shape) => shape.id as TLShapeId);

    if (existingPiloShapeIds.length) {
      editor.deleteShapes(existingPiloShapeIds);
    }

    if (boardShapes.length) {
      editor.createShapes(boardShapes);
      editor.zoomToFit({ animation: { duration: 180 } });
    }
  }, [board.id, boardShapes]);

  function mountEditor(editor: Editor) {
    editorRef.current = editor;

    if (boardShapes.length) {
      editor.createShapes(boardShapes);
      editor.zoomToFit({ animation: { duration: 180 } });
    }

    onReady({
      selectTool(tool) {
        const toolId = tool === "arrow" ? "arrow" : tool;
        editor.setCurrentTool(toolId);
      },
      createEntityCard(kind) {
        createdLocalCardsRef.current += 1;
        const shape = createLocalCard(
          kind,
          createdLocalCardsRef.current,
          dashboard,
        );

        editor.createShapes([shape]);
        editor.select(shape.id as TLShapeId);
      },
      createStickyNote() {
        createdLocalCardsRef.current += 1;
        const shape = createLocalCard(
          "memo",
          createdLocalCardsRef.current,
          dashboard,
        );

        editor.createShapes([shape]);
        editor.select(shape.id as TLShapeId);
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
    });
  }

  useEffect(() => {
    return () => onReady(null);
  }, [onReady]);

  return (
    <div className="pilo-tldraw-canvas">
      <Tldraw
        hideUi
        shapeUtils={shapeUtils}
        components={tldrawComponents}
        onMount={mountEditor}
      >
        <ZoomReporter onZoomChange={onZoomChange} />
      </Tldraw>
    </div>
  );
}
