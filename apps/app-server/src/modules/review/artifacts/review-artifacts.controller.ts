import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  CreateReviewChecklistItemInput,
  CreateReviewCommentInput,
  ReviewChecklistItemRecord,
  ReviewCommentRecord,
} from "./review-artifact.types";
import { ReviewArtifactsService } from "./review-artifacts.service";

@Controller()
export class ReviewArtifactsController {
  constructor(private readonly artifactsService: ReviewArtifactsService) {}

  @Post("code-review-rooms/:roomId/comments")
  createComment(
    @Param("roomId") roomId: string,
    @Body() body: CreateReviewCommentInput,
  ): ReviewCommentRecord {
    return this.artifactsService.createComment(roomId, body);
  }

  @Post("pull-request-analyses/:analysisId/checklist-items")
  createChecklistItem(
    @Param("analysisId") analysisId: string,
    @Body() body: CreateReviewChecklistItemInput,
  ): ReviewChecklistItemRecord {
    return this.artifactsService.createChecklistItem(analysisId, body);
  }
}
