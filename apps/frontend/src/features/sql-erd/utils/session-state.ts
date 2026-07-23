import type {
  SqlErdSelection,
  SqltoerdSessionPayload,
  SqltoerdSessionFixture
} from "@/features/sql-erd/types";

export type SqlErdViewSession = Pick<
  SqltoerdSessionPayload,
  | "dialect"
  | "layoutJson"
  | "modelJson"
  | "settingsJson"
  | "sourceFormat"
  | "sourceText"
  | "title"
  | "latestOpSeq"
  | "writeProtocol"
> & {
  id: string | null;
  revision: number | null;
};

export type SqlErdSessionLoadState = {
  label: string;
  message: string;
  tone: "error" | "neutral" | "success";
};

export type LayoutAutosaveBlockReason =
  | "conflict"
  | "write_protocol_mismatch"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_payload"
  | "unknown_non_transient";

export type LayoutAutosavePausedBannerViewModel = {
  canRetry: boolean;
  message: string;
  reason: LayoutAutosaveBlockReason;
};

export type SqlErdAutosaveGateState = {
  activeGeneration: number | null;
  completionEpoch: number;
};

export const SQL_ERD_LAYOUT_AUTOSAVE_DEBOUNCE_MS = 2000;
export const SQL_ERD_LAYOUT_AUTOSAVE_MAX_RETRY_DELAY_MS = 30000;

export type SqlErdSessionReloadFailureAction =
  | {
      kind: "fallback_to_sample";
      sessionLoadState: SqlErdSessionLoadState;
      selectedSqlErdObject: SqlErdSelection;
    }
  | {
      kind: "preserve_current";
      sessionLoadState: SqlErdSessionLoadState;
    };

export function createSampleSqlErdViewSession(
  fixture: SqltoerdSessionFixture
): SqlErdViewSession {
  return {
    id: null,
    latestOpSeq: 0,
    revision: null,
    title: fixture.title,
    writeProtocol: "snapshot",
    sourceFormat: fixture.sourceFormat,
    dialect: fixture.dialect,
    sourceText: fixture.sourceText,
    modelJson: fixture.modelJson,
    layoutJson: fixture.layoutJson,
    settingsJson: fixture.settingsJson
  };
}

export function createWorkspaceSqlErdViewSession(
  session: SqltoerdSessionPayload
): SqlErdViewSession {
  return {
    id: session.id,
    latestOpSeq: session.latestOpSeq,
    revision: session.revision,
    title: session.title,
    writeProtocol: session.writeProtocol,
    sourceFormat: session.sourceFormat,
    dialect: session.dialect,
    sourceText: session.sourceText,
    modelJson: session.modelJson,
    layoutJson: session.layoutJson,
    settingsJson: session.settingsJson
  };
}

export function getLayoutAutosaveBlockReasonForStatus(
  status: number | null | undefined
): LayoutAutosaveBlockReason | null {
  if (status === 409) {
    return "conflict";
  }

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not_found";
  }

  if (status === 400 || status === 413) {
    return "invalid_payload";
  }

  if (typeof status !== "number") {
    return null;
  }

  if (status === 408 || status === 429 || status >= 500) {
    return null;
  }

  return "unknown_non_transient";
}

export function getLayoutAutosaveBlockReasonForApiError({
  code,
  status
}: {
  code?: string;
  status?: number | null;
}): LayoutAutosaveBlockReason | null {
  if (code === "SQL_ERD_WRITE_PROTOCOL_MISMATCH") {
    return "write_protocol_mismatch";
  }

  return getLayoutAutosaveBlockReasonForStatus(status);
}

export function isLayoutAutosaveTransientStatus(
  status: number | null | undefined
) {
  return getLayoutAutosaveBlockReasonForStatus(status) === null;
}

export function getLayoutAutosaveDelayMs(retryAttempt: number) {
  return Math.min(
    SQL_ERD_LAYOUT_AUTOSAVE_DEBOUNCE_MS * 2 ** retryAttempt,
    SQL_ERD_LAYOUT_AUTOSAVE_MAX_RETRY_DELAY_MS
  );
}

export function getLayoutAutosavePausedBanner(
  reason: LayoutAutosaveBlockReason
): LayoutAutosavePausedBannerViewModel {
  if (reason === "write_protocol_mismatch") {
    return {
      canRetry: false,
      message:
        "쓰기 프로토콜이 변경되었습니다. 최신 세션을 다시 불러올 때까지 이 탭은 읽기 전용입니다.",
      reason
    };
  }

  if (reason === "conflict") {
    return {
      canRetry: false,
      message:
        "Workspace 세션이 변경되었습니다. 이 layout을 저장하기 전에 최신 세션을 다시 불러오세요.",
      reason
    };
  }

  if (reason === "unauthorized") {
    return {
      canRetry: false,
      message: "다시 로그인한 뒤 SQLtoERD 세션을 불러오세요.",
      reason
    };
  }

  if (reason === "forbidden") {
    return {
      canRetry: false,
      message: "이 SQLtoERD 세션을 저장할 권한이 없습니다.",
      reason
    };
  }

  if (reason === "not_found") {
    return {
      canRetry: false,
      message:
        "SQLtoERD 세션이 삭제되었거나 존재하지 않습니다. 세션을 다시 불러오세요.",
      reason
    };
  }

  if (reason === "invalid_payload") {
    return {
      canRetry: true,
      message:
        "현재 layout을 자동 저장할 수 없습니다. 테이블을 다시 이동하거나 세션을 다시 불러오세요.",
      reason
    };
  }

  return {
    canRetry: true,
    message:
      "재시도할 수 없는 오류로 자동 저장이 중지되었습니다. 한 번 다시 시도하거나 세션을 다시 불러오세요.",
    reason
  };
}

export function getSqlErdSessionReloadFailureAction({
  fallbackToSampleOnFailure
}: {
  fallbackToSampleOnFailure: boolean;
}): SqlErdSessionReloadFailureAction {
  if (fallbackToSampleOnFailure) {
    return {
      kind: "fallback_to_sample",
      selectedSqlErdObject: { type: "none" },
      sessionLoadState: {
        label: "샘플",
        message:
          "Workspace 세션을 불러오지 못해 기본 샘플을 표시합니다.",
        tone: "neutral"
      }
    };
  }

  return {
    kind: "preserve_current",
    sessionLoadState: {
      label: "다시 불러오기 실패",
      message:
        "Workspace 세션을 다시 불러오지 못했습니다. 현재 ERD를 계속 편집하거나 다시 시도하세요.",
      tone: "error"
    }
  };
}

export function getSqlErdSessionLoadFailureState({
  hasLoadedSession
}: {
  hasLoadedSession: boolean;
}): SqlErdSessionLoadState {
  if (!hasLoadedSession) {
    return {
      label: "불러오기 실패",
      message:
        "Workspace 세션을 불러오지 못했습니다. 다시 시도하거나 세션 목록으로 돌아가세요.",
      tone: "error"
    };
  }

  return getSqlErdSessionReloadFailureAction({
    fallbackToSampleOnFailure: false
  }).sessionLoadState;
}

export function shouldApplySqlErdSessionLoadResult(
  requestId: number,
  currentRequestId: number
) {
  return requestId === currentRequestId;
}

export function isSqlErdAutosaveRequestCurrent({
  currentGeneration,
  currentSessionId,
  currentSnapshotSessionId,
  requestGeneration,
  requestSessionId
}: {
  currentGeneration: number;
  currentSessionId: string;
  currentSnapshotSessionId: string | null;
  requestGeneration: number;
  requestSessionId: string;
}) {
  return (
    requestGeneration === currentGeneration &&
    requestSessionId === currentSessionId &&
    requestSessionId === currentSnapshotSessionId
  );
}

export function tryBeginSqlErdAutosave({
  requestGeneration,
  state
}: {
  requestGeneration: number;
  state: SqlErdAutosaveGateState;
}) {
  if (
    state.activeGeneration !== null &&
    requestGeneration <= state.activeGeneration
  ) {
    return { accepted: false, state };
  }

  return {
    accepted: true,
    state: {
      ...state,
      activeGeneration: requestGeneration
    }
  };
}

export function completeSqlErdAutosave({
  requestGeneration,
  state
}: {
  requestGeneration: number;
  state: SqlErdAutosaveGateState;
}) {
  if (state.activeGeneration !== requestGeneration) {
    return { completed: false, state };
  }

  return {
    completed: true,
    state: {
      activeGeneration: null,
      completionEpoch: state.completionEpoch + 1
    }
  };
}
