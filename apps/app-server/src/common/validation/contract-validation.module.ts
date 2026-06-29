import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { ContractValidationInterceptor } from "./contract-validation.interceptor";
import { ContractValidationService } from "./contract-validation.service";

@Module({
  providers: [
    ContractValidationService,
    Reflector,
    {
      provide: APP_INTERCEPTOR,
      useClass: ContractValidationInterceptor,
    },
  ],
  exports: [ContractValidationService],
})
export class ContractValidationModule {}
