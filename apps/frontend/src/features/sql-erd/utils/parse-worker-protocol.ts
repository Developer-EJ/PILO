import type {
  SqltoerdDialect,
  SqltoerdLayoutJsonV1,
  SqltoerdModelJsonV1,
  SqltoerdResolvedDialect
} from "@/features/sql-erd/types";
import {
  parseSqlDdlToErdModel,
  type SqltoerdDdlParseError
} from "@/features/sql-erd/utils/ddl-parser";
import { createSqltoerdLayoutForModel } from "@/features/sql-erd/utils/model";
import type { SqltoerdSourceMap } from "@/features/sql-erd/utils/sql-source-map";

export type ParseWorkerRequest = {
  dialect: SqltoerdDialect;
  previousLayoutJson: SqltoerdLayoutJsonV1;
  previousModelJson: SqltoerdModelJsonV1;
  requestSequence: number;
  sessionId: string;
  sourceText: string;
};

export type ParseWorkerResponse =
  | {
      layoutJson: SqltoerdLayoutJsonV1;
      modelJson: SqltoerdModelJsonV1;
      ok: true;
      requestSequence: number;
      resolvedDialect: SqltoerdResolvedDialect;
      sessionId: string;
      sourceMap: SqltoerdSourceMap;
    }
  | {
      error: SqltoerdDdlParseError;
      ok: false;
      requestSequence: number;
      sessionId: string;
    };

export function executeSqlErdParseWorkerRequest(
  request: ParseWorkerRequest
): ParseWorkerResponse {
  const parseResult = parseSqlDdlToErdModel({
    dialect: request.dialect,
    sourceText: request.sourceText
  });

  if (!parseResult.ok) {
    return {
      error: parseResult.error,
      ok: false,
      requestSequence: request.requestSequence,
      sessionId: request.sessionId
    };
  }

  return {
    layoutJson: createSqltoerdLayoutForModel(
      parseResult.modelJson,
      request.previousLayoutJson
    ),
    modelJson: parseResult.modelJson,
    ok: true,
    requestSequence: request.requestSequence,
    resolvedDialect: parseResult.resolvedDialect,
    sessionId: request.sessionId,
    sourceMap: parseResult.sourceMap
  };
}
