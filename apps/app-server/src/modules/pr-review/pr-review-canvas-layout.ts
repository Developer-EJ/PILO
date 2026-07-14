export type PrReviewCanvasRoutePoint = {
  x: number;
  y: number;
};

export type PrReviewCanvasLayoutFile = {
  roomFileId: string;
  flowId: string | null;
  width: number;
  height: number;
  flowSortOrder: number;
  workflowOrder: number;
  filePath: string;
};

export type PrReviewCanvasLayoutRelation = {
  id: string;
  fromRoomFileId: string;
  toRoomFileId: string;
  isReviewOrder: boolean;
};

export type PrReviewCanvasGraphLayout = {
  nodeGeometryByRoomFileId: Map<string, { x: number; y: number }>;
  routePointsByRelationId: Map<string, PrReviewCanvasRoutePoint[]>;
};

type NodeGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  flowKey: string;
  columnIndex: number;
};

const CANVAS_START_X = 160;
const CANVAS_START_Y = 160;
const FLOW_NODE_GAP_X = 184;
const FLOW_LANE_GAP_Y = 320;
const SAME_FLOW_ROUTE_OFFSET = 72;
const SAME_FLOW_ROUTE_GAP = 32;
const CROSS_FLOW_ROUTE_OFFSET = 52;
const CROSS_FLOW_GUTTER_OFFSET = 112;
const CROSS_FLOW_GUTTER_GAP = 40;

export async function buildPrReviewCanvasGraphLayout(input: {
  files: PrReviewCanvasLayoutFile[];
  relations: PrReviewCanvasLayoutRelation[];
}): Promise<PrReviewCanvasGraphLayout | null> {
  if (input.files.length === 0) {
    return null;
  }

  const files = [...input.files].sort(compareFiles);
  const geometryByRoomFileId = buildFlowGeometry(files);
  const routePointsByRelationId = buildOrthogonalRoutes(
    files,
    input.relations,
    geometryByRoomFileId
  );

  return {
    nodeGeometryByRoomFileId: new Map(
      [...geometryByRoomFileId].map(([roomFileId, geometry]) => [roomFileId, geometry])
    ),
    routePointsByRelationId
  };
}

function buildFlowGeometry(files: PrReviewCanvasLayoutFile[]) {
  const filesByFlowKey = new Map<string, PrReviewCanvasLayoutFile[]>();
  for (const file of files) {
    const flowKey = getFlowKey(file);
    const members = filesByFlowKey.get(flowKey) ?? [];
    members.push(file);
    filesByFlowKey.set(flowKey, members);
  }

  const flows = [...filesByFlowKey.entries()].sort(([leftKey, leftFiles], [rightKey, rightFiles]) => {
    const left = leftFiles[0];
    const right = rightFiles[0];
    return (
      left.flowSortOrder - right.flowSortOrder ||
      left.filePath.localeCompare(right.filePath) ||
      leftKey.localeCompare(rightKey)
    );
  });
  const geometryByRoomFileId = new Map<string, NodeGeometry>();

  for (const [flowIndex, [flowKey, members]] of flows.entries()) {
    const sortedMembers = [...members].sort(compareFilesInFlow);
    const y = CANVAS_START_Y + flowIndex * (getFlowHeight(sortedMembers) + FLOW_LANE_GAP_Y);
    let nextX = CANVAS_START_X;
    for (const [columnIndex, file] of sortedMembers.entries()) {
      geometryByRoomFileId.set(file.roomFileId, {
        x: nextX,
        y,
        width: file.width,
        height: file.height,
        flowKey,
        columnIndex
      });
      nextX += file.width + FLOW_NODE_GAP_X;
    }
  }

  return geometryByRoomFileId;
}

function buildOrthogonalRoutes(
  files: PrReviewCanvasLayoutFile[],
  relations: PrReviewCanvasLayoutRelation[],
  geometryByRoomFileId: Map<string, NodeGeometry>
) {
  const fileIds = new Set(files.map((file) => file.roomFileId));
  const validRelations = relations
    .filter(
      (relation) =>
        relation.fromRoomFileId !== relation.toRoomFileId &&
        fileIds.has(relation.fromRoomFileId) &&
        fileIds.has(relation.toRoomFileId)
    )
    .sort(compareRelations);
  const routePointsByRelationId = new Map<string, PrReviewCanvasRoutePoint[]>();
  const maxNodeRight = Math.max(
    ...[...geometryByRoomFileId.values()].map((geometry) => geometry.x + geometry.width)
  );
  const minNodeLeft = Math.min(
    ...[...geometryByRoomFileId.values()].map((geometry) => geometry.x)
  );
  const sameFlowTrackByFlowKey = new Map<string, number>();
  let crossFlowTrack = 0;

  for (const relation of validRelations) {
    const from = geometryByRoomFileId.get(relation.fromRoomFileId);
    const to = geometryByRoomFileId.get(relation.toRoomFileId);
    if (!from || !to) {
      continue;
    }

    if (isAdjacentReviewOrder(relation, from, to)) {
      routePointsByRelationId.set(relation.id, [
        { x: from.x + from.width, y: getCenterY(from) },
        { x: to.x, y: getCenterY(to) }
      ]);
      continue;
    }

    if (from.flowKey === to.flowKey) {
      const track = sameFlowTrackByFlowKey.get(from.flowKey) ?? 0;
      sameFlowTrackByFlowKey.set(from.flowKey, track + 1);
      routePointsByRelationId.set(
        relation.id,
        buildSameFlowRoute(from, to, track)
      );
      continue;
    }

    routePointsByRelationId.set(
      relation.id,
      buildCrossFlowRoute(from, to, crossFlowTrack, minNodeLeft, maxNodeRight)
    );
    crossFlowTrack += 1;
  }

  return routePointsByRelationId;
}

function buildSameFlowRoute(from: NodeGeometry, to: NodeGeometry, track: number) {
  const trackY = Math.min(from.y, to.y) - SAME_FLOW_ROUTE_OFFSET - track * SAME_FLOW_ROUTE_GAP;
  return deduplicateRoutePoints([
    { x: getCenterX(from), y: from.y },
    { x: getCenterX(from), y: trackY },
    { x: getCenterX(to), y: trackY },
    { x: getCenterX(to), y: to.y }
  ]);
}

function buildCrossFlowRoute(
  from: NodeGeometry,
  to: NodeGeometry,
  track: number,
  minNodeLeft: number,
  maxNodeRight: number
) {
  const movesDown = to.y > from.y;
  const sourceExitY = movesDown
    ? from.y + from.height + CROSS_FLOW_ROUTE_OFFSET
    : from.y - CROSS_FLOW_ROUTE_OFFSET;
  const targetEntryY = movesDown
    ? to.y - CROSS_FLOW_ROUTE_OFFSET
    : to.y + to.height + CROSS_FLOW_ROUTE_OFFSET;
  const useRightGutter = track % 2 === 0;
  const gutterOffset =
    CROSS_FLOW_GUTTER_OFFSET + Math.floor(track / 2) * CROSS_FLOW_GUTTER_GAP;
  const gutterX = useRightGutter
    ? maxNodeRight + gutterOffset
    : minNodeLeft - gutterOffset;
  const sourceY = movesDown ? from.y + from.height : from.y;
  const targetY = movesDown ? to.y : to.y + to.height;

  return deduplicateRoutePoints([
    { x: getCenterX(from), y: sourceY },
    { x: getCenterX(from), y: sourceExitY },
    { x: gutterX, y: sourceExitY },
    { x: gutterX, y: targetEntryY },
    { x: getCenterX(to), y: targetEntryY },
    { x: getCenterX(to), y: targetY }
  ]);
}

function isAdjacentReviewOrder(
  relation: PrReviewCanvasLayoutRelation,
  from: NodeGeometry,
  to: NodeGeometry
) {
  return (
    relation.isReviewOrder &&
    from.flowKey === to.flowKey &&
    to.columnIndex === from.columnIndex + 1
  );
}

function getFlowHeight(files: PrReviewCanvasLayoutFile[]) {
  return Math.max(...files.map((file) => file.height));
}

function getFlowKey(file: PrReviewCanvasLayoutFile) {
  return file.flowId ?? `unassigned:${file.flowSortOrder}`;
}

function getCenterX(geometry: NodeGeometry) {
  return geometry.x + geometry.width / 2;
}

function getCenterY(geometry: NodeGeometry) {
  return geometry.y + geometry.height / 2;
}

function deduplicateRoutePoints(
  points: readonly PrReviewCanvasRoutePoint[]
): PrReviewCanvasRoutePoint[] {
  return points.reduce<PrReviewCanvasRoutePoint[]>((result, point) => {
    const previous = result[result.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      result.push({ x: point.x, y: point.y });
    }
    return result;
  }, []);
}

function compareFiles(left: PrReviewCanvasLayoutFile, right: PrReviewCanvasLayoutFile) {
  return (
    left.flowSortOrder - right.flowSortOrder ||
    left.workflowOrder - right.workflowOrder ||
    left.filePath.localeCompare(right.filePath) ||
    left.roomFileId.localeCompare(right.roomFileId)
  );
}

function compareFilesInFlow(left: PrReviewCanvasLayoutFile, right: PrReviewCanvasLayoutFile) {
  return (
    left.workflowOrder - right.workflowOrder ||
    left.filePath.localeCompare(right.filePath) ||
    left.roomFileId.localeCompare(right.roomFileId)
  );
}

function compareRelations(
  left: PrReviewCanvasLayoutRelation,
  right: PrReviewCanvasLayoutRelation
) {
  return (
    Number(right.isReviewOrder) - Number(left.isReviewOrder) ||
    left.fromRoomFileId.localeCompare(right.fromRoomFileId) ||
    left.toRoomFileId.localeCompare(right.toRoomFileId) ||
    left.id.localeCompare(right.id)
  );
}
