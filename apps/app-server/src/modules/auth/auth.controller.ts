import { Controller, Get } from "@nestjs/common";
import { ContractResponseSchema } from "../../common/validation/contract-validation.decorators";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("me")
  @ContractResponseSchema("CurrentUser")
  getCurrentUser() {
    return this.authService.getCurrentUser();
  }
}
