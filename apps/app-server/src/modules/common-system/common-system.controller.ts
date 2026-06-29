import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { NotificationCreateRequest } from "../../common/contracts/public-contracts";
import { ContractBodySchema } from "../../common/validation/contract-validation.decorators";
import { CommonSystemService } from "./common-system.service";

@Controller("notifications")
export class CommonSystemController {
  constructor(private readonly commonSystemService: CommonSystemService) {}

  @Post()
  @HttpCode(202)
  @ContractBodySchema("NotificationCreateRequest")
  createNotification(@Body() request: NotificationCreateRequest) {
    return this.commonSystemService.createNotification(request);
  }
}
