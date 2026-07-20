import type { SqlErdAgentSchemaProjection } from "./sql-erd-table-focus";

const MAX_PRIMARY_TABLES = 20;

export type SqlErdFocusResolution =
  | {
      kind: "focused";
      featureLabel: string;
      primaryTableRefs: string[];
      relatedTableRefs: string[];
      confidence: "high" | "medium" | "low";
      source: "deterministic" | "llm";
    }
  | {
      kind: "needs_clarification";
      reason:
        | "no_schema_match"
        | "ambiguous_schema_match"
        | "resolver_unavailable"
        | "invalid_resolver_result";
      question: string;
    };

export function resolveDeterministicSqlErdTableFocus(
  projection: SqlErdAgentSchemaProjection,
  featureQuery: string
): SqlErdFocusResolution | null {
  const normalizedQuery = normalize(featureQuery);
  const queryTerms = tokenize(featureQuery);
  const exactNameRefs = projection.tables
    .filter((table) => tableNameMatchesQuery(table.name, normalizedQuery, queryTerms))
    .map((table) => table.ref)
    .slice(0, MAX_PRIMARY_TABLES);

  if (exactNameRefs.length > 0) {
    return buildFocusedResolution(
      projection,
      featureQuery,
      exactNameRefs,
      "high",
      "deterministic"
    );
  }

  const evidenceMatches = projection.tables
    .map((table) => ({ ref: table.ref, score: evidenceScore(table, queryTerms) }))
    .filter((candidate) => candidate.score >= 4)
    .sort((left, right) => right.score - left.score);
  if (evidenceMatches.length === 1) {
    return buildFocusedResolution(
      projection,
      featureQuery,
      [evidenceMatches[0].ref],
      "medium",
      "deterministic"
    );
  }

  return null;
}

export function validateLlmSqlErdTableFocus(
  projection: SqlErdAgentSchemaProjection,
  featureQuery: string,
  value: unknown
): SqlErdFocusResolution {
  if (!isRecord(value)) {
    return invalidResult();
  }
  if (value.status === "needs_clarification") {
    return {
      kind: "needs_clarification",
      reason: "ambiguous_schema_match",
      question: boundedQuestion(value.question)
    };
  }
  if (
    value.status !== "focused" ||
    !Array.isArray(value.primaryTableRefs) ||
    !["high", "medium", "low"].includes(String(value.confidence))
  ) {
    return invalidResult();
  }

  const knownRefs = new Set(projection.tables.map((table) => table.ref));
  const primaryTableRefs = value.primaryTableRefs
    .filter((ref): ref is string => typeof ref === "string")
    .slice(0, MAX_PRIMARY_TABLES);
  if (
    primaryTableRefs.length === 0 ||
    new Set(primaryTableRefs).size !== primaryTableRefs.length ||
    primaryTableRefs.some((ref) => !knownRefs.has(ref))
  ) {
    return invalidResult();
  }

  return buildFocusedResolution(
    projection,
    typeof value.featureLabel === "string" && value.featureLabel.trim()
      ? value.featureLabel
      : featureQuery,
    primaryTableRefs,
    value.confidence as "high" | "medium" | "low",
    "llm"
  );
}

function buildFocusedResolution(
  projection: SqlErdAgentSchemaProjection,
  featureLabel: string,
  primaryTableRefs: string[],
  confidence: "high" | "medium" | "low",
  source: "deterministic" | "llm"
): SqlErdFocusResolution {
  const primarySet = new Set(primaryTableRefs);
  const relatedTableRefs: string[] = [];
  for (const [fromRef, toRef] of projection.edges) {
    if (primarySet.has(fromRef) && !primarySet.has(toRef)) {
      relatedTableRefs.push(toRef);
    } else if (primarySet.has(toRef) && !primarySet.has(fromRef)) {
      relatedTableRefs.push(fromRef);
    }
  }
  return {
    kind: "focused",
    featureLabel: [...featureLabel.trim()].slice(0, 100).join(""),
    primaryTableRefs,
    relatedTableRefs: [...new Set(relatedTableRefs)].slice(0, 30),
    confidence,
    source
  };
}

function tableNameMatchesQuery(
  tableName: string,
  normalizedQuery: string,
  queryTerms: Set<string>
): boolean {
  const normalizedName = normalize(tableName);
  if (normalizedName.length < 2) return false;
  if (normalizedQuery.includes(normalizedName)) return true;
  const nameTerms = tokenize(tableName);
  return [...nameTerms].every(
    (term) => queryTerms.has(term) || queryTerms.has(singularize(term))
  );
}

function evidenceScore(
  table: SqlErdAgentSchemaProjection["tables"][number],
  queryTerms: Set<string>
): number {
  if (queryTerms.size === 0) return 0;
  let score = matchedTermCount(table.comment ?? "", queryTerms) * 3;
  score += matchedTermCount(table.schemaName ?? "", queryTerms) * 2;
  for (const column of table.columns ?? []) {
    score += matchedTermCount(column.name, queryTerms) * 2;
    score += matchedTermCount(column.comment ?? "", queryTerms) * 2;
    score += matchedTermCount(column.dataType, queryTerms);
    score += (column.enumValues ?? []).reduce(
      (total, value) => total + matchedTermCount(value, queryTerms),
      0
    );
  }
  return score;
}

function matchedTermCount(value: string, queryTerms: Set<string>): number {
  const valueTerms = tokenize(value);
  return [...queryTerms].filter(
    (term) => valueTerms.has(term) || valueTerms.has(singularize(term))
  ).length;
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .map((term) => singularize(term))
      .filter((term) => term.length >= 2)
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function singularize(value: string): string {
  return /^[a-z0-9]+s$/u.test(value) && value.length > 3
    ? value.slice(0, -1)
    : value;
}

function invalidResult(): SqlErdFocusResolution {
  return {
    kind: "needs_clarification",
    reason: "invalid_resolver_result",
    question:
      "집중해서 볼 테이블을 안전하게 확정하지 못했습니다. 테이블 이름이나 기능 범위를 더 구체적으로 알려주세요."
  };
}

function boundedQuestion(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "관련 테이블 후보가 여러 개입니다. 테이블 이름이나 기능 범위를 더 구체적으로 알려주세요.";
  }
  return [...value.trim()].slice(0, 240).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
