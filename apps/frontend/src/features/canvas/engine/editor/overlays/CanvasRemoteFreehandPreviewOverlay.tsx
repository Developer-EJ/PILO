"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useValue } from "@tldraw/state-react";
import { Mat, b64Vecs, useEditor, type TLShapeId } from "tldraw";

import type { CanvasRemoteShapePreviewStore } from "@/features/canvas/collaboration/canvas-remote-shape-preview-store";

type CanvasRemoteFreehandPreviewOverlayProps = {
  previewStore: CanvasRemoteShapePreviewStore;
};

type CanvasOverlayRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type CanvasRemoteFreehandShape = {
  id: string;
  opacity: number;
  parentId: string;
  rotation: number;
  type: "draw" | "highlight";
  x: number;
  y: number;
  props: {
    color: string;
    dash: string;
    scale: number;
    scaleX: number;
    scaleY: number;
    segments: Array<{
      path: string;
      type: string;
    }>;
    size: string;
  };
};

const CANVAS_DRAW_STROKE_WIDTHS: Record<string, number> = {
  l: 3.5,
  m: 2.75,
  s: 2,
  xl: 6,
};

const CANVAS_HIGHLIGHT_STROKE_WIDTHS: Record<string, number> = {
  l: 32,
  m: 24,
  s: 18,
  xl: 42,
};

const CANVAS_SHAPE_COLORS: Record<string, string> = {
  black: "#1d1d1d",
  blue: "#4263eb",
  green: "#2f9e44",
  grey: "#868e96",
  "light-blue": "#74c0fc",
  "light-green": "#8ce99a",
  "light-red": "#ffa8a8",
  "light-violet": "#b197fc",
  orange: "#f76707",
  red: "#e03131",
  violet: "#7048e8",
  white: "#ffffff",
  yellow: "#f59f00",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readRemoteFreehandShape(
  value: unknown,
): CanvasRemoteFreehandShape | null {
  if (!isRecord(value) || (value.type !== "draw" && value.type !== "highlight")) {
    return null;
  }

  const props = isRecord(value.props) ? value.props : null;
  const segments = Array.isArray(props?.segments)
    ? props.segments.flatMap((segment) => {
        if (!isRecord(segment) || typeof segment.path !== "string") return [];

        return [
          {
            path: segment.path,
            type: typeof segment.type === "string" ? segment.type : "free",
          },
        ];
      })
    : [];

  if (typeof value.id !== "string" || !props || !segments.length) {
    return null;
  }

  return {
    id: value.id,
    opacity: Math.min(1, Math.max(0, readFiniteNumber(value.opacity, 1))),
    parentId: typeof value.parentId === "string" ? value.parentId : "",
    props: {
      color: typeof props.color === "string" ? props.color : "black",
      dash: typeof props.dash === "string" ? props.dash : "draw",
      scale: Math.max(0.01, readFiniteNumber(props.scale, 1)),
      scaleX: readFiniteNumber(props.scaleX, 1),
      scaleY: readFiniteNumber(props.scaleY, 1),
      segments,
      size: typeof props.size === "string" ? props.size : "m",
    },
    rotation: readFiniteNumber(value.rotation, 0),
    type: value.type,
    x: readFiniteNumber(value.x, 0),
    y: readFiniteNumber(value.y, 0),
  };
}

function hasSameOverlayRect(
  previousRect: CanvasOverlayRect | null,
  nextRect: CanvasOverlayRect,
) {
  return (
    previousRect?.height === nextRect.height &&
    previousRect.left === nextRect.left &&
    previousRect.top === nextRect.top &&
    previousRect.width === nextRect.width
  );
}

function useCanvasOverlayRect(
  overlayRef: RefObject<HTMLCanvasElement | null>,
) {
  const [overlayRect, setOverlayRect] = useState<CanvasOverlayRect | null>(null);

  useLayoutEffect(() => {
    const overlayElement = overlayRef.current;
    if (!overlayElement) return undefined;
    const measuredOverlay = overlayElement;

    function updateOverlayRect() {
      const rect = measuredOverlay.getBoundingClientRect();
      const nextRect = {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };

      setOverlayRect((currentRect) =>
        hasSameOverlayRect(currentRect, nextRect) ? currentRect : nextRect,
      );
    }

    updateOverlayRect();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateOverlayRect);

    resizeObserver?.observe(measuredOverlay);
    window.addEventListener("resize", updateOverlayRect);
    window.addEventListener("scroll", updateOverlayRect, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverlayRect);
      window.removeEventListener("scroll", updateOverlayRect, true);
    };
  }, [overlayRef]);

  return overlayRect;
}

function getFreehandShapePageTransform(
  editor: ReturnType<typeof useEditor>,
  shape: CanvasRemoteFreehandShape,
) {
  const localTransform = Mat.Identity()
    .translate(shape.x, shape.y)
    .rotate(shape.rotation);
  const parentShape = shape.parentId
    ? editor.getShape(shape.parentId as TLShapeId)
    : null;

  return parentShape
    ? Mat.Compose(editor.getShapePageTransform(parentShape), localTransform)
    : localTransform;
}

function getCanvasStrokeDash(
  dash: string,
  strokeWidth: number,
): number[] {
  if (dash === "dashed") return [strokeWidth * 2, strokeWidth * 2];
  if (dash === "dotted") return [0.1, strokeWidth * 2];

  return [];
}

function drawRemoteFreehandShape({
  context,
  editor,
  overlayRect,
  shape,
}: {
  context: CanvasRenderingContext2D;
  editor: ReturnType<typeof useEditor>;
  overlayRect: CanvasOverlayRect;
  shape: CanvasRemoteFreehandShape;
}) {
  const pageTransform = getFreehandShapePageTransform(editor, shape);
  const cameraZoom = editor.getCamera().z;
  const baseStrokeWidth =
    shape.type === "highlight"
      ? (CANVAS_HIGHLIGHT_STROKE_WIDTHS[shape.props.size] ?? 24)
      : (CANVAS_DRAW_STROKE_WIDTHS[shape.props.size] ?? 2.75);
  const strokeWidth = baseStrokeWidth * shape.props.scale * cameraZoom;
  const points = shape.props.segments.flatMap((segment) => {
    try {
      return b64Vecs.decodePoints(segment.path).map((point) =>
        pageTransform.applyToPoint({
          x: point.x * shape.props.scaleX,
          y: point.y * shape.props.scaleY,
        }),
      );
    } catch {
      return [];
    }
  });

  if (!points.length || shape.props.dash === "none") return;

  context.save();
  context.globalAlpha =
    shape.opacity * (shape.type === "highlight" ? 0.42 : 0.92);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1, strokeWidth);
  context.strokeStyle =
    CANVAS_SHAPE_COLORS[shape.props.color] ?? CANVAS_SHAPE_COLORS.black;
  context.setLineDash(getCanvasStrokeDash(shape.props.dash, strokeWidth));
  context.beginPath();

  points.forEach((point, index) => {
    const screenPoint = editor.pageToScreen(point);
    const x = screenPoint.x - overlayRect.left;
    const y = screenPoint.y - overlayRect.top;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });

  if (points.length === 1) {
    const screenPoint = editor.pageToScreen(points[0]);
    context.arc(
      screenPoint.x - overlayRect.left,
      screenPoint.y - overlayRect.top,
      Math.max(1, strokeWidth / 2),
      0,
      Math.PI * 2,
    );
    context.fillStyle = context.strokeStyle;
    context.fill();
  } else {
    context.stroke();
  }

  context.restore();
}

export function CanvasRemoteFreehandPreviewOverlay({
  previewStore,
}: CanvasRemoteFreehandPreviewOverlayProps) {
  const editor = useEditor();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRect = useCanvasOverlayRect(overlayRef);
  const previews = useSyncExternalStore(
    previewStore.subscribe,
    previewStore.getSnapshot,
    previewStore.getSnapshot,
  );
  const camera = useValue(
    "pilo-remote-freehand-preview-camera",
    () => editor.getCamera(),
    [editor],
  );

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !overlayRect) return undefined;

    const animationFrame = window.requestAnimationFrame(() => {
      const context = overlay.getContext("2d");
      if (!context) return;

      const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(
        1,
        Math.round(overlayRect.width * devicePixelRatio),
      );
      const pixelHeight = Math.max(
        1,
        Math.round(overlayRect.height * devicePixelRatio),
      );

      if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
        overlay.width = pixelWidth;
        overlay.height = pixelHeight;
      }

      context.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0,
      );
      context.clearRect(0, 0, overlayRect.width, overlayRect.height);

      previews.forEach((preview) => {
        preview.shapes.forEach((value) => {
          const shape = readRemoteFreehandShape(value);
          if (!shape) return;

          drawRemoteFreehandShape({
            context,
            editor,
            overlayRect,
            shape,
          });
        });
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [camera.x, camera.y, camera.z, editor, overlayRect, previews]);

  return (
    <canvas
      ref={overlayRef}
      aria-hidden="true"
      className="canvas-remote-freehand-preview-layer"
    />
  );
}
