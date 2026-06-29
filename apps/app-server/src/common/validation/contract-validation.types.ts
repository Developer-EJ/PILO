export interface ContractSchemaRef {
  schemaName: string;
  isArray?: boolean;
}

export type ContractValidationBoundary = "request" | "query" | "response";

export interface ContractValidationIssue {
  field?: string | null;
  reason: string;
  expected?: string | null;
}

export const CONTRACT_BODY_SCHEMA_METADATA = "pilo:contract:body-schema";
export const CONTRACT_QUERY_SCHEMA_METADATA = "pilo:contract:query-schema";
export const CONTRACT_RESPONSE_SCHEMA_METADATA =
  "pilo:contract:response-schema";
