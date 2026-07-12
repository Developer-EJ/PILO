import type { TLShape } from "tldraw";

import { isSqlErdAnnotationShape } from "@/features/sql-erd/shapes/sql-erd-annotation-shape";
import { isSqlErdRelationShape } from "@/features/sql-erd/shapes/sql-erd-relation-shape";
import { isSqlErdTableShape } from "@/features/sql-erd/shapes/sql-erd-table-shape";
import type { SqlErdSelection } from "@/features/sql-erd/types";

export function getSqlErdSelectionFromSelectedShapes(
  selectedShapes: TLShape[]
): SqlErdSelection {
  if (selectedShapes.length !== 1) {
    return { type: "none" };
  }

  const [selectedShape] = selectedShapes;

  if (isSqlErdAnnotationShape(selectedShape)) {
    return {
      type: "annotation",
      annotationId: selectedShape.props.annotationId
    };
  }

  if (isSqlErdRelationShape(selectedShape)) {
    return {
      type: "relation",
      relationId: selectedShape.props.relationId
    };
  }

  if (isSqlErdTableShape(selectedShape)) {
    if (
      selectedShape.props.selectedState === "column" &&
      selectedShape.props.selectedColumnId
    ) {
      return {
        type: "column",
        tableId: selectedShape.props.tableId,
        columnId: selectedShape.props.selectedColumnId
      };
    }

    return {
      type: "table",
      tableId: selectedShape.props.tableId
    };
  }

  return { type: "none" };
}
