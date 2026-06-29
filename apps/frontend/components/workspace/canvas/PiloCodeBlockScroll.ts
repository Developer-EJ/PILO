"use client";

import type { Editor, TLShape, TLShapePartial } from "tldraw";
import type { PiloCodeBlockShape } from "./PiloCodeBlockShapeUtil";
import { isPiloCodeBlockShape } from "./PiloCanvasShapeGuards";

const PILO_CODE_BLOCK_HEADER_HEIGHT = 42;
const PILO_CODE_BLOCK_SCROLL_PADDING = 80;

function getPiloCodeBlockScrollRange(
  editor: Editor,
  shape: PiloCodeBlockShape,
) {
  const currentScrollY = shape.props.scrollY ?? 0;
  const codeLineCount = Math.max(1, shape.props.code.split("\n").length);
  const codeContentHeight =
    PILO_CODE_BLOCK_HEADER_HEIGHT + 28 + codeLineCount * 21;
  const parentBounds = editor.getShapePageBounds(shape.id);
  const childContentBottom = editor
    .getSortedChildIdsForParent(shape.id)
    .reduce((maxBottom, childId) => {
      const childBounds = editor.getShapePageBounds(childId);

      if (!parentBounds || !childBounds) return maxBottom;

      return Math.max(
        maxBottom,
        childBounds.y - parentBounds.y + currentScrollY + childBounds.h,
      );
    }, codeContentHeight);

  return Math.max(
    0,
    Math.ceil(
      childContentBottom - shape.props.h + PILO_CODE_BLOCK_SCROLL_PADDING,
    ),
  );
}

export function scrollPiloCodeBlockAtPoint(
  editor: Editor,
  point: { x: number; y: number },
  normalizedDelta: number,
) {
  const codeBlock = editor.getShapeAtPoint(point, {
    filter: isPiloCodeBlockShape,
    hitFrameInside: true,
    hitInside: true,
    hitLocked: true,
  });

  if (!isPiloCodeBlockShape(codeBlock)) return false;

  const maxScrollY = getPiloCodeBlockScrollRange(editor, codeBlock);

  if (maxScrollY <= 0) return false;

  const currentScrollY = Math.min(
    maxScrollY,
    Math.max(0, codeBlock.props.scrollY ?? 0),
  );
  const nextScrollY = Math.min(
    maxScrollY,
    Math.max(0, currentScrollY + normalizedDelta / editor.getCamera().z),
  );
  const scrollDelta = nextScrollY - currentScrollY;

  if (Math.abs(scrollDelta) < 0.1) return true;

  const childUpdates = editor
    .getSortedChildIdsForParent(codeBlock.id)
    .map((childId) => editor.getShape(childId))
    .filter((child): child is TLShape => Boolean(child))
    .map(
      (child) =>
        ({
          id: child.id,
          type: child.type,
          y: child.y - scrollDelta,
        }) as TLShapePartial,
    );

  editor.run(
    () => {
      editor.updateShapes([
        {
          id: codeBlock.id,
          type: codeBlock.type,
          props: {
            scrollY: nextScrollY,
          },
        },
        ...childUpdates,
      ]);
    },
    { history: "ignore" },
  );

  return true;
}
