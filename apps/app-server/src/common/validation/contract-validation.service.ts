import fs from "node:fs";
import path from "node:path";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import Ajv2020, {
  AnySchema,
  ErrorObject,
  ValidateFunction,
} from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { ApiErrorCode, ApiErrorResponse } from "../contracts/public-contracts";
import {
  ContractSchemaRef,
  ContractValidationBoundary,
  ContractValidationIssue,
} from "./contract-validation.types";

const PUBLIC_CONTRACT_SCHEMA_ID = "pilo-public-contracts.schema.json";

@Injectable()
export class ContractValidationService {
  private readonly ajv: Ajv2020;
  private readonly validators = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      coerceTypes: true,
    });
    addFormats(this.ajv);
    this.ajv.addSchema(this.loadSchema(), PUBLIC_CONTRACT_SCHEMA_ID);
  }

  assertValid(
    schemaRef: ContractSchemaRef,
    payload: unknown,
    boundary: ContractValidationBoundary,
  ): void {
    const validator = this.getValidator(schemaRef);
    if (validator(payload)) {
      return;
    }

    const details = this.toValidationIssues(validator.errors ?? []);
    const errorCode: ApiErrorCode =
      boundary === "response" ? "internal_error" : "validation_failed";
    const response = this.createErrorResponse(
      errorCode,
      `Contract validation failed for ${schemaRef.schemaName}.`,
      details,
    );

    if (boundary === "response") {
      throw new InternalServerErrorException(response);
    }

    throw new BadRequestException(response);
  }

  createErrorResponse(
    code: ApiErrorCode,
    message: string,
    details?: ContractValidationIssue[],
  ): ApiErrorResponse {
    return {
      error: {
        code,
        message,
        details,
      },
    };
  }

  private getValidator(schemaRef: ContractSchemaRef): ValidateFunction {
    const key = `${schemaRef.schemaName}:${schemaRef.isArray ? "array" : "single"}`;
    const cached = this.validators.get(key);
    if (cached) {
      return cached;
    }

    const schema = schemaRef.isArray
      ? {
          type: "array",
          items: {
            $ref: `${PUBLIC_CONTRACT_SCHEMA_ID}#/$defs/${schemaRef.schemaName}`,
          },
        }
      : {
          $ref: `${PUBLIC_CONTRACT_SCHEMA_ID}#/$defs/${schemaRef.schemaName}`,
        };
    const validator = this.ajv.compile(schema);
    this.validators.set(key, validator);
    return validator;
  }

  private toValidationIssues(errors: ErrorObject[]): ContractValidationIssue[] {
    return errors.map((error) => ({
      field: error.instancePath || null,
      reason: error.message ?? "Invalid value",
      expected: error.keyword,
    }));
  }

  private loadSchema(): AnySchema {
    const schemaPath = this.findSchemaPath();
    return JSON.parse(fs.readFileSync(schemaPath, "utf8")) as AnySchema;
  }

  private findSchemaPath(): string {
    const candidates = [
      process.env.PILO_CONTRACT_SCHEMA_PATH,
      path.resolve(
        process.cwd(),
        "docs/contracts/schemas/pilo-public-contracts.schema.json",
      ),
      path.resolve(
        process.cwd(),
        "../../docs/contracts/schemas/pilo-public-contracts.schema.json",
      ),
      path.resolve(
        __dirname,
        "../../../../docs/contracts/schemas/pilo-public-contracts.schema.json",
      ),
    ].filter((candidate): candidate is string => Boolean(candidate));

    const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!schemaPath) {
      throw new Error(
        `Cannot find ${PUBLIC_CONTRACT_SCHEMA_ID}. Set PILO_CONTRACT_SCHEMA_PATH.`,
      );
    }

    return schemaPath;
  }
}
