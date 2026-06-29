import { Module } from "@nestjs/common";
import { CommonSystemController } from "./common-system.controller";
import { CommonSystemService } from "./common-system.service";

@Module({
  controllers: [CommonSystemController],
  providers: [CommonSystemService],
  exports: [CommonSystemService],
})
export class CommonSystemModule {}
