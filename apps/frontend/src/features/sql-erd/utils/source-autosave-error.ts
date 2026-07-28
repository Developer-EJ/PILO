import {
  getLayoutAutosaveBlockReasonForApiError,
  type LayoutAutosaveBlockReason
} from "@/features/sql-erd/utils/session-state";

export type SqlErdSourceAutosaveErrorInput = {
  code?: string;
  path?: string;
  status?: number | null;
};

export type SqlErdSourceAutosaveErrorAction =
  | { kind: "layout_block"; reason: LayoutAutosaveBlockReason }
  | { kind: "retry" }
  | { kind: "source_conflict" };

export function classifySqlErdSourceAutosaveError({
  code,
  path,
  status
}: SqlErdSourceAutosaveErrorInput): SqlErdSourceAutosaveErrorAction {
  const layoutBlockReason = getLayoutAutosaveBlockReasonForApiError({
    code,
    status
  });

  if (layoutBlockReason === "write_protocol_mismatch") {
    return { kind: "layout_block", reason: layoutBlockReason };
  }

  if (status === 409 && path?.endsWith("/source-snapshots")) {
    return { kind: "source_conflict" };
  }

  if (layoutBlockReason) {
    return { kind: "layout_block", reason: layoutBlockReason };
  }

  return { kind: "retry" };
}
