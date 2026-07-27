import type { PiloCanvasFreeformShape } from "../canvas-engine-types";

type CanvasShapeSerializableMetadata = {
  contentHash?: unknown;
  revision?: unknown;
};

export type CanvasRoomShapeMetadataFallback = {
  contentHashes?: Map<string, string>;
  revisions?: Map<string, number>;
};

export function readCanvasRoomStateRevision(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function readCanvasRoomStateContentHash(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export function serializeCanvasRoomStateShape(
  shape: PiloCanvasFreeformShape,
  fallback: CanvasRoomShapeMetadataFallback = {},
) {
  const shapeRecord = shape as Record<string, unknown> &
    CanvasShapeSerializableMetadata;
  const serializedShape: Record<string, unknown> = { ...shapeRecord };
  const shapeId = typeof shapeRecord.id === "string" ? shapeRecord.id : null;
  const revision =
    readCanvasRoomStateRevision(shapeRecord.revision) ??
    (shapeId ? fallback.revisions?.get(shapeId) ?? null : null);
  const contentHash =
    readCanvasRoomStateContentHash(shapeRecord.contentHash) ??
    (shapeId ? fallback.contentHashes?.get(shapeId) ?? null : null);

  if (revision !== null) {
    serializedShape.revision = revision;
  }

  if (contentHash) {
    serializedShape.contentHash = contentHash;
  }

  return serializedShape;
}

export function serializeCanvasRoomStateShapes(
  shapes: PiloCanvasFreeformShape[],
  fallback?: CanvasRoomShapeMetadataFallback,
) {
  return shapes.map((shape) => serializeCanvasRoomStateShape(shape, fallback));
}
