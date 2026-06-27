import { Module } from "@nestjs/common";
import { ReviewPublicController } from "./public/review-public.controller";
import { ReviewPublicService } from "./public/review-public.service";
import { InMemoryCodeReviewRoomRepository } from "./room/in-memory-code-review-room.repository";
import { ReviewRoomController } from "./room/review-room.controller";
import { ReviewRoomService } from "./room/review-room.service";

@Module({
  controllers: [ReviewPublicController, ReviewRoomController],
  providers: [
    ReviewPublicService,
    ReviewRoomService,
    InMemoryCodeReviewRoomRepository,
  ],
})
export class ReviewModule {}
