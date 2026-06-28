import { Module } from "@nestjs/common";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";

@Module({
  controllers: [ReviewPublicController],
  providers: [ReviewPublicService],
})
export class ReviewModule {}
