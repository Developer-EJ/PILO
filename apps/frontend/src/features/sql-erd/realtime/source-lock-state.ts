export type SqlErdSourceLockIntervalRequest = "acquire" | "renew" | null;

export type SqlErdSourceLockIntent = {
  enabled: boolean;
  hasDirtyDraft: boolean;
  hasPendingSave: boolean;
  isEditorEngaged: boolean;
  isMutationApplying: boolean;
  isMutationPreviewOpen: boolean;
};

export function shouldHoldSqlErdSourceLock({
  enabled,
  hasDirtyDraft,
  hasPendingSave,
  isEditorEngaged,
  isMutationApplying,
  isMutationPreviewOpen
}: SqlErdSourceLockIntent) {
  return (
    enabled &&
    (hasDirtyDraft ||
      hasPendingSave ||
      isEditorEngaged ||
      isMutationApplying ||
      isMutationPreviewOpen)
  );
}

export function getSourceLockIntervalRequest(
  status: "acquiring" | "disabled" | "held" | "read_only"
): SqlErdSourceLockIntervalRequest {
  if (status === "held") return "renew";
  if (status === "read_only") return "acquire";
  return null;
}
