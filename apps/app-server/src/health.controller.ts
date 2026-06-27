import { Controller, Get } from "@nestjs/common";

@Controller("api")
export class HealthController {
  @Get("health")
  health() {
    return {
      service: "app-server",
      status: "ok",
      environment: process.env.APP_ENV || "local",
    };
  }
}
