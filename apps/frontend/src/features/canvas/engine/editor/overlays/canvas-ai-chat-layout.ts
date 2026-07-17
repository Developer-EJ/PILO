export const CANVAS_AI_CHAT_VIEWPORT_MARGIN = 12;
export const CANVAS_AI_CHAT_MIN_WIDTH = 320;
export const CANVAS_AI_CHAT_MIN_HEIGHT = 360;
export const CANVAS_AI_CHAT_DEFAULT_WIDTH = 360;
export const CANVAS_AI_CHAT_DEFAULT_HEIGHT = 440;

export type CanvasAiChatLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type CanvasAiChatResizeDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export type CanvasAiChatViewport = {
  height: number;
  width: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function clampCanvasAiChatLayout(
  layout: CanvasAiChatLayout,
  viewport: CanvasAiChatViewport,
): CanvasAiChatLayout {
  const availableWidth = Math.max(0, viewport.width - CANVAS_AI_CHAT_VIEWPORT_MARGIN * 2);
  const availableHeight = Math.max(0, viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN * 2);
  const minimumWidth = Math.min(CANVAS_AI_CHAT_MIN_WIDTH, availableWidth);
  const minimumHeight = Math.min(CANVAS_AI_CHAT_MIN_HEIGHT, availableHeight);
  const width = clamp(
    finiteOr(layout.width, CANVAS_AI_CHAT_DEFAULT_WIDTH),
    minimumWidth,
    availableWidth,
  );
  const height = clamp(
    finiteOr(layout.height, CANVAS_AI_CHAT_DEFAULT_HEIGHT),
    minimumHeight,
    availableHeight,
  );
  const maximumX = Math.max(
    CANVAS_AI_CHAT_VIEWPORT_MARGIN,
    viewport.width - CANVAS_AI_CHAT_VIEWPORT_MARGIN - width,
  );
  const maximumY = Math.max(
    CANVAS_AI_CHAT_VIEWPORT_MARGIN,
    viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN - height,
  );

  return {
    height,
    width,
    x: clamp(
      finiteOr(layout.x, CANVAS_AI_CHAT_VIEWPORT_MARGIN),
      CANVAS_AI_CHAT_VIEWPORT_MARGIN,
      maximumX,
    ),
    y: clamp(
      finiteOr(layout.y, CANVAS_AI_CHAT_VIEWPORT_MARGIN),
      CANVAS_AI_CHAT_VIEWPORT_MARGIN,
      maximumY,
    ),
  };
}

export function createCanvasAiChatLayout(
  anchor: { x: number; y: number },
  viewport: CanvasAiChatViewport,
): CanvasAiChatLayout {
  return clampCanvasAiChatLayout(
    {
      height: CANVAS_AI_CHAT_DEFAULT_HEIGHT,
      width: CANVAS_AI_CHAT_DEFAULT_WIDTH,
      x: anchor.x + 20,
      y: anchor.y + 20,
    },
    viewport,
  );
}

export function moveCanvasAiChatLayout(
  initialLayout: CanvasAiChatLayout,
  delta: { x: number; y: number },
  viewport: CanvasAiChatViewport,
): CanvasAiChatLayout {
  return clampCanvasAiChatLayout(
    {
      ...initialLayout,
      x: initialLayout.x + delta.x,
      y: initialLayout.y + delta.y,
    },
    viewport,
  );
}

export function resizeCanvasAiChatLayout(
  initialLayout: CanvasAiChatLayout,
  direction: CanvasAiChatResizeDirection,
  delta: { x: number; y: number },
  viewport: CanvasAiChatViewport,
): CanvasAiChatLayout {
  const layout = clampCanvasAiChatLayout(initialLayout, viewport);
  const minimumWidth = Math.min(
    CANVAS_AI_CHAT_MIN_WIDTH,
    Math.max(0, viewport.width - CANVAS_AI_CHAT_VIEWPORT_MARGIN * 2),
  );
  const minimumHeight = Math.min(
    CANVAS_AI_CHAT_MIN_HEIGHT,
    Math.max(0, viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN * 2),
  );
  const nextLayout = { ...layout };

  if (direction.includes("e")) {
    nextLayout.width = clamp(
      layout.width + delta.x,
      minimumWidth,
      viewport.width - CANVAS_AI_CHAT_VIEWPORT_MARGIN - layout.x,
    );
  }

  if (direction.includes("s")) {
    nextLayout.height = clamp(
      layout.height + delta.y,
      minimumHeight,
      viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN - layout.y,
    );
  }

  if (direction.includes("w")) {
    const right = layout.x + layout.width;
    nextLayout.x = clamp(
      layout.x + delta.x,
      CANVAS_AI_CHAT_VIEWPORT_MARGIN,
      right - minimumWidth,
    );
    nextLayout.width = right - nextLayout.x;
  }

  if (direction.includes("n")) {
    const bottom = layout.y + layout.height;
    nextLayout.y = clamp(
      layout.y + delta.y,
      CANVAS_AI_CHAT_VIEWPORT_MARGIN,
      bottom - minimumHeight,
    );
    nextLayout.height = bottom - nextLayout.y;
  }

  return clampCanvasAiChatLayout(nextLayout, viewport);
}

export function parseCanvasAiChatLayout(value: string | null): CanvasAiChatLayout | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<CanvasAiChatLayout>;
    if (
      typeof parsed.x !== "number"
      || typeof parsed.y !== "number"
      || typeof parsed.width !== "number"
      || typeof parsed.height !== "number"
    ) {
      return null;
    }

    return {
      height: parsed.height,
      width: parsed.width,
      x: parsed.x,
      y: parsed.y,
    };
  } catch {
    return null;
  }
}
