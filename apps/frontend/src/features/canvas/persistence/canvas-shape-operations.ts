import diff from "microdiff";

export type CanvasFreeformShapeSnapshot = {
  id?: unknown;
  parentId?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  rotation?: unknown;
  props?: unknown;
  [key: string]: unknown;
};

export type CanvasShapePayload = {
  id: string;
  parentShapeId: string | null;
  shapeType: string;
  title: string | null;
  textContent: string | null;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  rotation: number;
  zIndex: number;
  rawShape: Record<string, unknown>;
  contentHash?: string;
  revision?: number;
};

export type CanvasShapeSyncOperation =
  | {
      baseRevision?: number | null;
      clientOperationId: string;
      type: "create";
      shapeId: string;
      payload: CanvasShapePayload;
    }
  | {
      baseRevision: number | null;
      clientOperationId: string;
      type: "update";
      shapeId: string;
      payload: CanvasShapePayload;
    }
  | {
      baseRevision: number | null;
      clientOperationId: string;
      type: "delete";
      shapeId: string;
    };


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCanvasShapeRevision(shape: CanvasFreeformShapeSnapshot | undefined) {
  const revision = shape?.revision;

  return typeof revision === "number" && Number.isInteger(revision) && revision > 0
    ? revision
    : null;
}

function resolveCanvasShapeBaseRevision({
  getBaseRevision,
  shape,
  shapeId,
}: {
  getBaseRevision?: (shapeId: string) => number | null;
  shape: CanvasFreeformShapeSnapshot | undefined;
  shapeId: string;
}) {
  if (!getBaseRevision) return null;

  const localRevision = readCanvasShapeRevision(shape);
  const remoteRevision = getBaseRevision(shapeId);

  if (localRevision === null) return remoteRevision;
  if (remoteRevision === null) return localRevision;

  return Math.max(localRevision, remoteRevision);
}

function readFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readNullableSize(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function cloneRawShape(shape: CanvasFreeformShapeSnapshot) {
  return JSON.parse(JSON.stringify(shape)) as Record<string, unknown>;
}

function readRichTextPlainText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.content)) return null;

  const paragraphs = value.content.flatMap((block) => {
    if (!isRecord(block) || !Array.isArray(block.content)) return [];

    return block.content.flatMap((node) =>
      isRecord(node) && typeof node.text === "string" ? [node.text] : [],
    );
  });

  return paragraphs.length ? paragraphs.join("\n") : null;
}

function resolveParentShapeId(parentId: unknown) {
  return typeof parentId === "string" && parentId.startsWith("shape:")
    ? parentId
    : null;
}

function createCanvasClientOperationId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `op_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function hasCanvasFreeformShapeChanged(
  previousShape: CanvasFreeformShapeSnapshot,
  nextShape: CanvasFreeformShapeSnapshot,
) {
  return diff(previousShape, nextShape).length > 0;
}

export function areCanvasFreeformShapesEqual(
  previousShapes: CanvasFreeformShapeSnapshot[],
  nextShapes: CanvasFreeformShapeSnapshot[],
) {
  if (previousShapes.length !== nextShapes.length) {
    return false;
  }

  for (let index = 0; index < previousShapes.length; index += 1) {
    const previousShape = previousShapes[index];
    const nextShape = nextShapes[index];

    if (previousShape?.id !== nextShape?.id) {
      return false;
    }

    if (hasCanvasFreeformShapeChanged(previousShape, nextShape)) {
      return false;
    }
  }

  return true;
}

function toShapeMap(shapes: CanvasFreeformShapeSnapshot[]) {
  return new Map(
    shapes
      .filter((shape) => typeof shape.id === "string")
      .map((shape) => [shape.id as string, shape]),
  );
}

export function toCanvasShapePayload(
  shape: CanvasFreeformShapeSnapshot,
  zIndex: number,
): CanvasShapePayload {
  const props = isRecord(shape.props) ? shape.props : {};
  const title =
    typeof props.name === "string"
      ? props.name
      : typeof props.fileName === "string"
        ? props.fileName
        : null;
  const textContent =
    typeof props.text === "string"
      ? props.text
      : typeof props.code === "string"
        ? props.code
        : readRichTextPlainText(props.richText);

  return {
    id: typeof shape.id === "string" ? shape.id : "",
    parentShapeId: resolveParentShapeId(shape.parentId),
    shapeType: typeof shape.type === "string" ? shape.type : "",
    title,
    textContent,
    x: readFiniteNumber(shape.x, 0),
    y: readFiniteNumber(shape.y, 0),
    width: readNullableSize(props.w),
    height: readNullableSize(props.h),
    rotation: readFiniteNumber(shape.rotation, 0),
    zIndex,
    rawShape: cloneRawShape(shape),
  };
}

export function buildCanvasShapeSyncOperations(
  previousShapes: CanvasFreeformShapeSnapshot[],
  nextShapes: CanvasFreeformShapeSnapshot[],
  options: {
    getBaseRevision?: (shapeId: string) => number | null;
  } = {},
): CanvasShapeSyncOperation[] {
  const previousShapeMap = toShapeMap(previousShapes);
  const nextShapeMap = toShapeMap(nextShapes);
  const operations: CanvasShapeSyncOperation[] = [];

  nextShapes.forEach((shape, zIndex) => {
    if (typeof shape.id !== "string") return;

    const previousShape = previousShapeMap.get(shape.id);
    const payload = toCanvasShapePayload(shape, zIndex);

    if (!previousShape) {
      operations.push({
        baseRevision: null,
        clientOperationId: createCanvasClientOperationId(),
        type: "create",
        shapeId: shape.id,
        payload,
      });
      return;
    }

    if (hasCanvasFreeformShapeChanged(previousShape, shape)) {
      operations.push({
        baseRevision: resolveCanvasShapeBaseRevision({
          getBaseRevision: options.getBaseRevision,
          shape: previousShape,
          shapeId: shape.id,
        }),
        clientOperationId: createCanvasClientOperationId(),
        type: "update",
        shapeId: shape.id,
        payload,
      });
    }
  });

  previousShapes.forEach((shape) => {
    if (typeof shape.id !== "string") return;
    if (nextShapeMap.has(shape.id)) return;

    operations.push({
      baseRevision: resolveCanvasShapeBaseRevision({
        getBaseRevision: options.getBaseRevision,
        shape,
        shapeId: shape.id,
      }),
      clientOperationId: createCanvasClientOperationId(),
      type: "delete",
      shapeId: shape.id,
    });
  });

  return operations;
}
