import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get(["health", "sync/health"])
  health() {
    return {
      service: "realtime-server",
      status: "ok",
      environment: process.env.APP_ENV || "local",
    };
  }
}
