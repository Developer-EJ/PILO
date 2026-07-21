import type {
  LayoutAutosaveBlockReason,
  SqlErdSessionLoadState
} from "@/features/sql-erd/utils/session-state";
import type { SqlErdParseState } from "@/features/sql-erd/utils/sql-edit-state";

export type SqlErdGenerateErrorCode =
  | "EMPTY_SOURCE"
  | "UNSUPPORTED_DIALECT"
  | "PARSE_FAILED"
  | "NO_CREATE_TABLE"
  | "SOURCE_TOO_LARGE";

export function getSqlErdGenerateErrorMessage(
  errorCode: SqlErdGenerateErrorCode | string
) {
  if (errorCode === "EMPTY_SOURCE") {
    return "ERD를 생성하려면 CREATE TABLE 문을 하나 이상 입력하세요.";
  }

  if (errorCode === "UNSUPPORTED_DIALECT") {
    return "지원하지 않는 SQL dialect입니다. PostgreSQL, MySQL 또는 SQLite를 선택하세요.";
  }

  if (errorCode === "NO_CREATE_TABLE") {
    return "SQLtoERD는 CREATE TABLE DDL을 지원합니다. CREATE TABLE 문을 하나 이상 추가하세요.";
  }

  if (errorCode === "SOURCE_TOO_LARGE") {
    return "SQL source가 너무 큽니다. 1 MiB 이하로 줄인 뒤 다시 시도하세요.";
  }

  return "SQL DDL을 파싱하지 못했습니다. CREATE TABLE 문법을 확인한 뒤 다시 시도하세요.";
}

export function getSqlErdSignInRequiredState(): SqlErdSessionLoadState {
  return {
    label: "로그인 필요",
    message: "SQLtoERD 세션을 Workspace에 저장하려면 로그인하세요.",
    tone: "error"
  };
}

export function getSqlErdWorkspaceSaveErrorState(): SqlErdSessionLoadState {
  return {
    label: "저장 오류",
    message:
      "Workspace 세션을 자동 저장하지 못했습니다. 연결을 확인하면 SQL 변경 사항을 자동으로 다시 저장합니다.",
    tone: "error"
  };
}

export type SqlErdSourceAutosaveState =
  | "idle"
  | "pending"
  | "retrying"
  | "saving";

export function getSqlErdSourceStatus({
  autosaveBlockReason,
  fallbackState,
  isDraftDirty,
  parse,
  sourceAutosaveState
}: {
  autosaveBlockReason: LayoutAutosaveBlockReason | null;
  fallbackState: SqlErdSessionLoadState;
  isDraftDirty: boolean;
  parse: SqlErdParseState;
  sourceAutosaveState: SqlErdSourceAutosaveState;
}): SqlErdSessionLoadState {
  if (parse.status === "error") {
    return {
      label: "파싱 오류",
      message: getSqlErdGenerateErrorMessage(
        parse.error?.code ?? "PARSE_FAILED"
      ),
      tone: "error"
    };
  }

  if (parse.status === "parsing") {
    return {
      label: "파싱 중",
      message: "SQL DDL을 파싱하는 중입니다.",
      tone: "neutral"
    };
  }

  if (isDraftDirty) {
    return {
      label: "파싱 대기",
      message: "SQL 변경 사항을 파싱할 때까지 기다리는 중입니다.",
      tone: "neutral"
    };
  }

  if (autosaveBlockReason) {
    return fallbackState;
  }

  if (sourceAutosaveState === "retrying") {
    return {
      label: "저장 재시도",
      message:
        "Workspace 세션을 자동 저장하지 못해 파싱된 SQL 변경 사항을 다시 저장하는 중입니다.",
      tone: "error"
    };
  }

  if (sourceAutosaveState === "saving") {
    return {
      label: "저장 중",
      message: "파싱된 SQL 변경 사항을 자동 저장하는 중입니다.",
      tone: "neutral"
    };
  }

  if (sourceAutosaveState === "pending") {
    return {
      label: "저장 대기",
      message: "파싱된 SQL 변경 사항을 자동 저장할 예정입니다.",
      tone: "neutral"
    };
  }

  return fallbackState;
}
