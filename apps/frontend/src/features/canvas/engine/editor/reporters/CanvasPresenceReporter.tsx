"use client";

import { useCallback, useEffect, useRef } from "react";
import { type Editor, type TLShapeId, useEditor } from "tldraw";
import { useValue } from "@tldraw/state-react";
import type { CanvasPresenceController } from "../../../collaboration/useCanvasRoom";
import type {
  CanvasPresenceEditingMode,
  CanvasPresencePoint,
  CanvasPresenceViewport,
} from "@/shared/canvas-realtime/canvas-realtime-types";
import { getCanvasInteractionToolPath } from "../../interactions/canvas-local-interaction-policy";
import { isPiloCodeBlockShape } from "../../shapes/PiloCanvasShapeGuards";

const CANVAS_PRESENCE_CURSOR_MIN_DISTANCE = 2;
const CANVAS_PRESENCE_CURSOR_THROTTLE_MS = 60;

function hasSameSelectedShapeIds(
  previousShapeIds: string[],
  nextShapeIds: string[],
) {
  if (previousShapeIds.length !== nextShapeIds.length) {
    return false;
  }

  return previousShapeIds.every(
    (shapeId, index) => shapeId === nextShapeIds[index],
  );
}

function hasCursorMovedEnough(
  previousCursor: CanvasPresencePoint | null,
  nextCursor: CanvasPresencePoint | null,
) {
  if (!nextCursor) {
    return previousCursor !== null;
  }

  if (!previousCursor) {
    return true;
  }

  return (
    Math.hypot(
      nextCursor.x - previousCursor.x,
      nextCursor.y - previousCursor.y,
    ) >= CANVAS_PRESENCE_CURSOR_MIN_DISTANCE
  );
}

function hasSamePresenceEditingIntent(
  previousIntent: {
    editingMode: CanvasPresenceEditingMode | null;
    editingShapeId: string | null;
  },
  nextIntent: {
    editingMode: CanvasPresenceEditingMode | null;
    editingShapeId: string | null;
  },
) {
  return (
    previousIntent.editingMode === nextIntent.editingMode &&
    previousIntent.editingShapeId === nextIntent.editingShapeId
  );
}

function getCanvasPresenceViewport(editor: Editor): CanvasPresenceViewport {
  const viewportBounds = editor.getViewportPageBounds();

  return {
    height: viewportBounds.h,
    width: viewportBounds.w,
    x: viewportBounds.x,
    y: viewportBounds.y,
    zoom: editor.getCamera().z,
  };
}

function getCanvasPresenceEditingMode({
  currentToolId,
  editingShapeId,
  editor,
  selectedShapeIds,
}: {
  currentToolId: string;
  editingShapeId: string | null;
  editor: Editor;
  selectedShapeIds: string[];
}): CanvasPresenceEditingMode | null {
  if (editingShapeId) {
    const editingShape = editor.getShape(editingShapeId as TLShapeId);

    return editingShape && isPiloCodeBlockShape(editingShape) ? "code" : "text";
  }

  if (currentToolId.includes("draw")) return "draw";
  if (currentToolId.includes("hand")) return "hand";
  if (currentToolId.includes("resize")) return "resize";
  if (currentToolId.includes("translate")) return "move";
  if (currentToolId !== "select.idle" && currentToolId !== "select") {
    return "placement";
  }

  return selectedShapeIds.length ? "select" : null;
}

export function CanvasPresenceReporter({
  presence,
}: {
  presence: CanvasPresenceController;
}) {
  const editor = useEditor();
  const sendPresenceUpdate = presence.sendPresenceUpdate;
  const selectedShapeIds = useValue(
    "pilo-presence-selected-shape-ids",
    () => editor.getSelectedShapeIds().map(String),
    [editor],
  );
  const editingShapeId = useValue(
    "pilo-presence-editing-shape-id",
    () => {
      const nextEditingShapeId = editor.getEditingShapeId();

      return nextEditingShapeId ? String(nextEditingShapeId) : null;
    },
    [editor],
  );
  const currentToolId = useValue(
    "pilo-presence-current-tool-id",
    () => getCanvasInteractionToolPath(editor),
    [editor],
  );
  const editingMode = getCanvasPresenceEditingMode({
    currentToolId,
    editingShapeId,
    editor,
    selectedShapeIds,
  });
  const selectedShapeIdsRef = useRef<string[]>(selectedShapeIds);
  const editingIntentRef = useRef<{
    editingMode: CanvasPresenceEditingMode | null;
    editingShapeId: string | null;
  }>({ editingMode, editingShapeId });
  const lastSentAtRef = useRef(0);
  const lastSentPayloadRef = useRef<{
    cursor: CanvasPresencePoint | null;
    editingMode: CanvasPresenceEditingMode | null;
    editingShapeId: string | null;
    selectedShapeIds: string[];
  }>({
    cursor: null,
    editingMode: null,
    editingShapeId: null,
    selectedShapeIds: [],
  });
  const pendingCursorRef = useRef<CanvasPresencePoint | null>(null);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    selectedShapeIdsRef.current = selectedShapeIds;
  }, [selectedShapeIds]);

  useEffect(() => {
    editingIntentRef.current = { editingMode, editingShapeId };
  }, [editingMode, editingShapeId]);

  const flushPresence = useCallback(
    (cursor: CanvasPresencePoint | null) => {
      const nextSelectedShapeIds = selectedShapeIdsRef.current;
      const nextEditingIntent = editingIntentRef.current;
      const lastPayload = lastSentPayloadRef.current;

      if (
        !hasCursorMovedEnough(lastPayload.cursor, cursor) &&
        hasSameSelectedShapeIds(
          lastPayload.selectedShapeIds,
          nextSelectedShapeIds,
        ) &&
        hasSamePresenceEditingIntent(lastPayload, nextEditingIntent)
      ) {
        return;
      }

      sendPresenceUpdate(
        cursor,
        nextSelectedShapeIds,
        getCanvasPresenceViewport(editor),
        nextEditingIntent.editingShapeId,
        nextEditingIntent.editingMode,
      );
      lastSentAtRef.current = Date.now();
      lastSentPayloadRef.current = {
        cursor,
        ...nextEditingIntent,
        selectedShapeIds: nextSelectedShapeIds,
      };
    },
    [editor, sendPresenceUpdate],
  );

  const schedulePresence = useCallback(
    (cursor: CanvasPresencePoint) => {
      pendingCursorRef.current = cursor;

      const elapsedMs = Date.now() - lastSentAtRef.current;
      if (elapsedMs >= CANVAS_PRESENCE_CURSOR_THROTTLE_MS) {
        if (pendingTimerRef.current) {
          window.clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }

        flushPresence(cursor);
        return;
      }

      if (pendingTimerRef.current) {
        return;
      }

      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        const pendingCursor = pendingCursorRef.current;

        if (pendingCursor) {
          flushPresence(pendingCursor);
        }
      }, CANVAS_PRESENCE_CURSOR_THROTTLE_MS - elapsedMs);
    },
    [flushPresence],
  );

  useEffect(() => {
    if (!presence.enabled) {
      return;
    }

    flushPresence(lastSentPayloadRef.current.cursor);
  }, [editingMode, editingShapeId, flushPresence, presence.enabled, selectedShapeIds]);

  useEffect(() => {
    if (!presence.enabled) {
      return undefined;
    }

    const container = editor.getContainer();

    function handlePointerMove(event: globalThis.PointerEvent) {
      if (event.isPrimary === false) {
        return;
      }

      const pagePoint = editor.screenToPage({
        x: event.clientX,
        y: event.clientY,
      });

      schedulePresence({ x: pagePoint.x, y: pagePoint.y });
    }

    container.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      if (pendingTimerRef.current) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      pendingCursorRef.current = null;
    };
  }, [editor, presence.enabled, schedulePresence]);

  return null;
}
