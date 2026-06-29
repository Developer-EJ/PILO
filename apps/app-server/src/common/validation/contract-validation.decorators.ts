import { SetMetadata } from "@nestjs/common";
import {
  CONTRACT_BODY_SCHEMA_METADATA,
  CONTRACT_QUERY_SCHEMA_METADATA,
  CONTRACT_RESPONSE_SCHEMA_METADATA,
  ContractSchemaRef,
} from "./contract-validation.types";

function normalizeSchemaRef(
  schema: string | ContractSchemaRef,
): ContractSchemaRef {
  return typeof schema === "string" ? { schemaName: schema } : schema;
}

export function ContractBodySchema(schema: string | ContractSchemaRef) {
  return SetMetadata(CONTRACT_BODY_SCHEMA_METADATA, normalizeSchemaRef(schema));
}

export function ContractQuerySchema(schema: string | ContractSchemaRef) {
  return SetMetadata(
    CONTRACT_QUERY_SCHEMA_METADATA,
    normalizeSchemaRef(schema),
  );
}

export function ContractResponseSchema(schema: string | ContractSchemaRef) {
  return SetMetadata(
    CONTRACT_RESPONSE_SCHEMA_METADATA,
    normalizeSchemaRef(schema),
  );
}
