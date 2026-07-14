import type {
  SqltoerdLayoutJsonV1,
  SqltoerdLayoutPatch
} from "@/features/sql-erd/types";

type CollectionPatch = { deleteIds?: string[]; upsert?: unknown[] };

function collectionPatch(
  deleteIds: readonly string[] | undefined,
  idsToUpsert: string[] | undefined,
  values: { id: string }[] | undefined
): CollectionPatch | undefined {
  const upsert = idsToUpsert?.flatMap((id) => {
    const value = values?.find((entry) => entry.id === id);
    return value ? [value] : [];
  });
  if (!(deleteIds?.length ?? 0) && !(upsert?.length ?? 0)) return undefined;
  return { ...(deleteIds?.length ? { deleteIds: [...deleteIds] } : {}), ...(upsert?.length ? { upsert } : {}) };
}

export function createSqlErdOperationLayoutPatch(
  patch: SqltoerdLayoutPatch,
  nextLayout: SqltoerdLayoutJsonV1
): Record<string, unknown> {
  const annotations = nextLayout.annotations;
  const annotationPatch = {
    frames: collectionPatch(
      patch.deleteFrameIds,
      [...Object.keys(patch.framesById ?? {}), ...(patch.framesToAdd ?? []).map((entry) => entry.id)],
      annotations?.frames
    ),
    links: collectionPatch(
      patch.deleteLinkIds,
      [...Object.keys(patch.linksById ?? {}), ...(patch.linksToAdd ?? []).map((entry) => entry.id)],
      annotations?.links
    ),
    notes: collectionPatch(
      patch.deleteNoteIds,
      [...Object.keys(patch.notesById ?? {}), ...(patch.notesToAdd ?? []).map((entry) => entry.id)],
      annotations?.notes
    ),
    strokes: collectionPatch(
      patch.deleteStrokeIds,
      (patch.strokesToAdd ?? []).map((entry) => entry.id),
      annotations?.strokes
    ),
    texts: collectionPatch(
      patch.deleteTextIds,
      [...Object.keys(patch.textsById ?? {}), ...(patch.textsToAdd ?? []).map((entry) => entry.id)],
      annotations?.texts
    )
  };
  const definedAnnotations = Object.fromEntries(
    Object.entries(annotationPatch).filter(([, value]) => value !== undefined)
  );
  const tableLayouts = patch.tablePositions?.length
    ? { upsert: patch.tablePositions }
    : undefined;

  return {
    ...(tableLayouts ? { tableLayouts } : {}),
    ...(Object.keys(definedAnnotations).length ? { annotations: definedAnnotations } : {})
  };
}

function fullCollectionPatch(
  previous: { id: string }[] | undefined,
  next: { id: string }[] | undefined
): CollectionPatch | undefined {
  const deleteIds = (previous ?? [])
    .filter((entry) => !(next ?? []).some((nextEntry) => nextEntry.id === entry.id))
    .map((entry) => entry.id);
  if (!deleteIds.length && !(next?.length ?? 0)) return undefined;
  return { ...(deleteIds.length ? { deleteIds } : {}), ...(next?.length ? { upsert: next } : {}) };
}

export function createSqlErdFullOperationLayoutPatch(
  previousLayout: SqltoerdLayoutJsonV1,
  nextLayout: SqltoerdLayoutJsonV1
): Record<string, unknown> {
  const previousAnnotations = previousLayout.annotations;
  const nextAnnotations = nextLayout.annotations;
  const annotations = Object.fromEntries(
    (["links", "notes", "frames", "texts", "strokes"] as const)
      .map((name) => [
        name,
        fullCollectionPatch(previousAnnotations?.[name], nextAnnotations?.[name])
      ])
      .filter(([, patch]) => patch !== undefined)
  );
  const previousTableIds = new Set(previousLayout.tableLayouts.map((entry) => entry.tableId));
  const nextTableIds = new Set(nextLayout.tableLayouts.map((entry) => entry.tableId));
  const deletedTableIds = [...previousTableIds].filter((id) => !nextTableIds.has(id));

  return {
    ...(nextLayout.tableLayouts.length || deletedTableIds.length
      ? {
          tableLayouts: {
            ...(deletedTableIds.length ? { deleteIds: deletedTableIds } : {}),
            ...(nextLayout.tableLayouts.length ? { upsert: nextLayout.tableLayouts } : {})
          }
        }
      : {}),
    ...(Object.keys(annotations).length ? { annotations } : {}),
    ...(nextLayout.viewport
      ? { viewport: { action: "set", value: nextLayout.viewport } }
      : previousLayout.viewport
        ? { viewport: { action: "delete" } }
        : {})
  };
}
