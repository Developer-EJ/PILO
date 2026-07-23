import assert from "node:assert/strict";
import {
  CANVAS_AI_CHAT_MIN_HEIGHT,
  CANVAS_AI_CHAT_MIN_WIDTH,
  CANVAS_AI_CHAT_VIEWPORT_MARGIN,
  createCanvasAiChatLayout,
  moveCanvasAiChatLayout,
  parseCanvasAiChatLayout,
  resizeCanvasAiChatLayout,
} from "./canvas-ai-chat-layout.ts";

const viewport = { height: 800, width: 1200 };

{
  const layout = createCanvasAiChatLayout({ x: 1180, y: 780 }, viewport);

  assert.equal(layout.x + layout.width, viewport.width - CANVAS_AI_CHAT_VIEWPORT_MARGIN);
  assert.equal(layout.y + layout.height, viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN);
}

{
  const layout = moveCanvasAiChatLayout(
    { height: 440, width: 360, x: 200, y: 180 },
    { x: -1000, y: 1000 },
    viewport,
  );

  assert.equal(layout.x, CANVAS_AI_CHAT_VIEWPORT_MARGIN);
  assert.equal(layout.y + layout.height, viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN);
}

{
  const layout = resizeCanvasAiChatLayout(
    { height: 440, width: 360, x: 200, y: 180 },
    "se",
    { x: 2000, y: 2000 },
    viewport,
  );

  assert.equal(layout.x + layout.width, viewport.width - CANVAS_AI_CHAT_VIEWPORT_MARGIN);
  assert.equal(layout.y + layout.height, viewport.height - CANVAS_AI_CHAT_VIEWPORT_MARGIN);
}

{
  const initialLayout = { height: 440, width: 360, x: 200, y: 180 };
  const right = initialLayout.x + initialLayout.width;
  const bottom = initialLayout.y + initialLayout.height;
  const layout = resizeCanvasAiChatLayout(
    initialLayout,
    "nw",
    { x: 1000, y: 1000 },
    viewport,
  );

  assert.equal(layout.width, CANVAS_AI_CHAT_MIN_WIDTH);
  assert.equal(layout.height, CANVAS_AI_CHAT_MIN_HEIGHT);
  assert.equal(layout.x + layout.width, right);
  assert.equal(layout.y + layout.height, bottom);
}

{
  assert.deepEqual(
    parseCanvasAiChatLayout('{"x":10,"y":20,"width":500,"height":600}'),
    { height: 600, width: 500, x: 10, y: 20 },
  );
  assert.equal(parseCanvasAiChatLayout("not-json"), null);
  assert.equal(parseCanvasAiChatLayout('{"x":10}'), null);
}
