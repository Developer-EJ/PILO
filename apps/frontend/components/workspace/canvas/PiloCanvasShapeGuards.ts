"use client";

import type {
  Editor,
  TLCreateShapePartial,
  TLShape,
  TLShapeId,
  TLShapePartial,
} from "tldraw";
import type { PiloCardShape } from "./PiloCardShapeUtil";
import type { PiloCodeBlockShape } from "./PiloCodeBlockShapeUtil";
import type { PiloStickyNoteShape } from "./PiloStickyNoteShapeUtil";

export type PiloArrowShape = Extract<TLShape, { type: "arrow" }>;
export type PiloArrowPartial = TLCreateShapePartial<PiloArrowShape> & {
  id: TLShapeId;
};
export type PiloFrameShape = Extract<TLShape, { type: "frame" }>;
export type PiloFramePartial = TLShapePartial<PiloFrameShape> & {
  id: TLShapeId;
};
export type PiloSnapShape =
  | PiloCardShape
  | PiloFrameShape
  | PiloStickyNoteShape
  | PiloCodeBlockShape;

export function isPiloCardShape(
  shape: TLShape | undefined,
): shape is PiloCardShape {
  return Boolean(shape && shape.type === "pilo-card");
}

export function isPiloFrameShape(
  shape: TLShape | undefined,
): shape is PiloFrameShape {
  return Boolean(shape && shape.type === "frame");
}

export function isPiloCodeBlockShape(
  shape: TLShape | undefined,
): shape is PiloCodeBlockShape {
  return Boolean(shape && shape.type === "pilo-code-block");
}

export function isPiloConnectionArrow(shape: TLShape): shape is PiloArrowShape {
  return (
    shape.type === "arrow" && typeof shape.meta?.piloConnectionId === "string"
  );
}

export function isPiloSnapShape(
  shape: TLShape | undefined,
): shape is PiloSnapShape {
  return Boolean(
    shape &&
      (isPiloCardShape(shape) ||
        isPiloFrameShape(shape) ||
        shape.type === "pilo-sticky-note" ||
        isPiloCodeBlockShape(shape)),
  );
}

export function isPiloTextShape(shape: TLShape | undefined) {
  return Boolean(shape && shape.type === "text");
}

export function getPiloTextShapeIds(editor: Editor) {
  return editor
    .getCurrentPageShapes()
    .filter(isPiloTextShape)
    .map((shape) => shape.id as TLShapeId);
}

export function bringPiloTextShapesToFront(
  editor: Editor,
  textShapeIds = getPiloTextShapeIds(editor),
) {
  if (!textShapeIds.length) return;

  editor.bringToFront(textShapeIds);
}
