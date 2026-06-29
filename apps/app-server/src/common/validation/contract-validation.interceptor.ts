import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FastifyRequest } from "fastify";
import { Observable, map } from "rxjs";
import { ContractValidationService } from "./contract-validation.service";
import {
  CONTRACT_BODY_SCHEMA_METADATA,
  CONTRACT_QUERY_SCHEMA_METADATA,
  CONTRACT_RESPONSE_SCHEMA_METADATA,
  ContractSchemaRef,
} from "./contract-validation.types";

@Injectable()
export class ContractValidationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly validator: ContractValidationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const bodySchema = this.reflector.get<ContractSchemaRef>(
      CONTRACT_BODY_SCHEMA_METADATA,
      handler,
    );
    const querySchema = this.reflector.get<ContractSchemaRef>(
      CONTRACT_QUERY_SCHEMA_METADATA,
      handler,
    );
    const responseSchema = this.reflector.get<ContractSchemaRef>(
      CONTRACT_RESPONSE_SCHEMA_METADATA,
      handler,
    );

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (bodySchema) {
      this.validator.assertValid(bodySchema, request.body, "request");
    }
    if (querySchema) {
      this.validator.assertValid(querySchema, request.query, "query");
    }

    return next.handle().pipe(
      map((responseBody: unknown) => {
        if (responseSchema) {
          this.validator.assertValid(responseSchema, responseBody, "response");
        }
        return responseBody;
      }),
    );
  }
}
